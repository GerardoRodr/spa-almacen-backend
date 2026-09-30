import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { BackupService } from './backup.service.js';

@Injectable()
export class AdminService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminService.name);
  private cronTimer?: NodeJS.Timeout;

  constructor(private readonly backupService: BackupService) {}

  onModuleInit() {
    this.scheduleDailyBackupCron();
  }

  onModuleDestroy() {
    if (this.cronTimer) {
      clearTimeout(this.cronTimer);
    }
  }

  // Programar tarea diaria de respaldo a las 02:00 UTC
  private scheduleDailyBackupCron() {
    const calculateDelayToNext02UTC = (): number => {
      const now = new Date();
      const target = new Date();
      target.setUTCHours(2, 0, 0, 0);

      // Si las 02:00 UTC de hoy ya pasaron, programar para las 02:00 UTC de manana
      if (now.getTime() >= target.getTime()) {
        target.setUTCDate(target.getUTCDate() + 1);
      }

      return target.getTime() - now.getTime();
    };

    const delayMs = calculateDelayToNext02UTC();
    this.logger.log(
      `Tarea programada de respaldo automatico configurada para ejecutarse en ${Math.round(delayMs / 1000 / 60)} minutos (02:00 UTC)`,
    );

    this.cronTimer = setTimeout(async () => {
      try {
        this.logger.log('Ejecutando respaldo automatico programado de las 02:00 UTC');
        await this.backupService.generateBackup();
        await this.backupService.purgeOldBackups(7);
      } catch (err) {
        this.logger.error('Error al ejecutar respaldo programado de las 02:00 UTC', err);
      } finally {
        // Re-programar para el siguiente ciclo de 24 horas
        this.scheduleDailyBackupCron();
      }
    }, delayMs);
  }
}
