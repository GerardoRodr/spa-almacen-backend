import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  Currency,
  DiscountType,
  ItemType,
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
import { RevertPurchaseDto } from './dto/revert-purchase.dto.js';
import { UpdatePurchaseMetadataDto } from './dto/update-purchase-metadata.dto.js';
import { ReplacePurchaseDto } from './dto/replace-purchase.dto.js';

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceGenerator: SequenceGeneratorService,
  ) {}

  // Helper matematico unico para calcular descuentos, costo unitario neto en PEN y subtotal de linea
  private computePurchaseLineFinancials(input: {
    purchaseQty: number;
    conversionFactor: number;
    unitPriceOriginal: number;
    exchangeRate: number;
    discountType?: DiscountType;
    discountValue?: number;
  }) {
    const purchaseQty = Number(input.purchaseQty);
    const factor = Number(input.conversionFactor ?? 1.0);
    const unitPriceOrig = Number(input.unitPriceOriginal);
    const rate = Number(input.exchangeRate ?? 1.0);
    const discountType = input.discountType ?? DiscountType.NONE;
    const rawDiscountVal = Number(input.discountValue ?? 0);

    if (rawDiscountVal < 0) {
      throw new BadRequestException('El valor del descuento no puede ser negativo');
    }

    const grossLineOriginal = purchaseQty * unitPriceOrig;
    let effectiveDiscountVal = 0;
    let discountAmountOriginal = 0;

    if (discountType === DiscountType.PERCENTAGE) {
      if (rawDiscountVal > 100) {
        throw new BadRequestException(
          'El porcentaje de descuento no puede superar el 100%',
        );
      }
      effectiveDiscountVal = rawDiscountVal;
      discountAmountOriginal = grossLineOriginal * (rawDiscountVal / 100);
    } else if (discountType === DiscountType.FIXED) {
      if (rawDiscountVal > grossLineOriginal + 0.0001) {
        throw new BadRequestException(
          'El descuento fijo no puede superar el importe bruto de la linea',
        );
      }
      effectiveDiscountVal = rawDiscountVal;
      discountAmountOriginal = Math.min(rawDiscountVal, grossLineOriginal);
    }

    const netLineOriginal = Math.max(0, grossLineOriginal - discountAmountOriginal);
    const baseQty = Number((purchaseQty * factor).toFixed(4));
    const discountAmountPEN = Number((discountAmountOriginal * rate).toFixed(2));
    const unitCostBasePEN =
      baseQty > 0 ? Number(((netLineOriginal * rate) / baseQty).toFixed(4)) : 0;
    const subtotalPEN = Number((netLineOriginal * rate).toFixed(2));

    return {
      factor,
      purchaseQty,
      baseQty,
      unitPriceOrig,
      discountType,
      discountValue: effectiveDiscountVal,
      discountAmountPEN,
      unitCostBasePEN,
      subtotalPEN,
    };
  }

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
    // Ignorar monto aproximado para almaceneros para preservar ceguera financiera
    const approximateAmount =
      user?.role !== Role.WAREHOUSE_KEEPER &&
      filter.approximateAmount !== undefined &&
      filter.approximateAmount !== null &&
      !Number.isNaN(Number(filter.approximateAmount))
        ? Number(filter.approximateAmount)
        : undefined;

    const page = Math.max(1, Number(filter.page) || 1);
    const rawLimit = Math.max(1, Number(filter.limit) || 20);
    const limit =
      approximateAmount !== undefined ? Math.max(rawLimit, 10) : rawLimit;
    const skip = (page - 1) * limit;

    const purchaseInclude = {
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
      revertedBy: {
        select: {
          id: true,
          fullName: true,
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
      _count: {
        select: {
          details: true,
          documents: true,
        },
      },
    } as const;

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

    const baseWarehouseWhere: Prisma.PurchaseWhereInput =
      where.warehouseId !== undefined ? { warehouseId: where.warehouseId } : {};

    if (filter.invoiceSeries) {
      where.invoiceSeries = {
        contains: filter.invoiceSeries.trim(),
        mode: 'insensitive',
      };
    }

    if (filter.supplierId && filter.supplierId !== 'ALL') {
      where.supplierId = filter.supplierId;
    }

    if (filter.startDate || filter.endDate) {
      where.issueDate = {};
      if (filter.startDate) {
        const s = filter.startDate.trim();
        where.issueDate.gte = /^\d{4}-\d{2}-\d{2}$/.test(s)
          ? new Date(`${s}T00:00:00.000Z`)
          : new Date(s);
      }
      if (filter.endDate) {
        const e = filter.endDate.trim();
        where.issueDate.lte = /^\d{4}-\d{2}-\d{2}$/.test(e)
          ? new Date(`${e}T23:59:59.999Z`)
          : new Date(e);
      }
    }

    if (filter.voidFilter === 'ACTIVE_ONLY') {
      where.isReverted = false;
    } else if (filter.voidFilter === 'VOIDED_ONLY') {
      where.isReverted = true;
    } else if (filter.voidFilter === 'ALL') {
      // Incluir activas y anuladas sin filtro de isReverted
    } else if (filter.includeReverted === false) {
      where.isReverted = false;
    }

    if (filter.onlyEdited === true) {
      where.isEdited = true;
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

    const summaryWhere: Prisma.PurchaseWhereInput = {
      ...where,
      isReverted: false,
    };

    const globalCountWhere: Prisma.PurchaseWhereInput = { ...baseWarehouseWhere };
    if (filter.voidFilter === 'ACTIVE_ONLY') {
      globalCountWhere.isReverted = false;
    } else if (filter.voidFilter === 'VOIDED_ONLY') {
      globalCountWhere.isReverted = true;
    } else if (filter.voidFilter !== 'ALL' && filter.includeReverted === false) {
      globalCountWhere.isReverted = false;
    }

    const globalAggregateWhere: Prisma.PurchaseWhereInput = {
      ...baseWarehouseWhere,
      isReverted: false,
    };

    const hasSearchFilters = Boolean(
      filter.invoiceSeries?.trim() ||
        (filter.supplierId && filter.supplierId !== 'ALL') ||
        filter.startDate ||
        filter.endDate ||
        filter.onlyEdited === true ||
        filter.itemId ||
        filter.itemSearch?.trim(),
    );

    const [total, rawData, aggregateResult, globalTotal, globalAggregateResult] =
      await Promise.all([
        this.prisma.purchase.count({ where }),
        approximateAmount !== undefined
          ? // shortcut: ordenamiento por proximidad en memoria sobre candidatos de sede, migrar a SQL ORDER BY ABS si supera decenas de miles de compras
            this.prisma.purchase.findMany({
              where,
              select: {
                id: true,
                totalAmountPEN: true,
                issueDate: true,
              },
            })
          : this.prisma.purchase.findMany({
              where,
              skip,
              take: limit,
              orderBy: { issueDate: 'desc' },
              include: purchaseInclude,
            }),
        filter.voidFilter === 'VOIDED_ONLY'
          ? Promise.resolve(null)
          : this.prisma.purchase.aggregate
            ? this.prisma.purchase.aggregate({
                where: summaryWhere,
                _sum: {
                  subtotalPEN: true,
                  igvAmountPEN: true,
                  totalAmountPEN: true,
                },
              })
            : Promise.resolve(null),
        hasSearchFilters
          ? this.prisma.purchase.count({ where: globalCountWhere })
          : Promise.resolve(null),
        hasSearchFilters &&
        filter.voidFilter !== 'VOIDED_ONLY' &&
        this.prisma.purchase.aggregate
          ? this.prisma.purchase.aggregate({
              where: globalAggregateWhere,
              _sum: {
                subtotalPEN: true,
                igvAmountPEN: true,
                totalAmountPEN: true,
              },
            })
          : Promise.resolve(null),
      ]);

    let data: Array<
      Prisma.PurchaseGetPayload<{ include: typeof purchaseInclude }>
    >;

    if (approximateAmount !== undefined) {
      const candidates = rawData as Array<{
        id: string;
        totalAmountPEN: Prisma.Decimal | number | string;
        issueDate: Date;
      }>;
      const sortedCandidates = [...candidates].sort((a, b) => {
        const diff =
          Math.abs(Number(a.totalAmountPEN) - approximateAmount) -
          Math.abs(Number(b.totalAmountPEN) - approximateAmount);
        if (diff !== 0) {
          return diff;
        }
        return new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime();
      });

      const pageIds = sortedCandidates
        .slice(skip, skip + limit)
        .map((c) => c.id);

      if (pageIds.length === 0) {
        data = [];
      } else {
        const pageRows = await this.prisma.purchase.findMany({
          where: { id: { in: pageIds } },
          include: purchaseInclude,
        });
        const rowById = new Map(pageRows.map((row) => [row.id, row]));
        data = pageIds
          .map((id) => rowById.get(id))
          .filter((row): row is (typeof pageRows)[number] => row !== undefined);
      }
    } else {
      data = rawData as Array<
        Prisma.PurchaseGetPayload<{ include: typeof purchaseInclude }>
      >;
    }

    const summary = {
      totalCount: total,
      totalSubtotalPEN: Number(aggregateResult?._sum?.subtotalPEN ?? 0),
      totalIgvPEN: Number(aggregateResult?._sum?.igvAmountPEN ?? 0),
      totalAmountPEN: Number(aggregateResult?._sum?.totalAmountPEN ?? 0),
    };

    const globalSummary = hasSearchFilters
      ? {
          totalCount: globalTotal ?? total,
          totalSubtotalPEN: Number(
            globalAggregateResult?._sum?.subtotalPEN ?? 0,
          ),
          totalIgvPEN: Number(globalAggregateResult?._sum?.igvAmountPEN ?? 0),
          totalAmountPEN: Number(
            globalAggregateResult?._sum?.totalAmountPEN ?? 0,
          ),
        }
      : summary;

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      summary,
      globalSummary,
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
        revertedBy: {
          select: {
            id: true,
            fullName: true,
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

  // Validar datos y autorizaciones de una nueva compra antes de iniciar transaccion
  private async validateCreatePayload(
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

    // 3. Validar moneda, tipo de cambio y existencia de todos los items activos
    const currency = dto.currency ?? Currency.PEN;
    if (currency === Currency.USD) {
      if (
        dto.exchangeRate === undefined ||
        dto.exchangeRate === null ||
        Number(dto.exchangeRate) <= 0
      ) {
        throw new BadRequestException(
          'Para compras en dolares (USD) el tipo de cambio debe ser mayor a cero',
        );
      }
    }
    const resolvedExchangeRate =
      currency === Currency.PEN ? Number(dto.exchangeRate ?? 1.0) : Number(dto.exchangeRate);

    const itemIds = Array.from(new Set(dto.items.map((i) => i.itemId)));
    const existingItems = await this.prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: {
        id: true,
        sku: true,
        name: true,
        baseUnit: true,
        type: true,
        isActive: true,
      },
    });
    if (existingItems.length !== itemIds.length) {
      throw new BadRequestException(
        'Uno o mas items especificados no existen en el catalogo maestro',
      );
    }
    const inactiveItem = existingItems.find((i) => i.isActive === false);
    if (inactiveItem) {
      throw new BadRequestException(
        `El insumo "${inactiveItem.name}" (${inactiveItem.sku}) se encuentra inactivo en el catalogo`,
      );
    }
    const itemMap = new Map(existingItems.map((i) => [i.id, i]));

    // Validar reglas de descuento por linea antes de abrir transaccion
    for (const itemDto of dto.items) {
      this.computePurchaseLineFinancials({
        purchaseQty: itemDto.purchaseQty,
        conversionFactor: itemDto.conversionFactor ?? 1.0,
        unitPriceOriginal: itemDto.unitPriceOriginal,
        exchangeRate: resolvedExchangeRate,
        discountType: itemDto.discountType,
        discountValue: itemDto.discountValue,
      });
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

    return {
      userId,
      userRole,
      targetWarehouseId,
      hasIgv,
      igvAmount,
      exchangeRate: resolvedExchangeRate,
      itemMap,
    };
  }

  // Construir etiqueta segura de comprobante para observaciones de Kardex
  private buildVoucherLabel(
    voucherType: string,
    invoiceSeries: string | null | undefined,
  ): string {
    const cleanSeries = invoiceSeries?.trim();
    return cleanSeries
      ? `${voucherType} ${cleanSeries}`
      : `${voucherType} (Sin serie)`;
  }

  // Localizar movimiento PURCHASE_ENTRY asociado a una compra (con soporte para serie nula)
  private async findAssociatedPurchaseEntryMovement(
    tx: Prisma.TransactionClient,
    purchase: {
      voucherType: string;
      invoiceSeries: string | null;
      createdAt?: Date | null;
    },
    warehouseId: string,
  ): Promise<{ id: string } | null> {
    if (!tx.movement?.findFirst) {
      return null;
    }

    const voucherLabel = this.buildVoucherLabel(
      purchase.voucherType,
      purchase.invoiceSeries,
    );
    const createdWindow = purchase.createdAt
      ? {
          gte: new Date(purchase.createdAt.getTime() - 5000),
          lte: new Date(purchase.createdAt.getTime() + 5000),
        }
      : undefined;

    let movement = await tx.movement.findFirst({
      where: {
        type: MovementType.PURCHASE_ENTRY,
        destWarehouseId: warehouseId,
        isReverted: false,
        observation: {
          startsWith: `Ingreso por compra segun ${voucherLabel}`,
        },
        ...(!purchase.invoiceSeries && createdWindow
          ? { createdAt: createdWindow }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!movement && createdWindow) {
      movement = await tx.movement.findFirst({
        where: {
          type: MovementType.PURCHASE_ENTRY,
          destWarehouseId: warehouseId,
          isReverted: false,
          createdAt: createdWindow,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
    }

    return movement;
  }

  // Persistir compra y recalcular CPP dentro de una transaccion activa
  private async createInTransaction(
    tx: Prisma.TransactionClient,
    dto: CreatePurchaseDto,
    params: {
      userId: string;
      userRole: Role;
      targetWarehouseId: string;
      hasIgv: boolean;
      igvAmount: number;
      exchangeRate: number;
      itemMap: Map<string, { id: string; sku: string; name: string; baseUnit: string; type?: ItemType }>;
      isEdited?: boolean;
    },
  ) {
    const {
      userId,
      userRole,
      targetWarehouseId,
      hasIgv,
      igvAmount,
      exchangeRate,
      itemMap,
      isEdited = false,
    } = params;

    const normalizedInvoiceSeries = dto.invoiceSeries?.trim() || null;

    // Crear encabezado de Purchase con warehouseId y notes
    const purchase = await tx.purchase.create({
      data: {
        supplierId: dto.supplierId,
        warehouseId: targetWarehouseId,
        invoiceSeries: normalizedInvoiceSeries,
        voucherType: dto.voucherType?.trim() || 'FACTURA',
        hasIgv,
        currency: dto.currency ?? Currency.PEN,
        exchangeRate,
        issueDate: new Date(dto.issueDate),
        subtotalPEN: dto.subtotalPEN,
        igvAmountPEN: hasIgv ? igvAmount : 0,
        totalAmountPEN: dto.totalAmountPEN,
        notes: dto.notes ? dto.notes.trim() : null,
        isEdited,
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
      const masterItem = itemMap.get(itemDto.itemId);
      const isService = masterItem?.type === ItemType.SERVICE;

      const calc = this.computePurchaseLineFinancials({
        purchaseQty: itemDto.purchaseQty,
        conversionFactor: itemDto.conversionFactor ?? 1.0,
        unitPriceOriginal: itemDto.unitPriceOriginal,
        exchangeRate,
        discountType: itemDto.discountType,
        discountValue: itemDto.discountValue,
      });

      const lotNumber = itemDto.lotNumber ? itemDto.lotNumber.trim() : null;
      const expirationDate = itemDto.expirationDate
        ? new Date(itemDto.expirationDate)
        : null;

      // Insertar PurchaseDetail con descuentos, lote, caducidad y notas
      const detail = await tx.purchaseDetail.create({
        data: {
          purchaseId: purchase.id,
          itemId: itemDto.itemId,
          purchaseUnit: itemDto.purchaseUnit.trim(),
          conversionFactor: calc.factor,
          purchaseQty: calc.purchaseQty,
          baseQty: calc.baseQty,
          unitPriceOriginal: calc.unitPriceOrig,
          unitCostBasePEN: calc.unitCostBasePEN,
          subtotalPEN: calc.subtotalPEN,
          discountType: calc.discountType,
          discountValue: calc.discountValue,
          discountAmountPEN: calc.discountAmountPEN,
          lotNumber,
          expirationDate,
          notes: itemDto.notes ? itemDto.notes.trim() : null,
        },
      });

      if (isService) {
        // Regla critica: items tipo SERVICE no generan stock, CPP ni Kardex
        const detailEntry: Record<string, unknown> = {
          id: detail.id,
          itemId: itemDto.itemId,
          itemType: ItemType.SERVICE,
          purchaseQty: calc.purchaseQty,
          baseQty: calc.baseQty,
          unitCostBasePEN: calc.unitCostBasePEN,
          discountType: calc.discountType,
          discountValue: calc.discountValue,
          discountAmountPEN: calc.discountAmountPEN,
          lotNumber,
          expirationDate,
          newWarehousePhysicalQty: null,
          notes: detail.notes,
        };
        processedDetails.push(detailEntry);
        continue;
      }

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

      // Formula de Costo Promedio Ponderado (CPP / WAC) sobre costo neto descontado
      // Si ingresa sin valorizar (unitCostBasePEN <= 0 ej. Guia de Remision a costo 0), se preserva el CPP previo
      let newCPP: number;
      if (calc.unitCostBasePEN <= 0) {
        newCPP = prevCPP > 0 ? prevCPP : 0;
      } else if (prevQty <= 0 || prevCPP <= 0) {
        newCPP = calc.unitCostBasePEN;
      } else {
        const prevTotalVal = prevQty * prevCPP;
        const incomingVal = calc.baseQty * calc.unitCostBasePEN;
        newCPP = Number(
          ((prevTotalVal + incomingVal) / (prevQty + calc.baseQty)).toFixed(4),
        );
      }

      const newPhysicalQty = Number((prevQty + calc.baseQty).toFixed(4));

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
        itemType: masterItem?.type ?? null,
        purchaseQty: calc.purchaseQty,
        baseQty: calc.baseQty,
        unitCostBasePEN: calc.unitCostBasePEN,
        discountType: calc.discountType,
        discountValue: calc.discountValue,
        discountAmountPEN: calc.discountAmountPEN,
        lotNumber,
        expirationDate,
        newWarehousePhysicalQty: newPhysicalQty,
        notes: detail.notes,
      };
      if (userRole !== Role.WAREHOUSE_KEEPER) {
        detailEntry.newWarehouseAverageCost = newCPP;
      }
      processedDetails.push(detailEntry);

      movementItemsData.push({
        itemId: itemDto.itemId,
        quantity: calc.baseQty,
        unitCostSnapshot: calc.unitCostBasePEN,
        totalCostSnapshot: calc.subtotalPEN,
      });
    }

    // Crear movimiento inmutable de Kardex tipo PURCHASE_ENTRY solo si existen bienes fisicos
    let movement: { id: string; movementNumber: string } | null = null;
    if (movementItemsData.length > 0) {
      const movementNumber = await this.sequenceGenerator.getNextCode(tx, 'MOV');
      const voucherLabel = this.buildVoucherLabel(
        purchase.voucherType,
        normalizedInvoiceSeries,
      );
      movement = await tx.movement.create({
        data: {
          movementNumber,
          type: MovementType.PURCHASE_ENTRY,
          originWarehouseId: null,
          destWarehouseId: targetWarehouseId,
          userId,
          observation: `Ingreso por compra segun ${voucherLabel}${
            dto.notes ? ` - ${dto.notes.trim()}` : ''
          }`,
          items: {
            create: movementItemsData,
          },
        },
      });
    }

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
      movementId: movement?.id ?? null,
      movementNumber: movement?.movementNumber ?? null,
      details: processedDetails,
    };
  }

  // Registrar compra e ingreso a Almacen (Central o de Obra) con recalculo atomico de CPP
  async create(
    dto: CreatePurchaseDto,
    user: { id: string; role: Role } | string,
  ) {
    const validated = await this.validateCreatePayload(dto, user);

    return this.prisma.$transaction(async (tx) => {
      return this.createInTransaction(tx, dto, validated);
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

    // 3. Consultar historico de compras activas para este insumo (excluyendo anuladas)
    const detailWhere: Prisma.PurchaseDetailWhereInput = {
      itemId: item.id,
      purchase: {
        isReverted: false,
        ...(query.warehouseId && query.warehouseId !== 'ALL'
          ? { warehouseId: query.warehouseId }
          : {}),
      },
    };

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

    const IGV_RATE = 0.18;

    const entries = purchaseDetails.map((pd) => {
      const p = pd.purchase;
      const unitCostBasePEN = Number(pd.unitCostBasePEN);
      const subtotalPEN = Number(pd.subtotalPEN);
      const igvFactor = p.hasIgv ? 1 + IGV_RATE : 1;
      const unitCostWithIgvPEN = Number((unitCostBasePEN * igvFactor).toFixed(4));
      const totalPEN = Number((subtotalPEN * igvFactor).toFixed(2));

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
        unitCostBasePEN,
        subtotalPEN,
        unitCostWithIgvPEN,
        totalPEN,
        discountType: pd.discountType,
        discountValue: Number(pd.discountValue ?? 0),
        discountAmountPEN: Number(pd.discountAmountPEN ?? 0),
        lotNumber: pd.lotNumber ?? null,
        expirationDate: pd.expirationDate ?? null,
        notes: pd.notes || p.notes || null,
      };
    });

    // Ordenar entradas valorizadas por costo efectivo con IGV ascendente y no valorizadas al final
    entries.sort((a, b) => {
      const aValued = a.unitCostWithIgvPEN > 0;
      const bValued = b.unitCostWithIgvPEN > 0;
      if (aValued !== bValued) {
        return aValued ? -1 : 1;
      }
      if (aValued && a.unitCostWithIgvPEN !== b.unitCostWithIgvPEN) {
        return a.unitCostWithIgvPEN - b.unitCostWithIgvPEN;
      }
      return new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime();
    });

    // 4. Calcular metricas estadisticas de comparacion (solo sobre entradas valorizadas)
    const valuedEntries = entries.filter((e) => e.unitCostWithIgvPEN > 0);
    const totalPurchasesCount = entries.length;
    let minUnitCostPEN: number | null = null;
    let maxUnitCostPEN: number | null = null;
    let bestSupplierName: string | null = null;
    let bestSupplierTaxId: string | null = null;

    if (valuedEntries.length > 0) {
      minUnitCostPEN = valuedEntries[0].unitCostWithIgvPEN;
      maxUnitCostPEN = valuedEntries.reduce(
        (max, curr) =>
          curr.unitCostWithIgvPEN > max ? curr.unitCostWithIgvPEN : max,
        valuedEntries[0].unitCostWithIgvPEN,
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
        details: {
          include: {
            item: {
              select: { type: true },
            },
          },
        },
        warehouse: true,
      },
    });

    if (!purchase) {
      throw new NotFoundException('Comprobante de compra no encontrado');
    }

    if (purchase.isReverted) {
      throw new BadRequestException(
        'No se puede valorizar un comprobante de compra anulado',
      );
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

    const effectiveCurrency = dto.currency ?? purchase.currency;
    const rawRate =
      dto.exchangeRate !== undefined
        ? Number(dto.exchangeRate)
        : Number(purchase.exchangeRate ?? 1.0);
    if (effectiveCurrency === Currency.USD && rawRate <= 0) {
      throw new BadRequestException(
        'Para compras en dolares (USD) el tipo de cambio debe ser mayor a cero',
      );
    }
    const exchangeRate = rawRate > 0 ? rawRate : 1.0;

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

    // Validar descuentos antes de iniciar la transaccion
    for (const itemDto of dto.items) {
      const existingDetail = detailMap.get(itemDto.detailId)!;
      const factor = Number(existingDetail.conversionFactor ?? 1.0) || 1.0;
      const purchaseQty =
        existingDetail.purchaseQty !== undefined && existingDetail.purchaseQty !== null
          ? Number(existingDetail.purchaseQty)
          : Number(existingDetail.baseQty) / factor;
      this.computePurchaseLineFinancials({
        purchaseQty,
        conversionFactor: factor,
        unitPriceOriginal: itemDto.unitPriceOriginal,
        exchangeRate,
        discountType: itemDto.discountType ?? existingDetail.discountType,
        discountValue:
          itemDto.discountValue !== undefined
            ? itemDto.discountValue
            : Number(existingDetail.discountValue ?? 0),
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id },
        data: {
          invoiceSeries:
            dto.invoiceSeries !== undefined
              ? dto.invoiceSeries?.trim() || null
              : purchase.invoiceSeries,
          voucherType: dto.voucherType?.trim() || purchase.voucherType,
          currency: effectiveCurrency,
          exchangeRate,
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

      const targetWarehouseId = purchase.warehouseId;

      // Buscar movimiento PURCHASE_ENTRY asociado para sincronizar unitCostSnapshot
      const associatedMovement = targetWarehouseId
        ? await this.findAssociatedPurchaseEntryMovement(
            tx,
            purchase,
            targetWarehouseId,
          )
        : null;

      for (const itemDto of dto.items) {
        const existingDetail = detailMap.get(itemDto.detailId)!;
        const factor = Number(existingDetail.conversionFactor ?? 1.0) || 1.0;
        const purchaseQty =
          existingDetail.purchaseQty !== undefined && existingDetail.purchaseQty !== null
            ? Number(existingDetail.purchaseQty)
            : Number(existingDetail.baseQty) / factor;
        const calc = this.computePurchaseLineFinancials({
          purchaseQty,
          conversionFactor: factor,
          unitPriceOriginal: itemDto.unitPriceOriginal,
          exchangeRate,
          discountType: itemDto.discountType ?? existingDetail.discountType,
          discountValue:
            itemDto.discountValue !== undefined
              ? itemDto.discountValue
              : Number(existingDetail.discountValue ?? 0),
        });
        const baseQty = Number(existingDetail.baseQty);

        await tx.purchaseDetail.update({
          where: { id: itemDto.detailId },
          data: {
            unitPriceOriginal: calc.unitPriceOrig,
            unitCostBasePEN: calc.unitCostBasePEN,
            subtotalPEN: calc.subtotalPEN,
            discountType: calc.discountType,
            discountValue: calc.discountValue,
            discountAmountPEN: calc.discountAmountPEN,
            lotNumber:
              itemDto.lotNumber !== undefined
                ? itemDto.lotNumber.trim() || null
                : existingDetail.lotNumber,
            expirationDate:
              itemDto.expirationDate !== undefined
                ? itemDto.expirationDate
                  ? new Date(itemDto.expirationDate)
                  : null
                : existingDetail.expirationDate,
            notes:
              itemDto.notes !== undefined
                ? itemDto.notes
                  ? itemDto.notes.trim()
                  : null
                : existingDetail.notes,
          },
        });

        if (existingDetail.item?.type === ItemType.SERVICE) {
          continue;
        }

        if (associatedMovement && tx.movementItem?.updateMany) {
          await tx.movementItem.updateMany({
            where: {
              movementId: associatedMovement.id,
              itemId: existingDetail.itemId,
            },
            data: {
              unitCostSnapshot: calc.unitCostBasePEN,
              totalCostSnapshot: calc.subtotalPEN,
            },
          });
        }

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
              newCPP = calc.unitCostBasePEN;
            } else {
              const priorQty = currentQty - baseQty;
              newCPP = Number(
                (
                  (priorQty * currentCPP + baseQty * calc.unitCostBasePEN) /
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
          revertedBy: {
            select: {
              id: true,
              fullName: true,
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

  // Logica interna de reversion de compra reutilizable en revertPurchase y replacePurchase
  private async revertInTransaction(
    tx: Prisma.TransactionClient,
    id: string,
    reversalReason: string,
    user: { id: string; role: Role },
  ) {
    const purchase = await tx.purchase.findUnique({
      where: { id },
      include: {
        details: {
          include: {
            item: {
              select: { id: true, sku: true, name: true, type: true },
            },
          },
        },
      },
    });

    if (!purchase) {
      throw new NotFoundException('Comprobante de compra no encontrado');
    }

    if (purchase.isReverted) {
      throw new ConflictException('La compra ya fue anulada previamente');
    }

    const warehouseId = purchase.warehouseId;
    if (!warehouseId) {
      throw new BadRequestException(
        'La compra no tiene un almacen asociado para revertir existencias',
      );
    }

    if (user.role === Role.WAREHOUSE_KEEPER) {
      const allowedIds = await this.getAllowedWarehouseIds(user.id);
      if (!allowedIds.includes(warehouseId)) {
        throw new ForbiddenException(
          'No tiene permisos para anular compras de este almacen',
        );
      }
    }

    const reasonTrimmed = reversalReason.trim();
    const now = new Date();
    const reversalItemsData = [];

    for (const detail of purchase.details) {
      if (detail.item?.type === ItemType.SERVICE) {
        continue;
      }

      const stock = await tx.stock.findUnique({
        where: {
          warehouseId_itemId: {
            warehouseId,
            itemId: detail.itemId,
          },
        },
      });

      const sAct = stock ? Number(stock.physicalQty) : 0;
      const reservedQty = stock ? Number(stock.reservedQty) : 0;
      const loanedQty = stock ? Number(stock.loanedQty) : 0;
      const availableForExit = Number(
        (sAct - reservedQty - loanedQty).toFixed(4),
      );
      const qRev = Number(detail.baseQty);
      const cRev = Number(detail.unitCostBasePEN);

      if (!stock || availableForExit < qRev) {
        throw new BadRequestException(
          `No se puede anular la compra: el insumo ${detail.item.sku} solo tiene ${availableForExit} unidades libres en almacen y se requieren retirar ${qRev}. Revierta primero los consumos, prestamos o transferencias posteriores.`,
        );
      }

      const cppAct = Number(stock.averageCost);
      const sNew = Math.max(0, Number((sAct - qRev).toFixed(4)));
      let cppNew: number;

      if (sNew <= 0) {
        cppNew = 0;
      } else if (cRev <= 0) {
        cppNew = cppAct;
      } else {
        const remainingVal = sAct * cppAct - qRev * cRev;
        if (remainingVal > 0) {
          cppNew = Number((remainingVal / sNew).toFixed(4));
        } else {
          const priorDetail = await tx.purchaseDetail.findFirst({
            where: {
              itemId: detail.itemId,
              unitCostBasePEN: { gt: 0 },
              purchase: {
                isReverted: false,
                warehouseId,
                id: { not: purchase.id },
              },
            },
            orderBy: [{ purchase: { issueDate: 'desc' } }, { id: 'desc' }],
            select: { unitCostBasePEN: true },
          });
          cppNew = priorDetail ? Number(priorDetail.unitCostBasePEN) : 0;
        }
      }

      await tx.stock.update({
        where: {
          warehouseId_itemId: {
            warehouseId,
            itemId: detail.itemId,
          },
        },
        data: {
          physicalQty: sNew,
          averageCost: cppNew,
        },
      });

      reversalItemsData.push({
        itemId: detail.itemId,
        quantity: qRev,
        unitCostSnapshot: cRev,
        totalCostSnapshot: Number((qRev * cRev).toFixed(2)),
      });
    }

    let reversalMovement: {
      id: string;
      movementNumber: string;
      type: MovementType;
    } | null = null;

    if (reversalItemsData.length > 0) {
      // Buscar movimiento PURCHASE_ENTRY original para marcarlo como revertido
      const originalMovement = await this.findAssociatedPurchaseEntryMovement(
        tx,
        purchase,
        warehouseId,
      );

      if (originalMovement) {
        await tx.movement.update({
          where: { id: originalMovement.id },
          data: {
            isReverted: true,
            revertedAt: now,
            revertedById: user.id,
            reversalReason: reasonTrimmed,
          },
        });
      }

      const movementNumber = await this.sequenceGenerator.getNextCode(tx, 'MOV');
      const reversalTargetLabel =
        purchase.invoiceSeries?.trim() || `${purchase.voucherType} (Sin serie)`;
      reversalMovement = await tx.movement.create({
        data: {
          movementNumber,
          type: MovementType.REVERSAL_EXIT,
          originWarehouseId: warehouseId,
          destWarehouseId: null,
          userId: user.id,
          reversesMovementId: originalMovement?.id ?? null,
          observation: `Anulacion de compra ${reversalTargetLabel}: ${reasonTrimmed}`,
          items: {
            create: reversalItemsData,
          },
        },
      });
    }

    const updatedPurchase = await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        isReverted: true,
        revertedAt: now,
        revertedById: user.id,
        reversalReason: reasonTrimmed,
        reversalMovementId: reversalMovement?.id ?? null,
      },
      include: {
        supplier: true,
        warehouse: {
          select: { id: true, name: true, type: true },
        },
        revertedBy: {
          select: { id: true, fullName: true },
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
      },
    });

    return {
      ...updatedPurchase,
      reversalMovement: reversalMovement
        ? {
            id: reversalMovement.id,
            movementNumber: reversalMovement.movementNumber,
            type: reversalMovement.type,
          }
        : null,
    };
  }

  // Nivel 1: Anular / revertir una compra, restaurar stock, CPP y asentar contra-asiento
  async revertPurchase(
    id: string,
    dto: RevertPurchaseDto,
    user: { id: string; role: Role },
  ) {
    return this.prisma.$transaction(async (tx) => {
      return this.revertInTransaction(tx, id, dto.reversalReason, user);
    });
  }

  // Nivel 2: Editar metadatos no contables de cabecera y notas por renglon
  async updateMetadata(
    id: string,
    dto: UpdatePurchaseMetadataDto,
    user: { id: string; role: Role },
  ) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: { details: true },
    });

    if (!purchase) {
      throw new NotFoundException('Comprobante de compra no encontrado');
    }

    if (purchase.isReverted) {
      throw new BadRequestException(
        'No se pueden editar metadatos de una compra anulada',
      );
    }

    if (user.role === Role.WAREHOUSE_KEEPER) {
      const allowedIds = await this.getAllowedWarehouseIds(user.id);
      if (!purchase.warehouseId || !allowedIds.includes(purchase.warehouseId)) {
        throw new ForbiddenException(
          'No tiene permisos para editar compras de este almacen',
        );
      }
    }

    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({
        where: { id: dto.supplierId },
      });
      if (!supplier) {
        throw new NotFoundException('Proveedor no encontrado');
      }
    }

    if (dto.itemNotes?.length) {
      const detailIds = new Set(purchase.details.map((d) => d.id));
      for (const noteItem of dto.itemNotes) {
        if (!detailIds.has(noteItem.detailId)) {
          throw new BadRequestException(
            `El detalle con ID ${noteItem.detailId} no pertenece a esta compra`,
          );
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id },
        data: {
          supplierId: dto.supplierId ?? undefined,
          invoiceSeries:
            dto.invoiceSeries !== undefined
              ? dto.invoiceSeries?.trim() || null
              : undefined,
          voucherType: dto.voucherType ? dto.voucherType.trim() : undefined,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
          notes:
            dto.notes !== undefined
              ? dto.notes.trim() || null
              : undefined,
          isEdited: true,
        },
      });

      if (dto.itemNotes?.length) {
        for (const noteItem of dto.itemNotes) {
          await tx.purchaseDetail.update({
            where: { id: noteItem.detailId },
            data: {
              notes:
                noteItem.notes !== undefined
                  ? noteItem.notes.trim() || null
                  : undefined,
              lotNumber:
                noteItem.lotNumber !== undefined
                  ? noteItem.lotNumber
                    ? noteItem.lotNumber.trim()
                    : null
                  : undefined,
              expirationDate:
                noteItem.expirationDate !== undefined
                  ? noteItem.expirationDate
                    ? new Date(noteItem.expirationDate)
                    : null
                  : undefined,
            },
          });
        }
      }

      return tx.purchase.findUnique({
        where: { id },
        include: {
          supplier: true,
          warehouse: {
            select: { id: true, name: true, type: true },
          },
          revertedBy: {
            select: { id: true, fullName: true },
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

  // Nivel 3: Revertir compra original y registrar reemplazo atomico
  async replacePurchase(
    id: string,
    dto: ReplacePurchaseDto,
    user: { id: string; role: Role },
  ) {
    const validated = await this.validateCreatePayload(dto, user);

    return this.prisma.$transaction(async (tx) => {
      await this.revertInTransaction(tx, id, dto.reversalReason, user);
      const newPurchase = await this.createInTransaction(tx, dto, {
        ...validated,
        isEdited: true,
      });

      await tx.purchase.update({
        where: { id },
        data: { replacedById: newPurchase.id },
      });

      // Conservar adjuntos previos vinculandolos al nuevo comprobante corregido
      if (tx.documentAttachment?.updateMany) {
        await tx.documentAttachment.updateMany({
          where: { purchaseId: id },
          data: { purchaseId: newPurchase.id },
        });
      }

      return newPurchase;
    });
  }
}
