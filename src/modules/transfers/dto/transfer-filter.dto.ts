import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TransferStatus } from '@prisma/client';

export class TransferFilterDto {
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
    description: 'Filtrar por estado del ciclo de transferencia',
    enum: TransferStatus,
  })
  @IsOptional()
  @IsEnum(TransferStatus, { message: 'Estado de transferencia no valido' })
  status?: TransferStatus;

  @ApiPropertyOptional({
    description: 'Filtrar por identificador del almacen de origen',
    example: 'b0000000-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El originWarehouseId debe ser un UUID valido' })
  originWarehouseId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por identificador del almacen de destino',
    example: 'b0000000-0000-0000-0000-000000000002',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El destWarehouseId debe ser un UUID valido' })
  destWarehouseId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por identificador del proyecto civil asociado',
    example: 'c0000000-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El projectId debe ser un UUID valido' })
  projectId?: string;
}
