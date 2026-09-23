# Modulo 06 - Transferencias Operativas en Dos Fases (Transfers)

## 1. Descripcion General
Este modulo implementa el traslado controlado de insumos y materiales desde el Almacen Central hacia los Almacenes de Obra temporal (o transferencias entre frentes de trabajo).

### Protocolo Operativo en Dos Fases:
1. **Fase 1 - Despacho en Origen (`TRANSFER_DISPATCH`):**
   - El personal de Almacen Central despacha la carga.
   - El stock fisico y reservado se decrementa de inmediato en el almacen de origen.
   - La transferencia pasa al estado `IN_TRANSIT` y congela el costo unitario (`unitCostSnapshot`) vigente.
   - Se emite el movimiento inmutable de salida de Kardex.
2. **Fase 2 - Recepcion e Inspeccion en Caseta (`TRANSFER_RECEIPT`):**
   - El almacenero de caseta de obra inspecciona el cargamento fisico.
   - **Caso Conforme:** Se sella como `COMPLETED` e incrementa el stock fisico en destino.
   - **Caso Discrepancia:** Si la cantidad recibida es inferior a la despachada, el estado se sella como `DISCREPANCY`, se ingresa al stock de obra solo lo recibido, y el sistema genera automaticamente un movimiento de merma `SHRINKAGE_EXIT` por las unidades perdidas en ruta.

- **Ruta Base:** `/api/v1/transfers`
- **Entidades Vinculadas:** `Transfer`, `TransferItem`, `Warehouse`, `Project`, `Stock`, `Movement`, `MovementItem`

---

## 2. Endpoints

### 2.1 Listar Transferencias
Consulta la relacion de guias y ordenes de traslado con filtros por estado, almacen de origen y almacen de destino.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/transfers`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado al origen o destino)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros Query
- `status` (enum, opcional): `PENDING`, `IN_TRANSIT`, `COMPLETED`, `DISCREPANCY`, `CANCELLED`.
- `originWarehouseId` (UUID, opcional): Filtrar por almacen de origen.
- `destWarehouseId` (UUID, opcional): Filtrar por almacen de destino.
- `page` (integer, default: 1): Pagina actual.
- `limit` (integer, default: 20): Registros por pagina.

#### Respuestas
**200 OK - Listado obtenido:**
```json
{
  "data": [
    {
      "id": "transf-uuid-1",
      "transferNumber": "TR-2026-00001",
      "status": "IN_TRANSIT",
      "originWarehouseId": "22222222-2222-2222-2222-222222222222",
      "destWarehouseId": "44444444-4444-4444-4444-444444444444",
      "dispatchedAt": "2026-09-23T09:00:00.000Z",
      "dispatchNotes": "Despacho en camioneta placa ABC-123",
      "originWarehouse": {
        "name": "Almacen Central Lima"
      },
      "destWarehouse": {
        "name": "Almacen Obra San Isidro"
      },
      "dispatchedBy": {
        "fullName": "Administrador Principal"
      },
      "_count": {
        "items": 1
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

### 2.2 Registrar y Despachar Transferencia (Fase 1)
Inicia el traslado de materiales desde un almacen de origen hacia una caseta de obra. Decrementa inmediatamente el inventario fisico del origen y crea el movimiento `TRANSFER_DISPATCH`.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/transfers/dispatch`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado al almacen de origen)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Request Body (`DispatchTransferDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `originWarehouseId` | string (UUID) | Si | Almacen emisor de la carga. |
| `destWarehouseId` | string (UUID) | Si | Almacen receptor de la carga. |
| `projectId` | string (UUID) | No | Proyecto civil asociado. |
| `dispatchNotes` | string | No | Observaciones de transporte, chofer, placa. |
| `items` | array | Si | Lista de items y cantidades a enviar. |

**Estructura de cada elemento en `items`:**
- `itemId` (UUID): Identificador del item.
- `quantity` (number): Cantidad en unidad base a trasladar.

**Ejemplo de Peticion:**
```json
{
  "originWarehouseId": "22222222-2222-2222-2222-222222222222",
  "destWarehouseId": "44444444-4444-4444-4444-444444444444",
  "projectId": "77777777-7777-7777-7777-777777777777",
  "dispatchNotes": "Envio de cemento para vaciado de zapatas, chofer Jorge Perez",
  "items": [
    {
      "itemId": "item-uuid-cemento",
      "quantity": 100
    }
  ]
}
```

#### Respuestas
**201 Created - Transferencia despachada y en transito:**
```json
{
  "id": "transf-uuid-1",
  "transferNumber": "TR-2026-00001",
  "status": "IN_TRANSIT",
  "movementNumber": "MOV-2026-00002",
  "originWarehouseId": "22222222-2222-2222-2222-222222222222",
  "destWarehouseId": "44444444-4444-4444-4444-444444444444",
  "dispatchedAt": "2026-09-23T09:30:00.000Z",
  "items": [
    {
      "id": "transf-item-uuid-1",
      "itemId": "item-uuid-cemento",
      "dispatchedQty": "100.0000",
      "unitCostSnapshot": "28.0000"
    }
  ]
}
```

**400 Bad Request - Stock insuficiente en origen:**
```json
{
  "statusCode": 400,
  "message": "Stock fisico insuficiente en el almacen de origen para el item CEM-PORT-T1",
  "error": "Bad Request"
}
```

---

### 2.3 Obtener Detalle de Transferencia
Recupera los datos completos de la orden de transferencia, renglones, cantidades despachadas vs recibidas y notas de recepcion.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/transfers/:id`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

---

### 2.4 Confirmar Recepcion e Inspeccion en Obra (Fase 2)
El almacenero receptor sella la entrada de los materiales en la caseta de obra, ingresando las cantidades fisicamente verificadas.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/transfers/:id/receive`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado al almacen de destino)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Parametros
- `id` (URL Path): UUID de la transferencia.

#### Request Body (`ReceiveTransferDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `receptionNotes` | string | No | Observaciones sobre el estado del cargamento o incidencias. |
| `items` | array | Si | Detalle de renglones recibidos. |

**Estructura de cada elemento en `items`:**
- `transferItemId` (UUID): Identificador del renglon dentro de la transferencia.
- `receivedQty` (number): Cantidad fisica recibida y aceptada.

**Ejemplo de Peticion con Discrepancia (se enviaron 100 bolsas, se reciben 95):**
```json
{
  "receptionNotes": "Llegaron 95 bolsas intactas. 5 bolsas sufrieron rotura y perdida total en carretera.",
  "items": [
    {
      "transferItemId": "transf-item-uuid-1",
      "receivedQty": 95
    }
  ]
}
```

#### Respuestas
**200 OK - Recepcion confirmada con discrepancia asentada:**
```json
{
  "id": "transf-uuid-1",
  "transferNumber": "TR-2026-00001",
  "status": "DISCREPANCY",
  "receiptMovementNumber": "MOV-2026-00003",
  "shrinkageMovementNumber": "MOV-2026-00004",
  "receivedAt": "2026-09-23T11:00:00.000Z",
  "items": [
    {
      "id": "transf-item-uuid-1",
      "itemId": "item-uuid-cemento",
      "dispatchedQty": "100.0000",
      "receivedQty": "95.0000",
      "discrepancyQty": "5.0000"
    }
  ]
}
```
