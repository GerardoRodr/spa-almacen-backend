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
import { Role, ItemType } from '@prisma/client';
import { ItemsService } from './items.service.js';
import { CreateItemDto } from './dto/create-item.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';
import { ItemFilterDto } from './dto/item-filter.dto.js';
import { CreateItemAliasDto } from './dto/create-item-alias.dto.js';
import { UpdateItemAliasDto } from './dto/update-item-alias.dto.js';
import { ItemAliasFilterDto } from './dto/item-alias-filter.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CostMaskingInterceptor } from '../../common/interceptors/cost-masking.interceptor.js';

@ApiTags('Catalogo de Items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  @UseInterceptors(CostMaskingInterceptor)
  @ApiOperation({ summary: 'Listar catalogo de insumos y herramientas paginado' })
  @ApiResponse({ status: 200, description: 'Listado de catalogo obtenido' })
  findAll(@Query() filter: ItemFilterDto) {
    return this.itemsService.findAll(filter);
  }

  @Get('next-sku')
  @ApiOperation({ summary: 'Previsualizar el siguiente SKU sugerido segun clasificacion' })
  @ApiResponse({ status: 200, description: 'Siguiente SKU sugerido' })
  getNextSku(@Query('type') type?: ItemType) {
    return this.itemsService.previewNextSku(type ?? ItemType.CONSUMABLE);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.WAREHOUSE_KEEPER)
  @UseInterceptors(CostMaskingInterceptor)
  @ApiOperation({ summary: 'Registrar un nuevo insumo o herramienta en catalogo maestro (con stock inicial opcional)' })
  @ApiResponse({ status: 201, description: 'Item registrado exitosamente' })
  @ApiResponse({ status: 409, description: 'SKU duplicado' })
  create(
    @Body() dto: CreateItemDto,
    @CurrentUser() user: { id: string; role: Role; assignedWarehouses?: Array<{ warehouseId: string }> },
  ) {
    return this.itemsService.create(dto, user);
  }

  @Get('perishable-alerts')
  @UseInterceptors(CostMaskingInterceptor)
  @ApiOperation({
    summary: 'Listar alertas de insumos perecibles con existencias activas en almacenes',
  })
  @ApiResponse({
    status: 200,
    description: 'Alertas de insumos perecibles obtenidas exitosamente',
  })
  getPerishableAlerts(@Query('warehouseId') warehouseId?: string) {
    return this.itemsService.getPerishableAlerts(warehouseId);
  }

  @Get('aliases')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary: 'Listar equivalencias S10 (ItemAlias) paginadas con busqueda por codigo, texto S10 o insumo maestro',
  })
  @ApiResponse({ status: 200, description: 'Listado de alias S10 obtenido' })
  findAllAliases(@Query() filter: ItemAliasFilterDto) {
    return this.itemsService.findAllAliases(filter);
  }

  @Post('aliases')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Registrar equivalencia cruda de S10 (ItemAlias) con factor de conversion' })
  @ApiResponse({ status: 201, description: 'Alias de S10 registrado exitosamente' })
  @ApiResponse({ status: 409, description: 'Nombre crudo de S10 ya registrado' })
  createAlias(@Body() dto: CreateItemAliasDto) {
    return this.itemsService.createAlias(dto);
  }

  @Put('aliases/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Actualizar equivalencia de alias S10 (producto maestro, unidad o factor)' })
  @ApiResponse({ status: 200, description: 'Alias actualizado exitosamente' })
  @ApiResponse({ status: 404, description: 'Alias no encontrado' })
  @ApiResponse({ status: 409, description: 'Nombre crudo de S10 ya registrado en otro alias' })
  updateAlias(@Param('id') id: string, @Body() dto: UpdateItemAliasDto) {
    return this.itemsService.updateAlias(id, dto);
  }

  @Delete('aliases/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Eliminar una equivalencia de alias S10' })
  @ApiResponse({ status: 200, description: 'Alias eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Alias no encontrado' })
  deleteAlias(@Param('id') id: string) {
    return this.itemsService.deleteAlias(id);
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
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Actualizar informacion maestra de un item' })
  @ApiResponse({ status: 200, description: 'Item actualizado exitosamente' })
  update(@Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.itemsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Eliminar fisicamente o desactivar logicamente un item del catalogo (solo ADMIN, stock = 0)',
  })
  @ApiResponse({ status: 200, description: 'Item eliminado o desactivado exitosamente' })
  @ApiResponse({ status: 400, description: 'El item posee stock fisico, reservado o custodias activas' })
  @ApiResponse({ status: 404, description: 'Item no encontrado' })
  remove(@Param('id') id: string) {
    return this.itemsService.remove(id);
  }
}
