import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ItemsService } from './items.service.js';
import { CreateItemDto } from './dto/create-item.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';
import { ItemFilterDto } from './dto/item-filter.dto.js';
import { CreateItemAliasDto } from './dto/create-item-alias.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CostMaskingInterceptor } from '../../common/interceptors/cost-masking.interceptor.js';

@ApiTags('Catalogo de Items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar catalogo de insumos y herramientas paginado' })
  @ApiResponse({ status: 200, description: 'Listado de catalogo obtenido' })
  findAll(@Query() filter: ItemFilterDto) {
    return this.itemsService.findAll(filter);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Registrar un nuevo insumo o herramienta en catalogo maestro' })
  @ApiResponse({ status: 201, description: 'Item registrado exitosamente' })
  @ApiResponse({ status: 409, description: 'SKU duplicado' })
  create(@Body() dto: CreateItemDto) {
    return this.itemsService.create(dto);
  }

  @Get(':id')
  @UseInterceptors(CostMaskingInterceptor)
  @ApiOperation({
    summary: 'Consultar detalle de un item con consolidado de stock en todos los almacenes',
  })
  @ApiResponse({ status: 200, description: 'Detalle de item obtenido' })
  @ApiResponse({ status: 404, description: 'Item no encontrado' })
  findOne(@Param('id') id: string) {
    return this.itemsService.findOne(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar informacion maestra de un item' })
  @ApiResponse({ status: 200, description: 'Item actualizado exitosamente' })
  update(@Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.itemsService.update(id, dto);
  }

  @Post('aliases')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Registrar equivalencia cruda de S10 (ItemAlias) con factor de conversion' })
  @ApiResponse({ status: 201, description: 'Alias de S10 registrado exitosamente' })
  @ApiResponse({ status: 409, description: 'Nombre crudo de S10 ya registrado' })
  createAlias(@Body() dto: CreateItemAliasDto) {
    return this.itemsService.createAlias(dto);
  }

  @Delete('aliases/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar una equivalencia de alias S10' })
  @ApiResponse({ status: 200, description: 'Alias eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Alias no encontrado' })
  deleteAlias(@Param('id') id: string) {
    return this.itemsService.deleteAlias(id);
  }
}
