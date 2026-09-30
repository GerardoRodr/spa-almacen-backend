import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { configuration } from './config/configuration.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { WarehousesModule } from './modules/warehouses/warehouses.module.js';
import { ItemsModule } from './modules/items/items.module.js';
import { SuppliersModule } from './modules/suppliers/suppliers.module.js';
import { PurchasesModule } from './modules/purchases/purchases.module.js';
import { ToolCustodyModule } from './modules/tool-custody/tool-custody.module.js';
import { TransfersModule } from './modules/transfers/transfers.module.js';
import { MovementsModule } from './modules/movements/movements.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    // Modulo de configuracion global para variables de entorno
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // Modulo de limitacion de peticiones para seguridad
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    // Modulo global de base de datos Prisma v6
    PrismaModule,
    // Modulos de seguridad y usuarios
    UsersModule,
    AuthModule,
    // Modulos de almacenes y catalogo de items
    WarehousesModule,
    ItemsModule,
    // Modulos de proveedores y compras
    SuppliersModule,
    PurchasesModule,
    // Modulo de custodia y prestamo de herramientas
    ToolCustodyModule,
    // Modulo de transferencias operativas entre almacenes
    TransfersModule,
    // Modulo de movimientos de inventario y Kardex
    MovementsModule,
    // Modulo de proyectos civiles e ingesta de presupuestos S10
    ProjectsModule,
    // Modulo de gestion de archivos seguros y evidencias Sharp
    DocumentsModule,
    // Modulo de diagnostico y salud del sistema
    HealthModule,
    // Modulo de administracion, backups y mantenimiento
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
