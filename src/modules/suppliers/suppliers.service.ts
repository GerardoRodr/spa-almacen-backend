import {
  Injectable,
  NotFoundException,
  ConflictException,
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

    const [total, data] = await Promise.all([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy: { businessName: 'asc' },
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

  // Registrar nuevo proveedor comercial validando RUC unico
  async create(dto: CreateSupplierDto) {
    const existing = await this.prisma.supplier.findUnique({
      where: { taxId: dto.taxId },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un proveedor registrado con el RUC ${dto.taxId}`,
      );
    }

    return this.prisma.supplier.create({
      data: {
        taxId: dto.taxId,
        businessName: dto.businessName.trim(),
        contactPhone: dto.contactPhone?.trim(),
        contactEmail: dto.contactEmail?.trim(),
        address: dto.address?.trim(),
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

    if (dto.taxId && dto.taxId !== existing.taxId) {
      const conflict = await this.prisma.supplier.findUnique({
        where: { taxId: dto.taxId },
      });
      if (conflict) {
        throw new ConflictException(
          `Ya existe un proveedor registrado con el RUC ${dto.taxId}`,
        );
      }
    }

    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...(dto.taxId && { taxId: dto.taxId }),
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
      },
    });
  }
}
