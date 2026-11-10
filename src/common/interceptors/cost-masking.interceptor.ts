import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Role, Prisma } from '@prisma/client';

// Lista de propiedades financieras confidenciales a enmascarar para almaceneros
const FINANCIAL_KEYS = new Set([
  'averageCost',
  'unitPriceOriginal',
  'unitCostBasePEN',
  'subtotalPEN',
  'igvAmountPEN',
  'totalAmountPEN',
  'unitCostSnapshot',
  'totalCostSnapshot',
  'inventoryValuationPEN',
  'suppliesValuationPEN',
  'toolsInvestmentPEN',
  'minUnitCostPEN',
  'maxUnitCostPEN',
  'currentWeightedAverageCostPEN',
  'newWarehouseAverageCost',
  's10UnitPrice',
  'minHistoricalUnitCost',
  'weightedAverageCost',
  's10BudgetUnitPrice',
  // Totales y KPIs presupuestales S10
  's10TotalBudget',
  's10MaterialsBudget',
  's10EquipmentBudget',
  's10LaborBudget',
  's10SubcontractsBudget',
  'totalBudgetPEN',
  'materialsBudgetPEN',
  'equipmentBudgetPEN',
  'laborBudgetPEN',
  'subcontractsBudgetPEN',
  'totalDeficitEstimatedCostPEN',
]);

// Funcion recursiva para eliminar datos de costos y precios
function purgeFinancialData(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => purgeFinancialData(item));
  }

  if (data !== null && typeof data === 'object') {
    // Preservar instancias de Date y Prisma.Decimal (o equivalentes con toJSON/toNumber)
    if (data instanceof Date) {
      return data;
    }

    if (
      Prisma.Decimal.isDecimal(data) ||
      (typeof data === 'object' &&
        data !== null &&
        ('_isDecimal' in data ||
          (typeof (data as Record<string, unknown>).toNumber === 'function' &&
            Array.isArray((data as Record<string, unknown>).d))))
    ) {
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
