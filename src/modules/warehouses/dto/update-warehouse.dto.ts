import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWarehouseDto {
  @ApiPropertyOptional({
    example: 'Almacen Obra San Isidro - Fase 2',
    description: 'Nombre del almacen',
  })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Indica si es un almacen temporal',
  })
  @IsOptional()
  @IsBoolean({ message: 'isTemporary debe ser un booleano' })
  isTemporary?: boolean;

  @ApiPropertyOptional({
    description: 'Estado activo o inactivo',
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser un booleano' })
  isActive?: boolean;
}
