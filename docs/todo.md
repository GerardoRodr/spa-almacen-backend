# Roadmap y Plan de Trabajo: SPA-ALMACEN-ERP (Backend)

Este documento representa la hoja de ruta integral y el estado de avance para el backend del sistema **SPA-ALMACEN-ERP**. Cada paso grande se aborda de manera secuencial e independiente, garantizando analisis, planificacion y pruebas unitarias/de integracion.

---

## Estado General del Proyecto

- [x] **Paso 0: Fundacion, Dependencias e Infraestructura Base**
- [x] **Paso 1: Autenticacion, Usuarios y Contexto Multi-Almacen (RBAC)**
- [ ] **Paso 2: Almacenes, Catalogo Maestro de Items y Alias S10**
- [ ] **Paso 3: Proveedores, Compras y Algoritmo de Costo Promedio Ponderado (CPP / WAC)**
- [ ] **Paso 4: Transferencias Operativas en Dos Fases y Control de Mermas**
- [ ] **Paso 5: Salidas por Consumo en Obra y Kardex Inmutable (Append-Only)**
- [ ] **Paso 6: Custodia, Prestamo y Devolucion de Herramientas**
- [ ] **Paso 7: Proyectos, Ingesta S10, Matriz de Brechas y Liquidacion de Obra**
- [ ] **Paso 8: Gestion de Archivos Seguros y Pipeline de Optimizacion Sharp**
- [ ] **Paso 9: Mantenimiento, Backups Diarios y Hardening Final**

---

## Paso 0: Fundacion e Infraestructura Base (Completado)

- [x] Instalacion de dependencias de produccion: `@prisma/client@^6`, `@nestjs/config`, `@nestjs/swagger`, `@nestjs/passport`, `passport`, `passport-jwt`, `@nestjs/jwt`, `bcrypt`, `helmet`, `@nestjs/throttler`, `class-validator`, `class-transformer`, `sharp`, `papaparse`, `iconv-lite`.
- [x] Instalacion de dependencias de desarrollo y tipos: `prisma@^6`, `@types/passport-jwt`, `@types/bcrypt`, `@types/multer`, `@types/papaparse`.
- [x] Definicion del esquema relacional completo en `prisma/schema.prisma` con precisiones decimales contables (`DECIMAL(14, 4)`, `DECIMAL(12, 4)`, `DECIMAL(14, 2)`).
- [x] Creacion de contenedor Docker con PostgreSQL 16 Alpine (`docker/Dockerfile.postgres` y `docker-compose.yml`) con persistencia en volumen `almacen_pgdata` y healthcheck.
- [x] Ejecucion de migracion inicial con `npx prisma migrate dev --name init` y generacion de cliente `@prisma/client`.
- [x] Implementacion del modulo global `PrismaModule` y servicio `PrismaService` con hooks `onModuleInit` y `onModuleDestroy`.
- [x] Configuracion de variables de entorno tipadas en `src/config/configuration.ts` y plantillas `.env` / `.env.example`.
- [x] Configuracion de bootstrap en `src/main.ts` con prefijo `/api/v1`, Helmet, CORS, ValidationPipe global y documentacion OpenAPI en `/api/docs`.

---

## Paso 1: Autenticacion, Usuarios y Contexto Multi-Almacen (RBAC) (Completado)

Establecer la capa de seguridad, emision de JWT, control de acceso por roles y restriccion operativa por almacen asignado.

### Tareas:
- [x] **Modulo de Usuarios (`src/modules/users`):**
  - [x] DTOs de creacion y actualizacion de usuarios con validaciones (`CreateUserDto`, `UpdateUserDto`).
  - [x] DTO para asignacion de almacenes en `UserWarehouse` (`AssignWarehousesDto`).
  - [x] Servicio de usuarios: creacion de usuarios con hash bcrypt, listado y asignacion multi-almacen.
  - [x] Controlador de usuarios (`/users`) protegido con rol `ADMIN`.
- [x] **Modulo de Autenticacion (`src/modules/auth`):**
  - [x] DTOs de login y refresco (`LoginDto`, `RefreshTokenDto`).
  - [x] Servicio de autenticacion: validacion de credenciales con bcrypt y generacion de pares de tokens (Access Token 15 min + Refresh Token 7 dias).
  - [x] Retorno en login del perfil de usuario y la lista de sus almacenes autorizados activos.
  - [x] Implementacion de estrategia `JwtStrategy` con Passport.
  - [x] Controlador de autenticacion (`/auth/login`, `/auth/refresh`, `/auth/profile`).
- [x] **Guards de Seguridad:**
  - [x] `JwtAuthGuard`: Proteccion de rutas privadas mediante validacion de Bearer Token.
  - [x] `RolesGuard`: Verificacion de roles (`Role.ADMIN` vs `Role.WAREHOUSE_KEEPER`) usando el decorador `@Roles`.
  - [x] `WarehouseAccessGuard`: Verificacion estricta de que un usuario con rol `WAREHOUSE_KEEPER` solo pueda consultar o alterar recursos del almacen activo especificado en la cabecera o parametro (`x-warehouse-id` o `:warehouseId`), mientras que `ADMIN` posee bypass global.
- [x] **Seed Inicial:**
  - [x] Script de siembra (`prisma/seed.ts`) con usuario Administrador inicial y Almacen Central por defecto.
- [x] **Documentacion OpenAPI Swagger:**
  - [x] Decoradores `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth` y `@ApiProperty` en controladores y DTOs para pruebas directas en `/api/docs`.

---

## Paso 2: Almacenes, Catalogo Maestro de Items y Alias S10

Gestion de almacenes fisicos (Central vs Obra), catalogo maestro de items (Consumibles vs Herramientas) y proteccion de datos financieros ciegos.

### Tareas:
- [ ] **Modulo de Almacenes (`src/modules/warehouses`):**
  - [ ] DTOs: `CreateWarehouseDto`, `UpdateWarehouseDto`.
  - [ ] Servicio de almacenes: creacion de Almacen Central o Almacen de Obra temporal, listado filtrado segun autorizaciones de `UserWarehouse`.
  - [ ] Consulta de stock en tiempo real por almacen: agregacion de `physicalQty`, `reservedQty`, `loanedQty` y `averageCost`.
  - [ ] Consulta de alertas de reposicion: items con `physicalQty <= minStockAlert`.
  - [ ] Endpoints: `GET /warehouses`, `POST /warehouses`, `GET /warehouses/:id/stock`, `GET /warehouses/:id/alerts`.
- [ ] **Modulo de Catalogo de Items (`src/modules/items`):**
  - [ ] DTOs: `CreateItemDto`, `UpdateItemDto`, `CreateItemAliasDto`.
  - [ ] Servicio de items: alta de SKU maestro, clasificacion (`CONSUMABLE` vs `ASSET_TOOL`), unidad base (`baseUnit`), definicion de stock minimo.
  - [ ] Listado paginado con filtros por SKU, nombre y tipo.
  - [ ] Detalle de item con consolidado de stock existente en todos los almacenes de la empresa.
  - [ ] Gestion de alias S10 (`ItemAlias`): asociacion de texto crudo del S10 con un SKU maestro y factor de conversion hacia `baseUnit`.
  - [ ] Endpoints: `GET /items`, `POST /items`, `GET /items/:id`, `PUT /items/:id`, `POST /items/aliases`, `DELETE /items/aliases/:id`.
- [ ] **Interceptor de Ocultamiento Financiero (`CostMaskingInterceptor`):**
  - [ ] Interceptor de serializacion para detectar rol `WAREHOUSE_KEEPER` y omitir recursivamente propiedades sensibles: `averageCost`, `unitPriceOriginal`, `subtotalPEN`, `totalAmountPEN`, `unitCostSnapshot`.
- [ ] **Documentacion OpenAPI Swagger:**
  - [ ] Decoradores `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth` y `@ApiProperty` para pruebas interactivas en `/api/docs`.

---

## Paso 3: Proveedores, Compras y Algoritmo de Costo Promedio Ponderado (CPP / WAC)

Ingreso formal de insumos a Almacen Central por adquisicion a proveedores, soporte bimoneda, separacion contable de IGV y recalculo ponderado de costos.

### Tareas:
- [ ] **Modulo de Proveedores (`src/modules/suppliers`):**
  - [ ] DTOs: `CreateSupplierDto`, `UpdateSupplierDto` con validacion de RUC (11 digitos).
  - [ ] Servicio y controlador de proveedores (`/suppliers`).
- [ ] **Modulo de Compras (`src/modules/purchases`):**
  - [ ] DTOs: `CreatePurchaseDto`, `PurchaseDetailDto` (soporte de serie de comprobante, moneda PEN/USD, tipo de cambio `exchangeRate`, factor de conversion de compra).
  - [ ] Logica financiera (NIC 2 / SUNAT):
    - Computo del costo unitario neto sin IGV (18%) en Soles (`unitCostBasePEN`).
    - Recalculo atómico de CPP en transaccion `prisma.$transaction`:
      `CPP_nuevo = ((S_ant * CPP_ant) + (Q_ing * C_unitPEN)) / (S_ant + Q_ing)`
    - Actualizacion o creacion de registro `Stock` en el Almacen Central receptor.
    - Generacion append-only de `Movement` (`PURCHASE_ENTRY`) y `MovementItem` congelando el snapshot de costo.
  - [ ] Endpoints: `GET /purchases`, `POST /purchases`, `GET /purchases/:id` (acceso exclusivo `ADMIN`).
- [ ] **Documentacion OpenAPI Swagger:**
  - [ ] Decoradores `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth` y `@ApiProperty` para pruebas interactivas en `/api/docs`.

---

## Paso 4: Transferencias Operativas en Dos Fases y Control de Mermas

Traslado fisico de materiales desde Almacen Central hacia casetas de obra temporal con auditoria de despacho, recepcion y mermas en transito.

### Tareas:
- [ ] **Modulo de Transferencias (`src/modules/transfers`):**
  - [ ] DTOs: `DispatchTransferDto`, `ReceiveTransferDto`, `TransferItemDto`.
  - [ ] **Fase 1: Despacho desde Almacen Origen:**
    - Validacion de existencia fisica (`Stock.physicalQty >= Q`).
    - Descuento de stock fisico en origen y descuento de `reservedQty` (si proviene de reserva).
    - Descuento de `ProjectRequirement.allocatedQty` en la obra destino.
    - Creacion de `Transfer` en estado `IN_TRANSIT` con correlativo automatico (`TR-YYYY-NNNNN`).
    - Emision de `Movement` append-only (`TRANSFER_DISPATCH`) con snapshot de costo promedio vigente.
  - [ ] **Fase 2: Recepcion y Conteo en Almacen Destino:**
    - Caso Conforme (`receivedQty == dispatchedQty`): Estado `COMPLETED`, incremento de `Stock.physicalQty` en destino, actualizacion de CPP en destino y emision de `Movement` (`TRANSFER_RECEIPT`).
    - Caso Discrepancia / Merma en Ruta (`receivedQty < dispatchedQty`): Ingreso de cantidad conforme en destino, cambio de estado a `DISCREPANCY` y generacion automatica de `Movement` (`SHRINKAGE_EXIT`) por perdida en transporte.
  - [ ] Endpoints: `GET /transfers`, `GET /transfers/in-transit`, `POST /transfers/dispatch`, `POST /transfers/:id/receive`.
- [ ] **Documentacion OpenAPI Swagger:**
  - [ ] Decoradores `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth` y `@ApiProperty` para pruebas interactivas en `/api/docs`.

---

## Paso 5: Salidas por Consumo en Obra y Kardex Inmutable (Append-Only)

Entrega de materiales consumibles a cuadrillas de construccion en caseta de obra, control por DNI y gestion del libro mayor Kardex.

### Tareas:
- [ ] **Modulo de Movimientos y Kardex (`src/modules/movements`):**
  - [ ] DTOs: `CreateConsumptionDto`, `CreateAdjustmentDto`.
  - [ ] **Salida por Consumo en Obra:**
    - Verificacion de que el item sea de tipo `CONSUMABLE`.
    - Descuento de `Stock.physicalQty` en el Almacen de Obra.
    - Incremento de `ProjectRequirement.consumedQty` en el proyecto vinculado.
    - Creacion de `Movement` (`CONSUMPTION_EXIT`) con correlativo (`MOV-YYYY-NNNNN`), DNI y nombre del capataz o cuadrilla.
  - [ ] **Ajustes de Inventario y Mermas:**
    - Endpoint para regularizar descuadres fisicos con motivo obligatorio y evidencia.
    - Requiere aprobacion exclusiva de rol `ADMIN` para consolidar el movimiento (`INVENTORY_ADJUSTMENT` o `SHRINKAGE_EXIT`).
  - [ ] **Inmutabilidad:**
    - Bloqueo estricto a nivel de servicio para operaciones de actualizacion o eliminacion sobre tablas `Movement` y `MovementItem`.
  - [ ] Endpoints: `GET /movements` (con filtros de fecha, tipo, almacen e item), `POST /movements/consumption`, `POST /movements/adjustment`.
- [ ] **Documentacion OpenAPI Swagger:**
  - [ ] Decoradores `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth` y `@ApiProperty` para pruebas interactivas en `/api/docs`.

---

## Paso 6: Custodia, Prestamo y Devolucion de Herramientas

Administracion del ciclo de vida de herramientas y equipos (`ASSET_TOOL`), control de caseta vs campo y retorno con calificacion fisica.

### Tareas:
- [ ] **Modulo de Custodia de Herramientas (`src/modules/custody`):**
  - [ ] DTOs: `CreateLoanDto`, `ReturnLoanDto`.
  - [ ] **Despacho en Prestamo:**
    - Validacion de disponibilidad en caseta: `Stock.physicalQty - Stock.loanedQty >= Q`.
    - Registro de numero de serie o codigo patrimonial para herramientas mayores.
    - Incremento de `Stock.loanedQty`.
    - Creacion de registro `ToolCustody` con correlativo (`VALE-YYYY-NNNNN`), DNI, nombre del operario y condicion de entrega (`OPERATIVE`).
    - Emision de `Movement` (`LOAN_DISPATCH`).
  - [ ] **Retorno y Calificacion Fisica:**
    - Retorno Conforme (`OPERATIVE` o `DAMAGED_USABLE`): decrementa `Stock.loanedQty`, sella fecha de retorno y emite `Movement` (`LOAN_RETURN`).
    - Retorno con Baja Patrimonial (`DAMAGED_UNUSABLE` o `LOST`): decrementa `Stock.loanedQty`, decrementa `Stock.physicalQty` y emite automaticamente un `Movement` (`SHRINKAGE_EXIT`) por baja de equipo con evidencia.
  - [ ] Endpoints: `POST /custody/loans`, `PUT /custody/loans/:id/return`, `GET /custody/loans/active`, `GET /custody/loans/history-by-dni/:dni`.
- [ ] **Documentacion OpenAPI Swagger:**
  - [ ] Decoradores `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth` y `@ApiProperty` para pruebas interactivas en `/api/docs`.

---

## Paso 7: Proyectos, Ingesta S10, Matriz de Brechas y Liquidacion de Obra

Carga masiva de presupuestos S10 por streams, resolucion de equivalencias, matriz de deficit de compra (Gap Analysis), reserva de stock y cierre formal de obras.

### Tareas:
- [ ] **Modulo de Proyectos (`src/modules/projects`):**
  - [ ] DTOs: `CreateProjectDto`, `AllocateStockDto`, `ReleaseStockDto`.
  - [ ] Creacion de obra civil con creacion automatica de su Almacen de Obra temporal asociado (`PROJECT_SITE`).
- [ ] **Motor de Ingesta S10 (`S10ParserService`):**
  - [ ] Procesamiento por streams con `papaparse` e `iconv-lite` con deteccion de delimitadores (`;` o `,`) y codificaciones (`Windows-1252` y `UTF-8`).
  - [ ] Filtrado estricto: descarte de `01 MANO DE OBRA` y `04 SUBCONTRATOS`; inclusion exclusiva de `02 MATERIALES` y `03 EQUIPOS`.
  - [ ] Resolucion automatica de `ItemAlias` y conversion a unidad base (`requiredQty = s10Qty * conversionFactor`). Identificacion de insumos pendientes de mapeo.
- [ ] **Matriz de Brechas (Gap Analysis):**
  - [ ] Calculo de `Stock Neto Disponible Central = sum(physicalQty - reservedQty)`.
  - [ ] Calculo de `Deficit a Comprar = max(0, Demanda S10 - Stock Neto Disponible Central)`.
- [ ] **Reserva Logica en Almacen Central (Opcion A):**
  - [ ] Incremento atómico de `Stock.reservedQty` en Central e incremento de `ProjectRequirement.allocatedQty`.
  - [ ] Liberacion manual de stock reservado.
- [ ] **Protocolo de Liquidacion de Obra:**
  - [ ] Validacion estricta de las 3 condiciones:
    1. Stock fisico cero en el almacen de obra (`sum(Stock.physicalQty) == 0`).
    2. Cero prestamos de herramientas abiertos (`ToolCustody` con `returnDate == null`).
    3. Cero transferencias en transito (`IN_TRANSIT` o `PENDING`).
  - [ ] Marcado de obra como `LIQUIDATED` y desactivacion del almacen.
- [ ] Endpoints: `GET /projects`, `POST /projects`, `POST /projects/:id/s10-import`, `GET /projects/:id/gap-analysis`, `POST /projects/:id/allocate-stock`, `POST /projects/:id/release-stock`, `POST /projects/:id/liquidate`.
- [ ] **Documentacion OpenAPI Swagger:**
  - [ ] Decoradores `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth` y `@ApiProperty` para pruebas interactivas en `/api/docs`.

---

## Paso 8: Gestion de Archivos Seguros y Pipeline de Optimizacion Sharp

Subida y almacenamiento de comprobantes, compresion automatica de fotos tomadas en obra y entrega segura autenticada segun roles.

### Tareas:
- [ ] **Modulo de Documentos (`src/modules/documents`):**
  - [ ] Interceptor multipart con `Multer` para subida de comprobantes y fotos de evidencia.
  - [ ] **Pipeline Sharp:**
    - Deteccion de imagenes (`image/jpeg`, `image/png`, `image/webp`).
    - Redimensionamiento proporcional a maximo 1080p (ancho maximo 1920 px).
    - Conversion a formato `.webp` con calidad 80%.
    - Generacion de nombre unico UUID.
  - [ ] Validacion de documentos PDF (cabecera MIME `application/pdf`, tamano maximo 15 MB).
  - [ ] Registro en tabla `DocumentAttachment` vinculando la entidad correspondiente (`purchaseId`, `transferId`, `movementId`, `custodyId`) con marca `isConfidential`.
  - [ ] **Descarga Segura y Confidencialidad:**
    - Endpoint `GET /documents/:id/download`.
    - Verificacion de permisos: si `isConfidential == true` (facturas de compra), acceso exclusivo a usuarios con rol `ADMIN`.
    - Emision en streaming de archivo protegido.
  - [ ] Endpoints: `POST /documents/upload`, `GET /documents/:id/download`.
- [ ] **Documentacion OpenAPI Swagger:**
  - [ ] Decoradores `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth` y `@ApiProperty` para pruebas interactivas en `/api/docs`.

---

## Paso 9: Mantenimiento, Backups Diarios y Hardening Final

Respaldo automatico de la base de datos PostgreSQL, verificacion de salud del sistema y preparacion para produccion.

### Tareas:
- [ ] **Modulo de Administracion y Respaldos (`src/modules/admin`):**
  - [ ] Generador de volcados de base de datos con `pg_dump` y compresion en archivo `.tar.gz`.
  - [ ] Tarea programada (Cron a las 02:00 UTC) para generacion automatica y purga de copias con mas de 7 dias de antiguedad.
  - [ ] Descarga en 1 clic desde endpoint administrativo con autorizacion `ADMIN`.
  - [ ] Endpoints: `GET /admin/backups`, `POST /admin/backups/generate`, `GET /admin/backups/:id/download`.
- [ ] **Monitoreo y Salud (`Terminus / Health`):**
  - [ ] Endpoint `GET /health` con verificacion de conexion activa a PostgreSQL y espacio en disco para uploads.
- [ ] **Documentacion OpenAPI Swagger:**
  - [ ] Decoradores `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth` y `@ApiProperty` para pruebas interactivas en `/api/docs`.
- [ ] **Suite de Pruebas Automatizadas:**
  - [ ] Pruebas unitarias completas de los servicios core (WAC, Two-Phase Transfer, Tool Custody, Gap Analysis).
  - [ ] Pruebas E2E de flujos criticos de negocio con Supertest y Vitest.
