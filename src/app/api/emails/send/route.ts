import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

const TIP_STATUS: Record<string, { status: string; field: string }> = {
  initial: { status: "Emailed", field: "datumPrvogMaila" },
  follow1: { status: "Follow1", field: "datumFollowUp1" },
  follow2: { status: "Follow2", field: "datumFollowUp2" },
  follow3: { status: "Follow3", field: "datumFollowUp3" },
};

export async function POST(req: NextRequest) {
  try {
    let emailId: string;
    try {
      const body = await req.json();
      emailId = body?.emailId;
    } catch {
      return NextResponse.json(
        { error: "Neispravan JSON request" },
        { status: 400 }
      );
    }

    if (!emailId) {
      return NextResponse.json(
        { error: "emailId je obavezan" },
        { status: 400 }
      );
    }

    const email = await prisma.email.findUnique({
      where: { id: emailId },
      include: { prospect: true },
    });

    if (!email) {
      return NextResponse.json(
        { error: "Email nije pronađen" },
        { status: 404 }
      );
    }

    if (email.poslat) {
      return NextResponse.json(
        { error: "Email je već poslan" },
        { status: 400 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL ?? "temim@unlockd.art",
      to: [email.prospect.email],
      bcc: ["temim.fr@gmail.com"],
      subject: email.subject,
      html: email.body,
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
      data: { poslat: true, poslatAt: now },
    });

    if (mapping) {
      await prisma.prospect.update({
        where: { id: email.prospectId },
        data: { status: mapping.status, [mapping.field]: now },
      });
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
