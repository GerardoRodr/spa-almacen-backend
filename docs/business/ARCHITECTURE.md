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
  - `RolesGuard`: Segregacion de permisos (`ADMIN` vs `WAREHOUSE_KEEPER`).
  - `WarehouseAccessGuard`: Valida que el almacenero solo opere sobre almacenes donde tiene autorizacion activa en `UserWarehouse`.
  - `CostMaskingInterceptor`: Serializador que omite campos monetarios en respuestas hacia roles no administrativos.
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
  - Las **facturas de compra** contienen costos unitarios confidenciales y estan restringidas exclusivamente a usuarios con rol `ADMIN`.
  - Nginx **no** sirve la carpeta `/uploads/invoices/*` de manera estatica y publica.
  - La descarga de comprobantes financieros se realiza mediante el endpoint autenticado `GET /api/v1/documents/:id/download`, validando el token y rol antes de emitir el archivo en streaming o delegarlo mediante la cabecera `X-Accel-Redirect` de Nginx.
* **Respaldos de Base de Datos:** Tarea programada diaria a las 02:00 UTC con `pg_dump`, compresion `.tar.gz`, retencion local de 7 dias y endpoint con boton de descarga directa en 1 clic para el Administrador.

---

## 3. Matriz de Control de Acceso por Roles (RBAC)

| Modulo / Funcionalidad | Rol `ADMIN` (Arquitecto / Residente) | Rol `WAREHOUSE_KEEPER` (Almacenero Obra/Central) |
| :--- | :---: | :---: |
| **Selector de Almacen Activo** | Acceso Global a Todos los Almacenes | Solo Almacenes Asignados (`UserWarehouse`) |
| **Catalogo Maestro (Crear / Editar SKU)** | Total | Solo Lectura |
| **Gestion de Alias S10 (`ItemAlias`)** | Total | Acceso Denegado |
| **Visualizacion de Costos, Precios y CPP** | **Visible** | **Bloqueado / Ciego** |
| **Registro de Compras a Proveedores** | Total (con costos, IGV y facturas) | Acceso Denegado |
| **Despacho de Transferencias (Fase 1)** | Autorizacion / Auditoria | Registro Operativo (Almacen Origen) |
| **Recepcion de Transferencias (Fase 2)** | Auditoria de Discrepancias | Conteo Fisico y Confirmacion (Almacen Destino) |
| **Salida por Consumo en Obra** | Auditoria por Partida/Frente | Registro Diario de Entrega a Capataces |
| **Vales de Custodia de Herramientas** | Auditoria General | Prestamo y Retorno con DNI y Calificacion |
| **Presupuestos S10 y Matriz de Brechas** | Carga CSV, Mapeo y Reserva Logica | Acceso Denegado |
| **Aprobacion de Mermas y Ajustes** | Exclusivo (Aprobacion y Cierre) | Solo Solicitud con Evidencia Fotografica |
| **Cierre y Liquidacion de Obra** | Exclusivo | Acceso Denegado |
| **Descarga de Copias de Seguridad** | Exclusivo (1 Clic) | Acceso Denegado |

---

## 4. Esquema de Base de Datos Definitivo (Prisma ORM v6)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// --------------------------------------------------------
// ENUMS DE DOMINIO
// --------------------------------------------------------

enum Role {
  ADMIN
  WAREHOUSE_KEEPER
}

enum ItemType {
  CONSUMABLE
  ASSET_TOOL
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
  TRANSFER_DISPATCH    // Salida física desde origen hacia tránsito
  TRANSFER_RECEIPT     // Entrada física en destino confirmada
  LOAN_DISPATCH        // Salida de herramienta a operario en custodia
  LOAN_RETURN          // Retorno de herramienta a caseta
  SHRINKAGE_EXIT       // Merma física, pérdida en transporte o rotura
  INVENTORY_ADJUSTMENT // Ajuste manual por inventario físico formal
}

enum ToolCondition {
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
  id                 String          @id @default(uuid())
  email              String          @unique
  passwordHash       String
  fullName           String
  role               Role            @default(WAREHOUSE_KEEPER)
  isActive           Boolean         @default(true)
  
  assignedWarehouses UserWarehouse[]
  movements          Movement[]
  dispatchedTransfers Transfer[]     @relation("DispatchedTransfers")
  receivedTransfers   Transfer[]     @relation("ReceivedTransfers")
  dispatchedLoans    ToolCustody[]   @relation("DispatchedLoans")
  receivedLoans      ToolCustody[]   @relation("ReceivedLoans")
  
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt
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
  id              String          @id @default(uuid())
  name            String
  type            WarehouseType
  isTemporary     Boolean         @default(false)
  isActive        Boolean         @default(true)
  projectId       String?         @unique
  project         Project?        @relation(fields: [projectId], references: [id])
  
  stocks          Stock[]
  users           UserWarehouse[]
  originTransfers Transfer[]      @relation("OriginTransfers")
  destTransfers   Transfer[]      @relation("DestTransfers")
  movementsOrigin Movement[]      @relation("MovementOriginWarehouse")
  movementsDest   Movement[]      @relation("MovementDestWarehouse")
  toolCustodies   ToolCustody[]
  
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
}

model Stock {
  id          String    @id @default(uuid())
  warehouseId String
  itemId      String
  physicalQty Decimal   @default(0) @db.Decimal(12, 4) // Cantidad en piso en este almacen
  reservedQty Decimal   @default(0) @db.Decimal(12, 4) // Comprometido en Almacen Central para obras
  loanedQty   Decimal   @default(0) @db.Decimal(12, 4) // Herramientas actualmente prestadas en campo
  averageCost Decimal   @default(0) @db.Decimal(14, 4) // Costo promedio ponderado en PEN (sin IGV)

  warehouse   Warehouse @relation(fields: [warehouseId], references: [id], onDelete: Cascade)
  item        Item      @relation(fields: [itemId], references: [id], onDelete: Cascade)

  @@unique([warehouseId, itemId])
}

// --------------------------------------------------------
// CATALOGO DE ITEMS Y ALIAS S10
// --------------------------------------------------------

model Item {
  id              String               @id @default(uuid())
  sku             String               @unique
  name            String
  description     String?
  baseUnit        String               // UND, KG, M3, BOLSA, GLN, VARILLA
  type            ItemType
  minStockAlert   Decimal              @default(0) @db.Decimal(12, 4)
  
  stocks          Stock[]
  aliases         ItemAlias[]
  purchaseDetails PurchaseDetail[]
  transferItems   TransferItem[]
  movementItems   MovementItem[]
  projectDemands  ProjectRequirement[]
  toolCustodies   ToolCustody[]
  
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
}

model ItemAlias {
  id               String   @id @default(uuid())
  itemId           String
  s10RawName       String   @unique // Nombre literal extraido del presupuesto S10
  s10Code          String?  // Codigo de partida o insumo S10
  s10Unit          String?  // Unidad en el S10 (ej. M2, P2, BOL)
  conversionFactor Decimal  @default(1.0000) @db.Decimal(10, 4) // Multiplicador para llevar a Item.baseUnit

  item             Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
}

// --------------------------------------------------------
// PROYECTOS Y ESTIMACIONES (S10)
// --------------------------------------------------------

model Project {
  id           String               @id @default(uuid())
  name         String
  budgetCode   String?              // Codigo de presupuesto S10
  status       ProjectStatus        @default(PLANNING)
  
  warehouse    Warehouse?
  requirements ProjectRequirement[]
  transfers    Transfer[]
  movements    Movement[]
  
  createdAt    DateTime             @default(now())
  updatedAt    DateTime             @updatedAt
}

model ProjectRequirement {
  id           String   @id @default(uuid())
  projectId    String
  itemId       String
  requiredQty  Decimal  @db.Decimal(12, 4) // Demanda total segun S10
  allocatedQty Decimal  @default(0) @db.Decimal(12, 4) // Stock reservado en Almacen Central
  consumedQty  Decimal  @default(0) @db.Decimal(12, 4) // Stock consumido definitivamente en obra

  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  item         Item     @relation(fields: [itemId], references: [id])

  @@unique([projectId, itemId])
}

// --------------------------------------------------------
// COMPRAS Y PROVEEDORES
// --------------------------------------------------------

model Supplier {
  id           String     @id @default(uuid())
  taxId        String     @unique // RUC (11 digitos)
  businessName String
  contactPhone String?
  contactEmail String?
  address      String?
  
  purchases    Purchase[]
  createdAt    DateTime   @default(now())
}

model Purchase {
  id             String               @id @default(uuid())
  supplierId     String
  invoiceSeries  String               // Factura o comprobante (ej. F001-0004523)
  currency       Currency             @default(PEN)
  exchangeRate   Decimal              @default(1.0000) @db.Decimal(8, 4)
  issueDate      DateTime
  subtotalPEN    Decimal              @db.Decimal(14, 2) // Base imponible neta computable a stock
  igvAmountPEN   Decimal              @default(0) @db.Decimal(14, 2) // IGV 18% para cotejo contable
  totalAmountPEN Decimal              @db.Decimal(14, 2)
  
  supplier       Supplier             @relation(fields: [supplierId], references: [id])
  details        PurchaseDetail[]
  documents      DocumentAttachment[]
  
  createdAt      DateTime             @default(now())
}

model PurchaseDetail {
  id                String   @id @default(uuid())
  purchaseId        String
  itemId            String
  purchaseUnit      String   // Unidad de compra (ej. PALLET, MILLAR, BOLSA)
  conversionFactor  Decimal  @default(1.0000) @db.Decimal(10, 4) // Factor hacia Item.baseUnit
  purchaseQty       Decimal  @db.Decimal(12, 4)
  baseQty           Decimal  @db.Decimal(12, 4) // purchaseQty * conversionFactor
  unitPriceOriginal Decimal  @db.Decimal(14, 4) // Precio unitario neto en moneda original
  unitCostBasePEN   Decimal  @db.Decimal(14, 4) // Costo neto por unidad base en Soles
  subtotalPEN       Decimal  @db.Decimal(14, 2)

  purchase          Purchase @relation(fields: [purchaseId], references: [id], onDelete: Cascade)
  item              Item     @relation(fields: [itemId], references: [id])
}

// --------------------------------------------------------
// TRANSFERENCIAS OPERATIVAS EN DOS FASES
// --------------------------------------------------------

model Transfer {
  id                String         @id @default(uuid())
  transferNumber    String         @unique // TR-2026-00001
  originWarehouseId String
  destWarehouseId   String
  projectId         String?
  status            TransferStatus @default(PENDING)
  
  dispatchedById    String
  receivedById      String?
  dispatchedAt      DateTime?
  receivedAt        DateTime?
  dispatchNotes     String?
  receptionNotes    String?
  
  originWarehouse   Warehouse      @relation("OriginTransfers", fields: [originWarehouseId], references: [id])
  destWarehouse     Warehouse      @relation("DestTransfers", fields: [destWarehouseId], references: [id])
  project           Project?       @relation(fields: [projectId], references: [id])
  dispatchedBy      User           @relation("DispatchedTransfers", fields: [dispatchedById], references: [id])
  receivedBy        User?          @relation("ReceivedTransfers", fields: [receivedById], references: [id])
  
  items             TransferItem[]
  movements         Movement[]
  documents         DocumentAttachment[]
  
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
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
}

// --------------------------------------------------------
// KARDEX INMUTABLE (APPEND-ONLY)
// --------------------------------------------------------

model Movement {
  id                String               @id @default(uuid())
  movementNumber    String               @unique // MOV-2026-00001
  type              MovementType
  originWarehouseId String?
  destWarehouseId   String?
  projectId         String?
  userId            String
  transferId        String?
  
  recipientName     String?              // Operario o capataz receptor
  recipientDni      String?              // DNI del operario
  shrinkageReason   String?              // Requerido en SHRINKAGE_EXIT
  observation       String?
  
  originWarehouse   Warehouse?           @relation("MovementOriginWarehouse", fields: [originWarehouseId], references: [id])
  destWarehouse     Warehouse?           @relation("MovementDestWarehouse", fields: [destWarehouseId], references: [id])
  project           Project?             @relation(fields: [projectId], references: [id])
  user              User                 @relation(fields: [userId], references: [id])
  transfer          Transfer?            @relation(fields: [transferId], references: [id])
  
  items             MovementItem[]
  documents         DocumentAttachment[]
  
  createdAt         DateTime             @default(now())
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
}

// --------------------------------------------------------
// CUSTODIA DE HERRAMIENTAS Y EQUIPOS
// --------------------------------------------------------

model ToolCustody {
  id                  String         @id @default(uuid())
  custodyNumber       String         @unique // VALE-2026-00001
  itemId              String
  warehouseId         String
  quantity            Decimal        @default(1) @db.Decimal(12, 4) // Soporta N unidades de herramientas menores
  serialOrCode        String?        // Codigo patrimonial o serie de equipo mayor
  assignedToName      String         // Operario
  assignedToDni       String         // DNI del operario
  
  dispatchedById      String
  receivedById        String?
  dispatchDate        DateTime       @default(now())
  expectedReturnDate  DateTime?
  returnDate          DateTime?
  
  conditionOnDispatch ToolCondition  @default(OPERATIVE)
  conditionOnReturn   ToolCondition?
  notes               String?
  returnNotes         String?
  
  item                Item           @relation(fields: [itemId], references: [id])
  warehouse           Warehouse      @relation(fields: [warehouseId], references: [id])
  dispatchedBy        User           @relation("DispatchedLoans", fields: [dispatchedById], references: [id])
  receivedBy          User?          @relation("ReceivedLoans", fields: [receivedById], references: [id])
  documents           DocumentAttachment[]
  
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt
}

// --------------------------------------------------------
// DOCUMENTOS ADJUNTOS Y EVIDENCIAS
// --------------------------------------------------------

model DocumentAttachment {
  id            String       @id @default(uuid())
  purchaseId    String?
  transferId    String?
  movementId    String?
  custodyId     String?
  
  originalName  String
  storedPath    String       // Ruta interna segura
  mimeType      String
  fileSizeBytes Int
  isConfidential Boolean     @default(false) // True si contiene precios (ej. facturas)
  
  purchase      Purchase?    @relation(fields: [purchaseId], references: [id], onDelete: Cascade)
  transfer      Transfer?    @relation(fields: [transferId], references: [id], onDelete: Cascade)
  movement      Movement?    @relation(fields: [movementId], references: [id], onDelete: Cascade)
  custody       ToolCustody? @relation(fields: [custodyId], references: [id], onDelete: Cascade)
  
  createdAt     DateTime     @default(now())
}
```

---

## 5. Catalogo Exhaustivo de Endpoints REST (`/api/v1/*`)

Todos los endpoints estan protegidos por defecto con `JwtAuthGuard` y aplican validacion de roles (`RolesGuard`) y control de acceso por almacen (`WarehouseAccessGuard`).

### 5.1. Autenticacion y Usuarios
- `POST   /auth/login`                          -> Emision de JWT (Access + Refresh Token) y perfil de usuario con almacenes autorizados.
- `POST   /auth/refresh`                        -> Renovacion de tokens de sesion.
- `GET    /auth/profile`                        -> Informacion del usuario en sesion y almacenes vinculados.
- `GET    /users`                               -> [ADMIN] Listado de usuarios del sistema.
- `POST   /users`                               -> [ADMIN] Creacion de usuario y asignacion de rol.
- `PUT    /users/:id/warehouses`                -> [ADMIN] Asignacion de almacenes autorizados en `UserWarehouse`.

### 5.2. Almacenes y Stocks
- `GET    /warehouses`                          -> Listado de almacenes activos (filtrado para almaceneros segun autorizacion).
- `POST   /warehouses`                          -> [ADMIN] Creacion de almacen Central o Almacen de Obra temporal.
- `GET    /warehouses/:id/stock`                -> Stock en tiempo real del almacen (`physicalQty`, `reservedQty`, `loanedQty`). Oculta `averageCost` a almaceneros.
- `GET    /warehouses/:id/alerts`               -> Alertas de stock minimo y faltantes criticos.

### 5.3. Catalogo de Items y Alias S10
- `GET    /items`                               -> Lista paginada de insumos con busqueda por SKU, nombre y tipo.
- `POST   /items`                               -> [ADMIN] Alta de nuevo insumo en catalogo maestro.
- `GET    /items/:id`                           -> Detalle de item con consolidado de stock en todos los almacenes.
- `PUT    /items/:id`                           -> [ADMIN] Modificacion de datos base y alerta de stock minimo.
- `POST   /items/aliases`                       -> [ADMIN] Registro de equivalencia cruda S10 (`ItemAlias`) con factor de conversion.
- `DELETE /items/aliases/:id`                   -> [ADMIN] Eliminacion de alias.

### 5.4. Compras y Proveedores (Exclusivo Administracion)
- `GET    /suppliers`                           -> [ADMIN] Listado y busqueda de proveedores por RUC o razon social.
- `POST   /suppliers`                           -> [ADMIN] Registro de proveedor.
- `GET    /purchases`                           -> [ADMIN] Historial valorizado de compras con estados y montos.
- `POST   /purchases`                           -> [ADMIN] Registro de compra con calculo de IGV, conversion bimoneda y recalculo atómico de CPP en Almacen Central.
- `GET    /purchases/:id`                       -> [ADMIN] Detalle de factura y desglose de items valorizados.

### 5.5. Transferencias en Dos Fases
- `GET    /transfers`                           -> Listado de transferencias (filtro por origen, destino y estado).
- `POST   /transfers/dispatch`                  -> [Fase 1: Despacho] Creacion de transferencia en estado `IN_TRANSIT`, descuenta stock en origen y emite guia.
- `POST   /transfers/:id/receive`               -> [Fase 2: Recepcion] Confirmacion por el almacenero receptor. Valida conformidad o registra discrepancia con merma automatica.
- `GET    /transfers/in-transit`                -> Lista rapida de cargamentos en camino hacia el almacen activo del usuario.

### 5.6. Salidas de Consumo y Kardex
- `GET    /movements`                           -> Consulta del libro mayor Kardex (filtrado por almacen, tipo, fecha e item). Oculta costos a almaceneros.
- `POST   /movements/consumption`               -> [Caseta de Obra] Salida de material consumible a cuadrilla/capataz por DNI y partida.
- `POST   /movements/adjustment`                -> Solicitud de ajuste de inventario o merma interna (requiere aprobacion `ADMIN`).

### 5.7. Custodia de Herramientas y Equipos
- `POST   /custody/loans`                       -> Emision de vale de prestamo de herramienta a operario con DNI.
- `PUT    /custody/loans/:id/return`            -> Registro de retorno de herramienta con calificacion fisica (`OPERATIVE`, `DAMAGED`, `LOST`).
- `GET    /custody/loans/active`                -> Listado de herramientas prestadas en campo pendientes de devolucion en el almacen activo.
- `GET    /custody/loans/history-by-dni/:dni`   -> Historial de prestamos y conducta de devolucion de un trabajador.

### 5.8. Proyectos y Motor S10
- `GET    /projects`                            -> [ADMIN] Listado de obras con estado (`PLANNING`, `ACTIVE`, `LIQUIDATED`).
- `POST   /projects`                            -> [ADMIN] Creacion de proyecto civil y vinculacion automatica de su Almacen de Obra temporal.
- `POST   /projects/:id/s10-import              -> [ADMIN] Ingesta y parseo de CSV de S10 (detecta `;` / `,`, soporte Windows-1252/UTF-8).
- `GET    /projects/:id/gap-analysis`           -> [ADMIN] Matriz de brechas: demanda presupuestada vs stock neto disponible en Almacen Central.
- `POST   /projects/:id/allocate-stock`         -> [ADMIN] Ejecucion de reserva logica en Almacen Central (Opcion A).
- `POST   /projects/:id/release-stock`          -> [ADMIN] Liberacion de reserva de stock hacia disponible general.
- `POST   /projects/:id/liquidate`              -> [ADMIN] Validacion de 3 condiciones estrictas y liquidacion formal de la obra.

### 5.9. Gestion de Documentos y Seguridad
- `POST   /documents/upload`                    -> Subida de comprobante/evidencia con compresion Sharp a WebP.
- `GET    /documents/:id/download`              -> Descarga segura autenticada de comprobantes (valida permisos de rol antes de servir facturas).

### 5.10. Mantenimiento y Respaldos
- `GET    /admin/backups`                       -> [ADMIN] Listado de copias de seguridad disponibles en VPS.
- `POST   /admin/backups/generate`              -> [ADMIN] Disparo manual de volcado `pg_dump` comprimido.
- `GET    /admin/backups/:id/download`          -> [ADMIN] Descarga directa en 1 clic de archivo `.tar.gz` o `.sql`.
