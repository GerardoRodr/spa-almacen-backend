import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Role, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from './storage.service.js';
import { UploadDocumentDto } from './dto/upload-document.dto.js';
import { DocumentFilterDto } from './dto/document-filter.dto.js';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_PDF_TYPE = 'application/pdf';
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_PDF_SIZE = 15 * 1024 * 1024; // 15 MB

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  // Helper para obtener almacenes autorizados para un usuario
  private async getAllowedWarehouseIds(userId: string): Promise<string[]> {
    const userWarehouses = await this.prisma.userWarehouse.findMany({
      where: { userId },
      select: { warehouseId: true },
    });
    return userWarehouses.map((uw) => uw.warehouseId);
  }

  // Resolver y validar la categoria y existencia de la entidad foranea vinculada
  private async resolveCategoryAndValidate(
    dto: UploadDocumentDto,
    user?: { id: string; role: Role },
  ): Promise<string> {
    if (dto.purchaseId) {
      const purchase = await this.prisma.purchase.findUnique({
        where: { id: dto.purchaseId },
      });
      if (!purchase) {
        throw new NotFoundException('La compra vinculada no existe');
      }
      if (user?.role === Role.WAREHOUSE_KEEPER) {
        const allowedIds = await this.getAllowedWarehouseIds(user.id);
        if (
          !purchase.warehouseId ||
          !allowedIds.includes(purchase.warehouseId)
        ) {
          throw new ForbiddenException(
            'No tiene permisos para adjuntar documentos en compras de otro almacen',
          );
        }
      }
      return 'purchases';
    }
    if (dto.transferId) {
      const transfer = await this.prisma.transfer.findUnique({
        where: { id: dto.transferId },
      });
      if (!transfer) {
        throw new NotFoundException('La transferencia vinculada no existe');
      }
      return 'transfers';
    }
    if (dto.movementId) {
      const movement = await this.prisma.movement.findUnique({
        where: { id: dto.movementId },
      });
      if (!movement) {
        throw new NotFoundException('El movimiento vinculado no existe');
      }
      return 'movements';
    }
    if (dto.custodyId) {
      const custody = await this.prisma.toolCustody.findUnique({
        where: { id: dto.custodyId },
      });
      if (!custody) {
        throw new NotFoundException('El vale de custodia vinculado no existe');
      }
      return 'custody';
    }
    return 'general';
  }

  // Determinar marca de confidencialidad
  private resolveConfidentiality(dto: UploadDocumentDto): boolean {
    if (dto.isConfidential !== undefined) {
      return dto.isConfidential;
    }
    if (dto.purchaseId) {
      return true;
    }
    return false;
  }

  // Validar formato y procesar archivo con Sharp o guardar PDF
  private async processFile(
    file: {
      buffer?: Buffer;
      originalname?: string;
      mimetype?: string;
      size?: number;
    },
    category: string,
  ) {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Archivo no proporcionado o vacio');
    }

    const mime = (file.mimetype || '').toLowerCase().trim();
    const isImage = ALLOWED_IMAGE_TYPES.includes(mime);
    const isPdf = mime === ALLOWED_PDF_TYPE;

    if (!isImage && !isPdf) {
      throw new BadRequestException(
        'Tipo de archivo no permitido. Solo se aceptan PDF (hasta 15MB) o imagenes JPEG, PNG y WebP (hasta 10MB)',
      );
    }

    const fileSize = file.size ?? file.buffer.length;
    if (isImage && fileSize > MAX_IMAGE_SIZE) {
      throw new BadRequestException(
        'El tamano de la imagen supera el limite permitido de 10 MB',
      );
    }
    if (isPdf && fileSize > MAX_PDF_SIZE) {
      throw new BadRequestException(
        'El tamano del PDF supera el limite permitido de 15 MB',
      );
    }

    return isImage
      ? await this.storageService.processAndSaveImage(file.buffer, category)
      : await this.storageService.savePdf(file.buffer, category);
  }

  // Subir, optimizar con Sharp y persistir metadatos del documento individual
  async upload(
    file: {
      buffer?: Buffer;
      originalname?: string;
      mimetype?: string;
      size?: number;
    },
    dto: UploadDocumentDto,
    user?: { id: string; role: Role },
  ) {
    const category = await this.resolveCategoryAndValidate(dto, user);
    const isConfidential = this.resolveConfidentiality(dto);
    const saved = await this.processFile(file, category);

    try {
      return await this.prisma.documentAttachment.create({
        data: {
          purchaseId: dto.purchaseId ?? null,
          transferId: dto.transferId ?? null,
          movementId: dto.movementId ?? null,
          custodyId: dto.custodyId ?? null,
          proofType: dto.proofType ?? null,
          originalName: file.originalname?.trim() || 'documento',
          storedPath: saved.storedPath,
          mimeType: saved.mimeType,
          fileSizeBytes: saved.fileSizeBytes,
          isConfidential,
        },
      });
    } catch (error) {
      // Revertir archivo fisico si la insercion en base de datos falla
      await this.storageService.deleteFile(saved.storedPath);
      throw error;
    }
  }

  // Subir multiples documentos en paralelo optimizando con Sharp
  async uploadMultiple(
    files: Array<{
      buffer?: Buffer;
      originalname?: string;
      mimetype?: string;
      size?: number;
    }>,
    dto: UploadDocumentDto,
    user?: { id: string; role: Role },
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException(
        'No se han proporcionado archivos para la carga multiple',
      );
    }

    if (files.length > 10) {
      throw new BadRequestException(
        'Se permite un maximo de 10 archivos por carga',
      );
    }

    const category = await this.resolveCategoryAndValidate(dto, user);
    const isConfidential = this.resolveConfidentiality(dto);

    const savedPaths: string[] = [];
    try {
      // Procesar todos los archivos en paralelo acumulando rutas para rollback
      const processedFiles = await Promise.all(
        files.map(async (file) => {
          const saved = await this.processFile(file, category);
          savedPaths.push(saved.storedPath);
          return {
            originalName: file.originalname?.trim() || 'documento',
            saved,
          };
        }),
      );

      // Persistir todos los adjuntos creados
      return await Promise.all(
        processedFiles.map(({ originalName, saved }) =>
          this.prisma.documentAttachment.create({
            data: {
              purchaseId: dto.purchaseId ?? null,
              transferId: dto.transferId ?? null,
              movementId: dto.movementId ?? null,
              custodyId: dto.custodyId ?? null,
              proofType: dto.proofType ?? null,
              originalName,
              storedPath: saved.storedPath,
              mimeType: saved.mimeType,
              fileSizeBytes: saved.fileSizeBytes,
              isConfidential,
            },
          }),
        ),
      );
    } catch (error) {
      // Revertir y limpiar archivos en disco si falla la base de datos o el procesamiento
      await Promise.allSettled(
        savedPaths.map((p) => this.storageService.deleteFile(p)),
      );
      throw error;
    }
  }

  // Listar documentos con filtros y proteccion de confidencialidad
  async findAll(filter: DocumentFilterDto, user: { id: string; role: Role }) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.DocumentAttachmentWhereInput = {};

    if (filter.purchaseId) where.purchaseId = filter.purchaseId;
    if (filter.transferId) where.transferId = filter.transferId;
    if (filter.movementId) where.movementId = filter.movementId;
    if (filter.custodyId) where.custodyId = filter.custodyId;
    if (filter.proofType) where.proofType = filter.proofType;

    // Almaceneros solo ven documentos no confidenciales o documentos vinculados a compras de sus almacenes asignados
    if (user.role === Role.WAREHOUSE_KEEPER) {
      const allowedIds = await this.getAllowedWarehouseIds(user.id);
      const keeperCondition: Prisma.DocumentAttachmentWhereInput = {
        OR: [
          { isConfidential: false },
          {
            purchase: {
              warehouseId: { in: allowedIds },
            },
          },
        ],
      };
      if (where.AND) {
        (where.AND as Prisma.DocumentAttachmentWhereInput[]).push(keeperCondition);
      } else {
        where.AND = [keeperCondition];
      }
    }

    const [total, data] = await Promise.all([
      this.prisma.documentAttachment.count({ where }),
      this.prisma.documentAttachment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Obtener metadatos de un documento por ID verificando confidencialidad
  async findOne(id: string, user: { id: string; role: Role }) {
    const doc = await this.prisma.documentAttachment.findUnique({
      where: { id },
      include: {
        purchase: {
          select: { warehouseId: true },
        },
      },
    });

    if (!doc) {
      throw new NotFoundException('Documento no encontrado');
    }

    if (doc.isConfidential && user.role !== Role.ADMIN && user.role !== Role.MODERATOR) {
      if (doc.purchaseId && doc.purchase?.warehouseId) {
        const allowedIds = await this.getAllowedWarehouseIds(user.id);
        if (!allowedIds.includes(doc.purchase.warehouseId)) {
          throw new ForbiddenException(
            'Acceso denegado: El documento es confidencial y solo puede ser consultado por administradores',
          );
        }
      } else {
        throw new ForbiddenException(
          'Acceso denegado: El documento es confidencial y solo puede ser consultado por administradores',
        );
      }
    }

    return doc;
  }

  // Obtener stream de lectura y metadatos para descarga autenticada
  async getFileStream(id: string, user: { id: string; role: Role }) {
    const doc = await this.findOne(id, user);
    const { stream } = this.storageService.getFileStream(doc.storedPath);

    return {
      stream,
      doc,
    };
  }

  // Eliminar documento de la base de datos y su archivo fisico en disco
  async remove(id: string) {
    const doc = await this.prisma.documentAttachment.findUnique({
      where: { id },
    });

    if (!doc) {
      throw new NotFoundException('Documento no encontrado');
    }

    await this.storageService.deleteFile(doc.storedPath);
    await this.prisma.documentAttachment.delete({
      where: { id },
    });

    return {
      id: doc.id,
      deleted: true,
    };
  }
}
