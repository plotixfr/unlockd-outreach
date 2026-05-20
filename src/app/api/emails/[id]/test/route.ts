import { NextRequest, NextResponse } from "next/server";
import { sendTestEmail } from "@/lib/sendEmail";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: { to?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine — fall back to env default.
    }
    const to = (body.to ?? process.env.TEST_EMAIL ?? "temim.fr@gmail.com").trim();
    if (!to.includes("@")) {
      return NextResponse.json({ error: "Neispravna test adresa" }, { status: 400 });
    }

    const res = await sendTestEmail(id, to);
    if (!res.ok) {
      return NextResponse.json({ error: res.error ?? "Error" }, { status: 502 });
    }
    return NextResponse.json({ success: true, to, messageId: res.messageId });
  } catch (err) {
    console.error("[email test]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}
