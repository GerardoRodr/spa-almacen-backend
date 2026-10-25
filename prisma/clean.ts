import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clean() {
  console.log('[Clean] Iniciando vaciado total de la base de datos (dejando en 0 registros)...');

  // Ejecucion dentro de transaccion para garantizar atomicidad y consistencia
  await prisma.$transaction(async (tx) => {
    await tx.documentSequence.deleteMany();
    await tx.documentAttachment.deleteMany();
    await tx.machineryShiftLog.deleteMany();
    await tx.movementItem.deleteMany();
    await tx.movement.deleteMany();
    await tx.transferItem.deleteMany();
    await tx.transfer.deleteMany();
    await tx.toolCustody.deleteMany();
    await tx.purchaseDetail.deleteMany();
    await tx.purchase.deleteMany();
    await tx.stock.deleteMany();
    await tx.projectRequirement.deleteMany();
    await tx.itemAlias.deleteMany();
    await tx.item.deleteMany();
    await tx.itemCategory.deleteMany();
    await tx.userWarehouse.deleteMany();
    await tx.supplier.deleteMany();
    await tx.warehouse.deleteMany();
    await tx.project.deleteMany();
    await tx.user.deleteMany();
  });

  console.log('[Clean] Base de datos vaciada exitosamente. Todas las tablas quedaron con 0 registros.');
}

clean()
  .catch((e) => {
    console.error('[Clean] Error durante el vaciado de la base de datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
