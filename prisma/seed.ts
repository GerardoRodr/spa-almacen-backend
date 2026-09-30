import {
  PrismaClient,
  Role,
  WarehouseType,
  ItemType,
  ProjectStatus,
} from '@prisma/client';
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

  // 2. Crear o recuperar Proyecto Piloto
  const pilotProjectId = 'c0000000-0000-4000-8000-000000000001';
  let pilotProject = await prisma.project.findUnique({
    where: { id: pilotProjectId },
  });

  if (!pilotProject) {
    pilotProject = await prisma.project.create({
      data: {
        id: pilotProjectId,
        name: 'Proyecto Piloto Torre Central',
        budgetCode: 'S10-PILOTO-2026',
        status: ProjectStatus.IN_PROGRESS,
      },
    });
    console.log(`Proyecto Piloto creado con id: ${pilotProject.id}`);
  } else {
    console.log(`Proyecto Piloto existente con id: ${pilotProject.id}`);
  }

  // 3. Crear o recuperar Almacen de Obra para Proyecto Piloto
  let obraWarehouse = await prisma.warehouse.findFirst({
    where: { projectId: pilotProject.id },
  });

  if (!obraWarehouse) {
    obraWarehouse = await prisma.warehouse.create({
      data: {
        name: 'Almacen Obra Piloto Torre Central',
        type: WarehouseType.PROJECT_SITE,
        isTemporary: true,
        isActive: true,
        projectId: pilotProject.id,
      },
    });
    console.log(`Almacen de Obra Piloto creado con id: ${obraWarehouse.id}`);
  } else {
    console.log(`Almacen de Obra Piloto existente con id: ${obraWarehouse.id}`);
  }

  // 4. Crear usuario Administrador inicial
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

  // 5. Asignar Almacenes al Administrador
  await prisma.userWarehouse.upsert({
    where: {
      userId_warehouseId: {
        userId: adminUser.id,
        warehouseId: centralWarehouse.id,
      },
    },
    create: {
      userId: adminUser.id,
      warehouseId: centralWarehouse.id,
      isDefault: true,
    },
    update: {},
  });

  await prisma.userWarehouse.upsert({
    where: {
      userId_warehouseId: {
        userId: adminUser.id,
        warehouseId: obraWarehouse.id,
      },
    },
    create: {
      userId: adminUser.id,
      warehouseId: obraWarehouse.id,
      isDefault: false,
    },
    update: {},
  });
  console.log('Almacenes asignados al Administrador');

  // 6. Crear usuario Almacenero de prueba
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

  // 7. Asignar Almacenes al Almacenero
  await prisma.userWarehouse.upsert({
    where: {
      userId_warehouseId: {
        userId: keeperUser.id,
        warehouseId: centralWarehouse.id,
      },
    },
    create: {
      userId: keeperUser.id,
      warehouseId: centralWarehouse.id,
      isDefault: false,
    },
    update: {},
  });

  await prisma.userWarehouse.upsert({
    where: {
      userId_warehouseId: {
        userId: keeperUser.id,
        warehouseId: obraWarehouse.id,
      },
    },
    create: {
      userId: keeperUser.id,
      warehouseId: obraWarehouse.id,
      isDefault: true,
    },
    update: {},
  });
  console.log('Almacenes asignados al Almacenero');

  // 8. Crear Proveedor Base
  const supplierTaxId = '20100138112';
  let baseSupplier = await prisma.supplier.findUnique({
    where: { taxId: supplierTaxId },
  });

  if (!baseSupplier) {
    baseSupplier = await prisma.supplier.create({
      data: {
        taxId: supplierTaxId,
        businessName: 'CORPORACION ACEROS AREQUIPA S.A.',
        contactPhone: '+51 1 5171800',
        contactEmail: 'ventas@acerosarequipa.com',
        address: 'Av. Enrique Meiggs 297, Callao',
      },
    });
    console.log(`Proveedor base creado: ${baseSupplier.businessName}`);
  } else {
    console.log(`Proveedor base existente: ${baseSupplier.businessName}`);
  }

  // 9. Crear Catalogo Maestro de Items Iniciales
  const seedItems = [
    {
      sku: 'MAT-CEM-001',
      name: 'Cemento Portland Sol Tipo I 42.5kg',
      description: 'Bolsa de cemento estandar para vaciado de columnas y losas',
      baseUnit: 'BOLSA',
      type: ItemType.CONSUMABLE,
      minStockAlert: 50.0,
    },
    {
      sku: 'MAT-ACE-001',
      name: 'Fierro Corrugado 1/2 Grado 60',
      description: 'Varilla de acero de 9 metros para armaduras estructurales',
      baseUnit: 'VARILLA',
      type: ItemType.CONSUMABLE,
      minStockAlert: 100.0,
    },
    {
      sku: 'EQU-ROT-001',
      name: 'Rotomartillo Bosch GBH 2-28 D 850W',
      description: 'Equipo electro-neumatico con encastre SDS Plus para perforacion',
      baseUnit: 'UNIDAD',
      type: ItemType.ASSET_TOOL,
      minStockAlert: 2.0,
    },
    {
      sku: 'EQU-AMO-001',
      name: 'Amoladora Angular DeWalt 4 1/2 pulgada',
      description: 'Herramienta rotativa de 900W para corte y desbaste metalico',
      baseUnit: 'UNIDAD',
      type: ItemType.ASSET_TOOL,
      minStockAlert: 2.0,
    },
  ];

  const createdItemsMap = new Map<string, string>();

  for (const itemData of seedItems) {
    let item = await prisma.item.findUnique({
      where: { sku: itemData.sku },
    });

    if (!item) {
      item = await prisma.item.create({ data: itemData });
      console.log(`Item maestro creado: ${item.sku} (${item.name})`);
    } else {
      console.log(`Item maestro existente: ${item.sku}`);
    }

    createdItemsMap.set(item.sku, item.id);

    // Inicializar stocks en ceros si no existen
    await prisma.stock.upsert({
      where: {
        warehouseId_itemId: {
          warehouseId: centralWarehouse.id,
          itemId: item.id,
        },
      },
      create: {
        warehouseId: centralWarehouse.id,
        itemId: item.id,
        physicalQty: 0,
        reservedQty: 0,
        loanedQty: 0,
        averageCost: 0,
      },
      update: {},
    });

    await prisma.stock.upsert({
      where: {
        warehouseId_itemId: {
          warehouseId: obraWarehouse.id,
          itemId: item.id,
        },
      },
      create: {
        warehouseId: obraWarehouse.id,
        itemId: item.id,
        physicalQty: 0,
        reservedQty: 0,
        loanedQty: 0,
        averageCost: 0,
      },
      update: {},
    });
  }

  // 10. Homologaciones de Alias S10
  const cementItemId = createdItemsMap.get('MAT-CEM-001')!;
  const steelItemId = createdItemsMap.get('MAT-ACE-001')!;

  const seedAliases = [
    {
      itemId: cementItemId,
      s10RawName: 'CEMENTO PORTLAND TIPO I (BOLSA 42.5KG)',
      s10Code: '0201010001',
      s10Unit: 'BOL',
      conversionFactor: 1.0,
    },
    {
      itemId: steelItemId,
      s10RawName: 'ACERO CORRUGADO FY=4200 KG/CM2 GRADO 60',
      s10Code: '0201020002',
      s10Unit: 'VAR',
      conversionFactor: 1.0,
    },
  ];

  for (const aliasData of seedAliases) {
    await prisma.itemAlias.upsert({
      where: { s10RawName: aliasData.s10RawName },
      create: aliasData,
      update: {},
    });
  }
  console.log('Alias S10 homologados');

  // 11. Requerimientos Presupuestales S10 en Proyecto Piloto
  await prisma.projectRequirement.upsert({
    where: {
      projectId_itemId: {
        projectId: pilotProject.id,
        itemId: cementItemId,
      },
    },
    create: {
      projectId: pilotProject.id,
      itemId: cementItemId,
      requiredQty: 500.0,
      allocatedQty: 0.0,
      consumedQty: 0.0,
    },
    update: {},
  });

  await prisma.projectRequirement.upsert({
    where: {
      projectId_itemId: {
        projectId: pilotProject.id,
        itemId: steelItemId,
      },
    },
    create: {
      projectId: pilotProject.id,
      itemId: steelItemId,
      requiredQty: 250.0,
      allocatedQty: 0.0,
      consumedQty: 0.0,
    },
    update: {},
  });
  console.log('Requerimientos presupuestales S10 registrados en Proyecto Piloto');

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
