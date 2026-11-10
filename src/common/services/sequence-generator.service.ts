import { Injectable } from '@nestjs/common';
import { ItemType, Prisma } from '@prisma/client';

export const ITEM_TYPE_PREFIX: Record<ItemType, string> = {
  CONSUMABLE: 'MAT',
  TOOL: 'HER',
  EQUIPMENT: 'EQU',
  MACHINERY: 'MAQ',
};

@Injectable()
export class SequenceGeneratorService {
  // Obtiene el prefijo de SKU segun la tipificacion del insumo
  getItemPrefix(type: ItemType): string {
    return ITEM_TYPE_PREFIX[type] || 'MAT';
  }

  // Previsualiza el proximo SKU sugerido sin avanzar la secuencia
  async previewNextItemSku(
    prisma: Prisma.TransactionClient,
    type: ItemType,
  ): Promise<{ sku: string; prefix: string }> {
    const prefix = this.getItemPrefix(type);
    const existingSeq = await prisma.documentSequence.findUnique({
      where: {
        year_prefix: {
          year: 0,
          prefix,
        },
      },
    });

    let nextNumber = existingSeq?.nextSeq;
    if (!nextNumber) {
      // Buscar el maximo sufijo numerico en los items existentes
      const items = await prisma.item.findMany({
        where: { sku: { startsWith: `${prefix}-` } },
        select: { sku: true },
      });

      let maxSeq = 0;
      const regex = new RegExp(`^${prefix}-(\\d+)$`);
      for (const item of items) {
        const match = item.sku.match(regex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxSeq) maxSeq = num;
        }
      }
      nextNumber = maxSeq + 1;
    }

    // Asegurar que no colisione con un SKU ya registrado
    while (true) {
      const candidate = `${prefix}-${String(nextNumber).padStart(4, '0')}`;
      const found = await prisma.item.findUnique({
        where: { sku: candidate },
        select: { id: true },
      });
      if (!found) {
        return { sku: candidate, prefix };
      }
      nextNumber++;
    }
  }

  // Genera codigo correlativo de forma atomica para SKU de item (ej. MAT-0001)
  async getNextItemSku(
    tx: Prisma.TransactionClient,
    type: ItemType,
  ): Promise<string> {
    const prefix = this.getItemPrefix(type);
    const year = 0; // Se utiliza year 0 para secuencias atemporales

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
      const items = await tx.item.findMany({
        where: { sku: { startsWith: `${prefix}-` } },
        select: { sku: true },
      });

      const regex = new RegExp(`^${prefix}-(\\d+)$`);
      for (const item of items) {
        const match = item.sku.match(regex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > currentMax) currentMax = num;
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

    // Obtener e incrementar secuencialmente garantizando unicidad
    while (true) {
      const rows = await tx.$queryRaw<Array<{ nextSeq: number | bigint }>>`
        UPDATE "DocumentSequence"
        SET "nextSeq" = "nextSeq" + 1, "updatedAt" = NOW()
        WHERE "year" = ${year} AND "prefix" = ${prefix}
        RETURNING ("nextSeq" - 1) AS "nextSeq";
      `;

      const seqVal = rows[0]?.nextSeq ?? 1;
      const seqNumber = Number(seqVal);
      const candidateSku = `${prefix}-${String(seqNumber).padStart(4, '0')}`;

      // Validar si existe colision con un SKU asignado manualmente
      const collision = await tx.item.findUnique({
        where: { sku: candidateSku },
        select: { id: true },
      });

      if (!collision) {
        return candidateSku;
      }
    }
  }

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
