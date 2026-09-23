import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto.js';
import { WarehouseStockFilterDto } from './dto/warehouse-stock-filter.dto.js';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  // Listar almacenes accesibles segun el rol del usuario
  async findAll(user: { id: string; role: Role }) {
    if (user.role === Role.ADMIN) {
      return this.prisma.warehouse.findMany({
        include: {
          project: {
            select: { id: true, name: true, status: true },
          },
          _count: {
            select: { stocks: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    // Para almaceneros se restringe a los almacenes que tiene asignados
    return this.prisma.warehouse.findMany({
      where: {
        users: {
          some: {
            userId: user.id,
          },
        },
        isActive: true,
      },
      include: {
        project: {
          select: { id: true, name: true, status: true },
        },
        _count: {
          select: { stocks: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // Registrar un nuevo almacen Central o de Obra
  async create(dto: CreateWarehouseDto) {
    const existing = await this.prisma.warehouse.findFirst({
      where: { name: dto.name.trim() },
    });

    if (existing) {
      throw new ConflictException(
        'Ya existe un almacen registrado con ese nombre',
      );
    }

    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
      });

      if (!project) {
        throw new BadRequestException('El proyecto asociado no existe');
      }

      // Validar que el proyecto no tenga ya un almacen asignado
      const existingProjectWarehouse = await this.prisma.warehouse.findUnique({
        where: { projectId: dto.projectId },
      });

      if (existingProjectWarehouse) {
        throw new ConflictException(
          'El proyecto ya cuenta con un almacen asignado',
        );
      }
    }

    return this.prisma.warehouse.create({
      data: {
        name: dto.name.trim(),
        type: dto.type,
        isTemporary: dto.isTemporary ?? (dto.type === 'PROJECT_SITE'),
        isActive: dto.isActive ?? true,
        projectId: dto.projectId,
      },
      include: {
        project: true,
      },
    });
  }

  // Obtener detalle de un almacen por ID
  async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        project: true,
        _count: {
          select: { stocks: true, users: true },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException('Almacen no encontrado');
    }

    return warehouse;
  }

  // Actualizar datos del almacen
  async update(id: string, dto: UpdateWarehouseDto) {
    await this.findOne(id);

    return this.prisma.warehouse.update({
      where: { id },
      data: {
        name: dto.name ? dto.name.trim() : undefined,
        isTemporary: dto.isTemporary,
        isActive: dto.isActive,
      },
      include: {
        project: true,
      },
    });
  }

  // Consultar existencias de stock del almacen
  async getStock(warehouseId: string, filter?: WarehouseStockFilterDto) {
    await this.findOne(warehouseId);

    const whereItem: Record<string, unknown> = {};

    if (filter?.search) {
      whereItem.OR = [
        { sku: { contains: filter.search.trim(), mode: 'insensitive' } },
        { name: { contains: filter.search.trim(), mode: 'insensitive' } },
      ];
    }

    if (filter?.type) {
      whereItem.type = filter.type;
    }

    return this.prisma.stock.findMany({
      where: {
        warehouseId,
        item: Object.keys(whereItem).length > 0 ? whereItem : undefined,
      },
      include: {
        item: {
          select: {
            id: true,
            sku: true,
            name: true,
            description: true,
            baseUnit: true,
            type: true,
            minStockAlert: true,
          },
        },
      },
      orderBy: {
        item: { name: 'asc' },
      },
    });
  }

  // Consultar alertas de stock critico por debajo del umbral minimo
  async getAlerts(warehouseId: string) {
    await this.findOne(warehouseId);

    const stocks = await this.prisma.stock.findMany({
      where: {
        warehouseId,
        item: {
          minStockAlert: { gt: 0 },
        },
      },
      include: {
        item: true,
      },
      orderBy: {
        item: { name: 'asc' },
      },
    });

    // Filtrar insumos cuyo stock fisico este por debajo o igual al stock minimo
    return stocks
      .filter((s) => Number(s.physicalQty) <= Number(s.item.minStockAlert))
      .map((s) => ({
        stockId: s.id,
        warehouseId: s.warehouseId,
        itemId: s.itemId,
        sku: s.item.sku,
        name: s.item.name,
        baseUnit: s.item.baseUnit,
        type: s.item.type,
        physicalQty: Number(s.physicalQty),
        minStockAlert: Number(s.item.minStockAlert),
        deficitQty: Number(s.item.minStockAlert) - Number(s.physicalQty),
      }));
  }
}
