import { PrismaClient, Role, WarehouseType } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando siembra de datos iniciales...');

  // 1. Crear o recuperar Almacen Central Principal
  let centralWarehouse = await prisma.warehouse.findFirst({
    where: { type: WarehouseType.CENTRAL },
  });

  if (!centralWarehouse) {
    centralWarehouse = await prisma.warehouse.create({
      data: {
        name: 'Almacen Central Principal',
        type: WarehouseType.CENTRAL,
        isTemporary: false,
        isActive: true,
      },
    });
    console.log(`Almacen Central creado con id: ${centralWarehouse.id}`);
  } else {
    console.log(`Almacen Central existente con id: ${centralWarehouse.id}`);
  }

  // 2. Crear usuario Administrador inicial
  const adminEmail = 'admin@almacen.com';
  let adminUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!adminUser) {
    const adminPasswordHash = await bcrypt.hash('Admin1234!', 10);
    adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: adminPasswordHash,
        fullName: 'Administrador General',
        role: Role.ADMIN,
        isActive: true,
      },
    });
    console.log(`Usuario Administrador creado: ${adminEmail}`);
  } else {
    console.log(`Usuario Administrador existente: ${adminEmail}`);
  }

  // 3. Asignar Almacen Central al Administrador
  const adminAssignment = await prisma.userWarehouse.findUnique({
    where: {
      userId_warehouseId: {
        userId: adminUser.id,
        warehouseId: centralWarehouse.id,
      },
    },
  });

  if (!adminAssignment) {
    await prisma.userWarehouse.create({
      data: {
        userId: adminUser.id,
        warehouseId: centralWarehouse.id,
        isDefault: true,
      },
    });
    console.log('Almacen Central asignado como predeterminado al Administrador');
  }

  // 4. Crear usuario Almacenero de prueba
  const keeperEmail = 'almacenero@obra.com';
  let keeperUser = await prisma.user.findUnique({
    where: { email: keeperEmail },
  });

  if (!keeperUser) {
    const keeperPasswordHash = await bcrypt.hash('Almacen1234!', 10);
    keeperUser = await prisma.user.create({
      data: {
        email: keeperEmail,
        passwordHash: keeperPasswordHash,
        fullName: 'Juan Perez Almacenero',
        role: Role.WAREHOUSE_KEEPER,
        isActive: true,
      },
    });
    console.log(`Usuario Almacenero creado: ${keeperEmail}`);
  } else {
    console.log(`Usuario Almacenero existente: ${keeperEmail}`);
  }

  // 5. Asignar Almacen Central al Almacenero
  const keeperAssignment = await prisma.userWarehouse.findUnique({
    where: {
      userId_warehouseId: {
        userId: keeperUser.id,
        warehouseId: centralWarehouse.id,
      },
    },
  });

  if (!keeperAssignment) {
    await prisma.userWarehouse.create({
      data: {
        userId: keeperUser.id,
        warehouseId: centralWarehouse.id,
        isDefault: true,
      },
    });
    console.log('Almacen Central asignado al Almacenero');
  }

  console.log('Siembra de datos iniciales completada exitosamente');
}

main()
  .catch((e) => {
    console.error('Error durante la siembra:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
