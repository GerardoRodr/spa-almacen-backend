import {
  Controller,
  Get,
  Post,
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
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PurchasesService } from './purchases.service.js';
import { CreatePurchaseDto } from './dto/create-purchase.dto.js';
import { PurchaseFilterDto } from './dto/purchase-filter.dto.js';
import { PriceComparisonQueryDto } from './dto/price-comparison-query.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Compras')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Listar comprobantes de compra paginados con filtros por proveedor, serie, fechas, almacen y producto',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de compras obtenido exitosamente',
  })
  findAll(@Query() filter: PurchaseFilterDto) {
    return this.purchasesService.findAll(filter);
  }

  @Get('price-comparison')
  @ApiOperation({
    summary:
      'Obtener cuadro comparativo de precios historicos de compras y proveedores por insumo',
  })
  @ApiResponse({
    status: 200,
    description: 'Cuadro comparativo obtenido exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Debe especificar itemId o termino search',
  })
  @ApiResponse({
    status: 404,
    description: 'Insumo no encontrado en el catalogo',
  })
  getPriceComparison(@Query() query: PriceComparisonQueryDto) {
    return this.purchasesService.getPriceComparison(query);
  }

  @Post()
  @ApiOperation({
    summary:
      'Registrar factura de compra e ingreso a Almacen Central o de Obra con recalculo atomico de CPP',
  })
  @ApiResponse({
    status: 201,
    description: 'Compra registrada e inventario valorizado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de compra invalidos o almacen inactivo',
  })
  @ApiResponse({
    status: 404,
    description: 'Proveedor, almacen o items no encontrados',
  })
  create(
    @Body() dto: CreatePurchaseDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.purchasesService.create(dto, userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener detalle completo de un comprobante de compra por identificador',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle de compra obtenido exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Comprobante de compra no encontrado',
  })
  findOne(@Param('id') id: string) {
    return this.purchasesService.findOne(id);
  }
}
