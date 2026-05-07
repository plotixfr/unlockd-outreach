import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Minimal 1×1 transparent PNG
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  try {
    const { emailId } = await params;
    // Only record first open
    await prisma.email.updateMany({
      where: { id: emailId, otvorenAt: null },
      data: { otvoren: true, otvorenAt: new Date() },
    });
  } catch {
    // Never fail — always return the pixel
  }

  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
