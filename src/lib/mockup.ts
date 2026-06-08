/**
 * AI-generated premium website mockup for a prospect. Used as the sales-call
 * opener: "Here's how your site can look in 6 weeks." Removes the prospect's
 * inability-to-visualise objection that kills deals.
 *
 * Pipeline:
 *   1. Build a niche/city-aware prompt that asks Flux Schnell for an
 *      editorial premium hero composition.
 *   2. Call Replicate with that prompt.
 *   3. Download the generated PNG (Replicate URLs expire after a few days).
 *   4. Persist to Vercel Blob so the URL is permanent.
 *   5. Return the permanent URL + the exact prompt used (so we can regenerate
 *      with a tweak later).
 *
 * Required env:
 *   REPLICATE_API_TOKEN    — https://replicate.com/account/api-tokens
 *   BLOB_READ_WRITE_TOKEN  — auto-provisioned by Vercel when you add Blob
 */

import { put } from "@vercel/blob";

// black-forest-labs/flux-schnell — fast (~3s), ~$0.003 per image.
const REPLICATE_MODEL = "black-forest-labs/flux-schnell";
const REPLICATE_VERSION = "f2ab8a5bfe79f02f0789a146cf5e73d2a4ff2684a98c2b303d1e1ff3814271db";

export interface MockupResult {
  ok: boolean;
  url?: string;
  prompt?: string;
  error?: string;
}

interface ProspectForMockup {
  firmaNaziv: string;
  nisa: string;
  grad: string;
}

/**
 * Builds a prompt tuned to the prospect's niche. The result is a premium hero
 * shot mood-board, not a literal screenshot — that's the point. We pair it on
 * the UI with the current site's real screenshot so the "before/after" is
 * grounded.
 */
function buildMockupPrompt(p: ProspectForMockup): string {
  const niche = p.nisa.toLowerCase();
  let context = "modern editorial premium website hero section";
  // Group A — B2B professional services
  if (niche.includes("avocat") || niche.includes("law") || niche.includes("notaire")) {
    context =
      "premium law firm website hero, restrained editorial composition, dark wood library detail, refined serif typography, navy + cream palette";
  } else if (niche.includes("conseil") || niche.includes("consulting") || niche.includes("expert-comptable")) {
    context =
      "premium B2B consulting firm website hero, sharp grid layout, abstract data visualisation accent, refined sans-serif typography, deep blue + warm grey palette";
  } else if (niche.includes("agence") || niche.includes("communication") || niche.includes("marketing") || niche.includes("digital") || niche.includes("73.11") || niche.includes("74.10")) {
    context =
      "premium creative agency website hero, bold editorial typography, dramatic full-bleed image, dark accent palette, magazine-grade composition";
  } else if (niche.includes("architect")) {
    context =
      "premium architecture studio website hero, minimal black and white composition, dramatic architectural photography, refined sans-serif typography";
  } else if (niche.includes("recrutement") || niche.includes("rh") || niche.includes("hr")) {
    context =
      "premium executive search website hero, restrained editorial photography, portrait composition, refined typography, off-white + charcoal palette";
  }
  // Group B — Tech / SaaS
  else if (niche.includes("tech") || niche.includes("saas") || niche.includes("software") || niche.includes("logiciel") || niche.includes("62.0") || niche.includes("63.1")) {
    context =
      "premium B2B SaaS landing page hero, polished product UI screenshot mockup floating over gradient, large kinetic typography, dark mode aesthetic with one bright accent color";
  }
  // Legacy fallbacks (existing prospects)
  else if (niche.includes("hotel") || niche.includes("hôtel")) {
    context =
      "luxury boutique hotel website hero, large refined serif typography, moody architectural photography";
  } else if (niche.includes("restaurant") || niche.includes("gastro") || niche.includes("patisserie")) {
    context =
      "Michelin-style gastronomic restaurant website hero, dark editorial mood, refined food photography";
  }

  return `${context} for "${p.firmaNaziv}" in ${p.grad}. Award-winning web design, contemporary, refined editorial layout, ample negative space, premium magazine aesthetic. No text overlays in the image. Cinematic, high-end, magazine-quality. 16:9 aspect ratio.`;
}

/**
 * Calls Replicate's predictions API, polls until the generation finishes,
 * and returns the resulting image URL. Replicate's standard sync-or-poll
 * pattern with a 60s budget cap.
 */
async function generateOnReplicate(prompt: string): Promise<string> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN nije postavljen");

  const create = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait", // ask Replicate to hold the connection until it finishes (≤60s)
    },
    body: JSON.stringify({
      version: REPLICATE_VERSION,
      input: {
        prompt,
        aspect_ratio: "16:9",
        output_format: "jpg",
        output_quality: 92,
        num_outputs: 1,
        go_fast: true,
        megapixels: "1",
      },
    }),
  });

  if (!create.ok) {
    const text = await create.text();
    throw new Error(`Replicate ${create.status}: ${text.slice(0, 200)}`);
  }

  const json = (await create.json()) as { status: string; output?: string[] | string; error?: string; urls?: { get: string } };

  // With Prefer:wait, the response should already be "succeeded" — but if not,
  // poll a few times before giving up.
  let current = json;
  let polls = 0;
  while (current.status !== "succeeded" && current.status !== "failed" && polls < 30) {
    await new Promise((r) => setTimeout(r, 1500));
    polls++;
    if (!current.urls?.get) break;
    const poll = await fetch(current.urls.get, { headers: { Authorization: `Bearer ${token}` } });
    current = (await poll.json()) as typeof current;
  }

  if (current.status === "failed") {
    throw new Error(current.error || "Replicate failed");
  }

  const output = Array.isArray(current.output) ? current.output[0] : current.output;
  if (typeof output !== "string") {
    throw new Error("Replicate vratio neočekivan output");
  }
  return output;
}

/**
 * Downloads the Replicate result and uploads it to Vercel Blob so the URL is
 * permanent (Replicate's CDN expires). Returns the permanent URL.
 */
async function persistToBlob(replicateUrl: string, prospectId: string): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // No blob storage — fall back to Replicate URL. Will expire but works for
    // demos/early testing.
    return replicateUrl;
  }
  const res = await fetch(replicateUrl);
  if (!res.ok) throw new Error(`Replicate URL HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const filename = `mockups/${prospectId}-${Date.now()}.jpg`;
  const blob = await put(filename, buf, {
    access: "public",
    contentType: "image/jpeg",
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return blob.url;
}

export async function generateMockup(
  prospect: ProspectForMockup & { id: string }
): Promise<MockupResult> {
  if (!process.env.REPLICATE_API_TOKEN) {
    return { ok: false, error: "REPLICATE_API_TOKEN nije postavljen u Vercel Env" };
  }
  const prompt = buildMockupPrompt(prospect);
  try {
    const replicateUrl = await generateOnReplicate(prompt);
    const finalUrl = await persistToBlob(replicateUrl, prospect.id);
    return { ok: true, url: finalUrl, prompt };
  } catch (e) {
    return {
      ok: false,
      prompt,
      error: e instanceof Error ? e.message : "Generisanje neuspješno",
    };
  }
}
