import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '@prisma/client';

export class CreateProjectDto {
  @ApiProperty({
    example: 'Residencial Las Palmeras - San Isidro',
    description: 'Nombre del proyecto u obra civil',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacio' })
  @MaxLength(200, { message: 'El nombre no puede exceder 200 caracteres' })
  name: string;

  @ApiPropertyOptional({
    example: 'S10-OBRA-2026-01',
    description: 'Codigo de presupuesto S10 asignado a la obra',
  })
  @IsOptional()
  @IsString({ message: 'El codigo de presupuesto debe ser una cadena de texto' })
  budgetCode?: string;

  @ApiPropertyOptional({
    enum: ProjectStatus,
    default: ProjectStatus.PLANNING,
    description: 'Estado inicial del proyecto: PLANNING, ACTIVE, LIQUIDATED, ARCHIVED',
  })
  @IsOptional()
  @IsEnum(ProjectStatus, { message: 'El estado del proyecto no es valido' })
  status?: ProjectStatus;

  @ApiPropertyOptional({
    example: 'Almacen Obra San Isidro',
    description: 'Nombre personalizado para el almacen de obra asociado. Si se omite, se autogenera.',
  })
  @IsOptional()
  @IsString({ message: 'El nombre del almacen debe ser una cadena de texto' })
  warehouseName?: string;

  @ApiPropertyOptional({
    example: 'b0000000-0000-4000-8000-000000000002',
    description: 'UUID de un almacen PROJECT_SITE existente y disponible para vincular al proyecto',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsUUID('4', { message: 'El warehouseId debe ser un UUID valido' })
  warehouseId?: string;
}
