-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "resendId" TEXT;

-- AlterTable
ALTER TABLE "Prospect" ADD COLUMN     "podsjetnikDatum" TIMESTAMP(3),
ADD COLUMN     "podsjetnikNapomena" TEXT;

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "tekst" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
