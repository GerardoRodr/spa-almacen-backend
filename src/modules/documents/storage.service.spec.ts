import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { StorageService } from './storage.service.js';

// Desactivar cache de Sharp en Windows para evitar bloqueos EBUSY de descriptores de archivo
sharp.cache(false);

describe('StorageService', () => {
  let service: StorageService;
  const testUploadDir = path.resolve(process.cwd(), './test-uploads');

  beforeEach(() => {
    const configService = {
      get: (key: string) => {
        if (key === 'uploads.dir') return './test-uploads';
        return undefined;
      },
    } as unknown as ConfigService;

    service = new StorageService(configService);
  });

  afterAll(async () => {
    try {
      if (fs.existsSync(testUploadDir)) {
        await fs.promises.rm(testUploadDir, { recursive: true, force: true });
      }
    } catch {
      // Ignorar bloqueo temporal en Windows al cerrar suite
    }
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('getAbsoluteFilePath', () => {
    it('debe retornar ruta absoluta normalizada dentro del directorio de subida', () => {
      const rel = 'transfers/2026/09/archivo.webp';
      const abs = service.getAbsoluteFilePath(rel);
      expect(abs).toBe(path.resolve(testUploadDir, rel));
    });

    it('debe rechazar intentos de path traversal fuera del directorio base', () => {
      expect(() =>
        service.getAbsoluteFilePath('../../etc/passwd'),
      ).toThrow(BadRequestException);
    });
  });

  describe('processAndSaveImage', () => {
    it('debe procesar una imagen, redimensionarla y convertirla a formato WebP', async () => {
      // Crear imagen sintetica de prueba de 2000x1200 px en PNG
      const samplePngBuffer = await sharp({
        create: {
          width: 2000,
          height: 1200,
          channels: 3,
          background: { r: 255, g: 128, b: 0 },
        },
      })
        .png()
        .toBuffer();

      const result = await service.processAndSaveImage(
        samplePngBuffer,
        'transfers',
      );

      expect(result.mimeType).toBe('image/webp');
      expect(result.storedPath.endsWith('.webp')).toBe(true);
      expect(result.fileSizeBytes).toBeGreaterThan(0);

      // Verificar que el archivo realmente existe en disco
      const absPath = service.getAbsoluteFilePath(result.storedPath);
      expect(fs.existsSync(absPath)).toBe(true);

      // Inspeccionar dimensiones de la imagen guardada
      const metadata = await sharp(absPath).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBeLessThanOrEqual(1920);
      expect(metadata.height).toBeLessThanOrEqual(1080);
    });
  });

  describe('savePdf', () => {
    it('debe guardar archivo PDF valido con cabecera %PDF-', async () => {
      const validPdfBuffer = Buffer.from('%PDF-1.4\n%Contenido simulado de prueba\n%%EOF');
      const result = await service.savePdf(validPdfBuffer, 'purchases');

      expect(result.mimeType).toBe('application/pdf');
      expect(result.storedPath.endsWith('.pdf')).toBe(true);

      const absPath = service.getAbsoluteFilePath(result.storedPath);
      expect(fs.existsSync(absPath)).toBe(true);
    });

    it('debe rechazar archivo con cabecera PDF invalida', async () => {
      const invalidBuffer = Buffer.from('NOT-A-PDF-CONTENT');
      await expect(
        service.savePdf(invalidBuffer, 'purchases'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteFile', () => {
    it('debe eliminar archivo del sistema de archivos', async () => {
      const validPdfBuffer = Buffer.from('%PDF-1.4\nPrueba eliminacion\n%%EOF');
      const saved = await service.savePdf(validPdfBuffer, 'movements');
      const absPath = service.getAbsoluteFilePath(saved.storedPath);
      expect(fs.existsSync(absPath)).toBe(true);

      await service.deleteFile(saved.storedPath);
      expect(fs.existsSync(absPath)).toBe(false);
    });
  });

  describe('getFileStream', () => {
    it('debe retornar stream de lectura si el archivo existe', async () => {
      const validPdfBuffer = Buffer.from('%PDF-1.4\nPrueba stream\n%%EOF');
      const saved = await service.savePdf(validPdfBuffer, 'custody');

      const { stream, absolutePath } = service.getFileStream(saved.storedPath);
      expect(stream).toBeDefined();
      expect(fs.existsSync(absolutePath)).toBe(true);
      stream.destroy();
    });

    it('debe lanzar NotFoundException si el archivo fisico no existe', () => {
      expect(() =>
        service.getFileStream('inexistente/2026/09/no-existe.pdf'),
      ).toThrow(NotFoundException);
    });
  });
});
