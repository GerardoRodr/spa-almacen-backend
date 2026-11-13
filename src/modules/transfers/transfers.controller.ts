import {
  Controller,
  Get,
  Post,
  Patch,
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
import { CancelTransferDto } from './dto/cancel-transfer.dto.js';
import { RevertTransferReceptionDto } from './dto/revert-transfer-reception.dto.js';
import { UpdateTransferMetadataDto } from './dto/update-transfer-metadata.dto.js';
import { ReplaceTransferDto } from './dto/replace-transfer.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
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

  @Post(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.WAREHOUSE_KEEPER)
  @UseInterceptors(CostMaskingInterceptor)
  @ApiOperation({
    summary:
      'Nivel 1A: Cancelar una transferencia en estado IN_TRANSIT restaurando stock en origen',
  })
  @ApiResponse({
    status: 200,
    description: 'Transferencia cancelada y stock restaurado en origen',
  })
  @ApiResponse({
    status: 400,
    description: 'Transferencia ya anulada o no esta en estado IN_TRANSIT',
  })
  @ApiResponse({
    status: 403,
    description: 'Sin autorizacion sobre el almacen de origen',
  })
  @ApiResponse({
    status: 404,
    description: 'Transferencia no encontrada',
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelTransferDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.transfersService.cancel(id, dto, user);
  }

  @Post(':id/revert-reception')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.WAREHOUSE_KEEPER)
  @UseInterceptors(CostMaskingInterceptor)
  @ApiOperation({
    summary:
      'Nivel 1B: Revertir recepcion de transferencia (BACK_TO_TRANSIT o CANCEL_COMPLETELY)',
  })
  @ApiResponse({
    status: 200,
    description: 'Recepcion revertida y Kardex compensado correctamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Estado invalido o stock insuficiente en destino para revertir',
  })
  @ApiResponse({
    status: 403,
    description: 'Sin autorizacion sobre el almacen requerido',
  })
  @ApiResponse({
    status: 404,
    description: 'Transferencia no encontrada',
  })
  revertReception(
    @Param('id') id: string,
    @Body() dto: RevertTransferReceptionDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.transfersService.revertReception(id, dto, user);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.WAREHOUSE_KEEPER)
  @UseInterceptors(CostMaskingInterceptor)
  @ApiOperation({
    summary:
      'Nivel 2: Actualizar notas de despacho y/o recepcion de una transferencia activa',
  })
  @ApiResponse({
    status: 200,
    description: 'Metadatos de transferencia actualizados',
  })
  @ApiResponse({
    status: 400,
    description: 'Transferencia anulada o notas de recepcion en transito',
  })
  updateMetadata(
    @Param('id') id: string,
    @Body() dto: UpdateTransferMetadataDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.transfersService.updateMetadata(id, dto, user);
  }

  @Post(':id/replace')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.WAREHOUSE_KEEPER)
  @UseInterceptors(CostMaskingInterceptor)
  @ApiOperation({
    summary:
      'Nivel 3: Reemplazar atomicamente una transferencia IN_TRANSIT (cancela original y emite nueva guia)',
  })
  @ApiResponse({
    status: 201,
    description: 'Transferencia original cancelada y reemplazo despachado',
  })
  @ApiResponse({
    status: 400,
    description: 'Estado invalido o stock insuficiente para el reemplazo',
  })
  replace(
    @Param('id') id: string,
    @Body() dto: ReplaceTransferDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.transfersService.replace(id, dto, user);
  }
}
