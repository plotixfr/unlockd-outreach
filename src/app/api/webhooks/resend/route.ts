import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { suppressDomain } from "@/lib/suppression";

async function verifySignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  rawBody: string,
  svixSignature: string
): Promise<boolean> {
  try {
    // Resend webhook secrets are "whsec_<base64>" — decode the base64 part
    const base64 = secret.replace(/^whsec_/, "");
    const keyBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
    const enc = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(toSign));
    const computed = `v1,${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;

    // svix-signature may contain multiple space-separated sigs
    return svixSignature.split(" ").some((s) => s.trim() === computed);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const svixId = req.headers.get("svix-id") ?? "";
  const svixTimestamp = req.headers.get("svix-timestamp") ?? "";
  const svixSignature = req.headers.get("svix-signature") ?? "";
  const rawBody = await req.text();

  const valid = await verifySignature(secret, svixId, svixTimestamp, rawBody, svixSignature);
  if (!valid) {
    console.warn("[resend-webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: {
    type: string;
    data: { email_id?: string; to?: string[]; bounce?: { message?: string; subType?: string } };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const { type, data } = event;
  const resendId = data?.email_id;
  const toEmail = data?.to?.[0];

  console.log("[resend-webhook] Event:", type, "| resendId:", resendId, "| to:", toEmail);

  if (type === "email.bounced" || type === "email.complained") {
    const newStatus = type === "email.bounced" ? "Bounced" : "Unsubscribed";

    // Find email by resendId first, fall back to prospect email address
    let prospectId: string | null = null;
    let emailId: string | null = null;

    if (resendId) {
      const email = await prisma.email.findFirst({ where: { resendId } });
      if (email) {
        prospectId = email.prospectId;
        emailId = email.id;
      }
    }

    if (!prospectId && toEmail) {
      const prospect = await prisma.prospect.findUnique({ where: { email: toEmail } });
      if (prospect) prospectId = prospect.id;
    }

    if (!prospectId) {
      console.warn("[resend-webhook] Prospect not found for", type, resendId, toEmail);
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Mark the prospect terminal + clear pending sends.
    const prospect = await prisma.prospect.update({
      where: { id: prospectId },
      data: {
        status: newStatus,
        scheduledInitial: null,
        scheduledFollow1: null,
        scheduledFollow2: null,
        scheduledFollow3: null,
        scheduledBreakup: null,
      },
    });

    // Persist bounce metadata on the specific email row, so the dashboard
    // surfaces which send burned and we can audit later.
    if (emailId && type === "email.bounced") {
      await prisma.email.update({
        where: { id: emailId },
        data: {
          bounced: true,
          bouncedAt: new Date(),
          bouncedReason: data.bounce?.message ?? data.bounce?.subType ?? "bounce",
        },
      });
    }

    // Domain-level suppression: a colleague at the same company shouldn't
    // get a cold email after a hard bounce / spam complaint. Public
    // providers (gmail.com etc.) are skipped inside suppressDomain.
    const reason = type === "email.bounced" ? "bounced" : "complained";
    await suppressDomain(prospect.email, reason, prospectId);

    console.log("[resend-webhook] Updated prospect", prospectId, "→", newStatus, "+ suppressed domain");
  }

  return NextResponse.json({ ok: true });
}
