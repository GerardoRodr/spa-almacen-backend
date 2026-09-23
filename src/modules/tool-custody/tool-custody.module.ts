import { Module } from '@nestjs/common';
import { ToolCustodyController } from './tool-custody.controller.js';
import { ToolCustodyService } from './tool-custody.service.js';

@Module({
  controllers: [ToolCustodyController],
  providers: [ToolCustodyService],
  exports: [ToolCustodyService],
})
export class ToolCustodyModule {}
