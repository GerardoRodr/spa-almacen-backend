import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ToolCondition } from '@prisma/client';

export class DispatchToolCustodyDto {
  @ApiProperty({
    example: '44444444-4444-4444-4444-444444444444',
    description: 'Identificador UUID del almacen o caseta de obra que entrega el bien',
  })
  @IsUUID('4', { message: 'El warehouseId debe ser un UUID valido' })
  warehouseId: string;

  @ApiProperty({
    example: 'item-uuid-rotomartillo',
    description: 'Identificador UUID de la herramienta o equipo (tipo ASSET_TOOL)',
  })
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  itemId: string;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Cantidad de unidades a prestar (herramientas menores)',
  })
  @IsOptional()
  @IsNumber({}, { message: 'La cantidad debe ser un numero' })
  @Min(0.0001, { message: 'La cantidad debe ser mayor a cero' })
  quantity?: number = 1;

  @ApiPropertyOptional({
    example: 'ROTO-BOSCH-004',
    description: 'Numero de serie o codigo patrimonial para herramientas mayores',
  })
  @IsOptional()
  @IsString({ message: 'El codigo de serie debe ser una cadena de texto' })
  serialOrCode?: string;

  @ApiProperty({
    example: 'Pedro Quispe Ramirez',
    description: 'Nombre completo del operario o capataz que recibe la herramienta',
  })
  @IsString({ message: 'El nombre del operario debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del operario no puede estar vacio' })
  assignedToName: string;

  @ApiProperty({
    example: '70123456',
    description: 'Documento Nacional de Identidad del operario (8 digitos numericos)',
  })
  @IsString({ message: 'El DNI debe ser una cadena de texto' })
  @Matches(/^[0-9]{8}$/, {
    message: 'El DNI debe estar compuesto exactamente por 8 digitos numericos',
  })
  assignedToDni: string;

  @ApiPropertyOptional({
    example: '2026-09-23T17:00:00.000Z',
    description: 'Fecha y hora estimada de devolucion a la caseta de obra',
  })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha estimada de devolucion debe ser una fecha valida ISO' })
  expectedReturnDate?: string;

  @ApiPropertyOptional({
    enum: ToolCondition,
    default: ToolCondition.OPERATIVE,
    description: 'Estado fisico y operativo al momento del despacho',
  })
  @IsOptional()
  @IsEnum(ToolCondition, { message: 'La condicion de entrega no es valida' })
  conditionOnDispatch?: ToolCondition = ToolCondition.OPERATIVE;

  @ApiPropertyOptional({
    example: 'Entregado con maletin de transporte y 2 brocas para concreto',
    description: 'Observaciones o accesorios entregados junto con el bien',
  })
  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto' })
  notes?: string;
}
