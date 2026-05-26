/*
  Warnings:

  - You are about to drop the column `clan` on the `FamilyNode` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "FamilyNode" DROP COLUMN "clan",
ADD COLUMN     "clanId" TEXT;

-- CreateTable
CREATE TABLE "FamilyClan" (
    "id" TEXT NOT NULL,
    "treeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#c8a84b',
    "icon" TEXT NOT NULL DEFAULT '✦',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyClan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FamilyClan_treeId_idx" ON "FamilyClan"("treeId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyClan_treeId_name_key" ON "FamilyClan"("treeId", "name");

-- AddForeignKey
ALTER TABLE "FamilyClan" ADD CONSTRAINT "FamilyClan_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyNode" ADD CONSTRAINT "FamilyNode_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "FamilyClan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
