import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';
import { parseCorsOrigins } from './config/cors.util.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Seguridad de cabeceras HTTP permitiendo recursos de Swagger UI
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  // Configuracion dinamica de CORS segun variables de entorno
  const corsEnabled = process.env.CORS_ENABLED !== 'false';

  if (corsEnabled) {
    const origin = parseCorsOrigins(process.env.CORS_ORIGIN);

    app.enableCors({
      origin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    });

    logger.log(
      `CORS habilitado. Origenes autorizados: ${Array.isArray(origin) ? origin.join(', ') : origin === true ? 'todos (origin: true)' : origin}`,
    );
  } else {
    logger.warn('CORS deshabilitado por configuracion (CORS_ENABLED=false)');
  }

  // Prefijo global de la API segun arquitectura
  app.setGlobalPrefix('api/v1');

  // Filtro global de excepciones
  app.useGlobalFilters(new AllExceptionsFilter());

  // Validacion y saneamiento automatico de payloads
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Documentacion interactiva OpenAPI Swagger condicional
  const swaggerEnabled = process.env.SWAGGER_ENABLED !== 'false';

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SPA-ALMACEN-ERP API')
      .setDescription(
        'API REST modular para la gestion logistica de almacenes y obras civiles',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`Servidor iniciado en puerto: ${port}`);
  if (swaggerEnabled) {
    logger.log(`Documentacion Swagger disponible en: http://localhost:${port}/api/docs`);
  } else {
    logger.log('Documentacion Swagger deshabilitada por configuracion (SWAGGER_ENABLED=false)');
  }
}
await bootstrap();
