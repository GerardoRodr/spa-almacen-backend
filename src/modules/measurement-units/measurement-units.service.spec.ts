import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { MeasurementUnitsService } from './measurement-units.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('MeasurementUnitsService', () => {
  let service: MeasurementUnitsService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      measurementUnit: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      item: {
        count: vi.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaService;

    service = new MeasurementUnitsService(prisma);
  });

  it('debe listar unidades activas por defecto incluyendo el conteo de items asociados', async () => {
    vi.spyOn(prisma.measurementUnit, 'findMany').mockResolvedValue([
      { id: 'u1', code: 'UND', name: 'Unidad', isActive: true },
      { id: 'u2', code: 'KG', name: 'Kilogramo', isActive: true },
    ] as any);
    vi.spyOn(prisma.item, 'count').mockImplementation(async ({ where }: any) => {
      if (where.baseUnit === 'UND') return 15;
      if (where.baseUnit === 'KG') return 8;
      return 0;
    });

    const result = await service.findAll();

    expect(result.length).toBe(2);
    expect(result[0].code).toBe('UND');
    expect(result[0].itemsCount).toBe(15);
    expect(result[1].code).toBe('KG');
    expect(result[1].itemsCount).toBe(8);
    expect(prisma.measurementUnit.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  });

  it('debe incluir unidades inactivas si includeInactive es true', async () => {
    vi.spyOn(prisma.measurementUnit, 'findMany').mockResolvedValue([] as any);

    await service.findAll(true);

    expect(prisma.measurementUnit.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { name: 'asc' },
    });
  });

  it('debe registrar una nueva unidad de medida en mayusculas', async () => {
    vi.spyOn(prisma.measurementUnit, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.measurementUnit, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.measurementUnit, 'create').mockResolvedValue({
      id: 'u-new',
      code: 'LITRO',
      name: 'Litro',
      description: 'Volumen de liquidos',
      isActive: true,
    } as any);

    const result = await service.create({
      code: '  litro  ',
      name: '  Litro  ',
      description: 'Volumen de liquidos',
    });

    expect(result.code).toBe('LITRO');
    expect(prisma.measurementUnit.create).toHaveBeenCalledWith({
      data: {
        code: 'LITRO',
        name: 'Litro',
        description: 'Volumen de liquidos',
        isActive: true,
      },
    });
  });

  it('debe lanzar ConflictException si el codigo de la unidad ya existe', async () => {
    vi.spyOn(prisma.measurementUnit, 'findUnique').mockResolvedValue({
      id: 'existing',
      code: 'UND',
    } as any);

    await expect(
      service.create({
        code: 'und',
        name: 'Unidad',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('debe lanzar ConflictException si el nombre de la unidad ya existe (case-insensitive)', async () => {
    vi.spyOn(prisma.measurementUnit, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.measurementUnit, 'findFirst').mockResolvedValue({
      id: 'existing',
      name: 'Kilogramo',
    } as any);

    await expect(
      service.create({
        code: 'KG-ALT',
        name: 'kilogramo',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('debe actualizar el nombre o descripcion de una unidad existente', async () => {
    vi.spyOn(prisma.measurementUnit, 'findUnique').mockResolvedValue({
      id: 'u1',
      code: 'UND',
      name: 'Unidad',
    } as any);
    vi.spyOn(prisma.measurementUnit, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.measurementUnit, 'update').mockResolvedValue({
      id: 'u1',
      code: 'UND',
      name: 'Unidad de Medida Oficial',
    } as any);

    const result = await service.update('u1', {
      name: 'Unidad de Medida Oficial',
    });

    expect(result.name).toBe('Unidad de Medida Oficial');
    expect(prisma.measurementUnit.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({
        name: 'Unidad de Medida Oficial',
      }),
    });
  });

  it('debe desactivar logicamente la unidad si tiene insumos asociados al eliminar', async () => {
    vi.spyOn(prisma.measurementUnit, 'findUnique').mockResolvedValue({
      id: 'u1',
      code: 'BOLSA',
      name: 'Bolsa',
    } as any);
    vi.spyOn(prisma.item, 'count').mockResolvedValue(4);
    vi.spyOn(prisma.measurementUnit, 'update').mockResolvedValue({
      id: 'u1',
      isActive: false,
    } as any);

    const result = await service.remove('u1');

    expect(result.action).toBe('DEACTIVATED');
    expect(result.message).toContain('4 insumo(s) asociado(s)');
    expect(prisma.measurementUnit.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { isActive: false },
    });
    expect(prisma.measurementUnit.delete).not.toHaveBeenCalled();
  });

  it('debe eliminar fisicamente la unidad si no tiene insumos asociados', async () => {
    vi.spyOn(prisma.measurementUnit, 'findUnique').mockResolvedValue({
      id: 'u1',
      code: 'CIENTO',
      name: 'Ciento',
    } as any);
    vi.spyOn(prisma.item, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.measurementUnit, 'delete').mockResolvedValue({
      id: 'u1',
    } as any);

    const result = await service.remove('u1');

    expect(result.action).toBe('DELETED');
    expect(prisma.measurementUnit.delete).toHaveBeenCalledWith({
      where: { id: 'u1' },
    });
  });

  it('debe lanzar NotFoundException si se intenta eliminar una unidad inexistente', async () => {
    vi.spyOn(prisma.measurementUnit, 'findUnique').mockResolvedValue(null);

    await expect(service.remove('unknown-id')).rejects.toThrow(NotFoundException);
  });
});
