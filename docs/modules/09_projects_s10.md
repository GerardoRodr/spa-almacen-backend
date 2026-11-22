# Modulo 09 - Proyectos, Ingesta S10 y Matriz de Brechas (Projects & S10)

## 1. Descripcion General
Este modulo vincula las obras de ingenieria civil con el sistema de abastecimiento mediante:
- Administracion de proyectos civiles y sus estados (`PLANNING`, `ACTIVE`, `LIQUIDATED`, `ARCHIVED`).
- Vinculacion de almacenes de obra (`PROJECT_SITE`) existentes y disponibles (`warehouseId`) o generacion automatica de una caseta temporal, asi como cambio controlado del almacen asignado con validacion estricta de integridad.
- Ingesta y decodificacion de presupuestos de obra provenientes de hojas tecnicas o exportaciones del software S10, con persistencia local del archivo CSV/TXT en disco (`s10FilePath`, `s10FileName`, `s10UploadedAt`), descarga protegida y eliminacion.
- Resolucion automatica de insumos activos (`isActive: true`) mediante el diccionario de sinonimos (`ItemAlias`) y el catalogo maestro.
- Generacion y edicion manual completa (exclusivo `ADMIN`) de la **Matriz de Brechas (Gap Analysis)** para comparar en tiempo real la demanda presupuestada (`requiredQty`), el stock reservado en Almacen Central (`allocatedQty`) y el material consumido fisicamente en obra (`consumedQty`).
- Reserva logica y liberacion de materiales en Almacen Central para el proyecto, asi como liquidacion formal y cierre de obra.

- **Ruta Base:** `/api/v1/projects`
- **Entidades Vinculadas:** `Project`, `ProjectRequirement`, `Item`, `ItemAlias`, `Warehouse`, `Stock`, `ToolCustody`, `Transfer`

### Campos de Persistencia S10 en `Project`
El modelo `Project` en Prisma almacena los siguientes campos para el archivo CSV/TXT importado desde S10:
- `s10FilePath` (`String?`): Ruta relativa interna en disco dentro de `UPLOAD_DIR/s10/` (ej. `s10/s10-<projectId>-<uuid>.csv`).
- `s10FileName` (`String?`): Nombre original del archivo CSV/TXT cargado (ej. `presupuesto-yanivilca.csv`).
- `s10UploadedAt` (`DateTime?`): Marca de tiempo UTC de la ultima carga del archivo S10.

---

## 2. Endpoints

### 2.1 Listar Proyectos
Retorna la relacion de obras civiles registradas con su estado, metadatos S10 (incluyendo informacion del archivo persistido), almacen de obra asignado y conteo de requerimientos.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/projects`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
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
    "budgetCode": "1101024",
    "status": "ACTIVE",
    "s10Location": "LA LIBERTAD - SANTIAGO DE CHUCO - QUIRUVILCA",
    "s10Ubigeo": "131006",
    "s10BudgetDate": "2025-11-01T00:00:00.000Z",
    "s10TotalBudget": "3479983.23",
    "s10MaterialsBudget": "1135524.35",
    "s10EquipmentBudget": "153599.14",
    "s10LaborBudget": "1587459.81",
    "s10SubcontractsBudget": "603399.93",
    "s10FilePath": "s10/s10-77777777-7777-7777-7777-777777777777-a1b2c3d4.csv",
    "s10FileName": "presupuesto-las-palmeras.csv",
    "s10UploadedAt": "2026-11-22T18:00:00.000Z",
    "createdAt": "2026-09-20T22:55:00.000Z",
    "updatedAt": "2026-11-22T18:00:00.000Z",
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

> **Aislamiento RBAC:** Para usuarios con rol `WAREHOUSE_KEEPER`, los campos monetarios `s10TotalBudget`, `s10MaterialsBudget`, `s10EquipmentBudget`, `s10LaborBudget` y `s10SubcontractsBudget` son purgados automaticamente de la respuesta por `CostMaskingInterceptor`. Se preservan los metadatos operativos `s10Location`, `s10Ubigeo`, `s10BudgetDate`, `s10FileName` y `s10UploadedAt`, y el listado queda acotado unicamente a los proyectos cuyo almacen tiene asignado el operador.

---

### 2.2 Registrar Nuevo Proyecto
Crea una obra civil en transaccion atomica. Permite dos modalidades para el almacen de obra:
1. **Vincular un almacen existente (`warehouseId`):** Asocia un almacen activo de tipo `PROJECT_SITE` sin proyecto asignado (`projectId: null`), sin crear un almacen nuevo. Para consultar los almacenes disponibles antes de enviar el formulario, utilizar el endpoint `GET /api/v1/warehouses/available-for-project` (ver [Modulo 03 - Almacenes y Stock](03_warehouses.md)).
2. **Creacion automatica (sin `warehouseId`):** Genera automaticamente un almacen temporal de tipo `PROJECT_SITE` (`isTemporary: true`, `isActive: true`) vinculado al nuevo proyecto.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/projects`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`CreateProjectDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `name` | string | Si | Nombre descriptivo del proyecto u obra civil (maximo 200 caracteres). |
| `budgetCode` | string | No | Codigo de presupuesto S10 asignado. |
| `status` | `ProjectStatus` | No | Estado inicial (por defecto: `PLANNING`). |
| `warehouseName` | string | No | Nombre personalizado del almacen temporal autogenerado (se ignora si se envia `warehouseId`; si se omite, se autogenera). |
| `warehouseId` | string (UUID v4) | No | UUID de un almacen existente activo de tipo `PROJECT_SITE` con `projectId: null` para vincular al proyecto en lugar de crear uno temporal. Una cadena vacia `""` se normaliza a `undefined`. |

**Ejemplo de Peticion (creando almacen temporal automatico):**
```json
{
  "name": "Construccion Edificio Corporativo Los Sauces",
  "budgetCode": "S10-OBRA-2026-02",
  "status": "PLANNING"
}
```

**Ejemplo de Peticion (vinculando un almacen `PROJECT_SITE` existente disponible):**
```json
{
  "name": "Construccion Edificio Corporativo Los Sauces",
  "budgetCode": "S10-OBRA-2026-02",
  "status": "PLANNING",
  "warehouseId": "b0000000-0000-4000-8000-000000000002"
}
```

#### Validaciones sobre `warehouseId`
Si se especifica `warehouseId`, el backend valida dentro de la transaccion:
- Que el almacen exista (`404 Not Found` si no existe).
- Que sea de tipo `PROJECT_SITE` (`400 Bad Request` si es `CENTRAL`).
- Que se encuentre activo (`isActive: true`, `400 Bad Request` si esta inactivo).
- Que no pertenezca a otro proyecto (`projectId === null`, `409 Conflict` si ya esta ocupado).

#### Respuestas
**201 Created - Proyecto creado y almacen creado o vinculado:**
```json
{
  "id": "88888888-8888-8888-8888-888888888888",
  "name": "Construccion Edificio Corporativo Los Sauces",
  "budgetCode": "S10-OBRA-2026-02",
  "status": "PLANNING",
  "s10Location": null,
  "s10Ubigeo": null,
  "s10BudgetDate": null,
  "s10TotalBudget": null,
  "s10MaterialsBudget": null,
  "s10EquipmentBudget": null,
  "s10LaborBudget": null,
  "s10SubcontractsBudget": null,
  "s10FilePath": null,
  "s10FileName": null,
  "s10UploadedAt": null,
  "createdAt": "2026-09-23T12:25:00.000Z",
  "updatedAt": "2026-09-23T12:25:00.000Z",
  "warehouse": {
    "id": "99999999-9999-9999-9999-999999999999",
    "name": "Almacen Obra Construccion Edificio Corporativo Los Sauces"
  }
}
```

**400 Bad Request - Almacen destino no valido (tipo distinto de `PROJECT_SITE` o inactivo):**
```json
{
  "statusCode": 400,
  "message": "Solo se pueden asignar almacenes de tipo Obra (PROJECT_SITE) a un proyecto",
  "error": "Bad Request"
}
```

**404 Not Found - Almacen inexistente:**
```json
{
  "statusCode": 404,
  "message": "El almacen seleccionado no existe",
  "error": "Not Found"
}
```

**409 Conflict - Nombre duplicado o almacen ya asignado a otro proyecto:**
```json
{
  "statusCode": 409,
  "message": "Ya existe un proyecto registrado con ese nombre",
  "error": "Conflict"
}
```

---

### 2.3 Obtener Detalle de un Proyecto
Consulta la ficha integral del proyecto civil, incluyendo el almacen de obra, metadatos del archivo S10 persistido, sus requerimientos presupuestados con sus items asociados y conteos operativos.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/projects/:id`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER` asignado)
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
  "budgetCode": "1101024",
  "status": "ACTIVE",
  "s10Location": "LA LIBERTAD - SANTIAGO DE CHUCO - QUIRUVILCA",
  "s10Ubigeo": "131006",
  "s10BudgetDate": "2025-11-01T00:00:00.000Z",
  "s10TotalBudget": "3479983.23",
  "s10MaterialsBudget": "1135524.35",
  "s10EquipmentBudget": "153599.14",
  "s10LaborBudget": "1587459.81",
  "s10SubcontractsBudget": "603399.93",
  "s10FilePath": "s10/s10-77777777-7777-7777-7777-777777777777-a1b2c3d4.csv",
  "s10FileName": "presupuesto-las-palmeras.csv",
  "s10UploadedAt": "2026-11-22T18:00:00.000Z",
  "createdAt": "2026-09-20T22:55:00.000Z",
  "updatedAt": "2026-11-22T18:00:00.000Z",
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
      "s10UnitPrice": "26.5000",
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

> **Aislamiento RBAC:** Los campos financieros `s10TotalBudget`, `s10MaterialsBudget`, `s10EquipmentBudget`, `s10LaborBudget`, `s10SubcontractsBudget` y `requirements[].s10UnitPrice` se purgan automaticamente para `WAREHOUSE_KEEPER` (`ADMIN` y `MODERATOR` acceden a los montos completos). Si el almacenero no tiene asignado el almacen del proyecto, se retorna `403 Forbidden`.

---

### 2.4 Actualizar Proyecto y Cambiar Almacen Asignado
Modifica nombre, codigo de presupuesto, estado de la obra civil y opcionalmente cambia el almacen de obra (`PROJECT_SITE`) asignado al proyecto.

- **Metodo:** `PUT`
- **Ruta:** `/api/v1/projects/:id`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Parametros
- `id` (URL Path): UUID del proyecto.

#### Request Body (`UpdateProjectDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `name` | string | No | Nuevo nombre de la obra civil (maximo 200 caracteres). |
| `budgetCode` | string | No | Codigo de presupuesto S10. |
| `status` | `ProjectStatus` | No | Nuevo estado del proyecto. |
| `warehouseId` | string (UUID v4) | No | UUID del nuevo almacen `PROJECT_SITE` activo y disponible (`projectId: null`) a asignar al proyecto. Consultar disponibles via `GET /api/v1/warehouses/available-for-project`. Cadenas vacias `""` se normalizan a `undefined`. |

#### Reglas Transaccionales al Cambiar `warehouseId`
Cuando se envia un `warehouseId` diferente al almacen actualmente asignado al proyecto, el backend ejecuta una transaccion atomica que exige:
1. **Validacion del almacen destino:** Debe existir (`404`), ser `PROJECT_SITE` (`400`), estar activo (`400`) y no estar asignado a otro proyecto (`409`).
2. **Validacion estricta de integridad sobre el almacen anterior (si existia):**
   - **Stock en cero:** `SUM(Stock.physicalQty) == 0` y `SUM(Stock.reservedQty) == 0`.
   - **Cero custodias abiertas:** Ningun registro en `ToolCustody` con `returnDate: null` y `isReverted: false`.
   - **Cero transferencias activas:** Ningun registro en `Transfer` (como origen o destino) en estado `PENDING` o `IN_TRANSIT`.
   - Si cualquiera de estas condiciones falla, la operacion es rechazada con **`409 Conflict`** antes de realizar ningun cambio.
3. **Reasignacion atomica:** Desvincula el almacen anterior (`projectId = null`), vincula el nuevo almacen (`projectId = id`) y actualiza los datos generales del proyecto.

**Ejemplo de Peticion:**
```json
{
  "name": "Residencial Las Palmeras - San Isidro Fase 2",
  "budgetCode": "S10-OBRA-2026-01-REV1",
  "status": "ACTIVE",
  "warehouseId": "b0000000-0000-4000-8000-000000000002"
}
```

#### Respuestas
**200 OK - Actualizado correctamente:**
```json
{
  "id": "77777777-7777-7777-7777-777777777777",
  "name": "Residencial Las Palmeras - San Isidro Fase 2",
  "budgetCode": "S10-OBRA-2026-01-REV1",
  "status": "ACTIVE",
  "updatedAt": "2026-09-23T12:28:00.000Z",
  "warehouse": {
    "id": "b0000000-0000-4000-8000-000000000002",
    "name": "Caseta Obra San Isidro Sector Norte",
    "type": "PROJECT_SITE",
    "isActive": true
  }
}
```

**409 Conflict - Bloqueo de integridad sobre el almacen anterior (stock, custodias o transferencias activas):**
```json
{
  "statusCode": 409,
  "message": "No se puede cambiar el almacen \"Almacen Obra San Isidro\": mantiene existencias fisicas (45) o reservadas (0). Transfiera o liquide el stock antes de desvincularlo.",
  "error": "Conflict"
}
```
(Otros mensajes de `409 Conflict`: prestamos de herramientas sin devolver, transferencias en estado `PENDING` o `IN_TRANSIT`, almacen destino ya asignado a otro proyecto, o nombre duplicado con otro proyecto).

---

### 2.5 Ingesta de Presupuesto S10 (JSON)
Procesa un payload estructurado JSON con el listado de recursos del presupuesto S10. Descarta recursos de mano de obra (`01`) y subcontratos (`04`), y mapea cada recurso de materiales (`02`) o equipos (`03`) contra `ItemAlias` (por `s10RawName` o `s10Code`) o directamente contra el catalogo maestro (`Item.name` o `Item.sku`).

> **Filtro de catalogo activo:** `ingestS10` carga y considera unicamente items activos (`isActive: true`) del catalogo maestro para las resoluciones por nombre y SKU, evitando vincular insumos dados de baja. Si no existe equivalencia, el recurso se reporta en `unmappedItems` para que el administrador registre el alias correspondiente.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/projects/:id/ingest-s10`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`IngestS10Dto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `mode` | `'REPLACE'` \| `'ACCUMULATE'` | No | Estrategia de actualizacion de `requiredQty` (por defecto: `REPLACE`). En ambos casos valida que el nuevo `requiredQty` no sea menor que `allocatedQty`. |
| `budgetCode` | string | No | Codigo de presupuesto S10 del proyecto. |
| `s10Location` | string | No | Ubicacion geografica del expediente S10. |
| `s10Ubigeo` | string | No | Codigo de Ubigeo S10. |
| `s10BudgetDate` | string \| Date | No | Fecha original del presupuesto S10. |
| `s10TotalBudget` | number | No | Costo directo total presupuestado en PEN. |
| `s10MaterialsBudget` | number | No | Subtotal Grupo 02 (Materiales) en PEN. |
| `s10EquipmentBudget` | number | No | Subtotal Grupo 03 (Equipos/Herramientas) en PEN. |
| `s10LaborBudget` | number | No | Subtotal Grupo 01 (Mano de Obra) en PEN. |
| `s10SubcontractsBudget` | number | No | Subtotal Grupo 04 (Subcontratos) en PEN. |
| `resources` | `S10ResourceItemDto[]` | Si | Lista de recursos extraidos del presupuesto S10. |

**Ejemplo de Peticion:**
```json
{
  "mode": "REPLACE",
  "budgetCode": "S10-OBRA-2026-01",
  "resources": [
    {
      "s10Code": "0204010001",
      "s10RawName": "CEMENTO PORTLAND TIPO I (BOLSA 42.5KG)",
      "s10Unit": "BOL",
      "quantity": 2500,
      "unitPrice": 26.5
    },
    {
      "s10Code": "0202010005",
      "s10RawName": "ACERO CORRUGADO 1/2 FY=4200 KG/CM2",
      "s10Unit": "VAR",
      "quantity": 800,
      "unitPrice": 36.0
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

**400 Bad Request - Proyecto liquidado/archivado o reduccion de `requiredQty` por debajo de `allocatedQty`:**
```json
{
  "statusCode": 400,
  "message": "No se pueden cargar requerimientos a un proyecto en estado LIQUIDATED o ARCHIVED",
  "error": "Bad Request"
}
```

---

### 2.6 Importacion de Archivo S10 por Streaming (CSV / TXT) y Persistencia en Disco
Sube, parsea, procesa y persiste en disco un archivo exportado de presupuesto S10 utilizando `papaparse`, `iconv-lite` y `StorageService`:
- Decodificacion de buffer con deteccion automatica entre `Windows-1252` y `UTF-8`.
- Deteccion automatica de delimitador predominante (`;` o `,`).
- Lectura en matriz cruda bidimensional sin asumir encabezados (`header: false`), tolerando reportes de Crystal Reports donde las etiquetas se repiten en cada fila.
- Extraccion automatica de metadatos de obra buscando `"Obra"`, `"Fecha"`, `"Lugar"` y `"TOTAL"`, actualizando `budgetCode`, ubicacion, ubigeo, fecha y KPIs presupuestales en `Project`.
- Deteccion heuristica por firma de codigo de insumo S10 (cadena puramente numerica de 10 a 14 digitos que inicia en `01`, `02`, `03` o `04`).
- Filtrado de recursos por prefijo numerico: descarte inmediato de `01` (Mano de Obra) y `04` (Subcontratos); admision exclusiva de `02` (Materiales) y `03` (Equipos).
- Extraccion por adyacencia relativa: la celda +1 es la descripcion, +2 la unidad y +3 la cantidad metrada.
- Calculo resiliente de precio unitario sobre celdas +4 y +5 (soportando reportes clasicos y reportes con incidencia `%`).
- Ejecucion de `ingestS10` en modo `REPLACE` con resolucion contra `ItemAlias` e items activos (`isActive: true`).
- **Persistencia en disco (`UPLOAD_DIR/s10/`):** Guarda el archivo fisico en `s10/s10-<projectId>-<uuid>.<csv|txt>`, elimina automaticamente el archivo fisico anterior si el proyecto ya tenia uno almacenado, y actualiza `s10FilePath`, `s10FileName` y `s10UploadedAt` en `Project`.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/projects/:id/s10-import`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: multipart/form-data`

#### Parametros Form-Data
- `file`: Archivo CSV o TXT delimitado de exportacion S10.

#### Respuestas
**200 OK - Resumen de importacion y metadatos del archivo persistido:**
```json
{
  "projectId": "77777777-7777-7777-7777-777777777777",
  "s10ProjectCode": "1101024",
  "s10ProjectName": "MEJORAMIENTO Y AMPLIACION DEL SERVICIO DE AGUA POTABLE RURAL...",
  "s10FileName": "presupuesto-obra-yanivilca.csv",
  "s10UploadedAt": "2026-11-22T18:00:00.000Z",
  "totalRowsParsed": 296,
  "materialsAndEquipmentRows": 271,
  "budgetSummary": {
    "totalDirectCost": 3479983.23,
    "materialsTotal": 1135524.35,
    "equipmentTotal": 153599.14,
    "laborTotal": 1587459.81,
    "subcontractsTotal": 603399.93,
    "location": "LA LIBERTAD - SANTIAGO DE CHUCO - QUIRUVILCA",
    "ubigeo": "131006",
    "budgetDate": "2025-11-01T00:00:00.000Z"
  },
  "mappedItems": 80,
  "unmappedItems": [
    {
      "s10Code": "0205010099",
      "s10RawName": "ADITIVO ACELERANTE ULTRA RAPIDO",
      "s10Unit": "GLN",
      "quantity": 15,
      "unitPrice": 42.5,
      "suggestedType": "CONSUMABLE"
    }
  ],
  "requirementsCreatedOrUpdated": 80
}
```

**400 Bad Request - Archivo faltante/vacio, hoja sin recursos `02`/`03` validos o proyecto liquidado/archivado.**

---

### 2.7 Descargar Archivo S10 Persistido
Permite la descarga protegida del ultimo archivo CSV o TXT de S10 almacenado en disco para el proyecto.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/projects/:id/s10-file`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER` asignado al almacen del proyecto)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros
- `id` (URL Path): UUID del proyecto.

#### Respuestas
**200 OK - Stream binario del archivo S10:**
- **Cabeceras de respuesta:**
  - `Content-Type`: `text/csv; charset=utf-8` (o `text/plain; charset=utf-8` si `s10FileName` termina en `.txt`).
  - `Content-Disposition`: `attachment; filename="<encodeURIComponent(s10FileName)>"`
- **Cuerpo:** Flujo de bytes del archivo guardado en `UPLOAD_DIR/s10/`.

**403 Forbidden - Usuario `WAREHOUSE_KEEPER` sin acceso al almacen del proyecto.**

**404 Not Found - Proyecto inexistente o sin archivo S10 guardado:**
```json
{
  "statusCode": 404,
  "message": "El proyecto no tiene un archivo S10 almacenado",
  "error": "Not Found"
}
```

---

### 2.8 Eliminar Archivo S10 Persistido
Elimina fisicamente el archivo CSV/TXT guardado en `UPLOAD_DIR/s10/` y limpia los campos `s10FilePath`, `s10FileName` y `s10UploadedAt` en `Project` dejandolos en `null`. Los requerimientos ya cargados en `ProjectRequirement` no se eliminan.

- **Metodo:** `DELETE`
- **Ruta:** `/api/v1/projects/:id/s10-file`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Parametros
- `id` (URL Path): UUID del proyecto.

#### Respuestas
**200 OK - Archivo eliminado y metadatos limpiados:**
```json
{
  "deleted": true,
  "projectId": "77777777-7777-7777-7777-777777777777",
  "message": "Archivo S10 eliminado exitosamente"
}
```

**404 Not Found - Proyecto inexistente o sin archivo S10 guardado:**
```json
{
  "statusCode": 404,
  "message": "El proyecto no tiene un archivo S10 almacenado",
  "error": "Not Found"
}
```

---

### 2.9 Matriz de Brechas (Gap Analysis)
Calcula el estado del abastecimiento del proyecto comparando:
- `requirementId`: Identificador UUID de la fila (`ProjectRequirement.id`), utilizado para operaciones de edicion (`PUT /requirements/:reqId`) y eliminacion (`DELETE /requirements/:reqId`).
- `requiredQty`: Demanda total estipulada en el S10 o agregada manualmente.
- `allocatedQty`: Cantidad reservada en Almacen Central a favor de esta obra.
- `consumedQty`: Cantidad ya entregada y consumida en el frente de trabajo.
- `pendingToSupply`: Cantidad restante por proveer (`requiredQty - allocatedQty - consumedQty`).
- `fulfillmentPercentage`: Porcentaje de cobertura alcanzado.
- `centralAvailableStock`: Stock neto disponible y no comprometido en Almacenes Centrales.
- `purchaseDeficit`: Deficit real requerido para compra directa.
- `minHistoricalUnitCost`: Menor precio unitario base en Soles registrado en compras historicas vigentes (`purchase.isReverted = false`, excluyendo facturas anuladas) para ese insumo (`null` si no registra compras vigentes).
- `weightedAverageCost`: Costo promedio ponderado (CPP) vigente en stock (priorizando el almacen de obra o referencia central).
- `s10BudgetUnitPrice`: Precio unitario presupuestado en el expediente S10 (`null` si no se cargo precio).

> **Aislamiento RBAC:** Las claves financieras `minHistoricalUnitCost`, `weightedAverageCost` y `s10BudgetUnitPrice` son filtradas automaticamente por `CostMaskingInterceptor` si la consulta es realizada por un usuario con rol `WAREHOUSE_KEEPER` (`ADMIN` y `MODERATOR` visualizan los importes completos).

- **Metodo:** `GET`
- **Ruta:** `/api/v1/projects/:id/gap-analysis`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER` asignado a la obra)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Respuestas
**200 OK - Matriz de brechas calculada (Vista ADMIN):**
```json
{
  "projectId": "77777777-7777-7777-7777-777777777777",
  "projectName": "Residencial Las Palmeras - San Isidro",
  "budgetSummary": {
    "totalBudgetPEN": 3479983.23,
    "materialsBudgetPEN": 1135524.35,
    "equipmentBudgetPEN": 153599.14,
    "laborBudgetPEN": 1587459.81,
    "subcontractsBudgetPEN": 603399.93,
    "totalRequiredItemsCount": 48,
    "totalDeficitEstimatedCostPEN": 2650.00
  },
  "analysis": [
    {
      "requirementId": "req-uuid-1",
      "itemId": "item-uuid-cemento",
      "sku": "CEM-PORT-T1",
      "itemName": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
      "baseUnit": "BOLSA",
      "requiredQty": "2500.0000",
      "allocatedQty": "500.0000",
      "consumedQty": "1200.0000",
      "pendingToSupply": "800.0000",
      "fulfillmentPercentage": 68.0,
      "centralAvailableStock": "700.0000",
      "purchaseDeficit": "100.0000",
      "minHistoricalUnitCost": "26.2500",
      "weightedAverageCost": "28.0000",
      "s10BudgetUnitPrice": "26.5000"
    }
  ]
}
```

> **Aislamiento RBAC:** Para usuarios con rol `WAREHOUSE_KEEPER`, las claves financieras en `budgetSummary` (`totalBudgetPEN`, `materialsBudgetPEN`, `equipmentBudgetPEN`, `laborBudgetPEN`, `subcontractsBudgetPEN`, `totalDeficitEstimatedCostPEN`) y en `analysis` (`minHistoricalUnitCost`, `weightedAverageCost`, `s10BudgetUnitPrice`) son purgadas automaticamente por `CostMaskingInterceptor`. El usuario de caseta visualiza unicamente cantidades operativas y `totalRequiredItemsCount`. Los roles `ADMIN` y `MODERATOR` acceden a la valorizacion completa.

---

### 2.10 Agregar Requerimiento Manual a la Matriz de Brechas
Permite insertar manualmente una fila de insumo en la Matriz de Brechas (`ProjectRequirement`) sin necesidad de reimportar un archivo S10.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/projects/:id/requirements`
- **Acceso:** Protegido (Exclusivo `ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Parametros
- `id` (URL Path): UUID del proyecto.

#### Request Body (`CreateProjectRequirementDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `itemId` | string (UUID v4) | Si | Identificador UUID del insumo activo del catalogo maestro. |
| `requiredQty` | number | Si | Cantidad metrada requerida en la unidad base del insumo (`>= 0.0001`). |
| `s10UnitPrice` | number \| null | No | Precio unitario referencial S10 en PEN (`>= 0` o `null`). |

#### Reglas de Negocio
- El proyecto debe existir y estar abierto (no puede encontrarse en estado `LIQUIDATED` ni `ARCHIVED`, `400 Bad Request`).
- El insumo indicado en `itemId` debe existir y estar activo (`isActive: true`, `404 Not Found`).
- Un mismo insumo no puede duplicarse dentro de la matriz del proyecto (`@@unique([projectId, itemId])`, `409 Conflict`).
- La fila se crea con `allocatedQty = 0` y `consumedQty = 0`.

**Ejemplo de Peticion:**
```json
{
  "itemId": "item-uuid-cemento",
  "requiredQty": 150,
  "s10UnitPrice": 28.5
}
```

#### Respuestas
**201 Created - Requerimiento agregado:**
```json
{
  "id": "req-uuid-nuevo",
  "projectId": "77777777-7777-7777-7777-777777777777",
  "itemId": "item-uuid-cemento",
  "requiredQty": "150.0000",
  "allocatedQty": "0.0000",
  "consumedQty": "0.0000",
  "s10UnitPrice": "28.5000",
  "item": {
    "id": "item-uuid-cemento",
    "sku": "CEM-PORT-T1",
    "name": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
    "baseUnit": "BOLSA",
    "type": "CONSUMABLE"
  }
}
```

**400 Bad Request - Proyecto liquidado/archivado o validacion invalida.**

**403 Forbidden - Solo permitido para el rol `ADMIN`.**

**404 Not Found - Proyecto no encontrado o insumo inexistente/inactivo:**
```json
{
  "statusCode": 404,
  "message": "El insumo seleccionado no existe o se encuentra inactivo en el catalogo",
  "error": "Not Found"
}
```

**409 Conflict - Insumo ya registrado en la matriz del proyecto:**
```json
{
  "statusCode": 409,
  "message": "El insumo \"Cemento Portland Tipo I (Bolsa 42.5 kg)\" (CEM-PORT-T1) ya existe en la matriz del proyecto",
  "error": "Conflict"
}
```

---

### 2.11 Editar Requerimiento de la Matriz de Brechas
Permite modificar `requiredQty`, `s10UnitPrice` y opcionalmente reasignar el insumo (`itemId`) de una fila existente en la Matriz de Brechas.

- **Metodo:** `PUT`
- **Ruta:** `/api/v1/projects/:id/requirements/:reqId`
- **Acceso:** Protegido (Exclusivo `ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Parametros
- `id` (URL Path): UUID del proyecto.
- `reqId` (URL Path): UUID de la fila de requerimiento (`requirementId` devuelto en `GET /gap-analysis`).

#### Request Body (`UpdateProjectRequirementDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `itemId` | string (UUID v4) | No | Nuevo `itemId` del catalogo maestro activo. Solo permitido cuando `allocatedQty == 0` y `consumedQty == 0`. |
| `requiredQty` | number | No | Nueva cantidad metrada requerida (`>= 0.0001` y obligatoriamente `>= allocatedQty`). |
| `s10UnitPrice` | number \| null | No | Nuevo precio unitario referencial S10 en PEN (`>= 0`, o `null` para limpiar el valor). |

#### Reglas de Negocio
- El proyecto debe estar abierto (no `LIQUIDATED` ni `ARCHIVED`, `400 Bad Request`).
- La fila `reqId` debe existir y pertenecer al proyecto `id` (`404 Not Found`).
- Si se envia `requiredQty`, debe cumplir `requiredQty >= allocatedQty`; de lo contrario responde `400 Bad Request`.
- Si se cambia `itemId` por otro distinto al actual:
  - Exige estrictamente que `allocatedQty == 0` y `consumedQty == 0` (`400 Bad Request` si ya registra reservas o consumos).
  - El nuevo insumo debe existir y estar activo (`isActive: true`, `404 Not Found`).
  - El nuevo insumo no debe existir ya en otra fila del mismo proyecto (`409 Conflict`).

**Ejemplo de Peticion:**
```json
{
  "requiredQty": 200,
  "s10UnitPrice": 29.0
}
```

#### Respuestas
**200 OK - Requerimiento actualizado:**
```json
{
  "id": "req-uuid-1",
  "projectId": "77777777-7777-7777-7777-777777777777",
  "itemId": "item-uuid-cemento",
  "requiredQty": "200.0000",
  "allocatedQty": "0.0000",
  "consumedQty": "0.0000",
  "s10UnitPrice": "29.0000",
  "item": {
    "id": "item-uuid-cemento",
    "sku": "CEM-PORT-T1",
    "name": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
    "baseUnit": "BOLSA",
    "type": "CONSUMABLE"
  }
}
```

**400 Bad Request - Violacion de reglas de reserva o consumo:**
```json
{
  "statusCode": 400,
  "message": "No se puede reasignar el insumo porque esta fila ya tiene stock reservado o consumido",
  "error": "Bad Request"
}
```

**403 Forbidden - Solo permitido para el rol `ADMIN`.**

**404 Not Found - Proyecto, requerimiento o nuevo insumo no encontrado / inactivo.**

**409 Conflict - El nuevo insumo ya existe en otra fila de la matriz del proyecto.**

---

### 2.12 Eliminar Requerimiento de la Matriz de Brechas
Elimina una fila de requerimiento de la Matriz de Brechas del proyecto.

- **Metodo:** `DELETE`
- **Ruta:** `/api/v1/projects/:id/requirements/:reqId`
- **Acceso:** Protegido (Exclusivo `ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Parametros
- `id` (URL Path): UUID del proyecto.
- `reqId` (URL Path): UUID de la fila de requerimiento (`requirementId`).

#### Reglas de Negocio
- El proyecto debe estar abierto (no `LIQUIDATED` ni `ARCHIVED`, `400 Bad Request`).
- La fila `reqId` debe existir y pertenecer al proyecto `id` (`404 Not Found`).
- Solo se permite eliminar si `allocatedQty == 0` y `consumedQty == 0`. Si ya cuenta con stock reservado en Central o consumido en obra, la eliminacion se rechaza con `400 Bad Request`.

#### Respuestas
**200 OK - Requerimiento eliminado:**
```json
{
  "deleted": true,
  "id": "req-uuid-1",
  "message": "Requerimiento eliminado exitosamente de la matriz del proyecto"
}
```

**400 Bad Request - La fila tiene stock reservado o consumido:**
```json
{
  "statusCode": 400,
  "message": "No se puede eliminar este requerimiento porque ya tiene stock reservado o consumido en obra",
  "error": "Bad Request"
}
```

**403 Forbidden - Solo permitido para el rol `ADMIN`.**

**404 Not Found - Proyecto no encontrado o el requerimiento no pertenece al proyecto.**

---

### 2.13 Reservar Insumos en Almacen Central para el Proyecto
Incrementa `allocatedQty` en el requerimiento del proyecto y `Stock.reservedQty` en el Almacen Central tras validar que existe stock fisico disponible no comprometido (`physicalQty - reservedQty >= Q`).

- **Metodo:** `POST`
- **Ruta:** `/api/v1/projects/:id/allocate-stock`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
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

### 2.14 Liberar Stock Reservado en Almacen Central
Permite liberar de forma manual o correctiva existencias que fueron reservadas previamente pero que no seran despachadas a la obra. Decrementa `Stock.reservedQty` en Central y `ProjectRequirement.allocatedQty`.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/projects/:id/release-stock`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
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

### 2.15 Protocolo de Liquidacion y Cierre Formal de Obra
Permite sellar la finalizacion de una obra civil pasando su estado a `LIQUIDATED` y desactivando su almacen de obra (`Warehouse.isActive = false`).

Exige el cumplimiento estricto e indivisible de **3 condiciones previas**:
1. **Stock Fisico Cero:** El almacen de obra no debe tener insumos remanentes en piso (`sum(Stock.physicalQty) == 0`). Todo remanente debe haberse consumido o retornado a Central via transferencia.
2. **Cero Prestamos de Herramientas Abiertos:** No deben existir vales de custodia pendientes de retorno vinculados a esta caseta (`ToolCustody` con `returnDate == null`).
3. **Cero Transferencias en Transito:** No deben existir traslados hacia o desde este almacen en estado `PENDING` o `IN_TRANSIT`.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/projects/:id/liquidate`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
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
