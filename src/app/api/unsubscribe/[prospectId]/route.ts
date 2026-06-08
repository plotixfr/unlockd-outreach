import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { suppressDomain } from "@/lib/suppression";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ prospectId: string }> }
) {
  const { prospectId } = await params;

  try {
    const prospect = await prisma.prospect.update({
      where: { id: prospectId },
      data: {
        status: "Unsubscribed",
        scheduledInitial: null,
        scheduledFollow1: null,
        scheduledFollow2: null,
        scheduledFollow3: null,
        scheduledBreakup: null,
      },
    });
    // Suppress the whole company domain so colleagues at the same shop
    // don't get a cold pitch right after the original recipient opted out.
    // Public providers (gmail.com etc.) are skipped inside the helper.
    await suppressDomain(prospect.email, "unsubscribed", prospectId);
  } catch {
    // Already unsubscribed or not found — still show success page
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Désabonnement</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
    .card{background:#fff;border-radius:16px;padding:48px 40px;text-align:center;max-width:420px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .icon{font-size:52px;margin-bottom:20px}
    h1{font-size:20px;font-weight:600;color:#111;margin-bottom:12px}
    p{font-size:14px;color:#666;line-height:1.6}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Vous avez été désabonné avec succès.</h1>
    <p>Vous ne recevrez plus de messages de notre part.<br>Nous avons bien pris note de votre demande.</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
