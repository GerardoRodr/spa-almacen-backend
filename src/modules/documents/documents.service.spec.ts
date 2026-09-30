import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { DocumentsService } from './documents.service.js';
import { StorageService } from './storage.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let storageService: {
    processAndSaveImage: ReturnType<typeof vi.fn>;
    savePdf: ReturnType<typeof vi.fn>;
    deleteFile: ReturnType<typeof vi.fn>;
    getFileStream: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    purchase: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    transfer: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    movement: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    toolCustody: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    documentAttachment: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    storageService = {
      processAndSaveImage: vi.fn(),
      savePdf: vi.fn(),
      deleteFile: vi.fn(),
      getFileStream: vi.fn(),
    };

    prisma = {
      purchase: {
        findUnique: vi.fn(),
      },
      transfer: {
        findUnique: vi.fn(),
      },
      movement: {
        findUnique: vi.fn(),
      },
      toolCustody: {
        findUnique: vi.fn(),
      },
      documentAttachment: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        delete: vi.fn(),
      },
    };

    service = new DocumentsService(
      prisma as unknown as PrismaService,
      storageService as unknown as StorageService,
    );
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('upload', () => {
    it('debe fallar si no se proporciona ningun archivo', async () => {
      await expect(
        service.upload({ buffer: Buffer.alloc(0) }, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe fallar si el tipo MIME no esta permitido', async () => {
      const file = {
        buffer: Buffer.from('contenido'),
        originalname: 'script.sh',
        mimetype: 'application/x-sh',
      };
      await expect(service.upload(file, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe fallar si la imagen supera los 10 MB', async () => {
      const file = {
        buffer: Buffer.alloc(11 * 1024 * 1024),
        originalname: 'pesada.jpg',
        mimetype: 'image/jpeg',
      };
      await expect(service.upload(file, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe fallar si la entidad vinculada no existe', async () => {
      prisma.purchase.findUnique.mockResolvedValue(null);
      const file = {
        buffer: Buffer.from('dummy'),
        originalname: 'factura.pdf',
        mimetype: 'application/pdf',
      };
      await expect(
        service.upload(file, { purchaseId: 'p-none' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe procesar imagen con Sharp y asignar isConfidential true por defecto si es compra', async () => {
      prisma.purchase.findUnique.mockResolvedValue({ id: 'pur-1' });
      storageService.processAndSaveImage.mockResolvedValue({
        storedPath: 'purchases/2026/09/factura.webp',
        mimeType: 'image/webp',
        fileSizeBytes: 120500,
      });
      prisma.documentAttachment.create.mockResolvedValue({
        id: 'doc-1',
        storedPath: 'purchases/2026/09/factura.webp',
        mimeType: 'image/webp',
        isConfidential: true,
      });

      const file = {
        buffer: Buffer.from('simulated-image-bytes'),
        originalname: 'foto_factura.jpg',
        mimetype: 'image/jpeg',
      };

      const result = await service.upload(file, { purchaseId: 'pur-1' });

      expect(storageService.processAndSaveImage).toHaveBeenCalledWith(
        file.buffer,
        'purchases',
      );
      expect(prisma.documentAttachment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          purchaseId: 'pur-1',
          storedPath: 'purchases/2026/09/factura.webp',
          mimeType: 'image/webp',
          isConfidential: true,
        }),
      });
      expect(result.id).toBe('doc-1');
    });

    it('debe guardar PDF y asignar isConfidential false si no es compra y no se especifica', async () => {
      prisma.transfer.findUnique.mockResolvedValue({ id: 'tr-1' });
      storageService.savePdf.mockResolvedValue({
        storedPath: 'transfers/2026/09/guia.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 450000,
      });
      prisma.documentAttachment.create.mockResolvedValue({
        id: 'doc-2',
        storedPath: 'transfers/2026/09/guia.pdf',
        mimeType: 'application/pdf',
        isConfidential: false,
      });

      const file = {
        buffer: Buffer.from('%PDF-1.4 simulated'),
        originalname: 'guia_remision.pdf',
        mimetype: 'application/pdf',
      };

      const result = await service.upload(file, { transferId: 'tr-1' });

      expect(storageService.savePdf).toHaveBeenCalledWith(
        file.buffer,
        'transfers',
      );
      expect(prisma.documentAttachment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          transferId: 'tr-1',
          isConfidential: false,
        }),
      });
      expect(result.id).toBe('doc-2');
    });
  });

  describe('findAll', () => {
    it('debe filtrar isConfidential false si el usuario es WAREHOUSE_KEEPER', async () => {
      prisma.documentAttachment.count.mockResolvedValue(1);
      prisma.documentAttachment.findMany.mockResolvedValue([]);

      await service.findAll({}, { id: 'u1', role: Role.WAREHOUSE_KEEPER });

      expect(prisma.documentAttachment.findMany).toHaveBeenCalledWith({
        where: { isConfidential: false },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('debe permitir ver todos los documentos si el usuario es ADMIN', async () => {
      prisma.documentAttachment.count.mockResolvedValue(5);
      prisma.documentAttachment.findMany.mockResolvedValue([]);

      await service.findAll({}, { id: 'admin1', role: Role.ADMIN });

      expect(prisma.documentAttachment.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('debe lanzar ForbiddenException si el documento es confidencial y el usuario es almacenero', async () => {
      prisma.documentAttachment.findUnique.mockResolvedValue({
        id: 'doc-conf',
        isConfidential: true,
      });

      await expect(
        service.findOne('doc-conf', { id: 'k1', role: Role.WAREHOUSE_KEEPER }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe permitir descarga de documento confidencial si el usuario es ADMIN', async () => {
      prisma.documentAttachment.findUnique.mockResolvedValue({
        id: 'doc-conf',
        isConfidential: true,
      });

      const res = await service.findOne('doc-conf', {
        id: 'a1',
        role: Role.ADMIN,
      });
      expect(res.id).toBe('doc-conf');
    });
  });

  describe('getFileStream', () => {
    it('debe abrir stream para descarga si pasa validacion de permisos', async () => {
      prisma.documentAttachment.findUnique.mockResolvedValue({
        id: 'doc-public',
        isConfidential: false,
        storedPath: 'transfers/2026/09/foto.webp',
      });
      const mockStream = { pipe: vi.fn() };
      storageService.getFileStream.mockReturnValue({
        stream: mockStream,
        absolutePath: '/full/path/foto.webp',
      });

      const result = await service.getFileStream('doc-public', {
        id: 'k1',
        role: Role.WAREHOUSE_KEEPER,
      });

      expect(result.stream).toBe(mockStream);
      expect(result.doc.id).toBe('doc-public');
    });
  });

  describe('remove', () => {
    it('debe eliminar archivo de disco y de base de datos', async () => {
      prisma.documentAttachment.findUnique.mockResolvedValue({
        id: 'doc-del',
        storedPath: 'transfers/2026/09/foto.webp',
      });
      storageService.deleteFile.mockResolvedValue(undefined);
      prisma.documentAttachment.delete.mockResolvedValue({});

      const result = await service.remove('doc-del');

      expect(storageService.deleteFile).toHaveBeenCalledWith(
        'transfers/2026/09/foto.webp',
      );
      expect(prisma.documentAttachment.delete).toHaveBeenCalledWith({
        where: { id: 'doc-del' },
      });
      expect(result.deleted).toBe(true);
    });
  });
});
