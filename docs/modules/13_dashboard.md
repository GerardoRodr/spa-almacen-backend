# Modulo 13 - Dashboard y Analitica Corporativa (Dashboard & Analytics)

## 1. Descripcion General
Este modulo centraliza los calculos analiticos, consolidacion multi-sede y metricas criticas del sistema ERP. Entrega informacion en tiempo real para la toma de decisiones gerenciales y operativas, asegurando estricta confidencialidad financiera segun el rol del usuario autenticado.

### Reglas Clave y Metricas:
- **Separacion de Valorizacion de Stock vs Compras Activas:**
  - `inventoryValuationPEN`: Valorizacion neta total de todas las existencias activas en soles (`physicalQty > 0` e `Item.isActive = true`).
  - `suppliesValuationPEN`: Suma total de `Purchase.totalAmountPEN` correspondiente a compras activas (`isReverted = false`) con impuestos (IGV) en soles, coincidiendo exactamente con `summary.totalAmountPEN` de `GET /purchases` para la sede seleccionada o consolidado `ALL`. Sigue enmascarada por `CostMaskingInterceptor` para el rol `WAREHOUSE_KEEPER`.
  - `toolsInvestmentPEN`: Inversion patrimonial acumulada exclusivamente para bienes patrimoniales activos clasificados como `TOOL`, `EQUIPMENT` o `MACHINERY` (`Item.isActive = true`). Los consumibles (`CONSUMABLE`) y servicios (`SERVICE`) quedan excluidos de esta metrica.
  - `totalActiveSkus`: Conteo de SKUs distintos con `physicalQty > 0` e `Item.isActive = true`.
- **Exclusiones por Estado y Tipo en Consultas SQL:**
  - Las consultas SQL nativas de **valorizacion y SKUs activos** (`GET /metrics`), **comparativa de stock** (`GET /stock-comparison`) y **conteo de insumos criticos** (`GET /metrics`) filtran estrictamente `Item.isActive = true`, excluyendo items desactivados logicamente.
  - Adicionalmente, el conteo de insumos criticos (`criticalItemsCount`) excluye explicitamente items de tipo `SERVICE` (`Item.type != 'SERVICE'`).
- **Proteccion Financiera RBAC (`CostMaskingInterceptor`):**
  - Los usuarios con rol `ADMIN` y `MODERATOR` acceden a las cifras monetarias completas (`inventoryValuationPEN`, `suppliesValuationPEN`, `toolsInvestmentPEN`).
  - Los usuarios con rol `WAREHOUSE_KEEPER` reciben las respuestas con los campos monetarios completamente purgados (incluido `suppliesValuationPEN`), visualizando unicamente los volumenes fisicos, SKUs y conteos operativos.
- **Soporte Multi-Sede y Consolidado:**
  - `warehouseId = 'ALL'` (o sin parametro): Agrega las existencias y compras activas a nivel de toda la corporacion (todas las obras y almacen central).
  - `warehouseId = <UUID>`: Filtra las existencias, valorizaciones, compras activas y alertas para un frente de obra o almacen especifico.
- **Herramientas en Campo (`toolsInField`):**
  - Conteo directo de vales de custodia activos (`ToolCustody`) donde la devolucion aun esta pendiente (`returnDate === null`) y el vale no fue revertido (`isReverted === false`).
- **Alertas de Reposicion Critica (`criticalItemsCount`):**
  - Conteo calculado en motor SQL de insumos activos (`Item.isActive = true`), distintos de `SERVICE` (`Item.type != 'SERVICE'`) y con `minStockAlert > 0`, cuyo stock fisico se encuentra en o por debajo del umbral configurado (`physicalQty <= minStockAlert` para una sede especifica, o `SUM(physicalQty) <= minStockAlert` consolidado para `ALL`).

- **Ruta Base:** `/api/v1/dashboard`
- **Entidades Vinculadas:** `Stock`, `Item`, `Warehouse`, `Purchase`, `ToolCustody`, `ProjectRequirement`

---

## 2. Endpoints

### 2.1 Consultar Metricas y KPIs Analiticos (`GET /metrics`)
Retorna los indicadores de inventario, valorizacion de stock, total de compras activas con IGV (`suppliesValuationPEN`), inversion en herramientas y conteo de alertas criticas. Las consultas SQL de valorizacion y SKUs activos filtran `Item.isActive = true` y `physicalQty > 0`; `suppliesValuationPEN` agrega `SUM(Purchase.totalAmountPEN)` con `isReverted = false` (coincidente con `summary.totalAmountPEN` de `GET /purchases` para la sede o `ALL`) y es enmascarada por `CostMaskingInterceptor` para `WAREHOUSE_KEEPER`; la consulta SQL de `criticalItemsCount` filtra `Item.isActive = true`, `Item.type != 'SERVICE'` y `minStockAlert > 0`.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/dashboard/metrics`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Query Parameters (`DashboardFilterDto`)
| Parametro | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `warehouseId` | string (UUID o 'ALL') | No | Sede a consultar o 'ALL' para consolidado corporativo. Por defecto: 'ALL'. |

**Ejemplo de Peticion:**
```http
GET /api/v1/dashboard/metrics?warehouseId=ALL
Authorization: Bearer <accessToken>
```

**Ejemplo de Respuesta Exitosa (Rol ADMIN):**
```json
{
  "totalActiveSkus": 45,
  "inventoryValuationPEN": 184500.5,
  "suppliesValuationPEN": 135600.5,
  "toolsInvestmentPEN": 48900.0,
  "toolsInField": 12,
  "criticalItemsCount": 3,
  "warehouseId": "ALL",
  "warehouseName": "Consolidado General (Todas las Sedes)",
  "warehouseType": "CONSOLIDATED"
}
```

**Ejemplo de Respuesta Exitosa (Rol WAREHOUSE_KEEPER - Datos financieros purgados):**
```json
{
  "totalActiveSkus": 45,
  "toolsInField": 12,
  "criticalItemsCount": 3,
  "warehouseId": "ALL",
  "warehouseName": "Consolidado General (Todas las Sedes)",
  "warehouseType": "CONSOLIDATED"
}
```

---

### 2.2 Comparativa de Stock Central vs Obras (`GET /stock-comparison`)
Compara el volumen fisico almacenado en el Almacen Central (`Warehouse.type = 'CENTRAL'`) respecto a todos los Almacenes de Obra (`Warehouse.type != 'CENTRAL'`) para los 8 insumos activos (`Item.isActive = true`) con mayor volumen fisico total (`HAVING SUM(physicalQty) > 0`, `LIMIT 8`).

- **Metodo:** `GET`
- **Ruta:** `/api/v1/dashboard/stock-comparison`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

**Ejemplo de Respuesta:**
```json
[
  {
    "itemId": "e0000000-0000-4000-8000-000000000001",
    "sku": "MAT-CEM-001",
    "name": "Cemento Portland Sol Tipo I 42.5kg",
    "baseUnit": "BOLSA",
    "centralQty": 1200.0,
    "projectsQty": 350.0
  },
  {
    "itemId": "e0000000-0000-4000-8000-000000000002",
    "sku": "MAT-ACE-001",
    "name": "Fierro Corrugado 1/2 Grado 60",
    "baseUnit": "VARILLA",
    "centralQty": 500.0,
    "projectsQty": 120.0
  }
]
```

---

### 2.3 Reposiciones Urgentes de Stock (`GET /urgent-replenishments`)
Entrega el listado de insumos que presentan deficit de existencias respecto al umbral minimo de alerta para adquisicion o traslado inmediato.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/dashboard/urgent-replenishments`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
- **Query Params:**
  - `warehouseId` (opcional): Filtra por almacen especifico.

**Ejemplo de Respuesta:**
```json
[
  {
    "stockId": "s0000000-0000-4000-8000-000000000001",
    "warehouseId": "b0000000-0000-4000-8000-000000000002",
    "warehouseName": "Almacen de Obra Torre Central",
    "itemId": "e0000000-0000-4000-8000-000000000006",
    "sku": "MAT-LAD-001",
    "name": "Ladrillo King Kong 18 Huecos",
    "baseUnit": "MILLAR",
    "type": "CONSUMABLE",
    "physicalQty": 1.5,
    "minStockAlert": 5.0,
    "deficitQty": 3.5
  }
]
```

---

### 2.4 Reservas Logicas de Proyectos (`GET /logical-reservations`)
Lista los insumos que se encuentran comprometidos (`allocatedQty`) en Almacen Central para proyectos con estado activo o en planificacion.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/dashboard/logical-reservations`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)

**Ejemplo de Respuesta:**
```json
[
  {
    "projectId": "c0000000-0000-4000-8000-000000000001",
    "projectName": "Proyecto Torre Central San Isidro",
    "itemId": "e0000000-0000-4000-8000-000000000001",
    "sku": "MAT-CEM-001",
    "name": "Cemento Portland Sol Tipo I",
    "baseUnit": "BOLSA",
    "allocatedQty": 300.0,
    "requiredQty": 1200.0
  }
]
```
