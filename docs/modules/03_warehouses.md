# Modulo 03 - Almacenes, Stock y Alertas (Warehouses)

## 1. Descripcion General
El modulo de almacenes gestiona las ubicaciones de almacenamiento de la empresa:
- **Almacen Central (`CENTRAL`):** Centro logistico principal donde ingresan las compras directas de proveedores y se custodian los insumos de uso corporativo.
- **Almacenes de Obra (`PROJECT_SITE`):** Caseta temporal instalada en el frente de obra, vinculada opcionalmente a un proyecto especifico (`projectId`).

Ademas, este modulo expone el stock en piso en tiempo real y el monitoreo de alertas de reposicion por debajo del umbral minimo configurado.

- **Ruta Base:** `/api/v1/warehouses`
- **Entidades Vinculadas:** `Warehouse`, `Stock`, `Item`, `Project`, `UserWarehouse`

---

## 2. Endpoints

### 2.1 Listar Almacenes Accesibles
Retorna los almacenes a los que el usuario tiene acceso.
- Si el solicitante tiene rol `ADMIN`, retorna todos los almacenes registrados en el sistema.
- Si el solicitante tiene rol `WAREHOUSE_KEEPER`, retorna unicamente los almacenes autorizados en su perfil.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/warehouses`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Respuestas
**200 OK - Listado de almacenes:**
```json
[
  {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "Almacen Central Lima",
    "type": "CENTRAL",
    "isTemporary": false,
    "isActive": true,
    "projectId": null,
    "createdAt": "2026-09-20T22:55:00.000Z",
    "_count": {
      "stocks": 142
    }
  },
  {
    "id": "44444444-4444-4444-4444-444444444444",
    "name": "Almacen Obra San Isidro",
    "type": "PROJECT_SITE",
    "isTemporary": true,
    "isActive": true,
    "projectId": "77777777-7777-7777-7777-777777777777",
    "createdAt": "2026-09-21T10:00:00.000Z",
    "_count": {
      "stocks": 35
    }
  }
]
```

---

### 2.2 Crear Nuevo Almacen
Registra una nueva sede de almacenamiento en el sistema. Permite vincular un proyecto civil para almacenes temporales de obra.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/warehouses`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`CreateWarehouseDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `name` | string | Si | Nombre descriptivo del almacen. |
| `type` | `CENTRAL` \| `PROJECT_SITE` | Si | Tipo de almacen logistico o caseta de obra. |
| `isTemporary` | boolean | No | Marca si es caseta desmontable (por defecto: `false`). |
| `isActive` | boolean | No | Estado de operatividad (por defecto: `true`). |
| `projectId` | string (UUID) | No | Identificador del proyecto civil asociado. |

**Ejemplo de Peticion:**
```json
{
  "name": "Almacen Obra Puente Miraflores",
  "type": "PROJECT_SITE",
  "isTemporary": true,
  "isActive": true,
  "projectId": "88888888-8888-8888-8888-888888888888"
}
```

#### Respuestas
**201 Created - Almacen creado:**
```json
{
  "id": "99999999-9999-9999-9999-999999999999",
  "name": "Almacen Obra Puente Miraflores",
  "type": "PROJECT_SITE",
  "isTemporary": true,
  "isActive": true,
  "projectId": "88888888-8888-8888-8888-888888888888",
  "createdAt": "2026-09-23T12:10:00.000Z",
  "updatedAt": "2026-09-23T12:10:00.000Z"
}
```

**409 Conflict - Nombre o proyecto ya asociado:**
```json
{
  "statusCode": 409,
  "message": "Ya existe un almacen con el nombre Almacen Obra Puente Miraflores o el proyecto ya tiene un almacen asignado",
  "error": "Conflict"
}
```

---

### 2.3 Obtener Detalle de un Almacen
Consulta la ficha tecnica de un almacen por su identificador. Si el usuario es `WAREHOUSE_KEEPER`, se valida mediante `WarehouseAccessGuard` que tenga asignado dicho almacen.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/warehouses/:id`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros
- `id` (URL Path): UUID del almacen.

#### Respuestas
**200 OK - Almacen encontrado:**
```json
{
  "id": "44444444-4444-4444-4444-444444444444",
  "name": "Almacen Obra San Isidro",
  "type": "PROJECT_SITE",
  "isTemporary": true,
  "isActive": true,
  "projectId": "77777777-7777-7777-7777-777777777777",
  "project": {
    "id": "77777777-7777-7777-7777-777777777777",
    "name": "Residencial Las Palmeras - San Isidro",
    "budgetCode": "S10-OBRA-2026-01",
    "status": "ACTIVE"
  },
  "_count": {
    "stocks": 35
  }
}
```

**403 Forbidden - Sin autorizacion para este almacen:**
```json
{
  "statusCode": 403,
  "message": "No tiene permisos para operar en el almacen especificado",
  "error": "Forbidden"
}
```

---

### 2.4 Actualizar Almacen
Modifica nombre, estado o proyecto vinculado de una instalacion.

- **Metodo:** `PUT`
- **Ruta:** `/api/v1/warehouses/:id`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Parametros
- `id` (URL Path): UUID del almacen.

#### Request Body (`UpdateWarehouseDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `name` | string | No | Nuevo nombre del almacen. |
| `type` | `CENTRAL` \| `PROJECT_SITE` | No | Tipo de almacen. |
| `isTemporary` | boolean | No | Es caseta temporal de obra. |
| `isActive` | boolean | No | Habilitado o deshabilitado. |
| `projectId` | string (UUID) | No | Identificador del proyecto civil. |

**Ejemplo de Peticion:**
```json
{
  "name": "Almacen Obra San Isidro - Etapa II",
  "isActive": true
}
```

#### Respuestas
**200 OK - Actualizado correctamente:**
```json
{
  "id": "44444444-4444-4444-4444-444444444444",
  "name": "Almacen Obra San Isidro - Etapa II",
  "type": "PROJECT_SITE",
  "isTemporary": true,
  "isActive": true,
  "projectId": "77777777-7777-7777-7777-777777777777",
  "updatedAt": "2026-09-23T12:12:00.000Z"
}
```

---

### 2.5 Consultar Existencias de Stock
Retorna el inventario en piso del almacen con filtro opcional por termino de busqueda y tipo de item.
Aplica `CostMaskingInterceptor` para proteger costos financieros ante usuarios de caseta.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/warehouses/:id/stock`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros
- `id` (URL Path): UUID del almacen.
- `search` (Query Param, opcional): Termino de texto para filtrar por SKU o nombre de item.
- `type` (Query Param, opcional): `CONSUMABLE` o `ASSET_TOOL`.

**Ejemplo de URL con filtros:**
```http
GET /api/v1/warehouses/44444444-4444-4444-4444-444444444444/stock?search=cemento&type=CONSUMABLE
```

#### Respuestas Segun Rol

**Respuesta para ADMIN (Incluye costo promedio `averageCost` en Soles sin IGV):**
```json
[
  {
    "id": "stock-uuid-1",
    "warehouseId": "44444444-4444-4444-4444-444444444444",
    "itemId": "item-uuid-cemento",
    "physicalQty": "250.0000",
    "reservedQty": "0.0000",
    "loanedQty": "0.0000",
    "averageCost": "28.5000",
    "item": {
      "id": "item-uuid-cemento",
      "sku": "CEM-PORT-T1",
      "name": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
      "baseUnit": "BOLSA",
      "type": "CONSUMABLE",
      "minStockAlert": "50.0000"
    }
  }
]
```

**Respuesta para WAREHOUSE_KEEPER (Costo enmascarado por `CostMaskingInterceptor`):**
```json
[
  {
    "id": "stock-uuid-1",
    "warehouseId": "44444444-4444-4444-4444-444444444444",
    "itemId": "item-uuid-cemento",
    "physicalQty": "250.0000",
    "reservedQty": "0.0000",
    "loanedQty": "0.0000",
    "item": {
      "id": "item-uuid-cemento",
      "sku": "CEM-PORT-T1",
      "name": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
      "baseUnit": "BOLSA",
      "type": "CONSUMABLE",
      "minStockAlert": "50.0000"
    }
  }
]
```

---

### 2.6 Consultar Alertas de Stock Minimo
Determina y lista de manera reactiva todos los insumos cuyo stock fisico (`physicalQty`) es menor o igual al umbral minimo configurado (`minStockAlert`), indicando la cantidad faltante para reposicion inmediata.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/warehouses/:id/alerts`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros
- `id` (URL Path): UUID del almacen.

#### Respuestas
**200 OK - Listado de alertas:**
```json
[
  {
    "itemId": "item-uuid-cemento",
    "sku": "CEM-PORT-T1",
    "name": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
    "baseUnit": "BOLSA",
    "physicalQty": 15,
    "minStockAlert": 50,
    "deficitQty": 35
  },
  {
    "itemId": "item-uuid-disco",
    "sku": "HERR-DISC-07",
    "name": "Disco de Corte Diamantado 7 pulg",
    "baseUnit": "UND",
    "physicalQty": 2,
    "minStockAlert": 10,
    "deficitQty": 8
  }
]
```
