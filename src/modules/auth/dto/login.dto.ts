import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@almacen.com', description: 'Correo electronico registrado' })
  @IsEmail({}, { message: 'El correo electronico no tiene formato valido' })
  email: string;

  @ApiProperty({ example: 'Admin1234!', description: 'Contrasena de acceso' })
  @IsString({ message: 'La contrasena debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contrasena no puede estar vacia' })
  password: string;
}
