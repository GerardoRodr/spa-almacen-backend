import {
  Controller,
  Get,
  Post,
  Put,
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
import { WarehousesService } from './warehouses.service.js';
import { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto.js';
import { WarehouseStockFilterDto } from './dto/warehouse-stock-filter.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { WarehouseAccessGuard } from '../../common/guards/warehouse-access.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CostMaskingInterceptor } from '../../common/interceptors/cost-masking.interceptor.js';

@ApiTags('Almacenes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar almacenes accesibles (todos para ADMIN, asignados para WAREHOUSE_KEEPER)',
  })
  @ApiResponse({ status: 200, description: 'Listado de almacenes obtenido exitosamente' })
  findAll(@CurrentUser() user: { id: string; role: Role }) {
    return this.warehousesService.findAll(user);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear un nuevo almacen Central o Almacen de Obra temporal' })
  @ApiResponse({ status: 201, description: 'Almacen creado exitosamente' })
  @ApiResponse({ status: 409, description: 'Nombre de almacen o proyecto ya ocupado' })
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(dto);
  }

  @Get(':id')
  @UseGuards(WarehouseAccessGuard)
  @ApiOperation({ summary: 'Obtener detalle de un almacen por identificador' })
  @ApiResponse({ status: 200, description: 'Detalle de almacen encontrado' })
  @ApiResponse({ status: 404, description: 'Almacen no encontrado' })
  findOne(@Param('id') id: string) {
    return this.warehousesService.findOne(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar informacion basica del almacen' })
  @ApiResponse({ status: 200, description: 'Almacen actualizado exitosamente' })
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehousesService.update(id, dto);
  }

  @Get(':id/stock')
  @UseGuards(WarehouseAccessGuard)
  @UseInterceptors(CostMaskingInterceptor)
  @ApiOperation({
    summary: 'Consultar existencias de stock del almacen (enmascara averageCost a almaceneros)',
  })
  @ApiResponse({ status: 200, description: 'Stock del almacen obtenido correctamente' })
  getStock(
    @Param('id') id: string,
    @Query() filter: WarehouseStockFilterDto,
  ) {
    return this.warehousesService.getStock(id, filter);
  }

  @Get(':id/alerts')
  @UseGuards(WarehouseAccessGuard)
  @ApiOperation({ summary: 'Consultar alertas de stock critico por debajo del umbral minimo' })
  @ApiResponse({ status: 200, description: 'Alertas de reposicion obtenidas' })
  getAlerts(@Param('id') id: string) {
    return this.warehousesService.getAlerts(id);
  }
}
