-- Prospect enrichment fields
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "pagespeed"       JSONB;
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "pagespeedAt"     TIMESTAMP(3);
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "decisionMakers"  JSONB;
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "qualityScore"    INTEGER;
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "qualityNote"     TEXT;
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "dealStage"       TEXT;
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "dealValue"       DOUBLE PRECISION;
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "dealStageAt"     TIMESTAMP(3);

-- Email click tracking
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "calendlyClicked"   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "calendlyClickedAt" TIMESTAMP(3);

-- Reply classification + AI-drafted response
ALTER TABLE "Reply" ADD COLUMN IF NOT EXISTS "classification" TEXT;
ALTER TABLE "Reply" ADD COLUMN IF NOT EXISTS "draft"          TEXT;

-- Case studies library (auto-inserted into follow-up #2)
CREATE TABLE IF NOT EXISTS "CaseStudy" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "nisa"        TEXT NOT NULL,
    "summary"     TEXT NOT NULL,
    "metricLabel" TEXT,
    "metricValue" TEXT,
    "imageUrl"    TEXT,
    "active"      BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CaseStudy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CaseStudy_nisa_active_idx" ON "CaseStudy"("nisa", "active");
CREATE INDEX IF NOT EXISTS "Prospect_qualityScore_idx" ON "Prospect"("qualityScore");
CREATE INDEX IF NOT EXISTS "Prospect_dealStage_idx" ON "Prospect"("dealStage");
