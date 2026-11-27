import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export type SupplierSortBy = 'businessName' | 'purchasesCount';
export type SupplierSortDir = 'asc' | 'desc';

export class SupplierFilterDto {
  @ApiPropertyOptional({
    default: 1,
    description: 'Numero de pagina para paginacion',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La pagina debe ser un entero' })
  @Min(1, { message: 'La pagina minima es 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    default: 20,
    description: 'Cantidad de registros por pagina',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El limite debe ser un entero' })
  @Min(1, { message: 'El limite minimo es 1' })
  limit?: number = 20;

  @ApiPropertyOptional({
    example: 'aceros',
    description: 'Termino de busqueda por RUC o razon social',
  })
  @IsOptional()
  @IsString({ message: 'El parametro de busqueda debe ser una cadena' })
  search?: string;

  @ApiPropertyOptional({
    enum: ['businessName', 'purchasesCount'],
    description: 'Campo de ordenamiento',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsIn(['businessName', 'purchasesCount'], {
    message: 'sortBy debe ser businessName o purchasesCount',
  })
  sortBy?: SupplierSortBy;

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    description: 'Direccion de ordenamiento',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsIn(['asc', 'desc'], { message: 'sortDir debe ser asc o desc' })
  sortDir?: SupplierSortDir;
}
