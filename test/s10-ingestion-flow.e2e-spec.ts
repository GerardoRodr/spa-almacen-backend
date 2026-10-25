import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Flujo E2E de Ingesta S10, Brechas, Reserva e Idempotencia', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  const projectId = 'c0000000-0000-4000-8000-000000000003';
  const centralWarehouseId = 'b0000000-0000-4000-8000-000000000001';
  const cementoItemId = 'e0000000-0000-4000-8000-000000000021';
  const alambre8ItemId = 'e0000000-0000-4000-8000-000000000024';
  const alambre16ItemId = 'e0000000-0000-4000-8000-000000000027';

  const tipovtipo2CsvPath = path.resolve(__dirname, '../docs/tipovtipo2.csv');
  const resumenClienteCsvPath = path.resolve(
    __dirname,
    '../docs/presupuestoclienteresumen.csv',
  );

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);

    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    // Autenticar administrador para obtener bearer token
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@almacen.com',
        password: 'Admin1234!',
      })
      .expect(200);

    adminToken = loginRes.body.accessToken;
    expect(adminToken).toBeDefined();

    // Limpiar requerimientos previos del proyecto de prueba para ejecucion idempotente
    await prisma.projectRequirement.deleteMany({
      where: { projectId },
    });
    await prisma.stock.updateMany({
      where: { warehouseId: centralWarehouseId, itemId: cementoItemId },
      data: { physicalQty: 6000, reservedQty: 0 },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('a) Cargar tipovtipo2.csv: debe mapear los 13 insumos sembrados, retornar no mapeados con suggestedType y persistir requerimientos', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/s10-import`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', tipovtipo2CsvPath)
      .expect(201);

    expect(res.body.projectId).toBe(projectId);
    expect(res.body.s10ProjectCode).toBe('1101024');
    expect(res.body.mappedItems).toBe(13);
    expect(res.body.requirementsCreatedOrUpdated).toBe(13);
    expect(res.body.unmappedItems.length).toBeGreaterThan(0);

    // Cada item no mapeado debe incluir su clasificacion sugerida
    for (const unmapped of res.body.unmappedItems) {
      expect(['CONSUMABLE', 'ASSET_TOOL']).toContain(unmapped.suggestedType);
      if (unmapped.s10Code?.startsWith('02')) {
        expect(unmapped.suggestedType).toBe('CONSUMABLE');
      } else if (unmapped.s10Code?.startsWith('03')) {
        expect(unmapped.suggestedType).toBe('ASSET_TOOL');
      }
    }

    // Verificar en base de datos que se persistieron los 13 requerimientos
    const requirements = await prisma.projectRequirement.findMany({
      where: { projectId },
    });
    expect(requirements).toHaveLength(13);
  });

  it('b) Consultar Gap Analysis: debe calcular stock disponible (physical - reserved) y deficit para abundante, parcial y cero', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/gap-analysis`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.projectId).toBe(projectId);
    expect(res.body.analysis).toHaveLength(13);

    const itemsMap = new Map<string, (typeof res.body.analysis)[0]>();
    for (const item of res.body.analysis) {
      itemsMap.set(item.itemId, item);
    }

    // 1. Insumo con stock Abundante (Cemento: Demanda 4768.91, Stock 6000)
    const cemento = itemsMap.get(cementoItemId);
    expect(cemento).toBeDefined();
    expect(cemento.requiredQty).toBe('4768.9100');
    expect(cemento.allocatedQty).toBe('0.0000');
    expect(cemento.centralAvailableStock).toBe('6000.0000');
    expect(cemento.purchaseDeficit).toBe('0.0000'); // Cobertura completa

    // 2. Insumo con stock Parcial (Alambre #8: Demanda 2003.19, Stock 800)
    const alambre8 = itemsMap.get(alambre8ItemId);
    expect(alambre8).toBeDefined();
    expect(alambre8.requiredQty).toBe('2003.1900');
    expect(alambre8.centralAvailableStock).toBe('800.0000');
    expect(alambre8.purchaseDeficit).toBe('1203.1900'); // 2003.19 - 800

    // 3. Insumo con stock Cero (Alambre #16: Demanda 2096.39, Stock 0)
    const alambre16 = itemsMap.get(alambre16ItemId);
    expect(alambre16).toBeDefined();
    expect(alambre16.requiredQty).toBe('2096.3900');
    expect(alambre16.centralAvailableStock).toBe('0.0000');
    expect(alambre16.purchaseDeficit).toBe('2096.3900'); // Deficit total
  });

  it('c) Ejecutar reserva logica: debe aumentar Stock.reservedQty y disminuir disponible sin alterar physicalQty', async () => {
    const quantityToAllocate = 500;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/allocate-stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        centralWarehouseId,
        itemId: cementoItemId,
        quantityToAllocate,
      })
      .expect(201);

    expect(res.body.allocatedQty).toBe('500.0000');
    expect(res.body.centralWarehouseAvailableStock).toBe('5500.0000');

    // Verificar estado fisico y logico en base de datos
    const stockInDb = await prisma.stock.findUnique({
      where: {
        warehouseId_itemId: {
          warehouseId: centralWarehouseId,
          itemId: cementoItemId,
        },
      },
    });

    expect(stockInDb).toBeDefined();
    expect(Number(stockInDb!.physicalQty)).toBe(6000); // Intacto
    expect(Number(stockInDb!.reservedQty)).toBe(500); // Incrementado

    // Verificar actualizacion en requerimiento del proyecto
    const reqInDb = await prisma.projectRequirement.findUnique({
      where: {
        projectId_itemId: {
          projectId,
          itemId: cementoItemId,
        },
      },
    });
    expect(Number(reqInDb!.allocatedQty)).toBe(500);
  });

  it('d) Re-importar el mismo archivo CSV: debe ser idempotente, no duplicar requiredQty y preservar allocatedQty', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/s10-import`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', tipovtipo2CsvPath)
      .expect(201);

    expect(res.body.mappedItems).toBe(13);

    // Verificar en base de datos que requiredQty de Cemento sigue en 4768.91 (no 9537.82)
    const reqCemento = await prisma.projectRequirement.findUnique({
      where: {
        projectId_itemId: {
          projectId,
          itemId: cementoItemId,
        },
      },
    });

    expect(reqCemento).toBeDefined();
    expect(Number(reqCemento!.requiredQty)).toBe(4768.91);
    expect(Number(reqCemento!.allocatedQty)).toBe(500); // Preservado intacto
  });

  it('e) Subida de presupuestoclienteresumen.csv: debe arrojar BadRequestException indicando que contiene partidas y no insumos', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/s10-import`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', resumenClienteCsvPath)
      .expect(400);

    expect(res.body.message).toMatch(
      /no contiene materiales \(02\) ni equipos \(03\) validos/,
    );
  });
});
