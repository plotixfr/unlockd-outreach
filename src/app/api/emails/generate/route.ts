import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// claude-sonnet-4-20250514 is not a valid model ID for the Claude 4 series.
// Correct format for Claude 4.x is without the date suffix.
const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `Tu es un expert en développement web haut de gamme. Tu travailles pour Unlockd.art, un studio parisien qui crée des sites web premium pour l'hôtellerie, l'architecture et l'immobilier. Tu dois écrire des cold emails très personnalisés, courts, professionnels et élégants. Jamais agressifs. Toujours en français impeccable.`;

const NICHE_FR: Record<string, string> = {
  Hotel: "hôtellerie",
  Restaurant: "restauration",
  Architecture: "architecture",
  Property: "immobilier",
};

function buildPrompt(prospect: {
  firmaNaziv: string;
  kontaktIme: string | null;
  kontaktPozicija: string | null;
  nisa: string;
  grad: string;
  website: string | null;
  instagram: string | null;
  opisFirme: string | null;
  kvalitetSajta: number | null;
  napomena: string | null;
}) {
  const nicheLabel = NICHE_FR[prospect.nisa] ?? prospect.nisa;
  const contact = [prospect.kontaktIme, prospect.kontaktPozicija]
    .filter(Boolean)
    .join(", ");

  return `Génère 4 cold emails pour ce prospect. Retourne UNIQUEMENT un tableau JSON valide, sans texte avant ou après, sans markdown.

Prospect:
- Nom: ${prospect.firmaNaziv}
- Contact: ${contact || "Non renseigné"}
- Secteur: ${nicheLabel}
- Ville: ${prospect.grad}
- Site web: ${prospect.website || "Pas de site"}
- Instagram: ${prospect.instagram || "Non renseigné"}
- Description: ${prospect.opisFirme || "Non renseigné"}
- Qualité du site (1=très mauvais, 5=excellent): ${prospect.kvalitetSajta ?? "Non évalué"}
- Notes: ${prospect.napomena || "Aucune"}

Types:
1. "initial" — Introduction courte, observation concrète sur leur site/absence de site, valeur d'Unlockd.art
2. "follow1" — Ce qu'ils perdent sans un site premium (réservations, clients haut de gamme, image)
3. "follow2" — Preuve sociale dans leur secteur (${nicheLabel}), résultat concret d'Unlockd.art
4. "follow3" — Email final très court, simple oui/non

Format attendu (JSON pur, pas de markdown):
[{"tip":"initial","subject":"...","body":"<p>...</p>"},{"tip":"follow1","subject":"...","body":"<p>...</p>"},{"tip":"follow2","subject":"...","body":"<p>...</p>"},{"tip":"follow3","subject":"...","body":"<p>...</p>"}]

Règles:
- Français impeccable, ton premium
- HTML simple: p, br, strong uniquement
- Max 120 mots par email
- Signature: <p><strong>Temim</strong><br>Unlockd.art — Sites web premium</p>
- Ne jamais mentionner de prix`;
}

function extractJsonArray(text: string): string {
  // Strip markdown code fences
  let s = text.trim().replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "");
  // Find the first [ ... ] block
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }
  return s.trim();
}

export async function POST(req: NextRequest) {
  try {
    let body: { prospectId?: string; regenerate?: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Neispravan JSON request" },
        { status: 400 }
      );
    }

    const { prospectId, regenerate = false } = body;
    if (!prospectId) {
      return NextResponse.json(
        { error: "prospectId je obavezan" },
        { status: 400 }
      );
    }

    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      include: { emails: true },
    });

    if (!prospect) {
      return NextResponse.json(
        { error: "Prospect nije pronađen" },
        { status: 404 }
      );
    }

    // Return existing emails if not regenerating
    if (prospect.emails.length > 0 && !regenerate) {
      return NextResponse.json({ emails: prospect.emails });
    }

    // Delete existing before regenerate
    if (regenerate && prospect.emails.length > 0) {
      await prisma.email.deleteMany({ where: { prospectId } });
    }

    // Call Claude
    let message: Anthropic.Message;
    try {
      message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildPrompt(prospect) }],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Anthropic API greška";
      console.error("[generate] Anthropic error:", err);
      return NextResponse.json(
        { error: `Greška pri pozivu Claude API: ${msg}` },
        { status: 502 }
      );
    }

    const content = message.content[0];
    if (!content || content.type !== "text") {
      return NextResponse.json(
        { error: "Claude nije vratio tekstualni odgovor" },
        { status: 502 }
      );
    }

    // Parse JSON from Claude response
    let emailData: Array<{ tip: string; subject: string; body: string }>;
    try {
      const raw = extractJsonArray(content.text);
      emailData = JSON.parse(raw);
      if (!Array.isArray(emailData) || emailData.length === 0) {
        throw new Error("Response nije niz");
      }
      // Validate shape of each email
      emailData = emailData.map((e) => ({
        tip: String(e.tip ?? "initial"),
        subject: String(e.subject ?? ""),
        body: String(e.body ?? ""),
      }));
    } catch {
      console.error("[generate] JSON parse error. Raw:", content.text.slice(0, 500));
      return NextResponse.json(
        {
          error: "Claude je vratio odgovor koji nije validan JSON. Pokušajte ponovo.",
          debug:
            process.env.NODE_ENV === "development"
              ? content.text.slice(0, 300)
              : undefined,
        },
        { status: 502 }
      );
    }

    // Save emails to DB
    const emails = await Promise.all(
      emailData.map((e) =>
        prisma.email.create({
          data: { prospectId, tip: e.tip, subject: e.subject, body: e.body },
        })
      )
    );

    return NextResponse.json({ emails });
  } catch (err) {
    console.error("[generate] Unhandled error:", err);
    return NextResponse.json(
      { error: "Serverska greška pri generisanju emailova" },
      { status: 500 }
    );
  }
}
