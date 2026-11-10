import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateStockValuationDto {
  @ApiProperty({
    example: 28.5,
    description: 'Nuevo costo promedio ponderado (averageCost) en Soles sin IGV para valorizar el stock existente',
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'El costo promedio debe ser un valor numerico' })
  @Min(0, { message: 'El costo promedio no puede ser negativo' })
  averageCost: number;
}
