import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service.js';
import { DashboardFilterDto } from './dto/dashboard-filter.dto.js';
import { DashboardMetricsDto } from './dto/dashboard-metrics.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CostMaskingInterceptor } from '../../common/interceptors/cost-masking.interceptor.js';

@ApiTags('Dashboard y Analitica')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metrics')
  @UseInterceptors(CostMaskingInterceptor)
  @ApiOperation({
    summary:
      'Consultar metricas y KPIs analiticos consolidados o por sede (enmascara valorizacion e inversion a almaceneros)',
  })
  @ApiResponse({
    status: 200,
    description: 'Metricas del dashboard obtenidas exitosamente',
    type: DashboardMetricsDto,
  })
  getMetrics(@Query() filter: DashboardFilterDto) {
    return this.dashboardService.getMetrics(filter.warehouseId);
  }

  @Get('stock-comparison')
  @ApiOperation({
    summary:
      'Comparativa de volumen de existencias entre Almacen Central y Almacenes de Obra para los insumos principales',
  })
  @ApiResponse({
    status: 200,
    description: 'Comparativa de stock obtenida exitosamente',
  })
  getStockComparison() {
    return this.dashboardService.getStockComparison();
  }

  @Get('urgent-replenishments')
  @ApiOperation({
    summary:
      'Listado de insumos con deficit de existencias por debajo del umbral minimo para reposicion urgente',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de reposiciones urgentes obtenido',
  })
  getUrgentReplenishments(@Query('warehouseId') warehouseId?: string) {
    return this.dashboardService.getUrgentReplenishments(warehouseId);
  }

  @Get('logical-reservations')
  @ApiOperation({
    summary:
      'Listado de reservas logicas comprometidas en proyectos activos o en planificacion',
  })
  @ApiResponse({
    status: 200,
    description: 'Reservas logicas por proyecto obtenidas',
  })
  getLogicalReservations() {
    return this.dashboardService.getLogicalReservations();
  }
}
