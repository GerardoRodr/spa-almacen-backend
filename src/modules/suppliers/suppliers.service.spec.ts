import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let prisma: {
    supplier: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    prisma = {
      supplier: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<SuppliersService>(SuppliersService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debe retornar lista paginada de proveedores', async () => {
      const mockSuppliers = [
        {
          id: 'sup-1',
          taxId: '20100138112',
          businessName: 'ACEROS AREQUIPA',
          _count: { purchases: 3 },
        },
      ];

      prisma.supplier.count.mockResolvedValue(1);
      prisma.supplier.findMany.mockResolvedValue(mockSuppliers);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toEqual(mockSuppliers);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('findOne', () => {
    it('debe retornar el proveedor si existe', async () => {
      const mockSupplier = {
        id: 'sup-1',
        taxId: '20100138112',
        businessName: 'ACEROS AREQUIPA',
        purchases: [],
        _count: { purchases: 0 },
      };

      prisma.supplier.findUnique.mockResolvedValue(mockSupplier);

      const result = await service.findOne('sup-1');
      expect(result).toEqual(mockSupplier);
    });

    it('debe lanzar NotFoundException si el proveedor no existe', async () => {
      prisma.supplier.findUnique.mockResolvedValue(null);

      await expect(service.findOne('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('debe registrar un nuevo proveedor exitosamente', async () => {
      const dto = {
        taxId: '20100138112',
        businessName: 'ACEROS AREQUIPA',
        contactPhone: '+51 1 5171800',
        contactEmail: 'ventas@aceros.com',
        address: 'Av. Meiggs 297',
      };

      prisma.supplier.findUnique.mockResolvedValue(null);
      prisma.supplier.create.mockResolvedValue({ id: 'sup-1', ...dto });

      const result = await service.create(dto);
      expect(result.id).toBe('sup-1');
      expect(prisma.supplier.create).toHaveBeenCalled();
    });

    it('debe lanzar ConflictException si el RUC ya esta registrado', async () => {
      const dto = {
        taxId: '20100138112',
        businessName: 'ACEROS AREQUIPA',
      };

      prisma.supplier.findUnique.mockResolvedValue({ id: 'otro-sup' });

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('debe actualizar el proveedor correctamente', async () => {
      const existing = {
        id: 'sup-1',
        taxId: '20100138112',
        businessName: 'ACEROS AREQUIPA',
      };

      prisma.supplier.findUnique.mockResolvedValue(existing);
      prisma.supplier.update.mockResolvedValue({
        ...existing,
        businessName: 'ACEROS AREQUIPA S.A.',
      });

      const result = await service.update('sup-1', {
        businessName: 'ACEROS AREQUIPA S.A.',
      });

      expect(result.businessName).toBe('ACEROS AREQUIPA S.A.');
    });

    it('debe lanzar NotFoundException si el proveedor a actualizar no existe', async () => {
      prisma.supplier.findUnique.mockResolvedValue(null);

      await expect(
        service.update('inexistente', { businessName: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
