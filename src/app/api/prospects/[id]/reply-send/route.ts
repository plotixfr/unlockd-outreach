import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { signatureHtml, signatureText } from "@/lib/signature";
import { resendGate } from "@/lib/sendEmail";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL ?? "temim@unlockd.art";
const REPLY_TO = process.env.REPLY_TO_EMAIL ?? FROM_EMAIL;
const BCC_EMAIL = process.env.BCC_EMAIL ?? "temim.fr@gmail.com";

/**
 * Sends the AI-drafted (and operator-edited) response to a prospect's reply.
 * Threads to the original initial email so it lands in the same Gmail thread.
 * Marks the Reply.draft as cleared once sent so the UI hides the panel.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: prospectId } = await params;
    let body: { replyId?: string; draft?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const { replyId, draft } = body;
    if (!replyId || !draft?.trim()) {
      return NextResponse.json({ error: "replyId and draft are required" }, { status: 400 });
    }

    const [prospect, reply, initial] = await Promise.all([
      prisma.prospect.findUnique({ where: { id: prospectId } }),
      prisma.reply.findUnique({ where: { id: replyId } }),
      prisma.email.findFirst({
        where: { prospectId, tip: "initial", poslat: true, messageId: { not: null } },
        select: { messageId: true, subject: true, subjectB: true, activeSubject: true },
      }),
    ]);
    if (!prospect || !reply) {
      return NextResponse.json({ error: "Prospect or reply not found" }, { status: 404 });
    }
    if (reply.prospectId !== prospectId) {
      return NextResponse.json({ error: "Reply ne pripada ovom prospect-u" }, { status: 400 });
    }

    // Format the draft as HTML with paragraph breaks.
    const draftHtml = draft
      .trim()
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
      .join("");
    const html = `${draftHtml}${signatureHtml(prospectId)}`;
    const text = `${draft.trim()}\n\n${signatureText(prospectId)}`;

    const headers: Record<string, string> = {};
    let subjectToSend = reply.subject?.startsWith("Re:")
      ? reply.subject
      : `Re: ${reply.subject ?? "(votre message)"}`;
    if (initial?.messageId) {
      headers["In-Reply-To"] = initial.messageId;
      headers["References"] = initial.messageId;
      const initSubject =
        initial.activeSubject === "B" && initial.subjectB ? initial.subjectB : initial.subject;
      if (initSubject) subjectToSend = `Re: ${initSubject.replace(/^re:\s*/i, "")}`;
    }

    await resendGate();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [prospect.email],
      bcc: [BCC_EMAIL],
      replyTo: REPLY_TO,
      subject: subjectToSend,
      html,
      text,
      headers,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    // Clear the draft so the UI hides the panel; keep classification + body
    // for the historical record.
    await prisma.reply.update({
      where: { id: replyId },
      data: { draft: null },
    });

    return NextResponse.json({ ok: true, messageId: data?.id ?? null });
  } catch (err) {
    console.error("[reply-send]", err);
    return NextResponse.json({ error: "server error while sending" }, { status: 500 });
  }
}
