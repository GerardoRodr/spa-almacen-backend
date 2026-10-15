-- CreateTable
CREATE TABLE "DocumentSequence" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL,
    "nextSeq" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentSequence_year_prefix_idx" ON "DocumentSequence"("year", "prefix");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSequence_year_prefix_key" ON "DocumentSequence"("year", "prefix");

-- CreateIndex
CREATE INDEX "DocumentAttachment_purchaseId_idx" ON "DocumentAttachment"("purchaseId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_transferId_idx" ON "DocumentAttachment"("transferId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_movementId_idx" ON "DocumentAttachment"("movementId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_custodyId_idx" ON "DocumentAttachment"("custodyId");

-- CreateIndex
CREATE INDEX "Item_type_idx" ON "Item"("type");

-- CreateIndex
CREATE INDEX "Item_isPerishable_idx" ON "Item"("isPerishable");

-- CreateIndex
CREATE INDEX "Movement_originWarehouseId_idx" ON "Movement"("originWarehouseId");

-- CreateIndex
CREATE INDEX "Movement_destWarehouseId_idx" ON "Movement"("destWarehouseId");

-- CreateIndex
CREATE INDEX "Movement_projectId_idx" ON "Movement"("projectId");

-- CreateIndex
CREATE INDEX "Movement_userId_idx" ON "Movement"("userId");

-- CreateIndex
CREATE INDEX "Movement_transferId_idx" ON "Movement"("transferId");

-- CreateIndex
CREATE INDEX "Movement_type_idx" ON "Movement"("type");

-- CreateIndex
CREATE INDEX "Movement_createdAt_idx" ON "Movement"("createdAt");

-- CreateIndex
CREATE INDEX "MovementItem_movementId_idx" ON "MovementItem"("movementId");

-- CreateIndex
CREATE INDEX "MovementItem_itemId_idx" ON "MovementItem"("itemId");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_idx" ON "Purchase"("supplierId");

-- CreateIndex
CREATE INDEX "Purchase_issueDate_idx" ON "Purchase"("issueDate");

-- CreateIndex
CREATE INDEX "Purchase_createdAt_idx" ON "Purchase"("createdAt");

-- CreateIndex
CREATE INDEX "PurchaseDetail_purchaseId_idx" ON "PurchaseDetail"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseDetail_itemId_idx" ON "PurchaseDetail"("itemId");

-- CreateIndex
CREATE INDEX "Stock_itemId_idx" ON "Stock"("itemId");

-- CreateIndex
CREATE INDEX "ToolCustody_warehouseId_idx" ON "ToolCustody"("warehouseId");

-- CreateIndex
CREATE INDEX "ToolCustody_itemId_idx" ON "ToolCustody"("itemId");

-- CreateIndex
CREATE INDEX "ToolCustody_assignedToDni_idx" ON "ToolCustody"("assignedToDni");

-- CreateIndex
CREATE INDEX "ToolCustody_returnDate_idx" ON "ToolCustody"("returnDate");

-- CreateIndex
CREATE INDEX "ToolCustody_dispatchDate_idx" ON "ToolCustody"("dispatchDate");

-- CreateIndex
CREATE INDEX "Transfer_originWarehouseId_idx" ON "Transfer"("originWarehouseId");

-- CreateIndex
CREATE INDEX "Transfer_destWarehouseId_idx" ON "Transfer"("destWarehouseId");

-- CreateIndex
CREATE INDEX "Transfer_status_idx" ON "Transfer"("status");

-- CreateIndex
CREATE INDEX "Transfer_createdAt_idx" ON "Transfer"("createdAt");

-- CreateIndex
CREATE INDEX "TransferItem_transferId_idx" ON "TransferItem"("transferId");

-- CreateIndex
CREATE INDEX "TransferItem_itemId_idx" ON "TransferItem"("itemId");
