/**
 * Best-effort scraper that pulls a usable business email out of a website.
 * Tries the homepage first, then standard French/English contact paths.
 *
 * "Usable" means: well-formed, on the same domain (or a known business
 * domain like @gmail.com is allowed but ranked lower), and not one of the
 * obviously-bad patterns (noreply@, mailer-daemon@, postmaster@).
 *
 * Returns null when nothing acceptable is found — the autopilot then skips
 * the prospect rather than creating one we can't actually email.
 */

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 250_000;
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CONTACT_PATHS = [
  "/",
  "/contact",
  "/contactez-nous",
  "/nous-contacter",
  "/contact-us",
  "/contacts",
  "/mentions-legales",
  "/legal-notice",
  "/equipe",
  "/team",
  "/a-propos",
  "/about",
  "/footer",
];

const BAD_LOCAL_PARTS = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "mailer-daemon",
  "postmaster",
  "abuse",
  "webmaster",
  "privacy",
  "rgpd",
  "gdpr",
  "spam",
  "support@cloudflare",
  "wordpress",
]);

const FREE_DOMAINS = new Set([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.fr",
  "yahoo.com",
  "free.fr",
  "orange.fr",
  "wanadoo.fr",
  "laposte.net",
  "sfr.fr",
  "live.com",
  "icloud.com",
]);

interface EmailCandidate {
  email: string;
  source: string;
  score: number;
}

async function fetchPage(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": CHROME_UA,
        Accept: "text/html",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) return null;
    const reader = res.body?.getReader();
    if (!reader) return (await res.text()).slice(0, MAX_BYTES);
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
    }
    try {
      await reader.cancel();
    } catch {
      // drained
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

function extractEmails(html: string): string[] {
  const out = new Set<string>();
  // Standard email regex — kept conservative on TLD (2-24 chars, all alpha).
  const re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g;
  const matches = html.match(re);
  if (matches) {
    for (const m of matches) {
      out.add(m.toLowerCase());
    }
  }
  // mailto: links can include URL-encoded characters
  const mailtoRe = /mailto:([A-Za-z0-9._%+\-@]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = mailtoRe.exec(html))) {
    out.add(decodeURIComponent(m[1]).toLowerCase());
  }
  // Common obfuscations: "contact [at] domaine.fr" or "contact (at) domaine . fr"
  const obfRe = /([A-Za-z0-9._%+-]+)\s*[\[(]?at[\])]?\s*([A-Za-z0-9.-]+)\s*[\[(]?\.?[\])]?\s*([A-Za-z]{2,24})/gi;
  while ((m = obfRe.exec(html))) {
    out.add(`${m[1]}@${m[2]}.${m[3]}`.toLowerCase().replace(/\s+/g, ""));
  }
  return Array.from(out);
}

function rankEmail(email: string, prospectDomain: string | null): number {
  const [local, domain] = email.split("@");
  if (!local || !domain) return -1;
  if (BAD_LOCAL_PARTS.has(local.toLowerCase())) return -1;
  if (local.includes("sentry") || local.includes("@example") || domain.includes("example.com")) return -1;
  let score = 0;
  // Prefer named accounts over generic ones
  if (/^[a-z]+\.[a-z]+/.test(local)) score += 50; // firstname.lastname@
  if (/^[a-z]+[a-z.]+/.test(local) && local.length > 4 && !/^(info|contact)$/i.test(local)) score += 20;
  if (/^(direction|directeur|gerant|gérant|ceo|fondateur|founder)/i.test(local)) score += 60;
  if (/^contact/i.test(local)) score += 25;
  if (/^info/i.test(local)) score += 15;
  if (/^reservation/i.test(local)) score += 10;
  // Domain match is a huge positive signal
  if (prospectDomain && domain.endsWith(prospectDomain)) score += 100;
  // Free-mail domains are usable but lower priority
  if (FREE_DOMAINS.has(domain)) score += 5;
  // Generic length bonus
  score += Math.min(local.length, 15);
  return score;
}

/**
 * Returns the best email found for the given website, or null. Also reports
 * which pages were searched (useful for UI/debugging).
 */
export async function findEmailForSite(
  websiteUrl: string
): Promise<{ email: string | null; tried: string[]; candidates: EmailCandidate[] }> {
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`);
  } catch {
    return { email: null, tried: [], candidates: [] };
  }

  const prospectDomain = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const tried: string[] = [];
  const candidates: EmailCandidate[] = [];

  await Promise.all(
    CONTACT_PATHS.map(async (path) => {
      const url = `${parsed.protocol}//${parsed.host}${path}`;
      tried.push(url);
      const html = await fetchPage(url);
      if (!html) return;
      for (const email of extractEmails(html)) {
        const score = rankEmail(email, prospectDomain);
        if (score >= 0) candidates.push({ email, source: url, score });
      }
    })
  );

  if (candidates.length === 0) {
    return { email: null, tried, candidates: [] };
  }

  // Dedupe — keep highest score per email
  const byEmail = new Map<string, EmailCandidate>();
  for (const c of candidates) {
    const existing = byEmail.get(c.email);
    if (!existing || c.score > existing.score) byEmail.set(c.email, c);
  }
  const sorted = Array.from(byEmail.values()).sort((a, b) => b.score - a.score);
  return { email: sorted[0].email, tried, candidates: sorted.slice(0, 5) };
}
