import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  Currency,
  MovementType,
  Prisma,
  WarehouseType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreatePurchaseDto } from './dto/create-purchase.dto.js';
import { PurchaseFilterDto } from './dto/purchase-filter.dto.js';

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  // Listar compras paginadas con filtros de proveedor, serie y fechas
  async findAll(filter: PurchaseFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseWhereInput = {};

    if (filter.supplierId) {
      where.supplierId = filter.supplierId;
    }

    if (filter.invoiceSeries) {
      where.invoiceSeries = {
        contains: filter.invoiceSeries.trim(),
        mode: 'insensitive',
      };
    }

    if (filter.startDate || filter.endDate) {
      where.issueDate = {};
      if (filter.startDate) {
        where.issueDate.gte = new Date(filter.startDate);
      }
      if (filter.endDate) {
        where.issueDate.lte = new Date(filter.endDate);
      }
    }

    const [total, data] = await Promise.all([
      this.prisma.purchase.count({ where }),
      this.prisma.purchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { issueDate: 'desc' },
        include: {
          supplier: {
            select: {
              id: true,
              taxId: true,
              businessName: true,
            },
          },
          _count: {
            select: {
              details: true,
              documents: true,
            },
          },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  // Obtener detalle completo de un comprobante de compra
  async findOne(id: string) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: {
        supplier: true,
        details: {
          include: {
            item: {
              select: {
                id: true,
                sku: true,
                name: true,
                baseUnit: true,
                type: true,
              },
            },
          },
        },
        documents: true,
      },
    });

    if (!purchase) {
      throw new NotFoundException('Comprobante de compra no encontrado');
    }

    return purchase;
  }

  // Registrar compra e ingreso a Almacen Central con recalculo atomico de CPP
  async create(dto: CreatePurchaseDto, userId: string) {
    // 1. Validar existencia del proveedor
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });
    if (!supplier) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    // 2. Validar que el almacen exista, este activo y sea Almacen Central
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.centralWarehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException('Almacen no encontrado');
    }
    if (!warehouse.isActive) {
      throw new BadRequestException(
        'El almacen especificado no se encuentra activo',
      );
    }
    if (warehouse.type !== WarehouseType.CENTRAL) {
      throw new BadRequestException(
        'Las compras a proveedores solo pueden ingresar directamente a un Almacen Central',
      );
    }

    // 3. Validar existencia de todos los items en catalogo maestro
    const itemIds = Array.from(new Set(dto.items.map((i) => i.itemId)));
    const existingItems = await this.prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, sku: true, name: true, baseUnit: true },
    });
    if (existingItems.length !== itemIds.length) {
      throw new BadRequestException(
        'Uno o mas items especificados no existen en el catalogo maestro',
      );
    }

    // 4. Ejecutar transaccion atomica
    return this.prisma.$transaction(async (tx) => {
      // Generar correlativo inmutable para el movimiento de inventario MOV-YYYY-NNNNN
      const currentYear = new Date().getFullYear();
      const prefix = `MOV-${currentYear}-`;
      const lastMovement = await tx.movement.findFirst({
        where: {
          movementNumber: { startsWith: prefix },
        },
        orderBy: { movementNumber: 'desc' },
        select: { movementNumber: true },
      });

      let nextSeq = 1;
      if (lastMovement) {
        const match = lastMovement.movementNumber.match(/MOV-\d{4}-(\d+)/);
        if (match) {
          nextSeq = parseInt(match[1], 10) + 1;
        }
      }
      const movementNumber = `${prefix}${String(nextSeq).padStart(5, '0')}`;

      // Crear encabezado de Purchase
      const purchase = await tx.purchase.create({
        data: {
          supplierId: dto.supplierId,
          invoiceSeries: dto.invoiceSeries.trim(),
          currency: dto.currency ?? Currency.PEN,
          exchangeRate: dto.exchangeRate ?? 1.0,
          issueDate: new Date(dto.issueDate),
          subtotalPEN: dto.subtotalPEN,
          igvAmountPEN: dto.igvAmountPEN ?? 0,
          totalAmountPEN: dto.totalAmountPEN,
        },
      });

      const processedDetails = [];
      const movementItemsData = [];

      for (const itemDto of dto.items) {
        const factor = Number(itemDto.conversionFactor ?? 1.0);
        const purchaseQty = Number(itemDto.purchaseQty);
        const baseQty = Number((purchaseQty * factor).toFixed(4));
        const rate = Number(dto.exchangeRate ?? 1.0);
        const unitPriceOrig = Number(itemDto.unitPriceOriginal);

        // Costo unitario neto por unidad base en Soles:
        // C_unitPEN = (unitPriceOriginal * exchangeRate) / conversionFactor
        const unitCostBasePEN = Number(
          ((unitPriceOrig * rate) / factor).toFixed(4),
        );
        const detailSubtotalPEN = Number((baseQty * unitCostBasePEN).toFixed(2));

        // Insertar PurchaseDetail
        const detail = await tx.purchaseDetail.create({
          data: {
            purchaseId: purchase.id,
            itemId: itemDto.itemId,
            purchaseUnit: itemDto.purchaseUnit.trim(),
            conversionFactor: factor,
            purchaseQty,
            baseQty,
            unitPriceOriginal: unitPriceOrig,
            unitCostBasePEN,
            subtotalPEN: detailSubtotalPEN,
          },
        });

        // Recuperar stock previo en Almacen Central
        const existingStock = await tx.stock.findUnique({
          where: {
            warehouseId_itemId: {
              warehouseId: dto.centralWarehouseId,
              itemId: itemDto.itemId,
            },
          },
        });

        const prevQty = existingStock ? Number(existingStock.physicalQty) : 0;
        const prevCPP = existingStock ? Number(existingStock.averageCost) : 0;

        // Formula de Costo Promedio Ponderado (CPP / WAC)
        // Si no habia stock fisico previo o era menor/igual a cero, nuevo CPP es unitCostBasePEN
        let newCPP: number;
        if (prevQty <= 0) {
          newCPP = unitCostBasePEN;
        } else {
          const prevTotalVal = prevQty * prevCPP;
          const incomingVal = baseQty * unitCostBasePEN;
          newCPP = Number(
            ((prevTotalVal + incomingVal) / (prevQty + baseQty)).toFixed(4),
          );
        }

        const newPhysicalQty = Number((prevQty + baseQty).toFixed(4));

        // Actualizar o crear registro de Stock en Almacen Central
        await tx.stock.upsert({
          where: {
            warehouseId_itemId: {
              warehouseId: dto.centralWarehouseId,
              itemId: itemDto.itemId,
            },
          },
          update: {
            physicalQty: newPhysicalQty,
            averageCost: newCPP,
          },
          create: {
            warehouseId: dto.centralWarehouseId,
            itemId: itemDto.itemId,
            physicalQty: newPhysicalQty,
            averageCost: newCPP,
          },
        });

        processedDetails.push({
          id: detail.id,
          itemId: itemDto.itemId,
          purchaseQty,
          baseQty,
          unitCostBasePEN,
          newWarehouseAverageCost: newCPP,
          newWarehousePhysicalQty: newPhysicalQty,
        });

        movementItemsData.push({
          itemId: itemDto.itemId,
          quantity: baseQty,
          unitCostSnapshot: unitCostBasePEN,
          totalCostSnapshot: detailSubtotalPEN,
        });
      }

      // Crear movimiento inmutable de Kardex tipo PURCHASE_ENTRY
      const movement = await tx.movement.create({
        data: {
          movementNumber,
          type: MovementType.PURCHASE_ENTRY,
          originWarehouseId: null,
          destWarehouseId: dto.centralWarehouseId,
          userId,
          observation: `Ingreso por compra segun factura ${dto.invoiceSeries.trim()}`,
          items: {
            create: movementItemsData,
          },
        },
      });

      return {
        id: purchase.id,
        invoiceSeries: purchase.invoiceSeries,
        currency: purchase.currency,
        exchangeRate: purchase.exchangeRate,
        issueDate: purchase.issueDate,
        subtotalPEN: purchase.subtotalPEN,
        igvAmountPEN: purchase.igvAmountPEN,
        totalAmountPEN: purchase.totalAmountPEN,
        movementId: movement.id,
        movementNumber: movement.movementNumber,
        details: processedDetails,
      };
    });
  }
}
