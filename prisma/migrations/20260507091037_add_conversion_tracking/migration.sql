-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "otvorenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Conversion" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "vrijednostProjekta" DOUBLE PRECISION NOT NULL,
    "datumKonverzije" TIMESTAMP(3) NOT NULL,
    "napomena" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
