import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LiquidateProjectDto {
  @ApiPropertyOptional({
    example: 'Obra concluida al 100% segun acta final de entrega y recepcion de obra',
    description: 'Notas u observaciones del cierre formal y acta de liquidacion de la obra',
  })
  @IsOptional()
  @IsString({ message: 'Las notas de liquidacion deben ser una cadena de texto' })
  liquidationNotes?: string;
}
