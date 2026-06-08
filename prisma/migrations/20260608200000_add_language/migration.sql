ALTER TABLE "Prospect"    ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'fr';
ALTER TABLE "SearchBrief" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'fr';
CREATE INDEX IF NOT EXISTS "Prospect_language_idx" ON "Prospect"("language");
CREATE INDEX IF NOT EXISTS "SearchBrief_language_idx" ON "SearchBrief"("language");
