# Modulo 05 - Proveedores, Compras y Motor CPP (Purchases & Suppliers)

## 1. Descripcion General
Este modulo gestiona el registro de proveedores comerciales (con RUC tributario de 11 digitos), el ingreso de facturas de adquisicion en el Almacen Central y la ejecucion atomica del algoritmo de Costo Promedio Ponderado (CPP / WAC) segun la normativa contable (NIC 2 / SUNAT).

### Reglas Clave:
- **Base Imponible Neta sin IGV:** El costo unitario computable para el valor del inventario se calcula sin IGV (18%), puesto que el impuesto constituye credito fiscal.
- **Conversion Monetaria:** En facturas emitidas en USD, los costos se transforman a Soles (PEN) multiplicando por el tipo de cambio oficial de compra (`exchangeRate`).
- **Compras Multi-Almacen y Descentralizacion Operativa:** Las compras pueden ingresar directamente tanto a un Almacen Central (`CENTRAL`) como a cualquier Almacen de Obra (`PROJECT_SITE`) activo. Tanto `ADMIN` como `WAREHOUSE_KEEPER` estan facultados para registrar compras y dar de alta nuevos proveedores, permitiendo registrar adquisiciones directas de campo sin friccion burocratica.
- **Segregacion de Seguridad por Sede:** Para usuarios con rol `WAREHOUSE_KEEPER`, la consulta (`GET /purchases`, `GET /purchases/:id`) y el registro (`POST /purchases`) estan estrictamente acotados a los almacenes que tienen autorizados en la tabla `UserWarehouse`. Cualquier intento de operar sobre una sede ajena produce un error `403 Forbidden`.
- **Recepciones a Precio Cero y Proteccion de CPP:** Permite registrar compras e ingresos de stock con precio unitario 0.00 (ej. recepcion fisica mediante Guia de Remision previa a la factura). Si `unitCostBasePEN <= 0`, el motor de CPP no diluye el costo preexistente; conserva `newCPP = prevCPP > 0 ? prevCPP : 0`.
- **Valorizacion Formal Administrativa:** Los comprobantes ingresados con precio 0.00 pueden ser valorizados posteriormente por el rol `ADMIN` mediante `PATCH /api/v1/purchases/:id/valuation`, actualizando la cabecera contable y recalculando el `averageCost` en `Stock` sin duplicar unidades fisicas.
- **Observaciones y Caducidad:** Permite registrar notas de compra a nivel de cabecera (`Purchase.notes`) y por linea (`PurchaseDetail.notes`) para consignar lotes y fechas de vencimiento de insumos perecibles.
- **Recalculo Atomico de CPP:** Por cada item ingresado, se actualiza el `Stock.averageCost` en el almacen de destino y se registra un movimiento inmutable `Movement` de tipo `PURCHASE_ENTRY`.
- **Restriccion de Seguridad Financiera:** El Cuadro Comparativo de Precios (`GET /purchases/price-comparison`), el simulador de CPP y el costo promedio de sedes ajenas son exclusivos del rol `ADMIN`. Para `WAREHOUSE_KEEPER`, `CostMaskingInterceptor` enmascara los atributos de costo en endpoints genericos y oculta el nuevo CPP en el detalle de compra.

- **Ruta Base:** `/api/v1/purchases` y `/api/v1/suppliers`
- **Entidades Vinculadas:** `Supplier`, `Purchase`, `PurchaseDetail`, `Warehouse`, `Stock`, `Movement`, `MovementItem`

---

## 2. Endpoints de Proveedores (`/api/v1/suppliers`)

### 2.1 Listar Proveedores
Retorna la relacion de proveedores comerciales registrados con conteo de facturas emitidas y paginacion.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/suppliers`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros Query (`SupplierFilterDto`)
| Parametro | Tipo | Por Defecto | Descripcion |
|---|---|---|---|
| `page` | integer | `1` | Numero de pagina. |
| `limit` | integer | `20` | Cantidad de registros por pagina. |
| `search` | string | opcional | Termino de busqueda por RUC o razon social. |

#### Respuestas
**200 OK - Listado obtenido:**
```json
{
  "data": [
    {
      "id": "sup-uuid-aceros-arequipa",
      "taxId": "20100138112",
      "businessName": "CORPORACION ACEROS AREQUIPA S.A.",
      "contactPhone": "+51 1 5171800",
      "contactEmail": "ventas@acerosarequipa.com",
      "address": "Av. Enrique Meiggs 297, Callao",
      "notes": "Proveedor homologado para suministros de acero estructural",
      "createdAt": "2026-09-20T22:55:00.000Z",
      "_count": {
        "purchases": 8
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

### 2.2 Registrar Nuevo Proveedor
Registra una persona juridica o natural proveedora validando unicidad de RUC (11 digitos numericos).

- **Metodo:** `POST`
- **Ruta:** `/api/v1/suppliers`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Request Body (`CreateSupplierDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `taxId` | string (11 digitos) | Si | Numero de RUC del proveedor. |
| `businessName` | string | Si | Razon social o nombre comercial. |
| `contactPhone` | string | No | Telefono de contacto. |
| `contactEmail` | string (email) | No | Correo electronico. |
| `address` | string | No | Direccion fiscal. |
| `notes` | string (max 1000) | No | Observaciones sobre cumplimiento, puntualidad o acuerdos. |

**Ejemplo de Peticion:**
```json
{
  "taxId": "20100138112",
  "businessName": "CORPORACION ACEROS AREQUIPA S.A.",
  "contactPhone": "+51 1 5171800",
  "contactEmail": "ventas@acerosarequipa.com",
  "address": "Av. Enrique Meiggs 297, Callao",
  "notes": "Proveedor homologado para suministros de acero estructural"
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
  "notes": "Proveedor homologado para suministros de acero estructural",
  "createdAt": "2026-09-23T12:20:00.000Z",
  "updatedAt": "2026-09-23T12:20:00.000Z"
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
Consulta la ficha del proveedor junto con sus ultimas 10 compras registradas y el conteo historico.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/suppliers/:id`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros
- `id` (URL Path): UUID del proveedor.

#### Respuestas
**200 OK - Proveedor encontrado:**
```json
{
  "id": "sup-uuid-aceros-arequipa",
  "taxId": "20100138112",
  "businessName": "CORPORACION ACEROS AREQUIPA S.A.",
  "contactPhone": "+51 1 5171800",
  "contactEmail": "ventas@acerosarequipa.com",
  "address": "Av. Enrique Meiggs 297, Callao",
  "notes": "Proveedor homologado para suministros de acero estructural",
  "createdAt": "2026-09-20T22:55:00.000Z",
  "updatedAt": "2026-09-20T22:55:00.000Z",
  "purchases": [
    {
      "id": "purch-uuid-1",
      "invoiceSeries": "F001-0004523",
      "currency": "PEN",
      "issueDate": "2026-09-22T00:00:00.000Z",
      "subtotalPEN": "28500.00",
      "totalAmountPEN": "33630.00"
    }
  ],
  "_count": {
    "purchases": 1
  }
}
```

---

### 2.4 Actualizar Proveedor
Modifica los datos generales de un proveedor comercial.

- **Metodo:** `PUT`
- **Ruta:** `/api/v1/suppliers/:id`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Parametros
- `id` (URL Path): UUID del proveedor.

#### Request Body (`UpdateSupplierDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `taxId` | string (11 digitos) | No | RUC del proveedor. |
| `businessName` | string | No | Razon social. |
| `contactPhone` | string | No | Telefono de contacto. |
| `contactEmail` | string (email) | No | Correo electronico. |
| `address` | string | No | Direccion fiscal. |
| `notes` | string (max 1000) | No | Observaciones actualizadas del proveedor. |

#### Respuestas
**200 OK - Actualizado correctamente:**
```json
{
  "id": "sup-uuid-aceros-arequipa",
  "taxId": "20100138112",
  "businessName": "CORPORACION ACEROS AREQUIPA S.A.",
  "contactPhone": "+51 1 5171800",
  "contactEmail": "ventas@acerosarequipa.com",
  "address": "Av. Enrique Meiggs 297, Callao",
  "notes": "Proveedor homologado para suministros de acero estructural",
  "updatedAt": "2026-09-23T12:22:00.000Z"
}
```

---

## 3. Endpoints de Compras (`/api/v1/purchases`)

### 3.1 Listar Compras Paginadas
Consulta el historial de comprobantes de compra con filtros por rango de fecha, proveedor y serie. Para usuarios con rol `WAREHOUSE_KEEPER`, el listado se segrega de forma automatica retornando unicamente las compras asociadas a sus sedes asignadas (`UserWarehouse`).

- **Metodo:** `GET`
- **Ruta:** `/api/v1/purchases`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

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
      "voucherType": "FACTURA",
      "hasIgv": true,
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
Registra la factura, guia de remision o comprobante de compra, ingresa la mercaderia al almacen especificado (Central u Obra), recalcula el Costo Promedio Ponderado (`averageCost`) segun corresponda y crea la entrada de Kardex `PURCHASE_ENTRY` de forma transaccional atomica.
Si el usuario autenticado tiene rol `WAREHOUSE_KEEPER`, se valida obligatoriamente que el almacen de destino figure en sus sedes asignadas (`UserWarehouse`), retornando `403 Forbidden` en caso contrario.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/purchases`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Request Body (`CreatePurchaseDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `supplierId` | string (UUID) | Si | Identificador del proveedor. |
| `centralWarehouseId` | string (UUID) | No | Identificador alternativo del almacen receptor. |
| `warehouseId` | string (UUID) | No | Identificador del almacen receptor (sede destino). |
| `invoiceSeries` | string | Si | Serie y numero de comprobante SUNAT (ej. `F001-0004523` o `T001-00492`). |
| `voucherType` | string | No | Tipo de comprobante (default: `FACTURA`, ej. `BOLETA`, `GUIA`, `RECIBO`). |
| `hasIgv` | boolean | No | Indica si el comprobante tiene IGV desglosado (default: `true`). |
| `currency` | `PEN` \| `USD` | Si | Moneda del comprobante. |
| `exchangeRate` | number | Si | Tipo de cambio a Soles (1.0 para PEN). |
| `issueDate` | ISO 8601 string | Si | Fecha de emision de la factura. |
| `subtotalPEN` | number | Si | Monto total sin IGV expresado en Soles. |
| `igvAmountPEN` | number | No | Monto del IGV en Soles (obligatorio 0 si `hasIgv` es false; auto deducido si se omite con IGV). |
| `totalAmountPEN` | number | Si | Monto total del comprobante en Soles. |
| `notes` | string | No | Observaciones generales del comprobante. |
| `items` | array | Si | Detalle de renglones comprados. |

**Detalle de cada elemento en `items`:**
- `itemId` (UUID): SKU maestro a ingresar.
- `purchaseUnit` (string): Unidad de empaque comprada (ej. `PALLET`, `MILLAR`, `BOLSA`).
- `conversionFactor` (number): Multiplicador para llevar `purchaseUnit` a `Item.baseUnit`.
- `purchaseQty` (number): Cantidad comprada en la unidad de compra.
- `unitPriceOriginal` (number): Precio unitario neto sin IGV en la moneda original de compra. Admite `0` para recepciones solo con Guia de Remision.
- `notes` (string, opcional): Lote, numero de colada o fecha de vencimiento.

**Reglas de Proteccion de CPP y Costo Cero:**
- Si `unitCostBasePEN <= 0` (recepcion con costo cero): el algoritmo preserva el CPP anterior `newCPP = prevCPP > 0 ? prevCPP : 0`. El comprobante queda marcado como pendiente de valorizacion formal por Administracion.
- Si `userRole === Role.WAREHOUSE_KEEPER`, el atributo `newWarehouseAverageCost` es omitido de la respuesta para resguardar la confidencialidad financiera corporativa.

**Reglas de validacion para comprobantes gravados vs sin IGV:**
- Si `hasIgv === true`: si no se envia `igvAmountPEN` pero `totalAmountPEN > subtotalPEN`, el sistema calcula automaticamente `igvAmountPEN = totalAmountPEN - subtotalPEN`.
- Si `hasIgv === false` (operacion exonerada o no gravada): se valida estrictamente que `igvAmountPEN === 0` y que `totalAmountPEN === subtotalPEN`. El costo de compra entra integro al calculo del CPP.

**Ejemplo de Peticion:**
```json
{
  "supplierId": "sup-uuid-aceros-arequipa",
  "centralWarehouseId": "22222222-2222-2222-2222-222222222222",
  "invoiceSeries": "F001-0004523",
  "voucherType": "FACTURA",
  "hasIgv": true,
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
3. Se recupera el stock previo en el almacen destino: `S_ant` y `CPP_ant`.
4. **Regla de Adopcion de Costo para Stock Inicial a Costo Cero:**
   - Si `S_ant <= 0` o `CPP_ant <= 0` (caso habitual cuando un insumo ingreso mediante inventario fisico inicial en caseta a costo 0), el algoritmo no diluye el precio contra cero. En su lugar, el nuevo CPP adopta directamente el costo unitario de la compra:
     $$\text{CPP}_{\text{nuevo}} = C_{\text{unitPEN}} = 28.50$$
     Esto garantiza que las unidades preexistentes en el almacen sin valorizar pasen a quedar valorizadas contablemente al costo real de adquisicion.
   - Si `S_ant > 0` y `CPP_ant > 0` (ejemplo con `S_ant = 500` y `CPP_ant = 27.00`):
     $$\text{CPP}_{\text{nuevo}} = \frac{(500 \times 27.00) + (1000 \times 28.50)}{500 + 1000} = \frac{13500 + 28500}{1500} = 28.00$$
5. Se actualiza `Stock.physicalQty = 1500` y `Stock.averageCost = 28.0000`.
6. Se crea el movimiento inmutable `Movement` con codigo correlativo `MOV-2026-00001` y tipo `PURCHASE_ENTRY`.

#### Respuestas
**201 Created - Compra registrada e inventario actualizado:**
```json
{
  "id": "purch-uuid-1",
  "invoiceSeries": "F001-0004523",
  "voucherType": "FACTURA",
  "hasIgv": true,
  "currency": "PEN",
  "exchangeRate": "1.0000",
  "issueDate": "2026-09-22T10:00:00.000Z",
  "subtotalPEN": "28500.00",
  "igvAmountPEN": "5130.00",
  "totalAmountPEN": "33630.00",
  "movementId": "movement-uuid-1",
  "movementNumber": "MOV-2026-00001",
  "details": [
    {
      "id": "detail-uuid-1",
      "itemId": "item-uuid-cemento",
      "purchaseQty": 1000,
      "baseQty": 1000,
      "unitCostBasePEN": 28.5,
      "newWarehouseAverageCost": 28,
      "newWarehousePhysicalQty": 1500
    }
  ]
}
```

---

### 3.3 Obtener Detalle de Compra
Obtiene la informacion completa de la factura, proveedor emisor, renglones comprados con sus items y documentos adjuntos. Para usuarios con rol `WAREHOUSE_KEEPER`, se valida que la compra pertenezca a sus almacenes autorizados (`UserWarehouse`).

- **Metodo:** `GET`
- **Ruta:** `/api/v1/purchases/:id`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros
- `id` (URL Path): UUID de la compra.

#### Respuestas
**200 OK - Compra encontrada:**
```json
{
  "id": "purch-uuid-1",
  "supplierId": "sup-uuid-aceros-arequipa",
  "centralWarehouseId": "22222222-2222-2222-2222-222222222222",
  "invoiceSeries": "F001-0004523",
  "voucherType": "FACTURA",
  "hasIgv": true,
  "currency": "PEN",
  "exchangeRate": "1.0000",
  "issueDate": "2026-09-22T10:00:00.000Z",
  "subtotalPEN": "28500.00",
  "igvAmountPEN": "5130.00",
  "totalAmountPEN": "33630.00",
  "createdAt": "2026-09-22T10:05:00.000Z",
  "supplier": {
    "id": "sup-uuid-aceros-arequipa",
    "taxId": "20100138112",
    "businessName": "CORPORACION ACEROS AREQUIPA S.A.",
    "contactPhone": "+51 1 5171800",
    "contactEmail": "ventas@acerosarequipa.com",
    "address": "Av. Enrique Meiggs 297, Callao"
  },
  "details": [
    {
      "id": "detail-uuid-1",
      "purchaseId": "purch-uuid-1",
      "itemId": "item-uuid-cemento",
      "purchaseUnit": "BOLSA",
      "conversionFactor": "1.0000",
      "purchaseQty": "1000.0000",
      "baseQty": "1000.0000",
      "unitPriceOriginal": "28.5000",
      "unitCostBasePEN": "28.5000",
      "subtotalPEN": "28500.00",
      "item": {
        "id": "item-uuid-cemento",
        "sku": "CEM-PORT-T1",
        "name": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
        "baseUnit": "BOLSA",
        "type": "CONSUMABLE"
      }
    }
  ],
  "documents": []
}
```

---

### 3.4 Cuadro Comparativo de Precios Historicos por Insumo
Retorna la comparativa exhaustiva de precios de compras historicas para un insumo, calculando el precio menor historico, costo promedio ponderado en stock y precio maximo, ordenando las compras de menor a mayor costo unitario base en Soles (`unitCostBasePEN ASC`).

- **Metodo:** `GET`
- **Ruta:** `/api/v1/purchases/price-comparison`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Parametros Query (`PriceComparisonQueryDto`)
| Parametro | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `itemId` | string (UUID) | Condicional | UUID del insumo a consultar. |
| `search` | string | Condicional | Nombre o SKU del insumo (requerido si no se envia `itemId`). |
| `warehouseId` | string (UUID) | No | Filtrar compras o stock de un almacen/obra especifico. |

**Ejemplo de Peticion:**
```http
GET /api/v1/purchases/price-comparison?itemId=e0000000-0000-4000-8000-000000000001
```

#### Respuesta 200 OK:
```json
{
  "item": {
    "id": "e0000000-0000-4000-8000-000000000001",
    "sku": "MAT-CEM-001",
    "name": "Cemento Portland Sol Tipo I 42.5kg",
    "baseUnit": "BOLSA",
    "type": "CONSUMABLE",
    "isPerishable": true,
    "category": null
  },
  "summary": {
    "totalPurchasesCount": 2,
    "minUnitCostPEN": 26.5,
    "maxUnitCostPEN": 28.5,
    "currentWeightedAverageCostPEN": 27.2,
    "bestSupplierName": "CEMENTOS PACASMAYO S.A.A.",
    "bestSupplierTaxId": "20100010744"
  },
  "entries": [
    {
      "purchaseDetailId": "pd-uuid-1",
      "purchaseId": "purch-uuid-1",
      "issueDate": "2026-09-03T10:15:00.000Z",
      "invoiceSeries": "F010-0084321",
      "voucherType": "FACTURA",
      "hasIgv": true,
      "supplierId": "d0000000-0000-4000-8000-000000000002",
      "supplierName": "CEMENTOS PACASMAYO S.A.A.",
      "supplierTaxId": "20100010744",
      "warehouseId": "b0000000-0000-4000-8000-000000000001",
      "warehouseName": "Almacen Central Principal (Lurin)",
      "warehouseType": "CENTRAL",
      "purchaseQty": 500,
      "purchaseUnit": "BOLSA",
      "conversionFactor": 1,
      "baseQty": 500,
      "unitPriceOriginal": 26.5,
      "currency": "PEN",
      "exchangeRate": 1,
      "unitCostBasePEN": 26.5,
      "subtotalPEN": 13250,
      "notes": "Lote cemento vence: 15/12/2026"
    }
  ]
}
```

---

### 3.5 Valorizar Compra Formalmente y Recalcular CPP
Permite a Administracion regularizar comprobantes ingresados previamente con costo cero o recepcionados mediante Guia de Remision, asignando precios definitivos de factura, actualizando `PurchaseDetail` y recalculando el `averageCost` en `Stock` sin re-ingresar unidades fisicas ni duplicar movimientos en Kardex.

- **Metodo:** `PATCH`
- **Ruta:** `/api/v1/purchases/:id/valuation`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`ValuatePurchaseDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `invoiceSeries` | string | Si | Serie definitiva de la factura formal (ej. `F001-0004523`). |
| `voucherType` | string | No | Tipo de comprobante definitivo (`FACTURA`, `BOLETA`, `RECIBO`). |
| `currency` | `PEN` \| `USD` | No | Moneda del comprobante formal (default: `PEN`). |
| `exchangeRate` | number | No | Tipo de cambio a Soles (default: `1.0`). |
| `hasIgv` | boolean | No | Regimen tributario (default: `true`). |
| `subtotalPEN` | number | Si | Subtotal neto en Soles sin IGV. |
| `igvAmountPEN` | number | No | Monto IGV en Soles (default: `0`). |
| `totalAmountPEN` | number | Si | Total formal facturado en Soles. |
| `notes` | string | No | Observaciones sobre la valorizacion formal. |
| `items` | array | Si | Precios definitivos por insumo (`detailId`, `unitPriceOriginal > 0`, `notes`). |

#### Logica Financiera:
1. Valida que el comprobante exista y contenga detalles con costo 0 o pendientes de valorizacion.
2. Actualiza la cabecera contable y cada linea en `PurchaseDetail`.
3. Recalcula el `averageCost` en la tabla `Stock` del almacen destino correspondiente:
   $$\text{Stock.averageCost} = \frac{(S_{\text{actual}} \times \text{CPP}_{\text{anterior}}) + (Q_{\text{comprada}} \times C_{\text{unitPEN}})}{S_{\text{actual}}}$$
   (sin alterar `physicalQty` para no duplicar el stock fisico).
4. Retorna el comprobante completamente valorizado con sus nuevos costos consolidados.
