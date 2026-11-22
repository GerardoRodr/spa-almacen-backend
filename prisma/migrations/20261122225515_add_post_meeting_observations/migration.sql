-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('NONE', 'PERCENTAGE', 'FIXED');

-- AlterEnum
ALTER TYPE "ItemType" ADD VALUE 'SERVICE';

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "trackExpiration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trackLot" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "s10FileName" TEXT,
ADD COLUMN     "s10FilePath" TEXT,
ADD COLUMN     "s10UploadedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "isEdited" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PurchaseDetail" ADD COLUMN     "discountAmountPEN" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "discountValue" DECIMAL(12,4) NOT NULL DEFAULT 0,
ADD COLUMN     "expirationDate" TIMESTAMP(3),
ADD COLUMN     "lotNumber" TEXT;

-- CreateIndex
CREATE INDEX "Item_isActive_idx" ON "Item"("isActive");

-- CreateIndex
CREATE INDEX "ItemAlias_itemId_idx" ON "ItemAlias"("itemId");
