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

  // Subir, optimizar con Sharp y persistir metadatos del documento
  async upload(
    file: {
      buffer?: Buffer;
      originalname?: string;
      mimetype?: string;
      size?: number;
    },
    dto: UploadDocumentDto,
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

    // Determinar categoria segun la entidad foranea asociada
    let category = 'general';
    if (dto.purchaseId) {
      const purchase = await this.prisma.purchase.findUnique({
        where: { id: dto.purchaseId },
      });
      if (!purchase) {
        throw new NotFoundException('La compra vinculada no existe');
      }
      category = 'purchases';
    } else if (dto.transferId) {
      const transfer = await this.prisma.transfer.findUnique({
        where: { id: dto.transferId },
      });
      if (!transfer) {
        throw new NotFoundException('La transferencia vinculada no existe');
      }
      category = 'transfers';
    } else if (dto.movementId) {
      const movement = await this.prisma.movement.findUnique({
        where: { id: dto.movementId },
      });
      if (!movement) {
        throw new NotFoundException('El movimiento vinculado no existe');
      }
      category = 'movements';
    } else if (dto.custodyId) {
      const custody = await this.prisma.toolCustody.findUnique({
        where: { id: dto.custodyId },
      });
      if (!custody) {
        throw new NotFoundException('El vale de custodia vinculado no existe');
      }
      category = 'custody';
    }

    // Determinar marca de confidencialidad (compras son confidenciales por defecto)
    let isConfidential = false;
    if (dto.isConfidential !== undefined) {
      isConfidential = dto.isConfidential;
    } else if (dto.purchaseId) {
      isConfidential = true;
    }

    // Procesar archivo segun corresponda (Sharp para imagenes o guardado para PDF)
    const saved = isImage
      ? await this.storageService.processAndSaveImage(file.buffer, category)
      : await this.storageService.savePdf(file.buffer, category);

    return this.prisma.documentAttachment.create({
      data: {
        purchaseId: dto.purchaseId ?? null,
        transferId: dto.transferId ?? null,
        movementId: dto.movementId ?? null,
        custodyId: dto.custodyId ?? null,
        originalName: file.originalname?.trim() || 'documento',
        storedPath: saved.storedPath,
        mimeType: saved.mimeType,
        fileSizeBytes: saved.fileSizeBytes,
        isConfidential,
      },
    });
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

    // Almaceneros nunca ven documentos confidenciales en los listados
    if (user.role === Role.WAREHOUSE_KEEPER) {
      where.isConfidential = false;
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
    });

    if (!doc) {
      throw new NotFoundException('Documento no encontrado');
    }

    if (doc.isConfidential && user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Acceso denegado: El documento es confidencial y solo puede ser consultado por administradores',
      );
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
