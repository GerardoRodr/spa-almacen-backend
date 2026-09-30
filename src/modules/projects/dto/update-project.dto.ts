import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '@prisma/client';

export class UpdateProjectDto {
  @ApiPropertyOptional({
    example: 'Residencial Las Palmeras Fase 2',
    description: 'Nombre del proyecto civil',
  })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MaxLength(200, { message: 'El nombre no puede exceder 200 caracteres' })
  name?: string;

  @ApiPropertyOptional({
    example: 'S10-OBRA-2026-01-REV1',
    description: 'Codigo de presupuesto S10 asignado a la obra',
  })
  @IsOptional()
  @IsString({ message: 'El codigo de presupuesto debe ser una cadena de texto' })
  budgetCode?: string;

  @ApiPropertyOptional({
    enum: ProjectStatus,
    description: 'Estado del proyecto civil',
  })
  @IsOptional()
  @IsEnum(ProjectStatus, { message: 'El estado del proyecto no es valido' })
  status?: ProjectStatus;
}
