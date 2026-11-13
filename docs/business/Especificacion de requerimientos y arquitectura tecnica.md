# ESPECIFICACIÓN DE REQUERIMIENTOS Y ARQUITECTURA TÉCNICA (SRS)

## Proyecto: SPA-ALMACEN-ERP

---

### 1. Arquitectura y Topología de Infraestructura

El sistema opera bajo una arquitectura desacoplada monolito modular en el backend (NestJS 12+ con ESM puro) y una Single Page Application (SPA) reactiva en el frontend, alojados en una única instancia VPS KVM 2 (100 GB SSD NVMe, 4 GB RAM, 2 vCPU) ejecutando Ubuntu 24.04 LTS.

```
                            [ Cliente: Navegador / Tablet de Obra ]
                                              │
                                              ▼
                             [ Nginx (Reverse Proxy & Cache) ]
                                 │                       │
           /api/v1/* ────────────┘                       └──────────── /uploads/* (Protegido)
           │                                                           │
           ▼                                                           ▼
 [ Backend: NestJS 12+ (ESM) ]                              [ Almacenamiento Local Seguro ]
   ├── Auth & RBAC Guard (Admin / Moderator / WarehouseKeeper) /var/www/almacen-erp/uploads/
   ├── WarehouseAccessGuard (Filtro por Obra)                 ├── Facturas y Comprobantes (Auth Admin/Moderator/Sede)
   ├── Sharp Compression Pipe (WebP / 80%)                    ├── Guias y Fotos Operativas (Auth)
   ├── S10 Engine (CSV Parser & Gap Analysis)                 └── Backups Locales (Rotacion 7d)
   └── Prisma ORM v6
           │
           ▼
[ Base de Datos: PostgreSQL 16+ ]
 (Transacciones ACID, Precision Decimal 14,4, Indices B-Tree)
```

#### Especificacion de Almacenamiento y Assets
* **Gestion de Archivos y Seguridad:** Las cargas multipart se procesan mediante `Multer` e interceptores de NestJS. Las imagenes se procesan mediante **Sharp**: se normalizan a un ancho maximo de 1920 px, se convierten a formato `.webp` con compresion al 80% y se les asigna un UUID como nombre de archivo. Los PDFs se validan por cabecera MIME (`application/pdf`) y se restringen a un tamano maximo de 15 MB.
* **Entrega Segura de Documentos Financieros:** Para cumplir la regla de confidencialidad y datos ciegos a costos para almaceneros, las facturas de compra y comprobantes de costos **no** se exponen estaticamente sin autenticacion. Se descargan a traves de endpoints autenticados (`GET /api/v1/documents/:id/download`): `ADMIN` y `MODERATOR` acceden sin restriccion, mientras `WAREHOUSE_KEEPER` unicamente puede acceder a comprobantes confidenciales vinculados a compras de sus almacenes asignados en `UserWarehouse`.
* **Estrategia de Backup:** Tarea programada mediante `cron` a las 02:00 UTC que ejecuta `pg_dump`, comprime el volcado en `.sql.gz`/`.tar.gz`, purga copias locales con antiguedad superior a 7 dias y habilita descarga directa para `ADMIN` y `MODERATOR`.

---

### 2. Matriz de Control de Acceso (RBAC)

La seguridad del sistema opera mediante tres roles (`ADMIN`, `MODERATOR` y `WAREHOUSE_KEEPER`) con segregacion estricta de visibilidad financiera y alcance operativo:

| Modulo / Funcionalidad | `ADMIN` (Direccion) | `MODERATOR` (Residente / Supervisora) | `WAREHOUSE_KEEPER` (Almacenero) |
| :--- | :---: | :---: | :---: |
| **Gestion de Usuarios y Asignacion de Sedes** | Exclusivo | Acceso Denegado | Acceso Denegado |
| **Selector de Almacen Activo** | Acceso Global | Acceso Global | Solo Almacenes Asignados (`UserWarehouse`) |
| **Catalogo Maestro (`items` / `item-categories` / `measurement-units`)** | Total | Total | Solo Lectura (salvo alta rapida `POST /items` y `POST /suppliers`) |
| **Gestion de Alias S10 (`ItemAlias`)** | Total | Total | Acceso Denegado |
| **Visualizacion de Costos, Precios y CPP** | **Visible** | **Visible** | **Bloqueado / Enmascarado** (`CostMaskingInterceptor`) |
| **Compras, Reversion, Edicion y Reemplazo** | Total (Global) | Total (Global) | Permitido en sus sedes (con costos ciegos) |
| **Transferencias, Consumos, Custodia y Maquinaria** | Total (Global) | Total (Global) | Operativo en sus sedes asignadas |
| **Presupuestos S10, Gap Analysis y Liquidacion de Obra** | Total | Total | Acceso Denegado |
| **Ajustes Formales de Inventario y Valorizacion** | Total | Total | Acceso Denegado |
| **Descarga de Copias de Seguridad (`backups`)** | Permitido | Permitido | Acceso Denegado |

---

### 3. Esquema de Base de Datos Definitivo (Prisma ORM v6 - 21 Modelos y 9 Enums)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// --------------------------------------------------------
// ENUMS DE DOMINIO (9)
// --------------------------------------------------------

enum Role {
  ADMIN
  MODERATOR
  WAREHOUSE_KEEPER
}

enum ItemType {
  CONSUMABLE
  TOOL
  EQUIPMENT
  MACHINERY
}

enum MeterType {
  HOUR_METER
  KILOMETER
}

enum WarehouseType {
  CENTRAL
  PROJECT_SITE
}

enum TransferStatus {
  PENDING
  IN_TRANSIT
  COMPLETED
  DISCREPANCY
  CANCELLED
}

enum MovementType {
  PURCHASE_ENTRY       // Ingreso por compra a proveedor
  CONSUMPTION_EXIT     // Salida definitiva entregada a cuadrilla en obra
  TRANSFER_DISPATCH    // Salida fisica desde origen hacia transito
  TRANSFER_RECEIPT     // Entrada fisica en destino confirmada
  LOAN_DISPATCH        // Salida de herramienta a operario en custodia
  LOAN_RETURN          // Retorno de herramienta a caseta
  SHRINKAGE_EXIT       // Merma fisica, perdida en transporte o rotura
  INVENTORY_ADJUSTMENT // Ajuste manual por inventario fisico formal
  REVERSAL_ENTRY       // Contra-asiento de ingreso (revierte una salida previa)
  REVERSAL_EXIT        // Contra-asiento de salida (revierte un ingreso previo)
}

enum ToolCondition {
  NEW
  OPERATIVE
  DAMAGED_USABLE
  DAMAGED_UNUSABLE
  MAINTENANCE_REQUIRED
  LOST
}

enum Currency {
  PEN
  USD
}

enum ProjectStatus {
  PLANNING
  ACTIVE
  LIQUIDATED
  ARCHIVED
}

// --------------------------------------------------------
// USUARIOS Y ACCESO MULTI-ALMACEN
// --------------------------------------------------------

model User {
  id                      String              @id @default(uuid())
  email                   String              @unique
  passwordHash            String
  fullName                String
  role                    Role                @default(WAREHOUSE_KEEPER)
  isActive                Boolean             @default(true)

  assignedWarehouses      UserWarehouse[]
  movements               Movement[]
  dispatchedTransfers     Transfer[]          @relation("DispatchedTransfers")
  receivedTransfers       Transfer[]          @relation("ReceivedTransfers")
  dispatchedLoans         ToolCustody[]       @relation("DispatchedLoans")
  receivedLoans           ToolCustody[]       @relation("ReceivedLoans")
  revertedMovements       Movement[]          @relation("RevertedMovements")
  revertedPurchases       Purchase[]          @relation("RevertedPurchases")
  cancelledTransfers      Transfer[]          @relation("CancelledTransfers")
  revertedToolCustodies   ToolCustody[]       @relation("RevertedToolCustodies")
  revertedMachineryShifts MachineryShiftLog[] @relation("RevertedMachineryShifts")

  createdAt               DateTime            @default(now())
  updatedAt               DateTime            @updatedAt
}

model UserWarehouse {
  id          String    @id @default(uuid())
  userId      String
  warehouseId String
  isDefault   Boolean   @default(false)

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  warehouse   Warehouse @relation(fields: [warehouseId], references: [id], onDelete: Cascade)

  @@unique([userId, warehouseId])
}

// --------------------------------------------------------
// ALMACENES Y GESTION DE STOCKS
// --------------------------------------------------------

model Warehouse {
  id              String              @id @default(uuid())
  name            String
  type            WarehouseType
  isTemporary     Boolean             @default(false)
  isActive        Boolean             @default(true)
  projectId       String?             @unique
  project         Project?            @relation(fields: [projectId], references: [id])

  stocks          Stock[]
  users           UserWarehouse[]
  originTransfers Transfer[]          @relation("OriginTransfers")
  destTransfers   Transfer[]          @relation("DestTransfers")
  movementsOrigin Movement[]          @relation("MovementOriginWarehouse")
  movementsDest   Movement[]          @relation("MovementDestWarehouse")
  toolCustodies   ToolCustody[]
  machineryShifts MachineryShiftLog[]
  purchases       Purchase[]

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
}

model Stock {
  id          String    @id @default(uuid())
  warehouseId String
  itemId      String
  physicalQty Decimal   @default(0) @db.Decimal(12, 4) // Cantidad en piso en este almacen
  reservedQty Decimal   @default(0) @db.Decimal(12, 4) // Comprometido en Almacen Central para obras
  loanedQty   Decimal   @default(0) @db.Decimal(12, 4) // Herramientas actualmente prestadas en campo
  averageCost Decimal   @default(0) @db.Decimal(14, 4) // Costo promedio ponderado en PEN sin IGV

  warehouse   Warehouse @relation(fields: [warehouseId], references: [id], onDelete: Cascade)
  item        Item      @relation(fields: [itemId], references: [id], onDelete: Cascade)

  @@unique([warehouseId, itemId])
  @@index([itemId])
}

// --------------------------------------------------------
// CATALOGO DE ITEMS, CATEGORIAS Y UNIDADES DE MEDIDA
// --------------------------------------------------------

model MeasurementUnit {
  id          String   @id @default(uuid())
  code        String   @unique // Codigo estandar ej. UND, BOLSA, KG, M3, VARILLA
  name        String           // Nombre descriptivo ej. Unidad, Bolsa, Kilogramo
  description String?
  isActive    Boolean  @default(true)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([code])
}

model ItemCategory {
  id          String   @id @default(uuid())
  name        String   @unique
  code        String?  @unique
  description String?
  isActive    Boolean  @default(true)

  items       Item[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Item {
  id              String               @id @default(uuid())
  sku             String               @unique
  name            String
  description     String?
  baseUnit        String               // UND, KG, M3, BOLSA, GLN, VARILLA
  type            ItemType
  meterType       MeterType?           // Solo aplica cuando type == MACHINERY (HOUR_METER | KILOMETER)
  minStockAlert   Decimal              @default(0) @db.Decimal(12, 4)
  isPerishable    Boolean              @default(false)
  categoryId      String?
  category        ItemCategory?        @relation(fields: [categoryId], references: [id], onDelete: SetNull)

  stocks          Stock[]
  aliases         ItemAlias[]
  purchaseDetails PurchaseDetail[]
  transferItems   TransferItem[]
  movementItems   MovementItem[]
  projectDemands  ProjectRequirement[]
  toolCustodies   ToolCustody[]
  machineryShifts MachineryShiftLog[]

  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt

  @@index([type])
  @@index([isPerishable])
  @@index([categoryId])
}

model ItemAlias {
  id               String   @id @default(uuid())
  itemId           String
  s10RawName       String   @unique // Nombre literal extraido del presupuesto S10
  s10Code          String?  // Codigo de partida o insumo S10
  s10Unit          String?  // Unidad en el S10 ej. M2, P2, BOL
  conversionFactor Decimal  @default(1.0000) @db.Decimal(10, 4) // Multiplicador para llevar a Item.baseUnit

  item             Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
}

// --------------------------------------------------------
// PROYECTOS Y ESTIMACIONES (S10)
// --------------------------------------------------------

model Project {
  id                    String               @id @default(uuid())
  name                  String
  budgetCode            String?              // Codigo del presupuesto S10
  status                ProjectStatus        @default(PLANNING)

  s10Location           String?
  s10Ubigeo             String?
  s10BudgetDate         DateTime?

  s10TotalBudget        Decimal?             @db.Decimal(14, 2)
  s10MaterialsBudget    Decimal?             @db.Decimal(14, 2)
  s10EquipmentBudget    Decimal?             @db.Decimal(14, 2)
  s10LaborBudget        Decimal?             @db.Decimal(14, 2)
  s10SubcontractsBudget Decimal?             @db.Decimal(14, 2)

  warehouse             Warehouse?
  requirements          ProjectRequirement[]
  transfers             Transfer[]
  movements             Movement[]

  createdAt             DateTime             @default(now())
  updatedAt             DateTime             @updatedAt
}

model ProjectRequirement {
  id           String   @id @default(uuid())
  projectId    String
  itemId       String
  requiredQty  Decimal  @db.Decimal(12, 4)
  allocatedQty Decimal  @default(0) @db.Decimal(12, 4)
  consumedQty  Decimal  @default(0) @db.Decimal(12, 4)
  s10UnitPrice Decimal? @db.Decimal(14, 4)

  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  item         Item     @relation(fields: [itemId], references: [id])

  @@unique([projectId, itemId])
}

// --------------------------------------------------------
// COMPRAS Y PROVEEDORES
// --------------------------------------------------------

model Supplier {
  id           String     @id @default(uuid())
  taxId        String     @unique // RUC 11 digitos
  businessName String
  contactPhone String?
  contactEmail String?
  address      String?
  notes        String?    @db.Text

  purchases    Purchase[]
  createdAt    DateTime   @default(now())
}

model Purchase {
  id                 String               @id @default(uuid())
  supplierId         String
  warehouseId        String?
  invoiceSeries      String
  voucherType        String               @default("FACTURA")
  hasIgv             Boolean              @default(true)
  currency           Currency             @default(PEN)
  exchangeRate       Decimal              @default(1.0000) @db.Decimal(8, 4)
  issueDate          DateTime
  subtotalPEN        Decimal              @db.Decimal(14, 2)
  igvAmountPEN       Decimal              @default(0) @db.Decimal(14, 2)
  totalAmountPEN     Decimal              @db.Decimal(14, 2)
  notes              String?              @db.Text
  isReverted         Boolean              @default(false)
  revertedAt         DateTime?
  revertedById       String?
  reversalReason     String?              @db.Text
  reversalMovementId String?
  replacedById       String?              @unique

  supplier           Supplier             @relation(fields: [supplierId], references: [id])
  warehouse          Warehouse?           @relation(fields: [warehouseId], references: [id])
  revertedBy         User?                @relation("RevertedPurchases", fields: [revertedById], references: [id])
  details            PurchaseDetail[]
  documents          DocumentAttachment[]

  createdAt          DateTime             @default(now())

  @@index([supplierId])
  @@index([warehouseId])
  @@index([issueDate])
  @@index([createdAt])
  @@index([isReverted])
}

model PurchaseDetail {
  id                String   @id @default(uuid())
  purchaseId        String
  itemId            String
  purchaseUnit      String
  conversionFactor  Decimal  @default(1.0000) @db.Decimal(10, 4)
  purchaseQty       Decimal  @db.Decimal(12, 4)
  baseQty           Decimal  @db.Decimal(12, 4)
  unitPriceOriginal Decimal  @db.Decimal(14, 4)
  unitCostBasePEN   Decimal  @db.Decimal(14, 4)
  subtotalPEN       Decimal  @db.Decimal(14, 2)
  notes             String?  @db.Text

  purchase          Purchase @relation(fields: [purchaseId], references: [id], onDelete: Cascade)
  item              Item     @relation(fields: [itemId], references: [id])

  @@index([purchaseId])
  @@index([itemId])
}

// --------------------------------------------------------
// TRANSFERENCIAS OPERATIVAS EN DOS FASES
// --------------------------------------------------------

model Transfer {
  id                 String               @id @default(uuid())
  transferNumber     String               @unique // TR-2026-00001
  originWarehouseId  String
  destWarehouseId    String
  projectId          String?
  status             TransferStatus       @default(PENDING)

  dispatchedById     String
  receivedById       String?
  dispatchedAt       DateTime?
  receivedAt         DateTime?
  dispatchNotes      String?
  receptionNotes     String?
  cancelledAt        DateTime?
  cancelledById      String?
  cancellationReason String?              @db.Text
  replacedById       String?              @unique

  originWarehouse    Warehouse            @relation("OriginTransfers", fields: [originWarehouseId], references: [id])
  destWarehouse      Warehouse            @relation("DestTransfers", fields: [destWarehouseId], references: [id])
  project            Project?             @relation(fields: [projectId], references: [id])
  dispatchedBy       User                 @relation("DispatchedTransfers", fields: [dispatchedById], references: [id])
  receivedBy         User?                @relation("ReceivedTransfers", fields: [receivedById], references: [id])
  cancelledBy        User?                @relation("CancelledTransfers", fields: [cancelledById], references: [id])

  items              TransferItem[]
  movements          Movement[]
  documents          DocumentAttachment[]

  createdAt          DateTime             @default(now())
  updatedAt          DateTime             @updatedAt

  @@index([originWarehouseId])
  @@index([destWarehouseId])
  @@index([status])
  @@index([createdAt])
}

model TransferItem {
  id               String   @id @default(uuid())
  transferId       String
  itemId           String
  dispatchedQty    Decimal  @db.Decimal(12, 4)
  receivedQty      Decimal? @db.Decimal(12, 4)
  discrepancyQty   Decimal? @db.Decimal(12, 4)
  unitCostSnapshot Decimal  @db.Decimal(14, 4)

  transfer         Transfer @relation(fields: [transferId], references: [id], onDelete: Cascade)
  item             Item     @relation(fields: [itemId], references: [id])

  @@index([transferId])
  @@index([itemId])
}

// --------------------------------------------------------
// KARDEX INMUTABLE Y CONTRA-ASIENTOS
// --------------------------------------------------------

model Movement {
  id                 String               @id @default(uuid())
  movementNumber     String               @unique // MOV-2026-00001
  type               MovementType
  originWarehouseId  String?
  destWarehouseId    String?
  projectId          String?
  userId             String
  transferId         String?

  recipientName      String?
  recipientDni       String?
  shrinkageReason    String?
  observation        String?
  isReverted         Boolean              @default(false)
  revertedAt         DateTime?
  revertedById       String?
  reversalReason     String?              @db.Text
  reversesMovementId String?              @unique
  replacedById       String?              @unique

  originWarehouse    Warehouse?           @relation("MovementOriginWarehouse", fields: [originWarehouseId], references: [id])
  destWarehouse      Warehouse?           @relation("MovementDestWarehouse", fields: [destWarehouseId], references: [id])
  project            Project?             @relation(fields: [projectId], references: [id])
  user               User                 @relation(fields: [userId], references: [id])
  transfer           Transfer?            @relation(fields: [transferId], references: [id])
  revertedBy         User?                @relation("RevertedMovements", fields: [revertedById], references: [id])
  reversesMovement   Movement?            @relation("MovementReversal", fields: [reversesMovementId], references: [id])
  reversedByMovement Movement?            @relation("MovementReversal")

  items              MovementItem[]
  documents          DocumentAttachment[]

  createdAt          DateTime             @default(now())

  @@index([originWarehouseId])
  @@index([destWarehouseId])
  @@index([projectId])
  @@index([userId])
  @@index([transferId])
  @@index([type])
  @@index([createdAt])
  @@index([isReverted])
}

model MovementItem {
  id                String   @id @default(uuid())
  movementId        String
  itemId            String
  quantity          Decimal  @db.Decimal(12, 4)
  unitCostSnapshot  Decimal  @db.Decimal(14, 4)
  totalCostSnapshot Decimal  @db.Decimal(14, 2)

  movement          Movement @relation(fields: [movementId], references: [id], onDelete: Cascade)
  item              Item     @relation(fields: [itemId], references: [id])

  @@index([movementId])
  @@index([itemId])
}

// --------------------------------------------------------
// CUSTODIA DE HERRAMIENTAS Y EQUIPOS
// --------------------------------------------------------

model ToolCustody {
  id                  String               @id @default(uuid())
  custodyNumber       String               @unique // VALE-2026-00001
  itemId              String
  warehouseId         String
  quantity            Decimal              @default(1) @db.Decimal(12, 4)
  serialOrCode        String?
  assignedToName      String
  assignedToDni       String

  dispatchedById      String
  receivedById        String?
  dispatchDate        DateTime             @default(now())
  expectedReturnDate  DateTime?
  returnDate          DateTime?

  conditionOnDispatch ToolCondition        @default(OPERATIVE)
  conditionOnReturn   ToolCondition?
  notes               String?
  returnNotes         String?
  isReverted          Boolean              @default(false)
  revertedAt          DateTime?
  revertedById        String?
  reversalReason      String?              @db.Text
  replacedById        String?              @unique

  item                Item                 @relation(fields: [itemId], references: [id])
  warehouse           Warehouse            @relation(fields: [warehouseId], references: [id])
  dispatchedBy        User                 @relation("DispatchedLoans", fields: [dispatchedById], references: [id])
  receivedBy          User?                @relation("ReceivedLoans", fields: [receivedById], references: [id])
  revertedBy          User?                @relation("RevertedToolCustodies", fields: [revertedById], references: [id])
  documents           DocumentAttachment[]

  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt

  @@index([warehouseId])
  @@index([itemId])
  @@index([assignedToDni])
  @@index([returnDate])
  @@index([dispatchDate])
  @@index([isReverted])
}

// --------------------------------------------------------
// DOCUMENTOS ADJUNTOS Y EVIDENCIAS
// --------------------------------------------------------

model DocumentAttachment {
  id             String       @id @default(uuid())
  purchaseId     String?
  transferId     String?
  movementId     String?
  custodyId      String?
  proofType      String?      // DISPATCH | RETURN

  originalName   String
  storedPath     String
  mimeType       String
  fileSizeBytes  Int
  isConfidential Boolean      @default(false)

  purchase       Purchase?    @relation(fields: [purchaseId], references: [id], onDelete: Cascade)
  transfer       Transfer?    @relation(fields: [transferId], references: [id], onDelete: Cascade)
  movement       Movement?    @relation(fields: [movementId], references: [id], onDelete: Cascade)
  custody        ToolCustody? @relation(fields: [custodyId], references: [id], onDelete: Cascade)

  createdAt      DateTime     @default(now())

  @@index([purchaseId])
  @@index([transferId])
  @@index([movementId])
  @@index([custodyId])
}

// --------------------------------------------------------
// JORNADAS, HOROMETROS Y KILOMETRAJES DE MAQUINARIA
// --------------------------------------------------------

model MachineryShiftLog {
  id             String    @id @default(uuid())
  itemId         String
  warehouseId    String
  operatorName   String
  operatorDni    String
  meterType      MeterType @default(HOUR_METER)
  startMeter     Decimal   @db.Decimal(10, 2)
  endMeter       Decimal?  @db.Decimal(10, 2)
  totalUsage     Decimal?  @db.Decimal(10, 2)
  startDateTime  DateTime  @default(now())
  endDateTime    DateTime?
  startPhotoId   String?
  endPhotoId     String?
  fuelPhotoId    String?
  notes          String?
  isReverted     Boolean   @default(false)
  revertedAt     DateTime?
  revertedById   String?
  reversalReason String?   @db.Text
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  item           Item      @relation(fields: [itemId], references: [id])
  warehouse      Warehouse @relation(fields: [warehouseId], references: [id])
  revertedBy     User?     @relation("RevertedMachineryShifts", fields: [revertedById], references: [id])

  @@index([itemId])
  @@index([warehouseId])
  @@index([isReverted])
}

// --------------------------------------------------------
// SECUENCIAS ATOMICAS PARA CORRELATIVOS
// --------------------------------------------------------

model DocumentSequence {
  id        String   @id @default(uuid())
  year      Int
  prefix    String
  nextSeq   Int      @default(1)
  updatedAt DateTime @updatedAt

  @@unique([year, prefix])
  @@index([year, prefix])
}
```


---

### 4. Especificación de Algoritmos y Reglas de Negocio

#### 4.1. Recálculo del Costo Promedio Ponderado (CPP)
Cada compra registrada en el almacén central ejecuta la actualización del costo medio ponderado dentro de una transacción atómica:

$$\text{CPP}_{\text{nuevo}} = \frac{(S_{\text{ant}} \times \text{CPP}_{\text{ant}}) + (Q_{\text{ing}} \times C_{\text{unitPEN}})}{S_{\text{ant}} + Q_{\text{ing}}}$$

Donde:
* $S_{\text{ant}}$ = `Stock.physicalQty` en Almacén Central previo al ingreso.
* $\text{CPP}_{\text{ant}}$ = `Stock.averageCost` previo al ingreso. Si $S_{\text{ant}} \le 0$, $\text{CPP}_{\text{nuevo}} = C_{\text{unitPEN}}$.
* $Q_{\text{ing}}$ = Cantidad ingresada expresada en la Unidad Base (`baseQty`).
* $C_{\text{unitPEN}}$ = Costo unitario neto en Soles sin IGV (`unitCostBasePEN`).

Si la compra se registra en dólares estadounidenses (`USD`), el sistema normaliza el costo unitario aplicando el tipo de cambio oficial ingresado en el encabezado de la compra:

$$C_{\text{unitPEN}} = \frac{\text{unitPriceOriginalNeto} \times \text{exchangeRate}}{\text{conversionFactor}}$$

#### 4.2. Cadena de Suministro en Tres Etapas (Reserva $\to$ Transferencia $\to$ Consumo)

1. **Etapa 1 (Reserva Lógica S10 en Central):**
   * El Administrador asocia requerimientos presupuestados.
   * Se valida `Stock.physicalQty - Stock.reservedQty >= Cantidad Solicitada`.
   * Transacción atómica: incrementa `Stock.reservedQty` en Central e incrementa `ProjectRequirement.allocatedQty`.
   * La liberación administrativa reduce `allocatedQty` y `reservedQty` de inmediato sin generar registros en Kardex.

2. **Etapa 2 (Transferencia en Dos Fases Central $\to$ Obra):**
   * **Fase 1 (Despacho):** Se valida `allocatedQty >= Q`. Se reduce `physicalQty` y `reservedQty` en Central, y se reduce `allocatedQty` en el requerimiento. Se genera `Movement` inmutable (`TRANSFER_DISPATCH`) y se crea `Transfer` en estado `IN_TRANSIT`.
   * **Fase 2 (Recepción en Obra):** El almacenero de obra inspecciona y cuenta físicamente.
     * *Conforme:* `Transfer.status = COMPLETED`. Se incrementa `Stock.physicalQty` en el Almacén de Obra mediante `Movement` (`TRANSFER_RECEIPT`). El material queda custodiado en caseta (aún no consumido).
     * *Discrepancia:* Se ingresa lo recibido conforme y la diferencia genera un `Movement` de `SHRINKAGE_EXIT` por pérdida en transporte con estado `DISCREPANCY`.

3. **Etapa 3 (Salida por Consumo Definitivo en Obra):**
   * Cuando el capataz o cuadrilla retira el material de la caseta para la faena:
     * El almacenero emite `Movement` de tipo `CONSUMPTION_EXIT`.
     * Se decrementa `Stock.physicalQty` del Almacén de Obra.
     * Se incrementa `ProjectRequirement.consumedQty += Q`.
     * Se congela el costo en `MovementItem.unitCostSnapshot`.

#### 4.3. Parser de S10 y Matriz de Análisis de Brechas (Gap Analysis)
1. **Lectura y Codificación:** Soporte de delimitadores `,` y `;` con codificación `Windows-1252` o `UTF-8`.
2. **Filtrado:** Descarte automático de partidas bajo `01 MANO DE OBRA` y `04 SUBCONTRATOS`. Ingesta exclusiva de `02 MATERIALES` y `03 EQUIPOS`.
3. **Resolución de SKU (Aliasing):**
   * Coincidencia con `ItemAlias.s10RawName`: asociación automática aplicando `conversionFactor`.
   * Sin coincidencia: estado `PENDIENTE_MAPEO` para vinculación o creación asistida.
4. **Cálculo de Requerimientos y Déficit:**
   $$\text{Stock Neto Disponible Central} = \sum (\text{Stock.physicalQty} - \text{Stock.reservedQty})_{\text{Almacenes Centrales}}$$
   $$\text{Déficit a Comprar} = \max(0, \text{Demanda Total Base S10} - \text{Stock Neto Disponible Central})$$
   Para la matriz economica de brechas (`getGapAnalysis`), `minHistoricalUnitCost` excluye compras revertidas (`purchase.isReverted = false`).

#### 4.4. Protocolo de Prestamo y Custodia de Herramientas (`ToolCustody`)
* En `Stock`, las herramientas operan con `loanedQty` para auditar existencias en caseta vs. campo:
  $$\text{Disponibles en Caseta} = \text{Stock.physicalQty} - \text{Stock.loanedQty}$$
* Al prestar (`LOAN_DISPATCH`): incrementa `loanedQty`.
* Al retornar conforme (`LOAN_RETURN`): decrementa `loanedQty`.
* Al retornar danado inutilizable o perdido: decrementa `loanedQty`, decrementa `physicalQty` y genera `SHRINKAGE_EXIT` con foto de evidencia.

#### 4.5. Protocolo de Liquidacion y Cierre de Almacen de Obra
Un almacen de obra temporal (`PROJECT_SITE`) se liquida unicamente si:
1. $\sum \text{Stock.physicalQty} = 0$ para todos los items (exige transferencia masiva de retorno a Central).
2. Cero registros abiertos en `ToolCustody` (`returnDate == null`).
3. Cero transferencias pendientes (`PENDING` o `IN_TRANSIT`) con origen o destino en dicha obra.

#### 4.6. Politica de Reversion Contable, Edicion y Reemplazo en 3 Niveles
El principio append-only del Kardex se preserva mediante compensaciones trazables sin borrado fisico:
1. **Nivel 1 - Reversion / Anulacion (`POST .../revert`, `cancel`, `revert-reception`, `revert-dispatch`, `revert-return`):** Marca la entidad original con `isReverted = true`, `revertedAt`, `revertedById` y `reversalReason`; restaura existencias y saldos (`physicalQty`, `reservedQty`, `loanedQty`, `allocatedQty`, `consumedQty`), recalcula CPP inverso y emite un contra-asiento `REVERSAL_ENTRY` o `REVERSAL_EXIT` enlazado via `reversesMovementId`.
2. **Nivel 2 - Edicion de Metadatos (`PATCH .../:id`):** Corrige atributos no contables (series, notas, fechas, receptor/operador o medidores de maquinaria con validacion cronologica) sin alterar saldos de Kardex.
3. **Nivel 3 - Reemplazo Atomico (`POST .../:id/replace`, `replace-consumption`, `replace-shrinkage`):** Revierte la operacion original y crea la nueva transaccion corregida dentro de un mismo bloque ACID vinculando `replacedById`.

> Los reportes activos (`Dashboard.metrics` `toolsInField`, alertas de perecibles, `getGapAnalysis`, deuda de herramientas `worker/:dni`, `onlyPending=true`, `onlyOpen=true` y lecturas previas de maquinaria) excluyen automaticamente transacciones con `isReverted = true`.

---

### 5. Consideraciones de Frontend (Angular 22 Standalone con Signals)

* **Arquitectura Reactiva con Signals:** Implementacion con `signal()`, `computed()` y `model()`, prescindiendo de `NgModule` para carga ultra ligera en tablets y telefonos en obra.
* **Seguridad y Visibilidad Financiera Ciega:** Directiva estructural `*appHasRole="['ADMIN', 'MODERATOR']"` para metricas, compras valorizadas, precios y CPP (conservando `*appHasRole="'ADMIN'"` en gestion de usuarios).
* **Contexto Multi-Almacen:** Servicio global `WarehouseContextService` que gobierna reactivamente el almacen activo de la sesion.
* **Flujos Correctivos en UI:** Modales tactiles para editar metadatos, revertir con motivo obligatorio o reemplazar atomicamente transacciones en campo y oficina, con filtro opcional `includeReverted`.
* **Diseno para Faena (Touch-First):** Botones con area interactiva minima de 48x48 px y uso de camara directa para fotos de guias fisicas y evidencias.
