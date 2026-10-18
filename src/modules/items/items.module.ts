import { Module } from '@nestjs/common';
import { ItemsService } from './items.service.js';
import { ItemsController } from './items.controller.js';
import { ItemCategoriesController } from './item-categories.controller.js';

@Module({
  controllers: [ItemsController, ItemCategoriesController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}
