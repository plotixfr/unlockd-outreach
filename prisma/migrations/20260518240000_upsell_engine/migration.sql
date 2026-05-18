ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "upsellCount"       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "lastUpsellAt"      TIMESTAMP(3);
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "linkedinTouchedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Prospect_upsellCount_idx"  ON "Prospect"("upsellCount");
CREATE INDEX IF NOT EXISTS "Prospect_lastUpsellAt_idx" ON "Prospect"("lastUpsellAt");
