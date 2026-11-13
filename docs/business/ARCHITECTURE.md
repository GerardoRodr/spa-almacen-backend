# ARCHITECTURE.md - SPA-ALMACEN-ERP

## 1. Vision General y Topologia del Sistema

El sistema **SPA-ALMACEN-ERP** esta disenado como una solucion desacoplada orientada a la logistica de obras civiles. Se compone de un backend monolito modular (NestJS 12+ en modo ESM puro) y un frontend SPA reactivo (Angular 22) optimizado tanto para estaciones de escritorio en oficina tecnica como para terminales tactiles (tablets y smartphones) en casetas de obra.

Toda la infraestructura se aloja en una unica instancia VPS KVM 2 (100 GB SSD NVMe, 4 GB RAM, 2 vCPU) ejecutando Ubuntu 24.04 LTS, orquestada mediante Docker Compose y expuesta a traves de Nginx como proxy reverso con terminacion TLS.

```
                           [ Cliente: Navegador Web / Tablet de Obra ]
                                              │
                                              ▼
                             [ Nginx (Reverse Proxy & Cache) ]
                                 │                       │
           /api/v1/* ────────────┘                       └──────────── /uploads/* (Protegido)
           │                                                           │
           ▼                                                           ▼
 [ Backend: NestJS 12+ (ESM) ]                              [ Almacenamiento Local Seguro ]
   ├── Auth & RBAC Guard (Admin / WarehouseKeeper)            /var/www/almacen-erp/uploads/
   ├── WarehouseAccessGuard (Filtro por Obra)                 ├── Facturas y Comprobantes (Auth Admin)
   ├── Sharp Compression Pipe (WebP / 80%)                    ├── Guias y Fotos Operativas (Auth)
   ├── S10 Engine (CSV Parser & Gap Analysis)                 └── Backups Locales (Rotacion 7d)
   └── Prisma ORM v6
           │
           ▼
[ Base de Datos: PostgreSQL 16+ ]
 (Transacciones ACID, Precision Decimal 14,4, Indices B-Tree)
```

---

## 2. Componentes del Stack Tecnologico

### 2.1. Frontend: Angular 22 (SPA Multi-Dispositivo)
* **Framework:** Angular 22 basado en Standalone Components (sin `NgModule`).
* **Gestion de Estado:** Angular Signals (`signal()`, `computed()`, `effect()`, `model()`) como estándar reactivo primario. RxJS restringido a flujos asincronos complejos (debounces de busqueda, cancelacion de solicitudes HTTP).
* **Sintaxis de Plantillas:** Control Flow nativo (`@if`, `@for`, `@switch`).
* **Estilos y UI:** Tailwind CSS v4, estructurado para ofrecer botones y objetivos táctiles minimos de 48×48 px en caseta de obra y tablas de alta densidad en oficina tecnica.
* **Componentes Base:** Angular Material / PrimeNG integrados modularmente para modales, selectores de fecha y autocompletados con *virtual scrolling* para catalogos extensos.
* **Iconografia:** Lucide Angular.
* **Graficos:** Chart.js con `ng2-charts` para comparativas de presupuesto S10 vs. gasto real y distribucion de stock.
* **Exportaciones Client-Side:** `exceljs` para matrices de brechas y `jspdf` con `jspdf-autotable` para vales de custodia y actas de entrega en campo.

### 2.2. Backend: NestJS 12+ (API REST Modular en ESM Puro)
* **Runtime:** Node.js 22 LTS / Node.js 24 (motor V8 optimizado).
* **Framework:** **NestJS 12+** configurado estrictamente como **ECMAScript Modules (ESM puro)**.
* **Estandar ESM y Reglas de Codificacion para el Agente:**
  - `package.json`: Debe incluir `"type": "module"`.
  - `tsconfig.json`: Debe configurar `"module": "NodeNext"` y `"moduleResolution": "NodeNext"` (o `"target": "ES2023"`).
  - **Imports Relativos Obligatorios con Extension `.js`:** En TypeScript bajo resolución NodeNext ESM, toda importación relativa local debe incluir explícitamente la extensión `.js`:
    ```typescript
    // Correcto (ESM NodeNext):
    import { StockService } from './stock.service.js';
    import { CreateItemDto } from './dto/create-item.dto.js';
    import { PrismaService } from '../prisma/prisma.service.js';

    // Incorrecto (fallara en compilacion/ejecucion):
    import { StockService } from './stock.service';
    ```
  - **Manejo de Rutas y Directorios:** Se prohibe el uso de `__dirname` y `__filename` (inexistentes en ESM puro). En su lugar, utilizar la propiedad nativa de Node:
    ```typescript
    // Obtencion de rutas relativas seguras:
    const uploadsPath = join(import.meta.dirname, '..', '..', 'uploads');
    ```
  - **Librerias CJS/ESM Hibridas:** Las importaciones de paquetes como `sharp`, `bcrypt` o `passport` deben utilizar sintaxis `import ... from '...'` o importar sus default exports adecuadamente.
* **Seguridad y Autorizacion:**
  - `JwtAuthGuard`: Autenticacion sin estado (Access Token de 15 min + Refresh Token de 7 dias).
  - `RolesGuard`: Segregacion de permisos (`ADMIN`, `MODERATOR` y `WAREHOUSE_KEEPER`).
  - `WarehouseAccessGuard`: Valida que el almacenero solo opere sobre almacenes donde tiene autorizacion activa en `UserWarehouse`.
  - `CostMaskingInterceptor`: Serializador que omite campos monetarios en respuestas hacia roles no administrativos (`WAREHOUSE_KEEPER`). `ADMIN` y `MODERATOR` reciben cifras financieras completas. Preserva de manera estricta las instancias de `Prisma.Decimal` en existencias fisicas (`physicalQty`, `reservedQty`, `loanedQty`), serializandolas como escalares numericos para evitar descomposiciones de objetos en tiempo de serializacion JSON.
  - `helmet` y `@nestjs/throttler` para proteccion de cabeceras y control de tasa de peticiones.
* **Procesamiento Multimedia:** `Multer` junto a `Sharp` para convertir y comprimir imagenes de guias y evidencias a formato `.webp` al 80% (reduciendo archivos de 10 MB a menos de 350 KB).
* **Motor de Presupuestos S10:** Pipeline de streaming con soporte de codificacion `Windows-1252` y `UTF-8`, con deteccion automatica de delimitador (`;` o `,`).
* **Documentacion:** OpenAPI 3 / Swagger en `/api/docs`.

### 2.3. Persistencia: PostgreSQL 16+ & Prisma ORM v6
* **Motor:** PostgreSQL 16+ con cumplimiento estricto de propiedades ACID.
* **Precision Numerica:** Cantidades modeladas como `DECIMAL(12, 4)` y montos monetarios como `DECIMAL(14, 4)` para evitar discrepancias por redondeo.
* **ORM:** Prisma v6 con transacciones atómicas garantizadas (`prisma.$transaction`) en compras, transferencias y reservas.

### 2.4. Infraestructura y Seguridad de Archivos
* **VPS KVM 2:** Ubuntu 24.04 LTS, Docker Compose orquestado con Dokploy.
* **Seguridad de Documentos Sensibles:**
  - Las **facturas de compra** y adjuntos confidenciales (`isConfidential = true`) estan autorizados para `ADMIN` y `MODERATOR`. Un usuario `WAREHOUSE_KEEPER` solo puede consultar o descargar documentos confidenciales vinculados a compras de sus almacenes asignados en `UserWarehouse`; el resto recibe `403 Forbidden`.
  - Nginx **no** sirve la carpeta `/uploads/invoices/*` de manera estatica y publica.
  - La descarga de comprobantes financieros se realiza mediante el endpoint autenticado `GET /api/v1/documents/:id/download`, validando el token y rol antes de emitir el archivo en streaming o delegarlo mediante la cabecera `X-Accel-Redirect` de Nginx.
* **Respaldos de Base de Datos:** Tarea programada diaria a las 02:00 UTC con `pg_dump`, compresion `.tar.gz`, retencion local de 7 dias y endpoint con boton de descarga directa para roles `ADMIN` y `MODERATOR`.

---

## 3. Matriz de Control de Acceso por Roles (RBAC)

| Modulo / Funcionalidad | Rol `ADMIN` (Arquitecto / Residente) | Rol `MODERATOR` (Moderador Operativo) | Rol `WAREHOUSE_KEEPER` (Almacenero Obra/Central) |
| :--- | :---: | :---: | :---: |
| **Administracion de Usuarios (`/users`)** | **Total (Gestion, Altas, Bajas y Roles)** | **Bloqueado (403 Forbidden)** | **Bloqueado (403 Forbidden)** |
| **Selector de Almacen Activo** | Acceso Global a Todos los Almacenes | Acceso Global a Todos los Almacenes | Solo Almacenes Asignados (`UserWarehouse`) con soporte multisede |
| **Catalogo Maestro (Crear / Editar SKU)** | Total (edicion completa y confirmacion) | Total (edicion completa y confirmacion) | Alta Rapida Descentralizada (SKU automatico, sin edicion maestra) |
| **Gestion de Alias S10 (`ItemAlias`)** | Total | Total | Acceso Denegado |
| **Visualizacion de Costos, Precios y CPP** | **Visible** | **Visible** | **Bloqueado / Ciego** |
| **Registro de Compras a Proveedores** | Total (con costos, IGV, facturas y valorizacion) | Total (con costos, IGV, facturas y valorizacion) | Registro Operativo Descentralizado (recepcion directa, precio cero y proveedores) |
| **Despacho de Transferencias (Fase 1)** | Autorizacion / Auditoria | Autorizacion / Auditoria | Registro Operativo (Almacen Origen) |
| **Recepcion de Transferencias (Fase 2)** | Auditoria de Discrepancias | Auditoria de Discrepancias | Conteo Fisico y Confirmacion (Almacen Destino) |
| **Salida por Consumo en Obra** | Auditoria por Partida/Frente | Auditoria por Partida/Frente | Registro Diario de Entrega a Capataces |
| **Vales de Custodia de Herramientas** | Auditoria General | Auditoria General | Prestamo y Retorno con DNI y Calificacion |
| **Presupuestos S10 y Matriz de Brechas** | Carga CSV, Mapeo y Reserva Logica | Carga CSV, Mapeo y Reserva Logica | Acceso Denegado |
| **Aprobacion de Mermas y Ajustes** | Exclusivo (Aprobacion y Cierre) | Exclusivo (Aprobacion y Cierre) | Solo Solicitud con Evidencia Fotografica |
| **Cierre y Liquidacion de Obra** | Exclusivo | Exclusivo | Acceso Denegado |
| **Descarga de Copias de Seguridad** | Exclusivo (1 Clic) | Exclusivo (1 Clic) | Acceso Denegado |

---

## 4. Esquema de Base de Datos Definitivo (Prisma ORM v6 - 21 Modelos y 9 Enums)

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

## 5. Catalogo Exhaustivo de Endpoints REST (`/api/v1/*`)

Todos los endpoints estan protegidos por defecto con `JwtAuthGuard` (salvo rutas `@Public()` como `/auth/login`, `/auth/refresh` y `/health`) y aplican validacion de roles (`RolesGuard`) y control de acceso por almacen (`WarehouseAccessGuard`).

### 5.1. Autenticacion y Usuarios
- `POST   /auth/login`                          -> [Publico] Emision de JWT (Access + Refresh Token) y perfil de usuario.
- `POST   /auth/refresh`                        -> [Publico] Renovacion de tokens de sesion.
- `GET    /auth/profile`                        -> Informacion del usuario en sesion y almacenes vinculados.
- `GET    /users`                               -> [ADMIN] Listado de usuarios del sistema.
- `POST   /users`                               -> [ADMIN] Creacion de usuario y asignacion de rol.
- `GET    /users/:id`                           -> [ADMIN] Detalle de usuario.
- `PUT    /users/:id`                           -> [ADMIN] Actualizacion de usuario y estado.
- `PUT    /users/:id/warehouses`                -> [ADMIN] Asignacion de almacenes autorizados en `UserWarehouse`.

### 5.2. Almacenes y Stocks
- `GET    /warehouses`                          -> Listado de almacenes activos (global para `ADMIN`/`MODERATOR`, filtrado por `UserWarehouse` para `WAREHOUSE_KEEPER`).
- `POST   /warehouses`                          -> [ADMIN, MODERATOR] Creacion de almacen Central o de Obra.
- `GET    /warehouses/:id`                      -> Detalle del almacen.
- `PUT    /warehouses/:id`                      -> [ADMIN, MODERATOR] Actualizacion del almacen.
- `GET    /warehouses/:id/stock`                -> Stock en tiempo real (`physicalQty`, `reservedQty`, `loanedQty`). Oculta `averageCost` a almaceneros.
- `GET    /warehouses/:id/alerts`               -> Alertas de stock minimo y faltantes criticos.
- `PATCH  /warehouses/:id/stock/:itemId/valuation` -> [ADMIN, MODERATOR] Valorizacion manual de CPP en stock.

### 5.3. Catalogo de Items, Categorias, Alias S10 y Unidades de Medida
- `GET    /items`                               -> Lista paginada de insumos (filtros por SKU/nombre, tipo, categoria y `isPerishable`).
- `GET    /items/next-sku`                      -> Previsualizacion de siguiente SKU sugerido (`MAT`/`HER`/`EQU`/`MAQ`).
- `POST   /items`                               -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Alta de item (almacenero con SKU automatico y costo inicial cero).
- `GET    /items/perishable-alerts`             -> Alertas de perecibles con stock positivo y fecha de ultima compra vigente (`isReverted = false`).
- `GET    /items/:id`                           -> Detalle de item con consolidado de stock, alias y estadisticas transaccionales.
- `PUT    /items/:id`                           -> [ADMIN, MODERATOR] Modificacion de datos base y doble confirmacion para cambio de `baseUnit`.
- `POST   /items/aliases`                       -> [ADMIN, MODERATOR] Registro de equivalencia S10 (`ItemAlias`).
- `DELETE /items/aliases/:id`                   -> [ADMIN, MODERATOR] Eliminacion de alias.
- `GET    /item-categories`                     -> Listado de clasificaciones personalizadas.
- `POST   /item-categories`                     -> [ADMIN, MODERATOR] Crear clasificacion personalizada.
- `PATCH  /item-categories/:id`                 -> [ADMIN, MODERATOR] Actualizar clasificacion.
- `DELETE /item-categories/:id`                 -> [ADMIN, MODERATOR] Eliminar o desactivar logicamente clasificacion.
- `GET    /measurement-units`                   -> Listado de unidades de medida maestras (`includeInactive`).
- `GET    /measurement-units/:id`               -> Detalle de unidad de medida.
- `POST   /measurement-units`                   -> [ADMIN, MODERATOR] Crear unidad de medida.
- `PATCH  /measurement-units/:id`               -> [ADMIN, MODERATOR] Actualizar unidad de medida.
- `DELETE /measurement-units/:id`               -> [ADMIN, MODERATOR] Eliminar fisicamente o desactivar unidad en uso.

### 5.4. Compras y Proveedores
- `GET    /suppliers`                           -> Listado y busqueda de proveedores.
- `POST   /suppliers`                           -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Registro de proveedor.
- `GET    /suppliers/:id`                       -> Detalle de proveedor.
- `PUT    /suppliers/:id`                       -> [ADMIN, MODERATOR] Actualizacion de proveedor.
- `GET    /purchases`                           -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Historial de compras (almacenero restringido a sus sedes y costos enmascarados; soporta `includeReverted`).
- `GET    /purchases/price-comparison`          -> [ADMIN, MODERATOR] Cuadro comparativo de precios historicos por insumo.
- `POST   /purchases`                           -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Registro de compra y recalculo atomico de CPP en sede destino.
- `GET    /purchases/:id`                       -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Detalle de factura.
- `PATCH  /purchases/:id/valuation`             -> [ADMIN, MODERATOR] Valorizacion formal de compra ingresada a precio cero.
- `POST   /purchases/:id/revert`                -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Reversion de compra (Nivel 1): valida stock, recalcula CPP inverso y emite `REVERSAL_EXIT`.
- `PATCH  /purchases/:id`                       -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Edicion no contable de metadatos de compra y notas por renglon (Nivel 2).
- `POST   /purchases/:id/replace`               -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Reemplazo atomico de compra (Nivel 3).

### 5.5. Transferencias en Dos Fases
- `GET    /transfers`                           -> Listado de transferencias (filtros por origen, destino, estado, `projectId` e `includeReverted`).
- `GET    /transfers/in-transit`                -> Cargamentos en camino hacia los almacenes del usuario.
- `GET    /transfers/:id`                       -> Detalle completo de transferencia.
- `POST   /transfers/dispatch`                  -> [Fase 1: Despacho] Creacion de transferencia `IN_TRANSIT`.
- `POST   /transfers/:id/receive`               -> [Fase 2: Recepcion] Confirmacion de recepcion (`COMPLETED` o `DISCREPANCY`).
- `POST   /transfers/:id/cancel`                -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Cancelacion de transferencia `IN_TRANSIT` con restauracion de stock/reservas (Nivel 1A).
- `POST   /transfers/:id/revert-reception`      -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Reversion de recepcion (`BACK_TO_TRANSIT` o `CANCEL_COMPLETELY`) (Nivel 1B).
- `PATCH  /transfers/:id`                       -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Edicion de `dispatchNotes` y `receptionNotes` (Nivel 2).
- `POST   /transfers/:id/replace`               -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Reemplazo atomico de transferencia (Nivel 3).

### 5.6. Salidas de Consumo y Kardex
- `GET    /movements`                           -> Consulta del Kardex (`includeReverted`; oculta costos a almaceneros).
- `GET    /movements/:id`                       -> Detalle completo de movimiento.
- `POST   /movements/consumption`               -> Salida por consumo en obra a cuadrilla/capataz.
- `POST   /movements/shrinkage`                 -> Registro directo de merma o perdida fisica.
- `POST   /movements/initial-stock`             -> Carga de stock fisico inicial en caseta o sede.
- `POST   /movements/adjustment`                -> [ADMIN, MODERATOR] Ajuste formal de inventario fisico.
- `POST   /movements/:id/revert`                -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Reversion contable de movimiento directo (`INVENTORY_ADJUSTMENT` restringido a `ADMIN`/`MODERATOR`).
- `PATCH  /movements/:id`                       -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Edicion no contable de metadatos del movimiento (Nivel 2).
- `POST   /movements/:id/replace-consumption`   -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Reemplazo atomico de salida por consumo (Nivel 3).
- `POST   /movements/:id/replace-shrinkage`     -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Reemplazo atomico de salida por merma (Nivel 3).

### 5.7. Custodia de Herramientas y Equipos
- `GET    /tools/custody`                       -> Listado paginado de vales (`onlyPending`, `includeReverted`).
- `POST   /tools/custody/dispatch`              -> Emision de vale de prestamo (`LOAN_DISPATCH`).
- `POST   /tools/custody/:id/return`            -> Registro de retorno y calificacion (`LOAN_RETURN`).
- `GET    /tools/custody/worker/:dni`           -> Herramientas pendientes activas (`isReverted = false`) por DNI.
- `GET    /tools/custody/:id`                   -> Detalle completo del vale.
- `POST   /tools/custody/:id/revert-dispatch`   -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Anulacion de vale abierto (Nivel 1A).
- `POST   /tools/custody/:id/revert-return`     -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Reversion de retorno y reapertura del vale (Nivel 1B).
- `PATCH  /tools/custody/:id`                   -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Edicion de metadatos de custodia (Nivel 2).
- `POST   /tools/custody/:id/replace`           -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Reemplazo atomico de vale (Nivel 3).

### 5.8. Proyectos y Motor S10
- `GET    /projects`                            -> Listado de proyectos accesibles.
- `POST   /projects`                            -> [ADMIN, MODERATOR] Creacion de proyecto y su Almacen de Obra temporal.
- `GET    /projects/:id`                        -> Detalle de proyecto y requerimientos S10.
- `PUT    /projects/:id`                        -> [ADMIN, MODERATOR] Actualizacion de proyecto.
- `POST   /projects/:id/ingest-s10`             -> [ADMIN, MODERATOR] Ingesta JSON estructurada de presupuesto S10.
- `POST   /projects/:id/s10-import`             -> [ADMIN, MODERATOR] Carga y parseo de archivo CSV S10.
- `GET    /projects/:id/gap-analysis`           -> Matriz de brechas (costos ocultos a almaceneros; excluye compras revertidas en `minHistoricalUnitCost`).
- `POST   /projects/:id/allocate-stock`         -> [ADMIN, MODERATOR] Reserva logica en Almacen Central.
- `POST   /projects/:id/release-stock`          -> [ADMIN, MODERATOR] Liberacion de reserva de stock.
- `POST   /projects/:id/liquidate`              -> [ADMIN, MODERATOR] Validacion de 3 condiciones y liquidacion formal de obra.

### 5.9. Gestion de Documentos y Seguridad
- `POST   /documents/upload`                    -> Subida individual con compresion Sharp a WebP.
- `POST   /documents/upload-multiple`           -> Subida multiple en paralelo (hasta 10 archivos).
- `GET    /documents`                           -> Listado filtrado respetando confidencialidad.
- `GET    /documents/:id`                       -> Metadata o streaming segun cabecera `Accept`.
- `GET    /documents/:id/download`              -> Descarga segura con validacion de confidencialidad (`ADMIN`, `MODERATOR`, y `WAREHOUSE_KEEPER` para compras de sus almacenes).
- `DELETE /documents/:id`                       -> [ADMIN, MODERATOR] Eliminacion de adjunto.

### 5.10. Mantenimiento y Salud
- `GET    /health`                              -> [Publico] Estado de base de datos, disco y memoria.
- `GET    /admin/backups`                       -> [ADMIN, MODERATOR] Listado de copias de seguridad disponibles.
- `POST   /admin/backups`                       -> [ADMIN, MODERATOR] Disparo manual de volcado `pg_dump`.
- `GET    /admin/backups/:fileName/download`    -> [ADMIN, MODERATOR] Descarga directa de respaldo.
- `DELETE /admin/backups/:fileName`             -> [ADMIN, MODERATOR] Eliminacion de respaldo antiguo.

### 5.11. Maquinaria Pesada y Medidores
- `POST   /machinery/shift/start`               -> Inicio de jornada de maquinaria con medidor y foto.
- `POST   /machinery/shift/:id/end`             -> Cierre de jornada y calculo de `totalUsage`.
- `GET    /machinery/shifts`                    -> Historial de jornadas (`onlyOpen`, `includeReverted`).
- `GET    /machinery/shifts/:id`                -> Detalle de jornada.
- `GET    /machinery/item/:itemId/status`       -> Estado actual, turno abierto vigente y `lastMeter` (excluye anulados).
- `PATCH  /machinery/shifts/:id`                -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Correccion de operador, notas, fotos y lecturas (Nivel 2).
- `POST   /machinery/shifts/:id/revert`         -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Anulacion de jornada (`isReverted = true`) (Nivel 1).

### 5.12. Dashboard y Analitica
- `GET    /dashboard/metrics`                   -> Indicadores ejecutivos consolidados (oculta cifras financieras a almaceneros; excluye anulados).
- `GET    /dashboard/stock-comparison`          -> Comparativa de existencias y top valorizacion por sede.
- `GET    /dashboard/urgent-replenishments`     -> Listado de alertas de stock minimo prioritario.
- `GET    /dashboard/logical-reservations`      -> Resumen de reservas logicas activas en Central.
