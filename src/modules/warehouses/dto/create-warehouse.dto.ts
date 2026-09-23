import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WarehouseType } from '@prisma/client';

export class CreateWarehouseDto {
  @ApiProperty({
    example: 'Almacen Obra San Isidro',
    description: 'Nombre descriptivo del almacen',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacio' })
  name: string;

  @ApiProperty({
    enum: WarehouseType,
    example: WarehouseType.PROJECT_SITE,
    description: 'Tipo de almacen: CENTRAL o PROJECT_SITE (obra temporal)',
  })
  @IsEnum(WarehouseType, { message: 'El tipo de almacen no es valido' })
  type: WarehouseType;

  @ApiPropertyOptional({
    default: false,
    description: 'Indica si es un almacen temporal de caseta de obra',
  })
  @IsOptional()
  @IsBoolean({ message: 'isTemporary debe ser un booleano' })
  isTemporary?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: 'Estado operativo del almacen',
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser un booleano' })
  isActive?: boolean;

  @ApiPropertyOptional({
    example: 'uuid-proyecto-asociado',
    description: 'Identificador del proyecto civil vinculado en caso de ser almacen de obra',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El projectId debe ser un UUID valido' })
  projectId?: string;
}
