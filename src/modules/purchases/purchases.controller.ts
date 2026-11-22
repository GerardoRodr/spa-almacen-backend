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
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { PurchasesService } from './purchases.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { CreatePurchaseDto } from './dto/create-purchase.dto.js';
import { PurchaseFilterDto } from './dto/purchase-filter.dto.js';
import { PriceComparisonQueryDto } from './dto/price-comparison-query.dto.js';
import { ValuatePurchaseDto } from './dto/valuate-purchase.dto.js';
import { RevertPurchaseDto } from './dto/revert-purchase.dto.js';
import { UpdatePurchaseMetadataDto } from './dto/update-purchase-metadata.dto.js';
import { ReplacePurchaseDto } from './dto/replace-purchase.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CostMaskingInterceptor } from '../../common/interceptors/cost-masking.interceptor.js';

@ApiTags('Compras')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(CostMaskingInterceptor)
@Controller('purchases')
export class PurchasesController {
  constructor(
    private readonly purchasesService: PurchasesService,
    private readonly documentsService: DocumentsService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.MODERATOR, Role.WAREHOUSE_KEEPER)
  @ApiOperation({
    summary:
      'Listar comprobantes de compra paginados con filtros por proveedor, serie, fechas, almacen y producto',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de compras obtenido exitosamente',
  })
  findAll(
    @Query() filter: PurchaseFilterDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.purchasesService.findAll(filter, user);
  }

  @Get('price-comparison')
  @Roles(Role.ADMIN, Role.MODERATOR)
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
  @Roles(Role.ADMIN, Role.MODERATOR, Role.WAREHOUSE_KEEPER)
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
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.purchasesService.create(dto, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.WAREHOUSE_KEEPER)
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
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.purchasesService.findOne(id, user);
  }

  @Patch(':id/valuation')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      'Valorizar formalmente una compra ingresada a costo cero / guia de remision y recalcular CPP',
  })
  @ApiResponse({
    status: 200,
    description: 'Compra valorizada y costo promedio recalculado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de valorizacion invalidos o compra ya valorizada',
  })
  @ApiResponse({
    status: 404,
    description: 'Comprobante de compra no encontrado',
  })
  valuatePurchase(
    @Param('id') id: string,
    @Body() dto: ValuatePurchaseDto,
  ) {
    return this.purchasesService.valuatePurchase(id, dto);
  }

  @Post(':id/revert')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.WAREHOUSE_KEEPER)
  @ApiOperation({
    summary:
      'Nivel 1: Anular compra, revertir stock y CPP inverso con contra-asiento REVERSAL_EXIT',
  })
  @ApiResponse({
    status: 200,
    description: 'Compra anulada y contra-asiento generado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Stock libre insuficiente para revertir el ingreso de compra',
  })
  @ApiResponse({
    status: 409,
    description: 'La compra ya fue anulada previamente',
  })
  revertPurchase(
    @Param('id') id: string,
    @Body() dto: RevertPurchaseDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.purchasesService.revertPurchase(id, dto, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.WAREHOUSE_KEEPER)
  @ApiOperation({
    summary:
      'Nivel 2: Editar metadatos no contables de comprobante de compra y notas de detalle',
  })
  @ApiResponse({
    status: 200,
    description: 'Metadatos de compra actualizados exitosamente',
  })
  updateMetadata(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseMetadataDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.purchasesService.updateMetadata(id, dto, user);
  }

  @Post(':id/replace')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.WAREHOUSE_KEEPER)
  @ApiOperation({
    summary:
      'Nivel 3: Anular compra original y registrar reemplazo corregido en una transaccion atomica',
  })
  @ApiResponse({
    status: 201,
    description: 'Compra reemplazada atomicamente y vinculada mediante replacedById',
  })
  replacePurchase(
    @Param('id') id: string,
    @Body() dto: ReplacePurchaseDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.purchasesService.replacePurchase(id, dto, user);
  }

  @Post(':id/attachments')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.WAREHOUSE_KEEPER)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'files', maxCount: 10 },
      { name: 'file', maxCount: 1 },
    ]),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Archivos PDF o imagenes (JPG, PNG, WebP) a adjuntar a la compra',
        },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo unico alternativo (PDF o imagen)',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Adjuntar nuevas fotos (optimizadas a WebP) o PDFs a una compra existente',
  })
  @ApiResponse({ status: 201, description: 'Adjuntos cargados exitosamente' })
  @ApiResponse({ status: 400, description: 'Archivo faltante, formato invalido o limite excedido' })
  uploadAttachments(
    @Param('id') id: string,
    @UploadedFiles()
    uploaded: {
      files?: Array<{
        buffer?: Buffer;
        originalname?: string;
        mimetype?: string;
        size?: number;
      }>;
      file?: Array<{
        buffer?: Buffer;
        originalname?: string;
        mimetype?: string;
        size?: number;
      }>;
    },
    @CurrentUser() user: { id: string; role: Role },
  ) {
    const allFiles = [...(uploaded?.files ?? []), ...(uploaded?.file ?? [])];
    if (allFiles.length === 0) {
      throw new BadRequestException(
        'Debe proporcionar al menos un archivo para adjuntar a la compra',
      );
    }

    return this.documentsService.uploadMultiple(
      allFiles,
      { purchaseId: id, isConfidential: true },
      user,
    );
  }

  @Delete(':id/attachments/:attachmentId')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Eliminar un adjunto fisico y su registro DocumentAttachment de una compra (solo ADMIN)',
  })
  @ApiResponse({ status: 200, description: 'Adjunto eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Adjunto no encontrado para esta compra' })
  removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.documentsService.removePurchaseAttachment(id, attachmentId);
  }
}
