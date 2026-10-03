import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando siembra de datos desde seed-data.json...');

  const rawData = fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf-8');
  const data = JSON.parse(rawData);

  // Limpieza previa en orden inverso de dependencias para garantizar idempotencia
  console.log('Limpiando datos existentes...');
  await prisma.documentAttachment.deleteMany();
  await prisma.movementItem.deleteMany();
  await prisma.movement.deleteMany();
  await prisma.transferItem.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.toolCustody.deleteMany();
  await prisma.purchaseDetail.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.projectRequirement.deleteMany();
  await prisma.itemAlias.deleteMany();
  await prisma.item.deleteMany();
  await prisma.userWarehouse.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  // 1. Usuarios
  console.log('Sembrando usuarios...');
  for (const user of data.users) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    await prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        passwordHash,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
      },
    });
  }

  // 2. Proyectos
  console.log('Sembrando proyectos...');
  for (const project of data.projects) {
    await prisma.project.create({
      data: {
        id: project.id,
        name: project.name,
        budgetCode: project.budgetCode,
        status: project.status,
      },
    });
  }

  // 3. Almacenes
  console.log('Sembrando almacenes...');
  for (const warehouse of data.warehouses) {
    await prisma.warehouse.create({
      data: {
        id: warehouse.id,
        name: warehouse.name,
        type: warehouse.type,
        isTemporary: warehouse.isTemporary,
        isActive: warehouse.isActive,
        projectId: warehouse.projectId,
      },
    });
  }

  // 4. Asignaciones Usuario-Almacen
  console.log('Sembrando asignaciones de almacenes...');
  for (const uw of data.userWarehouses) {
    await prisma.userWarehouse.create({
      data: {
        id: uw.id,
        userId: uw.userId,
        warehouseId: uw.warehouseId,
        isDefault: uw.isDefault,
      },
    });
  }

  // 5. Proveedores
  console.log('Sembrando proveedores...');
  for (const supplier of data.suppliers) {
    await prisma.supplier.create({
      data: {
        id: supplier.id,
        taxId: supplier.taxId,
        businessName: supplier.businessName,
        contactPhone: supplier.contactPhone,
        contactEmail: supplier.contactEmail,
        address: supplier.address,
      },
    });
  }

  // 6. Catalogo de Items
  console.log('Sembrando catalogo de items...');
  for (const item of data.items) {
    await prisma.item.create({
      data: {
        id: item.id,
        sku: item.sku,
        name: item.name,
        description: item.description,
        baseUnit: item.baseUnit,
        type: item.type,
        minStockAlert: item.minStockAlert,
      },
    });
  }

  // 7. Alias S10
  console.log('Sembrando alias de insumos S10...');
  for (const alias of data.itemAliases) {
    await prisma.itemAlias.create({
      data: {
        id: alias.id,
        itemId: alias.itemId,
        s10RawName: alias.s10RawName,
        s10Code: alias.s10Code,
        s10Unit: alias.s10Unit,
        conversionFactor: alias.conversionFactor,
      },
    });
  }

  // 8. Requerimientos Presupuestales por Proyecto
  console.log('Sembrando requerimientos presupuestales de proyectos...');
  for (const req of data.projectRequirements) {
    await prisma.projectRequirement.create({
      data: {
        id: req.id,
        projectId: req.projectId,
        itemId: req.itemId,
        requiredQty: req.requiredQty,
        allocatedQty: req.allocatedQty,
        consumedQty: req.consumedQty,
      },
    });
  }

  // 9. Compras a Proveedores
  console.log('Sembrando compras...');
  for (const purchase of data.purchases) {
    await prisma.purchase.create({
      data: {
        id: purchase.id,
        supplierId: purchase.supplierId,
        invoiceSeries: purchase.invoiceSeries,
        currency: purchase.currency,
        exchangeRate: purchase.exchangeRate,
        issueDate: new Date(purchase.issueDate),
        subtotalPEN: purchase.subtotalPEN,
        igvAmountPEN: purchase.igvAmountPEN,
        totalAmountPEN: purchase.totalAmountPEN,
      },
    });
  }

  // 10. Detalles de Compras
  console.log('Sembrando detalles de compras...');
  for (const detail of data.purchaseDetails) {
    await prisma.purchaseDetail.create({
      data: {
        id: detail.id,
        purchaseId: detail.purchaseId,
        itemId: detail.itemId,
        purchaseUnit: detail.purchaseUnit,
        conversionFactor: detail.conversionFactor,
        purchaseQty: detail.purchaseQty,
        baseQty: detail.baseQty,
        unitPriceOriginal: detail.unitPriceOriginal,
        unitCostBasePEN: detail.unitCostBasePEN,
        subtotalPEN: detail.subtotalPEN,
      },
    });
  }

  // 11. Stocks Fisicos y Valorizados por Almacen
  console.log('Sembrando stocks de almacenes...');
  for (const stock of data.stocks) {
    await prisma.stock.create({
      data: {
        id: stock.id,
        warehouseId: stock.warehouseId,
        itemId: stock.itemId,
        physicalQty: stock.physicalQty,
        reservedQty: stock.reservedQty,
        loanedQty: stock.loanedQty,
        averageCost: stock.averageCost,
      },
    });
  }

  // 12. Transferencias entre Almacenes
  console.log('Sembrando transferencias...');
  for (const transfer of data.transfers) {
    await prisma.transfer.create({
      data: {
        id: transfer.id,
        transferNumber: transfer.transferNumber,
        originWarehouseId: transfer.originWarehouseId,
        destWarehouseId: transfer.destWarehouseId,
        projectId: transfer.projectId,
        status: transfer.status,
        dispatchedById: transfer.dispatchedById,
        receivedById: transfer.receivedById,
        dispatchedAt: transfer.dispatchedAt ? new Date(transfer.dispatchedAt) : null,
        receivedAt: transfer.receivedAt ? new Date(transfer.receivedAt) : null,
        dispatchNotes: transfer.dispatchNotes,
        receptionNotes: transfer.receptionNotes,
      },
    });
  }

  // 13. Items de Transferencias
  console.log('Sembrando items de transferencias...');
  for (const ti of data.transferItems) {
    await prisma.transferItem.create({
      data: {
        id: ti.id,
        transferId: ti.transferId,
        itemId: ti.itemId,
        dispatchedQty: ti.dispatchedQty,
        receivedQty: ti.receivedQty,
        discrepancyQty: ti.discrepancyQty,
        unitCostSnapshot: ti.unitCostSnapshot,
      },
    });
  }

  // 14. Movimientos de Kardex Inmutable
  console.log('Sembrando movimientos de kardex...');
  for (const mov of data.movements) {
    await prisma.movement.create({
      data: {
        id: mov.id,
        movementNumber: mov.movementNumber,
        type: mov.type,
        originWarehouseId: mov.originWarehouseId,
        destWarehouseId: mov.destWarehouseId,
        projectId: mov.projectId,
        userId: mov.userId,
        transferId: mov.transferId,
        recipientName: mov.recipientName,
        recipientDni: mov.recipientDni,
        shrinkageReason: mov.shrinkageReason,
        observation: mov.observation,
        createdAt: mov.createdAt ? new Date(mov.createdAt) : undefined,
      },
    });
  }

  // 15. Items de Movimientos de Kardex
  console.log('Sembrando items de movimientos de kardex...');
  for (const mi of data.movementItems) {
    await prisma.movementItem.create({
      data: {
        id: mi.id,
        movementId: mi.movementId,
        itemId: mi.itemId,
        quantity: mi.quantity,
        unitCostSnapshot: mi.unitCostSnapshot,
        totalCostSnapshot: mi.totalCostSnapshot,
      },
    });
  }

  // 16. Vales de Custodia de Herramientas
  console.log('Sembrando vales de custodia...');
  for (const tc of data.toolCustodies) {
    await prisma.toolCustody.create({
      data: {
        id: tc.id,
        custodyNumber: tc.custodyNumber,
        itemId: tc.itemId,
        warehouseId: tc.warehouseId,
        quantity: tc.quantity,
        serialOrCode: tc.serialOrCode,
        assignedToName: tc.assignedToName,
        assignedToDni: tc.assignedToDni,
        dispatchedById: tc.dispatchedById,
        receivedById: tc.receivedById,
        dispatchDate: new Date(tc.dispatchDate),
        expectedReturnDate: tc.expectedReturnDate ? new Date(tc.expectedReturnDate) : null,
        returnDate: tc.returnDate ? new Date(tc.returnDate) : null,
        conditionOnDispatch: tc.conditionOnDispatch,
        conditionOnReturn: tc.conditionOnReturn,
        notes: tc.notes,
        returnNotes: tc.returnNotes,
      },
    });
  }

  // 17. Documentos Adjuntos
  console.log('Sembrando documentos adjuntos...');
  for (const doc of data.documentAttachments) {
    await prisma.documentAttachment.create({
      data: {
        id: doc.id,
        purchaseId: doc.purchaseId,
        transferId: doc.transferId,
        movementId: doc.movementId,
        custodyId: doc.custodyId,
        originalName: doc.originalName,
        storedPath: doc.storedPath,
        mimeType: doc.mimeType,
        fileSizeBytes: doc.fileSizeBytes,
        isConfidential: doc.isConfidential,
      },
    });
  }

  console.log('Siembra exhaustiva de datos completada exitosamente.');
}

main()
  .catch((e) => {
    console.error('Error durante la siembra de datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
