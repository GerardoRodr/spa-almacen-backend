import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum RevertReceptionMode {
  BACK_TO_TRANSIT = 'BACK_TO_TRANSIT',
  CANCEL_COMPLETELY = 'CANCEL_COMPLETELY',
}

export class RevertTransferReceptionDto {
  @ApiProperty({
    example: 'Error de conteo en caseta al recepcionar bolsas de cemento',
    description: 'Motivo obligatorio para revertir la recepcion de la transferencia',
  })
  @IsString({ message: 'El motivo de reversion debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El motivo de reversion es obligatorio' })
  @MinLength(5, {
    message: 'El motivo de reversion debe tener al menos 5 caracteres',
  })
  @MaxLength(500, {
    message: 'El motivo de reversion no puede exceder 500 caracteres',
  })
  reversalReason: string;

  @ApiPropertyOptional({
    enum: RevertReceptionMode,
    default: RevertReceptionMode.BACK_TO_TRANSIT,
    description:
      'BACK_TO_TRANSIT devuelve la guia a En Transito; CANCEL_COMPLETELY revierte recepcion y cancela la guia devolviendo stock al origen',
  })
  @IsOptional()
  @IsEnum(RevertReceptionMode, {
    message: 'El modo debe ser BACK_TO_TRANSIT o CANCEL_COMPLETELY',
  })
  mode?: RevertReceptionMode = RevertReceptionMode.BACK_TO_TRANSIT;
}
