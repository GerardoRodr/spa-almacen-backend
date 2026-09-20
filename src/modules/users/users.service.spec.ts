import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      warehouse: {
        findMany: vi.fn(),
      },
      userWarehouse: {
        createMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn((cb) => cb(prisma)),
    } as unknown as PrismaService;

    service = new UsersService(prisma);
  });

  it('debe lanzar ConflictException si el correo ya existe al crear', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: '1' } as any);

    await expect(
      service.create({
        email: 'test@correo.com',
        password: 'password123',
        fullName: 'Usuario Prueba',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('debe lanzar NotFoundException si el usuario no existe en findOne', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

    await expect(service.findOne('id-inexistente')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('debe lanzar BadRequestException si se asignan almacenes que no existen', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'usr-1' } as any);
    vi.spyOn(prisma.warehouse, 'findMany').mockResolvedValue([{ id: 'wh-1' }] as any);

    await expect(
      service.assignWarehouses('usr-1', {
        warehouseIds: ['wh-1', 'wh-2'],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
