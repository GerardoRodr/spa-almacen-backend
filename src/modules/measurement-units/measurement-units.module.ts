import { Module } from '@nestjs/common';
import { MeasurementUnitsService } from './measurement-units.service.js';
import { MeasurementUnitsController } from './measurement-units.controller.js';

@Module({
  controllers: [MeasurementUnitsController],
  providers: [MeasurementUnitsService],
  exports: [MeasurementUnitsService],
})
export class MeasurementUnitsModule {}
