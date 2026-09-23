import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Role } from '@prisma/client';

// Lista de propiedades financieras confidenciales a enmascarar para almaceneros
const FINANCIAL_KEYS = new Set([
  'averageCost',
  'unitPriceOriginal',
  'unitCostBasePEN',
  'subtotalPEN',
  'totalAmountPEN',
  'unitCostSnapshot',
  'totalCostSnapshot',
]);

// Funcion recursiva para eliminar datos de costos y precios
function purgeFinancialData(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => purgeFinancialData(item));
  }

  if (data !== null && typeof data === 'object') {
    // Preservar instancias de Date y objetos especiales
    if (data instanceof Date) {
      return data;
    }

    const cleaned: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (FINANCIAL_KEYS.has(key)) {
        continue;
      }
      cleaned[key] = purgeFinancialData(value);
    }

    return cleaned;
  }

  return data;
}

// Interceptor para ocultar costos en respuestas dirigidas a roles no administrativos
@Injectable()
export class CostMaskingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    return next.handle().pipe(
      map((data) => {
        // Si el usuario es almacenero se purgan los campos de costo
        if (user && user.role === Role.WAREHOUSE_KEEPER) {
          return purgeFinancialData(data);
        }
        return data;
      }),
    );
  }
}
