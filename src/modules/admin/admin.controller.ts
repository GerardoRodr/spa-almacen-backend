import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { BackupService } from './backup.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('Administracion y Mantenimiento')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly backupService: BackupService) {}

  @Get('backups')
  @ApiOperation({
    summary:
      'Listar copias de seguridad existentes en el servidor con tamano y fecha',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de respaldos obtenido exitosamente',
  })
  listBackups() {
    return this.backupService.listBackups();
  }

  @Post('backups')
  @ApiOperation({
    summary:
      'Disparar respaldo manual de la base de datos PostgreSQL (almacen_erp)',
  })
  @ApiResponse({
    status: 201,
    description: 'Respaldo generado exitosamente',
  })
  generateBackup() {
    return this.backupService.generateBackup();
  }

  @Post('backups/generate')
  @ApiOperation({
    summary: 'Alias de generacion manual de respaldo (/admin/backups)',
  })
  generateBackupAlias() {
    return this.backupService.generateBackup();
  }

  @Get('backups/:fileName/download')
  @ApiOperation({
    summary: 'Descargar archivo de copia de seguridad en flujo binario',
  })
  @ApiResponse({
    status: 200,
    description: 'Flujo binario del respaldo retornado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Archivo de respaldo no encontrado',
  })
  downloadBackup(
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ) {
    const { stream, sizeBytes } = this.backupService.getBackupStream(fileName);

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Content-Length': String(sizeBytes),
    });

    stream.pipe(res);
  }

  @Get('backups/:fileName')
  @ApiOperation({
    summary: 'Descargar archivo de copia de seguridad (alias directo)',
  })
  downloadBackupDirect(
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ) {
    return this.downloadBackup(fileName, res);
  }

  @Delete('backups/:fileName')
  @ApiOperation({
    summary: 'Eliminar una copia de seguridad especifica del servidor',
  })
  @ApiResponse({
    status: 200,
    description: 'Copia de seguridad eliminada exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Archivo de respaldo no encontrado',
  })
  deleteBackup(@Param('fileName') fileName: string) {
    return this.backupService.deleteBackup(fileName);
  }
}
