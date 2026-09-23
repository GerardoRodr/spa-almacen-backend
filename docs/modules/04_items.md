# Modulo 04 - Catalogo de Items y Alias S10 (Items)

## 1. Descripcion General
El modulo de catalogo maestro centraliza el inventario corporativo de insumos y equipos divididos en:
- **Consumibles (`CONSUMABLE`):** Materiales directos que se consumen y extinguen fisicamente en la ejecucion de las partidas de obra (cemento, acero corrugado, arena, tuberias).
- **Herramientas y Equipos (`ASSET_TOOL`):** Bienes patrimoniales no consumibles sujetos a custodia, prestamo a operarios y control de retorno a caseta (rotomartillos, teodolitos, amoladoras, escaleras).

Adicionalmente, este modulo implementa la capa de homologacion de nombres crudos provenientes del software de presupuestos S10 (`ItemAlias`), permitiendo mapear denominaciones no estandarizadas hacia el SKU unico con su respectivo factor de conversion de unidades.

- **Ruta Base:** `/api/v1/items`
- **Entidades Vinculadas:** `Item`, `ItemAlias`, `Stock`, `Warehouse`

---

## 2. Endpoints

### 2.1 Listar Catalogo Paginado
Obtiene el listado de insumos y herramientas con paginacion, busqueda por texto en SKU o nombre, y filtro por tipo de recurso.

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
| `type` | `CONSUMABLE` \| `ASSET_TOOL` | opcional | Filtro por clasificacion del item. |

**Ejemplo de Peticion:**
```http
GET /api/v1/items?page=1&limit=10&search=fierro&type=CONSUMABLE
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
| `sku` | string | Si | Codigo unico de inventario (ej. `CEM-PORT-T1`). |
| `name` | string | Si | Nombre formal del producto o herramienta. |
| `description` | string | No | Ficha o especificacion tecnica resumida. |
| `baseUnit` | string | Si | Unidad de medida base de control (ej. `UND`, `KG`, `M3`, `BOLSA`, `VARILLA`). |
| `type` | `CONSUMABLE` \| `ASSET_TOOL` | Si | Clasificacion contable y operativa. |
| `minStockAlert` | number | No | Cantidad minima para alerta de reposicion (por defecto: `0`). |

**Ejemplo de Peticion:**
```json
{
  "sku": "HERR-TALADRO-ROTO",
  "name": "Rotomartillo SDS-Plus 800W",
  "description": "Equipo para perforacion en concreto con maletin y accesorios",
  "baseUnit": "UND",
  "type": "ASSET_TOOL",
  "minStockAlert": 3
}
```

#### Respuestas
**201 Created - Item registrado:**
```json
{
  "id": "item-uuid-rotomartillo",
  "sku": "HERR-TALADRO-ROTO",
  "name": "Rotomartillo SDS-Plus 800W",
  "description": "Equipo para perforacion en concreto con maletin y accesorios",
  "baseUnit": "UND",
  "type": "ASSET_TOOL",
  "minStockAlert": "3.0000",
  "createdAt": "2026-09-23T12:15:00.000Z",
  "updatedAt": "2026-09-23T12:15:00.000Z"
}
```

**409 Conflict - SKU duplicado:**
```json
{
  "statusCode": 409,
  "message": "Ya existe un item registrado con el SKU HERR-TALADRO-ROTO",
  "error": "Conflict"
}
```

---

### 2.3 Obtener Detalle y Consolidado Corporativo de Stock
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
  "sku": "HERR-TALADRO-ROTO",
  "name": "Rotomartillo SDS-Plus 800W",
  "baseUnit": "UND",
  "type": "ASSET_TOOL",
  "minStockAlert": "3.0000",
  "totalPhysicalQty": 12,
  "totalReservedQty": 2,
  "totalLoanedQty": 4,
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
        "type": "CENTRAL"
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
        "type": "PROJECT_SITE"
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
  "baseUnit": "UND",
  "type": "ASSET_TOOL",
  "minStockAlert": "3.0000",
  "totalPhysicalQty": 12,
  "totalReservedQty": 2,
  "totalLoanedQty": 4,
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
        "type": "CENTRAL"
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
        "type": "PROJECT_SITE"
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
| `sku` | string | No | Nuevo codigo SKU. |
| `name` | string | No | Nombre del item. |
| `description` | string | No | Descripcion tecnica. |
| `baseUnit` | string | No | Unidad base. |
| `type` | `CONSUMABLE` \| `ASSET_TOOL` | No | Clasificacion del item. |
| `minStockAlert` | number | No | Cantidad minima para alerta de reposicion. |

**Ejemplo de Peticion:**
```json
{
  "minStockAlert": 5
}
```

#### Respuestas
**200 OK - Item actualizado:**
```json
{
  "id": "item-uuid-rotomartillo",
  "sku": "HERR-TALADRO-ROTO",
  "name": "Rotomartillo SDS-Plus 800W",
  "minStockAlert": "5.0000",
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
  "id": "alias-uuid-cemento-1",
  "itemId": "item-uuid-cemento",
  "s10RawName": "CEMENTO PORTLAND TIPO I EN BOLSA DE 42.5 KG"
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
