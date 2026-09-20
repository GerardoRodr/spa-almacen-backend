import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;
  let configService: ConfigService;

  beforeEach(() => {
    usersService = {
      findByEmailForAuth: vi.fn(),
      findOne: vi.fn(),
    } as unknown as UsersService;

    jwtService = {
      signAsync: vi.fn().mockResolvedValue('token-firmado'),
      verifyAsync: vi.fn(),
    } as unknown as JwtService;

    configService = {
      get: vi.fn((key: string) => {
        if (key === 'jwt.secret') return 'test-secret';
        if (key === 'jwt.refreshSecret') return 'test-refresh-secret';
        if (key === 'jwt.expiresIn') return '15m';
        if (key === 'jwt.refreshExpiresIn') return '7d';
        return null;
      }),
    } as unknown as ConfigService;

    service = new AuthService(usersService, jwtService, configService);
  });

  it('debe lanzar UnauthorizedException si el usuario no existe en login', async () => {
    vi.spyOn(usersService, 'findByEmailForAuth').mockResolvedValue(null);

    await expect(
      service.login({ email: 'inexistente@correo.com', password: 'password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('debe lanzar UnauthorizedException si el usuario esta inactivo', async () => {
    vi.spyOn(usersService, 'findByEmailForAuth').mockResolvedValue({
      id: '1',
      isActive: false,
    } as any);

    await expect(
      service.login({ email: 'inactivo@correo.com', password: 'password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('debe lanzar UnauthorizedException si la contrasena no coincide', async () => {
    vi.spyOn(usersService, 'findByEmailForAuth').mockResolvedValue({
      id: '1',
      isActive: true,
      passwordHash: await bcrypt.hash('clave-correcta', 10),
      assignedWarehouses: [],
    } as any);

    await expect(
      service.login({ email: 'usuario@correo.com', password: 'clave-erronea' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('debe emitir tokens y usuario si las credenciales son validas', async () => {
    const password = 'PasswordSeguro123!';
    const hash = await bcrypt.hash(password, 10);

    vi.spyOn(usersService, 'findByEmailForAuth').mockResolvedValue({
      id: 'user-1',
      email: 'admin@almacen.com',
      fullName: 'Admin',
      role: Role.ADMIN,
      isActive: true,
      passwordHash: hash,
      assignedWarehouses: [
        {
          warehouseId: 'wh-1',
          isDefault: true,
          warehouse: {
            name: 'Central',
            type: 'CENTRAL',
            isTemporary: false,
          },
        },
      ],
    } as any);

    const result = await service.login({ email: 'admin@almacen.com', password });

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result.user.email).toBe('admin@almacen.com');
    expect(result.user.assignedWarehouses.length).toBe(1);
  });
});
