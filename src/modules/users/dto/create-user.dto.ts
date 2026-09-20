import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'almacenero@obra.com', description: 'Correo electronico unico del usuario' })
  @IsEmail({}, { message: 'El correo electronico no es valido' })
  email: string;

  @ApiProperty({ example: 'ClaveSegura123!', description: 'Contrasena con longitud minima de 6 caracteres' })
  @IsString({ message: 'La contrasena debe ser una cadena de texto' })
  @MinLength(6, { message: 'La contrasena debe contener al menos 6 caracteres' })
  password: string;

  @ApiProperty({ example: 'Juan Perez', description: 'Nombre completo del trabajador o administrador' })
  @IsString({ message: 'El nombre completo debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre completo no puede estar vacio' })
  fullName: string;

  @ApiPropertyOptional({ enum: Role, default: Role.WAREHOUSE_KEEPER, description: 'Rol asignado al usuario' })
  @IsOptional()
  @IsEnum(Role, { message: 'El rol especificado no es valido' })
  role?: Role;

  @ApiPropertyOptional({ default: true, description: 'Estado de activacion de la cuenta' })
  @IsOptional()
  @IsBoolean({ message: 'El estado activo debe ser un booleano' })
  isActive?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Identificadores de almacenes asignados' })
  @IsOptional()
  @IsArray({ message: 'Los almacenes deben ser un arreglo de identificadores' })
  @IsString({ each: true, message: 'Cada identificador de almacen debe ser una cadena' })
  warehouseIds?: string[];

  @ApiPropertyOptional({ description: 'Identificador del almacen predeterminado' })
  @IsOptional()
  @IsString({ message: 'El almacen predeterminado debe ser una cadena' })
  defaultWarehouseId?: string;
}
