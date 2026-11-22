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
  UploadedFile,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { ProjectsService } from './projects.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ProjectFilterDto } from './dto/project-filter.dto.js';
import { IngestS10Dto } from './dto/ingest-s10.dto.js';
import { AllocateStockDto } from './dto/allocate-stock.dto.js';
import { ReleaseStockDto } from './dto/release-stock.dto.js';
import { LiquidateProjectDto } from './dto/liquidate-project.dto.js';
import { CreateProjectRequirementDto } from './dto/create-project-requirement.dto.js';
import { UpdateProjectRequirementDto } from './dto/update-project-requirement.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CostMaskingInterceptor } from '../../common/interceptors/cost-masking.interceptor.js';
import { ProjectDetailResponseDto } from './dto/project-response.dto.js';
import { GapAnalysisResponseDto } from './dto/gap-analysis-response.dto.js';

@ApiTags('Proyectos y S10')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(CostMaskingInterceptor)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Listar proyectos y obras civiles accesibles (todas para ADMIN, asignadas para WAREHOUSE_KEEPER)',
  })
  @ApiResponse({
    status: 200,
    type: [ProjectDetailResponseDto],
    description: 'Listado de proyectos obtenido exitosamente',
  })
  findAll(
    @Query() filter: ProjectFilterDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.projectsService.findAll(filter, user);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary: 'Registrar un nuevo proyecto civil y su almacen de obra temporal asociado',
  })
  @ApiResponse({
    status: 201,
    description: 'Proyecto civil y almacen creados exitosamente',
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un proyecto con ese nombre',
  })
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Consultar detalle de un proyecto civil, requerimientos presupuestados y almacen asociado',
  })
  @ApiResponse({
    status: 200,
    type: ProjectDetailResponseDto,
    description: 'Detalle del proyecto obtenido exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Proyecto no encontrado',
  })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.projectsService.findOne(id, user);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary: 'Actualizar informacion general y estado del proyecto civil',
  })
  @ApiResponse({
    status: 200,
    description: 'Proyecto actualizado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Proyecto no encontrado',
  })
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Post(':id/ingest-s10')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      'Ingesta de presupuesto S10 via payload estructurado JSON con resolucion de alias',
  })
  @ApiResponse({
    status: 200,
    description: 'Presupuesto procesado y requerimientos registrados exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Proyecto liquidado o datos de partidas invalidos',
  })
  ingestS10(@Param('id') id: string, @Body() dto: IngestS10Dto) {
    return this.projectsService.ingestS10(id, dto);
  }

  @Post(':id/s10-import')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo exportado de S10 en formato CSV o TXT delimitado',
        },
      },
    },
  })
  @ApiOperation({
    summary:
      'Importar presupuesto S10 desde archivo CSV/TXT con deteccion de encoding y delimitadores',
  })
  @ApiResponse({
    status: 200,
    description: 'Archivo S10 procesado y requerimientos actualizados',
  })
  @ApiResponse({
    status: 400,
    description: 'Archivo corrupto, vacio o proyecto en estado liquidado',
  })
  importS10File(
    @Param('id') id: string,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string },
  ) {
    return this.projectsService.importS10File(id, file);
  }

  @Get(':id/s10-file')
  @ApiOperation({
    summary: 'Descargar el archivo CSV/TXT de S10 persistido en el proyecto',
  })
  @ApiResponse({ status: 200, description: 'Archivo CSV de S10 retornado exitosamente' })
  @ApiResponse({ status: 404, description: 'Proyecto o archivo S10 no encontrado' })
  async downloadS10File(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Res() res: Response,
  ) {
    const { stream, fileName, mimeType } =
      await this.projectsService.getS10FileStream(id, user);

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    });

    stream.pipe(res);
  }

  @Delete(':id/s10-file')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary: 'Eliminar el archivo S10 guardado en disco y limpiar metadatos del proyecto',
  })
  @ApiResponse({ status: 200, description: 'Archivo S10 eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Proyecto o archivo S10 no encontrado' })
  deleteS10File(@Param('id') id: string) {
    return this.projectsService.deleteS10File(id);
  }

  @Post(':id/requirements')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Agregar manualmente un insumo a la Matriz de Brechas del proyecto (solo ADMIN)',
  })
  @ApiResponse({ status: 201, description: 'Requerimiento agregado exitosamente' })
  @ApiResponse({ status: 409, description: 'El insumo ya existe en la matriz del proyecto' })
  addRequirement(
    @Param('id') id: string,
    @Body() dto: CreateProjectRequirementDto,
  ) {
    return this.projectsService.addRequirement(id, dto);
  }

  @Put(':id/requirements/:reqId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Editar cantidad, precio referencial S10 o reasignar insumo en la matriz (solo ADMIN)',
  })
  @ApiResponse({ status: 200, description: 'Requerimiento actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Violacion de reglas de reserva o consumo' })
  updateRequirement(
    @Param('id') id: string,
    @Param('reqId') reqId: string,
    @Body() dto: UpdateProjectRequirementDto,
  ) {
    return this.projectsService.updateRequirement(id, reqId, dto);
  }

  @Delete(':id/requirements/:reqId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Eliminar una fila de requerimiento de la Matriz de Brechas (solo ADMIN)',
  })
  @ApiResponse({ status: 200, description: 'Requerimiento eliminado exitosamente' })
  @ApiResponse({ status: 400, description: 'El requerimiento tiene stock reservado o consumido' })
  deleteRequirement(
    @Param('id') id: string,
    @Param('reqId') reqId: string,
  ) {
    return this.projectsService.deleteRequirement(id, reqId);
  }

  @Get(':id/gap-analysis')
  @ApiOperation({
    summary:
      'Consultar Matriz de Brechas (Gap Analysis) comparando presupuesto, reservas y consumos',
  })
  @ApiResponse({
    status: 200,
    type: GapAnalysisResponseDto,
    description: 'Matriz de brechas calculada exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Proyecto no encontrado',
  })
  getGapAnalysis(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.projectsService.getGapAnalysis(id, user);
  }

  @Post(':id/allocate-stock')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      'Reservar existencias fisicas en Almacen Central a favor del proyecto (Opcion A)',
  })
  @ApiResponse({
    status: 200,
    description: 'Stock reservado exitosamente en Almacen Central',
  })
  @ApiResponse({
    status: 400,
    description: 'Stock disponible insuficiente o insumo no presupuestado',
  })
  allocateStock(
    @Param('id') id: string,
    @Body() dto: AllocateStockDto,
  ) {
    return this.projectsService.allocateStock(id, dto);
  }

  @Post(':id/release-stock')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      'Liberar existencias reservadas en Almacen Central y retornarlas al stock disponible',
  })
  @ApiResponse({
    status: 200,
    description: 'Stock liberado de la reserva del proyecto exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Cantidad a liberar supera la reserva del proyecto',
  })
  releaseStock(
    @Param('id') id: string,
    @Body() dto: ReleaseStockDto,
  ) {
    return this.projectsService.releaseStock(id, dto);
  }

  @Post(':id/liquidate')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      'Ejecutar protocolo de liquidacion formal y cierre del almacen de obra',
  })
  @ApiResponse({
    status: 200,
    description: 'Obra civil liquidada y almacen desactivado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description:
      'Incumplimiento de las 3 condiciones: stock remanente, herramientas sin devolver o transferencias en transito',
  })
  @ApiResponse({
    status: 409,
    description: 'El proyecto ya fue liquidado previamente',
  })
  liquidate(
    @Param('id') id: string,
    @Body() dto: LiquidateProjectDto,
  ) {
    return this.projectsService.liquidate(id, dto);
  }
}
