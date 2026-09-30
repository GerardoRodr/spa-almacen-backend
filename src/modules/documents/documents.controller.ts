import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  Headers,
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
import { DocumentsService } from './documents.service.js';
import { UploadDocumentDto } from './dto/upload-document.dto.js';
import { DocumentFilterDto } from './dto/document-filter.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Documentos y Evidencias')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'Archivo binario PDF (hasta 15MB) o fotografia JPEG, PNG, WebP (hasta 10MB)',
        },
        purchaseId: {
          type: 'string',
          format: 'uuid',
          description: 'Identificador de la factura de compra vinculada',
        },
        transferId: {
          type: 'string',
          format: 'uuid',
          description: 'Identificador de la guia de transferencia vinculada',
        },
        movementId: {
          type: 'string',
          format: 'uuid',
          description: 'Identificador de la salida de consumo o merma vinculada',
        },
        custodyId: {
          type: 'string',
          format: 'uuid',
          description: 'Identificador del vale de custodia vinculado',
        },
        isConfidential: {
          type: 'boolean',
          description:
            'Marca de confidencialidad para restringir a ADMIN (true por defecto en compras)',
        },
      },
    },
  })
  @ApiOperation({
    summary:
      'Cargar archivo o fotografia de evidencia con optimizacion automatica Sharp a WebP',
  })
  @ApiResponse({
    status: 201,
    description: 'Archivo procesado, almacenado y registrado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Tipo de archivo no permitido o tamano superior al limite',
  })
  upload(
    @UploadedFile()
    file: {
      buffer?: Buffer;
      originalname?: string;
      mimetype?: string;
      size?: number;
    },
    @Body() dto: UploadDocumentDto,
  ) {
    return this.documentsService.upload(file, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'Listar documentos adjuntos registrados (filtra confidenciales para almaceneros)',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de documentos obtenido exitosamente',
  })
  findAll(
    @Query() filter: DocumentFilterDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.documentsService.findAll(filter, user);
  }

  @Get(':id/download')
  @ApiOperation({
    summary:
      'Descargar o visualizar archivo binario protegido por streaming autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Flujo binario del archivo retornado exitosamente',
  })
  @ApiResponse({
    status: 403,
    description:
      'Acceso denegado: El documento es confidencial y solo puede ser consultado por administradores',
  })
  @ApiResponse({
    status: 404,
    description: 'Documento o archivo fisico no encontrado',
  })
  async download(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Res() res: Response,
  ) {
    const { stream, doc } = await this.documentsService.getFileStream(id, user);

    res.set({
      'Content-Type': doc.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.originalName)}"`,
      'Content-Length': String(doc.fileSizeBytes),
    });

    stream.pipe(res);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Obtener metadatos o contenido del documento (retorna JSON si se solicita Accept application/json, streaming binario por defecto)',
  })
  @ApiResponse({
    status: 200,
    description: 'Metadatos o flujo binario retornado exitosamente',
  })
  async findOneOrStream(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Headers('accept') acceptHeader: string | undefined,
    @Res() res: Response,
  ) {
    if (acceptHeader && acceptHeader.includes('application/json')) {
      const doc = await this.documentsService.findOne(id, user);
      return res.json(doc);
    }

    const { stream, doc } = await this.documentsService.getFileStream(id, user);

    res.set({
      'Content-Type': doc.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.originalName)}"`,
      'Content-Length': String(doc.fileSizeBytes),
    });

    stream.pipe(res);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Eliminar documento adjunto y su archivo fisico en disco (Exclusivo ADMIN)',
  })
  @ApiResponse({
    status: 200,
    description: 'Documento eliminado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Documento no encontrado',
  })
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }
}
