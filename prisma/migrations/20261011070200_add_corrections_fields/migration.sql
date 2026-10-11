-- AlterEnum
BEGIN;
CREATE TYPE "ItemType_new" AS ENUM ('CONSUMABLE', 'TOOL', 'EQUIPMENT', 'MACHINERY');
ALTER TABLE "Item" ALTER COLUMN "type" TYPE "ItemType_new" USING (
    CASE 
      WHEN "type"::text = 'ASSET_TOOL' AND "sku" LIKE 'EQU-%' THEN 'EQUIPMENT'::"ItemType_new"
      WHEN "type"::text = 'ASSET_TOOL' THEN 'TOOL'::"ItemType_new"
      ELSE "type"::text::"ItemType_new"
    END
);
ALTER TYPE "ItemType" RENAME TO "ItemType_old";
ALTER TYPE "ItemType_new" RENAME TO "ItemType";
DROP TYPE "public"."ItemType_old";
COMMIT;

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "proofType" TEXT;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "isPerishable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "hasIgv" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "voucherType" TEXT NOT NULL DEFAULT 'FACTURA';

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "MachineryShiftLog" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "operatorName" TEXT NOT NULL,
    "operatorDni" TEXT NOT NULL,
    "startHourMeter" DECIMAL(10,2) NOT NULL,
    "endHourMeter" DECIMAL(10,2),
    "totalHours" DECIMAL(10,2),
    "startDateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDateTime" TIMESTAMP(3),
    "startPhotoId" TEXT,
    "endPhotoId" TEXT,
    "fuelPhotoId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachineryShiftLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MachineryShiftLog_itemId_idx" ON "MachineryShiftLog"("itemId");

-- CreateIndex
CREATE INDEX "MachineryShiftLog_warehouseId_idx" ON "MachineryShiftLog"("warehouseId");

-- AddForeignKey
ALTER TABLE "MachineryShiftLog" ADD CONSTRAINT "MachineryShiftLog_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineryShiftLog" ADD CONSTRAINT "MachineryShiftLog_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
