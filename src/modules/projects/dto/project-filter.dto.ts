import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProjectStatus } from '@prisma/client';

export class ProjectFilterDto {
  @ApiPropertyOptional({
    description: 'Numero de pagina para paginacion',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La pagina debe ser un numero entero' })
  @Min(1, { message: 'La pagina minima es 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de registros por pagina',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El limite debe ser un numero entero' })
  @Min(1, { message: 'El limite minimo es 1' })
  @Max(100, { message: 'El limite maximo es 100' })
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filtrar por estado del proyecto',
    enum: ProjectStatus,
  })
  @IsOptional()
  @IsEnum(ProjectStatus, { message: 'Estado del proyecto no valido' })
  status?: ProjectStatus;

  @ApiPropertyOptional({
    description: 'Busqueda por nombre del proyecto o codigo de presupuesto',
    example: 'Palmeras',
  })
  @IsOptional()
  @IsString({ message: 'El criterio de busqueda debe ser una cadena de texto' })
  search?: string;
}
