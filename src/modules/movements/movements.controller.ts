import {
  Controller,
  Get,
  Post,
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
import { MovementsService } from './movements.service.js';
import { CreateConsumptionExitDto } from './dto/create-consumption-exit.dto.js';
import { CreateShrinkageExitDto } from './dto/create-shrinkage-exit.dto.js';
import {
  CreateInventoryAdjustmentDto,
} from './dto/create-inventory-adjustment.dto.js';
import { MovementFilterDto } from './dto/movement-filter.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { WarehouseAccessGuard } from '../../common/guards/warehouse-access.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CostMaskingInterceptor } from '../../common/interceptors/cost-masking.interceptor.js';

@ApiTags('Movimientos e Inventario Kardex')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('movements')
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  @Get()
  @UseInterceptors(CostMaskingInterceptor)
  @ApiOperation({
    summary:
      'Consultar libro mayor Kardex con filtros por fecha, almacen, item y tipo de movimiento',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de movimientos obtenido correctamente',
  })
  findAll(
    @Query() filter: MovementFilterDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.movementsService.findAll(filter, user);
  }

  @Get(':id')
  @UseInterceptors(CostMaskingInterceptor)
  @ApiOperation({
    summary:
      'Consultar detalle completo de un movimiento append-only de inventario',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle del movimiento obtenido correctamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Movimiento no encontrado',
  })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.movementsService.findOne(id, user);
  }

  @Post('consumption')
  @UseGuards(WarehouseAccessGuard)
  @ApiOperation({
    summary:
      'Registrar salida definitiva de material consumible a cuadrilla en obra (CONSUMPTION_EXIT)',
  })
  @ApiResponse({
    status: 201,
    description:
      'Salida por consumo registrada exitosamente en Kardex e imputada al proyecto',
  })
  @ApiResponse({
    status: 400,
    description:
      'Stock fisico insuficiente en caseta o intento de consumo sobre un item ASSET_TOOL',
  })
  @ApiResponse({
    status: 403,
    description: 'Sin autorizacion para operar en el almacen especificado',
  })
  createConsumptionExit(
    @Body() dto: CreateConsumptionExitDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.movementsService.createConsumptionExit(dto, userId);
  }

  @Post('shrinkage')
  @UseGuards(WarehouseAccessGuard)
  @ApiOperation({
    summary:
      'Registrar salida por merma, rotura o desecho fisico no recuperable (SHRINKAGE_EXIT)',
  })
  @ApiResponse({
    status: 201,
    description: 'Merma registrada exitosamente y descontada del stock fisico',
  })
  @ApiResponse({
    status: 400,
    description: 'Stock fisico insuficiente para procesar la merma',
  })
  @ApiResponse({
    status: 403,
    description: 'Sin autorizacion para operar en el almacen especificado',
  })
  createShrinkageExit(
    @Body() dto: CreateShrinkageExitDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.movementsService.createShrinkageExit(dto, userId);
  }

  @Post('adjustment')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Registrar regularizacion formal de inventario fisico (INVENTORY_ADJUSTMENT - Exclusivo ADMIN)',
  })
  @ApiResponse({
    status: 201,
    description:
      'Ajuste de inventario fisico procesado y asentado inmutablemente en Kardex',
  })
  @ApiResponse({
    status: 400,
    description:
      'Ajuste negativo supera existencias fisicas o argumentos invalidos',
  })
  @ApiResponse({
    status: 403,
    description:
      'Acceso denegado: solo administradores pueden registrar ajustes de inventario',
  })
  createInventoryAdjustment(
    @Body() dto: CreateInventoryAdjustmentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.movementsService.createInventoryAdjustment(dto, userId);
  }
}
