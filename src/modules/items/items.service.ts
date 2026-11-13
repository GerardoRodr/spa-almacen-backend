import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ItemType, MeterType, MovementType, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SequenceGeneratorService } from '../../common/services/sequence-generator.service.js';
import { CreateItemDto } from './dto/create-item.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';
import { ItemFilterDto } from './dto/item-filter.dto.js';
import { CreateItemAliasDto } from './dto/create-item-alias.dto.js';
import { CreateItemCategoryDto } from './dto/create-item-category.dto.js';
import { UpdateItemCategoryDto } from './dto/update-item-category.dto.js';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceGenerator: SequenceGeneratorService,
  ) {}

  // Previsualizar proximo SKU sugerido segun clasificacion
  async previewNextSku(type: ItemType) {
    return this.sequenceGenerator.previewNextItemSku(this.prisma, type);
  }

  // Listar catalogo de items con paginacion y filtros
  async findAll(filter: ItemFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (filter.search) {
      where.OR = [
        { sku: { contains: filter.search.trim(), mode: 'insensitive' } },
        { name: { contains: filter.search.trim(), mode: 'insensitive' } },
      ];
    }

    if (filter.type) {
      where.type = filter.type;
    }

    if (filter.categoryId) {
      where.categoryId = filter.categoryId;
    }

    if (filter.isPerishable !== undefined) {
      where.isPerishable = filter.isPerishable;
    }

    const [total, data] = await Promise.all([
      this.prisma.item.count({ where }),
      this.prisma.item.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              code: true,
              isActive: true,
            },
          },
          stocks: {
            include: {
              warehouse: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  isTemporary: true,
                  isActive: true,
                },
              },
            },
          },
          _count: {
            select: { stocks: true, aliases: true },
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
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Registrar nuevo insumo o herramienta en el catalogo maestro
  async create(
    dto: CreateItemDto,
    user?: { id: string; role: Role; assignedWarehouses?: Array<{ warehouseId: string }> },
  ) {
    return this.prisma.$transaction(async (tx) => {
      let formattedSku: string;
      if (dto.sku && dto.sku.trim()) {
        formattedSku = dto.sku.trim().toUpperCase();
        const existing = await tx.item.findUnique({
          where: { sku: formattedSku },
        });
        if (existing) {
          throw new ConflictException(
            `Ya existe un item registrado con el SKU: ${formattedSku}`,
          );
        }
      } else {
        formattedSku = await this.sequenceGenerator.getNextItemSku(tx, dto.type);
      }

      const formattedBaseUnit = dto.baseUnit.trim().toUpperCase();

      if (dto.categoryId) {
        const category = await tx.itemCategory.findUnique({
          where: { id: dto.categoryId },
        });
        if (!category) {
          throw new NotFoundException('La clasificacion especificada no existe');
        }
      }

      // Asegurar que la unidad de medida exista en el catalogo maestro y este activa
      const unitInMaster = await tx.measurementUnit.findUnique({
        where: { code: formattedBaseUnit },
      });
      if (unitInMaster && !unitInMaster.isActive) {
        throw new BadRequestException(
          `La unidad de medida ${formattedBaseUnit} se encuentra inactiva en el catalogo maestro`,
        );
      }
      if (!unitInMaster) {
        await tx.measurementUnit.create({
          data: {
            code: formattedBaseUnit,
            name: formattedBaseUnit,
            description: 'Unidad registrada dinamicamente desde catalogo de items',
            isActive: true,
          },
        });
      }

      const resolvedMeterType =
        dto.type === ItemType.MACHINERY
          ? (dto.meterType ?? MeterType.HOUR_METER)
          : null;

      const createdItem = await tx.item.create({
        data: {
          sku: formattedSku,
          name: dto.name.trim(),
          description: dto.description?.trim(),
          baseUnit: formattedBaseUnit,
          type: dto.type,
          meterType: resolvedMeterType,
          minStockAlert: dto.minStockAlert ?? 0,
          isPerishable: dto.isPerishable ?? false,
          categoryId: dto.categoryId ?? null,
        },
        include: {
          category: true,
        },
      });

      let initialMovementId: string | undefined = undefined;

      // Procesar registro atomico de stock fisico inicial si se envia
      if (dto.initialStock && dto.initialStock.quantity > 0) {
        const initWhId = dto.initialStock.warehouseId;
        const warehouse = await tx.warehouse.findUnique({
          where: { id: initWhId },
        });

        if (!warehouse) {
          throw new NotFoundException('Almacen de destino no encontrado para stock inicial');
        }
        if (!warehouse.isActive) {
          throw new BadRequestException('El almacen de destino se encuentra inactivo');
        }

        // Si el usuario es WAREHOUSE_KEEPER, validar que tenga asignado el almacen
        if (user && user.role === Role.WAREHOUSE_KEEPER) {
          const userWarehouses = await tx.userWarehouse.findMany({
            where: { userId: user.id },
            select: { warehouseId: true },
          });
          const hasAccess = userWarehouses.some((w) => w.warehouseId === initWhId);
          if (!hasAccess) {
            throw new BadRequestException('No tiene permisos para ingresar stock en el almacen seleccionado');
          }
        }

        // Determinar costo unitario efectivo: 0 para almaceneros o si se omite; costo real si es ADMIN
        const isKeeper = user && user.role === Role.WAREHOUSE_KEEPER;
        const initialUnitCost = isKeeper ? 0 : Number(dto.initialStock.unitCost ?? 0);
        const initQty = Number(dto.initialStock.quantity);

        await tx.stock.create({
          data: {
            warehouseId: initWhId,
            itemId: createdItem.id,
            physicalQty: initQty,
            averageCost: initialUnitCost,
          },
        });

        const movementNumber = await this.sequenceGenerator.getNextCode(tx, 'MOV');
        const fallbackUserId = user?.id || (await tx.user.findFirst({ select: { id: true } }))!.id;
        const movement = await tx.movement.create({
          data: {
            movementNumber,
            type: MovementType.INVENTORY_ADJUSTMENT,
            originWarehouseId: initWhId,
            userId: fallbackUserId,
            observation: dto.initialStock.observation?.trim()
              ? `[STOCK INICIAL] ${dto.initialStock.observation.trim()}`
              : `[STOCK INICIAL] Alta de inventario fisico en ${warehouse.name}`,
            items: {
              create: [
                {
                  itemId: createdItem.id,
                  quantity: initQty,
                  unitCostSnapshot: initialUnitCost,
                  totalCostSnapshot: Number((initQty * initialUnitCost).toFixed(2)),
                },
              ],
            },
          },
        });

        initialMovementId = movement.id;
      }

      // Devolver item con stocks incluidos
      const fullItem =
        (await tx.item.findUnique({
          where: { id: createdItem.id },
          include: {
            category: true,
            stocks: {
              include: {
                warehouse: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        })) || createdItem;

      return {
        ...fullItem,
        initialMovementId,
      };
    });
  }

  // Obtener detalle del item con consolidado de stock corporativo y alias S10
  async findOne(id: string) {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: {
        category: true,
        aliases: true,
        stocks: {
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
                type: true,
                isActive: true,
              },
            },
          },
          orderBy: { warehouse: { name: 'asc' } },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item no encontrado en el catalogo maestro');
    }

    // Calcular consolidado de existencias en toda la empresa
    const stocks = item.stocks ?? [];
    const totalPhysicalQty = stocks.reduce(
      (acc, s) => acc + Number(s.physicalQty),
      0,
    );
    const totalReservedQty = stocks.reduce(
      (acc, s) => acc + Number(s.reservedQty),
      0,
    );
    const totalLoanedQty = stocks.reduce(
      (acc, s) => acc + Number(s.loanedQty),
      0,
    );

    // Calcular metricas de transacciones para control de doble confirmacion
    const [stocksWithQtyCount, movementItemsCount, purchaseDetailsCount, transferItemsCount] =
      await Promise.all([
        this.prisma.stock.count({
          where: { itemId: id, physicalQty: { gt: 0 } },
        }),
        this.prisma.movementItem.count({
          where: { itemId: id },
        }),
        this.prisma.purchaseDetail.count({
          where: { itemId: id },
        }),
        this.prisma.transferItem.count({
          where: { itemId: id },
        }),
      ]);

    const hasTransactions =
      stocksWithQtyCount > 0 ||
      movementItemsCount > 0 ||
      purchaseDetailsCount > 0 ||
      transferItemsCount > 0;

    return {
      ...item,
      totals: {
        totalPhysicalQty,
        totalReservedQty,
        totalLoanedQty,
        netAvailableCentralQty: stocks
          .filter((s) => s.warehouse?.type === 'CENTRAL')
          .reduce(
            (acc, s) => acc + (Number(s.physicalQty) - Number(s.reservedQty)),
            0,
          ),
      },
      hasTransactions,
      transactionStats: {
        stocksWithQtyCount,
        movementItemsCount,
        purchaseDetailsCount,
        transferItemsCount,
      },
    };
  }

  // Actualizar datos maestros del item
  async update(id: string, dto: UpdateItemDto) {
    const currentItem = await this.findOne(id);

    if (dto.categoryId) {
      const category = await this.prisma.itemCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('La clasificacion especificada no existe');
      }
    }

    // Validacion y guarda para alteracion de baseUnit
    let formattedBaseUnit: string | undefined = undefined;
    if (dto.baseUnit) {
      formattedBaseUnit = dto.baseUnit.trim().toUpperCase();

      if (formattedBaseUnit !== currentItem.baseUnit) {
        // Verificar estado en catalogo maestro de unidades
        const unitInMaster = await this.prisma.measurementUnit.findUnique({
          where: { code: formattedBaseUnit },
        });

        if (unitInMaster && !unitInMaster.isActive) {
          throw new BadRequestException(
            `La unidad de medida ${formattedBaseUnit} se encuentra inactiva en el catalogo maestro`,
          );
        }

        if (!unitInMaster) {
          await this.prisma.measurementUnit.create({
            data: {
              code: formattedBaseUnit,
              name: formattedBaseUnit,
              description: 'Unidad registrada dinamicamente desde actualizacion de item',
              isActive: true,
            },
          });
        }

        // Si tiene movimientos o existencias activas, exigir confirmacion explicita
        if (currentItem.hasTransactions && !dto.confirmUnitChange) {
          throw new BadRequestException({
            statusCode: 400,
            code: 'REQUIRES_DOUBLE_CONFIRMATION',
            message:
              'El insumo cuenta con existencias fisicas o movimientos historicos registrados. Modificar su unidad base requiere doble confirmacion explicita.',
            details: currentItem.transactionStats,
          });
        }
      }
    }

    const effectiveType = dto.type ?? currentItem.type;
    let resolvedMeterType: MeterType | null | undefined = undefined;
    if (effectiveType !== ItemType.MACHINERY) {
      resolvedMeterType = null;
    } else if (dto.meterType !== undefined) {
      resolvedMeterType = dto.meterType ?? MeterType.HOUR_METER;
    } else if (!currentItem.meterType) {
      resolvedMeterType = MeterType.HOUR_METER;
    }

    return this.prisma.item.update({
      where: { id },
      data: {
        name: dto.name ? dto.name.trim() : undefined,
        description: dto.description ? dto.description.trim() : undefined,
        baseUnit: formattedBaseUnit,
        type: dto.type,
        meterType: resolvedMeterType,
        minStockAlert: dto.minStockAlert,
        isPerishable: dto.isPerishable,
        categoryId: dto.categoryId !== undefined ? dto.categoryId : undefined,
      },
      include: {
        category: true,
      },
    });
  }

  // Registrar equivalencia o alias S10 para el item
  async createAlias(dto: CreateItemAliasDto) {
    await this.findOne(dto.itemId);

    const rawNameFormatted = dto.s10RawName.trim();

    const existing = await this.prisma.itemAlias.findUnique({
      where: { s10RawName: rawNameFormatted },
    });

    if (existing) {
      throw new ConflictException(
        'Ya existe un alias registrado con esa descripcion literal de S10',
      );
    }

    return this.prisma.itemAlias.create({
      data: {
        itemId: dto.itemId,
        s10RawName: rawNameFormatted,
        s10Code: dto.s10Code?.trim(),
        s10Unit: dto.s10Unit?.trim(),
        conversionFactor: dto.conversionFactor ?? 1.0,
      },
    });
  }

  // Eliminar alias de S10
  async deleteAlias(aliasId: string) {
    const existing = await this.prisma.itemAlias.findUnique({
      where: { id: aliasId },
    });

    if (!existing) {
      throw new NotFoundException('Alias no encontrado');
    }

    await this.prisma.itemAlias.delete({
      where: { id: aliasId },
    });

    return { message: 'Alias eliminado exitosamente' };
  }

  // Listar alertas de insumos perecibles con existencias activas
  async getPerishableAlerts(warehouseId?: string) {
    const stockWhere: Record<string, unknown> = {
      physicalQty: { gt: 0 },
    };

    if (warehouseId && warehouseId !== 'ALL') {
      stockWhere.warehouseId = warehouseId;
    }

    const items = await this.prisma.item.findMany({
      where: {
        isPerishable: true,
        stocks: {
          some: stockWhere,
        },
      },
      include: {
        stocks: {
          where: stockWhere,
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
        purchaseDetails: {
          where: {
            purchase: {
              isReverted: false,
            },
          },
          orderBy: {
            purchase: {
              issueDate: 'desc',
            },
          },
          take: 1,
          include: {
            purchase: {
              select: {
                id: true,
                invoiceSeries: true,
                issueDate: true,
                supplier: {
                  select: {
                    id: true,
                    businessName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return items.map((item) => {
      const totalPhysicalQty = item.stocks.reduce(
        (acc, s) => acc + Number(s.physicalQty),
        0,
      );
      const lastPurchase = item.purchaseDetails[0]?.purchase;
      const lastPurchaseDate = lastPurchase?.issueDate ?? null;

      let daysInStorage: number | null = null;
      if (lastPurchaseDate) {
        const now = new Date();
        const diffTime = Math.abs(
          now.getTime() - new Date(lastPurchaseDate).getTime(),
        );
        daysInStorage = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }

      return {
        id: item.id,
        sku: item.sku,
        name: item.name,
        baseUnit: item.baseUnit,
        type: item.type,
        minStockAlert: Number(item.minStockAlert),
        isPerishable: item.isPerishable,
        totalPhysicalQty,
        lastPurchaseDate,
        daysInStorage,
        lastSupplier: lastPurchase?.supplier?.businessName ?? null,
        lastInvoiceSeries: lastPurchase?.invoiceSeries ?? null,
        stocks: item.stocks.map((s) => ({
          stockId: s.id,
          warehouseId: s.warehouseId,
          warehouseName: s.warehouse.name,
          warehouseType: s.warehouse.type,
          physicalQty: Number(s.physicalQty),
          averageCost: Number(s.averageCost),
        })),
      };
    });
  }

  // -------------------------------------------------------------------------
  // GESTOR DE CLASIFICACIONES PERSONALIZADAS (ITEM CATEGORIES)
  // -------------------------------------------------------------------------

  // Listar clasificaciones de insumos (por defecto solo activas)
  async findAllCategories(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };

    return this.prisma.itemCategory.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { items: true },
        },
      },
    });
  }

  // Registrar nueva clasificacion personalizada
  async createCategory(dto: CreateItemCategoryDto) {
    const trimmedName = dto.name.trim();
    const formattedCode = dto.code ? dto.code.trim().toUpperCase() : null;

    const existingName = await this.prisma.itemCategory.findUnique({
      where: { name: trimmedName },
    });
    if (existingName) {
      throw new ConflictException(
        `Ya existe una clasificacion registrada con el nombre: ${trimmedName}`,
      );
    }

    if (formattedCode) {
      const existingCode = await this.prisma.itemCategory.findUnique({
        where: { code: formattedCode },
      });
      if (existingCode) {
        throw new ConflictException(
          `Ya existe una clasificacion registrada con el codigo: ${formattedCode}`,
        );
      }
    }

    return this.prisma.itemCategory.create({
      data: {
        name: trimmedName,
        code: formattedCode,
        description: dto.description ? dto.description.trim() : null,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });
  }

  // Actualizar datos de una clasificacion existente
  async updateCategory(id: string, dto: UpdateItemCategoryDto) {
    const category = await this.prisma.itemCategory.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException('Clasificacion no encontrada');
    }

    const trimmedName = dto.name !== undefined ? dto.name.trim() : undefined;
    const formattedCode =
      dto.code !== undefined
        ? dto.code ? dto.code.trim().toUpperCase() : null
        : undefined;

    if (trimmedName && trimmedName !== category.name) {
      const existingName = await this.prisma.itemCategory.findUnique({
        where: { name: trimmedName },
      });
      if (existingName) {
        throw new ConflictException(
          `Ya existe una clasificacion registrada con el nombre: ${trimmedName}`,
        );
      }
    }

    if (formattedCode && formattedCode !== category.code) {
      const existingCode = await this.prisma.itemCategory.findUnique({
        where: { code: formattedCode },
      });
      if (existingCode) {
        throw new ConflictException(
          `Ya existe una clasificacion registrada con el codigo: ${formattedCode}`,
        );
      }
    }

    return this.prisma.itemCategory.update({
      where: { id },
      data: {
        name: trimmedName,
        code: formattedCode,
        description:
          dto.description !== undefined
            ? dto.description ? dto.description.trim() : null
            : undefined,
        isActive: dto.isActive,
      },
    });
  }

  // Eliminar clasificacion (fisica si no tiene items, o desactivar si tiene dependencias)
  async removeCategory(id: string) {
    const category = await this.prisma.itemCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Clasificacion no encontrada');
    }

    if (category._count.items > 0) {
      // Tiene items vinculados: desactivar logicamente para preservar integridad
      await this.prisma.itemCategory.update({
        where: { id },
        data: { isActive: false },
      });

      return {
        action: 'DEACTIVATED',
        message: `La clasificacion tiene ${category._count.items} insumo(s) asociado(s). Se ha desactivado logicamente para preservar la integridad del catalogo.`,
      };
    }

    // No tiene items asociados: eliminar fisicamente
    await this.prisma.itemCategory.delete({
      where: { id },
    });

    return {
      action: 'DELETED',
      message: 'Clasificacion eliminada exitosamente',
    };
  }
}
