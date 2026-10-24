import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ItemType, MeterType, Role, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StartMachineryShiftDto } from './dto/start-machinery-shift.dto.js';
import { EndMachineryShiftDto } from './dto/end-machinery-shift.dto.js';
import { MachineryShiftFilterDto } from './dto/machinery-shift-filter.dto.js';

@Injectable()
export class MachineryService {
  constructor(private readonly prisma: PrismaService) {}

  // Enriquecer registros de turnos resolviendo metadatos de fotografias adjuntas
  private async enrichShiftsWithPhotos<T extends {
    startPhotoId?: string | null;
    endPhotoId?: string | null;
    fuelPhotoId?: string | null;
  }>(shifts: T[]) {
    const photoIds = new Set<string>();
    for (const shift of shifts) {
      if (shift.startPhotoId) photoIds.add(shift.startPhotoId);
      if (shift.endPhotoId) photoIds.add(shift.endPhotoId);
      if (shift.fuelPhotoId) photoIds.add(shift.fuelPhotoId);
    }

    if (photoIds.size === 0) {
      return shifts.map((s) => ({
        ...s,
        startPhoto: null,
        endPhoto: null,
        fuelPhoto: null,
      }));
    }

    const docs = await this.prisma.documentAttachment.findMany({
      where: { id: { in: Array.from(photoIds) } },
      select: {
        id: true,
        originalName: true,
        storedPath: true,
        mimeType: true,
        fileSizeBytes: true,
      },
    });

    const docMap = new Map(docs.map((d) => [d.id, d]));

    return shifts.map((s) => ({
      ...s,
      startPhoto: s.startPhotoId ? docMap.get(s.startPhotoId) ?? null : null,
      endPhoto: s.endPhotoId ? docMap.get(s.endPhotoId) ?? null : null,
      fuelPhoto: s.fuelPhotoId ? docMap.get(s.fuelPhotoId) ?? null : null,
    }));
  }

  // Enriquecer un unico turno con sus fotografias
  private async enrichShiftPhotos<T extends {
    startPhotoId?: string | null;
    endPhotoId?: string | null;
    fuelPhotoId?: string | null;
  }>(shift: T) {
    const [enriched] = await this.enrichShiftsWithPhotos([shift]);
    return enriched;
  }

  // Iniciar nueva jornada de trabajo de maquinaria con lectura de horometro inicial y foto
  async startShift(
    dto: StartMachineryShiftDto,
    user: { id: string; role: Role },
  ) {
    // 1. Validar que el item exista y este catalogado como MACHINERY
    const item = await this.prisma.item.findUnique({
      where: { id: dto.itemId },
    });
    if (!item) {
      throw new NotFoundException('Maquinaria no encontrada');
    }
    if (item.type !== ItemType.MACHINERY) {
      throw new BadRequestException(
        'El item seleccionado no esta clasificado como maquinaria (MACHINERY)',
      );
    }

    // 2. Validar que el almacen exista y se encuentre activo
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException('Almacen u obra no encontrado');
    }
    if (!warehouse.isActive) {
      throw new BadRequestException('El almacen o caseta no se encuentra activo');
    }

    // 3. Validar permisos de acceso al almacen si es almacenero
    if (user.role === Role.WAREHOUSE_KEEPER) {
      const userWarehouse = await this.prisma.userWarehouse.findUnique({
        where: {
          userId_warehouseId: {
            userId: user.id,
            warehouseId: dto.warehouseId,
          },
        },
      });
      if (!userWarehouse) {
        throw new ForbiddenException(
          'No tiene autorizacion para operar en este almacen u obra',
        );
      }
    }

    // 4. Validar que la maquina no tenga un turno abierto activo
    const activeShift = await this.prisma.machineryShiftLog.findFirst({
      where: {
        itemId: dto.itemId,
        endDateTime: null,
      },
    });
    if (activeShift) {
      throw new BadRequestException(
        'La maquinaria ya cuenta con una jornada de trabajo activa sin cerrar',
      );
    }

    // 5. Validar coherencia de la lectura inicial respecto a la ultima lectura cerrada
    const meterType = item.meterType ?? MeterType.HOUR_METER;
    const meterLabel =
      meterType === MeterType.KILOMETER ? 'kilometraje' : 'horometro';

    const lastClosedShift = await this.prisma.machineryShiftLog.findFirst({
      where: {
        itemId: dto.itemId,
        endDateTime: { not: null },
      },
      orderBy: { endDateTime: 'desc' },
    });

    if (
      lastClosedShift &&
      lastClosedShift.endMeter !== null &&
      Number(dto.startMeter) < Number(lastClosedShift.endMeter)
    ) {
      throw new BadRequestException(
        `El ${meterLabel} inicial (${dto.startMeter}) no puede ser menor al ultimo ${meterLabel} registrado (${String(lastClosedShift.endMeter)})`,
      );
    }

    // 6. Validar que la fotografia inicial exista
    const startPhoto = await this.prisma.documentAttachment.findUnique({
      where: { id: dto.startPhotoId },
    });
    if (!startPhoto) {
      throw new NotFoundException(
        `La fotografia del ${meterLabel} inicial no fue encontrada en el sistema`,
      );
    }

    // 7. Persistir la apertura de jornada
    const shift = await this.prisma.machineryShiftLog.create({
      data: {
        itemId: dto.itemId,
        warehouseId: dto.warehouseId,
        operatorName: dto.operatorName.trim(),
        operatorDni: dto.operatorDni.trim(),
        meterType,
        startMeter: dto.startMeter,
        startPhotoId: dto.startPhotoId,
        notes: dto.notes ? dto.notes.trim() : null,
        startDateTime: new Date(),
      },
      include: {
        item: {
          select: {
            id: true,
            sku: true,
            name: true,
            baseUnit: true,
            type: true,
            meterType: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    return this.enrichShiftPhotos(shift);
  }

  // Finalizar jornada de maquinaria, validar lectura final y calcular uso efectivo (horas o km)
  async endShift(
    id: string,
    dto: EndMachineryShiftDto,
    user: { id: string; role: Role },
  ) {
    const shift = await this.prisma.machineryShiftLog.findUnique({
      where: { id },
      include: {
        item: true,
        warehouse: true,
      },
    });

    if (!shift) {
      throw new NotFoundException('Jornada de maquinaria no encontrada');
    }

    // 1. Validar autorizacion de almacen si el usuario es almacenero
    if (user.role === Role.WAREHOUSE_KEEPER) {
      const userWarehouse = await this.prisma.userWarehouse.findUnique({
        where: {
          userId_warehouseId: {
            userId: user.id,
            warehouseId: shift.warehouseId,
          },
        },
      });
      if (!userWarehouse) {
        throw new ForbiddenException(
          'No tiene autorizacion para operar en este almacen u obra',
        );
      }
    }

    // 2. Validar que el turno no este cerrado previamente
    if (shift.endDateTime !== null || shift.endMeter !== null) {
      throw new BadRequestException(
        'Esta jornada de trabajo ya ha sido cerrada anteriormente',
      );
    }

    // 3. Validar que la lectura final no sea menor a la inicial
    const meterType =
      shift.meterType ?? shift.item?.meterType ?? MeterType.HOUR_METER;
    const meterLabel =
      meterType === MeterType.KILOMETER ? 'kilometraje' : 'horometro';
    const startMeter = Number(shift.startMeter);
    const endMeter = Number(dto.endMeter);

    if (endMeter < startMeter) {
      throw new BadRequestException(
        `El ${meterLabel} final (${endMeter}) no puede ser menor al ${meterLabel} inicial (${startMeter})`,
      );
    }

    // 4. Validar existencia de la fotografia final
    const endPhoto = await this.prisma.documentAttachment.findUnique({
      where: { id: dto.endPhotoId },
    });
    if (!endPhoto) {
      throw new NotFoundException(
        `La fotografia del ${meterLabel} final no fue encontrada en el sistema`,
      );
    }

    // 5. Validar fotografia de combustible si fue proporcionada
    if (dto.fuelPhotoId) {
      const fuelPhoto = await this.prisma.documentAttachment.findUnique({
        where: { id: dto.fuelPhotoId },
      });
      if (!fuelPhoto) {
        throw new NotFoundException(
          'La fotografia de combustible no fue encontrada en el sistema',
        );
      }
    }

    // 6. Calcular total de uso efectivo (horas trabajadas o kilometros recorridos)
    const totalUsage = Number((endMeter - startMeter).toFixed(2));

    let finalNotes = shift.notes;
    if (dto.notes?.trim()) {
      finalNotes = finalNotes
        ? `${finalNotes} | Cierre: ${dto.notes.trim()}`
        : dto.notes.trim();
    }

    const updatedShift = await this.prisma.machineryShiftLog.update({
      where: { id },
      data: {
        endMeter: dto.endMeter,
        totalUsage,
        endPhotoId: dto.endPhotoId,
        fuelPhotoId: dto.fuelPhotoId ?? null,
        notes: finalNotes,
        endDateTime: new Date(),
      },
      include: {
        item: {
          select: {
            id: true,
            sku: true,
            name: true,
            baseUnit: true,
            type: true,
            meterType: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    return this.enrichShiftPhotos(updatedShift);
  }

  // Consultar historial de jornadas con filtros cronologicos y segregacion por almacen
  async findAll(
    filter: MachineryShiftFilterDto,
    user: { id: string; role: Role },
  ) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.MachineryShiftLogWhereInput = {};

    // Segregacion por rol: almacenero solo ve almacenes asignados
    if (user.role === Role.WAREHOUSE_KEEPER) {
      const userWarehouses = await this.prisma.userWarehouse.findMany({
        where: { userId: user.id },
        select: { warehouseId: true },
      });
      const allowedIds = userWarehouses.map((uw) => uw.warehouseId);

      if (filter.warehouseId) {
        if (!allowedIds.includes(filter.warehouseId)) {
          return {
            data: [],
            meta: { total: 0, page, limit, totalPages: 1 },
          };
        }
        where.warehouseId = filter.warehouseId;
      } else {
        where.warehouseId = { in: allowedIds };
      }
    } else if (filter.warehouseId) {
      where.warehouseId = filter.warehouseId;
    }

    if (filter.itemId) {
      where.itemId = filter.itemId;
    }

    if (filter.operatorDni) {
      where.operatorDni = filter.operatorDni.trim();
    }

    if (filter.onlyOpen) {
      where.endDateTime = null;
    }

    if (filter.startDate || filter.endDate) {
      where.startDateTime = {};
      if (filter.startDate) {
        where.startDateTime.gte = new Date(filter.startDate);
      }
      if (filter.endDate) {
        where.startDateTime.lte = new Date(filter.endDate);
      }
    }

    const [total, rawData] = await Promise.all([
      this.prisma.machineryShiftLog.count({ where }),
      this.prisma.machineryShiftLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDateTime: 'desc' },
        include: {
          item: {
            select: {
              id: true,
              sku: true,
              name: true,
              baseUnit: true,
              type: true,
              meterType: true,
            },
          },
          warehouse: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      }),
    ]);

    const data = await this.enrichShiftsWithPhotos(rawData);

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

  // Obtener detalle completo de una jornada por identificador
  async findOne(id: string, user: { id: string; role: Role }) {
    const shift = await this.prisma.machineryShiftLog.findUnique({
      where: { id },
      include: {
        item: true,
        warehouse: true,
      },
    });

    if (!shift) {
      throw new NotFoundException('Jornada de maquinaria no encontrada');
    }

    if (user.role === Role.WAREHOUSE_KEEPER) {
      const userWarehouse = await this.prisma.userWarehouse.findUnique({
        where: {
          userId_warehouseId: {
            userId: user.id,
            warehouseId: shift.warehouseId,
          },
        },
      });
      if (!userWarehouse) {
        throw new ForbiddenException(
          'No tiene autorizacion para consultar jornadas de este almacen u obra',
        );
      }
    }

    return this.enrichShiftPhotos(shift);
  }

  // Consultar estado operativo actual de una maquinaria (turno en marcha, tipo de medidor y ultima lectura)
  async getStatus(itemId: string, _user: { id: string; role: Role }) {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundException('Maquinaria no encontrada');
    }

    if (item.type !== ItemType.MACHINERY) {
      throw new BadRequestException(
        'El item consultado no corresponde a una maquinaria (MACHINERY)',
      );
    }

    const [activeShift, lastClosedShift] = await Promise.all([
      this.prisma.machineryShiftLog.findFirst({
        where: { itemId, endDateTime: null },
        include: {
          warehouse: { select: { id: true, name: true, type: true } },
          item: {
            select: {
              id: true,
              sku: true,
              name: true,
              baseUnit: true,
              type: true,
              meterType: true,
            },
          },
        },
      }),
      this.prisma.machineryShiftLog.findFirst({
        where: { itemId, endDateTime: { not: null } },
        orderBy: { endDateTime: 'desc' },
      }),
    ]);

    const enrichedActiveShift = activeShift
      ? await this.enrichShiftPhotos(activeShift)
      : null;

    return {
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      meterType: item.meterType ?? MeterType.HOUR_METER,
      hasActiveShift: !!activeShift,
      activeShift: enrichedActiveShift,
      lastMeter: lastClosedShift ? Number(lastClosedShift.endMeter) : null,
      lastShiftEndDateTime: lastClosedShift ? lastClosedShift.endDateTime : null,
    };
  }
}
