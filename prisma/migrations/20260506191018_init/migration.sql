-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "firmaNaziv" TEXT NOT NULL,
    "kontaktIme" TEXT,
    "kontaktPozicija" TEXT,
    "email" TEXT NOT NULL,
    "website" TEXT,
    "instagram" TEXT,
    "nisa" TEXT NOT NULL,
    "grad" TEXT NOT NULL,
    "opisFirme" TEXT,
    "kvalitetSajta" INTEGER,
    "napomena" TEXT,
    "status" TEXT NOT NULL DEFAULT 'New',
    "datumPrvogMaila" TIMESTAMP(3),
    "datumFollowUp1" TIMESTAMP(3),
    "datumFollowUp2" TIMESTAMP(3),
    "datumFollowUp3" TIMESTAMP(3),
    "datumOdgovora" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Email" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "tip" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "poslat" BOOLEAN NOT NULL DEFAULT false,
    "poslatAt" TIMESTAMP(3),
    "otvoren" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_email_key" ON "Prospect"("email");

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
