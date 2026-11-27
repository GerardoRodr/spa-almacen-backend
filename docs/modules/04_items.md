# Modulo 04 - Catalogo de Items y Alias S10 (Items)

## 1. Descripcion General
El modulo de catalogo maestro centraliza el inventario corporativo de insumos, activos y servicios divididos en cinco categorias (`ItemType`):
- **Consumibles (`CONSUMABLE`):** Materiales directos que se consumen y extinguen fisicamente en la ejecucion de las partidas de obra (cemento, acero corrugado, arena, tuberias, aditivos).
- **Herramientas Menores (`TOOL`):** Herramientas manuales no consumibles sujetas a custodia y prestamo diario a operarios (palas, carretillas buggies, picos, combos).
- **Equipos y Herramientas de Poder (`EQUIPMENT`):** Bienes patrimoniales sujetos a custodia, serial y retorno calificado a caseta (rotomartillos, teodolitos, amoladoras, niveles laser).
- **Maquinaria Pesada (`MACHINERY`):** Equipos mayores autopropulsados o de linea amarilla/blanca controlados mediante turnos de operacion y medidores (`meterType`: `HOUR_METER` para horometros en horas o `KILOMETER` para odometros en kilometros).
- **Servicios (`SERVICE`):** Partidas intangibles o servicios de terceros (fletes, calibraciones, ensayos, mantenimientos externos) que no generan existencias fisicas en almacen (`initialStock` no permitido) y quedan excluidos de las alertas de stock critico.

### Atributos Clave del Modelo `Item`
Ademas de los datos maestros basicos (`sku`, `name`, `description`, `baseUnit`, `type`, `meterType`, `minStockAlert`), el modelo `Item` incorpora:
- `isActive` (`boolean`, por defecto `true`, indexado con `@@index([isActive])`): Controla la vigencia operativa del SKU y permite la desactivacion logica sin alterar registros historicos del Kardex.
- `isPerishable` (`boolean`, por defecto `false`, indexado): Marca insumos perecibles sujetos a seguimiento de antiguedad en almacenamiento.
- `trackLot` (`boolean`, por defecto `false`): Indica si el insumo requiere registrar numero de lote (`lotNumber`) al ingresar compras.
- `trackExpiration` (`boolean`, por defecto `false`): Indica si el insumo requiere registrar fecha de caducidad (`expirationDate`) al ingresar compras.

Adicionalmente, este modulo implementa la capa de homologacion de nombres crudos provenientes del software de presupuestos S10 (`ItemAlias`, relacion `1:N` por producto maestro con `@unique` unicamente en `s10RawName` e indice `@@index([itemId])`) y clasificaciones personalizadas creadas por el usuario (`ItemCategory`, ej. "Arrendamiento", "Agregados", "Electricos").

- **Rutas Base:** `/api/v1/items` y `/api/v1/item-categories`
- **Entidades Vinculadas:** `Item`, `ItemCategory`, `ItemAlias`, `Stock`, `Warehouse`, `MeasurementUnit`

---

## 2. Endpoints

### 2.1 Listar Catalogo Paginado
Obtiene el listado de insumos, herramientas, equipos, maquinaria y servicios con paginacion, busqueda por texto en SKU, nombre o descripcion, filtro por tipo de recurso, filtro por clasificacion personalizada (`categoryId`), filtro de perecibles, filtro de inactivos y filtro de stock critico (`lowStockOnly`). Aplica `CostMaskingInterceptor` para enmascarar `averageCost` dentro de `stocks` ante usuarios `WAREHOUSE_KEEPER`.

Por defecto retorna unicamente items activos (`isActive: true`), salvo que se envie `includeInactive=true`. Los parametros de texto/seleccion (`search`, `type`, `categoryId`, `warehouseId`) sanean automaticamente cadenas vacias (o el literal `'ALL'` en `type`, `categoryId` y `warehouseId`) a `undefined`.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/items`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros Query (`ItemFilterDto`)
| Parametro | Tipo | Por Defecto | Descripcion |
|---|---|---|---|
| `page` | integer | `1` | Numero de pagina actual (minimo `1`). |
| `limit` | integer | `20` | Cantidad de registros por pagina (minimo `1`). |
| `search` | string | opcional | Busqueda insensible a mayusculas en `sku`, `name` o `description`. Cadenas vacias se sanean a `undefined`. |
| `type` | `CONSUMABLE` \| `TOOL` \| `EQUIPMENT` \| `MACHINERY` \| `SERVICE` | opcional | Filtro por clasificacion del item. Valores vacios o `'ALL'` se sanean a `undefined`. |
| `categoryId` | string (UUID) | opcional | Filtro por clasificacion personalizada asignada. Valores vacios o `'ALL'` se sanean a `undefined`. |
| `isPerishable` | boolean (`true` \| `false`) | opcional | Filtrar insumos perecibles o no perecibles (acepta `true`/`false`, `1`/`0`). |
| `includeInactive` | boolean (`true` \| `false`) | `false` | Si es `true`, incluye items desactivados logicamente (`isActive: false`). Si se omite o es `false`, filtra `isActive: true`. |
| `lowStockOnly` | boolean (`true` \| `false`) | `false` | Si es `true`, retorna unicamente items activos (`isActive = true`), distintos de `SERVICE` (`type != 'SERVICE'`) y con `minStockAlert > 0` que cumplan stock fisico menor o igual al umbral minimo (`physicalQty <= minStockAlert` en `warehouseId`, o `SUM(physicalQty) <= minStockAlert` consolidado si no se indica sede). |
| `warehouseId` | string (UUID) | opcional | Almacen de referencia evaluado cuando `lowStockOnly=true`. Valores vacios o `'ALL'` se sanean a `undefined`. |

**Ejemplo de Peticion:**
```http
GET /api/v1/items?page=1&limit=10&search=fierro&type=CONSUMABLE&isPerishable=false&lowStockOnly=false
```

#### Respuestas
**200 OK - Catalogo paginado:**
```json
{
  "data": [
    {
      "id": "item-uuid-fierro-1-2",
      "sku": "ACE-CORR-1/2",
      "name": "Fierro Corrugado 1/2 pulg Grado 60 x 9m",
      "description": "Varilla corrugada de acero para construccion civil",
      "baseUnit": "VARILLA",
      "type": "CONSUMABLE",
      "meterType": null,
      "minStockAlert": "100.0000",
      "isPerishable": false,
      "isActive": true,
      "trackLot": false,
      "trackExpiration": false,
      "categoryId": null,
      "category": null,
      "stocks": [
        {
          "id": "stock-uuid-1",
          "warehouseId": "22222222-2222-2222-2222-222222222222",
          "itemId": "item-uuid-fierro-1-2",
          "physicalQty": "250.0000",
          "reservedQty": "0.0000",
          "loanedQty": "0.0000",
          "averageCost": "34.5000",
          "warehouse": {
            "id": "22222222-2222-2222-2222-222222222222",
            "name": "Almacen Central",
            "type": "CENTRAL",
            "isTemporary": false,
            "isActive": true
          }
        }
      ],
      "createdAt": "2026-09-20T22:55:00.000Z",
      "updatedAt": "2026-09-20T22:55:00.000Z",
      "_count": {
        "stocks": 3,
        "aliases": 2
      }
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

### 2.2 Previsualizar Siguiente SKU Sugerido
Calcula y retorna el siguiente codigo correlativo disponible para un tipo de item dado (`MAT`, `HER`, `EQU`, `MAQ`, `SER`) sin avanzar la secuencia en `DocumentSequence`.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/items/next-sku`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros Query
| Parametro | Tipo | Por Defecto | Descripcion |
|---|---|---|---|
| `type` | `CONSUMABLE` \| `TOOL` \| `EQUIPMENT` \| `MACHINERY` \| `SERVICE` | `CONSUMABLE` | Clasificacion del recurso para determinar el prefijo. |

**Prefijos Estandarizados (`ITEM_TYPE_PREFIX`):**
- `CONSUMABLE` -> `MAT-XXXX` (Materiales e insumos directos)
- `TOOL` -> `HER-XXXX` (Herramientas menores)
- `EQUIPMENT` -> `EQU-XXXX` (Equipos y herramientas de poder)
- `MACHINERY` -> `MAQ-XXXX` (Maquinaria pesada o equipos con medidor)
- `SERVICE` -> `SER-XXXX` (Servicios sin existencia fisica)

**Ejemplo de Peticion:**
```http
GET /api/v1/items/next-sku?type=SERVICE
```

#### Respuestas
**200 OK - SKU sugerido obtenido:**
```json
{
  "sku": "SER-0001",
  "prefix": "SER"
}
```

---

### 2.3 Registrar Nuevo Item en Catalogo Maestro (con Stock Inicial Opcional)
Crea un nuevo SKU corporativo oficial. Habilitado para `ADMIN`, `MODERATOR` y `WAREHOUSE_KEEPER` para agilizar el ingreso en obra. Permite la autogeneracion de SKU y el registro atomico de stock fisico inicial en un almacen o caseta (excepto para items de tipo `SERVICE`).

- **Metodo:** `POST`
- **Ruta:** `/api/v1/items`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Request Body (`CreateItemDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `sku` | string | No | Codigo de inventario (max 50 caracteres). Se normaliza a mayusculas. Si se omite, se autogenera mediante `SequenceGeneratorService` segun el `type`. |
| `name` | string | Si | Nombre formal del producto, herramienta o servicio. |
| `description` | string | No | Ficha o especificacion tecnica resumida. |
| `baseUnit` | string | Si | Unidad de medida base de control (normalizada a mayusculas; ej. `UND`, `KG`, `M3`, `BOLSA`, `VAR`, `GLB`). |
| `type` | `CONSUMABLE` \| `TOOL` \| `EQUIPMENT` \| `MACHINERY` \| `SERVICE` | Si | Clasificacion contable y operativa. |
| `meterType` | `HOUR_METER` \| `KILOMETER` \| `null` | No | Tipo de medidor operativo (solo aplica cuando `type` es `MACHINERY`; por defecto `HOUR_METER`; `null` para otros tipos). |
| `categoryId` | string (UUID) \| `null` | No | Identificador UUID de la clasificacion personalizada asignada. |
| `isPerishable` | boolean | No | Indica si el insumo es perecible y sujeto a caducidad (por defecto: `false`). |
| `trackLot` | boolean | No | Indica si el insumo requiere registrar numero de lote en compras (por defecto: `false`). |
| `trackExpiration` | boolean | No | Indica si el insumo requiere registrar fecha de caducidad en compras (por defecto: `false`). |
| `minStockAlert` | number | No | Cantidad minima para alerta de reposicion (por defecto: `0`, minimo `0`). |
| `initialStock` | object (`InitialStockOnCreateDto`) | No | Sub-objeto para asentar inventario fisico inicial en una sola transaccion atomica. Prohibido cuando `type` es `SERVICE`. |

#### Estructura de `initialStock` (`InitialStockOnCreateDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `warehouseId` | string (UUID) | Si | Identificador del almacen o caseta donde ingresa el stock fisico inicial. |
| `quantity` | number | Si | Cantidad fisica inicial a registrar (minimo `0.0001`). |
| `unitCost` | number | No | Costo unitario referencial en Soles (procesado para `ADMIN` y `MODERATOR`; forzado a `0` para `WAREHOUSE_KEEPER`). |
| `observation` | string | No | Observacion o sustento de la toma fisica inicial (max 500 caracteres). |

**Reglas de Negocio en Alta de Item:**
1. **Restriccion para `SERVICE`:** Si `type` es `SERVICE` y se envia `initialStock` con `quantity > 0`, el backend rechaza la solicitud con `400 Bad Request` (`"Los insumos de tipo SERVICIO no generan existencias fisicas en almacen"`).
2. **Validacion y Auto-registro de Unidad Base (`baseUnit`):** Si `baseUnit` existe en `MeasurementUnit` con `isActive: false`, rechaza con `400 Bad Request`. Si no existe aun en el catalogo maestro, se crea automaticamente como unidad activa (`isActive: true`).
3. **Control de Acceso a Sede:** Si un `WAREHOUSE_KEEPER` envia `initialStock`, se valida que tenga asignacion formal al `warehouseId` receptor en `UserWarehouse`. De lo contrario, se rechaza con `400 Bad Request` (`"No tiene permisos para ingresar stock en el almacen seleccionado"`).
4. **Ocultamiento de Costos (Costo Ciego):** Para `WAREHOUSE_KEEPER`, el costo unitario se fija obligatoriamente en `0.00` y `CostMaskingInterceptor` enmascara los campos de costo financiero.
5. **Transaccion Atomica e Inmutabilidad de Kardex:** Cuando se proporciona `initialStock` con `quantity > 0`, el backend en una transaccion Prisma unica:
   - Crea el registro maestro `Item`.
   - Crea el registro en `Stock` con `physicalQty` y `averageCost`.
   - Genera el asiento inmutable en `Movement` con tipo `INVENTORY_ADJUSTMENT`, correlativo autogenerado (`MOV-YYYY-XXXXX`) y el snapshot de costo.
   - Retorna la propiedad `initialMovementId` con el UUID del movimiento registrado.

**Ejemplo de Peticion (Autogeneracion de SKU y Stock Inicial en Caseta):**
```json
{
  "name": "Arena Gruesa Seleccionada para Mezcla",
  "baseUnit": "M3",
  "type": "CONSUMABLE",
  "minStockAlert": 10,
  "isPerishable": false,
  "trackLot": false,
  "trackExpiration": false,
  "initialStock": {
    "warehouseId": "44444444-4444-4444-4444-444444444444",
    "quantity": 18.5,
    "observation": "Carga inicial fisica al aperturar caseta de obra"
  }
}
```

#### Respuestas
**201 Created - Item registrado con stock inicial:**
```json
{
  "id": "item-uuid-arena-gruesa",
  "sku": "MAT-0043",
  "name": "Arena Gruesa Seleccionada para Mezcla",
  "description": null,
  "baseUnit": "M3",
  "type": "CONSUMABLE",
  "meterType": null,
  "minStockAlert": "10.0000",
  "isPerishable": false,
  "isActive": true,
  "trackLot": false,
  "trackExpiration": false,
  "categoryId": null,
  "category": null,
  "stocks": [
    {
      "id": "stock-uuid-arena",
      "warehouseId": "44444444-4444-4444-4444-444444444444",
      "itemId": "item-uuid-arena-gruesa",
      "physicalQty": "18.5000",
      "reservedQty": "0.0000",
      "loanedQty": "0.0000",
      "averageCost": "0.0000",
      "warehouse": {
        "id": "44444444-4444-4444-4444-444444444444",
        "name": "Almacen Obra San Isidro",
        "type": "PROJECT_SITE",
        "isActive": true
      }
    }
  ],
  "createdAt": "2026-11-09T22:30:00.000Z",
  "updatedAt": "2026-11-09T22:30:00.000Z",
  "initialMovementId": "mov-uuid-adjustment-init-1"
}
```

**400 Bad Request - Intento de registrar stock inicial en item de tipo `SERVICE`:**
```json
{
  "statusCode": 400,
  "message": "Los insumos de tipo SERVICIO no generan existencias fisicas en almacen",
  "error": "Bad Request"
}
```

**409 Conflict - SKU duplicado:**
```json
{
  "statusCode": 409,
  "message": "Ya existe un item registrado con el SKU: MAT-0043",
  "error": "Conflict"
}
```

---

### 2.4 Listar Alertas de Insumos Perecibles con Stock Activo
Retorna todos los insumos activos (`isActive: true`) catalogados como perecibles (`isPerishable: true`) que mantienen existencias fisicas activas (`physicalQty > 0`) en almacenes, detallando el stock por sede, la fecha del ultimo ingreso por compra y los dias transcurridos en almacenamiento.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/items/perishable-alerts`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Query Parameters
| Parametro | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `warehouseId` | string (UUID o 'ALL') | No | Filtrar alertas para un almacen especifico. Si se omite, evalua todas las sedes. |

#### Respuesta Exitosa (200 OK)
```json
[
  {
    "id": "e0000000-0000-4000-8000-000000000008",
    "sku": "MAT-ADI-001",
    "name": "Aditivo Plastificante Acelerante SikaCem",
    "baseUnit": "GLN",
    "type": "CONSUMABLE",
    "minStockAlert": 20,
    "isPerishable": true,
    "totalPhysicalQty": 35,
    "lastPurchaseDate": "2026-09-15T00:00:00.000Z",
    "daysInStorage": 27,
    "lastSupplier": "Quimicos de la Construccion SAC",
    "lastInvoiceSeries": "F001-0004523",
    "stocks": [
      {
        "stockId": "s0000000-0000-4000-8000-000000000010",
        "warehouseId": "b0000000-0000-4000-8000-000000000001",
        "warehouseName": "Almacen Central Principal (Lurin)",
        "warehouseType": "CENTRAL",
        "physicalQty": 35,
        "averageCost": 48.5
      }
    ]
  }
]
```
*Nota: Para usuarios con rol `WAREHOUSE_KEEPER`, el interceptor `CostMaskingInterceptor` enmascara automaticamente la propiedad `averageCost` en cada elemento del arreglo `stocks`. Asimismo, el calculo del ultimo ingreso por compra (`lastPurchaseDate`, `lastSupplier`, `lastInvoiceSeries`) excluye comprobantes anulados (`purchase.isReverted = false`).*

---

### 2.5 Obtener Detalle y Consolidado Corporativo de Stock
Obtiene la ficha del item junto con el desglose de existencias por almacen, calculando los totales fisicos, reservados y prestados a nivel de toda la empresa.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/items/:id`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros
- `id` (URL Path): UUID del item.

#### Respuestas Segun Rol

**Respuesta para ADMIN (Muestra `averageCost` en cada almacen):**
```json
{
  "id": "item-uuid-rotomartillo",
  "sku": "EQU-ROT-001",
  "name": "Rotomartillo Bosch GBH 2-28 D 850W",
  "description": "Equipo electro-neumatico con encastre SDS Plus para perforacion en concreto",
  "baseUnit": "UNIDAD",
  "type": "EQUIPMENT",
  "meterType": null,
  "minStockAlert": "2.0000",
  "isPerishable": false,
  "isActive": true,
  "trackLot": false,
  "trackExpiration": false,
  "createdAt": "2026-09-23T12:15:00.000Z",
  "updatedAt": "2026-09-23T12:15:00.000Z",
  "totals": {
    "totalPhysicalQty": 12,
    "totalReservedQty": 2,
    "totalLoanedQty": 4,
    "netAvailableCentralQty": 6
  },
  "stocks": [
    {
      "id": "stock-uuid-1",
      "warehouseId": "22222222-2222-2222-2222-222222222222",
      "physicalQty": "8.0000",
      "reservedQty": "2.0000",
      "loanedQty": "0.0000",
      "averageCost": "450.0000",
      "warehouse": {
        "id": "22222222-2222-2222-2222-222222222222",
        "name": "Almacen Central Lima",
        "type": "CENTRAL",
        "isActive": true
      }
    },
    {
      "id": "stock-uuid-2",
      "warehouseId": "44444444-4444-4444-4444-444444444444",
      "physicalQty": "4.0000",
      "reservedQty": "0.0000",
      "loanedQty": "4.0000",
      "averageCost": "450.0000",
      "warehouse": {
        "id": "44444444-4444-4444-4444-444444444444",
        "name": "Almacen Obra San Isidro",
        "type": "PROJECT_SITE",
        "isActive": true
      }
    }
  ],
  "aliases": [],
  "hasTransactions": true,
  "transactionStats": {
    "stocksWithQtyCount": 2,
    "movementItemsCount": 8,
    "purchaseDetailsCount": 3,
    "transferItemsCount": 1
  }
}
```

**Respuesta para WAREHOUSE_KEEPER (Costo enmascarado):**
```json
{
  "id": "item-uuid-rotomartillo",
  "sku": "HERR-TALADRO-ROTO",
  "name": "Rotomartillo SDS-Plus 800W",
  "description": "Equipo para perforacion en concreto con maletin y accesorios",
  "baseUnit": "UND",
  "type": "EQUIPMENT",
  "meterType": null,
  "isPerishable": false,
  "isActive": true,
  "trackLot": false,
  "trackExpiration": false,
  "minStockAlert": "3.0000",
  "createdAt": "2026-09-23T12:15:00.000Z",
  "updatedAt": "2026-09-23T12:15:00.000Z",
  "totals": {
    "totalPhysicalQty": 12,
    "totalReservedQty": 2,
    "totalLoanedQty": 4,
    "netAvailableCentralQty": 6
  },
  "hasTransactions": true,
  "transactionStats": {
    "stocksWithQtyCount": 2,
    "movementItemsCount": 8,
    "purchaseDetailsCount": 3,
    "transferItemsCount": 1
  },
  "stocks": [
    {
      "id": "stock-uuid-1",
      "warehouseId": "22222222-2222-2222-2222-222222222222",
      "physicalQty": "8.0000",
      "reservedQty": "2.0000",
      "loanedQty": "0.0000",
      "warehouse": {
        "id": "22222222-2222-2222-2222-222222222222",
        "name": "Almacen Central Lima",
        "type": "CENTRAL",
        "isActive": true
      }
    },
    {
      "id": "stock-uuid-2",
      "warehouseId": "44444444-4444-4444-4444-444444444444",
      "physicalQty": "4.0000",
      "reservedQty": "0.0000",
      "loanedQty": "4.0000",
      "warehouse": {
        "id": "44444444-4444-4444-4444-444444444444",
        "name": "Almacen Obra San Isidro",
        "type": "PROJECT_SITE",
        "isActive": true
      }
    }
  ],
  "aliases": []
}
```

*Garantia de Serializacion de Cantidades:* En cumplimiento con la politica de integridad de existencias, las cantidades fisicas (`physicalQty`, `reservedQty`, `loanedQty`) son preservadas como instancias escalares y nunca se descomponen en objetos `{ d, e, s }`, permitiendo que la interfaz procese numeros directos sin arrojar `[object Object]` ni `NaN` tanto para `ADMIN` como para `WAREHOUSE_KEEPER`.

---

### 2.6 Actualizar Item
Modifica datos descriptivos, unidad base o limite de alerta de un SKU maestro.

- **Metodo:** `PUT`
- **Ruta:** `/api/v1/items/:id`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Parametros
- `id` (URL Path): UUID del item.

#### Request Body (`UpdateItemDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `name` | string | No | Nombre del item. |
| `description` | string | No | Descripcion tecnica. |
| `baseUnit` | string | No | Unidad base (normalizada a mayusculas). Se valida contra el catalogo de `MeasurementUnit`. |
| `confirmUnitChange` | boolean | No | Bandera de doble confirmacion explicita requerida para cambiar `baseUnit` si el insumo ya cuenta con transacciones o existencias activas. |
| `type` | `CONSUMABLE` \| `TOOL` \| `EQUIPMENT` \| `MACHINERY` \| `SERVICE` | No | Clasificacion del item. |
| `meterType` | `HOUR_METER` \| `KILOMETER` \| `null` | No | Tipo de medidor para maquinaria (`HOUR_METER` o `KILOMETER`). Si el item no es `MACHINERY`, el sistema lo limpia a `null`. |
| `categoryId` | string (UUID) \| `null` | No | Clasificacion personalizada asignada o `null` para desvincular. |
| `isPerishable` | boolean | No | Indicador de material perecible. |
| `trackLot` | boolean | No | Indica si el insumo requiere registrar numero de lote en compras. |
| `trackExpiration` | boolean | No | Indica si el insumo requiere registrar fecha de caducidad en compras. |
| `minStockAlert` | number | No | Cantidad minima para alerta de reposicion. |

> **Regla de Doble Confirmacion:** Si el insumo cuenta con existencias fisicas (`physicalQty > 0`), movimientos en Kardex, compras o transferencias, cambiar `baseUnit` sin enviar `confirmUnitChange: true` provocara un error `400 Bad Request` con codigo `REQUIRES_DOUBLE_CONFIRMATION`. Al enviar `confirmUnitChange: true`, la modificacion se autoriza. Consultar [Modulo 14 - Unidades de Medida](14_measurement_units.md) para detalles del flujo.

**Ejemplo de Peticion con Doble Confirmacion:**
```json
{
  "baseUnit": "KG",
  "confirmUnitChange": true
}
```

#### Respuestas
**200 OK - Item actualizado:**
```json
{
  "id": "item-uuid-rotomartillo",
  "sku": "EQU-ROT-001",
  "name": "Rotomartillo Bosch GBH 2-28 D 850W",
  "description": "Equipo electro-neumatico con encastre SDS Plus para perforacion en concreto",
  "baseUnit": "UNIDAD",
  "type": "EQUIPMENT",
  "meterType": null,
  "minStockAlert": "5.0000",
  "isPerishable": false,
  "isActive": true,
  "trackLot": false,
  "trackExpiration": false,
  "createdAt": "2026-09-23T12:15:00.000Z",
  "updatedAt": "2026-09-23T12:18:00.000Z"
}
```

**400 Bad Request - Doble confirmacion requerida:**
```json
{
  "statusCode": 400,
  "code": "REQUIRES_DOUBLE_CONFIRMATION",
  "message": "El insumo cuenta con existencias fisicas o movimientos historicos registrados. Modificar su unidad base requiere doble confirmacion explicita.",
  "details": {
    "stocksWithQtyCount": 2,
    "movementItemsCount": 8,
    "purchaseDetailsCount": 3,
    "transferItemsCount": 1
  }
}
```

---

### 2.7 Eliminar o Desactivar Item
Permite retirar un insumo del catalogo maestro de forma segura preservando la integridad del inventario y del Kardex. Habilitado para los roles `ADMIN` y `MODERATOR`.

- **Metodo:** `DELETE`
- **Ruta:** `/api/v1/items/:id`
- **Acceso:** Protegido (`ADMIN` y `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin_o_moderator>`

#### Parametros
- `id` (URL Path): UUID del item a eliminar o desactivar.

#### Reglas de Negocio y Validaciones
1. **Validacion de Stock y Custodias Activas (Bloqueo 400):** Antes de proceder, el sistema verifica simultaneamente en todas las sedes que:
   - `SUM(Stock.physicalQty) == 0`
   - `SUM(Stock.reservedQty) == 0`
   - Cero vales de custodia abiertos en `ToolCustody` (`returnDate == null` y `isReverted == false`)
   Si alguna de estas condiciones no se cumple, la operacion es rechazada con `400 Bad Request`.
2. **Borrado Fisico vs Borrado Logico:** Una vez confirmado stock cero y sin custodias abiertas, el sistema evalua el historial en las tablas `PurchaseDetail`, `MovementItem`, `TransferItem`, `ProjectRequirement`, `ToolCustody` y `MachineryShiftLog`:
   - **Sin historial (`totalHistoryCount == 0`):** Ejecuta borrado fisico (`prisma.item.delete`), eliminando en cascada sus filas de `Stock` en cero y sus `ItemAlias`, y responde con `action: "DELETED"`.
   - **Con historial (`totalHistoryCount > 0`):** Ejecuta borrado logico (`isActive = false`) para preservar la integridad historica del Kardex y reportes, y responde con `action: "DEACTIVATED"`.

#### Respuestas
**200 OK - Eliminacion fisica (sin historial):**
```json
{
  "action": "DELETED",
  "message": "Insumo eliminado permanentemente del catalogo maestro."
}
```

**200 OK - Desactivacion logica (con historial contable o logistico):**
```json
{
  "action": "DEACTIVATED",
  "message": "El insumo posee historial contable o logistico. Se ha desactivado logicamente para preservar la integridad del Kardex."
}
```

**400 Bad Request - Stock o custodias activas pendientes:**
```json
{
  "statusCode": 400,
  "message": "No se puede eliminar el insumo \"Cemento Portland Tipo I\" porque mantiene stock fisico (25), stock reservado (0) o prestamos en custodia activos (0). Primero debe liquidarse o consumirse su stock.",
  "error": "Bad Request"
}
```

**404 Not Found - Item inexistente:**
```json
{
  "statusCode": 404,
  "message": "Item no encontrado en el catalogo maestro",
  "error": "Not Found"
}
```

---

### 2.8 Listar Equivalencias S10 (Alias Paginados)
Lista las reglas de equivalencia entre descripciones crudas del presupuesto S10 (`ItemAlias`) y los insumos del catalogo maestro. El modelo soporta relacion `1:N` por producto (multiples alias pueden apuntar al mismo `itemId`), con restriccion `@unique` exclusivamente en `s10RawName` e indice en `itemId`.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/items/aliases`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Parametros Query (`ItemAliasFilterDto`)
| Parametro | Tipo | Por Defecto | Descripcion |
|---|---|---|---|
| `page` | integer | `1` | Numero de pagina (minimo `1`). |
| `limit` | integer | `20` | Registros por pagina (minimo `1`, maximo `100`). |
| `search` | string | opcional | Busqueda insensible a mayusculas en `s10RawName`, `s10Code`, `s10Unit`, `item.name` o `item.sku`. Cadenas vacias se sanean a `undefined`. |
| `itemId` | string (UUID) | opcional | Filtra los alias vinculados a un insumo maestro especifico. Valores vacios o `'ALL'` se sanean a `undefined`. |

**Ejemplo de Peticion:**
```http
GET /api/v1/items/aliases?page=1&limit=20&search=CEMENTO
```

#### Respuestas
**200 OK - Listado paginado de alias S10 (ordenado ascendentemente por `s10RawName`):**
```json
{
  "data": [
    {
      "id": "alias-uuid-cemento-1",
      "itemId": "item-uuid-cemento",
      "s10RawName": "CEMENTO PORTLAND TIPO I EN BOLSA DE 42.5 KG",
      "s10Code": "0204010001",
      "s10Unit": "BOL",
      "conversionFactor": "1.0000",
      "item": {
        "id": "item-uuid-cemento",
        "sku": "MAT-0001",
        "name": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
        "baseUnit": "BOLSA",
        "type": "CONSUMABLE",
        "isActive": true
      }
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

### 2.9 Registrar Alias S10 de Equivalencia
Crea una regla de traduccion para nombres sin estandarizar leidos en presupuestos S10, vinculandolos a un SKU maestro activo con un factor de conversion. Permite registrar multiples alias hacia el mismo producto maestro (`1:N`), exigiendo unicidad global unicamente sobre `s10RawName`.
Formula de conversion: `Cantidad_Item_Base = Cantidad_S10 * conversionFactor`.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/items/aliases`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`CreateItemAliasDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `itemId` | string (UUID) | Si | UUID del item maestro oficial (debe existir y estar activo). |
| `s10RawName` | string | Si | Nombre literal tal como aparece en el archivo del S10 (unico en `ItemAlias`). |
| `s10Code` | string | No | Codigo de partida o recurso en el S10. |
| `s10Unit` | string | No | Unidad de medida indicada en el presupuesto S10. |
| `conversionFactor` | number | No | Factor multiplicador estrictamente positivo (minimo `0.0001`, por defecto: `1.0`). |

**Ejemplo de Peticion:**
```json
{
  "itemId": "item-uuid-cemento",
  "s10RawName": "CEMENTO PORTLAND TIPO I EN BOLSA DE 42.5 KG",
  "s10Code": "0204010001",
  "s10Unit": "BOL",
  "conversionFactor": 1.0
}
```

#### Respuestas
**201 Created - Alias registrado (incluye resumen de `item`):**
```json
{
  "id": "alias-uuid-cemento-1",
  "itemId": "item-uuid-cemento",
  "s10RawName": "CEMENTO PORTLAND TIPO I EN BOLSA DE 42.5 KG",
  "s10Code": "0204010001",
  "s10Unit": "BOL",
  "conversionFactor": "1.0000",
  "item": {
    "id": "item-uuid-cemento",
    "sku": "MAT-0001",
    "name": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
    "baseUnit": "BOLSA",
    "type": "CONSUMABLE",
    "isActive": true
  }
}
```

**400 Bad Request - Insumo maestro inactivo:**
```json
{
  "statusCode": 400,
  "message": "No se puede asociar un alias S10 a un insumo inactivo",
  "error": "Bad Request"
}
```

**409 Conflict - Nombre crudo ya asignado:**
```json
{
  "statusCode": 409,
  "message": "Ya existe un alias registrado con esa descripcion literal de S10",
  "error": "Conflict"
}
```

---

### 2.10 Actualizar Alias S10
Modifica una equivalencia S10 existente permitiendo reasignar el producto maestro vinculado (`itemId`), corregir el nombre crudo (`s10RawName`), codigo S10 (`s10Code`), unidad S10 (`s10Unit`) o factor de conversion (`conversionFactor`).

- **Metodo:** `PUT`
- **Ruta:** `/api/v1/items/aliases/:id`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Parametros
- `id` (URL Path): UUID del alias S10 a modificar.

#### Request Body (`UpdateItemAliasDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `itemId` | string (UUID) | No | Nuevo SKU maestro vinculado (debe existir y estar activo). |
| `s10RawName` | string | No | Nueva cadena cruda literal de S10 (no vacia; valida unicidad contra otros alias). |
| `s10Code` | string \| `null` | No | Codigo de recurso en S10 (`null` o vacio limpia el valor). |
| `s10Unit` | string \| `null` | No | Unidad de medida en S10 (`null` o vacio limpia el valor). |
| `conversionFactor` | number | No | Nuevo factor de conversion estrictamente positivo (minimo `0.0001`). |

**Ejemplo de Peticion:**
```json
{
  "itemId": "item-uuid-cemento-nuevo",
  "s10RawName": "CEMENTO PORTLAND TIPO I (42.5 KG)",
  "s10Code": "0204010002",
  "s10Unit": "BLS",
  "conversionFactor": 1.0
}
```

#### Respuestas
**200 OK - Alias actualizado (incluye resumen de `item`):**
```json
{
  "id": "alias-uuid-cemento-1",
  "itemId": "item-uuid-cemento-nuevo",
  "s10RawName": "CEMENTO PORTLAND TIPO I (42.5 KG)",
  "s10Code": "0204010002",
  "s10Unit": "BLS",
  "conversionFactor": "1.0000",
  "item": {
    "id": "item-uuid-cemento-nuevo",
    "sku": "MAT-0001",
    "name": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
    "baseUnit": "BOLSA",
    "type": "CONSUMABLE",
    "isActive": true
  }
}
```

**400 Bad Request - Insumo destino inactivo:**
```json
{
  "statusCode": 400,
  "message": "No se puede vincular el alias a un insumo inactivo",
  "error": "Bad Request"
}
```

**404 Not Found - Alias inexistente:**
```json
{
  "statusCode": 404,
  "message": "Alias S10 no encontrado",
  "error": "Not Found"
}
```

**409 Conflict - Nombre crudo duplicado en otro alias:**
```json
{
  "statusCode": 409,
  "message": "Ya existe otro alias registrado con esa descripcion literal de S10",
  "error": "Conflict"
}
```

---

### 2.11 Eliminar Alias S10
Elimina un mapeo de equivalencia de S10 existente sin alterar el registro maestro del item.

- **Metodo:** `DELETE`
- **Ruta:** `/api/v1/items/aliases/:id`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Parametros
- `id` (URL Path): UUID del alias a desvincular.

#### Respuestas
**200 OK - Alias eliminado:**
```json
{
  "message": "Alias eliminado exitosamente"
}
```

**404 Not Found - Alias inexistente:**
```json
{
  "statusCode": 404,
  "message": "Alias no encontrado",
  "error": "Not Found"
}
```

---

## 3. Gestor de Clasificaciones Personalizadas (`/api/v1/item-categories`)

Permite a la organizacion definir agrupaciones libres para los insumos del catalogo maestro (ej. "Arrendamiento", "Agregados", "Material Electrico", "Pinturas").

### 3.1 Listar Clasificaciones
Obtiene las clasificaciones ordenadas por nombre, incluyendo la cantidad de items vinculados.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/item-categories`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
- **Parametros Query:**
  - `includeInactive` (boolean, opcional, default: `false`): Si es `true`, incluye clasificaciones inactivas.

**Respuesta 200 OK:**
```json
[
  {
    "id": "cat-uuid-1",
    "name": "Arrendamiento",
    "code": "CAT-ARREND",
    "description": "Insumos y servicios vinculados a alquiler de equipos",
    "isActive": true,
    "_count": {
      "items": 4
    }
  }
]
```

### 3.2 Crear Clasificacion Personalizada
Crea una nueva categoria validando unicidad de `name` y `code`.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/item-categories`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Body (`CreateItemCategoryDto`):**
  - `name` (string, obligatorio, max 100)
  - `code` (string, opcional, max 30)
  - `description` (string, opcional, max 500)
  - `isActive` (boolean, opcional, default `true`)

**Respuesta 201 Created:**
```json
{
  "id": "cat-uuid-1",
  "name": "Arrendamiento",
  "code": "CAT-ARREND",
  "description": "Insumos y servicios vinculados a alquiler de equipos",
  "isActive": true,
  "createdAt": "2026-10-18T06:22:00.000Z",
  "updatedAt": "2026-10-18T06:22:00.000Z"
}
```

### 3.3 Actualizar Clasificacion
Actualiza nombre, codigo, descripcion o estado activo.

- **Metodo:** `PATCH`
- **Ruta:** `/api/v1/item-categories/:id`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Body (`UpdateItemCategoryDto`):** `name?`, `code?`, `description?`, `isActive?`

### 3.4 Eliminar o Desactivar Clasificacion
Elimina fisicamente la clasificacion si no tiene items asociados. Si cuenta con insumos asociados, la desactiva logicamente (`isActive: false`) preservando la integridad referencial.

- **Metodo:** `DELETE`
- **Ruta:** `/api/v1/item-categories/:id`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)

**Respuesta 200 OK (Eliminada fisicamente):**
```json
{
  "action": "DELETED",
  "message": "Clasificacion eliminada exitosamente"
}
```

**Respuesta 200 OK (Desactivada logicamente por tener items):**
```json
{
  "action": "DEACTIVATED",
  "message": "La clasificacion tiene 3 insumo(s) asociado(s). Se ha desactivado logicamente para preservar la integridad del catalogo."
}
```
