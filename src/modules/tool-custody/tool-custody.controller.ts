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
import { ToolCustodyService } from './tool-custody.service.js';
import { DispatchToolCustodyDto } from './dto/dispatch-tool-custody.dto.js';
import { ReturnToolCustodyDto } from './dto/return-tool-custody.dto.js';
import { ToolCustodyFilterDto } from './dto/tool-custody-filter.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { WarehouseAccessGuard } from '../../common/guards/warehouse-access.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Custodia de Herramientas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tools/custody')
export class ToolCustodyController {
  constructor(private readonly toolCustodyService: ToolCustodyService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar vales de prestamo de herramientas con paginacion y filtros',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de vales obtenido correctamente',
  })
  findAll(
    @Query() filter: ToolCustodyFilterDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.toolCustodyService.findAll(filter, user);
  }

  @Post('dispatch')
  @UseGuards(WarehouseAccessGuard)
  @ApiOperation({
    summary:
      'Despachar herramienta en prestamo temporal a operario con vale de custodia',
  })
  @ApiResponse({
    status: 201,
    description: 'Vale de custodia emitido exitosamente (LOAN_DISPATCH)',
  })
  @ApiResponse({
    status: 400,
    description: 'Item no es de tipo ASSET_TOOL o stock insuficiente en caseta',
  })
  @ApiResponse({
    status: 403,
    description: 'Sin autorizacion para operar en el almacen',
  })
  dispatch(
    @Body() dto: DispatchToolCustodyDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.toolCustodyService.dispatch(dto, userId);
  }

  @Post(':id/return')
  @ApiOperation({
    summary:
      'Registrar retorno a caseta y calificacion fisica (LOAN_RETURN o baja SHRINKAGE_EXIT)',
  })
  @ApiResponse({
    status: 200,
    description: 'Devolucion procesada y calificada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'El vale ya ha sido devuelto anteriormente',
  })
  @ApiResponse({
    status: 404,
    description: 'Vale de custodia o stock no encontrado',
  })
  processReturn(
    @Param('id') id: string,
    @Body() dto: ReturnToolCustodyDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.toolCustodyService.processReturn(id, dto, userId);
  }

  @Get('worker/:dni')
  @ApiOperation({
    summary:
      'Consultar herramientas actualmente no devueltas en poder de un operario por DNI',
  })
  @ApiResponse({
    status: 200,
    description: 'Historial de herramientas activas en poder del operario',
  })
  getWorkerDebt(@Param('dni') dni: string) {
    return this.toolCustodyService.getWorkerDebt(dni);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener detalle completo de un vale de custodia por identificador',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle de vale encontrado',
  })
  @ApiResponse({
    status: 404,
    description: 'Vale de custodia no encontrado',
  })
  findOne(@Param('id') id: string) {
    return this.toolCustodyService.findOne(id);
  }
}
