import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { SequenceGeneratorService } from '../common/services/sequence-generator.service.js';

@Global()
@Module({
  providers: [PrismaService, SequenceGeneratorService],
  exports: [PrismaService, SequenceGeneratorService],
})
export class PrismaModule {}
