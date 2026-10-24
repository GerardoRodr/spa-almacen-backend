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
import { MachineryService } from './machinery.service.js';
import { StartMachineryShiftDto } from './dto/start-machinery-shift.dto.js';
import { EndMachineryShiftDto } from './dto/end-machinery-shift.dto.js';
import { MachineryShiftFilterDto } from './dto/machinery-shift-filter.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { WarehouseAccessGuard } from '../../common/guards/warehouse-access.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Maquinaria, Horometros y Kilometrajes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('machinery')
export class MachineryController {
  constructor(private readonly machineryService: MachineryService) {}

  @Post('shift/start')
  @UseGuards(WarehouseAccessGuard)
  @ApiOperation({
    summary:
      'Registrar inicio de jornada de maquinaria con captura de horometro o kilometraje inicial y foto',
  })
  @ApiResponse({
    status: 201,
    description: 'Jornada de maquinaria iniciada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description:
      'Item no es maquinaria, ya tiene turno activo o lectura inicial es invalida',
  })
  @ApiResponse({
    status: 403,
    description: 'Sin autorizacion para operar en el almacen',
  })
  @ApiResponse({
    status: 404,
    description: 'Maquinaria, almacen o foto inicial no encontrada',
  })
  startShift(
    @Body() dto: StartMachineryShiftDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.machineryService.startShift(dto, user);
  }

  @Post('shift/:id/end')
  @ApiOperation({
    summary:
      'Registrar cierre de jornada de maquinaria con horometro o kilometraje final, calculo de consumo y foto',
  })
  @ApiResponse({
    status: 200,
    description: 'Jornada cerrada y uso consumido (horas o kilometros) calculado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description:
      'Turno ya cerrado anteriormente o lectura final menor a la inicial',
  })
  @ApiResponse({
    status: 403,
    description: 'Sin autorizacion para operar en el almacen de la jornada',
  })
  @ApiResponse({
    status: 404,
    description: 'Jornada de maquinaria o fotografia no encontrada',
  })
  endShift(
    @Param('id') id: string,
    @Body() dto: EndMachineryShiftDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.machineryService.endShift(id, dto, user);
  }

  @Get('shifts')
  @ApiOperation({
    summary:
      'Listar historial de jornadas de maquinaria con filtros y paginacion',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de jornadas obtenido exitosamente',
  })
  findAll(
    @Query() filter: MachineryShiftFilterDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.machineryService.findAll(filter, user);
  }

  @Get('shifts/:id')
  @ApiOperation({
    summary:
      'Consultar detalle completo de una jornada de maquinaria por identificador',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle de la jornada encontrado',
  })
  @ApiResponse({
    status: 404,
    description: 'Jornada de maquinaria no encontrada',
  })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.machineryService.findOne(id, user);
  }

  @Get('item/:itemId/status')
  @ApiOperation({
    summary:
      'Consultar estado de jornada activa, tipo de medidor y ultima lectura registrada de una maquinaria',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado operativo actual de la maquinaria retornado',
  })
  @ApiResponse({
    status: 400,
    description: 'El item no corresponde a una maquinaria (MACHINERY)',
  })
  @ApiResponse({
    status: 404,
    description: 'Maquinaria no encontrada',
  })
  getStatus(
    @Param('itemId') itemId: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.machineryService.getStatus(itemId, user);
  }
}
