import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter.js';

describe('Flujos Criticos E2E (Hardening)', () => {
  let app: INestApplication;
  let adminToken: string;
  let keeperToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Replicar configuracion de produccion de main.ts
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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Monitoreo de Salud (Health)', () => {
    it('GET /api/v1/health - debe responder 200 con estado operativo', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.status).toBe('ok');
      expect(response.body.info).toBeDefined();
      expect(response.body.info.database.status).toBe('up');
      expect(response.body.info.storage.status).toBe('up');
      expect(response.body.info.memory_heap.status).toBe('up');
    });
  });

  describe('2. Autenticacion y Control de Acceso', () => {
    it('POST /api/v1/auth/login - debe rechazar credenciales invalidas con 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@almacen.com',
          password: 'PasswordIncorrecto999!',
        })
        .expect(401);
    });

    it('POST /api/v1/auth/login - debe autenticar administrador exitosamente', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@almacen.com',
          password: 'Admin1234!',
        })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.role).toBe('ADMIN');
      adminToken = response.body.accessToken;
    });

    it('POST /api/v1/auth/login - debe autenticar almacenero exitosamente', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'almacenero@obra.com',
          password: 'Almacen1234!',
        })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
      expect(response.body.user.role).toBe('WAREHOUSE_KEEPER');
      keeperToken = response.body.accessToken;
    });
  });

  describe('3. Seguridad RBAC en Endpoints de Administracion', () => {
    it('GET /api/v1/admin/backups - debe denegar acceso no autenticado con 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/backups')
        .expect(401);
    });

    it('GET /api/v1/admin/backups - debe denegar acceso a rol no administrador con 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/backups')
        .set('Authorization', `Bearer ${keeperToken}`)
        .expect(403);
    });

    it('GET /api/v1/admin/backups - debe permitir acceso a rol administrador con 200', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/backups')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('4. Consulta de Modulos Clave Protegidos', () => {
    it('GET /api/v1/warehouses - debe listar almacenes para usuario autenticado', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('GET /api/v1/items - debe consultar catalogo de articulos paginado', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toBeDefined();
    });

    it('GET /api/v1/projects - debe consultar proyectos de obra', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/v1/purchases - debe consultar ordenes de compra paginadas', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/purchases')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toBeDefined();
    });

    it('GET /api/v1/transfers - debe consultar transferencias entre almacenes paginadas', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toBeDefined();
    });

    it('GET /api/v1/tools/custody - debe consultar vales de custodia de herramientas paginados', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tools/custody')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toBeDefined();
    });

    it('GET /api/v1/documents - debe listar documentos adjuntos paginados', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toBeDefined();
    });
  });

  describe('5. Validacion Estricta de Carga de Archivos S10', () => {
    it('POST /api/v1/projects/:id/s10-import - debe rechazar peticion sin archivo adjunto con 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/projects/00000000-0000-0000-0000-000000000000/s10-import')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });
});
