ALTER TABLE "SearchBrief" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'google_places';
CREATE INDEX IF NOT EXISTS "SearchBrief_source_idx" ON "SearchBrief"("source");
