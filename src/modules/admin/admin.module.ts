import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { BackupService } from './backup.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
  providers: [AdminService, BackupService],
  exports: [AdminService, BackupService],
})
export class AdminModule {}
