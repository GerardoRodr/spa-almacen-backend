import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Role } from '@prisma/client';

// Guard para verificar que el usuario almacenero solo opere en almacenes autorizados
@Injectable()
export class WarehouseAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    // Administradores poseen acceso global irrestricto
    if (user.role === Role.ADMIN) {
      return true;
    }

    // Extraer identificador del almacen objetivo desde cabecera, params, query o body
    const targetWarehouseId =
      request.headers['x-warehouse-id'] ||
      request.params?.warehouseId ||
      request.params?.id ||
      request.query?.warehouseId ||
      request.body?.warehouseId ||
      request.body?.originWarehouseId;

    if (!targetWarehouseId) {
      throw new BadRequestException(
        'Se requiere especificar el identificador del almacen en la peticion',
      );
    }

    // Verificar que el usuario tenga asignado el almacen
    const assigned = user.assignedWarehouses?.some(
      (uw: { warehouseId: string }) => uw.warehouseId === targetWarehouseId,
    );

    if (!assigned) {
      throw new ForbiddenException(
        'Acceso restringido: no tiene autorizacion para operar en este almacen',
      );
    }

    return true;
  }
}
