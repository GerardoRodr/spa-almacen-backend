import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service.js';

// Estrategia Passport JWT para validar tokens Bearer
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.secret') ??
        'super-secret-key-cambiar-en-produccion',
    });
  }

  // Validar el payload del token y cargar usuario con almacenes autorizados
  async validate(payload: { sub: string; email: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        assignedWarehouses: {
          select: {
            id: true,
            warehouseId: true,
            isDefault: true,
            warehouse: {
              select: {
                id: true,
                name: true,
                type: true,
                isTemporary: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Usuario inactivo o sesion no autorizada en el sistema',
      );
    }

    return user;
  }
}
