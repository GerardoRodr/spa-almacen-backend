import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ItemsController } from './items.controller.js';
import { ItemsService } from './items.service.js';
import { ROLES_KEY } from '../../common/decorators/roles.decorator.js';

describe('ItemsController', () => {
  let controller: ItemsController;
  let itemsService: { remove: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    itemsService = {
      remove: vi.fn(),
    };
    controller = new ItemsController(itemsService as unknown as ItemsService);
  });

  describe('remove', () => {
    it('debe permitir los roles ADMIN y MODERATOR y excluir WAREHOUSE_KEEPER', () => {
      const reflector = new Reflector();
      const roles = reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
        ItemsController.prototype.remove,
        ItemsController,
      ]);

      expect(roles).toContain(Role.ADMIN);
      expect(roles).toContain(Role.MODERATOR);
      expect(roles).not.toContain(Role.WAREHOUSE_KEEPER);
    });

    it('debe delegar remove a itemsService.remove y retornar su resultado', async () => {
      const expected = {
        action: 'DELETED',
        message: 'Insumo eliminado permanentemente del catalogo maestro.',
      };
      itemsService.remove.mockResolvedValue(expected);

      const result = await controller.remove('item-1');

      expect(itemsService.remove).toHaveBeenCalledWith('item-1');
      expect(result).toEqual(expected);
    });
  });
});
