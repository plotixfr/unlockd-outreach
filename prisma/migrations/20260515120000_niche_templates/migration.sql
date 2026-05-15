-- CreateTable
CREATE TABLE "NicheTemplate" (
    "nisa" TEXT NOT NULL,
    "promptHint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NicheTemplate_pkey" PRIMARY KEY ("nisa")
);
