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
  ApiQuery,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { TransfersService } from './transfers.service.js';
import { DispatchTransferDto } from './dto/dispatch-transfer.dto.js';
import { ReceiveTransferDto } from './dto/receive-transfer.dto.js';
import { TransferFilterDto } from './dto/transfer-filter.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { WarehouseAccessGuard } from '../../common/guards/warehouse-access.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CostMaskingInterceptor } from '../../common/interceptors/cost-masking.interceptor.js';

@ApiTags('Transferencias Operativas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get()
  @UseInterceptors(CostMaskingInterceptor)
  @ApiOperation({
    summary:
      'Listar transferencias entre almacenes con filtros por estado y paginacion',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de transferencias obtenido correctamente',
  })
  findAll(
    @Query() filter: TransferFilterDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.transfersService.findAll(filter, user);
  }

  @Get('in-transit')
  @UseInterceptors(CostMaskingInterceptor)
  @ApiOperation({
    summary:
      'Listar transferencias en estado IN_TRANSIT pendientes de recepcion en destino',
  })
  @ApiQuery({
    name: 'destWarehouseId',
    required: false,
    description: 'Identificador del almacen destino para filtrar',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de transferencias en transito obtenido correctamente',
  })
  findInTransit(
    @Query('destWarehouseId') destWarehouseId: string | undefined,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.transfersService.findInTransit(destWarehouseId, user);
  }

  @Get(':id')
  @UseInterceptors(CostMaskingInterceptor)
  @ApiOperation({
    summary:
      'Consultar detalle completo de una transferencia, renglones y movimientos',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle de la transferencia obtenido correctamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Transferencia no encontrada',
  })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.transfersService.findOne(id, user);
  }

  @Post('dispatch')
  @UseGuards(WarehouseAccessGuard)
  @ApiOperation({
    summary:
      'Fase 1: Despachar transferencia desde almacen origen (TRANSFER_DISPATCH)',
  })
  @ApiResponse({
    status: 201,
    description:
      'Transferencia despachada en transito y movimiento emitido correctamente',
  })
  @ApiResponse({
    status: 400,
    description:
      'Stock fisico insuficiente en origen o almacenes de origen y destino identicos',
  })
  @ApiResponse({
    status: 403,
    description: 'Sin autorizacion para operar en el almacen de origen',
  })
  dispatch(
    @Body() dto: DispatchTransferDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.transfersService.dispatch(dto, userId);
  }

  @Post(':id/receive')
  @ApiOperation({
    summary:
      'Fase 2: Confirmar recepcion e inspeccion en caseta de obra (TRANSFER_RECEIPT / SHRINKAGE_EXIT)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Recepcion confirmada, stock de destino incrementado y mermas asentadas si hubo faltantes',
  })
  @ApiResponse({
    status: 400,
    description:
      'Transferencia no esta en estado IN_TRANSIT o cantidades invalidas',
  })
  @ApiResponse({
    status: 403,
    description: 'Sin autorizacion para recibir en el almacen de destino',
  })
  @ApiResponse({
    status: 404,
    description: 'Transferencia no encontrada',
  })
  receive(
    @Param('id') id: string,
    @Body() dto: ReceiveTransferDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.transfersService.receive(id, dto, user);
  }
}
