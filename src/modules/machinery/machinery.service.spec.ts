import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ItemType, MeterType, Role } from '@prisma/client';
import { MachineryService } from './machinery.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('MachineryService', () => {
  let service: MachineryService;
  let prisma: {
    item: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    warehouse: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    userWarehouse: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    documentAttachment: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    machineryShiftLog: {
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
  };

  const adminUser = { id: 'admin-1', role: Role.ADMIN };
  const keeperUser = { id: 'keeper-1', role: Role.WAREHOUSE_KEEPER };

  beforeEach(() => {
    prisma = {
      item: {
        findUnique: vi.fn(),
      },
      warehouse: {
        findUnique: vi.fn(),
      },
      userWarehouse: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      documentAttachment: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      machineryShiftLog: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };

    service = new MachineryService(prisma as unknown as PrismaService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('startShift', () => {
    const baseDto = {
      itemId: 'maq-1',
      warehouseId: 'wh-1',
      operatorName: 'Carlos Huaman',
      operatorDni: '45678912',
      startMeter: 1250.5,
      startPhotoId: 'photo-1',
      notes: 'Inicio de turno',
    };

    it('debe lanzar NotFoundException si la maquinaria no existe', async () => {
      prisma.item.findUnique.mockResolvedValue(null);

      await expect(service.startShift(baseDto, adminUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe lanzar BadRequestException si el item no es de tipo MACHINERY', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 'maq-1',
        type: ItemType.EQUIPMENT,
      });

      await expect(service.startShift(baseDto, adminUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar NotFoundException si el almacen no existe', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 'maq-1',
        type: ItemType.MACHINERY,
        meterType: MeterType.HOUR_METER,
      });
      prisma.warehouse.findUnique.mockResolvedValue(null);

      await expect(service.startShift(baseDto, adminUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe lanzar BadRequestException si el almacen esta inactivo', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 'maq-1',
        type: ItemType.MACHINERY,
        meterType: MeterType.HOUR_METER,
      });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-1',
        isActive: false,
      });

      await expect(service.startShift(baseDto, adminUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar ForbiddenException si el almacenero no tiene asignado el almacen', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 'maq-1',
        type: ItemType.MACHINERY,
        meterType: MeterType.HOUR_METER,
      });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-1',
        isActive: true,
      });
      prisma.userWarehouse.findUnique.mockResolvedValue(null);

      await expect(service.startShift(baseDto, keeperUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('debe lanzar BadRequestException si la maquina ya tiene una jornada activa sin cerrar', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 'maq-1',
        type: ItemType.MACHINERY,
        meterType: MeterType.HOUR_METER,
      });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-1',
        isActive: true,
      });
      prisma.machineryShiftLog.findFirst.mockResolvedValueOnce({
        id: 'shift-open',
        endDateTime: null,
      });

      await expect(service.startShift(baseDto, adminUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar BadRequestException si la lectura inicial es menor que la ultima lectura final cerrada', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 'maq-1',
        type: ItemType.MACHINERY,
        meterType: MeterType.HOUR_METER,
      });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-1',
        isActive: true,
      });
      prisma.machineryShiftLog.findFirst
        .mockResolvedValueOnce(null) // no hay turno abierto
        .mockResolvedValueOnce({
          id: 'shift-prev',
          endMeter: 1260.0,
        });

      await expect(service.startShift(baseDto, adminUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe adaptar mensaje de error a kilometraje cuando la maquina usa KILOMETER', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 'maq-vol-1',
        type: ItemType.MACHINERY,
        meterType: MeterType.KILOMETER,
      });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-1',
        isActive: true,
      });
      prisma.machineryShiftLog.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'shift-prev-km',
          endMeter: 45500.0,
        });

      await expect(
        service.startShift({ ...baseDto, startMeter: 45400.0 }, adminUser),
      ).rejects.toThrow(/kilometraje inicial/);
    });

    it('debe lanzar NotFoundException si la foto inicial no existe en adjuntos', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 'maq-1',
        type: ItemType.MACHINERY,
        meterType: MeterType.HOUR_METER,
      });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-1',
        isActive: true,
      });
      prisma.machineryShiftLog.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.documentAttachment.findUnique.mockResolvedValue(null);

      await expect(service.startShift(baseDto, adminUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe iniciar la jornada exitosamente y resolver metadatos de la fotografia inicial', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 'maq-1',
        type: ItemType.MACHINERY,
        meterType: MeterType.HOUR_METER,
      });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-1',
        isActive: true,
      });
      prisma.machineryShiftLog.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'shift-prev',
          endMeter: 1240.0,
        });
      prisma.documentAttachment.findUnique.mockResolvedValue({
        id: 'photo-1',
        originalName: 'horometro_inicio.webp',
      });

      const createdShift = {
        id: 'shift-1',
        itemId: 'maq-1',
        warehouseId: 'wh-1',
        operatorName: 'Carlos Huaman',
        operatorDni: '45678912',
        meterType: MeterType.HOUR_METER,
        startMeter: 1250.5,
        startPhotoId: 'photo-1',
        endPhotoId: null,
        fuelPhotoId: null,
        startDateTime: new Date(),
        endDateTime: null,
        item: {
          id: 'maq-1',
          sku: 'MAQ-RET-001',
          name: 'Retroexcavadora',
          meterType: MeterType.HOUR_METER,
        },
        warehouse: { id: 'wh-1', name: 'Almacen Obra' },
      };

      prisma.machineryShiftLog.create.mockResolvedValue(createdShift);
      prisma.documentAttachment.findMany.mockResolvedValue([
        {
          id: 'photo-1',
          originalName: 'horometro_inicio.webp',
          storedPath: 'general/2026/10/photo-1.webp',
          mimeType: 'image/webp',
          fileSizeBytes: 85000,
        },
      ]);

      const result = await service.startShift(baseDto, adminUser);

      expect(prisma.machineryShiftLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            meterType: MeterType.HOUR_METER,
            startMeter: 1250.5,
          }),
        }),
      );
      expect(result.id).toBe('shift-1');
      expect(result.startPhoto?.originalName).toBe('horometro_inicio.webp');
    });
  });

  describe('endShift', () => {
    const endDto = {
      endMeter: 1258.5,
      endPhotoId: 'photo-end',
      fuelPhotoId: 'photo-fuel',
      notes: 'Jornada concluida sin novedad',
    };

    it('debe lanzar NotFoundException si el turno no existe', async () => {
      prisma.machineryShiftLog.findUnique.mockResolvedValue(null);

      await expect(service.endShift('none', endDto, adminUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe lanzar ForbiddenException si el almacenero no tiene acceso al almacen del turno', async () => {
      prisma.machineryShiftLog.findUnique.mockResolvedValue({
        id: 's-1',
        warehouseId: 'wh-2',
        endDateTime: null,
      });
      prisma.userWarehouse.findUnique.mockResolvedValue(null);

      await expect(service.endShift('s-1', endDto, keeperUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('debe lanzar BadRequestException si el turno ya fue cerrado anteriormente', async () => {
      prisma.machineryShiftLog.findUnique.mockResolvedValue({
        id: 's-1',
        warehouseId: 'wh-1',
        endDateTime: new Date(),
        endMeter: 1260.0,
      });

      await expect(service.endShift('s-1', endDto, adminUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar BadRequestException si la lectura final es menor a la lectura inicial', async () => {
      prisma.machineryShiftLog.findUnique.mockResolvedValue({
        id: 's-1',
        warehouseId: 'wh-1',
        meterType: MeterType.HOUR_METER,
        startMeter: 1250.0,
        endDateTime: null,
        endMeter: null,
      });

      await expect(
        service.endShift('s-1', { ...endDto, endMeter: 1240.0 }, adminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar NotFoundException si la foto final no existe', async () => {
      prisma.machineryShiftLog.findUnique.mockResolvedValue({
        id: 's-1',
        warehouseId: 'wh-1',
        meterType: MeterType.HOUR_METER,
        startMeter: 1250.0,
        endDateTime: null,
        endMeter: null,
      });
      prisma.documentAttachment.findUnique.mockResolvedValue(null);

      await expect(service.endShift('s-1', endDto, adminUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe cerrar la jornada, calcular totalUsage correctamente y enriquecer fotos', async () => {
      prisma.machineryShiftLog.findUnique.mockResolvedValue({
        id: 's-1',
        warehouseId: 'wh-1',
        meterType: MeterType.HOUR_METER,
        startMeter: 1250.0,
        notes: 'Inicio normal',
        endDateTime: null,
        endMeter: null,
        startPhotoId: 'photo-start',
      });

      prisma.documentAttachment.findUnique
        .mockResolvedValueOnce({ id: 'photo-end' })
        .mockResolvedValueOnce({ id: 'photo-fuel' });

      const updated = {
        id: 's-1',
        itemId: 'maq-1',
        warehouseId: 'wh-1',
        meterType: MeterType.HOUR_METER,
        startMeter: 1250.0,
        endMeter: 1258.5,
        totalUsage: 8.5,
        startPhotoId: 'photo-start',
        endPhotoId: 'photo-end',
        fuelPhotoId: 'photo-fuel',
        notes: 'Inicio normal | Cierre: Jornada concluida sin novedad',
        endDateTime: new Date(),
        item: { sku: 'MAQ-RET-001', meterType: MeterType.HOUR_METER },
        warehouse: { name: 'Almacen Obra' },
      };

      prisma.machineryShiftLog.update.mockResolvedValue(updated);
      prisma.documentAttachment.findMany.mockResolvedValue([
        { id: 'photo-start', originalName: 'start.webp' },
        { id: 'photo-end', originalName: 'end.webp' },
        { id: 'photo-fuel', originalName: 'fuel.webp' },
      ]);

      const result = await service.endShift('s-1', endDto, adminUser);

      expect(prisma.machineryShiftLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            endMeter: 1258.5,
            totalUsage: 8.5,
            endPhotoId: 'photo-end',
            fuelPhotoId: 'photo-fuel',
          }),
        }),
      );
      expect(result.totalUsage).toBe(8.5);
      expect(result.endPhoto?.originalName).toBe('end.webp');
    });
  });

  describe('findAll', () => {
    it('debe listar jornadas con paginacion y filtros para ADMIN', async () => {
      prisma.machineryShiftLog.count.mockResolvedValue(1);
      prisma.machineryShiftLog.findMany.mockResolvedValue([
        {
          id: 's-1',
          startPhotoId: null,
          endPhotoId: null,
          fuelPhotoId: null,
        },
      ]);

      const res = await service.findAll(
        { onlyOpen: true, page: 1, limit: 10 },
        adminUser,
      );

      expect(res.meta.total).toBe(1);
      expect(res.data).toHaveLength(1);
      expect(prisma.machineryShiftLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { endDateTime: null },
          skip: 0,
          take: 10,
        }),
      );
    });

    it('debe restringir almacenes para almaceneros', async () => {
      prisma.userWarehouse.findMany.mockResolvedValue([
        { warehouseId: 'wh-permitido' },
      ]);
      prisma.machineryShiftLog.count.mockResolvedValue(0);
      prisma.machineryShiftLog.findMany.mockResolvedValue([]);

      const res = await service.findAll(
        { warehouseId: 'wh-otro' },
        keeperUser,
      );

      expect(res.data).toHaveLength(0);
      expect(res.meta.total).toBe(0);
    });
  });

  describe('findOne', () => {
    it('debe lanzar NotFoundException si no existe el turno', async () => {
      prisma.machineryShiftLog.findUnique.mockResolvedValue(null);

      await expect(service.findOne('none', adminUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe retornar turno con fotos enriquecidas', async () => {
      prisma.machineryShiftLog.findUnique.mockResolvedValue({
        id: 's-1',
        warehouseId: 'wh-1',
        startPhotoId: 'p-1',
        endPhotoId: null,
        fuelPhotoId: null,
      });
      prisma.documentAttachment.findMany.mockResolvedValue([
        { id: 'p-1', originalName: 'inicial.webp' },
      ]);

      const result = await service.findOne('s-1', adminUser);
      expect(result.id).toBe('s-1');
      expect(result.startPhoto?.originalName).toBe('inicial.webp');
    });
  });

  describe('getStatus', () => {
    it('debe retornar estado operativo, tipo de medidor, turno activo y ultima lectura de la maquinaria', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 'maq-1',
        sku: 'MAQ-VOL-001',
        name: 'Camion Volquete',
        type: ItemType.MACHINERY,
        meterType: MeterType.KILOMETER,
      });

      prisma.machineryShiftLog.findFirst
        .mockResolvedValueOnce({
          id: 'shift-active-1',
          meterType: MeterType.KILOMETER,
          startMeter: 45345.5,
          endDateTime: null,
          startPhotoId: null,
          endPhotoId: null,
          fuelPhotoId: null,
        })
        .mockResolvedValueOnce({
          id: 'shift-prev-1',
          meterType: MeterType.KILOMETER,
          endMeter: 45345.5,
          endDateTime: new Date('2026-10-10'),
        });

      const status = await service.getStatus('maq-1', adminUser);

      expect(status.itemId).toBe('maq-1');
      expect(status.meterType).toBe(MeterType.KILOMETER);
      expect(status.hasActiveShift).toBe(true);
      expect(status.activeShift?.id).toBe('shift-active-1');
      expect(status.lastMeter).toBe(45345.5);
    });

    it('debe lanzar BadRequestException si el item no es maquinaria', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 'cemento',
        type: ItemType.CONSUMABLE,
      });

      await expect(service.getStatus('cemento', adminUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
