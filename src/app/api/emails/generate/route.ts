import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `Tu es un expert en développement web haut de gamme. Tu travailles pour Unlockd.art, un studio parisien qui crée des sites web premium pour l'hôtellerie, l'architecture et l'immobilier. Tu dois écrire des cold emails très personnalisés, courts, professionnels et élégants. Jamais agressifs. Toujours en français impeccable.

IMPORTANT: Respond ONLY with a valid JSON array. No explanation, no markdown, no code blocks. Just the raw JSON array starting with [ and ending with ].`;

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

  return `Génère 4 cold emails pour ce prospect.

Prospect:
- Nom: ${prospect.firmaNaziv}
- Contact: ${contact || "Non renseigné"}
- Secteur: ${nicheLabel}
- Ville: ${prospect.grad}
- Site web: ${prospect.website || "Pas de site"}
- Instagram: ${prospect.instagram || "Non renseigné"}
- Description: ${prospect.opisFirme || "Non renseigné"}
- Qualité du site (1=mauvais, 5=excellent): ${prospect.kvalitetSajta ?? "Non évalué"}
- Notes: ${prospect.napomena || "Aucune"}

Types à générer:
1. "initial" — Introduction courte, observation concrète sur leur site, proposition de valeur Unlockd.art
2. "follow1" — Ce qu'ils perdent sans site premium (réservations, clients haut de gamme, image)
3. "follow2" — Preuve sociale dans le secteur ${nicheLabel}, résultat concret d'Unlockd.art
4. "follow3" — Email final très court, simple oui/non

Règles:
- Français impeccable, ton premium
- Corps HTML: balises p, br, strong uniquement
- Maximum 120 mots par email
- Ne jamais mentionner de prix
- Ne pas ajouter de signature, de nom ni de nom de société à la fin. L'email se termine par la dernière phrase du message. Aucun saut de ligne final.

Return ONLY the JSON array, nothing else:
[{"tip":"initial","subject":"...","body":"<p>...</p>"},{"tip":"follow1","subject":"...","body":"<p>...</p>"},{"tip":"follow2","subject":"...","body":"<p>...</p>"},{"tip":"follow3","subject":"...","body":"<p>...</p>"}]`;
}

function extractJsonArray(text: string): string {
  // Remove any markdown fences
  const s = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();

  // Find the outermost [ ... ] array
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    return s.slice(start, end + 1).trim();
  }
  return s;
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Check API key (module-level init would crash if key is missing) ──
    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log("[generate] ANTHROPIC_API_KEY present:", !!apiKey, "| length:", apiKey?.length ?? 0);

    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY nije konfigurisan na serveru. Dodaj ga u Vercel Environment Variables." },
        { status: 500 }
      );
    }

    // ── 2. Init client inside handler ──
    const anthropic = new Anthropic({ apiKey });

    // ── 3. Parse request body ──
    let body: { prospectId?: string; regenerate?: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Neispravan JSON request" }, { status: 400 });
    }

    const { prospectId, regenerate = false } = body;
    if (!prospectId) {
      return NextResponse.json({ error: "prospectId je obavezan" }, { status: 400 });
    }

    // ── 4. Load prospect ──
    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      include: { emails: true },
    });

    if (!prospect) {
      return NextResponse.json({ error: "Prospect nije pronađen" }, { status: 404 });
    }

    if (prospect.emails.length > 0 && !regenerate) {
      return NextResponse.json({ emails: prospect.emails });
    }

    if (regenerate && prospect.emails.length > 0) {
      await prisma.email.deleteMany({ where: { prospectId } });
    }

    // ── 5. Call Claude ──
    console.log("[generate] Calling model:", MODEL, "| prospect:", prospect.firmaNaziv);

    let message: Anthropic.Message;
    try {
      message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildPrompt(prospect) }],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[generate] Anthropic API error:", msg);
      return NextResponse.json(
        { error: `Greška Claude API: ${msg}` },
        { status: 502 }
      );
    }

    // ── 6. Extract text from response ──
    const content = message.content[0];
    if (!content || content.type !== "text") {
      console.error("[generate] Unexpected content type:", message.content);
      return NextResponse.json(
        { error: "Claude nije vratio tekstualni odgovor" },
        { status: 502 }
      );
    }

    const rawText = content.text;
    console.log("[generate] Raw response length:", rawText.length);
    console.log("[generate] Raw response (first 300):", rawText.slice(0, 300));

    // ── 7. Parse JSON ──
    let emailData: Array<{ tip: string; subject: string; body: string }>;
    try {
      const cleaned = extractJsonArray(rawText);
      console.log("[generate] Cleaned JSON (first 200):", cleaned.slice(0, 200));
      emailData = JSON.parse(cleaned);

      if (!Array.isArray(emailData) || emailData.length === 0) {
        throw new Error("Parsed result is not a non-empty array");
      }
      // Normalise shape
      emailData = emailData.map((e) => ({
        tip: String(e.tip ?? "initial"),
        subject: String(e.subject ?? ""),
        body: String(e.body ?? ""),
      }));
      console.log("[generate] Parsed", emailData.length, "emails OK");
    } catch (parseErr) {
      console.error("[generate] JSON parse failed:", parseErr);
      console.error("[generate] Full raw text:", rawText);
      return NextResponse.json(
        { error: "Claude vratio odgovor koji nije validan JSON. Pokušaj ponovo." },
        { status: 502 }
      );
    }

    // ── 8. Save to DB ──
    const emails = await Promise.all(
      emailData.map((e) =>
        prisma.email.create({
          data: { prospectId, tip: e.tip, subject: e.subject, body: e.body },
        })
      )
    );

    console.log("[generate] Saved", emails.length, "emails to DB");
    return NextResponse.json({ emails });
  } catch (err) {
    console.error("[generate] Unhandled error:", err);
    return NextResponse.json(
      { error: "Serverska greška pri generisanju emailova" },
      { status: 500 }
    );
  }
}
