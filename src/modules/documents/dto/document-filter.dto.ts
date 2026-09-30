import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DocumentFilterDto {
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
    example: '11111111-1111-1111-1111-111111111111',
    description: 'Filtrar documentos por identificador de compra',
  })
  @IsOptional()
  @IsUUID('4', { message: 'purchaseId debe ser un UUID valido' })
  purchaseId?: string;

  @ApiPropertyOptional({
    example: '22222222-2222-2222-2222-222222222222',
    description: 'Filtrar documentos por identificador de transferencia',
  })
  @IsOptional()
  @IsUUID('4', { message: 'transferId debe ser un UUID valido' })
  transferId?: string;

  @ApiPropertyOptional({
    example: '33333333-3333-3333-3333-333333333333',
    description: 'Filtrar documentos por identificador de movimiento de Kardex',
  })
  @IsOptional()
  @IsUUID('4', { message: 'movementId debe ser un UUID valido' })
  movementId?: string;

  @ApiPropertyOptional({
    example: '44444444-4444-4444-4444-444444444444',
    description: 'Filtrar documentos por identificador de custodia de herramientas',
  })
  @IsOptional()
  @IsUUID('4', { message: 'custodyId debe ser un UUID valido' })
  custodyId?: string;
}
