-- Prospect: cached website scrape snapshot (used by AI prompt builder)
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "siteSnapshot" JSONB;
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "siteSnapshotAt" TIMESTAMP(3);

-- Email: Gmail Message-ID returned by Resend, used to thread follow-ups
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "messageId" TEXT;

-- Reply: persisted body of every prospect reply pulled over IMAP
CREATE TABLE IF NOT EXISTS "Reply" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "fromAddr" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "imapUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reply_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Reply_imapUid_key" ON "Reply"("imapUid");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Reply_prospectId_fkey'
    ) THEN
        ALTER TABLE "Reply" ADD CONSTRAINT "Reply_prospectId_fkey"
            FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END$$;
