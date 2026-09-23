import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSupplierDto {
  @ApiProperty({
    example: '20100138112',
    description: 'Numero de RUC del proveedor (11 digitos numericos)',
  })
  @IsString({ message: 'El RUC debe ser una cadena de texto' })
  @Matches(/^[0-9]{11}$/, {
    message: 'El RUC debe estar compuesto exactamente por 11 digitos numericos',
  })
  taxId: string;

  @ApiProperty({
    example: 'CORPORACION ACEROS AREQUIPA S.A.',
    description: 'Razon social o nombre comercial del proveedor',
  })
  @IsString({ message: 'La razon social debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La razon social no puede estar vacia' })
  businessName: string;

  @ApiPropertyOptional({
    example: '+51 1 5171800',
    description: 'Telefono de contacto principal o ventas',
  })
  @IsOptional()
  @IsString({ message: 'El telefono debe ser una cadena de texto' })
  contactPhone?: string;

  @ApiPropertyOptional({
    example: 'ventas@acerosarequipa.com',
    description: 'Correo electronico para envio de cotizaciones y facturas',
  })
  @IsOptional()
  @IsEmail({}, { message: 'El correo electronico de contacto no es valido' })
  contactEmail?: string;

  @ApiPropertyOptional({
    example: 'Av. Enrique Meiggs 297, Callao',
    description: 'Direccion fiscal o del centro de distribucion',
  })
  @IsOptional()
  @IsString({ message: 'La direccion debe ser una cadena de texto' })
  address?: string;
}
