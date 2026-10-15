import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class SequenceGeneratorService {
  // Genera codigo correlativo de forma atomica y concurrente sin condicion de carrera
  async getNextCode(
    tx: Prisma.TransactionClient,
    prefix: 'MOV' | 'TR' | 'VALE',
    targetYear?: number,
  ): Promise<string> {
    const year = targetYear ?? new Date().getFullYear();

    // 1. Inicializar registro en DocumentSequence considerando registros preexistentes si no existe
    const existingSeq = await tx.documentSequence.findUnique({
      where: {
        year_prefix: {
          year,
          prefix,
        },
      },
    });

    if (!existingSeq) {
      let currentMax = 0;
      const codePrefix = `${prefix}-${year}-`;

      if (prefix === 'MOV') {
        const last = await tx.movement.findFirst({
          where: { movementNumber: { startsWith: codePrefix } },
          orderBy: { movementNumber: 'desc' },
          select: { movementNumber: true },
        });
        if (last) {
          const m = last.movementNumber.match(/MOV-\d{4}-(\d+)/);
          if (m) currentMax = parseInt(m[1], 10);
        }
      } else if (prefix === 'TR') {
        const last = await tx.transfer.findFirst({
          where: { transferNumber: { startsWith: codePrefix } },
          orderBy: { transferNumber: 'desc' },
          select: { transferNumber: true },
        });
        if (last) {
          const m = last.transferNumber.match(/TR-\d{4}-(\d+)/);
          if (m) currentMax = parseInt(m[1], 10);
        }
      } else if (prefix === 'VALE') {
        const last = await tx.toolCustody.findFirst({
          where: { custodyNumber: { startsWith: codePrefix } },
          orderBy: { custodyNumber: 'desc' },
          select: { custodyNumber: true },
        });
        if (last) {
          const m = last.custodyNumber.match(/VALE-\d{4}-(\d+)/);
          if (m) currentMax = parseInt(m[1], 10);
        }
      }

      await tx.documentSequence.upsert({
        where: {
          year_prefix: {
            year,
            prefix,
          },
        },
        create: {
          year,
          prefix,
          nextSeq: currentMax + 1,
        },
        update: {},
      });
    }

    // 2. Incremento atomico con UPDATE ... RETURNING (bloqueo de fila en PostgreSQL)
    const rows = await tx.$queryRaw<Array<{ nextSeq: number | bigint }>>`
      UPDATE "DocumentSequence"
      SET "nextSeq" = "nextSeq" + 1, "updatedAt" = NOW()
      WHERE "year" = ${year} AND "prefix" = ${prefix}
      RETURNING ("nextSeq" - 1) AS "nextSeq";
    `;

    const seqVal = rows[0]?.nextSeq ?? 1;
    const seqNumber = Number(seqVal);
    const formattedSeq = String(seqNumber).padStart(5, '0');

    return `${prefix}-${year}-${formattedSeq}`;
  }
}
