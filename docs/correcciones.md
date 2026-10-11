# Guia de Correcciones y Plan de Trabajo Cruzado: SPA-ALMACEN-ERP

Este documento centraliza las tareas pendientes, adaptaciones operativas y nuevas funcionalidades surgidas de las reuniones de coordinacion para el sistema **SPA-ALMACEN-ERP**.

Este archivo esta disenado para compartirse entre los repositorios de **Frontend** (`spa-almacen-frontend`) y **Backend** (`spa-almacen-backend`). Los agentes de IA y desarrolladores deben marcar con una `[x]` las tareas completadas y consultar este documento para mantener la continuidad del desarrollo.

---

## 1. Convenciones y Reglas de Coordinacion

1. **Estado de tareas**:
   - `[ ]` Tarea pendiente de desarrollo o verificacion.
   - `[x]` Tarea implementada, probada y validada en su respectivo entorno.
2. **Convenciones de codigo**:
   - Comentarios y textos tecnicos en espanol, directos, sin tildes y sin emojis.
   - Frontend: Angular 22 standalone, reactividad con Signals (`signal`, `computed`, `effect`, `model`), Tailwind CSS, controles tactiles de minimo 48px y aislamiento RBAC financiero mediante `*appHasRole="'ADMIN'"`.
   - Backend: NestJS 12 en ESM puro (imports relativos obligatorios con `.js`), Prisma ORM v6 sobre PostgreSQL 16, precision `DECIMAL(12, 4)` en existencias y `DECIMAL(14, 4)` en importes monetarios, optimizacion WebP con Sharp.
3. **Verificacion obligatoria**:
   - Toda implementacion debe compilar limpiamente (`npm run build`) y superar su suite de pruebas unitarias (`npm run test` con Vitest en frontend o Jest en backend) antes de marcarse como completada.

---

## 2. Orden Cronologico y Dependencias de Implementacion

Para garantizar que ningun agente quede bloqueado por falta de endpoints o modelos, se establece el siguiente orden secuencial de desarrollo:

```
[FASE 0: Frontend Autonomo]
  ├── Renombrar Demanda S10 a Presupuesto Programado
  ├── Servicio Global de Exportacion a Excel en Tablas Visibles
  ├── Operacion Total del Almacenero en Movil y Escritorio (Multiplataforma)
  └── [DESCARTADO] Rediseño de Vales PDF en Blanco y Negro (Se conserva en azul)

[FASE 1: Modelado de Datos y Core de Negocio (Backend)]
  ├── Modificar Prisma Schema (Supplier, Purchase, Item, ItemType)
  ├── Ejecutar Migraciones de Base de Datos
  ├── Actualizar DTOs y Validadores
  └── Ajustar Algoritmo de Costo Promedio Ponderado (CPP) para compras sin IGV

[FASE 2: Integracion de Catalogos, Proveedores y Compras (Frontend)]
  ├── Integrar Categoria Maquinaria, Equipos y Herramientas en Catalogo
  ├── Checkbox y Filtros de Insumos Perecibles
  ├── Observaciones en Modales y Listas de Proveedores
  └── Selector de Compras Con/Sin IGV y Recalculo Dinamico

[FASE 3: Infraestructura Multimedia y Carga Multiple (Backend -> Frontend)]
  ├── Endpoint de Subida Multiple (POST /documents/upload-multiple en Backend)
  ├── Evolucion de UiDropzone a Soporte Multiple (File[] en Frontend)
  └── Integracion de Carga Multiple en Compras, Mermas y Custodias

[FASE 4: Custodia de Herramientas y Modulo de Maquinaria (Backend -> Frontend)]
  ├── Soporte de Fotos de Entrega Inicial en Custodia de Herramientas
  ├── Modelo y Endpoints para Control de Jornada de Maquinaria y Horometros
  └── Interfaces de Captura de Horometro y Fotos en Movil y Escritorio

[FASE 5: Metricas y Dashboard Analitico (Backend -> Frontend)]
  ├── Endpoint de Calculo de Inversion Patrimonial en Herramientas (Backend)
  ├── Tarjeta KPI de Inversion en Herramientas en Dashboard (Frontend)
  └── Alertas de Materiales Perecibles Proximos a Caducar
```

---

## 3. Tareas Detalladas para Frontend (`spa-almacen-frontend`)

### Fase 0: Ajustes Autonomos de UI y Exportacion

- [x] **Renombrado terminologico a Presupuesto Programado**:
  - [x] En `src/app/features/proyectos-s10/proyectos-s10.component.html`:
    - Reemplazar todas las etiquetas `Demanda S10` por `Presupuesto Programado` (tarjetas superiores, cabeceras de tabla, modal de reserva y vista responsiva movil).
    - Actualizar textos de ayuda y descripciones contextuales.
  - [x] En la generacion de Excel del proyecto S10 (`gap-analysis-excel.service.ts`):
    - Renombrar la columna `Demanda S10` a `Presupuesto Programado`.

- [x] **[DESCARTADO] Optimizacion de Vales de Prestamo PDF para Ahorro de Tinta**:
  - *Decision tomada*: Se descarta modificar la paleta a escala de grises. Se mantiene el diseno actual con azul corporativo para que los vales luzcan presentables al compartirse digitalmente por WhatsApp; en obra, las impresiones fisicas se realizan en blanco y negro directamente mediante la configuracion de la impresora.

- [x] **Servicio Centralizado de Exportacion a Excel (`ExcelExportService`)**:
  - [x] Crear `src/app/core/services/excel-export.service.ts`:
    - Metodo generico `exportToExcel(options: ExcelExportOptions): Promise<void>`.
    - Configuracion con `exceljs`: titulo de reporte, metadatos, cabeceras con fondo corporativo sobrio, autofit de columnas y formatos de fecha/moneda.
  - [x] Agregar boton `Exportar a Excel` con icono Lucide en las barras de herramientas de:
    - [x] Catalogo Maestro de Insumos (`/catalogo`).
    - [x] Registro de Facturas de Compra (`/compras`).
    - [x] Kardex General y Movimientos (`/kardex`).
    - [x] Transferencias y Despachos (`/transferencias`).
    - [x] Custodia de Herramientas (`/herramientas-custodia`).

- [x] **Operacion Total del Almacenero en Movil y Escritorio (Multiplataforma)**:
  - [x] **Operacion 100% Autonoma en Telefono Movil**:
    - El almacenero (`WAREHOUSE_KEEPER`) dispone de acceso total y directo a sus actividades operativas desde su smartphone:
      - Recepcion conforme de traslados y registro de mermas (`/movil/recepcion`).
      - Despacho y salida diaria de consumos a cuadrillas (`/movil/consumo`).
      - Prestamo y devolucion calificada de herramientas y equipos (`/movil/herramientas`).
      - Consulta rapida de existencias y disponibles en su obra (`/movil/stock`).
      - Accesos integrados directos a transferencias, kardex y catalogo en `movil-operaciones.component.html`.
  - [x] **Acceso y Soporte en Computadora de Escritorio (PC)**:
    - Login condicional responsivo segun resolucion en `login.component.ts` (`>= 1024px` a `/dashboard`, smartphone a `/movil/operaciones`).
    - Conmutador rapido "Modo Caseta Movil" en el topbar y sidebar de `admin-layout`.
    - Conmutador rapido "Modo Escritorio" en el header de `mobile-layout`.

### Fase 2: Catalogos, Proveedores y Compras con/sin IGV

- [x] **Clasificacion de Insumos: Maquinarias, Equipos y Herramientas**:
  - [x] En `src/app/core/models/item.models.ts`:
    - Actualizar `ItemType` a `'CONSUMABLE' | 'TOOL' | 'EQUIPMENT' | 'MACHINERY'` (o segun contrato acordado con backend).
  - [x] En modal de nuevo insumo (`src/app/features/catalogo/components/item-form-modal/`):
    - Selector con las 4 categorias bien diferenciadas.
  - [x] En tabla de catalogo (`catalogo.component.html`):
    - Filtro por tipo de item ampliado.
    - Chips/badges semanticos con colores especificos (naranja para maquinaria, azul para equipos, cian para herramientas, verde para consumibles).

- [x] **Insumos Perecibles en Catalogo**:
  - [x] En `src/app/core/models/item.models.ts`:
    - Agregar campo `isPerishable?: boolean` a la interfaz `Item` y `CreateItemDto`.
  - [x] En modal de item:
    - Checkbox o toggle `Material Perecible (Sujeto a caducidad)`.
  - [x] En tabla de catalogo:
    - Columna indicativa o badge `Perecible` / `No Perecible`.

- [x] **Observaciones en Registro de Proveedores**:
  - [x] En `src/app/core/models/supplier.models.ts`:
    - Anadir `notes?: string | null` en `Supplier`, `CreateSupplierDto` y `UpdateSupplierDto`.
  - [x] En modal de nuevo proveedor (`supplier-modal.component.ts`):
    - Agregar campo `textarea` de observaciones ("Nivel de cumplimiento, puntualidad o incidentes").
  - [x] En modal de seleccion y detalle (`supplier-list-modal.component.ts`):
    - Mostrar las observaciones registradas del proveedor.

- [x] **Compras con Opcion Sin IGV (Exoneradas / Comprobantes Simples)**:
  - [x] En `src/app/core/models/purchase.models.ts`:
    - Agregar `hasIgv?: boolean` a `CreatePurchaseDto` y `Purchase`.
  - [x] En formulario de compras (`purchase-form.component.ts`):
    - Switch o selector: `Comprobante con IGV (18%)` vs `Compra sin IGV / Exonerada (0%)`.
    - Logica reactiva: si `hasIgv === false`, fijar `igvAmountPEN = 0` y `totalAmountPEN = subtotalPEN`.
    - Si `hasIgv === true`, calcular `igvAmountPEN = Math.round(subtotalPEN * 0.18 * 100) / 100`.
    - Actualizar el panel de Liquidacion Tributaria y tabla de facturas con indicador visual `Con IGV` / `Sin IGV`.

### Fase 3: Componente de Carga Multiple de Archivos

- [x] **Evolucion de `UiDropzoneComponent` a Carga Multiple**:
  - [x] En `src/app/shared/components/ui-dropzone/ui-dropzone.component.ts`:
    - Agregar input `multiple = input<boolean>(false)`.
    - Modelo reactivo `files = model<File[]>([])`.
    - Soporte para `<input type="file" multiple>` y captura secuencial con camara.
    - Cuadricula/carrusel de miniaturas para previsualizar los archivos seleccionados.
    - Boton individual para eliminar archivos de la lista antes de guardar.
  - [x] Actualizar `PurchaseFormComponent`:
    - Permitir adjuntar varios comprobantes (Factura PDF + Guia de Remision JPG + Voucher de Pago).
  - [x] Actualizar modal de devolucion de herramientas y salidas por merma para admitir multiples fotos de evidencia.

### Fase 4: Custodia de Herramientas y Modulo de Maquinaria

- [ ] **Fotografias al Despachar Prestamos de Herramientas y Equipos**:
  - [ ] En `src/app/features/herramientas/components/custody-dispatch-modal/`:
    - Incorporar `ui-dropzone` con activacion de camara para tomar foto del estado fisico inicial, serie y accesorios antes de entregar.
    - Enviar las fotos asociadas al `custodyId` tras la creacion del vale.
  - [ ] En vista de detalle de custodia (`custody-detail-modal.component.ts`):
    - Mostrar seccion comparativa: "Evidencia de Entrega" vs "Evidencia de Devolucion".

- [ ] **Control de Turnos y Horometros de Maquinaria**:
  - [ ] Crear interfaces y servicio `MachineryService` para consulta y registro de turnos.
  - [ ] En la vista movil (`/movil/herramientas` o nueva subvista `/movil/maquinaria`):
    - Flujo de apertura de jornada: captura de foto del horometro inicial y valor numerico.
    - Flujo de cierre de jornada: captura de foto del horometro final, calculo de horas consumidas y foto de combustible (opcional).

### Fase 5: Dashboard y Alertas Analiticas

- [ ] **Inversion Patrimonial en Herramientas en el Dashboard**:
  - [ ] En `src/app/core/models/dashboard.models.ts`:
    - Agregar `toolsInvestmentPEN?: number | null` a `DashboardMetrics`.
  - [ ] En `dashboard.component.html`:
    - Agregar tarjeta KPI o bloque analitico para "Inversion Total en Herramientas y Maquinaria" protegido con `*appHasRole="'ADMIN'"`.

- [ ] **Alertas de Insumos Perecibles en Dashboard**:
  - [ ] Agregar panel o tarjeta de alerta con los insumos proximos a caducar en los siguientes 30 dias.

---

## 4. Tareas Detalladas para Backend (`spa-almacen-backend`)

### Fase 1: Esquema de Base de Datos, Migraciones y Contratos Core

- [x] **Actualizacion del Esquema de Prisma (`schema.prisma`)**:
  - [x] **Modelo `Supplier`**:
    - Agregar campo `notes String? @db.Text` (u `observations`).
  - [x] **Modelo `Item` y Enums**:
    - Agregar campo `isPerishable Boolean @default(false)`.
    - Extender `ItemType` a `CONSUMABLE`, `TOOL`, `EQUIPMENT`, `MACHINERY` (o modelar categoria de activo correspondiente).
  - [x] **Modelo `Purchase`**:
    - Agregar campo `hasIgv Boolean @default(true)`.
    - Opcionalmente `voucherType String @default("FACTURA")`.
  - [x] **Modelo `ToolCustody` y `DocumentAttachment`**:
    - Agregar campo `proofType String?` (`DISPATCH` | `RETURN`) en `DocumentAttachment` para diferenciar fotografias de entrega y retorno.
  - [x] **Modelo de Maquinaria y Horometros (Nuevo)**:
    - Crear modelo `MachineryShiftLog`:
      - `id String @id @default(uuid())`
      - `itemId String` (referencia a `Item` tipo `MACHINERY`)
      - `warehouseId String`
      - `operatorName String`
      - `operatorDni String`
      - `startHourMeter Decimal @db.Decimal(10, 2)`
      - `endHourMeter Decimal? @db.Decimal(10, 2)`
      - `totalHours Decimal? @db.Decimal(10, 2)`
      - `startDateTime DateTime @default(now())`
      - `endDateTime DateTime?`
      - `startPhotoId String?`
      - `endPhotoId String?`
      - `fuelPhotoId String?`
      - `notes String?`
  - [x] Generar y ejecutar migracion en PostgreSQL (`prisma migrate dev --name add_corrections_fields`).

- [x] **Modulo de Proveedores (`/api/v1/suppliers`)**:
  - [x] En `CreateSupplierDto` y `UpdateSupplierDto`:
    - Agregar propiedad `notes` con validadores `@IsOptional() @IsString() @MaxLength(1000)`.
  - [x] En `SupplierService`:
    - Persistir y retornar el campo `notes` en creacion, actualizacion y listados.

- [x] **Modulo de Items y Catalogo (`/api/v1/items`)**:
  - [x] En `CreateItemDto` y `UpdateItemDto`:
    - Agregar `isPerishable` con `@IsOptional() @IsBoolean()`.
    - Actualizar validadores para el nuevo enum `ItemType`.
  - [x] En `ItemService`:
    - Filtrado por `isPerishable` y por las nuevas clasificaciones de item.

- [x] **Modulo de Compras y Motor CPP (`/api/v1/purchases`)**:
  - [x] En `CreatePurchaseDto`:
    - Agregar `hasIgv` con `@IsOptional() @IsBoolean()`.
  - [x] En `PurchaseService`:
    - Regla de calculo: si `hasIgv === false`, validar que `igvAmountPEN === 0` y `totalAmountPEN === subtotalPEN`.
    - Asegurar que el costo unitario base computable para el calculo del CPP tome el importe neto desembolsado sin deduccion de impuestos cuando no haya credito fiscal.

### Fase 3: Infraestructura de Almacenamiento y Carga Multiple

- [x] **Endpoint de Carga Multiple de Archivos (`/api/v1/documents/upload-multiple`)**:
  - [x] En `DocumentsController`:
    - Crear endpoint `POST /api/v1/documents/upload-multiple`.
    - Usar `@UseInterceptors(FilesInterceptor('files', 10, multerOptions))`.
  - [x] En `DocumentsService`:
    - Procesar cada archivo en paralelo mediante Sharp (conversion a WebP al 80%, redimension a max 1920px).
    - Persistir registros en `DocumentAttachment` vinculados a `purchaseId`, `transferId`, `movementId` o `custodyId`.
    - Retornar arreglo de `DocumentAttachment[]`.

- [x] **Filtro de Evidencias en Custodia de Herramientas**:
  - [x] En `GET /api/v1/tools/custody/:id`:
    - Incluir relacion con `documents` clasificados por `proofType` (`DISPATCH` vs `RETURN`).

### Fase 4: Modulo de Maquinaria y Horometros (`/api/v1/machinery`)

- [x] **Controlador y Servicio de Maquinaria**:
  - [x] Endpoint `POST /api/v1/machinery/shift/start`:
    - Registra apertura de jornada, operador, fecha/hora del servidor, horometro inicial y foto obligatoria.
  - [x] Endpoint `POST /api/v1/machinery/shift/:id/end`:
    - Registra cierre de jornada, horometro final (debe ser mayor o igual al inicial), foto de cierre y calculo automatico de horas de trabajo.
  - [x] Endpoint `GET /api/v1/machinery/shifts`:
    - Historial de turnos con filtros por maquinaria, fecha y almacen.

### Fase 5: Agregaciones Analiticas para el Dashboard (`/api/v1/dashboard`)

- [ ] **Calculo de Inversion Patrimonial en Herramientas**:
  - [ ] En `DashboardService.getMetrics()`:
    - Sumar existencias fisicas de items clasificados como `TOOL`, `EQUIPMENT` o `MACHINERY` multiplicadas por su costo promedio o costo historico.
    - Asignar resultado a propiedad `toolsInvestmentPEN`.
    - Asegurar que `CostMaskingInterceptor` oculte esta cifra a usuarios que no posean rol `ADMIN`.

- [ ] **Endpoint de Alertas de Caducidad de Perecibles**:
  - [ ] Endpoint `GET /api/v1/items/perishable-alerts`:
    - Retornar items marcados como `isPerishable` con existencias activas en almacenes o lotes con vencimiento proximo.

---

## 5. Espacio de Bitacora y Notas para el Agente Implementador

Utiliza este espacio para registrar decisiones de diseno, hashes de commits relevantes o aclaraciones tecnicas surgidas durante el desarrollo en cada entorno:

* **Frontend**:
  * *Fecha:* 2026-10-11
  * *Modulo intervenido:* ItemModels, UiBadge, CatalogoComponent, SupplierModal, SupplierListModal, PurchaseForm, ComprasComponent, PurchaseDetailModal, CustodyDispatchModal, MovilHerramientas
  * *Decisiones tomadas:*
    - Se amplio ItemType a CONSUMABLE, TOOL, EQUIPMENT, MACHINERY en item.models y modelos dependientes, ajustando los selectores de custodia y movil para admitir todo activo no consumible (type !== 'CONSUMABLE').
    - Se incorporo soporte nativo en UiBadgeComponent para las 4 clasificaciones con sus colores corporativos (naranja maquinaria, azul equipos, cian herramientas y verde consumibles).
    - Se integro campo isPerishable en Catalogo (modal, filtros, tabla con badge de advertencia y exportacion Excel).
    - Se anadio campo notes en registro y directorios de proveedores (modal y listado responsivo).
    - Se implemento selector reactivo Con/Sin IGV en compras con recalculo dinamico e indicadores en tablas, tarjetas y liquidacion tributaria.
    - Se subsano la inyeccion de enrutador en pruebas de movil-operaciones, logrando 100% de tests aprobados (170 pruebas unitarias) y compilacion limpia.

* **Backend**:
  * *Fecha:* 2026-10-11
  * *Modulo intervenido:* MachineryModule, MachineryController, MachineryService, StartMachineryShiftDto, EndMachineryShiftDto, MachineryShiftFilterDto
  * *Decisiones tomadas:*
    - Se creo el modulo integral de maquinaria en /api/v1/machinery con soporte de apertura de jornada (POST shift/start) validando foto obligatoria, unicidad de turno abierto y consistencia de horometro inicial contra el ultimo cierre.
    - Se implemento el cierre de jornada (POST shift/:id/end) con calculo automatico de totalHours, validacion endHourMeter >= startHourMeter, foto final obligatoria y foto opcional de combustible.
    - Se anadieron endpoints de consulta GET shifts (con filtros por operador, fecha y estado abierto/cerrado), GET shifts/:id y GET item/:itemId/status para deteccion rapida del estado operativo de cada equipo en la app movil.
    - Se agregaron items de maquinaria de prueba en seed-data.json (Retroexcavadora y Rodillo) y se documento el Modulo 12 en docs/modules/12_machinery.md.
    - Se crearon 22 pruebas unitarias en machinery.service.spec.ts, alcanzando 197 pruebas unitarias exitosas (19 suites), compilacion ESM limpia y cero errores de linter.
