ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "reengageCount"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "lastReengageAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Prospect_reengageCount_idx"   ON "Prospect"("reengageCount");
CREATE INDEX IF NOT EXISTS "Prospect_lastReengageAt_idx"  ON "Prospect"("lastReengageAt");
