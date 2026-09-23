# Modulo 08 - Custodia y Prestamo de Herramientas (Tool Custody)

## 1. Descripcion General
Este modulo controla el ciclo de vida y prestamo temporal de bienes clasificados como `ASSET_TOOL` (herramientas menores como palas o carretillas, y equipos mayores como rotomartillos o teodolitos) asignados a operarios y cuadrillas en frentes de obra.

### Reglas Clave:
- **Triada de Control de Stock:**
  - `physicalQty`: Cantidad total de herramientas bajo inventario del almacen.
  - `loanedQty`: Cantidad de herramientas actualmente en campo en poder de trabajadores.
  - `Disponibles en caseta = physicalQty - loanedQty`.
- **Identificacion del Trabajador:** Todo prestamo exige obligatoriamente DNI (8 digitos) y nombre completo del operario receptor.
- **Calificacion Fisica al Despacho y al Retorno:**
  - Valores posibles del enum `ToolCondition`: `OPERATIVE`, `DAMAGED_USABLE`, `DAMAGED_UNUSABLE`, `MAINTENANCE_REQUIRED`, `LOST`.
  - Si el retorno es `OPERATIVE` o `DAMAGED_USABLE`: se decrementa `loanedQty` y se genera `LOAN_RETURN`.
  - Si el retorno es `DAMAGED_UNUSABLE` o `LOST`: se da de baja patrimonial decrementando tanto `loanedQty` como `physicalQty`, y emitiendo un `SHRINKAGE_EXIT`.

- **Ruta Base:** `/api/v1/tools/custody`
- **Entidades Vinculadas:** `ToolCustody`, `Item`, `Warehouse`, `User`, `Stock`, `Movement`, `DocumentAttachment`

---

## 2. Endpoints

### 2.1 Listar Vales de Prestamo y Custodia
Consulta las ordenes de prestamo con filtro por almacen, estado activo (no devuelto), vencimiento de fecha esperada y DNI del trabajador.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/tools/custody`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros Query
- `warehouseId` (UUID, opcional): Filtrar por caseta de obra.
- `assignedToDni` (string, opcional): Filtrar por DNI del operario.
- `onlyPending` (boolean, default: false): Si es true, retorna unicamente herramientas que aun no han sido devueltas (`returnDate IS NULL`).
- `page` (integer, default: 1): Pagina.
- `limit` (integer, default: 20): Limite de registros.

#### Respuestas
**200 OK - Listado de vales obtenido:**
```json
{
  "data": [
    {
      "id": "vale-uuid-1",
      "custodyNumber": "VALE-2026-00001",
      "itemId": "item-uuid-rotomartillo",
      "warehouseId": "44444444-4444-4444-4444-444444444444",
      "quantity": "1.0000",
      "serialOrCode": "ROTO-BOSCH-004",
      "assignedToName": "Pedro Quispe Ramirez",
      "assignedToDni": "70123456",
      "dispatchDate": "2026-09-23T08:00:00.000Z",
      "expectedReturnDate": "2026-09-23T17:00:00.000Z",
      "returnDate": null,
      "conditionOnDispatch": "OPERATIVE",
      "conditionOnReturn": null,
      "item": {
        "sku": "HERR-TALADRO-ROTO",
        "name": "Rotomartillo SDS-Plus 800W"
      },
      "warehouse": {
        "name": "Almacen Obra San Isidro"
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

### 2.2 Despachar Herramienta en Prestamo (`LOAN_DISPATCH`)
Registra la entrega fisica de una o varias herramientas a un trabajador en obra, incrementando `Stock.loanedQty`.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/tools/custody/dispatch`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Request Body (`DispatchToolCustodyDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `warehouseId` | string (UUID) | Si | Almacen o caseta que presta el bien. |
| `itemId` | string (UUID) | Si | Identificador del item tipo `ASSET_TOOL`. |
| `quantity` | number | No | Cantidad de unidades a prestar (por defecto: `1`). |
| `serialOrCode` | string | No | Serie o codigo patrimonial para herramientas mayores. |
| `assignedToName` | string | Si | Nombre completo del operario. |
| `assignedToDni` | string | Si | Documento Nacional de Identidad (8 digitos). |
| `expectedReturnDate` | ISO Date | No | Fecha/hora estimada de devolucion a caseta. |
| `conditionOnDispatch` | `ToolCondition` | No | Estado fisico al entregar (por defecto: `OPERATIVE`). |
| `notes` | string | No | Observaciones o accesorios incluidos (brocas, maletin, cable). |

**Ejemplo de Peticion:**
```json
{
  "warehouseId": "44444444-4444-4444-4444-444444444444",
  "itemId": "item-uuid-rotomartillo",
  "quantity": 1,
  "serialOrCode": "ROTO-BOSCH-004",
  "assignedToName": "Pedro Quispe Ramirez",
  "assignedToDni": "70123456",
  "expectedReturnDate": "2026-09-23T17:00:00.000Z",
  "conditionOnDispatch": "OPERATIVE",
  "notes": "Entregado con maletin de transporte y 2 brocas para concreto"
}
```

#### Respuestas
**201 Created - Vale emitido exitosamente:**
```json
{
  "id": "vale-uuid-1",
  "custodyNumber": "VALE-2026-00001",
  "movementNumber": "MOV-2026-00006",
  "assignedToName": "Pedro Quispe Ramirez",
  "assignedToDni": "70123456",
  "dispatchDate": "2026-09-23T08:00:00.000Z",
  "conditionOnDispatch": "OPERATIVE"
}
```

---

### 2.3 Procesar Devolucion y Calificacion Fisica (`LOAN_RETURN`)
Registra el retorno de la herramienta a la caseta de obra y asienta su calificacion tecnica.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/tools/custody/:id/return`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Parametros
- `id` (URL Path): UUID del vale de custodia.

#### Request Body (`ReturnToolCustodyDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `conditionOnReturn` | `ToolCondition` | Si | Evaluacion fisica (`OPERATIVE`, `DAMAGED_USABLE`, `DAMAGED_UNUSABLE`, `LOST`). |
| `returnNotes` | string | No | Descripcion de desperfectos, roturas o faltantes. |

**Ejemplo de Peticion:**
```json
{
  "conditionOnReturn": "OPERATIVE",
  "returnNotes": "Devuelto completo en orden y limpio"
}
```

#### Respuestas
**200 OK - Devolucion procesada:**
```json
{
  "id": "vale-uuid-1",
  "custodyNumber": "VALE-2026-00001",
  "returnDate": "2026-09-23T16:45:00.000Z",
  "conditionOnReturn": "OPERATIVE",
  "returnNotes": "Devuelto completo en orden y limpio",
  "movementNumber": "MOV-2026-00007"
}
```

---

### 2.4 Consultar Deuda de Herramientas de un Trabajador
Permite consultar todas las herramientas que actualmente tiene en su poder un operario buscando por su numero de DNI.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/tools/custody/worker/:dni`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros
- `dni` (URL Path): DNI del trabajador (8 digitos).

#### Respuestas
**200 OK - Herramientas pendientes de devolucion:**
```json
{
  "workerDni": "70123456",
  "pendingCount": 1,
  "loans": [
    {
      "custodyNumber": "VALE-2026-00001",
      "itemName": "Rotomartillo SDS-Plus 800W",
      "serialOrCode": "ROTO-BOSCH-004",
      "quantity": 1,
      "dispatchDate": "2026-09-23T08:00:00.000Z",
      "expectedReturnDate": "2026-09-23T17:00:00.000Z"
    }
  ]
}
```
