import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateMeasurementUnitDto } from './dto/create-measurement-unit.dto.js';
import { UpdateMeasurementUnitDto } from './dto/update-measurement-unit.dto.js';

@Injectable()
export class MeasurementUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  // Listar todas las unidades de medida (activas por defecto, o todas si includeInactive = true)
  async findAll(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };

    const units = await this.prisma.measurementUnit.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    // Calcular conteo de items asociados por cada codigo de unidad
    const unitsWithUsage = await Promise.all(
      units.map(async (unit) => {
        const itemsCount = await this.prisma.item.count({
          where: { baseUnit: unit.code },
        });
        return {
          ...unit,
          itemsCount,
        };
      }),
    );

    return unitsWithUsage;
  }

  // Obtener una unidad de medida por identificador UUID o codigo
  async findOne(id: string) {
    const unit = await this.prisma.measurementUnit.findFirst({
      where: {
        OR: [{ id }, { code: id.trim().toUpperCase() }],
      },
    });

    if (!unit) {
      throw new NotFoundException('Unidad de medida no encontrada');
    }

    const itemsCount = await this.prisma.item.count({
      where: { baseUnit: unit.code },
    });

    return {
      ...unit,
      itemsCount,
    };
  }

  // Registrar una nueva unidad de medida en el catalogo maestro
  async create(dto: CreateMeasurementUnitDto) {
    const formattedCode = dto.code.trim().toUpperCase();
    const trimmedName = dto.name.trim();

    const existingCode = await this.prisma.measurementUnit.findUnique({
      where: { code: formattedCode },
    });

    if (existingCode) {
      throw new ConflictException(
        `Ya existe una unidad de medida registrada con el codigo: ${formattedCode}`,
      );
    }

    const existingName = await this.prisma.measurementUnit.findFirst({
      where: {
        name: { equals: trimmedName, mode: 'insensitive' },
      },
    });

    if (existingName) {
      throw new ConflictException(
        `Ya existe una unidad de medida con el nombre: ${trimmedName}`,
      );
    }

    return this.prisma.measurementUnit.create({
      data: {
        code: formattedCode,
        name: trimmedName,
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  // Actualizar datos descriptivos o estado de una unidad de medida
  async update(id: string, dto: UpdateMeasurementUnitDto) {
    const unit = await this.prisma.measurementUnit.findUnique({
      where: { id },
    });

    if (!unit) {
      throw new NotFoundException('Unidad de medida no encontrada');
    }

    const trimmedName = dto.name?.trim();

    if (trimmedName && trimmedName.toLowerCase() !== unit.name.toLowerCase()) {
      const existingName = await this.prisma.measurementUnit.findFirst({
        where: {
          name: { equals: trimmedName, mode: 'insensitive' },
          id: { not: id },
        },
      });

      if (existingName) {
        throw new ConflictException(
          `Ya existe otra unidad de medida con el nombre: ${trimmedName}`,
        );
      }
    }

    return this.prisma.measurementUnit.update({
      where: { id },
      data: {
        name: trimmedName !== undefined ? trimmedName : undefined,
        description:
          dto.description !== undefined ? dto.description?.trim() || null : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
    });
  }

  // Eliminar unidad de medida (fisica si no tiene items, o desactivar si tiene dependencias)
  async remove(id: string) {
    const unit = await this.prisma.measurementUnit.findUnique({
      where: { id },
    });

    if (!unit) {
      throw new NotFoundException('Unidad de medida no encontrada');
    }

    const itemsCount = await this.prisma.item.count({
      where: { baseUnit: unit.code },
    });

    if (itemsCount > 0) {
      // Tiene items vinculados: desactivar logicamente para preservar integridad
      await this.prisma.measurementUnit.update({
        where: { id },
        data: { isActive: false },
      });

      return {
        action: 'DEACTIVATED',
        message: `La unidad de medida tiene ${itemsCount} insumo(s) asociado(s). Se ha desactivado logicamente para preservar la integridad del catalogo.`,
      };
    }

    // No tiene items asociados: eliminar fisicamente
    await this.prisma.measurementUnit.delete({
      where: { id },
    });

    return {
      action: 'DELETED',
      message: 'Unidad de medida eliminada exitosamente.',
    };
  }
}
