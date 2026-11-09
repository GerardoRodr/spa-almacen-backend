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
import { MeasurementUnitsService } from './measurement-units.service.js';
import { CreateMeasurementUnitDto } from './dto/create-measurement-unit.dto.js';
import { UpdateMeasurementUnitDto } from './dto/update-measurement-unit.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('Unidades de Medida')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('measurement-units')
export class MeasurementUnitsController {
  constructor(
    private readonly measurementUnitsService: MeasurementUnitsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar unidades de medida maestras para catalogo',
  })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    description: 'Incluir unidades de medida inactivas (por defecto false)',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de unidades de medida obtenido exitosamente',
  })
  findAll(@Query('includeInactive') includeInactive?: string) {
    const shouldInclude = includeInactive === 'true';
    return this.measurementUnitsService.findAll(shouldInclude);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener detalle de una unidad de medida por UUID o codigo',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle de la unidad de medida',
  })
  @ApiResponse({
    status: 404,
    description: 'Unidad de medida no encontrada',
  })
  findOne(@Param('id') id: string) {
    return this.measurementUnitsService.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Crear una nueva unidad de medida maestra (Solo ADMIN)',
  })
  @ApiResponse({
    status: 201,
    description: 'Unidad de medida creada exitosamente',
  })
  @ApiResponse({
    status: 409,
    description: 'Codigo o nombre de unidad de medida duplicado',
  })
  create(@Body() dto: CreateMeasurementUnitDto) {
    return this.measurementUnitsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Actualizar nombre, descripcion o estado de una unidad de medida (Solo ADMIN)',
  })
  @ApiResponse({
    status: 200,
    description: 'Unidad de medida actualizada exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Unidad de medida no encontrada',
  })
  @ApiResponse({
    status: 409,
    description: 'Nombre duplicado con otra unidad existente',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMeasurementUnitDto,
  ) {
    return this.measurementUnitsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Eliminar unidad de medida si no tiene items asociados o desactivar si tiene dependencias (Solo ADMIN)',
  })
  @ApiResponse({
    status: 200,
    description: 'Unidad de medida eliminada o desactivada exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Unidad de medida no encontrada',
  })
  remove(@Param('id') id: string) {
    return this.measurementUnitsService.remove(id);
  }
}
