import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  Currency,
  MovementType,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SequenceGeneratorService } from '../../common/services/sequence-generator.service.js';
import { CreatePurchaseDto } from './dto/create-purchase.dto.js';
import { PurchaseFilterDto } from './dto/purchase-filter.dto.js';
import { PriceComparisonQueryDto } from './dto/price-comparison-query.dto.js';
import { ValuatePurchaseDto } from './dto/valuate-purchase.dto.js';

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceGenerator: SequenceGeneratorService,
  ) {}

  // Helper para obtener almacenes autorizados para un usuario
  private async getAllowedWarehouseIds(userId: string): Promise<string[]> {
    const userWarehouses = await this.prisma.userWarehouse.findMany({
      where: { userId },
      select: { warehouseId: true },
    });
    return userWarehouses.map((uw) => uw.warehouseId);
  }

  // Listar compras paginadas con filtros de proveedor, serie, fechas, almacen y producto
  async findAll(
    filter: PurchaseFilterDto,
    user?: { id: string; role: Role },
  ) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseWhereInput = {};

    // Segregacion por rol: almacenero solo ve compras donde interviene su caseta asignada
    if (user?.role === Role.WAREHOUSE_KEEPER) {
      const allowedIds = await this.getAllowedWarehouseIds(user.id);
      if (filter.warehouseId && filter.warehouseId !== 'ALL') {
        if (!allowedIds.includes(filter.warehouseId)) {
          throw new ForbiddenException(
            'No tiene permisos para consultar compras de este almacen',
          );
        }
        where.warehouseId = filter.warehouseId;
      } else {
        where.warehouseId = { in: allowedIds };
      }
    } else if (filter.warehouseId && filter.warehouseId !== 'ALL') {
      where.warehouseId = filter.warehouseId;
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

    // Filtros por insumo (itemId o busqueda por SKU / nombre del item)
    if (filter.itemId || filter.itemSearch) {
      const detailConditions: Prisma.PurchaseDetailWhereInput = {};

      if (filter.itemId) {
        detailConditions.itemId = filter.itemId;
      }

      if (filter.itemSearch) {
        const term = filter.itemSearch.trim();
        detailConditions.item = {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { sku: { contains: term, mode: 'insensitive' } },
          ],
        };
      }

      where.details = {
        some: detailConditions,
      };
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
          warehouse: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
          details: {
            include: {
              item: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  baseUnit: true,
                },
              },
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
  async findOne(id: string, user?: { id: string; role: Role }) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: {
        supplier: true,
        warehouse: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
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

    if (user?.role === Role.WAREHOUSE_KEEPER) {
      const allowedIds = await this.getAllowedWarehouseIds(user.id);
      if (!purchase.warehouseId || !allowedIds.includes(purchase.warehouseId)) {
        throw new ForbiddenException(
          'No tiene permisos para consultar este comprobante de compra',
        );
      }
    }

    return purchase;
  }

  // Registrar compra e ingreso a Almacen (Central o de Obra) con recalculo atomico de CPP
  async create(
    dto: CreatePurchaseDto,
    user: { id: string; role: Role } | string,
  ) {
    const userId = typeof user === 'string' ? user : user.id;
    const userRole = typeof user === 'string' ? Role.ADMIN : user.role;

    // 1. Validar existencia del proveedor
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });
    if (!supplier) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    // 2. Resolver almacen de destino (warehouseId o centralWarehouseId)
    const targetWarehouseId = dto.warehouseId ?? dto.centralWarehouseId;
    if (!targetWarehouseId) {
      throw new BadRequestException(
        'Debe especificar el almacen de destino de la compra (warehouseId o centralWarehouseId)',
      );
    }

    // Segregacion por rol: almacenero solo puede ingresar compras en sus almacenes asignados
    if (userRole === Role.WAREHOUSE_KEEPER) {
      const allowedIds = await this.getAllowedWarehouseIds(userId);
      if (!allowedIds.includes(targetWarehouseId)) {
        throw new ForbiddenException(
          'No tiene permisos para ingresar compras en este almacen',
        );
      }
    }

    // Validar que el almacen exista y este activo (puede ser CENTRAL o PROJECT_SITE)
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: targetWarehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException('Almacen no encontrado');
    }
    if (!warehouse.isActive) {
      throw new BadRequestException(
        'El almacen especificado no se encuentra activo',
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

    // 4. Validar coherencia contable segun tipo de compra (con o sin IGV)
    const hasIgv = dto.hasIgv !== false;
    let igvAmount = Number(dto.igvAmountPEN ?? 0);
    const subtotal = Number(dto.subtotalPEN);
    const total = Number(dto.totalAmountPEN);

    if (!hasIgv) {
      if (igvAmount > 0) {
        throw new BadRequestException(
          'En compras exoneradas o sin IGV, el monto de IGV debe ser 0',
        );
      }
      if (Math.abs(total - subtotal) > 0.05) {
        throw new BadRequestException(
          'En compras exoneradas o sin IGV, el monto total debe ser igual al subtotal',
        );
      }
      igvAmount = 0;
    } else {
      if (igvAmount === 0 && total > subtotal) {
        igvAmount = Number((total - subtotal).toFixed(2));
      }
      if (Math.abs(total - (subtotal + igvAmount)) > 0.05) {
        throw new BadRequestException(
          'El monto total debe ser igual a la suma del subtotal y el IGV',
        );
      }
    }

    // 5. Ejecutar transaccion atomica
    return this.prisma.$transaction(async (tx) => {
      // Generar correlativo inmutable para el movimiento de inventario MOV-YYYY-NNNNN
      const movementNumber = await this.sequenceGenerator.getNextCode(
        tx,
        'MOV',
      );

      // Crear encabezado de Purchase con warehouseId y notes
      const purchase = await tx.purchase.create({
        data: {
          supplierId: dto.supplierId,
          warehouseId: targetWarehouseId,
          invoiceSeries: dto.invoiceSeries.trim(),
          voucherType: dto.voucherType?.trim() || 'FACTURA',
          hasIgv,
          currency: dto.currency ?? Currency.PEN,
          exchangeRate: dto.exchangeRate ?? 1.0,
          issueDate: new Date(dto.issueDate),
          subtotalPEN: dto.subtotalPEN,
          igvAmountPEN: hasIgv ? igvAmount : 0,
          totalAmountPEN: dto.totalAmountPEN,
          notes: dto.notes ? dto.notes.trim() : null,
        },
        include: {
          warehouse: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
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

        // Insertar PurchaseDetail con notes
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
            notes: itemDto.notes ? itemDto.notes.trim() : null,
          },
        });

        // Recuperar stock previo en el almacen de destino de la compra
        const existingStock = await tx.stock.findUnique({
          where: {
            warehouseId_itemId: {
              warehouseId: targetWarehouseId,
              itemId: itemDto.itemId,
            },
          },
        });

        const prevQty = existingStock ? Number(existingStock.physicalQty) : 0;
        const prevCPP = existingStock ? Number(existingStock.averageCost) : 0;

        // Formula de Costo Promedio Ponderado (CPP / WAC)
        // Si ingresa sin valorizar (unitCostBasePEN <= 0 ej. Guia de Remision a costo 0), se preserva el CPP previo
        let newCPP: number;
        if (unitCostBasePEN <= 0) {
          newCPP = prevCPP > 0 ? prevCPP : 0;
        } else if (prevQty <= 0 || prevCPP <= 0) {
          newCPP = unitCostBasePEN;
        } else {
          const prevTotalVal = prevQty * prevCPP;
          const incomingVal = baseQty * unitCostBasePEN;
          newCPP = Number(
            ((prevTotalVal + incomingVal) / (prevQty + baseQty)).toFixed(4),
          );
        }

        const newPhysicalQty = Number((prevQty + baseQty).toFixed(4));

        // Actualizar o crear registro de Stock en el almacen de destino
        await tx.stock.upsert({
          where: {
            warehouseId_itemId: {
              warehouseId: targetWarehouseId,
              itemId: itemDto.itemId,
            },
          },
          update: {
            physicalQty: newPhysicalQty,
            averageCost: newCPP,
          },
          create: {
            warehouseId: targetWarehouseId,
            itemId: itemDto.itemId,
            physicalQty: newPhysicalQty,
            averageCost: newCPP,
          },
        });

        const detailEntry: Record<string, unknown> = {
          id: detail.id,
          itemId: itemDto.itemId,
          purchaseQty,
          baseQty,
          unitCostBasePEN,
          newWarehousePhysicalQty: newPhysicalQty,
          notes: detail.notes,
        };
        if (userRole !== Role.WAREHOUSE_KEEPER) {
          detailEntry.newWarehouseAverageCost = newCPP;
        }
        processedDetails.push(detailEntry);

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
          destWarehouseId: targetWarehouseId,
          userId,
          observation: `Ingreso por compra segun ${purchase.voucherType} ${dto.invoiceSeries.trim()}${
            dto.notes ? ` - ${dto.notes.trim()}` : ''
          }`,
          items: {
            create: movementItemsData,
          },
        },
      });

      return {
        id: purchase.id,
        supplierId: purchase.supplierId,
        warehouseId: purchase.warehouseId,
        warehouse: purchase.warehouse,
        invoiceSeries: purchase.invoiceSeries,
        voucherType: purchase.voucherType,
        hasIgv: purchase.hasIgv,
        currency: purchase.currency,
        exchangeRate: purchase.exchangeRate,
        issueDate: purchase.issueDate,
        subtotalPEN: purchase.subtotalPEN,
        igvAmountPEN: purchase.igvAmountPEN,
        totalAmountPEN: purchase.totalAmountPEN,
        notes: purchase.notes,
        movementId: movement.id,
        movementNumber: movement.movementNumber,
        details: processedDetails,
      };
    });
  }

  // Cuadro comparativo de precios historicos por insumo
  async getPriceComparison(query: PriceComparisonQueryDto) {
    if (!query.itemId && !query.search) {
      throw new BadRequestException(
        'Debe proporcionar un itemId o un termino de busqueda search para el cuadro comparativo',
      );
    }

    // 1. Resolver el insumo consultado
    let item;
    if (query.itemId) {
      item = await this.prisma.item.findUnique({
        where: { id: query.itemId },
        include: {
          category: {
            select: { id: true, name: true, code: true },
          },
        },
      });
    } else if (query.search) {
      const term = query.search.trim();
      item = await this.prisma.item.findFirst({
        where: {
          OR: [
            { sku: { equals: term, mode: 'insensitive' } },
            { name: { contains: term, mode: 'insensitive' } },
            { sku: { contains: term, mode: 'insensitive' } },
          ],
        },
        include: {
          category: {
            select: { id: true, name: true, code: true },
          },
        },
      });
    }

    if (!item) {
      throw new NotFoundException('Insumo no encontrado en el catalogo maestro');
    }

    // 2. Obtener costo promedio ponderado vigente en stock
    const stockWhere: Prisma.StockWhereInput = { itemId: item.id };
    if (query.warehouseId && query.warehouseId !== 'ALL') {
      stockWhere.warehouseId = query.warehouseId;
    }

    const stocks = await this.prisma.stock.findMany({
      where: stockWhere,
      include: {
        warehouse: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    let currentWeightedAverageCostPEN: number | null = null;
    const totalPhysical = stocks.reduce(
      (acc, s) => acc + Number(s.physicalQty),
      0,
    );
    if (totalPhysical > 0) {
      const totalVal = stocks.reduce(
        (acc, s) => acc + Number(s.physicalQty) * Number(s.averageCost),
        0,
      );
      currentWeightedAverageCostPEN = Number(
        (totalVal / totalPhysical).toFixed(4),
      );
    } else if (stocks.length > 0) {
      currentWeightedAverageCostPEN = Number(stocks[0].averageCost);
    }

    // 3. Consultar historico de compras para este insumo
    const detailWhere: Prisma.PurchaseDetailWhereInput = {
      itemId: item.id,
    };
    if (query.warehouseId && query.warehouseId !== 'ALL') {
      detailWhere.purchase = {
        warehouseId: query.warehouseId,
      };
    }

    const purchaseDetails = await this.prisma.purchaseDetail.findMany({
      where: detailWhere,
      orderBy: [
        { unitCostBasePEN: 'asc' },
        { purchase: { issueDate: 'desc' } },
      ],
      include: {
        purchase: {
          include: {
            supplier: true,
            warehouse: {
              select: { id: true, name: true, type: true },
            },
          },
        },
      },
    });

    const entries = purchaseDetails.map((pd) => {
      const p = pd.purchase;
      return {
        purchaseDetailId: pd.id,
        purchaseId: p.id,
        issueDate: p.issueDate,
        invoiceSeries: p.invoiceSeries,
        voucherType: p.voucherType,
        hasIgv: p.hasIgv,
        supplierId: p.supplierId,
        supplierName: p.supplier.businessName,
        supplierTaxId: p.supplier.taxId,
        warehouseId: p.warehouseId,
        warehouseName: p.warehouse?.name ?? 'No asignado',
        warehouseType: p.warehouse?.type ?? null,
        purchaseQty: Number(pd.purchaseQty),
        purchaseUnit: pd.purchaseUnit,
        conversionFactor: Number(pd.conversionFactor),
        baseQty: Number(pd.baseQty),
        unitPriceOriginal: Number(pd.unitPriceOriginal),
        currency: p.currency,
        exchangeRate: Number(p.exchangeRate),
        unitCostBasePEN: Number(pd.unitCostBasePEN),
        subtotalPEN: Number(pd.subtotalPEN),
        notes: pd.notes || p.notes || null,
      };
    });

    // 4. Calcular metricas estadisticas de comparacion (solo sobre entradas valorizadas)
    const valuedEntries = entries.filter((e) => e.unitCostBasePEN > 0);
    const totalPurchasesCount = entries.length;
    let minUnitCostPEN: number | null = null;
    let maxUnitCostPEN: number | null = null;
    let bestSupplierName: string | null = null;
    let bestSupplierTaxId: string | null = null;

    if (valuedEntries.length > 0) {
      minUnitCostPEN = valuedEntries[0].unitCostBasePEN;
      maxUnitCostPEN = valuedEntries.reduce(
        (max, curr) => (curr.unitCostBasePEN > max ? curr.unitCostBasePEN : max),
        valuedEntries[0].unitCostBasePEN,
      );
      bestSupplierName = valuedEntries[0].supplierName;
      bestSupplierTaxId = valuedEntries[0].supplierTaxId;
    }

    return {
      item: {
        id: item.id,
        sku: item.sku,
        name: item.name,
        baseUnit: item.baseUnit,
        type: item.type,
        isPerishable: item.isPerishable,
        category: item.category,
      },
      summary: {
        totalPurchasesCount,
        minUnitCostPEN,
        maxUnitCostPEN,
        currentWeightedAverageCostPEN,
        bestSupplierName,
        bestSupplierTaxId,
      },
      entries,
    };
  }

  // Valorizar formalmente una compra ingresada a costo cero / guia de remision y recalcular CPP
  async valuatePurchase(id: string, dto: ValuatePurchaseDto) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: {
        details: true,
        warehouse: true,
      },
    });

    if (!purchase) {
      throw new NotFoundException('Comprobante de compra no encontrado');
    }

    const hasUnvaluedDetail = purchase.details.some(
      (d) => Number(d.unitPriceOriginal) === 0 || Number(d.subtotalPEN) === 0,
    );
    const isUnvaluedHeader = Number(purchase.totalAmountPEN) === 0;

    if (!hasUnvaluedDetail && !isUnvaluedHeader) {
      throw new BadRequestException(
        'El comprobante ya se encuentra completamente valorizado',
      );
    }

    const detailMap = new Map(purchase.details.map((d) => [d.id, d]));
    for (const itemDto of dto.items) {
      if (!detailMap.has(itemDto.detailId)) {
        throw new BadRequestException(
          `El detalle con ID ${itemDto.detailId} no pertenece a esta compra`,
        );
      }
    }

    const hasIgv = dto.hasIgv !== undefined ? dto.hasIgv : purchase.hasIgv;
    let igvAmount = Number(dto.igvAmountPEN ?? 0);
    const subtotal = Number(dto.subtotalPEN);
    const total = Number(dto.totalAmountPEN);

    if (!hasIgv) {
      if (igvAmount > 0) {
        throw new BadRequestException(
          'En compras exoneradas o sin IGV, el monto de IGV debe ser 0',
        );
      }
      if (Math.abs(total - subtotal) > 0.05) {
        throw new BadRequestException(
          'En compras exoneradas o sin IGV, el monto total debe ser igual al subtotal',
        );
      }
      igvAmount = 0;
    } else {
      if (igvAmount === 0 && total > subtotal) {
        igvAmount = Number((total - subtotal).toFixed(2));
      }
      if (Math.abs(total - (subtotal + igvAmount)) > 0.05) {
        throw new BadRequestException(
          'El monto total debe ser igual a la suma del subtotal y el IGV',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id },
        data: {
          invoiceSeries: dto.invoiceSeries?.trim() || purchase.invoiceSeries,
          voucherType: dto.voucherType?.trim() || purchase.voucherType,
          currency: dto.currency ?? purchase.currency,
          exchangeRate: dto.exchangeRate ?? purchase.exchangeRate,
          hasIgv,
          subtotalPEN: dto.subtotalPEN,
          igvAmountPEN: hasIgv ? igvAmount : 0,
          totalAmountPEN: dto.totalAmountPEN,
          notes:
            dto.notes !== undefined
              ? dto.notes
                ? dto.notes.trim()
                : null
              : purchase.notes,
        },
      });

      const exchangeRate = Number(dto.exchangeRate ?? purchase.exchangeRate);
      const targetWarehouseId = purchase.warehouseId;

      for (const itemDto of dto.items) {
        const existingDetail = detailMap.get(itemDto.detailId)!;
        const factor = Number(existingDetail.conversionFactor);
        const baseQty = Number(existingDetail.baseQty);
        const newUnitPriceOrig = Number(itemDto.unitPriceOriginal);
        const newUnitCostBasePEN = Number(
          ((newUnitPriceOrig * exchangeRate) / factor).toFixed(4),
        );
        const newDetailSubtotalPEN = Number(
          (baseQty * newUnitCostBasePEN).toFixed(2),
        );

        await tx.purchaseDetail.update({
          where: { id: itemDto.detailId },
          data: {
            unitPriceOriginal: newUnitPriceOrig,
            unitCostBasePEN: newUnitCostBasePEN,
            subtotalPEN: newDetailSubtotalPEN,
            notes:
              itemDto.notes !== undefined
                ? itemDto.notes
                  ? itemDto.notes.trim()
                  : null
                : existingDetail.notes,
          },
        });

        if (targetWarehouseId) {
          const stock = await tx.stock.findUnique({
            where: {
              warehouseId_itemId: {
                warehouseId: targetWarehouseId,
                itemId: existingDetail.itemId,
              },
            },
          });

          if (stock) {
            const currentQty = Number(stock.physicalQty);
            const currentCPP = Number(stock.averageCost);
            let newCPP: number;
            if (currentQty <= 0 || currentCPP <= 0 || currentQty <= baseQty) {
              newCPP = newUnitCostBasePEN;
            } else {
              const priorQty = currentQty - baseQty;
              newCPP = Number(
                (
                  (priorQty * currentCPP + baseQty * newUnitCostBasePEN) /
                  currentQty
                ).toFixed(4),
              );
            }

            await tx.stock.update({
              where: { id: stock.id },
              data: { averageCost: newCPP },
            });
          }
        }
      }

      return tx.purchase.findUnique({
        where: { id },
        include: {
          supplier: true,
          warehouse: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
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
    });
  }
}
