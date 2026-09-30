import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'node:fs';
import path from 'node:path';
import { BackupService } from './backup.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('BackupService', () => {
  let service: BackupService;
  const testBackupDir = path.resolve(process.cwd(), './test-backups');
  let prisma: {
    user: { count: ReturnType<typeof vi.fn> };
    warehouse: { count: ReturnType<typeof vi.fn> };
    item: { count: ReturnType<typeof vi.fn> };
    movement: { count: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    process.env.BACKUP_DIR = './test-backups';

    prisma = {
      user: { count: vi.fn().mockResolvedValue(2) },
      warehouse: { count: vi.fn().mockResolvedValue(3) },
      item: { count: vi.fn().mockResolvedValue(10) },
      movement: { count: vi.fn().mockResolvedValue(25) },
    };

    const configService = {
      get: (key: string) => {
        if (key === 'database.url') return 'postgresql://postgres:postgres@localhost:5432/almacen_erp';
        return undefined;
      },
    } as unknown as ConfigService;

    service = new BackupService(configService, prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    try {
      if (fs.existsSync(testBackupDir)) {
        await fs.promises.rm(testBackupDir, { recursive: true, force: true });
      }
    } catch {
      // Ignorar bloqueo temporal en Windows
    }
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('generateBackup', () => {
    it('debe generar un archivo de respaldo con estado COMPLETED y tamano mayor a cero', async () => {
      const result = await service.generateBackup();

      expect(result.status).toBe('COMPLETED');
      expect(result.fileName.endsWith('.dump')).toBe(true);
      expect(result.sizeBytes).toBeGreaterThan(0);

      const filePath = path.resolve(testBackupDir, result.fileName);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('listBackups', () => {
    it('debe listar las copias de seguridad existentes en orden cronologico descendente', async () => {
      const backups = await service.listBackups();
      expect(Array.isArray(backups)).toBe(true);
      expect(backups.length).toBeGreaterThanOrEqual(1);
      expect(backups[0].fileName).toBeDefined();
      expect(backups[0].sizeBytes).toBeGreaterThan(0);
    });
  });

  describe('getBackupStream', () => {
    it('debe rechazar nombres de archivo con path traversal', () => {
      expect(() =>
        service.getBackupStream('../../etc/shadow'),
      ).toThrow(BadRequestException);
    });

    it('debe lanzar NotFoundException si el archivo no existe', () => {
      expect(() =>
        service.getBackupStream('no_existe.dump'),
      ).toThrow(NotFoundException);
    });

    it('debe retornar un stream de lectura si el archivo existe', async () => {
      const backups = await service.listBackups();
      const first = backups[0];

      const { stream, fileName, sizeBytes } = service.getBackupStream(first.fileName);
      expect(stream).toBeDefined();
      expect(fileName).toBe(first.fileName);
      expect(sizeBytes).toBe(first.sizeBytes);
      stream.destroy();
    });
  });

  describe('purgeOldBackups', () => {
    it('debe purgar archivos que exceden la politica de retencion de 7 dias', async () => {
      // Crear archivo simulado antiguo de 10 dias
      const oldFileName = 'almacen_erp_antiguo.dump';
      const oldFilePath = path.resolve(testBackupDir, oldFileName);
      await fs.promises.writeFile(oldFilePath, 'simulated old dump');

      const tenDaysAgoMs = (Date.now() - 10 * 24 * 60 * 60 * 1000) / 1000;
      fs.utimesSync(oldFilePath, tenDaysAgoMs, tenDaysAgoMs);

      const purgedCount = await service.purgeOldBackups(7);
      expect(purgedCount).toBeGreaterThanOrEqual(1);
      expect(fs.existsSync(oldFilePath)).toBe(false);
    });
  });

  describe('deleteBackup', () => {
    it('debe eliminar archivo de respaldo solicitado', async () => {
      const tempBackupName = 'almacen_erp_borrar.dump';
      const tempBackupPath = path.resolve(testBackupDir, tempBackupName);
      await fs.promises.writeFile(tempBackupPath, 'dump para borrar');

      expect(fs.existsSync(tempBackupPath)).toBe(true);
      const res = await service.deleteBackup(tempBackupName);

      expect(res.deleted).toBe(true);
      expect(fs.existsSync(tempBackupPath)).toBe(false);
    });
  });
});
