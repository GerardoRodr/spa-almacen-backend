-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "s10BudgetDate" TIMESTAMP(3),
ADD COLUMN     "s10EquipmentBudget" DECIMAL(14,2),
ADD COLUMN     "s10LaborBudget" DECIMAL(14,2),
ADD COLUMN     "s10Location" TEXT,
ADD COLUMN     "s10MaterialsBudget" DECIMAL(14,2),
ADD COLUMN     "s10SubcontractsBudget" DECIMAL(14,2),
ADD COLUMN     "s10TotalBudget" DECIMAL(14,2),
ADD COLUMN     "s10Ubigeo" TEXT;
