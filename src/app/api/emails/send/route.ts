import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { resendGate } from "@/lib/sendEmail";

const resend = new Resend(process.env.RESEND_API_KEY);
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://unlockd-outreach.vercel.app";

const TIP_STATUS: Record<string, { status: string; field: string }> = {
  initial: { status: "Emailed", field: "datumPrvogMaila" },
  follow1: { status: "Follow1", field: "datumFollowUp1" },
  follow2: { status: "Follow2", field: "datumFollowUp2" },
  follow3: { status: "Follow3", field: "datumFollowUp3" },
};

function buildHtml(body: string, emailId: string, prospectId: string): string {
  const pixel = `<img src="${SITE_URL}/api/track/open/${emailId}" width="1" height="1" style="display:none;border:0;outline:none;" alt="" />`;
  const unsubscribe = `<p style="font-size:11px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">Si vous ne souhaitez plus recevoir nos messages, <a href="${SITE_URL}/api/unsubscribe/${prospectId}" style="color:#999;text-decoration:underline;">cliquez ici pour vous désabonner</a>.</p>`;
  return body + pixel + unsubscribe;
}

export async function POST(req: NextRequest) {
  try {
    let emailId: string;
    try {
      const body = await req.json();
      emailId = body?.emailId;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request" },
        { status: 400 }
      );
    }

    if (!emailId) {
      return NextResponse.json(
        { error: "emailId required" },
        { status: 400 }
      );
    }

    const email = await prisma.email.findUnique({
      where: { id: emailId },
      include: { prospect: true },
    });

    if (!email) {
      return NextResponse.json(
        { error: "Email not found" },
        { status: 404 }
      );
    }

    if (email.poslat) {
      return NextResponse.json(
        { error: "Email already sent" },
        { status: 400 }
      );
    }

    const html = buildHtml(email.body, email.id, email.prospect.id);
    const subjectToSend =
      email.activeSubject === "B" && email.subjectB ? email.subjectB : email.subject;
    const fromAddr = process.env.FROM_EMAIL ?? "temim@unlockd.art";

    await resendGate();
    const { data, error } = await resend.emails.send({
      from: fromAddr,
      to: [email.prospect.email],
      subject: subjectToSend,
      html,
    });

    if (error) {
      return NextResponse.json(
        { error: `Resend greška: ${error.message}` },
        { status: 502 }
      );
    }

    const now = new Date();
    const mapping = TIP_STATUS[email.tip];

    await prisma.email.update({
      where: { id: emailId },
      data: { poslat: true, poslatAt: now, resendId: data?.id ?? null },
    });

    if (mapping) {
      await prisma.prospect.update({
        where: { id: email.prospectId },
        data: { status: mapping.status, [mapping.field]: now },
      });
    }

    // Operator copy without the tracking pixel — so the operator opening
    // their own copy doesn't register as a prospect open.
    try {
      await resendGate();
      const opName = email.prospect.firmaNaziv;
      const opEmail = email.prospect.email;
      const banner = `<div style="background:#f4f4f5;padding:12px 16px;border-left:3px solid #3b82f6;margin-bottom:20px;font-family:-apple-system,sans-serif;"><p style="margin:0;font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">SENT — Operator copy</p><p style="margin:4px 0 0;font-size:13px;color:#27272a;">To: <strong>${opName}</strong> &lt;${opEmail}&gt;</p><p style="margin:2px 0 0;font-size:12px;color:#52525b;">Subject: ${subjectToSend}</p></div>`;
      await resend.emails.send({
        from: fromAddr,
        to: ["temim.fr@gmail.com"],
        subject: `[Sent] ${subjectToSend}`,
        html: banner + email.body,
      });
    } catch (e) {
      console.warn("[emails/send] operator copy failed:", e);
    }

    return NextResponse.json({ success: true, messageId: data?.id });
  } catch (err) {
    console.error("[send] Unhandled error:", err);
    return NextResponse.json(
      { error: "Serverska greška pri slanju emaila" },
      { status: 500 }
    );
  }
}
