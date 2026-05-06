import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

  return `Génère 4 cold emails pour ce prospect. Retourne UNIQUEMENT un tableau JSON valide, sans markdown, sans explication.

Prospect:
- Nom de l'entreprise: ${prospect.firmaNaziv}
- Contact: ${contact || "Non renseigné"}
- Secteur: ${nicheLabel}
- Ville: ${prospect.grad}
- Site web: ${prospect.website || "Non renseigné"}
- Instagram: ${prospect.instagram || "Non renseigné"}
- Description: ${prospect.opisFirme || "Non renseigné"}
- Qualité du site actuel (1=très mauvais, 5=excellent): ${prospect.kvalitetSajta ?? "Non évalué"}
- Notes: ${prospect.napomena || "Aucune"}

Types d'emails à générer:
1. "initial" — Courte introduction, observation concrète sur leur site actuel (ou absence de site), proposition de valeur claire d'Unlockd.art
2. "follow1" — Angle différent: ce qu'ils perdent concrètement sans un site web premium (réservations, clients premium, image de marque)
3. "follow2" — Preuve sociale: exemple de réalisation d'Unlockd.art dans leur secteur (${nicheLabel}), résultat concret
4. "follow3" — Email final très court et direct, simple oui/non, pas de pression

Format JSON attendu (respecte exactement cette structure):
[
  {"tip": "initial", "subject": "...", "body": "<p>...</p>"},
  {"tip": "follow1", "subject": "...", "body": "<p>...</p>"},
  {"tip": "follow2", "subject": "...", "body": "<p>...</p>"},
  {"tip": "follow3", "subject": "...", "body": "<p>...</p>"}
]

Règles strictes:
- Français impeccable, ton premium et professionnel
- Corps en HTML simple (balises p, br, strong uniquement)
- Maximum 120 mots par email
- Personnalise avec le nom de l'entreprise et le secteur
- Signature: <p><strong>Temim</strong><br>Unlockd.art — Sites web premium</p>
- Ne jamais mentionner de prix ni de tarifs`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prospectId, regenerate = false } = body;

  if (!prospectId) {
    return NextResponse.json({ error: "prospectId manquant" }, { status: 400 });
  }

  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    include: { emails: true },
  });

  if (!prospect) {
    return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
  }

  if (prospect.emails.length > 0 && !regenerate) {
    return NextResponse.json({ emails: prospect.emails });
  }

  if (regenerate && prospect.emails.length > 0) {
    await prisma.email.deleteMany({ where: { prospectId } });
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildPrompt(prospect) }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    return NextResponse.json(
      { error: "Réponse invalide de Claude" },
      { status: 500 }
    );
  }

  let emailData: Array<{ tip: string; subject: string; body: string }>;
  try {
    const raw = content.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    emailData = JSON.parse(raw);
    if (!Array.isArray(emailData) || emailData.length !== 4) {
      throw new Error("Format inattendu");
    }
  } catch {
    return NextResponse.json(
      { error: "Impossible de parser la réponse Claude" },
      { status: 500 }
    );
  }

  const emails = await Promise.all(
    emailData.map((e) =>
      prisma.email.create({
        data: { prospectId, tip: e.tip, subject: e.subject, body: e.body },
      })
    )
  );

  return NextResponse.json({ emails });
}
