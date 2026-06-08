import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDealStage } from "@/lib/dealStages";

/**
 * Updates a prospect's deal stage and forecast value. Used by the pipeline
 * board's drag/move actions and by the inline editor on prospect detail.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: { dealStage?: string | null; dealValue?: number | string | null };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if ("dealStage" in body) {
      if (body.dealStage === null || body.dealStage === "") {
        data.dealStage = null;
        data.dealStageAt = null;
      } else if (isDealStage(body.dealStage)) {
        data.dealStage = body.dealStage;
        data.dealStageAt = new Date();
      } else {
        return NextResponse.json({ error: "Nevažeći stage" }, { status: 400 });
      }
    }
    if ("dealValue" in body) {
      if (body.dealValue === null || body.dealValue === "") {
        data.dealValue = null;
      } else {
        const n = typeof body.dealValue === "string" ? parseFloat(body.dealValue) : body.dealValue;
        if (typeof n !== "number" || !isFinite(n) || n < 0) {
          return NextResponse.json({ error: "Nevažeća vrijednost" }, { status: 400 });
        }
        data.dealValue = n;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "no data" }, { status: 400 });
    }

    const prospect = await prisma.prospect.update({ where: { id }, data });
    return NextResponse.json({ prospect });
  } catch (err) {
    console.error("[deal PATCH]", err);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
