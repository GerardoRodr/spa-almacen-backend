# Modulo 05 - Proveedores, Compras y Motor CPP (Purchases & Suppliers)

## 1. Descripcion General
Este modulo gestiona el registro de proveedores comerciales (con RUC tributario de 11 digitos), el ingreso de facturas de adquisicion en el Almacen Central y la ejecucion atomica del algoritmo de Costo Promedio Ponderado (CPP / WAC) segun la normativa contable (NIC 2 / SUNAT).

### Reglas Clave:
- **Base Imponible Neta sin IGV:** El costo unitario computable para el valor del inventario se calcula sin IGV (18%), puesto que el impuesto constituye credito fiscal.
- **Conversion Monetaria:** En facturas emitidas en USD, los costos se transforman a Soles (PEN) multiplicando por el tipo de cambio oficial de compra (`exchangeRate`).
- **Recalculo Atomico de CPP:** Por cada item ingresado, se actualiza el `Stock.averageCost` en el Almacen Central y se registra un movimiento inmutable `Movement` de tipo `PURCHASE_ENTRY`.
- **Restriccion de Seguridad:** La creacion y consulta detallada de precios de compra esta restringida a `ADMIN` o protegida por `CostMaskingInterceptor` para usuarios con rol `WAREHOUSE_KEEPER`.

- **Ruta Base:** `/api/v1/purchases` y `/api/v1/suppliers`
- **Entidades Vinculadas:** `Supplier`, `Purchase`, `PurchaseDetail`, `Stock`, `Movement`, `MovementItem`

---

## 2. Endpoints de Proveedores (`/api/v1/suppliers`)

### 2.1 Listar Proveedores
Retorna la relacion de proveedores comerciales registrados con conteo de facturas emitidas.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/suppliers`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Respuestas
**200 OK - Listado obtenido:**
```json
[
  {
    "id": "sup-uuid-aceros-arequipa",
    "taxId": "20100138112",
    "businessName": "CORPORACION ACEROS AREQUIPA S.A.",
    "contactPhone": "+51 1 5171800",
    "contactEmail": "ventas@acerosarequipa.com",
    "address": "Av. Enrique Meiggs 297, Callao",
    "_count": {
      "purchases": 8
    }
  }
]
```

---

### 2.2 Registrar Nuevo Proveedor
Registra una persona juridica o natural proveedora validando unicidad de RUC (11 digitos).

- **Metodo:** `POST`
- **Ruta:** `/api/v1/suppliers`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body
```json
{
  "taxId": "20100138112",
  "businessName": "CORPORACION ACEROS AREQUIPA S.A.",
  "contactPhone": "+51 1 5171800",
  "contactEmail": "ventas@acerosarequipa.com",
  "address": "Av. Enrique Meiggs 297, Callao"
}
```

#### Respuestas
**201 Created - Proveedor registrado:**
```json
{
  "id": "sup-uuid-aceros-arequipa",
  "taxId": "20100138112",
  "businessName": "CORPORACION ACEROS AREQUIPA S.A.",
  "contactPhone": "+51 1 5171800",
  "contactEmail": "ventas@acerosarequipa.com",
  "address": "Av. Enrique Meiggs 297, Callao",
  "createdAt": "2026-09-23T12:20:00.000Z"
}
```

**409 Conflict - RUC duplicado:**
```json
{
  "statusCode": 409,
  "message": "Ya existe un proveedor registrado con el RUC 20100138112",
  "error": "Conflict"
}
```

---

### 2.3 Obtener Detalle de Proveedor por ID
- **Metodo:** `GET`
- **Ruta:** `/api/v1/suppliers/:id`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)

---

### 2.4 Actualizar Proveedor
- **Metodo:** `PUT`
- **Ruta:** `/api/v1/suppliers/:id`
- **Acceso:** Protegido (`ADMIN`)

---

## 3. Endpoints de Compras (`/api/v1/purchases`)

### 3.1 Listar Compras Paginadas
Consulta el historial de comprobantes de compra con filtros por rango de fecha, proveedor y serie.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/purchases`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Parametros Query
- `page` (integer, default: 1): Pagina actual.
- `limit` (integer, default: 20): Registros por pagina.
- `supplierId` (UUID, opcional): Filtrar por proveedor.
- `invoiceSeries` (string, opcional): Buscar por serie (ej. `F001-0004523`).
- `startDate` (ISO Date, opcional): Fecha inicio.
- `endDate` (ISO Date, opcional): Fecha fin.

#### Respuestas
**200 OK - Listado obtenido:**
```json
{
  "data": [
    {
      "id": "purch-uuid-1",
      "supplierId": "sup-uuid-aceros-arequipa",
      "invoiceSeries": "F001-0004523",
      "currency": "PEN",
      "exchangeRate": "1.0000",
      "issueDate": "2026-09-22T00:00:00.000Z",
      "subtotalPEN": "28500.00",
      "igvAmountPEN": "5130.00",
      "totalAmountPEN": "33630.00",
      "supplier": {
        "businessName": "CORPORACION ACEROS AREQUIPA S.A.",
        "taxId": "20100138112"
      },
      "_count": {
        "details": 2
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

### 3.2 Registrar Compra e Ingreso de Stock con Recalculo de CPP
Registra la factura de compra, ingresa la mercaderia al Almacen Central, recalcula el Costo Promedio Ponderado (`averageCost`) y crea la entrada de Kardex `PURCHASE_ENTRY` de forma transaccional atomica.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/purchases`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`CreatePurchaseDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `supplierId` | string (UUID) | Si | Identificador del proveedor. |
| `centralWarehouseId` | string (UUID) | Si | Identificador del Almacen Central que recibe. |
| `invoiceSeries` | string | Si | Serie y numero de comprobante SUNAT (ej. `F001-0004523`). |
| `currency` | `PEN` \| `USD` | Si | Moneda del comprobante. |
| `exchangeRate` | number | Si | Tipo de cambio a Soles (1.0 para PEN). |
| `issueDate` | ISO 8601 string | Si | Fecha de emision de la factura. |
| `subtotalPEN` | number | Si | Monto total sin IGV expresado en Soles. |
| `igvAmountPEN` | number | Si | Monto del IGV 18% en Soles. |
| `totalAmountPEN` | number | Si | Monto total con IGV en Soles. |
| `items` | array | Si | Detalle de renglones comprados. |

**Detalle de cada elemento en `items`:**
- `itemId` (UUID): SKU maestro a ingresar.
- `purchaseUnit` (string): Unidad de empaque comprada (ej. `PALLET`, `MILLAR`, `BOLSA`).
- `conversionFactor` (number): Multiplicador para llevar `purchaseUnit` a `Item.baseUnit`.
- `purchaseQty` (number): Cantidad comprada en la unidad de compra.
- `unitPriceOriginal` (number): Precio unitario neto sin IGV en la moneda original de compra.

**Ejemplo de Peticion:**
```json
{
  "supplierId": "sup-uuid-aceros-arequipa",
  "centralWarehouseId": "22222222-2222-2222-2222-222222222222",
  "invoiceSeries": "F001-0004523",
  "currency": "PEN",
  "exchangeRate": 1.0,
  "issueDate": "2026-09-22T10:00:00.000Z",
  "subtotalPEN": 28500.0,
  "igvAmountPEN": 5130.0,
  "totalAmountPEN": 33630.0,
  "items": [
    {
      "itemId": "item-uuid-cemento",
      "purchaseUnit": "BOLSA",
      "conversionFactor": 1.0,
      "purchaseQty": 1000,
      "unitPriceOriginal": 28.5
    }
  ]
}
```

#### Logica de Calculo Ejecutada:
1. `baseQty = purchaseQty * conversionFactor = 1000 * 1.0 = 1000`.
2. `unitCostBasePEN = (unitPriceOriginal * exchangeRate) / conversionFactor = 28.50`.
3. Se recupera el stock previo en Almacen Central: `S_ant = 500`, `CPP_ant = 27.00`.
4. Nuevo CPP:
   $$\text{CPP}_{\text{nuevo}} = \frac{(500 \times 27.00) + (1000 \times 28.50)}{500 + 1000} = \frac{13500 + 28500}{1500} = 28.00$$
5. Se actualiza `Stock.physicalQty = 1500` y `Stock.averageCost = 28.0000`.
6. Se crea el movimiento inmutable `Movement` con codigo correlativo `MOV-2026-00001` y tipo `PURCHASE_ENTRY`.

#### Respuestas
**201 Created - Compra registrada e inventario actualizado:**
```json
{
  "id": "purch-uuid-1",
  "invoiceSeries": "F001-0004523",
  "movementNumber": "MOV-2026-00001",
  "subtotalPEN": "28500.00",
  "totalAmountPEN": "33630.00",
  "details": [
    {
      "itemId": "item-uuid-cemento",
      "purchaseQty": "1000.0000",
      "baseQty": "1000.0000",
      "unitCostBasePEN": "28.5000",
      "newWarehouseAverageCost": "28.0000"
    }
  ]
}
```

---

### 3.3 Obtener Detalle de Compra
- **Metodo:** `GET`
- **Ruta:** `/api/v1/purchases/:id`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
- **Respuesta:** Objeto completo de compra con proveedor, renglones detallados y documentos adjuntos.
