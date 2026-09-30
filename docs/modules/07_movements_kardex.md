# Modulo 07 - Salidas de Consumo y Kardex Inmutable (Movements & Kardex)

## 1. Descripcion General
Este modulo implementa el libro mayor contable y operativo del inventario (Kardex Fisico y Valorizado).

### Reglas Clave:
- **Inmutabilidad Absoluta (Append-Only):** Los registros en `Movement` y `MovementItem` representan hechos fisicos consumados. Estan estrictamente prohibidas las operaciones de actualizacion (`UPDATE`) o eliminacion (`DELETE`).
- **Snapshot de Costo Congelado:** Cada salida o entrada registra de manera inmutable el `unitCostSnapshot` vigente al instante de la transaccion, garantizando que valorizaciones de obra posteriores no se desvirtuen.
- **Tipos de Movimientos Contemplados:**
  - `PURCHASE_ENTRY`: Entrada por compra en Almacen Central.
  - `CONSUMPTION_EXIT`: Salida definitiva de material entregado a cuadrilla/capataz en obra.
  - `TRANSFER_DISPATCH`: Salida fisica desde almacen de origen hacia transito.
  - `TRANSFER_RECEIPT`: Entrada fisica confirmada en almacen de destino.
  - `LOAN_DISPATCH`: Salida de herramienta para custodia temporal.
  - `LOAN_RETURN`: Retorno fisico de herramienta a caseta.
  - `SHRINKAGE_EXIT`: Perdida, merma en ruta o rotura no recuperable.
  - `INVENTORY_ADJUSTMENT`: Regularizacion por toma fisica formal de inventario (exclusivo `ADMIN`).

- **Ruta Base:** `/api/v1/movements`
- **Entidades Vinculadas:** `Movement`, `MovementItem`, `Warehouse`, `Item`, `Project`, `User`, `DocumentAttachment`

---

## 2. Endpoints

### 2.1 Registrar Salida por Consumo en Obra (`CONSUMPTION_EXIT`)
El almacenero de caseta entrega material a una cuadrilla o capataz. Decrementa el stock en piso del almacen de obra, incrementa `consumedQty` en el requerimiento del proyecto y registra el movimiento de Kardex.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/movements/consumption`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado al almacen)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Request Body (`CreateConsumptionExitDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `warehouseId` | string (UUID) | Si | Almacen de obra de donde sale el material. |
| `projectId` | string (UUID) | Si | Proyecto civil al que se imputa el consumo. |
| `recipientName` | string | Si | Nombre y apellido del capataz o responsable receptor. |
| `recipientDni` | string | Si | Documento de identidad (DNI de 8 digitos). |
| `observation` | string | No | Frente de trabajo, piso o partida de aplicacion. |
| `items` | array | Si | Lista de insumos entregados. |

**Estructura de cada elemento en `items`:**
- `itemId` (UUID): Identificador del item (debe ser `CONSUMABLE`).
- `quantity` (number): Cantidad entregada en unidad base.

**Ejemplo de Peticion:**
```json
{
  "warehouseId": "44444444-4444-4444-4444-444444444444",
  "projectId": "77777777-7777-7777-7777-777777777777",
  "recipientName": "Manuel Flores Huaman",
  "recipientDni": "45892314",
  "observation": "Vaciado de columnas sector B - Tercer piso",
  "items": [
    {
      "itemId": "item-uuid-cemento",
      "quantity": 40
    }
  ]
}
```

#### Respuestas
**201 Created - Salida asentada en Kardex:**
```json
{
  "id": "mov-uuid-consumption-1",
  "movementNumber": "MOV-2026-00005",
  "type": "CONSUMPTION_EXIT",
  "originWarehouseId": "44444444-4444-4444-4444-444444444444",
  "projectId": "77777777-7777-7777-7777-777777777777",
  "recipientName": "Manuel Flores Huaman",
  "recipientDni": "45892314",
  "createdAt": "2026-09-23T11:30:00.000Z",
  "items": [
    {
      "itemId": "item-uuid-cemento",
      "quantity": "40.0000",
      "unitCostSnapshot": "28.0000"
    }
  ]
}
```

**400 Bad Request - Stock insuficiente en caseta:**
```json
{
  "statusCode": 400,
  "message": "Stock insuficiente en el almacen para el item CEM-PORT-T1. Disponible: 25.0000",
  "error": "Bad Request"
}
```

---

### 2.2 Registrar Salida por Merma o Desecho (`SHRINKAGE_EXIT`)
Registra perdidas por rotura, vencimiento de quimicos o destruccion fortuita. Exige justificacion obligatoria y descuenta el stock fisico del almacen.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/movements/shrinkage`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Request Body (`CreateShrinkageExitDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `warehouseId` | string (UUID) | Si | Almacen donde se produjo la merma. |
| `shrinkageReason` | string | Si | Causa de la merma (max. 255 caracteres). |
| `observation` | string | No | Observaciones de autorizacion o acta levantada. |
| `items` | array | Si | Lista de insumos mermados con `itemId` y `quantity`. |

**Ejemplo de Peticion:**
```json
{
  "warehouseId": "44444444-4444-4444-4444-444444444444",
  "shrinkageReason": "Bolsas de yeso humedecidas por lluvia intempestiva en caseta auxiliar",
  "observation": "Autorizado por residente de obra Ing. Morales",
  "items": [
    {
      "itemId": "item-uuid-yeso",
      "quantity": 6
    }
  ]
}
```

#### Respuestas
**201 Created - Merma registrada:**
```json
{
  "id": "mov-uuid-shrinkage-1",
  "movementNumber": "MOV-2026-00006",
  "type": "SHRINKAGE_EXIT",
  "originWarehouseId": "44444444-4444-4444-4444-444444444444",
  "destWarehouseId": null,
  "projectId": null,
  "userId": "user-uuid-1",
  "shrinkageReason": "Bolsas de yeso humedecidas por lluvia intempestiva en caseta auxiliar",
  "observation": "Autorizado por residente de obra Ing. Morales",
  "createdAt": "2026-09-23T11:45:00.000Z",
  "items": [
    {
      "id": "mov-item-uuid-1",
      "movementId": "mov-uuid-shrinkage-1",
      "itemId": "item-uuid-yeso",
      "quantity": "6.0000",
      "unitCostSnapshot": "18.5000",
      "totalCostSnapshot": "111.00",
      "item": {
        "id": "item-uuid-yeso",
        "sku": "YESO-CONSTR-25",
        "name": "Yeso de Construccion 25 kg",
        "baseUnit": "BOLSA",
        "type": "CONSUMABLE"
      }
    }
  ]
}
```

---

### 2.3 Registrar Ajuste de Inventario Fisico (`INVENTORY_ADJUSTMENT`)
Permite regularizar sobrantes (`INCREASE`) o faltantes (`DECREASE`) tras un inventario ciclico o general formal. Operacion reservada exclusivamente a la administracion.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/movements/adjustment`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`CreateInventoryAdjustmentDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `warehouseId` | string (UUID) | Si | Almacen donde se aplica la regularizacion. |
| `observation` | string | Si | Justificacion formal o acta de inventario (max. 500 caracteres). |
| `items` | array | Si | Renglones de ajuste de inventario. |

**Detalle de cada elemento en `items` (`InventoryAdjustmentItemDto`):**
- `itemId` (UUID, obligatorio): Insumo a regularizar.
- `direction` (`INCREASE` \| `DECREASE`, obligatorio): Sobrante o faltante.
- `quantity` (number, obligatorio > 0): Cantidad neta a regularizar.
- `unitCost` (number, opcional): Costo unitario referencial si ingresa stock y el promedio anterior era cero.

**Ejemplo de Peticion:**
```json
{
  "warehouseId": "22222222-2222-2222-2222-222222222222",
  "observation": "Ajuste por inventario fisico general de fin de mes segun Acta INF-2026-004",
  "items": [
    {
      "itemId": "item-uuid-cemento",
      "direction": "INCREASE",
      "quantity": 10,
      "unitCost": 28.5
    }
  ]
}
```

#### Respuestas
**201 Created - Ajuste procesado e ingresado en Kardex:**
```json
{
  "id": "mov-uuid-adjustment-1",
  "movementNumber": "MOV-2026-00007",
  "type": "INVENTORY_ADJUSTMENT",
  "originWarehouseId": "22222222-2222-2222-2222-222222222222",
  "observation": "Ajuste por inventario fisico general de fin de mes segun Acta INF-2026-004",
  "createdAt": "2026-09-23T12:00:00.000Z",
  "items": [
    {
      "id": "mov-item-uuid-2",
      "movementId": "mov-uuid-adjustment-1",
      "itemId": "item-uuid-cemento",
      "quantity": "10.0000",
      "unitCostSnapshot": "28.5000",
      "totalCostSnapshot": "285.00",
      "item": {
        "id": "item-uuid-cemento",
        "sku": "CEM-PORT-T1",
        "name": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
        "baseUnit": "BOLSA",
        "type": "CONSUMABLE"
      }
    }
  ]
}
```

---

### 2.4 Consultar Detalle de un Movimiento
Obtiene la ficha inmutable de un movimiento de inventario, con datos de almacenes, usuario ejecutor, detalle de insumos con snapshots de costo y documentos adjuntos.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/movements/:id`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros
- `id` (URL Path): UUID del movimiento.

#### Respuestas
**200 OK - Movimiento obtenido:**
```json
{
  "id": "mov-uuid-consumption-1",
  "movementNumber": "MOV-2026-00005",
  "type": "CONSUMPTION_EXIT",
  "originWarehouseId": "44444444-4444-4444-4444-444444444444",
  "destWarehouseId": null,
  "projectId": "77777777-7777-7777-7777-777777777777",
  "recipientName": "Manuel Flores Huaman",
  "recipientDni": "45892314",
  "observation": "Vaciado de columnas sector B - Tercer piso",
  "createdAt": "2026-09-23T11:30:00.000Z",
  "originWarehouse": {
    "id": "44444444-4444-4444-4444-444444444444",
    "name": "Almacen Obra San Isidro",
    "type": "PROJECT_SITE"
  },
  "destWarehouse": null,
  "project": {
    "id": "77777777-7777-7777-7777-777777777777",
    "name": "Residencial Las Palmeras - San Isidro",
    "budgetCode": "S10-OBRA-2026-01"
  },
  "user": {
    "id": "user-uuid-1",
    "fullName": "Juan Perez",
    "email": "juan.perez@spa.com"
  },
  "items": [
    {
      "id": "mov-item-uuid-1",
      "itemId": "item-uuid-cemento",
      "quantity": "40.0000",
      "unitCostSnapshot": "28.0000",
      "totalCostSnapshot": "1120.00",
      "item": {
        "id": "item-uuid-cemento",
        "sku": "CEM-PORT-T1",
        "name": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
        "baseUnit": "BOLSA",
        "type": "CONSUMABLE"
      }
    }
  ],
  "transfer": null,
  "documents": []
}
```

---

### 2.5 Consultar Kardex Historico Paginado
Consulta el libro de movimientos con filtros avanzados. Aplica `CostMaskingInterceptor` para ocultar los costos monetarios unitarios y totales (`unitCostSnapshot`, `totalCostSnapshot`) ante usuarios con rol `WAREHOUSE_KEEPER`.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/movements`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros Query (`MovementFilterDto`)
- `warehouseId` (UUID, opcional): Filtrar por almacen origen/destino.
- `itemId` (UUID, opcional): Filtrar por insumo o herramienta.
- `type` (enum `MovementType`, opcional): Tipo de movimiento especifico.
- `startDate` (ISO Date, opcional): Fecha desde.
- `endDate` (ISO Date, opcional): Fecha hasta.
- `page` (integer, default: 1): Pagina actual.
- `limit` (integer, default: 20): Registros por pagina.

#### Respuestas Segun Rol

**Respuesta para ADMIN (Muestra costos valorizados):**
```json
{
  "data": [
    {
      "id": "mov-uuid-consumption-1",
      "movementNumber": "MOV-2026-00005",
      "type": "CONSUMPTION_EXIT",
      "createdAt": "2026-09-23T11:30:00.000Z",
      "recipientName": "Manuel Flores Huaman",
      "recipientDni": "45892314",
      "originWarehouse": {
        "name": "Almacen Obra San Isidro"
      },
      "items": [
        {
          "quantity": "40.0000",
          "unitCostSnapshot": "28.0000",
          "totalCostSnapshot": "1120.00",
          "item": {
            "sku": "CEM-PORT-T1",
            "name": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
            "baseUnit": "BOLSA"
          }
        }
      ]
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

**Respuesta para WAREHOUSE_KEEPER (Costos enmascarados):**
```json
{
  "data": [
    {
      "id": "mov-uuid-consumption-1",
      "movementNumber": "MOV-2026-00005",
      "type": "CONSUMPTION_EXIT",
      "createdAt": "2026-09-23T11:30:00.000Z",
      "recipientName": "Manuel Flores Huaman",
      "recipientDni": "45892314",
      "originWarehouse": {
        "name": "Almacen Obra San Isidro"
      },
      "items": [
        {
          "quantity": "40.0000",
          "item": {
            "sku": "CEM-PORT-T1",
            "name": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
            "baseUnit": "BOLSA"
          }
        }
      ]
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
