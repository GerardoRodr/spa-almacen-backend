import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UploadDocumentDto {
  @ApiPropertyOptional({
    example: '11111111-1111-1111-1111-111111111111',
    description: 'Identificador de la factura o compra vinculada',
  })
  @IsOptional()
  @IsUUID('4', { message: 'purchaseId debe ser un UUID valido' })
  purchaseId?: string;

  @ApiPropertyOptional({
    example: '22222222-2222-2222-2222-222222222222',
    description: 'Identificador de la transferencia de materiales vinculada',
  })
  @IsOptional()
  @IsUUID('4', { message: 'transferId debe ser un UUID valido' })
  transferId?: string;

  @ApiPropertyOptional({
    example: '33333333-3333-3333-3333-333333333333',
    description: 'Identificador del movimiento de Kardex o consumo vinculado',
  })
  @IsOptional()
  @IsUUID('4', { message: 'movementId debe ser un UUID valido' })
  movementId?: string;

  @ApiPropertyOptional({
    example: '44444444-4444-4444-4444-444444444444',
    description: 'Identificador del vale de custodia o prestamo de herramientas vinculado',
  })
  @IsOptional()
  @IsUUID('4', { message: 'custodyId debe ser un UUID valido' })
  custodyId?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Indica si el documento es confidencial (exclusivo para ADMIN). Si se omite y se vincula a purchaseId, es true por defecto.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return undefined;
  })
  @IsBoolean({ message: 'isConfidential debe ser un valor booleano' })
  isConfidential?: boolean;
}
