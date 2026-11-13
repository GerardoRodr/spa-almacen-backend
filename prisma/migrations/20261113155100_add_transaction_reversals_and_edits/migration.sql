-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MovementType" ADD VALUE 'REVERSAL_ENTRY';
ALTER TYPE "MovementType" ADD VALUE 'REVERSAL_EXIT';

-- AlterTable
ALTER TABLE "MachineryShiftLog" ADD COLUMN     "isReverted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "revertedAt" TIMESTAMP(3),
ADD COLUMN     "revertedById" TEXT;

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "isReverted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "replacedById" TEXT,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversesMovementId" TEXT,
ADD COLUMN     "revertedAt" TIMESTAMP(3),
ADD COLUMN     "revertedById" TEXT;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "isReverted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "replacedById" TEXT,
ADD COLUMN     "reversalMovementId" TEXT,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "revertedAt" TIMESTAMP(3),
ADD COLUMN     "revertedById" TEXT;

-- AlterTable
ALTER TABLE "ToolCustody" ADD COLUMN     "isReverted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "replacedById" TEXT,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "revertedAt" TIMESTAMP(3),
ADD COLUMN     "revertedById" TEXT;

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "replacedById" TEXT;

-- CreateIndex
CREATE INDEX "MachineryShiftLog_isReverted_idx" ON "MachineryShiftLog"("isReverted");

-- CreateIndex
CREATE UNIQUE INDEX "Movement_reversesMovementId_key" ON "Movement"("reversesMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "Movement_replacedById_key" ON "Movement"("replacedById");

-- CreateIndex
CREATE INDEX "Movement_isReverted_idx" ON "Movement"("isReverted");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_replacedById_key" ON "Purchase"("replacedById");

-- CreateIndex
CREATE INDEX "Purchase_isReverted_idx" ON "Purchase"("isReverted");

-- CreateIndex
CREATE UNIQUE INDEX "ToolCustody_replacedById_key" ON "ToolCustody"("replacedById");

-- CreateIndex
CREATE INDEX "ToolCustody_isReverted_idx" ON "ToolCustody"("isReverted");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_replacedById_key" ON "Transfer"("replacedById");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_revertedById_fkey" FOREIGN KEY ("revertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_revertedById_fkey" FOREIGN KEY ("revertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_reversesMovementId_fkey" FOREIGN KEY ("reversesMovementId") REFERENCES "Movement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolCustody" ADD CONSTRAINT "ToolCustody_revertedById_fkey" FOREIGN KEY ("revertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineryShiftLog" ADD CONSTRAINT "MachineryShiftLog_revertedById_fkey" FOREIGN KEY ("revertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
