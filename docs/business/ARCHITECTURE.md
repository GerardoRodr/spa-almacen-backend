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
   ├── Auth & RBAC Guard (Admin / Moderator / Keeper)         UPLOAD_DIR (ej. /app/uploads/)
   ├── WarehouseAccessGuard (Filtro por Obra)                 ├── purchases/ (Facturas, Auth)
   ├── CostMaskingInterceptor (Ceguera Financiera)            ├── transfers|movements|custody/
   ├── Sharp Compression Pipe (WebP / 80%)                    ├── s10/ (CSV/TXT Presupuestos)
   ├── S10 Engine (CSV Parser & Gap Analysis)                 └── Backups Locales (Rotacion 7d)
   └── Prisma ORM v6 (Migraciones Aditivas)
           │
           ▼
[ Base de Datos: PostgreSQL 16+ ]
 (Transacciones ACID, Precision Decimal 14,4, Indices B-Tree)
```

---

## 2. Componentes del Stack Tecnologico

### 2.1. Frontend: Angular 22 (SPA Multi-Dispositivo)
* **Framework:** Angular 22 basado en Standalone Components (sin `NgModule`).
* **Gestion de Estado:** Angular Signals (`signal()`, `computed()`, `effect()`, `model()`) como estandar reactivo primario. RxJS restringido a flujos asincronos complejos (debounces de busqueda, cancelacion de solicitudes HTTP).
* **Sintaxis de Plantillas:** Control Flow nativo (`@if`, `@for`, `@switch`).
* **Estilos y UI:** Tailwind CSS v4, estructurado para ofrecer botones y objetivos tactiles minimos de 48x48 px en caseta de obra y tablas de alta densidad en oficina tecnica.
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
  - **Imports Relativos Obligatorios con Extension `.js`:** En TypeScript bajo resolucion NodeNext ESM, toda importacion relativa local debe incluir explicitamente la extension `.js`:
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
  - `CostMaskingInterceptor`: Serializador recursivo que omite campos monetarios y de descuento en respuestas hacia `WAREHOUSE_KEEPER` (incluyendo `averageCost`, `unitPriceOriginal`, `unitCostBasePEN`, `subtotalPEN`, `igvAmountPEN`, `totalAmountPEN`, `totalSubtotalPEN`, `totalIgvPEN`, `discountValue`, `discountAmountPEN`, `unitCostSnapshot`, `totalCostSnapshot`, valorizaciones de dashboard, comparativas de precios y totales presupuestales S10). `ADMIN` y `MODERATOR` reciben cifras financieras completas. Preserva de manera estricta las instancias de `Date` y `Prisma.Decimal` en existencias fisicas (`physicalQty`, `reservedQty`, `loanedQty`), evitando descomposiciones de objetos en tiempo de serializacion JSON.
  - `helmet` y `@nestjs/throttler` para proteccion de cabeceras y control de tasa de peticiones.
* **Procesamiento Multimedia:** `Multer` junto a `Sharp` para redimensionar (max 1920x1080) y comprimir imagenes de guias y evidencias a formato `.webp` al 80% (reduciendo archivos de 10 MB a menos de 350 KB), ademas de validacion de cabecera `%PDF-` para documentos PDF (hasta 15 MB).
* **Motor de Presupuestos S10:** Pipeline de decodificacion `Windows-1252` / `UTF-8` con deteccion automatica de delimitador (`;` o `,`), homologacion `1:N` contra `ItemAlias`, persistencia local del archivo CSV/TXT en `UPLOAD_DIR/s10/` (`StorageService.saveS10File`) y calculo en tiempo real de Matriz de Brechas.
* **Documentacion:** OpenAPI 3 / Swagger en `/api/docs`.

### 2.3. Persistencia: PostgreSQL 16+ & Prisma ORM v6
* **Motor:** PostgreSQL 16+ con cumplimiento estricto de propiedades ACID.
* **Precision Numerica:** Cantidades modeladas como `DECIMAL(12, 4)`, factores/descuentos como `DECIMAL(10, 4)` / `DECIMAL(12, 4)` y montos monetarios como `DECIMAL(14, 4)` / `DECIMAL(14, 2)` para evitar discrepancias por redondeo.
* **ORM:** Prisma v6 con transacciones atomicas garantizadas (`prisma.$transaction`) en compras, reemplazos, reversiones, transferencias, reservas y cambios de almacen de proyecto.
* **Migraciones Aditivas Compatibles con Produccion:** Toda evolucion del esquema de base de datos (como `20261122225515_add_post_meeting_observations`) se construye mediante instrucciones SQL estrictamente aditivas (`CREATE TYPE`, `ALTER TYPE ... ADD VALUE`, `ALTER TABLE ... ADD COLUMN` con valores por defecto seguros o nulables y `CREATE INDEX`) que preservan intactos los registros existentes. En despliegues productivos, `docker-entrypoint.sh` aplica automaticamente las migraciones pendientes mediante `npx prisma migrate deploy` (`npm run prisma:migrate:deploy`) antes de iniciar NestJS.

### 2.4. Infraestructura y Seguridad de Archivos
* **VPS KVM 2:** Ubuntu 24.04 LTS, Docker Compose orquestado con Dokploy.
* **Estructura de Almacenamiento Local (`UPLOAD_DIR`):**
  - Directorio base configurable mediante `UPLOAD_DIR` (por defecto `./uploads`, mapeado a volumen persistente `/app/uploads` en contenedor).
  - Adjuntos operativos y comprobantes organizados por categoria y periodo (`purchases/YYYY/MM`, `transfers/YYYY/MM`, `movements/YYYY/MM`, `custody/YYYY/MM`, `general/YYYY/MM`), con proteccion contra *path traversal*.
  - Subdirectorio dedicado `UPLOAD_DIR/s10/` para almacenar los archivos originales CSV/TXT de presupuestos S10 vinculados a proyectos (`Project.s10FilePath`, `s10FileName`, `s10UploadedAt`).
* **Seguridad de Documentos Sensibles:**
  - Las **facturas de compra** y adjuntos confidenciales (`isConfidential = true`) estan autorizados para `ADMIN` y `MODERATOR`. Un usuario `WAREHOUSE_KEEPER` solo puede cargar (`POST /api/v1/purchases/:id/attachments`), consultar o descargar documentos confidenciales vinculados a compras de sus almacenes asignados en `UserWarehouse`; el resto recibe `403 Forbidden`. La eliminacion de adjuntos de compras (`DELETE /api/v1/purchases/:id/attachments/:attachmentId`) es exclusiva de `ADMIN`.
  - Nginx **no** sirve la carpeta `/uploads/*` de manera estatica y publica.
  - La descarga de comprobantes financieros y archivos S10 se realiza mediante endpoints autenticados (`GET /api/v1/documents/:id/download` y `GET /api/v1/projects/:id/s10-file`), validando el token, rol y acceso por almacen antes de emitir el archivo en streaming.
* **Respaldos de Base de Datos:** Tarea programada diaria a las 02:00 UTC con `pg_dump`, compresion `.tar.gz`, retencion local de 7 dias y endpoint con descarga directa para roles `ADMIN` y `MODERATOR`.

---

## 3. Matriz de Control de Acceso por Roles (RBAC)

| Modulo / Funcionalidad | Rol `ADMIN` (Arquitecto / Residente) | Rol `MODERATOR` (Moderador Operativo) | Rol `WAREHOUSE_KEEPER` (Almacenero Obra/Central) |
| :--- | :---: | :---: | :---: |
| **Administracion de Usuarios (`/users`)** | **Total (Gestion, Altas, Bajas y Roles)** | **Bloqueado (403 Forbidden)** | **Bloqueado (403 Forbidden)** |
| **Selector de Almacen Activo** | Acceso Global a Todos los Almacenes | Acceso Global a Todos los Almacenes | Solo Almacenes Asignados (`UserWarehouse`) con soporte multisede |
| **Catalogo Maestro (Crear / Editar / Eliminar SKU)** | **Total (creacion, edicion, confirmacion `baseUnit` y `DELETE /items/:id`)** | Creacion, edicion y confirmacion `baseUnit` (sin `DELETE /items/:id`) | Alta Rapida Descentralizada (SKU automatico, sin edicion ni baja maestra) |
| **Gestion CRUD de Alias S10 (`ItemAlias` 1:N)** | Total (`GET`, `POST`, `PUT`, `DELETE`) | Total (`GET`, `POST`, `PUT`, `DELETE`) | Acceso Denegado (`403 Forbidden`) |
| **Visualizacion de Costos, Descuentos, Precios y CPP** | **Visible** | **Visible** | **Bloqueado / Ciego (`CostMaskingInterceptor`)** |
| **Compras a Proveedores y Adjuntos** | **Total (costos, descuentos, IGV, valorizacion, carga y `DELETE` de adjuntos)** | Total (costos, descuentos, IGV, valorizacion y carga de adjuntos; sin `DELETE` de adjuntos) | Registro operativo en sedes asignadas (recepcion, carga de adjuntos, precio cero y proveedores; cifras ocultas) |
| **Despacho de Transferencias (Fase 1)** | Autorizacion / Auditoria | Autorizacion / Auditoria | Registro Operativo (Almacen Origen) |
| **Recepcion de Transferencias (Fase 2)** | Auditoria de Discrepancias | Auditoria de Discrepancias | Conteo Fisico y Confirmacion (Almacen Destino) |
| **Salida por Consumo en Obra** | Auditoria por Partida/Frente | Auditoria por Partida/Frente | Registro Diario de Entrega a Capataces |
| **Vales de Custodia de Herramientas** | Auditoria General | Auditoria General | Prestamo y Retorno con DNI y Calificacion |
| **Proyectos, Almacen `PROJECT_SITE` y Archivo S10** | Creacion, vinculacion/cambio de almacen, carga/descarga/eliminacion CSV S10 y reservas | Creacion, vinculacion/cambio de almacen, carga/descarga/eliminacion CSV S10 y reservas | Lectura de proyectos asignados y descarga de archivo S10 de su sede (costos enmascarados) |
| **Edicion Manual de Matriz de Brechas (`/requirements`)** | **Exclusivo (`POST`, `PUT`, `DELETE`)** | **Bloqueado (403 Forbidden)** | **Bloqueado (403 Forbidden)** |
| **Aprobacion de Mermas y Ajustes** | Exclusivo (Aprobacion y Cierre) | Exclusivo (Aprobacion y Cierre) | Solo Solicitud con Evidencia Fotografica |
| **Cierre y Liquidacion de Obra** | Exclusivo | Exclusivo | Acceso Denegado |
| **Descarga de Copias de Seguridad** | Exclusivo (1 Clic) | Exclusivo (1 Clic) | Acceso Denegado |

---

## 4. Esquema de Base de Datos Definitivo (Prisma ORM v6 - 21 Modelos y 10 Enums)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// --------------------------------------------------------
// ENUMS DE DOMINIO (10)
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
  SERVICE
}

enum DiscountType {
  NONE
  PERCENTAGE
  FIXED
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
  PURCHASE_ENTRY       // Ingreso a Almacen Central por compra a proveedor
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
  isActive        Boolean              @default(true)
  trackLot        Boolean              @default(false)
  trackExpiration Boolean              @default(false)
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
  @@index([isActive])
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

  @@index([itemId])
}

// --------------------------------------------------------
// PROYECTOS Y ESTIMACIONES (S10)
// --------------------------------------------------------

model Project {
  id                    String               @id @default(uuid())
  name                  String
  budgetCode            String?              // Codigo del presupuesto S10 (ej. 1101024)
  status                ProjectStatus        @default(PLANNING)

  // Metadatos del Expediente S10
  s10Location           String?              // Ej: "LA LIBERTAD - SANTIAGO DE CHUCO - QUIRUVILCA"
  s10Ubigeo             String?              // Ej: "131006"
  s10BudgetDate         DateTime?            // Fecha original del presupuesto S10

  // Totales y KPIs Financieros S10 (PEN)
  s10TotalBudget        Decimal?             @db.Decimal(14, 2) // Costo Directo Total de Recursos
  s10MaterialsBudget    Decimal?             @db.Decimal(14, 2) // Subtotal Grupo 02 (Materiales)
  s10EquipmentBudget    Decimal?             @db.Decimal(14, 2) // Subtotal Grupo 03 (Equipos/Herramientas)
  s10LaborBudget        Decimal?             @db.Decimal(14, 2) // Subtotal Grupo 01 (Mano de Obra)
  s10SubcontractsBudget Decimal?             @db.Decimal(14, 2) // Subtotal Grupo 04 (Subcontratos)

  // Archivo S10 persistido en almacenamiento local
  s10FilePath           String?
  s10FileName           String?
  s10UploadedAt         DateTime?

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
  requiredQty  Decimal  @db.Decimal(12, 4) // Demanda total segun S10
  allocatedQty Decimal  @default(0) @db.Decimal(12, 4) // Stock reservado en Almacen Central
  consumedQty  Decimal  @default(0) @db.Decimal(12, 4) // Stock consumido definitivamente en obra
  s10UnitPrice Decimal? @db.Decimal(14, 4) // Costo unitario programado en expediente S10

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
  warehouseId        String?              // Almacen de destino (CENTRAL o caseta de obra)
  invoiceSeries      String               // Factura o comprobante ej. F001-0004523
  voucherType        String               @default("FACTURA")
  hasIgv             Boolean              @default(true)
  currency           Currency             @default(PEN)
  exchangeRate       Decimal              @default(1.0000) @db.Decimal(8, 4)
  issueDate          DateTime
  subtotalPEN        Decimal              @db.Decimal(14, 2) // Base imponible neta computable a stock
  igvAmountPEN       Decimal              @default(0) @db.Decimal(14, 2) // IGV 18% para cotejo contable
  totalAmountPEN     Decimal              @db.Decimal(14, 2)
  notes              String?              @db.Text // Observaciones generales de compra / fechas de caducidad
  isEdited           Boolean              @default(false)
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
  id                String       @id @default(uuid())
  purchaseId        String
  itemId            String
  purchaseUnit      String       // Unidad de compra ej. PALLET, MILLAR, BOLSA
  conversionFactor  Decimal      @default(1.0000) @db.Decimal(10, 4) // Factor hacia Item.baseUnit
  purchaseQty       Decimal      @db.Decimal(12, 4)
  baseQty           Decimal      @db.Decimal(12, 4) // purchaseQty * conversionFactor
  unitPriceOriginal Decimal      @db.Decimal(14, 4) // Precio unitario neto en moneda original
  unitCostBasePEN   Decimal      @db.Decimal(14, 4) // Costo neto por unidad base en Soles
  subtotalPEN       Decimal      @db.Decimal(14, 2)
  discountType      DiscountType @default(NONE)
  discountValue     Decimal      @default(0) @db.Decimal(12, 4)
  discountAmountPEN Decimal      @default(0) @db.Decimal(14, 2)
  lotNumber         String?
  expirationDate    DateTime?
  notes             String?      @db.Text // Observacion especifica de linea / lote o vencimiento

  purchase          Purchase     @relation(fields: [purchaseId], references: [id], onDelete: Cascade)
  item              Item         @relation(fields: [itemId], references: [id])

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

  recipientName      String?              // Operario o capataz receptor
  recipientDni       String?              // DNI del operario
  shrinkageReason    String?              // Requerido en SHRINKAGE_EXIT
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
  quantity          Decimal  @db.Decimal(12, 4) // En baseUnit
  unitCostSnapshot  Decimal  @db.Decimal(14, 4) // CPP congelado al momento del movimiento
  totalCostSnapshot Decimal  @db.Decimal(14, 2) // quantity * unitCostSnapshot

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
  quantity            Decimal              @default(1) @db.Decimal(12, 4) // Soporta N unidades de herramientas menores
  serialOrCode        String?              // Codigo patrimonial o serie de equipo mayor
  assignedToName      String               // Operario
  assignedToDni       String               // DNI del operario

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
  storedPath     String       // Ruta interna segura
  mimeType       String
  fileSizeBytes  Int
  isConfidential Boolean      @default(false) // True si contiene precios ej. facturas

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

Todos los endpoints estan protegidos por defecto con `JwtAuthGuard` (salvo rutas publicas como `/auth/login`, `/auth/refresh` y `/health`) y aplican validacion de roles (`RolesGuard`) y control de acceso por almacen (`WarehouseAccessGuard`).

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
- `GET    /warehouses/available-for-project`    -> [ADMIN, MODERATOR] Listado de almacenes activos de tipo `PROJECT_SITE` sin proyecto asignado (`projectId = null`).
- `POST   /warehouses`                          -> [ADMIN, MODERATOR] Creacion de almacen Central o de Obra.
- `GET    /warehouses/:id`                      -> Detalle del almacen.
- `PUT    /warehouses/:id`                      -> [ADMIN, MODERATOR] Actualizacion del almacen.
- `GET    /warehouses/:id/stock`                -> Stock en tiempo real (`physicalQty`, `reservedQty`, `loanedQty`). Oculta `averageCost` a almaceneros.
- `GET    /warehouses/:id/alerts`               -> Alertas de stock minimo y faltantes criticos.
- `PATCH  /warehouses/:id/stock/:itemId/valuation` -> [ADMIN, MODERATOR] Valorizacion manual de CPP en stock.

### 5.3. Catalogo de Items, Categorias, Alias S10 y Unidades de Medida
- `GET    /items`                               -> Lista paginada de insumos (filtros por SKU/nombre, tipo incluyendo `SERVICE`, categoria, `isPerishable`, `includeInactive`, `lowStockOnly` y `warehouseId`; `lowStockOnly` excluye inactivos y `SERVICE`).
- `GET    /items/next-sku`                      -> Previsualizacion de siguiente SKU sugerido (`MAT`/`HER`/`EQU`/`MAQ`/`SER`).
- `POST   /items`                               -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Alta de item con soporte de `trackLot` y `trackExpiration` (almacenero con SKU automatico y costo inicial cero; rechaza `initialStock` positivo para `SERVICE`).
- `GET    /items/perishable-alerts`             -> Alertas de perecibles activos con stock positivo y fecha de ultima compra vigente (`isReverted = false`).
- `GET    /items/aliases`                       -> [ADMIN, MODERATOR] Listado paginado de equivalencias S10 (`ItemAlias`) con busqueda y filtro por `itemId`.
- `POST   /items/aliases`                       -> [ADMIN, MODERATOR] Registro de equivalencia S10 (`ItemAlias`, relacion `1:N` por `itemId`, `s10RawName` unico; rechaza items inactivos).
- `PUT    /items/aliases/:id`                   -> [ADMIN, MODERATOR] Actualizacion de equivalencia S10 (`itemId`, `s10RawName`, `s10Code`, `s10Unit`, `conversionFactor`).
- `DELETE /items/aliases/:id`                   -> [ADMIN, MODERATOR] Eliminacion de alias S10.
- `GET    /items/:id`                           -> Detalle de item con consolidado de stock, alias y estadisticas transaccionales.
- `PUT    /items/:id`                           -> [ADMIN, MODERATOR] Modificacion de datos base (`trackLot`, `trackExpiration`, etc.) y doble confirmacion para cambio de `baseUnit`.
- `DELETE /items/:id`                           -> [ADMIN] Eliminacion segura de item (exige stock fisico = 0, reservado = 0 y cero custodias abiertas; borrado fisico sin historial o borrado logico `isActive = false` con historial).
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
- `GET    /purchases`                           -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Historial de compras con filtros `voidFilter` (`ACTIVE_ONLY`, `ALL`, `VOIDED_ONLY`), `includeReverted`, `onlyEdited` y objeto `summary` global calculado via `aggregate` (almacenero restringido a sus sedes y montos enmascarados).
- `GET    /purchases/price-comparison`          -> [ADMIN, MODERATOR] Cuadro comparativo de precios historicos por insumo (incluye descuentos, lote y caducidad).
- `POST   /purchases`                           -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Registro de compra con descuentos comerciales por linea (NIC 2), `lotNumber`/`expirationDate`, validacion `exchangeRate > 0` en USD y recalculo atomico de CPP (excluye `SERVICE` de Stock/CPP/Kardex).
- `GET    /purchases/:id`                       -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Detalle de factura.
- `PATCH  /purchases/:id/valuation`             -> [ADMIN, MODERATOR] Valorizacion formal de compra ingresada a precio cero con soporte de descuentos, lote/caducidad y sincronizacion de snapshot en Kardex.
- `POST   /purchases/:id/revert`                -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Reversion de compra (Nivel 1): valida stock, recalcula CPP inverso y emite `REVERSAL_EXIT` (omite lineas `SERVICE`).
- `PATCH  /purchases/:id`                       -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Edicion no contable de metadatos de compra, notas, `lotNumber` y `expirationDate` por renglon (Nivel 2; marca `isEdited = true`).
- `POST   /purchases/:id/replace`               -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Reemplazo atomico de compra (Nivel 3; marca `isEdited = true` y preserva adjuntos previos en el nuevo comprobante).
- `POST   /purchases/:id/attachments`           -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Carga de fotos (WebP) o PDFs adicionales a una compra existente (`isConfidential = true`; almacenero limitado a sus sedes).
- `DELETE /purchases/:id/attachments/:attachmentId` -> [ADMIN] Eliminacion fisica y logica de un adjunto especifico de la compra.

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
- `POST   /movements/consumption`               -> Salida por consumo en obra a cuadrilla/capataz (solo `CONSUMABLE`).
- `POST   /movements/shrinkage`                 -> Registro directo de merma o perdida fisica.
- `POST   /movements/initial-stock`             -> Carga de stock fisico inicial en caseta o sede.
- `POST   /movements/adjustment`                -> [ADMIN, MODERATOR] Ajuste formal de inventario fisico.
- `POST   /movements/:id/revert`                -> [ADMIN, MODERATOR, WAREHOUSE_KEEPER] Reversion contable de movimiento directo (`INVENTORY_ADJUSTMENT` formal restringido a `ADMIN`/`MODERATOR`).
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
- `POST   /projects`                            -> [ADMIN, MODERATOR] Creacion de proyecto vinculando un almacen `PROJECT_SITE` existente (`warehouseId`) o creando automaticamente su almacen temporal.
- `GET    /projects/:id`                        -> Detalle de proyecto, archivo S10 y requerimientos presupuestados.
- `PUT    /projects/:id`                        -> [ADMIN, MODERATOR] Actualizacion de proyecto y cambio seguro de almacen `PROJECT_SITE` (validacion estricta `409 Conflict`).
- `POST   /projects/:id/ingest-s10`             -> [ADMIN, MODERATOR] Ingesta JSON estructurada de presupuesto S10.
- `POST   /projects/:id/s10-import`             -> [ADMIN, MODERATOR] Carga, parseo y persistencia local (`UPLOAD_DIR/s10/`) de archivo CSV/TXT S10.
- `GET    /projects/:id/s10-file`               -> Descarga en streaming del archivo CSV/TXT S10 persistido (almacenero limitado a sus sedes).
- `DELETE /projects/:id/s10-file`               -> [ADMIN, MODERATOR] Eliminacion fisica del archivo S10 y limpieza de metadatos en `Project`.
- `POST   /projects/:id/requirements`           -> [ADMIN] Alta manual de un insumo activo en la Matriz de Brechas del proyecto.
- `PUT    /projects/:id/requirements/:reqId`    -> [ADMIN] Edicion de `requiredQty`, `s10UnitPrice` o reasignacion de `itemId` en la Matriz de Brechas.
- `DELETE /projects/:id/requirements/:reqId`    -> [ADMIN] Eliminacion de una fila de requerimiento sin reserva ni consumo en la Matriz de Brechas.
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
- `GET    /dashboard/metrics`                   -> Indicadores ejecutivos consolidados (oculta cifras financieras a almaceneros; excluye items inactivos, anulados y excluye `SERVICE` en `criticalItemsCount`).
- `GET    /dashboard/stock-comparison`          -> Comparativa de existencias entre Central y Obras (excluye items inactivos).
- `GET    /dashboard/urgent-replenishments`     -> Listado de alertas de stock minimo prioritario.
- `GET    /dashboard/logical-reservations`      -> Resumen de reservas logicas activas en Central.
