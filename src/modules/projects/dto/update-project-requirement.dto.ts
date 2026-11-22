import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsUUID, Min, ValidateIf } from 'class-validator';

export class UpdateProjectRequirementDto {
  @ApiPropertyOptional({
    example: 'item-uuid-cemento',
    description: 'Nuevo itemId del catalogo maestro (solo permitido si allocatedQty == 0 y consumedQty == 0)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  itemId?: string;

  @ApiPropertyOptional({
    example: 200,
    description: 'Nueva cantidad requerida (debe ser >= allocatedQty)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad requerida debe ser numerica' })
  @Min(0.0001, { message: 'La cantidad requerida debe ser mayor a cero' })
  requiredQty?: number;

  @ApiPropertyOptional({
    example: 29.0,
    description: 'Precio unitario referencial S10 actualizado en PEN',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsNumber({}, { message: 'El precio unitario S10 debe ser numerico' })
  @Min(0, { message: 'El precio unitario S10 no puede ser negativo' })
  s10UnitPrice?: number | null;
}
