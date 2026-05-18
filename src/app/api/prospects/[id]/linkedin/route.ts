import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { buildVoiceGuideForPrompt } from "@/lib/voiceProfile";
import type { SiteSnapshot } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";
import type { DecisionMakerResult } from "@/lib/decisionMakers";

export const maxDuration = 30;

/**
 * Generates a 2-3 sentence LinkedIn DM tailored to one prospect. The operator
 * copy-pastes it into LinkedIn manually (ToS-safe — no automation against
 * LinkedIn) for a parallel-channel touch alongside the email sequence.
 *
 * Multi-channel touches (email + LinkedIn) demonstrably 2x reply rate in
 * B2B premium outreach.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY nije postavljen" }, { status: 500 });

    const prospect = await prisma.prospect.findUnique({ where: { id } });
    if (!prospect) return NextResponse.json({ error: "Prospect nije pronađen" }, { status: 404 });

    const site = (prospect.siteSnapshot as unknown as SiteSnapshot | null) ?? null;
    const psi = (prospect.pagespeed as unknown as PageSpeedSnapshot | null) ?? null;
    const dm = (prospect.decisionMakers as unknown as DecisionMakerResult | null) ?? null;

    const facts: string[] = [];
    if (site?.ok) {
      if (site.h1) facts.push(`H1 du site : "${site.h1}"`);
      if (site.signals.techHints.length) facts.push(`Plateforme : ${site.signals.techHints.join(", ")}`);
      if (!site.signals.responsiveViewport) facts.push("Pas de viewport mobile");
    }
    if (psi?.ok && psi.performanceScore !== null) {
      facts.push(`Lighthouse mobile : ${psi.performanceScore}/100`);
    }
    const firstName = (dm?.people?.[0]?.name?.split(/\s+/)[0] ?? prospect.kontaktIme?.split(/\s+/)[0]) ?? null;

    const voiceGuide = await buildVoiceGuideForPrompt();

    const prompt = `Tu rédiges un message LinkedIn (DM) à envoyer à un prospect B2B. Tu écris dans la VOIX de Temim Turkusic (cf. style ci-dessous).

Contraintes LinkedIn :
- 2 à 3 phrases MAXIMUM. Pas plus.
- Ton conversationnel, pas commercial. LinkedIn n'est pas l'email.
- Pas de "Bonjour Madame/Monsieur" — sur LinkedIn on tutoie ou on utilise le prénom.
- Pas de pitch direct dans la première phrase. Première phrase = observation, contexte, ou question. Pitch (si présent) en deuxième.
- Pas d'emojis sauf si la voix de Temim en contient (cf. style).
- Pas de "j'espère que vous allez bien" ni "permettez-moi".
- Pas de signature.

Prospect :
- Entreprise : ${prospect.firmaNaziv}
- Secteur : ${prospect.nisa}
- Ville : ${prospect.grad}
- Prénom du décideur (si connu) : ${firstName ?? "(inconnu)"}

Faits vérifiés sur leur site :
${facts.map((f) => `- ${f}`).join("\n") || "(aucun)"}

Style et voix de Temim :
${voiceGuide}

Réponds UNIQUEMENT JSON :
{"message":"...","note":"courte note opérationnelle en bosniaque (max 60 chars) sur l'angle choisi"}`;

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content[0];
    if (!block || block.type !== "text") {
      return NextResponse.json({ error: "Claude nije vratio text" }, { status: 502 });
    }
    const raw = block.text.trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return NextResponse.json({ error: "JSON parse fail" }, { status: 502 });
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { message?: string; note?: string };
    if (typeof parsed.message !== "string") return NextResponse.json({ error: "No message" }, { status: 502 });

    return NextResponse.json({ ok: true, message: parsed.message, note: parsed.note ?? "" });
  } catch (err) {
    console.error("[linkedin]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Operator confirms they sent the DM — we record the touch for tracking.
  const { id } = await params;
  await prisma.prospect.update({
    where: { id },
    data: { linkedinTouchedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
