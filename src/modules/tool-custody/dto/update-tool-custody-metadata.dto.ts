import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateToolCustodyMetadataDto {
  @ApiPropertyOptional({
    example: 'Carlos Mendoza Silva',
    description: 'Nombre corregido del operario responsable',
  })
  @IsOptional()
  @IsString({ message: 'assignedToName debe ser texto' })
  @MaxLength(150, {
    message: 'assignedToName no puede exceder 150 caracteres',
  })
  assignedToName?: string;

  @ApiPropertyOptional({
    example: '70123456',
    description: 'DNI corregido del operario responsable',
  })
  @IsOptional()
  @IsString({ message: 'assignedToDni debe ser texto' })
  @MaxLength(20, {
    message: 'assignedToDni no puede exceder 20 caracteres',
  })
  assignedToDni?: string;

  @ApiPropertyOptional({
    example: 'SER-BOSCH-9981',
    description: 'Serie o codigo interno de la herramienta',
  })
  @IsOptional()
  @IsString({ message: 'serialOrCode debe ser texto' })
  @MaxLength(100, {
    message: 'serialOrCode no puede exceder 100 caracteres',
  })
  serialOrCode?: string;

  @ApiPropertyOptional({
    example: '2026-11-20T18:00:00.000Z',
    description: 'Fecha estimada de devolucion actualizada',
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: 'expectedReturnDate debe ser una fecha ISO 8601 valida' },
  )
  expectedReturnDate?: string;

  @ApiPropertyOptional({
    example: 'Entregado con maletin y dos baterias',
    description: 'Observaciones de despacho del vale',
  })
  @IsOptional()
  @IsString({ message: 'notes debe ser texto' })
  @MaxLength(500, {
    message: 'notes no puede exceder 500 caracteres',
  })
  notes?: string;

  @ApiPropertyOptional({
    example: 'Devuelto limpio y probado en banco de trabajo',
    description: 'Observaciones de devolucion del vale',
  })
  @IsOptional()
  @IsString({ message: 'returnNotes debe ser texto' })
  @MaxLength(500, {
    message: 'returnNotes no puede exceder 500 caracteres',
  })
  returnNotes?: string;
}
