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
Registra perdidas por rotura, vencimiento de quimicos o destruccion fortuita. Exige justificacion obligatoria.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/movements/shrinkage`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Request Body (`CreateShrinkageExitDto`)
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

---

### 2.3 Registrar Ajuste de Inventario Fisico (`INVENTORY_ADJUSTMENT`)
Permite regularizar sobrantes o faltantes tras un inventario ciclico o general. Operacion reservada exclusivamente a la administracion.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/movements/adjustment`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

---

### 2.4 Consultar Kardex Histórico Paginado
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
