# Guia de Correcciones y Plan de Trabajo Cruzado: SPA-ALMACEN-ERP

Este documento centraliza las nuevas tareas pendientes, adaptaciones operativas y funcionalidades acordadas en la reunion de revision del proyecto (2026-10-11) para el sistema **SPA-ALMACEN-ERP**.

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
[FASE 0: Ajustes Autonomos de Frontend (Sin dependencias de Backend)]
  ├── Habilitar carga de fotos en devolucion de herramientas para TODOS los estados
  ├── Integrar visualizacion y miniaturas de fotos en el historial/detalle de devoluciones
  ├── Reordenar indicadores KPI y uniformizar etiqueta "Stock en Almacen" en Proyectos S10
  └── Vincular selector global de Almacen (Topbar) con el Catalogo Maestro

[FASE 1: Modelado de Datos y Contratos Core (Backend)]
  ├── Extender enum ToolCondition con valor NEW (Nuevo) en schema.prisma
  ├── Agregar campo notes (observaciones/caducidad de lote) en Purchase y PurchaseItem
  ├── Crear modelo ItemCategory para clasificaciones personalizadas de insumos
  ├── Agregar campo s10UnitPrice en ProjectRequirement para precio de expediente S10
  └── Ejecutar migraciones de base de datos en PostgreSQL

[FASE 2: Custodias y Gestor de Clasificaciones (Backend -> Frontend)]
  ├── Validar condicion inicial NEW en despacho de herramientas (Backend y Frontend)
  ├── Endpoints CRUD para ItemCategory (/api/v1/item-categories en Backend)
  └── Modal Gestor de Clasificaciones y selector en Catalogo Maestro (Frontend)

[FASE 3: Compras por Almacen/Obra, Observaciones y Cuadro Comparativo (Backend -> Frontend)]
  ├── Permitir compras directas a cualquier Almacen/Obra activa (central o caseta) y filtrar por sede
  ├── Persistir y mostrar observaciones de compra (fechas de vencimiento por lote perecible)
  ├── Filtro de compras por producto/insumo y endpoint de Cuadro Comparativo de Precios
  └── Interfaz de Busqueda por Producto y Cuadro Comparativo de Proveedores en Compras (Frontend)

[FASE 4: Precios Historicos, Ponderados y de Expediente en Matriz S10 (Backend -> Frontend)]
  ├── Extraer precio unitario del CSV S10 en la ingesta y guardarlo en ProjectRequirement
  ├── Exponer minHistoricalUnitCost, weightedAverageCost y s10BudgetUnitPrice en Gap Analysis
  └── Incorporar las 3 columnas de precios en la tabla y exportacion Excel de Proyectos S10
```

---

## 3. Tareas Detalladas para Frontend (`spa-almacen-frontend`)

### Fase 0: Ajustes Autonomos de UI, Custodias y Proyectos S10

- [x] **Evidencia fotografica en TODOS los estados de devolucion de herramientas**:
  - [x] En `src/app/features/herramientas/components/custody-return-modal/custody-return-modal.component.ts`:
    - Eliminar la condicional `@if (isDamageOrLost())` que oculta el bloque de `ui-dropzone` para permitir adjuntar hasta 10 fotografias tanto en `OPERATIVE`, `DAMAGED_USABLE` (Desgaste Normal) y `MAINTENANCE_REQUIRED` como en `DAMAGED_UNUSABLE` y `LOST`.
    - Mantener la validacion obligatoria de foto/sustento unicamente cuando el estado sea `DAMAGED_UNUSABLE` o `LOST`, siendo opcional en los demas estados.
  - [x] En `src/app/features/movil/movil-herramientas.component.html` y `.ts`:
    - Mostrar el `ui-dropzone` de evidencia fotografica para todos los estados de retorno en la vista movil.

- [x] **Visualizacion de fotos adjuntas en el historial y detalle de devoluciones**:
  - [x] En `src/app/features/herramientas/herramientas-custodia.component.ts`:
    - En `openDetailModal(custody: ToolCustody)`, invocar `this.custodyService.getCustodyById(custody.id)` para obtener la entidad completa con su arreglo `documents` (clasificados por `proofType`: `DISPATCH` y `RETURN`) y actualizar `selectedCustody`.
  - [x] En `src/app/features/herramientas/components/custody-detail-modal/custody-detail-modal.component.ts`:
    - Incorporar previsualizacion visual (miniaturas de imagen / lightbox o vista previa mediante blob URL) ademas del boton de descarga para las evidencias de entrega inicial (`DISPATCH`) y de devolucion (`RETURN`).

- [x] **Reordenamiento de indicadores KPI y etiqueta "Stock en Almacen" en Proyectos S10**:
  - [x] En `src/app/features/proyectos-s10/proyectos-s10.component.html`:
    - Reordenar las 4 tarjetas KPI superiores de la Matriz de Brechas para que sigan el flujo logico de lectura:
      1. `Partidas`
      2. `Presupuesto Programado`
      3. `Stock en Almacen` (porcentaje y barra de abastecimiento)
      4. `Deficit Pendiente` (partidas con brecha)
    - Cambiar la etiqueta `Cumplimiento Global:` en la cinta informativa del proyecto activo por `Stock en Almacen:` y la columna `Cumplimiento` de la tabla por `Stock en Almacen`.

- [x] **Sincronizacion del Selector Global de Almacen (Topbar) con Catalogo Maestro**:
  - [x] En `src/app/features/catalogo/catalogo.component.ts` y `.html`:
    - Inyectar `WarehouseContextService` y reaccionar a `activeWarehouseId`.
    - Cuando se seleccione un almacen/obra especifico en el topbar (`activeWarehouseId() !== 'ALL'`), mostrar el stock disponible y costo promedio especifico de esa sede/obra (o filtrar los insumos con presencia en dicho almacen), manteniendo las columnas de Stock Central y Stock en Obras cuando este seleccionado `[ Consolidado General (Todos) ]`.

### Fase 2: Condicion Inicial de Herramientas y Gestor de Clasificaciones

- [x] **Tres niveles de Condicion Inicial en Prestamos de Herramientas (`NEW`, `OPERATIVE`, `DAMAGED_USABLE`)**:
  - [x] En `src/app/core/models/tool-custody.models.ts`:
    - Extender el tipo `ToolCondition` a `'NEW' | 'OPERATIVE' | 'DAMAGED_USABLE' | 'DAMAGED_UNUSABLE' | 'MAINTENANCE_REQUIRED' | 'LOST'`.
  - [x] En `src/app/features/herramientas/components/custody-dispatch-modal/custody-dispatch-modal.component.ts` y `src/app/features/movil/movil-herramientas.component.html`:
    - Actualizar el selector de Condicion Inicial para ofrecer las 3 opciones acordadas:
      - `NEW` -> `NUEVO`
      - `OPERATIVE` -> `OPERATIVO`
      - `DAMAGED_USABLE` -> `DESGASTE NORMAL`
  - [x] En `herramientas-custodia.component.ts`, `custody-detail-modal.component.ts` y `tool-custody-pdf.service.ts`:
    - Agregar la traduccion `'NEW' -> 'NUEVO'` en `translateCondition()`.

- [x] **Gestor de Clasificaciones Personalizadas en Catalogo (`ItemCategory`)**:
  - [x] En `src/app/core/models/item.models.ts`:
    - Definir la interfaz `ItemCategory` (`id`, `name`, `code`, `description`, `isActive`) y agregar `categoryId?: string | null` y `category?: ItemCategory | null` al modelo `Item`, `CreateItemDto`, `UpdateItemDto` e `ItemFilterDto`.
  - [x] Crear servicio o metodos en `ItemService` para consumir el CRUD `/api/v1/item-categories`.
  - [x] En `src/app/features/catalogo/catalogo.component.ts` y `.html`:
    - Agregar boton **"Clasificaciones"** en la barra de herramientas del Catalogo que abra un modal gestor para listar, crear, editar y eliminar clasificaciones personalizadas (ej. "Arrendamiento", "Agregados", "Electricos", "Pinturas").
    - En el modal de creacion/edicion de insumo, permitir seleccionar la clasificacion personalizada (`categoryId`) ademas del tipo operativo base (`CONSUMABLE`, `TOOL`, `EQUIPMENT`, `MACHINERY`).
    - Agregar filtro por columna y visualizacion de la clasificacion en la tabla del catalogo.

### Fase 3: Compras por Almacen/Obra, Observaciones y Cuadro Comparativo de Precios

- [x] **Seleccion de Almacen / Obra de Destino en Compras y Filtro Global por Sede**:
  - [x] En `src/app/core/models/purchase.models.ts`:
    - Incluir `warehouse?: { id: string; name: string; type: string }` en `Purchase` y permitir `warehouseId?: string` en `PurchaseFilterDto`.
  - [x] En `src/app/features/compras/components/purchase-form/purchase-form.component.ts`:
    - Reemplazar el destino fijo "Almacen Central" por un selector de **Almacen / Obra de Destino** precargado con el almacen activo del topbar (o Almacen Central por defecto), permitiendo que las compras de provincias/obras (ej. Chepen, Pacasmayo, Trujillo) ingresen directamente al stock de su respectivo almacen de obra.
  - [x] En `src/app/features/compras/compras.component.ts` y `.html`:
    - Vincular `WarehouseContextService.activeWarehouseId` para filtrar automaticamente las facturas de compra pertenecientes al almacen/obra seleccionado en el topbar (o mostrar todas cuando sea `'ALL'`), agregando la columna `Almacen / Obra` en la tabla de compras.

- [x] **Observaciones en Compras para Fecha de Caducidad por Lote de Perecibles**:
  - [x] En `src/app/core/models/purchase.models.ts`:
    - Agregar `notes?: string | null` a `Purchase`, `CreatePurchaseDto`, `PurchaseItem` y `CreatePurchaseItemDto`.
  - [x] En `src/app/features/compras/components/purchase-form/purchase-form.component.ts`:
    - Agregar campo de **Observaciones de la Compra** (y/o nota por linea cuando el insumo sea `isPerishable === true`) con texto de ayuda explicito para registrar fechas de vencimiento o lotes (ej. `"Lote cemento/pintura vence: 15/12/2026"`).
  - [x] En `src/app/features/compras/components/purchase-detail-modal/purchase-detail-modal.component.ts`:
    - Mostrar de forma destacada las observaciones registradas en la compra y por cada linea de insumo.

- [x] **Busqueda de Compras por Producto y Cuadro Comparativo de Precios de Proveedores**:
  - [x] En `src/app/features/compras/compras.component.ts` y `.html`:
    - Habilitar filtro por insumo/producto (busqueda por nombre o SKU de material, ej. "cemento", "tuberia") enviando `itemSearch` o `itemId` al backend para listar todas las compras donde se adquirio dicho producto.
    - Agregar pestaña o modal **"Cuadro Comparativo de Precios"** donde el administrador pueda seleccionar o buscar un insumo y visualizar:
      - Tarjetas de resumen: **Precio Minimo Historico** (con nombre del proveedor y fecha), **Precio Promedio Ponderado (CPP)** y **Precio Maximo Registrado**.
      - Tabla comparativa de proveedores que han vendido ese insumo (Proveedor, RUC, Factura, Fecha, Almacen/Obra, Cantidad Comprada, Precio Unitario Base en Soles, Estado IGV y Observaciones/Lote), ordenada de menor a mayor precio unitario.
      - Boton de exportacion a Excel del cuadro comparativo.

### Fase 4: Precios Historicos, Ponderados y de Expediente en Matriz S10

- [ ] **Incorporacion de 3 Columnas de Precios en la Matriz de Brechas S10**:
  - [ ] En `src/app/core/models/project.models.ts`:
    - Extender `GapAnalysisItem` con:
      - `minHistoricalUnitCost?: number | string | null` (Precio menor de compra historica)
      - `weightedAverageCost?: number | string | null` (Precio ponderado CPP actual)
      - `s10BudgetUnitPrice?: number | string | null` (Precio del expediente S10)
  - [ ] En `src/app/features/proyectos-s10/proyectos-s10.component.html` y `.ts`:
    - Agregar las 3 nuevas columnas en la tabla de Matriz de Brechas (`Precio Menor Compra`, `Precio Ponderado (CPP)` y `Precio Expediente S10`), con soporte de ordenamiento (`ui-sort-header`), formato monetario `S/ 1.2-4` y visualizacion en tarjetas moviles.
    - Asegurar que la exportacion a Excel de la Matriz de Brechas incluya las 3 columnas de precios para facilitar la negociacion con proveedores.

---

## 4. Tareas Detalladas para Backend (`spa-almacen-backend`)

### Fase 1: Esquema de Base de Datos y Migraciones (`schema.prisma`)

- [x] **Actualizacion de Modelos en `prisma/schema.prisma`**:
  - [x] **Enum `ToolCondition`**:
    - Agregar el valor `NEW` al inicio del enum (`NEW`, `OPERATIVE`, `DAMAGED_USABLE`, `DAMAGED_UNUSABLE`, `MAINTENANCE_REQUIRED`, `LOST`).
  - [x] **Modelo `Purchase` y `PurchaseItem`**:
    - Agregar `notes String? @db.Text` en `Purchase` (observaciones generales de la factura/lotes).
    - Agregar `notes String? @db.Text` en `PurchaseItem` (observacion especifica por linea, ej. fecha de caducidad del lote de insumo perecible).
  - [x] **Nuevo Modelo `ItemCategory` (Clasificaciones Personalizadas)**:
    - Crear tabla `ItemCategory`:
      - `id String @id @default(uuid())`
      - `name String @unique` (ej. "Arrendamiento", "Agregados", "Material Electrico")
      - `description String?`
      - `isActive Boolean @default(true)`
      - `createdAt DateTime @default(now())`
      - `updatedAt DateTime @updatedAt`
    - En modelo `Item`: agregar `categoryId String?` y relacion opcional `category ItemCategory? @relation(fields: [categoryId], references: [id])`.
  - [x] **Modelo `ProjectRequirement` (Precio de Expediente S10)**:
    - Agregar campo `s10UnitPrice Decimal? @db.Decimal(14, 4)` para conservar el costo unitario programado en el expediente del S10.
  - [x] Generar y aplicar migracion (`npx prisma migrate dev --name add_meeting_corrections_v2`).

### Fase 2: Custodias y Endpoints de Clasificaciones

- [x] **Modulo de Custodia de Herramientas (`/api/v1/tools/custody`)**:
  - [x] En `DispatchToolCustodyDto`: permitir `ToolCondition.NEW` en `conditionOnDispatch`.
  - [x] En `GET /api/v1/tools/custody` (listado paginado) y `GET /api/v1/tools/custody/:id`: asegurar que la relacion `documents` sea devuelta con `proofType` (`DISPATCH` y `RETURN`) para que el historial de devoluciones muestre inmediatamente todas las fotografias adjuntas.

- [x] **Modulo de Clasificaciones de Insumos (`/api/v1/item-categories` e `/api/v1/items`)**:
  - [x] Crear controlador y servicio (o subruta en `ItemsModule`) con endpoints:
    - `GET /api/v1/item-categories`: listar clasificaciones activas.
    - `POST /api/v1/item-categories`: crear nueva clasificacion (solo `ADMIN`).
    - `PATCH /api/v1/item-categories/:id`: actualizar nombre/descripcion/estado (solo `ADMIN`).
    - `DELETE /api/v1/item-categories/:id`: eliminar o desactivar si no tiene items asociados (solo `ADMIN`).
  - [x] En `CreateItemDto`, `UpdateItemDto` e `ItemFilterDto`: aceptar `categoryId` opcional e incluir `category` en las respuestas de `ItemsService`.

### Fase 3: Compras Multi-Almacen, Observaciones y Cuadro Comparativo

- [x] **Evolucion del Modulo de Compras (`/api/v1/purchases`)**:
  - [x] **Compras directas a Almacenes de Obra**:
    - En `PurchaseService.createPurchase()`: permitir que `centralWarehouseId` (o alias `warehouseId`) acepte tanto el Almacen Central (`CENTRAL`) como cualquier Almacen de Obra (`PROJECT_SITE`) activo, incrementando el stock fisico y recalculando el CPP en ese almacen de destino.
    - Incluir los datos de `warehouse` (`id`, `name`, `type`) en las respuestas de listado y detalle de compras.
  - [x] **Persistencia de Observaciones (`notes`)**:
    - En `CreatePurchaseDto` y `CreatePurchaseItemDto`: agregar `@IsOptional() @IsString() @MaxLength(1000) notes?: string`.
    - Guardar `notes` en la cabecera `Purchase` y en el detalle `PurchaseItem`.
  - [x] **Filtros por Almacen y por Producto en `GET /api/v1/purchases`**:
    - En `PurchaseFilterDto`: agregar `warehouseId?: string`, `itemId?: string` e `itemSearch?: string`.
    - Filtrar las compras por `centralWarehouseId = warehouseId` cuando se indique, y por coincidencia en `details.some(d => d.itemId === itemId || d.item.name.contains(itemSearch) || d.item.sku.contains(itemSearch))`.
  - [x] **Endpoint de Cuadro Comparativo de Precios (`GET /api/v1/purchases/price-comparison`)**:
    - Recibir query params `itemId` (o `search` / `warehouseId`).
    - Retornar para el insumo consultado:
      - Datos del insumo (`id`, `sku`, `name`, `baseUnit`, `type`).
      - Resumen estadistico: `minUnitCostPEN`, `maxUnitCostPEN`, `currentWeightedAverageCostPEN`, `bestSupplierName`, `bestSupplierTaxId`, `totalPurchasesCount`.
      - Arreglo `entries` con cada compra historica del insumo (fecha, serie de factura, proveedor, RUC, almacen destino, cantidad comprada, unidad, costo unitario base PEN, indicador `hasIgv` y observaciones `notes`), ordenado por `unitCostBasePEN ASC`.
    - Registrar las nuevas claves financieras en `CostMaskingInterceptor` para mantener la seguridad RBAC.

### Fase 4: Precios en Ingesta S10 y Matriz de Brechas (`/api/v1/projects`)

- [x] **Ingesta de Precio de Expediente S10 y Enriquecimiento de Gap Analysis**:
  - [x] En `IngestS10ResourceItemDto` y en el parser CSV de `ProjectsService.importS10File()`:
    - Detectar y extraer la columna de precio unitario del archivo CSV/TXT exportado de S10 (`unitPrice` / `price` / `precio`) y persistirla en `ProjectRequirement.s10UnitPrice`.
  - [x] En `ProjectsService.getGapAnalysis(projectId)`:
    - Para cada insumo requerido en el proyecto, calcular y retornar en cada fila de `analysis`:
      - `minHistoricalUnitCost`: el menor `unitCostBasePEN` registrado en `PurchaseItem` para ese `itemId` (o `null` si nunca se ha comprado).
      - `weightedAverageCost`: el `averageCost` vigente del insumo (en el almacen de la obra o en el Almacen Central como referencia).
      - `s10BudgetUnitPrice`: el valor de `s10UnitPrice` almacenado en `ProjectRequirement` (o `null` si el CSV no incluia precio).
  - [x] Agregar `minHistoricalUnitCost`, `weightedAverageCost` y `s10BudgetUnitPrice` a `FINANCIAL_KEYS` en `CostMaskingInterceptor`.

---

## 5. Exclusiones Acordadas con el Cliente (Fuera de Alcance)

Para evitar desviaciones de alcance, queda documentado que los siguientes puntos discutidos en la llamada **NO deben implementarse**:

1. **Modulo e Historial de Mantenimientos de Maquinaria y Herramientas (`00:59:02 - 01:01:44`)**: Excluido por acuerdo mutuo al constituir un modulo independiente fuera del presupuesto cotizado. Solo se mantiene el estado `MAINTENANCE_REQUIRED` al devolver una herramienta.
2. **Fechas de caducidad por lote en el Catalogo Maestro (`00:03:53 - 00:08:50`)**: El Catalogo Maestro conserva unicamente el indicador booleano `isPerishable`. Las fechas de vencimiento de lotes especificos se registran en las observaciones de cada compra.
3. **Modulos de Personal de Obra y Subcontratas (`01:09:32 - 01:13:18`)**: Pospuestos para evaluarse como un proyecto/modulo separado una vez finalizado y puesto en produccion el sistema de almacen.

---

## 6. Espacio de Bitacora y Notas para el Agente Implementador

Utiliza este espacio para registrar decisiones de diseno, hashes de commits relevantes o aclaraciones tecnicas surgidas durante el desarrollo de este nuevo ciclo de correcciones:

* **Frontend**:
  * *(Pendiente de inicio)*

* **Backend**:
  * **2026-10-18 (Fase 1 - Modelado de Datos y Migraciones)**:
    - Actualizado `schema.prisma`:
      - Enum `ToolCondition`: Agregado valor `NEW` al inicio.
      - Modelo `ItemCategory`: Creada entidad para clasificaciones personalizadas (`name`, `code`, `description`, `isActive`) y vinculada opcionalmente a `Item` (`categoryId`, `category`).
      - Modelo `ProjectRequirement`: Agregado campo `s10UnitPrice Decimal? @db.Decimal(14, 4)`.
      - Modelos `Purchase` y `PurchaseDetail`: Agregados campos `notes String? @db.Text` para observaciones y fechas de vencimiento. En `Purchase` se agrego tambien `warehouseId String?` vinculado a `Warehouse` para soportar compras directas a almacenes de obra.
    - Actualizado `seed.ts` para limpiar `itemCategory` conservando la idempotencia.
    - Generada y aplicada migracion en PostgreSQL: `20261018061033_add_meeting_corrections_v2`.
    - Cliente de Prisma regenerado, compilacion NestJS (`npm run build`) y 208 pruebas unitarias (`vitest run`) ejecutadas exitosamente.
  * **2026-10-18 (Fase 2 - Custodias y Endpoints de Clasificaciones)**:
    - En modulo `tool-custody`:
      - `DispatchToolCustodyDto`: Validado `conditionOnDispatch` para aceptar `ToolCondition.NEW`, `OPERATIVE` y `DAMAGED_USABLE`.
      - `ToolCustodyService.findAll()`: Incluida coleccion `documents` clasificada en `dispatchDocuments` y `returnDocuments` en el listado paginado.
      - `ToolCustodyService.processReturn()`: Incluido `ToolCondition.NEW` dentro de las calificaciones de retorno conforme (`CONFORMING_RETURN`).
    - En modulo `items`:
      - Creados `CreateItemCategoryDto` y `UpdateItemCategoryDto`.
      - Implementado `ItemCategoriesController` (`/api/v1/item-categories`) con endpoints de listado (`GET`), creacion (`POST`), edicion (`PATCH`) y eliminacion/desactivacion (`DELETE`) protegido por roles `ADMIN`.
      - Agregados metodos de servicio `findAllCategories()`, `createCategory()`, `updateCategory()` y `removeCategory()` en `ItemsService`.
      - Enriquecidos `CreateItemDto`, `UpdateItemDto` e `ItemFilterDto` con `categoryId` opcional, e incorporada la relacion `category` en respuestas de `findAll()`, `findOne()`, `create()` y `update()`.
    - Agregadas pruebas unitarias y ejecutada suite completa: 216 pruebas unitarias exitosas y compilacion limpia.
  * **2026-10-18 (Fase 3 - Compras Multi-Almacen, Observaciones y Cuadro Comparativo)**:
    - En modulo `purchases`:
      - Actualizado `CreatePurchaseDto` permitiendo `warehouseId` (o `centralWarehouseId`) para compras directas a almacenes de obra `PROJECT_SITE` o `CENTRAL`, y anadido campo `notes` (max 1000).
      - Actualizado `PurchaseItemDto` anadiendo campo `notes` por linea para lotes o vencimiento de perecibles.
      - Actualizado `PurchaseFilterDto` con `warehouseId`, `itemId` e `itemSearch`.
      - Implementado endpoint `GET /api/v1/purchases/price-comparison` con `PriceComparisonQueryDto` que calcula metricas estadisticas y tabla comparativa de compras ordenadas por menor precio unitario (`unitCostBasePEN ASC`).
      - Actualizado `PurchasesService`: persistencia de `warehouseId` y `notes` en `Purchase` y `PurchaseDetail`, recalculo de CPP en almacen de destino y filtros avanzados en `findAll()`.
    - Actualizado `CostMaskingInterceptor` protegiendo `minUnitCostPEN`, `maxUnitCostPEN`, `currentWeightedAverageCostPEN` y `newWarehouseAverageCost`.
    - Actualizado `seed.ts` y `seed-data.json` con `warehouseId` en todas las compras y ejecutado `prisma db seed`.
    - 220 pruebas unitarias pasando al 100% y compilacion limpia.
  * **2026-10-18 (Fase 4 - Precios en Ingesta S10 y Matriz de Brechas)**:
    - En modulo `projects`:
      - `S10ResourceItemDto`: Agregados `unitPrice` y `s10UnitPrice` opcionales con validadores numericos no negativos.
      - `S10ParserService`: Extraccion automatica de precios unitarios desde columnas `precio`, `precio_unitario`, `preciounitario`, `pu`, `p.u.`, `price`, `unitprice`, `unit_price`, `s10unitprice` o `costo_unitario` en `parseS10Buffer`.
      - `ProjectsService.ingestS10`: Acumulacion de `baseQty` y normalizacion de `s10UnitPrice` (dividiendo entre `conversionFactor` cuando aplique) y persistencia en `ProjectRequirement.s10UnitPrice` tanto en creacion como en actualizacion.
      - `ProjectsService.getGapAnalysis`: Incorporadas las 3 columnas de precios requeridas: `minHistoricalUnitCost` (menor costo base PEN registrado en `PurchaseDetail`), `weightedAverageCost` (CPP vigente en almacen de obra o referencia central) y `s10BudgetUnitPrice` (precio de expediente almacenado en `ProjectRequirement`).
      - `ProjectsController`: Aplicado `@UseInterceptors(CostMaskingInterceptor)` para proteger confidencialidad ante almaceneros (`WAREHOUSE_KEEPER`).
    - En `CostMaskingInterceptor`: Agregadas `s10UnitPrice`, `minHistoricalUnitCost`, `weightedAverageCost` y `s10BudgetUnitPrice` a `FINANCIAL_KEYS`.
    - En datos de semilla: `seed.ts` y `seed-data.json` actualizados con `s10UnitPrice` en requerimientos de proyecto.
    - Documentacion sincronizada en `docs/modules/09_projects_s10.md`.
    - Pruebas unitarias incrementadas a 222 tests (100% exitosos) y compilacion limpia.
