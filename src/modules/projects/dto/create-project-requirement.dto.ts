import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsUUID, Min, ValidateIf } from 'class-validator';

export class CreateProjectRequirementDto {
  @ApiProperty({
    example: 'item-uuid-cemento',
    description: 'Identificador UUID del insumo maestro a agregar a la matriz',
  })
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  itemId: string;

  @ApiProperty({
    example: 150,
    description: 'Cantidad metrada requerida en la unidad base del insumo',
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad requerida debe ser numerica' })
  @Min(0.0001, { message: 'La cantidad requerida debe ser mayor a cero' })
  requiredQty: number;

  @ApiPropertyOptional({
    example: 28.5,
    description: 'Precio unitario referencial S10 en PEN',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsNumber({}, { message: 'El precio unitario S10 debe ser numerico' })
  @Min(0, { message: 'El precio unitario S10 no puede ser negativo' })
  s10UnitPrice?: number | null;
}
