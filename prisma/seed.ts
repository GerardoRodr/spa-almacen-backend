import { PrismaClient, Role, WarehouseType } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Lista oficial de colaboradores iniciales para el sistema
const INITIAL_USERS = [
  {
    email: 'paloje@hotmail.com',
    fullName: 'Paulo Palomino Ojeda',
    role: Role.ADMIN,
    password: 'P@ulo#2026Admin',
    isActive: true,
  },
  {
    email: 'brunorpo@hotmail.com',
    fullName: 'Bruno Palomino Ojeda',
    role: Role.MODERATOR,
    password: 'Brun0#2026Mod',
    isActive: true,
  },
  {
    email: 'vane_924@hotmail.com',
    fullName: 'Karla Malca Castro',
    role: Role.MODERATOR,
    password: 'K@rla#2026Mod',
    isActive: true,
  },
  {
    email: 'levasquezco@gmail.com',
    fullName: 'Luis Vázquez Cotrina',
    role: Role.WAREHOUSE_KEEPER,
    password: 'Lu1s#2026Alm',
    isActive: true,
  },
];

// Catalogo maestro corporativo de unidades de medida
const DEFAULT_MEASUREMENT_UNITS = [
  { code: 'UND', name: 'Unidad', description: 'Unidad de pieza o articulo individual' },
  { code: 'UNIDAD', name: 'Unidad', description: 'Equivalente textual de unidad' },
  { code: 'BOLSA', name: 'Bolsa', description: 'Bolsa (ej. Cemento 42.5 kg)' },
  { code: 'KG', name: 'Kilogramo', description: 'Unidad de masa en kilogramos' },
  { code: 'M3', name: 'Metro Cubico', description: 'Unidad de volumen para agregados o concreto' },
  { code: 'M2', name: 'Metro Cuadrado', description: 'Unidad de area para encofrados o acabados' },
  { code: 'METRO', name: 'Metro Lineal', description: 'Unidad de longitud lineal' },
  { code: 'VARILLA', name: 'Varilla de Acero', description: 'Varilla de construccion' },
  { code: 'GLN', name: 'Galon', description: 'Galon de combustible o liquido' },
  { code: 'GALON', name: 'Galon', description: 'Equivalente textual de galon' },
  { code: 'MILLAR', name: 'Millar', description: 'Mil unidades (ej. ladrillos)' },
  { code: 'TUBO', name: 'Tubo', description: 'Tubo PVC, conduit o fierro' },
  { code: 'PQTE', name: 'Paquete', description: 'Paquete de articulos agrupados' },
  { code: 'ROLLO', name: 'Rollo', description: 'Rollo de alambre o geomembrana' },
  { code: 'LITRO', name: 'Litro', description: 'Unidad de volumen liquido' },
  { code: 'CIENTO', name: 'Ciento', description: 'Cien unidades' },
  { code: 'CAJA', name: 'Caja', description: 'Caja contenedora' },
  { code: 'PLIEGO', name: 'Pliego', description: 'Pliego de lija o lamina' },
  { code: 'LATA', name: 'Lata', description: 'Lata de pintura, solvente o pegamento' },
  { code: 'BALDE', name: 'Balde', description: 'Balde de pintura o aditivo' },
  { code: 'PAR', name: 'Par', description: 'Par de guantes o calzado' },
  { code: 'JGO', name: 'Juego', description: 'Juego de herramientas o llaves' },
];

// Secuencias correlativas iniciales para SKU y documentos
const INITIAL_DOCUMENT_SEQUENCES = [
  // Secuencias atemporales para SKU de insumos (year: 0)
  { year: 0, prefix: 'MAT', nextSeq: 1 },
  { year: 0, prefix: 'HER', nextSeq: 1 },
  { year: 0, prefix: 'EQU', nextSeq: 1 },
  { year: 0, prefix: 'MAQ', nextSeq: 1 },
  // Secuencias operativas anuales (year: 2026)
  { year: 2026, prefix: 'MOV', nextSeq: 1 },
  { year: 2026, prefix: 'TR', nextSeq: 1 },
  { year: 2026, prefix: 'VALE', nextSeq: 1 },
];

async function main() {
  console.log('[Seed] Iniciando siembra limpia de base de datos...');

  // 1. Limpieza total de tablas en orden inverso de dependencias FK
  console.log('[Seed] Limpiando datos existentes en la base de datos...');
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
    await tx.measurementUnit.deleteMany();
    await tx.userWarehouse.deleteMany();
    await tx.supplier.deleteMany();
    await tx.warehouse.deleteMany();
    await tx.project.deleteMany();
    await tx.user.deleteMany();
  });

  // 2. Creacion del Almacen Central unico inicial
  console.log('[Seed] Creando almacen central principal...');
  const centralWarehouse = await prisma.warehouse.create({
    data: {
      name: 'Almacen Central',
      type: WarehouseType.CENTRAL,
      isTemporary: false,
      isActive: true,
      projectId: null,
    },
  });

  // 3. Creacion de colaboradores oficiales y asignacion al Almacen Central
  console.log('[Seed] Registrando colaboradores oficiales del sistema...');
  for (const userDef of INITIAL_USERS) {
    const passwordHash = await bcrypt.hash(userDef.password, 10);
    const user = await prisma.user.create({
      data: {
        email: userDef.email.toLowerCase().trim(),
        passwordHash,
        fullName: userDef.fullName,
        role: userDef.role,
        isActive: userDef.isActive,
      },
    });

    // Asignar el almacen central como almacen por defecto
    await prisma.userWarehouse.create({
      data: {
        userId: user.id,
        warehouseId: centralWarehouse.id,
        isDefault: true,
      },
    });
  }

  // 4. Siembra del catalogo maestro de unidades de medida
  console.log('[Seed] Sembrando catalogo maestro de unidades de medida...');
  for (const mu of DEFAULT_MEASUREMENT_UNITS) {
    await prisma.measurementUnit.upsert({
      where: { code: mu.code },
      update: {
        name: mu.name,
        description: mu.description,
        isActive: true,
      },
      create: {
        code: mu.code,
        name: mu.name,
        description: mu.description,
        isActive: true,
      },
    });
  }

  // 5. Inicializacion de secuencias correlativas
  console.log('[Seed] Inicializando secuencias correlativas de documentos...');
  for (const seq of INITIAL_DOCUMENT_SEQUENCES) {
    await prisma.documentSequence.upsert({
      where: {
        year_prefix: {
          year: seq.year,
          prefix: seq.prefix,
        },
      },
      update: {
        nextSeq: seq.nextSeq,
      },
      create: {
        year: seq.year,
        prefix: seq.prefix,
        nextSeq: seq.nextSeq,
      },
    });
  }

  console.log('[Seed] Siembra final y limpia completada con exito.');
}

main()
  .catch((e) => {
    console.error('[Seed] Error durante la ejecucion del seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
