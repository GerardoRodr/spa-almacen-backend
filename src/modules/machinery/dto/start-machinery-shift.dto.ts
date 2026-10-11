import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartMachineryShiftDto {
  @ApiProperty({
    example: 'e0000000-0000-4000-8000-000000000020',
    description: 'Identificador del item clasificado como MACHINERY',
  })
  @IsNotEmpty({ message: 'itemId es requerido' })
  @IsUUID('4', { message: 'itemId debe ser un UUID valido' })
  itemId: string;

  @ApiProperty({
    example: 'b0000000-0000-4000-8000-000000000002',
    description: 'Identificador del almacen o caseta donde opera la maquinaria',
  })
  @IsNotEmpty({ message: 'warehouseId es requerido' })
  @IsUUID('4', { message: 'warehouseId debe ser un UUID valido' })
  warehouseId: string;

  @ApiProperty({
    example: 'Carlos Alberto Huaman',
    description: 'Nombre completo del operador de la maquinaria',
  })
  @IsNotEmpty({ message: 'operatorName es requerido' })
  @IsString({ message: 'operatorName debe ser una cadena de texto' })
  @MaxLength(100, { message: 'operatorName no puede exceder 100 caracteres' })
  operatorName: string;

  @ApiProperty({
    example: '45678912',
    description: 'Documento Nacional de Identidad (DNI de 8 digitos) del operador',
  })
  @IsNotEmpty({ message: 'operatorDni es requerido' })
  @IsString({ message: 'operatorDni debe ser una cadena de texto' })
  @Matches(/^\d{8}$/, {
    message: 'operatorDni debe ser un DNI peruano valido de 8 digitos numericos',
  })
  operatorDni: string;

  @ApiProperty({
    example: 1250.5,
    description: 'Lectura numerica inicial del horometro al iniciar jornada',
  })
  @IsNotEmpty({ message: 'startHourMeter es requerido' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'startHourMeter debe ser un numero con maximo 2 decimales' },
  )
  @Min(0, { message: 'startHourMeter no puede ser negativo' })
  startHourMeter: number;

  @ApiProperty({
    example: 'f0000000-0000-4000-8000-000000000001',
    description:
      'Identificador de la fotografia del horometro inicial cargada en /documents/upload',
  })
  @IsNotEmpty({ message: 'startPhotoId es obligatorio para validar el horometro inicial' })
  @IsUUID('4', { message: 'startPhotoId debe ser un UUID valido' })
  startPhotoId: string;

  @ApiPropertyOptional({
    example: 'Tanque lleno al inicio de jornada, niveles de aceite conformes',
    description: 'Observaciones iniciales del estado de la maquinaria',
  })
  @IsOptional()
  @IsString({ message: 'notes debe ser una cadena de texto' })
  @MaxLength(1000, { message: 'notes no puede exceder 1000 caracteres' })
  notes?: string;
}
