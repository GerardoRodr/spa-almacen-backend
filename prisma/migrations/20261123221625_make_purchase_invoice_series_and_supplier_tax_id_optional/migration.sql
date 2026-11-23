-- AlterTable
ALTER TABLE "Purchase" ALTER COLUMN "invoiceSeries" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Supplier" ALTER COLUMN "taxId" DROP NOT NULL;
