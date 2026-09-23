import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReceiveTransferItemDto } from './receive-transfer-item.dto.js';

export class ReceiveTransferDto {
  @ApiPropertyOptional({
    description: 'Observaciones de recepcion, acta de rotura o incidencias en ruta',
    example: 'Llegaron 95 bolsas conformes, 5 bolsas con rotura total durante el viaje',
  })
  @IsOptional()
  @IsString({ message: 'Las notas de recepcion deben ser texto' })
  @MaxLength(500, {
    message: 'Las notas de recepcion no pueden exceder 500 caracteres',
  })
  receptionNotes?: string;

  @ApiProperty({
    description: 'Lista de items y cantidades verificadas en la recepcion',
    type: [ReceiveTransferItemDto],
  })
  @IsArray({ message: 'Los items recibidos deben enviarse como un arreglo' })
  @ArrayMinSize(1, {
    message: 'Debe incluir al menos un renglon para confirmar la recepcion',
  })
  @ValidateNested({ each: true })
  @Type(() => ReceiveTransferItemDto)
  items: ReceiveTransferItemDto[];
}
