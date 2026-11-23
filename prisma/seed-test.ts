import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Currency,
  DiscountType,
  ItemType,
  MeterType,
  MovementType,
  PrismaClient,
  ProjectStatus,
  Role,
  ToolCondition,
  TransferStatus,
  WarehouseType,
} from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

interface SeedUser {
  id: string;
  email: string;
  password: string;
  fullName: string;
  role: Role;
  isActive?: boolean;
}

interface SeedProject {
  id: string;
  name: string;
  budgetCode?: string | null;
  status: ProjectStatus;
  s10Location?: string | null;
  s10Ubigeo?: string | null;
  s10BudgetDate?: string | null;
  s10TotalBudget?: number | null;
  s10MaterialsBudget?: number | null;
  s10EquipmentBudget?: number | null;
  s10LaborBudget?: number | null;
  s10SubcontractsBudget?: number | null;
  s10FilePath?: string | null;
  s10FileName?: string | null;
  s10UploadedAt?: string | null;
}

interface SeedWarehouse {
  id: string;
  name: string;
  type: WarehouseType;
  isTemporary?: boolean;
  isActive?: boolean;
  projectId?: string | null;
}

interface SeedUserWarehouse {
  id: string;
  userId: string;
  warehouseId: string;
  isDefault?: boolean;
}

interface SeedSupplier {
  id: string;
  taxId: string;
  businessName: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  notes?: string | null;
}

interface SeedMeasurementUnit {
  code: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
}

interface SeedItemCategory {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  isActive?: boolean;
}

interface SeedItem {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  baseUnit: string;
  type: ItemType;
  meterType?: MeterType | null;
  categoryId?: string | null;
  minStockAlert?: number;
  isPerishable?: boolean;
  trackLot?: boolean;
  trackExpiration?: boolean;
  isActive?: boolean;
}

interface SeedItemAlias {
  id: string;
  itemId: string;
  s10RawName: string;
  s10Code?: string | null;
  s10Unit?: string | null;
  conversionFactor?: number;
}

interface SeedProjectRequirement {
  id: string;
  projectId: string;
  itemId: string;
  requiredQty: number;
  allocatedQty?: number;
  consumedQty?: number;
  s10UnitPrice?: number | null;
}

interface SeedStock {
  id: string;
  warehouseId: string;
  itemId: string;
  physicalQty: number;
  reservedQty?: number;
  loanedQty?: number;
  averageCost: number;
}

interface SeedPurchase {
  id: string;
  supplierId: string;
  warehouseId?: string | null;
  invoiceSeries: string;
  voucherType?: string;
  hasIgv?: boolean;
  currency?: Currency;
  exchangeRate?: number;
  issueDate: string;
  subtotalPEN: number;
  igvAmountPEN?: number;
  totalAmountPEN: number;
  notes?: string | null;
  isEdited?: boolean;
  isReverted?: boolean;
  revertedAt?: string | null;
  revertedById?: string | null;
  reversalReason?: string | null;
  reversalMovementId?: string | null;
  replacedById?: string | null;
}

interface SeedPurchaseDetail {
  id: string;
  purchaseId: string;
  itemId: string;
  purchaseUnit: string;
  conversionFactor?: number;
  purchaseQty: number;
  baseQty: number;
  unitPriceOriginal: number;
  unitCostBasePEN: number;
  subtotalPEN: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmountPEN?: number;
  lotNumber?: string | null;
  expirationDate?: string | null;
  notes?: string | null;
}

interface SeedTransfer {
  id: string;
  transferNumber: string;
  originWarehouseId: string;
  destWarehouseId: string;
  projectId?: string | null;
  status: TransferStatus;
  dispatchedById: string;
  receivedById?: string | null;
  dispatchedAt?: string | null;
  receivedAt?: string | null;
  dispatchNotes?: string | null;
  receptionNotes?: string | null;
  cancelledAt?: string | null;
  cancelledById?: string | null;
  cancellationReason?: string | null;
  replacedById?: string | null;
}

interface SeedTransferItem {
  id: string;
  transferId: string;
  itemId: string;
  dispatchedQty: number;
  receivedQty?: number | null;
  discrepancyQty?: number | null;
  unitCostSnapshot: number;
}

interface SeedMovement {
  id: string;
  movementNumber: string;
  type: MovementType;
  originWarehouseId?: string | null;
  destWarehouseId?: string | null;
  projectId?: string | null;
  userId: string;
  transferId?: string | null;
  recipientName?: string | null;
  recipientDni?: string | null;
  shrinkageReason?: string | null;
  observation?: string | null;
  isReverted?: boolean;
  revertedAt?: string | null;
  revertedById?: string | null;
  reversalReason?: string | null;
  reversesMovementId?: string | null;
  replacedById?: string | null;
  createdAt?: string;
}

interface SeedMovementItem {
  id: string;
  movementId: string;
  itemId: string;
  quantity: number;
  unitCostSnapshot: number;
  totalCostSnapshot: number;
}

interface SeedToolCustody {
  id: string;
  custodyNumber: string;
  itemId: string;
  warehouseId: string;
  quantity?: number;
  serialOrCode?: string | null;
  assignedToName: string;
  assignedToDni: string;
  dispatchedById: string;
  receivedById?: string | null;
  dispatchDate?: string;
  expectedReturnDate?: string | null;
  returnDate?: string | null;
  conditionOnDispatch?: ToolCondition;
  conditionOnReturn?: ToolCondition | null;
  notes?: string | null;
  returnNotes?: string | null;
  isReverted?: boolean;
  revertedAt?: string | null;
  revertedById?: string | null;
  reversalReason?: string | null;
  replacedById?: string | null;
}

interface SeedDocumentAttachment {
  id: string;
  purchaseId?: string | null;
  transferId?: string | null;
  movementId?: string | null;
  custodyId?: string | null;
  proofType?: string | null;
  originalName: string;
  storedPath: string;
  mimeType: string;
  fileSizeBytes: number;
  isConfidential?: boolean;
}

interface SeedMachineryShiftLog {
  id: string;
  itemId: string;
  warehouseId: string;
  operatorName: string;
  operatorDni: string;
  meterType?: MeterType;
  startMeter: number;
  endMeter?: number | null;
  totalUsage?: number | null;
  startDateTime?: string;
  endDateTime?: string | null;
  startPhotoId?: string | null;
  endPhotoId?: string | null;
  fuelPhotoId?: string | null;
  notes?: string | null;
  isReverted?: boolean;
  revertedAt?: string | null;
  revertedById?: string | null;
  reversalReason?: string | null;
}

interface SeedDocumentSequence {
  id?: string;
  year: number;
  prefix: string;
  nextSeq: number;
}

interface SeedDataset {
  users: SeedUser[];
  projects: SeedProject[];
  warehouses: SeedWarehouse[];
  userWarehouses: SeedUserWarehouse[];
  suppliers: SeedSupplier[];
  measurementUnits: SeedMeasurementUnit[];
  itemCategories: SeedItemCategory[];
  items: SeedItem[];
  itemAliases: SeedItemAlias[];
  projectRequirements: SeedProjectRequirement[];
  stocks: SeedStock[];
  purchases: SeedPurchase[];
  purchaseDetails: SeedPurchaseDetail[];
  transfers: SeedTransfer[];
  transferItems: SeedTransferItem[];
  movements: SeedMovement[];
  movementItems: SeedMovementItem[];
  toolCustodies: SeedToolCustody[];
  documentAttachments: SeedDocumentAttachment[];
  machineryShiftLogs: SeedMachineryShiftLog[];
  documentSequences: SeedDocumentSequence[];
}

function toDateOrNull(value?: string | null): Date | null {
  return value ? new Date(value) : null;
}

async function main() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const dataPath = path.join(currentDir, 'seed-data.json');
  const rawJson = fs.readFileSync(dataPath, 'utf-8');
  const data = JSON.parse(rawJson) as SeedDataset;

  console.log('[Seed Test] Pre-procesando credenciales de usuarios de prueba...');
  const hashedUsers = await Promise.all(
    data.users.map(async (u) => ({
      id: u.id,
      email: u.email.toLowerCase().trim(),
      passwordHash: await bcrypt.hash(u.password, 10),
      fullName: u.fullName,
      role: u.role,
      isActive: u.isActive ?? true,
    })),
  );

  console.log('[Seed Test] Ejecutando siembra completa de las 21 tablas...');
  await prisma.$transaction(
    async (tx) => {
      // 1. Limpieza en orden inverso de dependencias FK
      await tx.documentSequence.deleteMany();
      await tx.documentAttachment.deleteMany();
      await tx.machineryShiftLog.deleteMany();
      await tx.movementItem.deleteMany();
      await tx.movement.deleteMany();
      await tx.transferItem.deleteMany();
      await tx.transfer.deleteMany();
      await tx.toolCustody.deleteMany();
      await tx.purchaseDetail.deleteMany();
      await tx.purchase.deleteMany();
      await tx.stock.deleteMany();
      await tx.projectRequirement.deleteMany();
      await tx.itemAlias.deleteMany();
      await tx.item.deleteMany();
      await tx.itemCategory.deleteMany();
      await tx.measurementUnit.deleteMany();
      await tx.userWarehouse.deleteMany();
      await tx.supplier.deleteMany();
      await tx.warehouse.deleteMany();
      await tx.project.deleteMany();
      await tx.user.deleteMany();

      // 2. Entidades maestras base
      await tx.user.createMany({ data: hashedUsers });

      await tx.project.createMany({
        data: data.projects.map((p) => ({
          id: p.id,
          name: p.name,
          budgetCode: p.budgetCode ?? null,
          status: p.status,
          s10Location: p.s10Location ?? null,
          s10Ubigeo: p.s10Ubigeo ?? null,
          s10BudgetDate: toDateOrNull(p.s10BudgetDate),
          s10TotalBudget: p.s10TotalBudget ?? null,
          s10MaterialsBudget: p.s10MaterialsBudget ?? null,
          s10EquipmentBudget: p.s10EquipmentBudget ?? null,
          s10LaborBudget: p.s10LaborBudget ?? null,
          s10SubcontractsBudget: p.s10SubcontractsBudget ?? null,
          s10FilePath: p.s10FilePath ?? null,
          s10FileName: p.s10FileName ?? null,
          s10UploadedAt: toDateOrNull(p.s10UploadedAt),
        })),
      });

      await tx.warehouse.createMany({
        data: data.warehouses.map((w) => ({
          id: w.id,
          name: w.name,
          type: w.type,
          isTemporary: w.isTemporary ?? false,
          isActive: w.isActive ?? true,
          projectId: w.projectId ?? null,
        })),
      });

      await tx.userWarehouse.createMany({
        data: data.userWarehouses.map((uw) => ({
          id: uw.id,
          userId: uw.userId,
          warehouseId: uw.warehouseId,
          isDefault: uw.isDefault ?? false,
        })),
      });

      await tx.supplier.createMany({
        data: data.suppliers.map((s) => ({
          id: s.id,
          taxId: s.taxId,
          businessName: s.businessName,
          contactPhone: s.contactPhone ?? null,
          contactEmail: s.contactEmail ?? null,
          address: s.address ?? null,
          notes: s.notes ?? null,
        })),
      });

      await tx.measurementUnit.createMany({
        data: data.measurementUnits.map((mu) => ({
          code: mu.code,
          name: mu.name,
          description: mu.description ?? null,
          isActive: mu.isActive ?? true,
        })),
      });

      await tx.itemCategory.createMany({
        data: data.itemCategories.map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code ?? null,
          description: c.description ?? null,
          isActive: c.isActive ?? true,
        })),
      });

      await tx.item.createMany({
        data: data.items.map((item) => ({
          id: item.id,
          sku: item.sku,
          name: item.name,
          description: item.description ?? null,
          baseUnit: item.baseUnit,
          type: item.type,
          meterType: item.meterType ?? null,
          categoryId: item.categoryId ?? null,
          minStockAlert: item.minStockAlert ?? 0,
          isPerishable: item.isPerishable ?? false,
          trackLot: item.trackLot ?? false,
          trackExpiration: item.trackExpiration ?? false,
          isActive: item.isActive ?? true,
        })),
      });

      await tx.itemAlias.createMany({
        data: data.itemAliases.map((a) => ({
          id: a.id,
          itemId: a.itemId,
          s10RawName: a.s10RawName,
          s10Code: a.s10Code ?? null,
          s10Unit: a.s10Unit ?? null,
          conversionFactor: a.conversionFactor ?? 1,
        })),
      });

      await tx.projectRequirement.createMany({
        data: data.projectRequirements.map((r) => ({
          id: r.id,
          projectId: r.projectId,
          itemId: r.itemId,
          requiredQty: r.requiredQty,
          allocatedQty: r.allocatedQty ?? 0,
          consumedQty: r.consumedQty ?? 0,
          s10UnitPrice: r.s10UnitPrice ?? null,
        })),
      });

      await tx.stock.createMany({
        data: data.stocks.map((st) => ({
          id: st.id,
          warehouseId: st.warehouseId,
          itemId: st.itemId,
          physicalQty: st.physicalQty,
          reservedQty: st.reservedQty ?? 0,
          loanedQty: st.loanedQty ?? 0,
          averageCost: st.averageCost,
        })),
      });

      // 3. Compras y detalles
      await tx.purchase.createMany({
        data: data.purchases.map((p) => ({
          id: p.id,
          supplierId: p.supplierId,
          warehouseId: p.warehouseId ?? null,
          invoiceSeries: p.invoiceSeries,
          voucherType: p.voucherType ?? 'FACTURA',
          hasIgv: p.hasIgv ?? true,
          currency: p.currency ?? Currency.PEN,
          exchangeRate: p.exchangeRate ?? 1,
          issueDate: new Date(p.issueDate),
          subtotalPEN: p.subtotalPEN,
          igvAmountPEN: p.igvAmountPEN ?? 0,
          totalAmountPEN: p.totalAmountPEN,
          notes: p.notes ?? null,
          isEdited: p.isEdited ?? false,
          isReverted: p.isReverted ?? false,
          revertedAt: toDateOrNull(p.revertedAt),
          revertedById: p.revertedById ?? null,
          reversalReason: p.reversalReason ?? null,
          reversalMovementId: p.reversalMovementId ?? null,
          replacedById: p.replacedById ?? null,
        })),
      });

      await tx.purchaseDetail.createMany({
        data: data.purchaseDetails.map((d) => ({
          id: d.id,
          purchaseId: d.purchaseId,
          itemId: d.itemId,
          purchaseUnit: d.purchaseUnit,
          conversionFactor: d.conversionFactor ?? 1,
          purchaseQty: d.purchaseQty,
          baseQty: d.baseQty,
          unitPriceOriginal: d.unitPriceOriginal,
          unitCostBasePEN: d.unitCostBasePEN,
          subtotalPEN: d.subtotalPEN,
          discountType: d.discountType ?? DiscountType.NONE,
          discountValue: d.discountValue ?? 0,
          discountAmountPEN: d.discountAmountPEN ?? 0,
          lotNumber: d.lotNumber ?? null,
          expirationDate: toDateOrNull(d.expirationDate),
          notes: d.notes ?? null,
        })),
      });

      // 4. Transferencias y detalle
      await tx.transfer.createMany({
        data: data.transfers.map((t) => ({
          id: t.id,
          transferNumber: t.transferNumber,
          originWarehouseId: t.originWarehouseId,
          destWarehouseId: t.destWarehouseId,
          projectId: t.projectId ?? null,
          status: t.status,
          dispatchedById: t.dispatchedById,
          receivedById: t.receivedById ?? null,
          dispatchedAt: toDateOrNull(t.dispatchedAt),
          receivedAt: toDateOrNull(t.receivedAt),
          dispatchNotes: t.dispatchNotes ?? null,
          receptionNotes: t.receptionNotes ?? null,
          cancelledAt: toDateOrNull(t.cancelledAt),
          cancelledById: t.cancelledById ?? null,
          cancellationReason: t.cancellationReason ?? null,
          replacedById: t.replacedById ?? null,
        })),
      });

      await tx.transferItem.createMany({
        data: data.transferItems.map((ti) => ({
          id: ti.id,
          transferId: ti.transferId,
          itemId: ti.itemId,
          dispatchedQty: ti.dispatchedQty,
          receivedQty: ti.receivedQty ?? null,
          discrepancyQty: ti.discrepancyQty ?? null,
          unitCostSnapshot: ti.unitCostSnapshot,
        })),
      });

      // 5. Movimientos de Kardex en dos pasos para respetar auto-referencia reversesMovementId
      await tx.movement.createMany({
        data: data.movements.map((m) => ({
          id: m.id,
          movementNumber: m.movementNumber,
          type: m.type,
          originWarehouseId: m.originWarehouseId ?? null,
          destWarehouseId: m.destWarehouseId ?? null,
          projectId: m.projectId ?? null,
          userId: m.userId,
          transferId: m.transferId ?? null,
          recipientName: m.recipientName ?? null,
          recipientDni: m.recipientDni ?? null,
          shrinkageReason: m.shrinkageReason ?? null,
          observation: m.observation ?? null,
          isReverted: m.isReverted ?? false,
          revertedAt: toDateOrNull(m.revertedAt),
          revertedById: m.revertedById ?? null,
          reversalReason: m.reversalReason ?? null,
          reversesMovementId: null,
          replacedById: m.replacedById ?? null,
          createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
        })),
      });

      for (const m of data.movements) {
        if (m.reversesMovementId) {
          await tx.movement.update({
            where: { id: m.id },
            data: { reversesMovementId: m.reversesMovementId },
          });
        }
      }

      await tx.movementItem.createMany({
        data: data.movementItems.map((mi) => ({
          id: mi.id,
          movementId: mi.movementId,
          itemId: mi.itemId,
          quantity: mi.quantity,
          unitCostSnapshot: mi.unitCostSnapshot,
          totalCostSnapshot: mi.totalCostSnapshot,
        })),
      });

      // 6. Custodia de herramientas, adjuntos, partes de maquinaria y secuencias
      await tx.toolCustody.createMany({
        data: data.toolCustodies.map((tc) => ({
          id: tc.id,
          custodyNumber: tc.custodyNumber,
          itemId: tc.itemId,
          warehouseId: tc.warehouseId,
          quantity: tc.quantity ?? 1,
          serialOrCode: tc.serialOrCode ?? null,
          assignedToName: tc.assignedToName,
          assignedToDni: tc.assignedToDni,
          dispatchedById: tc.dispatchedById,
          receivedById: tc.receivedById ?? null,
          dispatchDate: tc.dispatchDate ? new Date(tc.dispatchDate) : new Date(),
          expectedReturnDate: toDateOrNull(tc.expectedReturnDate),
          returnDate: toDateOrNull(tc.returnDate),
          conditionOnDispatch: tc.conditionOnDispatch ?? ToolCondition.OPERATIVE,
          conditionOnReturn: tc.conditionOnReturn ?? null,
          notes: tc.notes ?? null,
          returnNotes: tc.returnNotes ?? null,
          isReverted: tc.isReverted ?? false,
          revertedAt: toDateOrNull(tc.revertedAt),
          revertedById: tc.revertedById ?? null,
          reversalReason: tc.reversalReason ?? null,
          replacedById: tc.replacedById ?? null,
        })),
      });

      await tx.documentAttachment.createMany({
        data: data.documentAttachments.map((doc) => ({
          id: doc.id,
          purchaseId: doc.purchaseId ?? null,
          transferId: doc.transferId ?? null,
          movementId: doc.movementId ?? null,
          custodyId: doc.custodyId ?? null,
          proofType: doc.proofType ?? null,
          originalName: doc.originalName,
          storedPath: doc.storedPath,
          mimeType: doc.mimeType,
          fileSizeBytes: doc.fileSizeBytes,
          isConfidential: doc.isConfidential ?? false,
        })),
      });

      await tx.machineryShiftLog.createMany({
        data: data.machineryShiftLogs.map((log) => ({
          id: log.id,
          itemId: log.itemId,
          warehouseId: log.warehouseId,
          operatorName: log.operatorName,
          operatorDni: log.operatorDni,
          meterType: log.meterType ?? MeterType.HOUR_METER,
          startMeter: log.startMeter,
          endMeter: log.endMeter ?? null,
          totalUsage: log.totalUsage ?? null,
          startDateTime: log.startDateTime ? new Date(log.startDateTime) : new Date(),
          endDateTime: toDateOrNull(log.endDateTime),
          startPhotoId: log.startPhotoId ?? null,
          endPhotoId: log.endPhotoId ?? null,
          fuelPhotoId: log.fuelPhotoId ?? null,
          notes: log.notes ?? null,
          isReverted: log.isReverted ?? false,
          revertedAt: toDateOrNull(log.revertedAt),
          revertedById: log.revertedById ?? null,
          reversalReason: log.reversalReason ?? null,
        })),
      });

      await tx.documentSequence.createMany({
        data: data.documentSequences.map((seq) => ({
          id: seq.id,
          year: seq.year,
          prefix: seq.prefix,
          nextSeq: seq.nextSeq,
        })),
      });
    },
    { timeout: 30000 },
  );

  // Verificacion de conteos por tabla
  const counts = {
    User: await prisma.user.count(),
    UserWarehouse: await prisma.userWarehouse.count(),
    Warehouse: await prisma.warehouse.count(),
    Stock: await prisma.stock.count(),
    MeasurementUnit: await prisma.measurementUnit.count(),
    ItemCategory: await prisma.itemCategory.count(),
    Item: await prisma.item.count(),
    ItemAlias: await prisma.itemAlias.count(),
    Project: await prisma.project.count(),
    ProjectRequirement: await prisma.projectRequirement.count(),
    Supplier: await prisma.supplier.count(),
    Purchase: await prisma.purchase.count(),
    PurchaseDetail: await prisma.purchaseDetail.count(),
    Transfer: await prisma.transfer.count(),
    TransferItem: await prisma.transferItem.count(),
    Movement: await prisma.movement.count(),
    MovementItem: await prisma.movementItem.count(),
    ToolCustody: await prisma.toolCustody.count(),
    DocumentAttachment: await prisma.documentAttachment.count(),
    MachineryShiftLog: await prisma.machineryShiftLog.count(),
    DocumentSequence: await prisma.documentSequence.count(),
  };

  console.log('[Seed Test] Resumen de registros insertados por tabla:');
  console.table(counts);
  console.log('[Seed Test] Seed de pruebas completado con exito.');
}

main()
  .catch((e) => {
    console.error('[Seed Test] Error durante la ejecucion del seed de pruebas:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
