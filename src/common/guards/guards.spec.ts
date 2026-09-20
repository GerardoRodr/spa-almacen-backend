import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionContext, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard.js';
import { WarehouseAccessGuard } from './warehouse-access.guard.js';

describe('Guards de Seguridad', () => {
  describe('RolesGuard', () => {
    let reflector: Reflector;
    let guard: RolesGuard;

    beforeEach(() => {
      reflector = new Reflector();
      guard = new RolesGuard(reflector);
    });

    it('debe permitir acceso si el endpoint no tiene roles requeridos', () => {
      reflector.getAllAndOverride = () => undefined;
      const context = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: Role.WAREHOUSE_KEEPER } }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('debe permitir acceso si el usuario tiene el rol requerido', () => {
      reflector.getAllAndOverride = () => [Role.ADMIN];
      const context = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: Role.ADMIN } }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('debe lanzar ForbiddenException si el usuario no tiene el rol requerido', () => {
      reflector.getAllAndOverride = () => [Role.ADMIN];
      const context = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: Role.WAREHOUSE_KEEPER } }),
        }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('WarehouseAccessGuard', () => {
    let guard: WarehouseAccessGuard;

    beforeEach(() => {
      guard = new WarehouseAccessGuard();
    });

    it('debe otorgar bypass directo a usuarios con rol ADMIN', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { role: Role.ADMIN },
            headers: {},
            params: {},
            query: {},
            body: {},
          }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('debe permitir acceso al almacenero si el almacen esta asignado', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              role: Role.WAREHOUSE_KEEPER,
              assignedWarehouses: [{ warehouseId: 'wh-1' }],
            },
            headers: { 'x-warehouse-id': 'wh-1' },
            params: {},
            query: {},
            body: {},
          }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('debe denegar acceso si el almacen no esta asignado al almacenero', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              role: Role.WAREHOUSE_KEEPER,
              assignedWarehouses: [{ warehouseId: 'wh-1' }],
            },
            headers: { 'x-warehouse-id': 'wh-otra' },
            params: {},
            query: {},
            body: {},
          }),
        }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('debe exigir el identificador de almacen si no esta presente', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              role: Role.WAREHOUSE_KEEPER,
              assignedWarehouses: [{ warehouseId: 'wh-1' }],
            },
            headers: {},
            params: {},
            query: {},
            body: {},
          }),
        }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(BadRequestException);
    });
  });
});
