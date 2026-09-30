import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  info: Record<string, { status: string }>;
  error: Record<string, { status: string }>;
  details: Record<string, { status: string }>;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // Diagnostico integral de salud del sistema compatible con formato Terminus
  async checkHealth(): Promise<HealthCheckResult> {
    // 1. Diagnostico de conexion a base de datos PostgreSQL
    let dbStatus = 'up';
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
    } catch {
      dbStatus = 'down';
    }

    // 2. Diagnostico de accesibilidad del almacenamiento de uploads
    let storageStatus = 'up';
    try {
      const configuredDir =
        this.configService.get<string>('uploads.dir') ?? './uploads';
      const uploadsDir = path.resolve(process.cwd(), configuredDir);

      if (!fs.existsSync(uploadsDir)) {
        await fs.promises.mkdir(uploadsDir, { recursive: true });
      }
      await fs.promises.access(
        uploadsDir,
        fs.constants.R_OK | fs.constants.W_OK,
      );
    } catch {
      storageStatus = 'down';
    }

    // 3. Diagnostico de consumo de memoria heap de Node.js
    let memoryStatus = 'up';
    const mem = process.memoryUsage();
    if (mem.heapUsed > 1.5 * 1024 * 1024 * 1024) {
      memoryStatus = 'down';
    }

    const isHealthy =
      dbStatus === 'up' && storageStatus === 'up' && memoryStatus === 'up';

    const info: Record<string, { status: string }> = {
      database: { status: dbStatus },
      storage: { status: storageStatus },
      memory_heap: { status: memoryStatus },
    };

    const error: Record<string, { status: string }> = {};
    if (dbStatus === 'down') error.database = { status: 'down' };
    if (storageStatus === 'down') error.storage = { status: 'down' };
    if (memoryStatus === 'down') error.memory_heap = { status: 'down' };

    return {
      status: isHealthy ? 'ok' : 'error',
      info,
      error,
      details: info,
    };
  }
}
