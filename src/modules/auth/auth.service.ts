import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // Validar credenciales y emitir tokens de sesion con almacenes autorizados
  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailForAuth(dto.email);

    if (!user) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('La cuenta de usuario se encuentra inactiva');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isMatch) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: (this.configService.get<string>('jwt.expiresIn') ?? '15m') as any,
    });

    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: (this.configService.get<string>('jwt.refreshExpiresIn') ?? '7d') as any,
      },
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        assignedWarehouses: user.assignedWarehouses.map((uw) => ({
          warehouseId: uw.warehouseId,
          isDefault: uw.isDefault,
          name: uw.warehouse.name,
          type: uw.warehouse.type,
          isTemporary: uw.warehouse.isTemporary,
        })),
      },
    };
  }

  // Renovar access token a partir de un refresh token valido
  async refresh(dto: RefreshTokenDto) {
    try {
      const decoded = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const user = await this.usersService.findOne(decoded.sub);

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Usuario no valido o inactivo');
      }

      const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      };

      const accessToken = await this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: (this.configService.get<string>('jwt.expiresIn') ?? '15m') as any,
      });

      const newRefreshToken = await this.jwtService.signAsync(
        { sub: user.id },
        {
          secret: this.configService.get<string>('jwt.refreshSecret'),
          expiresIn:
            (this.configService.get<string>('jwt.refreshExpiresIn') ?? '7d') as any,
        },
      );

      return {
        accessToken,
        refreshToken: newRefreshToken,
      };
    } catch {
      throw new UnauthorizedException('Refresh token invalido o expirado');
    }
  }

  // Obtener perfil del usuario autenticado
  async getProfile(userId: string) {
    return this.usersService.findOne(userId);
  }
}
