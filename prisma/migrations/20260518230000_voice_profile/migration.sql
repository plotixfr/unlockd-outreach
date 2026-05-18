CREATE TABLE IF NOT EXISTS "OperatorVoice" (
    "id"                TEXT NOT NULL,
    "name"              TEXT NOT NULL DEFAULT 'Default',
    "samples"           JSONB NOT NULL,
    "styleDescription"  TEXT NOT NULL,
    "active"            BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OperatorVoice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OperatorVoice_active_idx" ON "OperatorVoice"("active");
