/**
 * Pulls the "about us" / "team" / "contact" pages of a prospect's site and
 * runs Claude over the combined text to extract candidate decision-makers
 * (name + role + email/phone if visible). Used to replace the generic
 * "Bonjour," opening with a real first-name greeting — by far the strongest
 * single lift in cold-email reply rate.
 */

import Anthropic from "@anthropic-ai/sdk";

const FETCH_TIMEOUT_MS = 5000;
const MAX_PAGE_BYTES = 250_000;
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Common URL paths where French/English SMBs put their team / about / contact pages.
const CANDIDATE_PATHS = [
  "/equipe",
  "/notre-equipe",
  "/equipe/",
  "/a-propos",
  "/about",
  "/about-us",
  "/qui-sommes-nous",
  "/team",
  "/contact",
  "/contactez-nous",
  "/nous-contacter",
  "/agence",
  "/mentions-legales", // often contains the legal representative's name
];

const EXTRACTION_MODEL = "claude-haiku-4-5-20251001";

export interface DecisionMaker {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  confidence: "high" | "medium" | "low";
  source: string;
}

export interface DecisionMakerResult {
  attemptedUrls: string[];
  successful: string[];
  people: DecisionMaker[];
  fetchedAt: string;
  error?: string;
}

async function fetchPage(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": CHROME_UA,
        Accept: "text/html",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) return null;
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return text.slice(0, MAX_PAGE_BYTES);
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (received < MAX_PAGE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
    }
    try {
      await reader.cancel();
    } catch {
      // already drained
    }
    const buf = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) {
      buf.set(c.subarray(0, Math.min(c.length, received - off)), off);
      off += c.length;
      if (off >= received) break;
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function htmlToReadableText(html: string): string {
  return html
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<\/?(p|div|section|article|h\d|li|td|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function dedupeText(s: string, maxLen: number): string {
  return s.slice(0, maxLen);
}

async function extractWithClaude(combinedText: string): Promise<DecisionMaker[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];
  const anthropic = new Anthropic({ apiKey });

  const prompt = `Tu analyses les textes suivants extraits du site d'une entreprise. Identifie les personnes qui prennent les décisions (fondateur, CEO, directeur, gérant, propriétaire, responsable marketing/digital).

IMPORTANT:
- N'invente jamais de noms. Si tu n'es pas certain qu'un nom est explicitement présent dans le texte, ne le retourne pas.
- Ignore les noms d'employés sans titre clair de direction.
- Ignore les noms d'auteurs de témoignages clients.
- Ignore les noms qui figurent uniquement comme "contact@xxx" sans personne associée.
- "confidence": "high" si le titre est explicite (CEO/Directeur/Fondateur/Gérant), "medium" si le rôle est inféré, "low" sinon.

Réponds UNIQUEMENT avec un JSON array (jamais de markdown, jamais de texte autour):
[{"name":"Prénom Nom","title":"Directeur","email":"...","phone":"...","confidence":"high"}]

Si aucune personne pertinente n'est identifiée, réponds avec [].

Textes extraits :
${dedupeText(combinedText, 18_000)}`;

  try {
    const message = await anthropic.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content[0];
    if (!block || block.type !== "text") return [];
    const raw = block.text.trim();
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1) return [];
    const json = raw.slice(start, end + 1);
    const parsed = JSON.parse(json) as Array<{
      name?: unknown;
      title?: unknown;
      email?: unknown;
      phone?: unknown;
      confidence?: unknown;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p) => ({
        name: typeof p.name === "string" ? p.name.trim() : "",
        title: typeof p.title === "string" && p.title.trim() ? p.title.trim() : null,
        email: typeof p.email === "string" && p.email.includes("@") ? p.email.trim() : null,
        phone: typeof p.phone === "string" && p.phone.trim() ? p.phone.trim() : null,
        confidence: (p.confidence === "high" || p.confidence === "medium" || p.confidence === "low"
          ? p.confidence
          : "low") as DecisionMaker["confidence"],
        source: "",
      }))
      .filter((p) => p.name.length > 1 && p.name.length < 80);
  } catch (e) {
    console.warn("[decisionMakers] Claude extract failed:", e);
    return [];
  }
}

/**
 * Scrapes candidate pages for decision-makers, runs Claude over the combined
 * text, returns up to 5 candidates. Skipped silently when no candidate page
 * could be fetched — caller should treat null/empty result as "no data".
 */
export async function findDecisionMakers(siteUrl: string): Promise<DecisionMakerResult> {
  const fetchedAt = new Date().toISOString();
  let base: URL;
  try {
    base = new URL(siteUrl);
  } catch {
    return { attemptedUrls: [], successful: [], people: [], fetchedAt, error: "URL invalide" };
  }

  const attempted: string[] = [];
  const successful: string[] = [];
  const buckets: { source: string; text: string }[] = [];

  // Fetch in parallel for speed — these are all idempotent GETs.
  await Promise.all(
    CANDIDATE_PATHS.map(async (path) => {
      const url = `${base.protocol}//${base.host}${path}`;
      attempted.push(url);
      const html = await fetchPage(url);
      if (!html) return;
      const text = htmlToReadableText(html);
      if (text.length < 80) return;
      successful.push(url);
      buckets.push({ source: url, text: `--- Page : ${url} ---\n${text}` });
    })
  );

  if (buckets.length === 0) {
    return { attemptedUrls: attempted, successful, people: [], fetchedAt };
  }

  const combined = buckets.map((b) => b.text).join("\n\n");
  const people = await extractWithClaude(combined);
  return {
    attemptedUrls: attempted,
    successful,
    people: people.slice(0, 5),
    fetchedAt,
  };
}

/**
 * Render the decision-maker list as a prompt-ready French block.
 */
export function decisionMakersToPromptFacts(
  dm: DecisionMakerResult | null | undefined,
  csvContactName: string | null,
  csvContactPosition: string | null
): string | null {
  if (!dm || dm.people.length === 0) {
    return null;
  }
  // If the CSV already had a real contact name, mention it as preferred greeting target.
  const lines: string[] = [];
  for (const p of dm.people.slice(0, 4)) {
    const bits = [p.name];
    if (p.title) bits.push(p.title);
    if (p.email) bits.push(p.email);
    lines.push(`- ${bits.join(" — ")} (${p.confidence} confiance)`);
  }
  const preface = csvContactName
    ? `Contact CSV : ${csvContactName}${csvContactPosition ? ` (${csvContactPosition})` : ""}. Personnes identifiées en plus :`
    : "Décideurs probables identifiés depuis leur site (utilise le prénom du plus pertinent dans la salutation, sinon \"Bonjour,\") :";
  return `${preface}\n${lines.join("\n")}`;
}

/**
 * Picks the best name to greet (first name) when no CSV contact is available.
 * Returns null when nothing convincing is found — caller falls back to "Bonjour,".
 */
export function pickGreetingName(
  dm: DecisionMakerResult | null | undefined,
  csvContactName: string | null
): string | null {
  if (csvContactName?.trim()) {
    // CSV always wins — operator already vetted it.
    return csvContactName.trim().split(/\s+/)[0];
  }
  if (!dm || dm.people.length === 0) return null;
  // Prefer high-confidence directors.
  const ordered = [...dm.people].sort((a, b) => {
    const rank = (c: DecisionMaker["confidence"]) => (c === "high" ? 0 : c === "medium" ? 1 : 2);
    return rank(a.confidence) - rank(b.confidence);
  });
  const top = ordered[0];
  if (!top || top.confidence === "low") return null;
  return top.name.split(/\s+/)[0];
}
