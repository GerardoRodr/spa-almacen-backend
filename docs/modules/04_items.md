# Modulo 04 - Catalogo de Items y Alias S10 (Items)

## 1. Descripcion General
El modulo de catalogo maestro centraliza el inventario corporativo de insumos y equipos divididos en cuatro categorias:
- **Consumibles (`CONSUMABLE`):** Materiales directos que se consumen y extinguen fisicamente en la ejecucion de las partidas de obra (cemento, acero corrugado, arena, tuberias, aditivos).
- **Herramientas Menores (`TOOL`):** Herramientas manuales no consumibles sujetas a custodia y prestamo diario a operarios (palas, carretillas buggies, picos, combos).
- **Equipos y Herramientas de Poder (`EQUIPMENT`):** Bienes patrimoniales sujetos a custodia, serial y retorno calificado a caseta (rotomartillos, teodolitos, amoladoras, niveles laser).
- **Maquinaria Pesada (`MACHINERY`):** Equipos mayores autopropulsados o de linea amarilla/blanca controlados mediante turnos de operacion y medidores (`meterType`: `HOUR_METER` para horometros en horas o `KILOMETER` para odometros en kilometros).

Adicionalmente, este modulo implementa la capa de homologacion de nombres crudos provenientes del software de presupuestos S10 (`ItemAlias`), clasificaciones personalizadas creadas por el usuario (`ItemCategory`, ej. "Arrendamiento", "Agregados", "Electricos"), y la clasificacion de materiales perecibles (`isPerishable`).

- **Rutas Base:** `/api/v1/items` y `/api/v1/item-categories`
- **Entidades Vinculadas:** `Item`, `ItemCategory`, `ItemAlias`, `Stock`, `Warehouse`

---

## 2. Endpoints

### 2.1 Listar Catalogo Paginado
Obtiene el listado de insumos y herramientas con paginacion, busqueda por texto en SKU o nombre, filtro por tipo de recurso, filtro por clasificacion personalizada (`categoryId`) y filtro por caducidad (perecibles).

- **Metodo:** `GET`
- **Ruta:** `/api/v1/items`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros Query (`ItemFilterDto`)
| Parametro | Tipo | Por Defecto | Descripcion |
|---|---|---|---|
| `page` | integer | `1` | Numero de pagina actual. |
| `limit` | integer | `20` | Cantidad de registros por pagina. |
| `search` | string | opcional | Cadena de busqueda por SKU o nombre. |
| `type` | `CONSUMABLE` \| `TOOL` \| `EQUIPMENT` \| `MACHINERY` | opcional | Filtro por clasificacion del item. |
| `categoryId` | string (UUID) | opcional | Filtro por clasificacion personalizada asignada. |
| `isPerishable` | boolean (`true` \| `false`) | opcional | Filtrar insumos perecibles o no perecibles. |

**Ejemplo de Peticion:**
```http
GET /api/v1/items?page=1&limit=10&search=fierro&type=CONSUMABLE&isPerishable=false
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
      "minStockAlert": "100.0000",
      "isPerishable": false,
      "createdAt": "2026-09-20T22:55:00.000Z",
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

### 2.2 Registrar Nuevo Item en Catalogo Maestro
Crea un nuevo SKU corporativo oficial. Restringido exclusivamente al administrador corporativo.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/items`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`CreateItemDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `sku` | string | Si | Codigo unico de inventario (ej. `CEM-PORT-T1` o `EQU-ROT-001`). |
| `name` | string | Si | Nombre formal del producto o herramienta. |
| `description` | string | No | Ficha o especificacion tecnica resumida. |
| `baseUnit` | string | Si | Unidad de medida base de control (ej. `UND`, `KG`, `M3`, `BOLSA`, `VARILLA`). |
| `type` | `CONSUMABLE` \| `TOOL` \| `EQUIPMENT` \| `MACHINERY` | Si | Clasificacion contable y operativa. |
| `meterType` | `HOUR_METER` \| `KILOMETER` \| `null` | No | Tipo de medidor operativo (solo aplica cuando `type` es `MACHINERY`; por defecto `HOUR_METER`; `null` para otros tipos). |
| `categoryId` | string (UUID) | No | Identificador UUID de la clasificacion personalizada asignada. |
| `isPerishable` | boolean | No | Indica si el insumo es perecible y sujeto a caducidad (por defecto: `false`). |
| `minStockAlert` | number | No | Cantidad minima para alerta de reposicion (por defecto: `0`). |

**Ejemplo de Peticion:**
```json
{
  "sku": "EQU-ROT-001",
  "name": "Rotomartillo Bosch GBH 2-28 D 850W",
  "description": "Equipo electro-neumatico con encastre SDS Plus para perforacion en concreto",
  "baseUnit": "UNIDAD",
  "type": "EQUIPMENT",
  "isPerishable": false,
  "minStockAlert": 2
}
```

#### Respuestas
**201 Created - Item registrado:**
```json
{
  "id": "item-uuid-rotomartillo",
  "sku": "EQU-ROT-001",
  "name": "Rotomartillo Bosch GBH 2-28 D 850W",
  "description": "Equipo electro-neumatico con encastre SDS Plus para perforacion en concreto",
  "baseUnit": "UNIDAD",
  "type": "EQUIPMENT",
  "minStockAlert": "2.0000",
  "isPerishable": false,
  "createdAt": "2026-09-23T12:15:00.000Z",
  "updatedAt": "2026-09-23T12:15:00.000Z"
}
```

**409 Conflict - SKU duplicado:**
```json
{
  "statusCode": 409,
  "message": "Ya existe un item registrado con el SKU EQU-ROT-001",
  "error": "Conflict"
}
```

---

### 2.3 Listar Alertas de Insumos Perecibles con Stock Activo
Retorna todos los insumos catalogados como perecibles (`isPerishable: true`) que mantienen existencias fisicas activas (`physicalQty > 0`) en almacenes, detallando el stock por sede, la fecha del ultimo ingreso por compra y los dias transcurridos en almacenamiento.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/items/perishable-alerts`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
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
*Nota: Para usuarios con rol `WAREHOUSE_KEEPER`, el interceptor `CostMaskingInterceptor` enmascara automaticamente la propiedad `averageCost` en cada elemento del arreglo `stocks`.*

---

### 2.4 Obtener Detalle y Consolidado Corporativo de Stock
Obtiene la ficha del item junto con el desglose de existencias por almacen, calculando los totales fisicos, reservados y prestados a nivel de toda la empresa.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/items/:id`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
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
  "minStockAlert": "2.0000",
  "isPerishable": false,
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
  "aliases": []
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
  "isPerishable": false,
  "minStockAlert": "3.0000",
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

---

### 2.4 Actualizar Item
Modifica datos descriptivos, unidad base o limite de alerta de un SKU maestro.

- **Metodo:** `PUT`
- **Ruta:** `/api/v1/items/:id`
- **Acceso:** Protegido (`ADMIN`)
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
| `baseUnit` | string | No | Unidad base. |
| `type` | `CONSUMABLE` \| `TOOL` \| `EQUIPMENT` \| `MACHINERY` | No | Clasificacion del item. |
| `meterType` | `HOUR_METER` \| `KILOMETER` \| `null` | No | Tipo de medidor para maquinaria (`HOUR_METER` o `KILOMETER`). Si el item no es `MACHINERY`, el sistema lo limpia a `null`. |
| `categoryId` | string (UUID) \| `null` | No | Clasificacion personalizada asignada o `null` para desvincular. |
| `isPerishable` | boolean | No | Indicador de material perecible. |
| `minStockAlert` | number | No | Cantidad minima para alerta de reposicion. |

**Ejemplo de Peticion:**
```json
{
  "minStockAlert": 5,
  "isPerishable": false
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
  "minStockAlert": "5.0000",
  "isPerishable": false,
  "createdAt": "2026-09-23T12:15:00.000Z",
  "updatedAt": "2026-09-23T12:18:00.000Z"
}
```

---

### 2.5 Registrar Alias S10 de Equivalencia
Crea una regla de traduccion para nombres sin estandarizar leidos en presupuestos S10, vinculandolos a un SKU maestro con un factor de conversion.
Formula de conversion: `Cantidad_Item_Base = Cantidad_S10 * conversionFactor`.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/items/aliases`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`CreateItemAliasDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `itemId` | string (UUID) | Si | UUID del item maestro oficial. |
| `s10RawName` | string | Si | Nombre literal tal como aparece en el archivo del S10. |
| `s10Code` | string | No | Codigo de partida o recurso en el S10. |
| `s10Unit` | string | No | Unidad de medida indicada en el presupuesto S10. |
| `conversionFactor` | number | No | Factor multiplicador para convertir la cantidad de S10 a la unidad base (por defecto: `1.0`). |

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
**201 Created - Alias registrado:**
```json
{
  "id": "alias-uuid-cemento-1",
  "itemId": "item-uuid-cemento",
  "s10RawName": "CEMENTO PORTLAND TIPO I EN BOLSA DE 42.5 KG",
  "s10Code": "0204010001",
  "s10Unit": "BOL",
  "conversionFactor": "1.0000"
}
```

**409 Conflict - Nombre crudo ya asignado:**
```json
{
  "statusCode": 409,
  "message": "Ya existe un alias registrado para la cadena literal CEMENTO PORTLAND TIPO I EN BOLSA DE 42.5 KG",
  "error": "Conflict"
}
```

---

### 2.6 Eliminar Alias S10
Elimina un mapeo de equivalencia de S10 existente sin alterar el registro maestro del item.

- **Metodo:** `DELETE`
- **Ruta:** `/api/v1/items/aliases/:id`
- **Acceso:** Protegido (`ADMIN`)
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
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
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
- **Acceso:** Exclusivo `ADMIN`
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
- **Acceso:** Exclusivo `ADMIN`
- **Body (`UpdateItemCategoryDto`):** `name?`, `code?`, `description?`, `isActive?`

### 3.4 Eliminar o Desactivar Clasificacion
Elimina fisicamente la clasificacion si no tiene items asociados. Si cuenta con insumos asociados, la desactiva logicamente (`isActive: false`) preservando la integridad referencial.

- **Metodo:** `DELETE`
- **Ruta:** `/api/v1/item-categories/:id`
- **Acceso:** Exclusivo `ADMIN`

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
