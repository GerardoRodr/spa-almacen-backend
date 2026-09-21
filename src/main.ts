import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Seguridad de cabeceras HTTP permitiendo recursos de Swagger UI
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  // Habilitar CORS para frontend Angular y clientes web
  app.enableCors({
    origin: true,
    credentials: true,
  });

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

  // Documentacion interactiva OpenAPI Swagger
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

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`Servidor iniciado en puerto: ${port}`);
  logger.log(`Documentacion Swagger disponible en: http://localhost:${port}/api/docs`);
}
await bootstrap();
