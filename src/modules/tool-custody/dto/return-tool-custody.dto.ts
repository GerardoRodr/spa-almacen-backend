import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ToolCondition } from '@prisma/client';

export class ReturnToolCustodyDto {
  @ApiProperty({
    enum: ToolCondition,
    example: ToolCondition.OPERATIVE,
    description:
      'Calificacion fisica del bien al retorno: OPERATIVE, DAMAGED_USABLE, DAMAGED_UNUSABLE, MAINTENANCE_REQUIRED, LOST',
  })
  @IsEnum(ToolCondition, { message: 'La condicion de retorno no es valida' })
  conditionOnReturn: ToolCondition;

  @ApiPropertyOptional({
    example: 'Devuelto completo en orden y limpio',
    description: 'Observaciones tecnicas o justificacion de desperfectos/perdidas',
  })
  @IsOptional()
  @IsString({ message: 'Las notas de retorno deben ser una cadena de texto' })
  returnNotes?: string;
}
