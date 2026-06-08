/**
 * Generates a 3-finding mini-audit for a prospect's website. Each finding is
 * structured as:
 *   OBSERVATION   — what we saw, with a specific quote / number / fact
 *   BUSINESS IMPACT — why it costs them money, in their language
 *   FIX           — what Unlockd would do, concretely
 *
 * Drives the Follow2 email and the optional "send full audit" reply to
 * interested prospects. The findings are cached on the Prospect row
 * (auditFindings JSON) so we don't regenerate on every email send.
 *
 * Findings are grounded in real signals (site snapshot, pagespeed, tech
 * stack) — Claude is forbidden from inventing observations. If we have no
 * signals, the function returns null and Follow2 falls back to the generic
 * social-proof template.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SiteSnapshot } from "@/lib/scrapeSite";
import { snapshotToPromptFacts } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";
import { pagespeedToPromptFacts } from "@/lib/pagespeed";

const MODEL = "claude-sonnet-4-6";

export interface AuditFinding {
  observation: string;
  impact: string;
  fix: string;
}

export interface AuditResult {
  findings: AuditFinding[];
  summary: string;
  generatedAt: string;
}

export interface AuditInput {
  firmaNaziv: string;
  nisa: string;
  grad: string;
  website: string | null;
  site: SiteSnapshot | null;
  psi: PageSpeedSnapshot | null;
}

function buildPrompt(input: AuditInput): string {
  const facts: string[] = [];
  const siteFacts = snapshotToPromptFacts(input.site);
  if (siteFacts) facts.push(siteFacts);
  const psiFacts = pagespeedToPromptFacts(input.psi);
  if (psiFacts) facts.push(psiFacts);

  return `Tu es Temim Turkusic, fondateur d'Unlockd.art (studio web premium parisien). Produis un mini-audit du site de ${input.firmaNaziv} (${input.nisa} à ${input.grad}, site: ${input.website ?? "n/c"}).

L'audit doit contenir EXACTEMENT 3 findings, chacun structuré:
- "observation" — ce que tu as constaté, avec un fait, un chiffre ou une citation VÉRIFIÉE tirée des données ci-dessous (jamais inventé)
- "impact" — pourquoi ça leur coûte de l'argent ou des clients, dans leur langage (pas de jargon technique)
- "fix" — la solution concrète qu'Unlockd recommanderait (1 phrase courte)

Données vérifiées:
${facts.length > 0 ? facts.join("\n\n") : "Aucune donnée technique disponible — base tes findings sur des observations sectorielles classiques pour " + input.nisa + " en France."}

Catégories à couvrir (choisis-en 3 où tu as les meilleurs signaux):
- Performance mobile (LCP, score Lighthouse) — pertinent si on a un score < 70
- Trust signals manquants (témoignages, case studies, transparence prix)
- Conversion path (CTA générique vs. spécifique, fold above visible)
- Mobile UX (viewport responsive, ratio images/contenu)
- SEO basics (title length, H1 unique, meta description)
- Plateforme limitante (Wix/Squarespace pour une marque premium = plafond de croissance)
- Réservation / booking en ligne (présent ou non, friction)

Règles strictes:
- Français premium, jamais commercial
- "observation" doit citer un fait concret (max 25 mots)
- "impact" doit être chiffré ou très spécifique (max 25 mots)
- "fix" doit être actionnable, pas générique (max 20 mots)
- "summary" = une phrase d'intro pour le mail (max 30 mots)

Réponds STRICTEMENT en JSON, sans markdown:
{"summary":"...","findings":[{"observation":"...","impact":"...","fix":"..."},{"observation":"...","impact":"...","fix":"..."},{"observation":"...","impact":"...","fix":"..."}]}`;
}

export async function generateAuditFindings(input: AuditInput): Promise<AuditResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const anthropic = new Anthropic({ apiKey });
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [{ role: "user", content: buildPrompt(input) }],
    });
    const block = message.content[0];
    if (!block || block.type !== "text") return null;
    const raw = block.text.trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      summary?: unknown;
      findings?: Array<{ observation?: unknown; impact?: unknown; fix?: unknown }>;
    };
    if (!Array.isArray(parsed.findings) || parsed.findings.length === 0) return null;
    const findings: AuditFinding[] = parsed.findings
      .filter((f) => typeof f.observation === "string" && typeof f.impact === "string" && typeof f.fix === "string")
      .slice(0, 3)
      .map((f) => ({
        observation: String(f.observation).trim(),
        impact: String(f.impact).trim(),
        fix: String(f.fix).trim(),
      }));
    if (findings.length === 0) return null;
    return {
      findings,
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.warn("[auditFindings] failed:", e);
    return null;
  }
}

/**
 * Renders the audit as the body of a follow-up email. Used by Follow2 when
 * findings are available — the email becomes the actual audit, not just a
 * pitch for one.
 */
export function auditFindingsToHtml(audit: AuditResult): string {
  const bulletItems = audit.findings
    .map(
      (f, i) => `<p style="margin:14px 0 4px;"><strong>${i + 1}. ${escapeHtml(f.observation)}</strong></p>
<p style="margin:0 0 4px;color:#444;">→ ${escapeHtml(f.impact)}</p>
<p style="margin:0;color:#666;font-style:italic;">Fix : ${escapeHtml(f.fix)}</p>`
    )
    .join("");
  return `<p>${escapeHtml(audit.summary || "Voici les 3 points qui me semblent les plus actionnables sur votre site :")}</p>
${bulletItems}
<p style="margin-top:18px;">Si vous voulez, je vous envoie l'audit complet en PDF — sans appel, vous décidez après.</p>`;
}

export function auditFindingsToText(audit: AuditResult): string {
  const items = audit.findings
    .map(
      (f, i) =>
        `${i + 1}. ${f.observation}\n   → ${f.impact}\n   Fix : ${f.fix}`
    )
    .join("\n\n");
  return `${audit.summary || "Voici les 3 points qui me semblent les plus actionnables sur votre site :"}\n\n${items}\n\nSi vous voulez, je vous envoie l'audit complet en PDF — sans appel, vous décidez après.`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
