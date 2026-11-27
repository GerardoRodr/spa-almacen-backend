import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { SupplierFilterDto } from './dto/supplier-filter.dto.js';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  // Listar proveedores con paginacion y busqueda por RUC o razon social
  async findAll(filter: SupplierFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = {};

    if (filter.search) {
      where.OR = [
        { taxId: { contains: filter.search.trim(), mode: 'insensitive' } },
        { businessName: { contains: filter.search.trim(), mode: 'insensitive' } },
      ];
    }

    const dir: Prisma.SortOrder =
      filter.sortDir ?? (filter.sortBy === 'purchasesCount' ? 'desc' : 'asc');
    const orderBy: Prisma.SupplierOrderByWithRelationInput[] =
      filter.sortBy === 'purchasesCount'
        ? [{ purchases: { _count: dir } }, { businessName: 'asc' }]
        : [{ businessName: dir }];

    const [total, data] = await Promise.all([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          _count: {
            select: { purchases: true },
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

  // Obtener detalle de un proveedor por identificador unico
  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        purchases: {
          take: 10,
          orderBy: { issueDate: 'desc' },
          select: {
            id: true,
            invoiceSeries: true,
            currency: true,
            issueDate: true,
            subtotalPEN: true,
            totalAmountPEN: true,
          },
        },
        _count: {
          select: { purchases: true },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    return supplier;
  }

  // Registrar nuevo proveedor comercial validando RUC unico cuando se proporciona
  async create(dto: CreateSupplierDto) {
    const normalizedTaxId = dto.taxId?.trim() || null;

    if (normalizedTaxId !== null) {
      const existing = await this.prisma.supplier.findUnique({
        where: { taxId: normalizedTaxId },
      });

      if (existing) {
        throw new ConflictException(
          `Ya existe un proveedor registrado con el RUC ${normalizedTaxId}`,
        );
      }
    }

    return this.prisma.supplier.create({
      data: {
        taxId: normalizedTaxId,
        businessName: dto.businessName.trim(),
        contactPhone: dto.contactPhone?.trim(),
        contactEmail: dto.contactEmail?.trim(),
        address: dto.address?.trim(),
        notes: dto.notes ? dto.notes.trim() : null,
      },
    });
  }

  // Actualizar datos del proveedor
  async update(id: string, dto: UpdateSupplierDto) {
    const existing = await this.prisma.supplier.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    const normalizedTaxId =
      dto.taxId !== undefined ? dto.taxId?.trim() || null : undefined;

    if (normalizedTaxId && normalizedTaxId !== existing.taxId) {
      const conflict = await this.prisma.supplier.findUnique({
        where: { taxId: normalizedTaxId },
      });
      if (conflict) {
        throw new ConflictException(
          `Ya existe un proveedor registrado con el RUC ${normalizedTaxId}`,
        );
      }
    }

    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...(normalizedTaxId !== undefined && { taxId: normalizedTaxId }),
        ...(dto.businessName && { businessName: dto.businessName.trim() }),
        ...(dto.contactPhone !== undefined && {
          contactPhone: dto.contactPhone ? dto.contactPhone.trim() : null,
        }),
        ...(dto.contactEmail !== undefined && {
          contactEmail: dto.contactEmail ? dto.contactEmail.trim() : null,
        }),
        ...(dto.address !== undefined && {
          address: dto.address ? dto.address.trim() : null,
        }),
        ...(dto.notes !== undefined && {
          notes: dto.notes ? dto.notes.trim() : null,
        }),
      },
    });
  }

  // Eliminar fisicamente un proveedor sin compras asociadas
  async remove(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: { purchases: true },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    const purchasesCount = supplier._count?.purchases ?? 0;
    if (purchasesCount > 0) {
      throw new BadRequestException(
        `No se puede eliminar el proveedor "${supplier.businessName}" porque tiene ${purchasesCount} compra(s) asociada(s). Reasigne primero sus comprobantes desde el modulo de Compras.`,
      );
    }

    await this.prisma.supplier.delete({ where: { id } });

    return {
      deleted: true,
      message: 'Proveedor eliminado permanentemente.',
    };
  }
}
