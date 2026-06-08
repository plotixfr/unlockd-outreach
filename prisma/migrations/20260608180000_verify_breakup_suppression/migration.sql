-- Prospect: email verification, audit findings cache, breakup touch
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "verifiedEmail"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "verifiedAt"       TIMESTAMP(3);
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "verifyResult"     TEXT;
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "auditFindings"    JSONB;
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "auditFindingsAt"  TIMESTAMP(3);
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "scheduledBreakup" TIMESTAMP(3);
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "datumBreakup"     TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Prospect_verifiedEmail_idx"    ON "Prospect"("verifiedEmail");
CREATE INDEX IF NOT EXISTS "Prospect_scheduledBreakup_idx" ON "Prospect"("scheduledBreakup");

-- Email: bounce tracking + spam-lint score
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "bounced"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "bouncedAt"     TIMESTAMP(3);
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "bouncedReason" TEXT;
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "spamScore"     INTEGER;
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "spamWords"     TEXT;

CREATE INDEX IF NOT EXISTS "Email_bounced_idx" ON "Email"("bounced");

-- SuppressedDomain: company-level suppression so colleagues don't get cold-mailed
-- after one person at the domain replied / unsubscribed / bounced.
CREATE TABLE IF NOT EXISTS "SuppressedDomain" (
  "domain"     TEXT NOT NULL,
  "reason"     TEXT NOT NULL,
  "prospectId" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SuppressedDomain_pkey" PRIMARY KEY ("domain")
);

CREATE INDEX IF NOT EXISTS "SuppressedDomain_prospectId_idx" ON "SuppressedDomain"("prospectId");
