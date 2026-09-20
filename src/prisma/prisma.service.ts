import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // Conectar con la base de datos al iniciar el modulo
  async onModuleInit() {
    await this.$connect();
  }

  // Cerrar la conexion al destruir el modulo
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
