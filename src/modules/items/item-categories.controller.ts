import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ItemsService } from './items.service.js';
import { CreateItemCategoryDto } from './dto/create-item-category.dto.js';
import { UpdateItemCategoryDto } from './dto/update-item-category.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('Clasificaciones de Insumos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('item-categories')
export class ItemCategoriesController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar clasificaciones de insumos personalizadas',
  })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    description: 'Incluir clasificaciones inactivas (por defecto false)',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de clasificaciones obtenido exitosamente',
  })
  findAll(@Query('includeInactive') includeInactive?: string) {
    const shouldInclude = includeInactive === 'true';
    return this.itemsService.findAllCategories(shouldInclude);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Crear una nueva clasificacion personalizada de insumos',
  })
  @ApiResponse({
    status: 201,
    description: 'Clasificacion creada exitosamente',
  })
  @ApiResponse({
    status: 409,
    description: 'Nombre o codigo de clasificacion duplicado',
  })
  create(@Body() dto: CreateItemCategoryDto) {
    return this.itemsService.createCategory(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Actualizar nombre, codigo, descripcion o estado de una clasificacion',
  })
  @ApiResponse({
    status: 200,
    description: 'Clasificacion actualizada exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Clasificacion no encontrada',
  })
  @ApiResponse({
    status: 409,
    description: 'Nombre o codigo duplicado con otra clasificacion',
  })
  update(@Param('id') id: string, @Body() dto: UpdateItemCategoryDto) {
    return this.itemsService.updateCategory(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Eliminar clasificacion si no tiene items asociados o desactivar si tiene dependencias',
  })
  @ApiResponse({
    status: 200,
    description: 'Clasificacion eliminada o desactivada exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Clasificacion no encontrada',
  })
  remove(@Param('id') id: string) {
    return this.itemsService.removeCategory(id);
  }
}
