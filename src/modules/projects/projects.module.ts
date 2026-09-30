import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';
import { S10ParserService } from './s10-parser.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, S10ParserService],
  exports: [ProjectsService, S10ParserService],
})
export class ProjectsModule {}
