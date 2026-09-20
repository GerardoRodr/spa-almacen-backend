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

#### Especificación de Almacenamiento y Assets
* **Gestión de Archivos y Seguridad:** Las cargas multipart se procesan mediante `Multer` e interceptores de NestJS. Las imágenes se procesan mediante **Sharp**: se normalizan a un ancho máximo de 1920 px, se convierten a formato `.webp` con compresión al 80% y se les asigna un UUID como nombre de archivo. Los PDFs se validan por cabecera MIME (`application/pdf`) y se restringen a un tamaño máximo de 15 MB.
* **Entrega Segura de Documentos Financieros:** Para cumplir la regla de confidencialidad y datos ciegos a costos para almaceneros, las facturas de compra y comprobantes de costos **no** se exponen estáticamente sin autenticación. Se descargan a través de endpoints autenticados con validación de roles (`ADMIN`), protegiendo la información contable.
* **Estrategia de Backup:** Tarea programada mediante `cron` a las 02:00 UTC que ejecuta `pg_dump`, comprime el volcado en `.tar.gz`, purga copias locales con antigüedad superior a 7 días y habilita descarga directa en 1 clic para el Administrador.

---

### 2. Matriz de Control de Acceso (RBAC)

La seguridad del sistema opera mediante dos roles principales con segregación estricta de visibilidad financiera y operativa:

| Módulo / Funcionalidad | Rol `ADMIN` (Arquitecto / Residente) | Rol `WAREHOUSE_KEEPER` (Almacenero Obra/Central) |
| :--- | :---: | :---: |
| **Selector de Almacén Activo** | Acceso Global a Todos los Almacenes | Solo Almacenes Asignados (`UserWarehouse`) |
| **Catálogo Maestro (Crear / Editar SKU)** | Total | Solo Lectura |
| **Gestión de Alias S10 (`ItemAlias`)** | Total | Acceso Denegado |
| **Visualización de Costos, Precios y CPP** | **Visible** | **Bloqueado / Ciego** |
| **Registro de Compras a Proveedores** | Total (con costos, IGV y facturas) | Acceso Denegado |
| **Despacho de Transferencias (Fase 1)** | Autorización / Auditoría | Registro Operativo (Almacén Origen) |
| **Recepción de Transferencias (Fase 2)** | Auditoría de Discrepancias | Conteo Físico y Confirmación (Almacén Destino) |
| **Salida por Consumo en Obra** | Auditoría por Partida/Frente | Registro Diario de Entrega a Capataces |
| **Vales de Custodia de Herramientas** | Auditoría General | Préstamo y Retorno con DNI y Calificación |
| **Presupuestos S10 y Matriz de Brechas** | Carga CSV, Mapeo y Reserva Lógica | Acceso Denegado |
| **Aprobación de Mermas y Ajustes** | Exclusivo (Aprobación y Cierre) | Solo Solicitud con Evidencia Fotográfica |
| **Cierre y Liquidación de Obra** | Exclusivo | Acceso Denegado |
| **Descarga de Copias de Seguridad** | Exclusivo (1 Clic) | Acceso Denegado |

---

### 3. Esquema de Base de Datos Definitivo (Prisma ORM v6)

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
// ALMACENES Y GESTIÓN DE STOCKS
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
// CATÁLOGO DE ITEMS Y ALIAS S10
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

#### 4.4. Protocolo de Préstamo y Custodia de Herramientas (`ToolCustody`)
* En `Stock`, las herramientas operan con `loanedQty` para auditar existencias en caseta vs. campo:
  $$\text{Disponibles en Caseta} = \text{Stock.physicalQty} - \text{Stock.loanedQty}$$
* Al prestar (`LOAN_DISPATCH`): incrementa `loanedQty`.
* Al retornar conforme (`LOAN_RETURN`): decrementa `loanedQty`.
* Al retornar dañado inutilizable o perdido: decrementa `loanedQty`, decrementa `physicalQty` y genera `SHRINKAGE_EXIT` con foto de evidencia.

#### 4.5. Protocolo de Liquidación y Cierre de Almacén de Obra
Un almacén de obra temporal (`PROJECT_SITE`) se liquida únicamente si:
1. $\sum \text{Stock.physicalQty} = 0$ para todos los ítems (exige transferencia masiva de retorno a Central).
2. Cero registros abiertos en `ToolCustody` (`returnDate == null`).
3. Cero transferencias pendientes en tránsito con origen o destino en dicha obra.

---

### 5. Consideraciones de Frontend (Angular 22 Standalone con Signals)

* **Arquitectura Reactiva con Signals:** Implementación con `signal()`, `computed()` y `model()`, prescindiendo de `NgModule` para carga ultra ligera en tablets y teléfonos en obra.
* **Seguridad y Visibilidad Financiera Ciega:** Directiva estructural `*appHasRole="'ADMIN'"` para erradicar cualquier exposición de precios o costos en terminales de almaceneros.
* **Contexto Multi-Almacén:** Servicio global `WarehouseContextService` que gobierna reactivamente el almacén activo de la sesión.
* **Diseño para Faena (Touch-First):** Botones con área interactiva mínima de 48×48 px y uso de cámara directa para fotos de guías físicas y evidencias.