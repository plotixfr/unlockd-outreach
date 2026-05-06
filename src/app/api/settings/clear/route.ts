import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE() {
  try {
    const [emails, prospects] = await Promise.all([
      prisma.email.deleteMany({}),
      prisma.prospect.deleteMany({}),
    ]);
    return NextResponse.json({ success: true, deleted: { emails: emails.count, prospects: prospects.count } });
  } catch (err) {
    console.error("[settings/clear]", err);
    return NextResponse.json({ error: "Greška pri brisanju baze" }, { status: 500 });
  }
}
