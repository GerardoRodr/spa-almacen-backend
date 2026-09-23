import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateItemDto } from './dto/create-item.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';
import { ItemFilterDto } from './dto/item-filter.dto.js';
import { CreateItemAliasDto } from './dto/create-item-alias.dto.js';

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

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

    const [total, data] = await Promise.all([
      this.prisma.item.count({ where }),
      this.prisma.item.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
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
  async create(dto: CreateItemDto) {
    const formattedSku = dto.sku.trim().toUpperCase();

    const existing = await this.prisma.item.findUnique({
      where: { sku: formattedSku },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un item registrado con el SKU: ${formattedSku}`,
      );
    }

    return this.prisma.item.create({
      data: {
        sku: formattedSku,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        baseUnit: dto.baseUnit.trim().toUpperCase(),
        type: dto.type,
        minStockAlert: dto.minStockAlert ?? 0,
      },
    });
  }

  // Obtener detalle del item con consolidado de stock corporativo y alias S10
  async findOne(id: string) {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: {
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
    };
  }

  // Actualizar datos maestros del item
  async update(id: string, dto: UpdateItemDto) {
    await this.findOne(id);

    return this.prisma.item.update({
      where: { id },
      data: {
        name: dto.name ? dto.name.trim() : undefined,
        description: dto.description ? dto.description.trim() : undefined,
        baseUnit: dto.baseUnit ? dto.baseUnit.trim().toUpperCase() : undefined,
        type: dto.type,
        minStockAlert: dto.minStockAlert,
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
}
