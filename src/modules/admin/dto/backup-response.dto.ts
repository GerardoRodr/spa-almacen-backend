import { ApiProperty } from '@nestjs/swagger';

export class BackupResponseDto {
  @ApiProperty({
    example: 'backup-2026-09-23T12-35-00.dump',
    description: 'Identificador unico del respaldo generado',
  })
  backupId: string;

  @ApiProperty({
    example: 'almacen_erp_20260923_123500.dump',
    description: 'Nombre del archivo fisico de respaldo',
  })
  fileName: string;

  @ApiProperty({
    example: 2845920,
    description: 'Tamano del archivo de respaldo en bytes',
  })
  sizeBytes: number;

  @ApiProperty({
    example: '2026-09-23T12:35:00.000Z',
    description: 'Fecha y hora de generacion del respaldo',
  })
  createdAt: Date;

  @ApiProperty({
    example: 'COMPLETED',
    description: 'Estado de finalizacion del respaldo',
  })
  status: string;
}
