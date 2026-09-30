# Modulo 09 - Proyectos, Ingesta S10 y Matriz de Brechas (Projects & S10)

## 1. Descripcion General
Este modulo vincula las obras de ingenieria civil con el sistema de abastecimiento mediante:
- Administracion de proyectos civiles y sus estados (`PLANNING`, `ACTIVE`, `LIQUIDATED`, `ARCHIVED`).
- Ingesta y decodificacion de presupuestos de obra provenientes de hojas tecnicas o exportaciones del software S10.
- Resolucion automatica de insumos mediante el diccionario de sinonimos (`ItemAlias`).
- Generacion de la **Matriz de Brechas (Gap Analysis)** para comparar en tiempo real la demanda presupuestada (`requiredQty`), el stock reservado en Almacen Central (`allocatedQty`) y el material consumido fisicamente en obra (`consumedQty`).
- Reserva logica de materiales en Almacen Central para el proyecto.

- **Ruta Base:** `/api/v1/projects`
- **Entidades Vinculadas:** `Project`, `ProjectRequirement`, `Item`, `ItemAlias`, `Warehouse`, `Stock`

---

## 2. Endpoints

### 2.1 Listar Proyectos
Retorna la relacion de obras civiles registradas con su estado, almacen de obra asignado y conteo de requerimientos.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/projects`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros Query (`ProjectFilterDto`)
| Parametro | Tipo | Por Defecto | Descripcion |
|---|---|---|---|
| `search` | string | opcional | Busqueda por nombre de obra o codigo de presupuesto. |
| `status` | `ProjectStatus` | opcional | Estado: `PLANNING`, `ACTIVE`, `LIQUIDATED`, `ARCHIVED`. |

#### Respuestas
**200 OK - Listado obtenido:**
```json
[
  {
    "id": "77777777-7777-7777-7777-777777777777",
    "name": "Residencial Las Palmeras - San Isidro",
    "budgetCode": "S10-OBRA-2026-01",
    "status": "ACTIVE",
    "createdAt": "2026-09-20T22:55:00.000Z",
    "warehouse": {
      "id": "44444444-4444-4444-4444-444444444444",
      "name": "Almacen Obra San Isidro",
      "type": "PROJECT_SITE",
      "isActive": true
    },
    "_count": {
      "requirements": 48
    }
  }
]
```

---

### 2.2 Registrar Nuevo Proyecto
Crea una obra civil y genera automaticamente su respectivo almacen de obra temporal de tipo `PROJECT_SITE`.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/projects`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`CreateProjectDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `name` | string | Si | Nombre descriptivo del proyecto u obra civil. |
| `budgetCode` | string | No | Codigo de presupuesto S10 asignado. |
| `status` | `ProjectStatus` | No | Estado inicial (por defecto: `PLANNING`). |
| `warehouseName` | string | No | Nombre personalizado del almacen de caseta (se autogenera si se omite). |

**Ejemplo de Peticion:**
```json
{
  "name": "Construccion Edificio Corporativo Los Sauces",
  "budgetCode": "S10-OBRA-2026-02",
  "status": "PLANNING"
}
```

#### Respuestas
**201 Created - Proyecto y almacen creados:**
```json
{
  "id": "88888888-8888-8888-8888-888888888888",
  "name": "Construccion Edificio Corporativo Los Sauces",
  "budgetCode": "S10-OBRA-2026-02",
  "status": "PLANNING",
  "createdAt": "2026-09-23T12:25:00.000Z",
  "updatedAt": "2026-09-23T12:25:00.000Z",
  "warehouse": {
    "id": "99999999-9999-9999-9999-999999999999",
    "name": "Almacen Obra Construccion Edificio Corporativo Los Sauces"
  }
}
```

**409 Conflict - Nombre duplicado:**
```json
{
  "statusCode": 409,
  "message": "Ya existe un proyecto registrado con ese nombre",
  "error": "Conflict"
}
```

---

### 2.3 Obtener Detalle de un Proyecto
Consulta la ficha integral del proyecto civil, incluyendo el almacen de obra, sus requerimientos presupuestados con sus items asociados y conteos operativos.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/projects/:id`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros
- `id` (URL Path): UUID del proyecto.

#### Respuestas
**200 OK - Proyecto encontrado:**
```json
{
  "id": "77777777-7777-7777-7777-777777777777",
  "name": "Residencial Las Palmeras - San Isidro",
  "budgetCode": "S10-OBRA-2026-01",
  "status": "ACTIVE",
  "createdAt": "2026-09-20T22:55:00.000Z",
  "warehouse": {
    "id": "44444444-4444-4444-4444-444444444444",
    "name": "Almacen Obra San Isidro",
    "type": "PROJECT_SITE",
    "isTemporary": true,
    "isActive": true
  },
  "requirements": [
    {
      "id": "req-uuid-1",
      "projectId": "77777777-7777-7777-7777-777777777777",
      "itemId": "item-uuid-cemento",
      "requiredQty": "2500.0000",
      "allocatedQty": "500.0000",
      "consumedQty": "1200.0000",
      "item": {
        "id": "item-uuid-cemento",
        "sku": "CEM-PORT-T1",
        "name": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
        "baseUnit": "BOLSA",
        "type": "CONSUMABLE"
      }
    }
  ],
  "_count": {
    "transfers": 12,
    "movements": 45,
    "requirements": 1
  }
}
```

---

### 2.4 Actualizar Proyecto
Modifica nombre, codigo de presupuesto o estado de la obra civil.

- **Metodo:** `PUT`
- **Ruta:** `/api/v1/projects/:id`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Parametros
- `id` (URL Path): UUID del proyecto.

#### Request Body (`UpdateProjectDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `name` | string | No | Nuevo nombre de la obra civil. |
| `budgetCode` | string | No | Codigo de presupuesto S10. |
| `status` | `ProjectStatus` | No | Nuevo estado del proyecto. |

#### Respuestas
**200 OK - Actualizado correctamente:**
```json
{
  "id": "77777777-7777-7777-7777-777777777777",
  "name": "Residencial Las Palmeras - San Isidro Fase 2",
  "budgetCode": "S10-OBRA-2026-01-REV1",
  "status": "ACTIVE",
  "updatedAt": "2026-09-23T12:28:00.000Z"
}
```

---

### 2.5 Ingesta de Presupuesto S10
Procesa un payload estructurado JSON con el listado de recursos del presupuesto S10. Mapea cada nombre crudo contra `ItemAlias` o `Item.name`. Si no existe equivalencia, el item se reporta como "No Mapeado" para que el administrador registre el alias correspondiente.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/projects/:id/ingest-s10`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`IngestS10Dto`)
```json
{
  "budgetCode": "S10-OBRA-2026-01",
  "resources": [
    {
      "s10Code": "0204010001",
      "s10RawName": "CEMENTO PORTLAND TIPO I (BOLSA 42.5KG)",
      "s10Unit": "BOL",
      "quantity": 2500
    },
    {
      "s10Code": "0202010005",
      "s10RawName": "ACERO CORRUGADO 1/2 FY=4200 KG/CM2",
      "s10Unit": "VAR",
      "quantity": 800
    }
  ]
}
```

#### Respuestas
**200 OK - Resumen de ingesta procesada:**
```json
{
  "projectId": "77777777-7777-7777-7777-777777777777",
  "totalProcessed": 2,
  "mappedCount": 2,
  "unmappedCount": 0,
  "unmappedItems": [],
  "requirementsCreatedOrUpdated": 2
}
```

---

### 2.6 Matriz de Brechas (Gap Analysis)
Calcula el estado del abastecimiento del proyecto comparando:
- `requiredQty`: Demanda total estipulada en el S10.
- `allocatedQty`: Cantidad reservada en Almacen Central a favor de esta obra.
- `consumedQty`: Cantidad ya entregada y consumida en el frente de trabajo.
- `pendingToSupply`: Cantidad restante por proveer (`requiredQty - allocatedQty - consumedQty`).

- **Metodo:** `GET`
- **Ruta:** `/api/v1/projects/:id/gap-analysis`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado a la obra)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Respuestas
**200 OK - Matriz de brechas calculada:**
```json
{
  "projectId": "77777777-7777-7777-7777-777777777777",
  "projectName": "Residencial Las Palmeras - San Isidro",
  "analysis": [
    {
      "itemId": "item-uuid-cemento",
      "sku": "CEM-PORT-T1",
      "itemName": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
      "baseUnit": "BOLSA",
      "requiredQty": "2500.0000",
      "allocatedQty": "500.0000",
      "consumedQty": "1200.0000",
      "pendingToSupply": "800.0000",
      "fulfillmentPercentage": 68.0
    }
  ]
}
```

---

### 2.7 Reservar Insumos en Almacen Central para el Proyecto
Incrementa `allocatedQty` en el requerimiento del proyecto y `Stock.reservedQty` en el Almacen Central tras validar que existe stock fisico disponible no comprometido (`physicalQty - reservedQty >= Q`).

- **Metodo:** `POST`
- **Ruta:** `/api/v1/projects/:id/allocate-stock` (alias `/api/v1/projects/:id/reserve`)
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`AllocateStockDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `centralWarehouseId` | string (UUID) | Si | Almacen Central donde se reservara el stock. |
| `itemId` | string (UUID) | Si | Insumo presupuestado a reservar. |
| `quantityToAllocate` | number | Si | Cantidad en unidad base a reservar (> 0). |

**Ejemplo de Peticion:**
```json
{
  "centralWarehouseId": "22222222-2222-2222-2222-222222222222",
  "itemId": "item-uuid-cemento",
  "quantityToAllocate": 300
}
```

#### Respuestas
**200 OK - Reserva confirmada:**
```json
{
  "projectId": "77777777-7777-7777-7777-777777777777",
  "itemId": "item-uuid-cemento",
  "allocatedQty": "800.0000",
  "centralWarehouseAvailableStock": "700.0000"
}
```

---

### 2.8 Liberar Stock Reservado en Almacen Central
Permite liberar de forma manual o correctiva existencias que fueron reservadas previamente pero que no seran despachadas a la obra. Decrementa `Stock.reservedQty` en Central y `ProjectRequirement.allocatedQty`.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/projects/:id/release-stock`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`ReleaseStockDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `centralWarehouseId` | string (UUID) | Si | Almacen Central de donde se libera la reserva. |
| `itemId` | string (UUID) | Si | Insumo cuya reserva se libera. |
| `quantityToRelease` | number | Si | Cantidad a liberar (> 0). |

**Ejemplo de Peticion:**
```json
{
  "centralWarehouseId": "22222222-2222-2222-2222-222222222222",
  "itemId": "item-uuid-cemento",
  "quantityToRelease": 100
}
```

#### Respuestas
**200 OK - Stock liberado:**
```json
{
  "projectId": "77777777-7777-7777-7777-777777777777",
  "itemId": "item-uuid-cemento",
  "allocatedQty": "700.0000",
  "releasedQty": "100.0000"
}
```

---

### 2.9 Importacion de Archivo S10 por Streaming (CSV / TXT)
Sube y procesa por streaming un archivo exportado de presupuesto S10 utilizando `papaparse` e `iconv-lite`:
- Deteccion automatica de delimitador (`;` o `,`).
- Deteccion de codificacion (`Windows-1252` vs `UTF-8`).
- Filtrado de recursos: se descartan `01 MANO DE OBRA` y `04 SUBCONTRATOS`; se procesan unicamente `02 MATERIALES` y `03 EQUIPOS`.
- Mapeo automatico con `ItemAlias` y conversion a unidad base.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/projects/:id/s10-import`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: multipart/form-data`

#### Parametros Form-Data
- `file`: Archivo CSV o TXT delimitado de exportacion S10.

#### Respuestas
**200 OK - Resumen de importacion:**
```json
{
  "projectId": "77777777-7777-7777-7777-777777777777",
  "totalRowsParsed": 120,
  "materialsAndEquipmentRows": 85,
  "mappedItems": 80,
  "unmappedItems": [
    {
      "s10Code": "0205010099",
      "s10RawName": "ADITIVO ACELERANTE ULTRA RAPIDO",
      "s10Unit": "GLN",
      "quantity": 15
    }
  ],
  "requirementsCreatedOrUpdated": 80
}
```

---

### 2.10 Protocolo de Liquidacion y Cierre Formal de Obra
Permite sellar la finalizacion de una obra civil pasando su estado a `LIQUIDATED` y desactivando su almacen de obra (`Warehouse.isActive = false`).

Exige el cumplimiento estricto e indivisible de **3 condiciones previas**:
1. **Stock Fisico Cero:** El almacen de obra no debe tener insumos remanentes en piso (`sum(Stock.physicalQty) == 0`). Todo remanente debe haberse consumido o retornado a Central via transferencia.
2. **Cero Prestamos de Herramientas Abiertos:** No deben existir vales de custodia pendientes de retorno vinculados a esta caseta (`ToolCustody` con `returnDate == null`).
3. **Cero Transferencias en Transito:** No deben existir traslados hacia o desde este almacen en estado `PENDING` o `IN_TRANSIT`.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/projects/:id/liquidate`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`LiquidateProjectDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `liquidationNotes` | string | No | Notas u observaciones del cierre formal y acta de entrega. |

**Ejemplo de Peticion:**
```json
{
  "liquidationNotes": "Obra concluida al 100% segun acta final de entrega y recepcion de obra"
}
```

#### Respuestas
**200 OK - Obra liquidada y almacen desactivado:**
```json
{
  "id": "77777777-7777-7777-7777-777777777777",
  "name": "Residencial Las Palmeras - San Isidro",
  "status": "LIQUIDATED",
  "liquidatedAt": "2026-09-30T14:40:00.000Z",
  "notes": "Obra concluida al 100% segun acta final de entrega y recepcion de obra",
  "warehouseDeactivated": {
    "id": "44444444-4444-4444-4444-444444444444",
    "isActive": false
  }
}
```

**400 Bad Request - Incumplimiento de condiciones de liquidacion:**
```json
{
  "statusCode": 400,
  "message": [
    "No se puede liquidar la obra: existen 25 unidades de stock fisico remanente en el almacen de obra",
    "No se puede liquidar la obra: existen 2 vales de herramientas pendientes de devolucion"
  ],
  "error": "Bad Request"
}
```
