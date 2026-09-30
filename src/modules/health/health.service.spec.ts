import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('HealthService', () => {
  let service: HealthService;
  let prisma: {
    $queryRawUnsafe: ReturnType<typeof vi.fn>;
  };
  let configService: {
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    prisma = {
      $queryRawUnsafe: vi.fn(),
    };
    configService = {
      get: vi.fn().mockReturnValue('./test-uploads-health'),
    };

    service = new HealthService(
      prisma as unknown as PrismaService,
      configService as unknown as ConfigService,
    );
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe retornar status ok cuando todos los subsistemas estan operativos', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);

    const result = await service.checkHealth();

    expect(result.status).toBe('ok');
    expect(result.info.database.status).toBe('up');
    expect(result.info.storage.status).toBe('up');
    expect(result.info.memory_heap.status).toBe('up');
    expect(result.error).toEqual({});
  });

  it('debe reportar error cuando la base de datos PostgreSQL no responde', async () => {
    prisma.$queryRawUnsafe.mockRejectedValue(
      new Error('Connection terminated unexpectedly'),
    );

    const result = await service.checkHealth();

    expect(result.status).toBe('error');
    expect(result.info.database.status).toBe('down');
    expect(result.error.database.status).toBe('down');
  });
});
