import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Juan Perez Modificado', description: 'Nombre completo del usuario' })
  @IsOptional()
  @IsString({ message: 'El nombre completo debe ser una cadena de texto' })
  fullName?: string;

  @ApiPropertyOptional({ enum: Role, description: 'Rol asignado al usuario' })
  @IsOptional()
  @IsEnum(Role, { message: 'El rol especificado no es valido' })
  role?: Role;

  @ApiPropertyOptional({ description: 'Estado de activacion de la cuenta' })
  @IsOptional()
  @IsBoolean({ message: 'El estado activo debe ser un booleano' })
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'NuevaClaveSegura123!', description: 'Nueva contrasena si se desea actualizar' })
  @IsOptional()
  @IsString({ message: 'La contrasena debe ser una cadena de texto' })
  @MinLength(6, { message: 'La contrasena debe contener al menos 6 caracteres' })
  password?: string;
}
