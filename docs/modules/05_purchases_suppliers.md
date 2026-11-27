# Modulo 05 - Proveedores, Compras y Motor CPP (Purchases & Suppliers)

## 1. Descripcion General
Este modulo gestiona el registro de proveedores comerciales (con RUC tributario de 11 digitos opcional), el ingreso de facturas de adquisicion en Almacen Central o en Almacenes de Obra y la ejecucion atomica del algoritmo de Costo Promedio Ponderado (CPP / WAC) segun la normativa contable (NIC 2 / SUNAT).

### Reglas Clave:
- **RUC de Proveedor y Serie de Comprobante Opcionales (`string | null`):** Tanto `Supplier.taxId` como `Purchase.invoiceSeries` son opcionales. Cuando se envian cadenas vacias o espacios, el backend los normaliza a `null`. Si `taxId` se proporciona, debe cumplir exactamente 11 digitos numericos y ser unico (PostgreSQL permite multiples registros con `NULL`). Si `invoiceSeries` es `null`, las observaciones de Kardex (`PURCHASE_ENTRY` y `REVERSAL_EXIT`) muestran `<voucherType> (Sin serie)`.
- **Base Imponible Neta sin IGV y Descuentos Comerciales (NIC 2):** El costo unitario computable para el valor del inventario se calcula sin IGV (18%) y deduciendo los descuentos comerciales por linea (`DiscountType`: `NONE`, `PERCENTAGE`, `FIXED`) antes de impuestos. La formula aplicada por linea es `netLineOriginal = max(0, (purchaseQty * unitPriceOriginal) - discountAmountOriginal)` y `unitCostBasePEN = (netLineOriginal * exchangeRate) / (purchaseQty * conversionFactor)`.
- **Conversion Monetaria (PEN / USD):** En facturas emitidas en dolares (`currency = USD`), el tipo de cambio (`exchangeRate > 0`) es obligatorio. Los importes de linea, descuentos y costos unitarios se convierten a Soles (PEN) multiplicando por `exchangeRate`, manteniendo sincronizados `MovementItem.unitCostSnapshot` y `Stock.averageCost` en ingresos, valorizaciones y reemplazos.
- **Compras Multi-Almacen y Descentralizacion Operativa:** Las compras pueden ingresar directamente tanto a un Almacen Central (`CENTRAL`) como a cualquier Almacen de Obra (`PROJECT_SITE`) activo. Los roles `ADMIN`, `MODERATOR` y `WAREHOUSE_KEEPER` estan facultados para registrar compras y dar de alta nuevos proveedores, permitiendo registrar adquisiciones directas de campo sin friccion burocratica.
- **Segregacion de Seguridad por Sede:** Para usuarios con rol `WAREHOUSE_KEEPER`, la consulta (`GET /purchases`, `GET /purchases/:id`), el registro (`POST /purchases`), la edicion/reversion/reemplazo y la carga de adjuntos (`POST /purchases/:id/attachments`) estan estrictamente acotados a los almacenes que tienen autorizados en la tabla `UserWarehouse`. Cualquier intento de operar sobre una sede ajena produce un error `403 Forbidden`.
- **Servicios y Gastos No Inventariables (`ItemType.SERVICE`):** Los items clasificados como `SERVICE` se persisten en `PurchaseDetail` y sus importes se suman normalmente en la cabecera contable (`subtotalPEN`, `igvAmountPEN`, `totalAmountPEN`), pero se omiten del control de existencias (`Stock`), del recalculo de CPP (`averageCost`) y de los movimientos de Kardex (`PURCHASE_ENTRY` y `REVERSAL_EXIT`). Si todos los renglones de la compra son de tipo `SERVICE`, no se genera movimiento en Kardex (`movementId: null`, `movementNumber: null`).
- **Recepciones a Precio Cero y Proteccion de CPP:** Permite registrar compras e ingresos de stock con precio unitario `0.00` (ej. recepcion fisica mediante Guia de Remision previa a la factura). Si `unitCostBasePEN <= 0`, el motor de CPP no diluye el costo preexistente; conserva `newCPP = prevCPP > 0 ? prevCPP : 0`.
- **Valorizacion Formal Administrativa:** Los comprobantes ingresados con precio `0.00` pueden ser valorizados posteriormente por `ADMIN` o `MODERATOR` mediante `PATCH /api/v1/purchases/:id/valuation`, actualizando la cabecera contable, los descuentos, lotes/caducidad y detalles, sincronizando `MovementItem.unitCostSnapshot` en Kardex y recalculando el `averageCost` en `Stock` sin duplicar unidades fisicas.
- **Trazabilidad de Lotes, Caducidad y Observaciones:** Soporta notas generales de cabecera (`Purchase.notes`) y campos por renglon en `PurchaseDetail`: `lotNumber` (numero de lote), `expirationDate` (fecha de caducidad) y `notes`, editables en `POST /purchases`, `POST /purchases/:id/replace`, `PATCH /purchases/:id/valuation` y `PATCH /purchases/:id` (`itemNotes`).
- **Auditoria de Edicion (`isEdited`) y Preservacion de Adjuntos:** El atributo `Purchase.isEdited` se marca automaticamente en `true` al editar metadatos (`PATCH /purchases/:id`) y en el nuevo comprobante generado por reemplazo atomico (`POST /purchases/:id/replace`), operacion que ademas preserva y reasigna automaticamente todos los registros `DocumentAttachment` desde la factura original hacia la factura de reemplazo.
- **Recalculo Atomico de CPP:** Por cada bien fisico ingresado (distinto de `ItemType.SERVICE`), se actualiza el `Stock.averageCost` en el almacen de destino y se registra un movimiento inmutable `Movement` de tipo `PURCHASE_ENTRY`.
- **Restriccion de Seguridad Financiera:** El Cuadro Comparativo de Precios (`GET /purchases/price-comparison`) y la valorizacion formal son exclusivos de `ADMIN` y `MODERATOR`. Para `WAREHOUSE_KEEPER`, `CostMaskingInterceptor` enmascara recursivamente todas las claves financieras en las respuestas del modulo, incluyendo `unitPriceOriginal`, `unitCostBasePEN`, `subtotalPEN`, `igvAmountPEN`, `totalAmountPEN`, `discountValue`, `discountAmountPEN`, `totalSubtotalPEN`, `totalIgvPEN`, `averageCost` y `newWarehouseAverageCost`.

- **Ruta Base:** `/api/v1/purchases` y `/api/v1/suppliers`
- **Entidades Vinculadas:** `Supplier`, `Purchase`, `PurchaseDetail`, `Warehouse`, `Stock`, `Movement`, `MovementItem`, `DocumentAttachment`

---

## 2. Endpoints de Proveedores (`/api/v1/suppliers`)

### 2.1 Listar Proveedores
Retorna la relacion de proveedores comerciales registrados con conteo de facturas emitidas y paginacion.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/suppliers`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros Query (`SupplierFilterDto`)
| Parametro | Tipo | Por Defecto | Descripcion |
|---|---|---|---|
| `page` | integer | `1` | Numero de pagina. |
| `limit` | integer | `20` | Cantidad de registros por pagina. |
| `search` | string | opcional | Termino de busqueda por RUC o razon social. |
| `sortBy` | `'businessName' \| 'purchasesCount'` | `businessName` | Campo de ordenamiento (`purchasesCount` ordena por `_count.purchases` con desempate por `businessName` ascendente). |
| `sortDir` | `'asc' \| 'desc'` | `asc` (`desc` si `sortBy=purchasesCount`) | Direccion de ordenamiento. |

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
Registra una persona juridica o natural proveedora validando unicidad de RUC (11 digitos numericos) cuando este es proporcionado.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/suppliers`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Request Body (`CreateSupplierDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `taxId` | string (11 digitos) \| `null` | No | Numero de RUC del proveedor (opcional; cadenas vacias se normalizan a `null`). |
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
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
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
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Parametros
- `id` (URL Path): UUID del proveedor.

#### Request Body (`UpdateSupplierDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `taxId` | string (11 digitos) \| `null` | No | RUC del proveedor (`null` o cadena vacia lo limpia; omitido conserva el actual). |
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

### 2.5 Eliminar Proveedor
Elimina fisicamente un proveedor comercial duplicado o registrado por error, siempre que no posea compras asociadas.

- **Metodo:** `DELETE`
- **Ruta:** `/api/v1/suppliers/:id`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Parametros
- `id` (URL Path): UUID del proveedor.

#### Reglas de Negocio
- Valida existencia previa del proveedor (`404 Not Found` si no existe).
- Valida que el proveedor tenga cero compras asociadas (`_count.purchases === 0`); si posee al menos una compra, rechaza la operacion con `400 Bad Request` indicando reasignar primero sus comprobantes desde el modulo de Compras.
- Ejecuta eliminacion fisica permanente en base de datos (`prisma.supplier.delete`).

#### Respuestas
**200 OK - Proveedor eliminado:**
```json
{
  "deleted": true,
  "message": "Proveedor eliminado permanentemente."
}
```

**400 Bad Request - Proveedor con compras asociadas:**
```json
{
  "statusCode": 400,
  "message": "No se puede eliminar el proveedor \"CORPORACION ACEROS AREQUIPA S.A.\" porque tiene 8 compra(s) asociada(s). Reasigne primero sus comprobantes desde el modulo de Compras.",
  "error": "Bad Request"
}
```

**404 Not Found - Proveedor inexistente:**
```json
{
  "statusCode": 404,
  "message": "Proveedor no encontrado",
  "error": "Not Found"
}
```

---

## 3. Endpoints de Compras (`/api/v1/purchases`)

### 3.1 Listar Compras Paginadas
Consulta el historial de comprobantes de compra con filtros avanzados, busqueda por cercania de monto (`approximateAmount`), auditoria de estado (`voidFilter`, `onlyEdited`), paginacion numerica estandarizada y resumen financiero (`summary` y `globalSummary`). Para usuarios con rol `WAREHOUSE_KEEPER`, el listado se segrega de forma automatica retornando unicamente las compras asociadas a sus sedes asignadas (`UserWarehouse`).

- **Metodo:** `GET`
- **Ruta:** `/api/v1/purchases`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros Query (`PurchaseFilterDto`)
| Parametro | Tipo | Por Defecto | Descripcion |
|---|---|---|---|
| `page` | integer (`>= 1`) | `1` | Numero de pagina (paginacion numerica estandarizada). |
| `limit` | integer (`>= 1`) | `20` | Cantidad de registros por pagina (minimo `10` si se envia `approximateAmount`). |
| `warehouseId` | UUID \| `'ALL'` | opcional | Filtrar por almacen destino (para `WAREHOUSE_KEEPER` restringido a sus `UserWarehouse`; retorna `403` si la sede no esta asignada). |
| `supplierId` | UUID \| `'ALL'` | opcional | Filtrar por proveedor (valores vacios o `'ALL'` se sanean automaticamente a `undefined`). |
| `invoiceSeries` | string | opcional | Busqueda parcial insensible a mayusculas por serie/numero (ej. `F001-0004523`). |
| `itemId` | UUID \| `'ALL'` | opcional | Filtrar compras que incluyan un insumo especifico. |
| `itemSearch` | string | opcional | Buscar compras cuyos detalles coincidan por nombre o SKU de insumo. |
| `startDate` | ISO Date \| `YYYY-MM-DD` | opcional | Fecha minima de emision. Si se envia `YYYY-MM-DD`, se normaliza a `YYYY-MM-DDT00:00:00.000Z`. |
| `endDate` | ISO Date \| `YYYY-MM-DD` | opcional | Fecha maxima de emision. Si se envia `YYYY-MM-DD`, se normaliza a `YYYY-MM-DDT23:59:59.999Z`. |
| `voidFilter` | `ACTIVE_ONLY` \| `ALL` \| `VOIDED_ONLY` | opcional | Filtro explicito de anulacion sobre `isReverted`. Tiene precedencia sobre `includeReverted`. |
| `onlyEdited` | boolean | opcional | Si se envia `true`, retorna unicamente compras editadas o generadas por reemplazo (`isEdited = true`). |
| `includeReverted` | boolean | `true` | Parametro retrocompatible (aplicado si no se envia `voidFilter`): si es `false`, excluye compras con `isReverted = true`. |
| `approximateAmount` | number (`>= 0`) | opcional | Monto aproximado en PEN (`totalAmountPEN`) para ordenar comprobantes por cercania absoluta al importe (con desempate por `issueDate` descendente). Fuerza `limit` minimo de `10`. Ignorado automaticamente para `WAREHOUSE_KEEPER` para preservar ceguera financiera. |

#### Resumen Financiero (`summary` y `globalSummary`)
La respuesta incluye los objetos `summary` y `globalSummary`, ambos con estructura `{ totalCount, totalSubtotalPEN, totalIgvPEN, totalAmountPEN }`:
- **`summary` (subconjunto filtrado actual):** Se calcula en paralelo mediante `prisma.purchase.aggregate` reutilizando exactamente el mismo predicado `where` de la consulta sin `skip` ni `take` (cubre todas las paginas coincidentes con los filtros aplicados).
- **`globalSummary` (totales estables por sede):** Se calcula sobre el alcance de sede (`warehouseId` / sedes autorizadas) y `voidFilter` sin filtros de busqueda puntual (`invoiceSeries`, `supplierId`, `startDate`, `endDate`, `onlyEdited`, `itemId`, `itemSearch`). Cuando no hay filtros de busqueda puntual activos, reutiliza `summary` directamente sin ejecutar consultas duplicadas.
- Las sumas monetarias (`totalSubtotalPEN`, `totalIgvPEN`, `totalAmountPEN`) excluyen siempre las facturas anuladas (`isReverted = false`).
- Cuando `voidFilter = VOIDED_ONLY`, se omite la agregacion monetaria y las sumas retornan `0` (`totalSubtotalPEN: 0`, `totalIgvPEN: 0`, `totalAmountPEN: 0`), mientras `totalCount` refleja el total de comprobantes anulados dentro del alcance respectivo.
- Para el rol `WAREHOUSE_KEEPER`, `CostMaskingInterceptor` elimina recursivamente `totalSubtotalPEN`, `totalIgvPEN` y `totalAmountPEN` tanto de `summary` como de `globalSummary`, devolviendo unicamente `{ "totalCount": <n> }` en cada bloque.

#### Respuestas
**200 OK - Listado obtenido (ADMIN / MODERATOR):**
```json
{
  "data": [
    {
      "id": "purch-uuid-1",
      "supplierId": "sup-uuid-aceros-arequipa",
      "warehouseId": "22222222-2222-2222-2222-222222222222",
      "invoiceSeries": "F001-0004523",
      "voucherType": "FACTURA",
      "hasIgv": true,
      "currency": "PEN",
      "exchangeRate": "1.0000",
      "issueDate": "2026-09-22T00:00:00.000Z",
      "subtotalPEN": "28500.00",
      "igvAmountPEN": "5130.00",
      "totalAmountPEN": "33630.00",
      "isEdited": false,
      "isReverted": false,
      "supplier": {
        "id": "sup-uuid-aceros-arequipa",
        "businessName": "CORPORACION ACEROS AREQUIPA S.A.",
        "taxId": "20100138112"
      },
      "warehouse": {
        "id": "22222222-2222-2222-2222-222222222222",
        "name": "Almacen Central Principal",
        "type": "CENTRAL"
      },
      "revertedBy": null,
      "details": [
        {
          "id": "detail-uuid-1",
          "itemId": "item-uuid-cemento",
          "purchaseUnit": "BOLSA",
          "conversionFactor": "1.0000",
          "purchaseQty": "1000.0000",
          "baseQty": "1000.0000",
          "unitPriceOriginal": "28.5000",
          "unitCostBasePEN": "28.5000",
          "subtotalPEN": "28500.00",
          "discountType": "NONE",
          "discountValue": "0.0000",
          "discountAmountPEN": "0.00",
          "lotNumber": "LOT-2026-A1",
          "expirationDate": "2027-06-30T00:00:00.000Z",
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
        "details": 1,
        "documents": 2
      }
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  },
  "summary": {
    "totalCount": 1,
    "totalSubtotalPEN": 28500,
    "totalIgvPEN": 5130,
    "totalAmountPEN": 33630
  },
  "globalSummary": {
    "totalCount": 1,
    "totalSubtotalPEN": 28500,
    "totalIgvPEN": 5130,
    "totalAmountPEN": 33630
  }
}
```

---

### 3.2 Registrar Compra e Ingreso de Stock con Recalculo de CPP
Registra la factura, guia de remision o comprobante de compra, ingresa la mercaderia fisica al almacen especificado (Central u Obra), aplica descuentos por linea segun NIC 2, convierte importes en `USD` a PEN, recalcula el Costo Promedio Ponderado (`averageCost`) y crea la entrada de Kardex `PURCHASE_ENTRY` de forma transaccional atomica.
Si el usuario autenticado tiene rol `WAREHOUSE_KEEPER`, se valida obligatoriamente que el almacen de destino figure en sus sedes asignadas (`UserWarehouse`), retornando `403 Forbidden` en caso contrario.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/purchases`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Request Body (`CreatePurchaseDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `supplierId` | string (UUID) | Si | Identificador del proveedor. |
| `warehouseId` | string (UUID) | Condicional | Identificador del almacen receptor (sede destino). Obligatorio si no se envia `centralWarehouseId`. |
| `centralWarehouseId` | string (UUID) | Condicional | Alias retrocompatible del almacen receptor (obligatorio si no se envia `warehouseId`). |
| `invoiceSeries` | string (max 100) \| `null` | No | Serie y numero de comprobante SUNAT (opcional, ej. `F001-0004523` o `T001-00492`; cadenas vacias se normalizan a `null`). |
| `voucherType` | string | No | Tipo de comprobante (default: `FACTURA`, ej. `BOLETA`, `GUIA`, `RECIBO`). |
| `hasIgv` | boolean | No | Indica si el comprobante tiene IGV desglosado (default: `true`). |
| `currency` | `PEN` \| `USD` | No | Moneda del comprobante (default: `PEN`). |
| `exchangeRate` | number (`> 0`) | Condicional | Tipo de cambio a Soles. Default `1.0` en `PEN`; **obligatorio y mayor a 0 cuando `currency === 'USD'`**. |
| `issueDate` | ISO 8601 string | Si | Fecha de emision de la factura. |
| `subtotalPEN` | number (`>= 0`) | Si | Monto total neto sin IGV expresado en Soles. |
| `igvAmountPEN` | number (`>= 0`) | No | Monto del IGV en Soles (obligatorio `0` si `hasIgv` es `false`; auto deducido si se omite con IGV). |
| `totalAmountPEN` | number (`>= 0`) | Si | Monto total del comprobante en Soles. |
| `notes` | string (max 1000) | No | Observaciones generales del comprobante. |
| `items` | array (`PurchaseItemDto[]`) | Si | Detalle de renglones comprados (minimo 1 elemento). |

**Detalle de cada elemento en `items` (`PurchaseItemDto`):**
- `itemId` (UUID, obligatorio): SKU maestro a ingresar (debe existir y estar activo).
- `purchaseUnit` (string, obligatorio): Unidad de empaque comprada (ej. `PALLET`, `MILLAR`, `BOLSA`, `UND`).
- `conversionFactor` (number `>= 0.0001`, opcional, default `1.0`): Multiplicador para llevar `purchaseUnit` a `Item.baseUnit`.
- `purchaseQty` (number `>= 0.0001`, obligatorio): Cantidad comprada en la unidad de compra.
- `unitPriceOriginal` (number `>= 0`, obligatorio): Precio unitario bruto sin IGV en la moneda original de compra. Admite `0` para recepciones solo con Guia de Remision.
- `discountType` (`NONE` \| `PERCENTAGE` \| `FIXED`, opcional, default `NONE`): Tipo de descuento comercial aplicado a la linea segun NIC 2.
- `discountValue` (number `>= 0`, opcional, default `0`): Porcentaje (`0..100`) si `discountType = PERCENTAGE`, o monto fijo en moneda original (`<= purchaseQty * unitPriceOriginal`) si `discountType = FIXED`.
- `lotNumber` (string max 100, opcional): Numero de lote del insumo adquirido (cadenas vacias se normalizan a `null`).
- `expirationDate` (ISO 8601 string, opcional): Fecha de caducidad del insumo (cadenas vacias se normalizan a `null`).
- `notes` (string max 1000, opcional): Observaciones especificas del renglon.

**Reglas de Descuentos por Linea (NIC 2):**
- Se calcula el importe bruto original: `grossLineOriginal = purchaseQty * unitPriceOriginal`.
- Si `discountType === 'PERCENTAGE'`: se valida `0 <= discountValue <= 100` (`400 Bad Request` si supera 100%) y `discountAmountOriginal = grossLineOriginal * (discountValue / 100)`.
- Si `discountType === 'FIXED'`: se valida `0 <= discountValue <= grossLineOriginal` (`400 Bad Request` si supera el importe bruto de la linea) y `discountAmountOriginal = min(discountValue, grossLineOriginal)`.
- Si `discountType === 'NONE'`: `discountValue = 0` y `discountAmountOriginal = 0`.
- El importe neto de linea antes de IGV es `netLineOriginal = max(0, grossLineOriginal - discountAmountOriginal)`.
- Se persisten `discountAmountPEN = round2(discountAmountOriginal * exchangeRate)`, `subtotalPEN = round2(netLineOriginal * exchangeRate)` y:
  $$\text{unitCostBasePEN} = \frac{\text{netLineOriginal} \times \text{exchangeRate}}{\text{purchaseQty} \times \text{conversionFactor}}$$

**Reglas para Facturas en `USD`:**
- Cuando `currency === 'USD'`, el backend exige `exchangeRate > 0`. Si se omite o es `<= 0`, rechaza la peticion con `400 Bad Request` (`"Para compras en dolares (USD) el tipo de cambio debe ser mayor a cero"`).
- Todos los costos unitarios (`unitCostBasePEN`), descuentos (`discountAmountPEN`), subtotales de linea (`subtotalPEN`) y snapshots de Kardex (`MovementItem.unitCostSnapshot`) se calculan y persisten en Soles (`PEN`).

**Regla `ItemType.SERVICE` en Compras:**
- Los items con `Item.type === 'SERVICE'` se registran en `PurchaseDetail` y sus importes se incluyen en `subtotalPEN`, `igvAmountPEN` y `totalAmountPEN` de la cabecera.
- Se omite completamente la creacion o actualizacion de `Stock`, el recalculo de `averageCost` (CPP) y la insercion en `Movement` / `MovementItem` (`PURCHASE_ENTRY`).
- En la respuesta `details`, cada renglon `SERVICE` retorna `itemType: "SERVICE"` y `newWarehousePhysicalQty: null`.
- Si todos los renglones de la compra son `ItemType.SERVICE`, no se genera movimiento en Kardex y la respuesta devuelve `movementId: null` y `movementNumber: null`.

**Reglas de Proteccion de CPP y Costo Cero:**
- Si `unitCostBasePEN <= 0` (recepcion con costo cero): el algoritmo preserva el CPP anterior `newCPP = prevCPP > 0 ? prevCPP : 0`. El comprobante queda pendiente de valorizacion formal por Administracion.
- Si `userRole === Role.WAREHOUSE_KEEPER`, el atributo `newWarehouseAverageCost` es omitido y `CostMaskingInterceptor` purga todas las claves financieras de la respuesta.

**Reglas de validacion para comprobantes gravados vs sin IGV:**
- Si `hasIgv === true`: si no se envia `igvAmountPEN` pero `totalAmountPEN > subtotalPEN`, el sistema calcula automaticamente `igvAmountPEN = totalAmountPEN - subtotalPEN`. Se valida coherencia `|totalAmountPEN - (subtotalPEN + igvAmountPEN)| <= 0.05`.
- Si `hasIgv === false` (operacion exonerada o no gravada): se valida estrictamente que `igvAmountPEN === 0` y que `|totalAmountPEN - subtotalPEN| <= 0.05`. El costo neto entra integro al calculo del CPP.

**Ejemplo de Peticion:**
```json
{
  "supplierId": "sup-uuid-aceros-arequipa",
  "warehouseId": "22222222-2222-2222-2222-222222222222",
  "invoiceSeries": "F001-0004523",
  "voucherType": "FACTURA",
  "hasIgv": true,
  "currency": "PEN",
  "exchangeRate": 1.0,
  "issueDate": "2026-09-22T10:00:00.000Z",
  "subtotalPEN": 25650.0,
  "igvAmountPEN": 4617.0,
  "totalAmountPEN": 30267.0,
  "items": [
    {
      "itemId": "item-uuid-cemento",
      "purchaseUnit": "BOLSA",
      "conversionFactor": 1.0,
      "purchaseQty": 1000,
      "unitPriceOriginal": 28.5,
      "discountType": "PERCENTAGE",
      "discountValue": 10,
      "lotNumber": "LOT-2026-A1",
      "expirationDate": "2027-06-30T00:00:00.000Z",
      "notes": "Entrega certificada en almacen central"
    }
  ]
}
```

#### Logica de Calculo Ejecutada (para bienes fisicos distintos de `SERVICE`):
1. `baseQty = purchaseQty * conversionFactor = 1000 * 1.0 = 1000`.
2. `grossLineOriginal = 1000 * 28.5 = 28500.00`; con `10%` de descuento: `discountAmountOriginal = 2850.00`, `netLineOriginal = 25650.00`.
3. `unitCostBasePEN = (netLineOriginal * exchangeRate) / (purchaseQty * conversionFactor) = (25650.00 * 1.0) / 1000 = 25.6500`.
4. Se recupera el stock previo en el almacen destino: `S_ant` y `CPP_ant`.
5. **Regla de Adopcion de Costo para Stock Inicial a Costo Cero:**
   - Si `S_ant <= 0` o `CPP_ant <= 0` (caso habitual cuando un insumo ingreso mediante inventario fisico inicial en caseta a costo 0), el algoritmo no diluye el precio contra cero. En su lugar, el nuevo CPP adopta directamente el costo unitario neto de la compra:
     $$\text{CPP}_{\text{nuevo}} = C_{\text{unitPEN}} = 25.6500$$
     Esto garantiza que las unidades preexistentes en el almacen sin valorizar pasen a quedar valorizadas contablemente al costo real de adquisicion.
   - Si `S_ant > 0` y `CPP_ant > 0` (ejemplo con `S_ant = 500` y `CPP_ant = 27.00`):
     $$\text{CPP}_{\text{nuevo}} = \frac{(500 \times 27.00) + (1000 \times 25.65)}{500 + 1000} = \frac{13500 + 25650}{1500} = 26.1000$$
6. Se actualiza `Stock.physicalQty = 1500` y `Stock.averageCost = 26.1000`.
7. Si existen bienes fisicos, se crea el movimiento inmutable `Movement` con codigo correlativo `MOV-2026-00001` y tipo `PURCHASE_ENTRY` (con `unitCostSnapshot = 25.6500` y `totalCostSnapshot = 25650.00`).

#### Respuestas
**201 Created - Compra registrada e inventario actualizado:**
```json
{
  "id": "purch-uuid-1",
  "supplierId": "sup-uuid-aceros-arequipa",
  "warehouseId": "22222222-2222-2222-2222-222222222222",
  "warehouse": {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "Almacen Central Principal",
    "type": "CENTRAL"
  },
  "invoiceSeries": "F001-0004523",
  "voucherType": "FACTURA",
  "hasIgv": true,
  "currency": "PEN",
  "exchangeRate": "1.0000",
  "issueDate": "2026-09-22T10:00:00.000Z",
  "subtotalPEN": "25650.00",
  "igvAmountPEN": "4617.00",
  "totalAmountPEN": "30267.00",
  "notes": null,
  "movementId": "movement-uuid-1",
  "movementNumber": "MOV-2026-00001",
  "details": [
    {
      "id": "detail-uuid-1",
      "itemId": "item-uuid-cemento",
      "itemType": "CONSUMABLE",
      "purchaseQty": 1000,
      "baseQty": 1000,
      "unitCostBasePEN": 25.65,
      "discountType": "PERCENTAGE",
      "discountValue": 10,
      "discountAmountPEN": 2850,
      "lotNumber": "LOT-2026-A1",
      "expirationDate": "2027-06-30T00:00:00.000Z",
      "newWarehouseAverageCost": 26.1,
      "newWarehousePhysicalQty": 1500,
      "notes": "Entrega certificada en almacen central"
    }
  ]
}
```

---

### 3.3 Obtener Detalle de Compra
Obtiene la informacion completa de la factura, proveedor emisor, almacen receptor, renglones comprados (incluyendo descuentos NIC 2, `lotNumber`, `expirationDate` y `notes`) y documentos adjuntos. Para usuarios con rol `WAREHOUSE_KEEPER`, se valida que la compra pertenezca a sus almacenes autorizados (`UserWarehouse`).

- **Metodo:** `GET`
- **Ruta:** `/api/v1/purchases/:id`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
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
  "warehouseId": "22222222-2222-2222-2222-222222222222",
  "invoiceSeries": "F001-0004523",
  "voucherType": "FACTURA",
  "hasIgv": true,
  "currency": "PEN",
  "exchangeRate": "1.0000",
  "issueDate": "2026-09-22T10:00:00.000Z",
  "subtotalPEN": "25650.00",
  "igvAmountPEN": "4617.00",
  "totalAmountPEN": "30267.00",
  "notes": null,
  "isEdited": false,
  "isReverted": false,
  "createdAt": "2026-09-22T10:05:00.000Z",
  "supplier": {
    "id": "sup-uuid-aceros-arequipa",
    "taxId": "20100138112",
    "businessName": "CORPORACION ACEROS AREQUIPA S.A.",
    "contactPhone": "+51 1 5171800",
    "contactEmail": "ventas@acerosarequipa.com",
    "address": "Av. Enrique Meiggs 297, Callao"
  },
  "warehouse": {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "Almacen Central Principal",
    "type": "CENTRAL"
  },
  "revertedBy": null,
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
      "unitCostBasePEN": "25.6500",
      "subtotalPEN": "25650.00",
      "discountType": "PERCENTAGE",
      "discountValue": "10.0000",
      "discountAmountPEN": "2850.00",
      "lotNumber": "LOT-2026-A1",
      "expirationDate": "2027-06-30T00:00:00.000Z",
      "notes": "Entrega certificada en almacen central",
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
Retorna la comparativa exhaustiva de precios de compras historicas activas (`isReverted = false`) para un insumo, calculando el precio menor historico, costo promedio ponderado en stock y precio maximo.

- **Criterio de comparacion y ordenamiento:** Las compras valorizadas (`unitCostWithIgvPEN > 0`) se comparan y ordenan por desembolso unitario efectivo con IGV ascendente (`unitCostWithIgvPEN ASC`), donde `unitCostWithIgvPEN` equivale a `unitCostBasePEN * 1.18` si `hasIgv = true` o `unitCostBasePEN` si `hasIgv = false`, con desempate por fecha de emision descendente (`issueDate DESC`). Las entradas no valorizadas (`unitCostWithIgvPEN <= 0`) se ubican al final ordenadas por `issueDate DESC`.
- **Metricas de resumen:** `minUnitCostPEN` y `maxUnitCostPEN` reflejan el costo unitario efectivo incluyendo IGV segun el regimen tributario (`hasIgv`) de cada comprobante valorizado, mientras que `currentWeightedAverageCostPEN` conserva el costo promedio ponderado (CPP) neto vigente en inventario (`Stock.averageCost`). Los campos `unitCostBasePEN` y `subtotalPEN` de cada entrada permanecen netos sin IGV.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/purchases/price-comparison`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
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
    "minUnitCostPEN": 31.27,
    "maxUnitCostPEN": 33.63,
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
      "unitCostWithIgvPEN": 31.27,
      "totalPEN": 15635,
      "discountType": "NONE",
      "discountValue": 0,
      "discountAmountPEN": 0,
      "lotNumber": "LOT-2026-09",
      "expirationDate": "2026-12-15T00:00:00.000Z",
      "notes": "Lote cemento vence: 15/12/2026"
    }
  ]
}
```

---

### 3.5 Valorizar Compra Formalmente y Recalcular CPP
Permite a Administracion regularizar comprobantes ingresados previamente con costo cero o recepcionados mediante Guia de Remision, asignando precios definitivos de factura (en `PEN` o `USD`), descuentos por linea, lotes y caducidad, actualizando `PurchaseDetail`, sincronizando el costo en el movimiento `PURCHASE_ENTRY` asociado (`MovementItem.unitCostSnapshot` y `totalCostSnapshot`) y recalculando el `averageCost` en `Stock` sin re-ingresar unidades fisicas ni duplicar movimientos en Kardex.

- **Metodo:** `PATCH`
- **Ruta:** `/api/v1/purchases/:id/valuation`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`ValuatePurchaseDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `invoiceSeries` | string (max 100) \| `null` | No | Serie definitiva de la factura formal (si se omite conserva la serie actual; `null` o cadena vacia la limpia). |
| `voucherType` | string | No | Tipo de comprobante definitivo (`FACTURA`, `BOLETA`, `RECIBO`). |
| `currency` | `PEN` \| `USD` | No | Moneda del comprobante formal (si se omite conserva la moneda actual). |
| `exchangeRate` | number (`> 0`) | Condicional | Tipo de cambio oficial a Soles (obligatorio `> 0` si la moneda efectiva es `USD`). |
| `hasIgv` | boolean | No | Regimen tributario (si se omite conserva el valor actual). |
| `subtotalPEN` | number (`>= 0.01`) | Si | Subtotal neto en Soles sin IGV. |
| `igvAmountPEN` | number (`>= 0`) | No | Monto IGV en Soles (default: `0`). |
| `totalAmountPEN` | number (`>= 0.01`) | Si | Total formal facturado en Soles. |
| `notes` | string (max 1000) | No | Observaciones sobre la valorizacion formal. |
| `items` | array (`ValuatePurchaseItemDto[]`) | Si | Precios definitivos por renglon (minimo 1 elemento). |

**Detalle de cada elemento en `items` (`ValuatePurchaseItemDto`):**
- `detailId` (UUID, obligatorio): Identificador del `PurchaseDetail` a valorizar.
- `unitPriceOriginal` (number `>= 0.0001`, obligatorio): Precio unitario neto sin IGV en la moneda original.
- `discountType` (`NONE` \| `PERCENTAGE` \| `FIXED`, opcional): Tipo de descuento comercial (si se omite conserva el actual).
- `discountValue` (number `>= 0`, opcional): Valor del descuento comercial (si se omite conserva el actual).
- `lotNumber` (string max 100, opcional): Numero de lote actualizado.
- `expirationDate` (ISO 8601 string, opcional): Fecha de caducidad actualizada.
- `notes` (string max 1000, opcional): Observaciones de linea actualizadas.

#### Logica Financiera:
1. Valida que el comprobante exista, no este anulado (`isReverted = false`) y contenga al menos un detalle con costo `0` o total de cabecera igual a `0`.
2. Valida `exchangeRate > 0` cuando la moneda efectiva sea `USD`, coherencia contable con/sin IGV y las reglas de descuento por linea (NIC 2).
3. Actualiza la cabecera contable en `Purchase` y cada linea en `PurchaseDetail` (precios, descuentos, `lotNumber`, `expirationDate`, `notes`).
4. Para renglones de tipo `ItemType.SERVICE`, finaliza tras actualizar `PurchaseDetail` sin modificar `MovementItem` ni `Stock`.
5. Para bienes fisicos, sincroniza `MovementItem.unitCostSnapshot = unitCostBasePEN` y `MovementItem.totalCostSnapshot = subtotalPEN` en el movimiento `PURCHASE_ENTRY` asociado.
6. Recalcula el `averageCost` en `Stock` del almacen destino sin alterar `physicalQty`:
   - Si `S_actual <= 0`, `CPP_anterior <= 0` o `S_actual <= Q_comprada`, el nuevo costo adopta directamente `unitCostBasePEN`.
   - En caso contrario, con `S_previo = S_actual - Q_comprada`:
     $$\text{Stock.averageCost} = \frac{(S_{\text{previo}} \times \text{CPP}_{\text{anterior}}) + (Q_{\text{comprada}} \times C_{\text{unitPEN}})}{S_{\text{actual}}}$$
7. Retorna el comprobante completamente valorizado con sus detalles y documentos adjuntos.

---

### 3.6 Revertir Compra (Contra-Asiento Contable)
Anula logicamente una compra (`isReverted = true`), descuenta las unidades fisicas ingresadas del almacen receptor validando que permanezcan en stock libre disponible (`physicalQty - reservedQty - loanedQty >= baseQty`), recalcula de forma inversa el Costo Promedio Ponderado (`averageCost`) de cada bien fisico involucrado y genera un movimiento de Kardex `REVERSAL_EXIT` enlazado al `PURCHASE_ENTRY` original (marcado tambien como revertido).

- **Comportamiento para `ItemType.SERVICE`:** Las lineas de tipo `SERVICE` se omiten de la validacion de stock libre, del recalculo inverso de CPP y de `REVERSAL_EXIT`. Si la compra contenia unicamente servicios, `reversalMovementId` y `reversalMovement` retornan `null`.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/purchases/:id/revert`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER` asignado en `UserWarehouse`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Request Body (`RevertPurchaseDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `reversalReason` | string (5..500 chars) | Si | Motivo formal de la anulacion o correccion contable. |

---

### 3.7 Editar Metadatos de Compra sin Afectar Inventario
Permite corregir datos documentales o administrativos de una compra vigente (`isReverted = false`) sin alterar cantidades, costos ni movimientos de Kardex. Marca automaticamente el indicador de auditoria `isEdited = true` en el comprobante.

- **Metodo:** `PATCH`
- **Ruta:** `/api/v1/purchases/:id`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER` asignado en `UserWarehouse`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Request Body (`UpdatePurchaseMetadataDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `supplierId` | string (UUID) | No | Nuevo proveedor emisor validado. |
| `invoiceSeries` | string (max 100) \| `null` | No | Serie y numero corregidos del comprobante (`null` o cadena vacia lo limpia; omitido conserva el actual). |
| `voucherType` | string (max 50, no vacio) | No | Tipo de comprobante corregido. |
| `issueDate` | ISO 8601 string | No | Fecha de emision corregida. |
| `notes` | string (max 1000) | No | Observaciones generales actualizadas. |
| `itemNotes` | array (`PurchaseDetailNoteInputDto[]`) | No | Actualizacion por renglon de notas, numero de lote y fecha de caducidad. |

**Estructura de cada elemento en `itemNotes` (`PurchaseDetailNoteInputDto`):**
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `detailId` | string (UUID) | Si | Identificador del `PurchaseDetail` perteneciente a la compra. |
| `notes` | string (max 1000) | No | Nota actualizada del renglon (cadena vacia la limpia a `null`). |
| `lotNumber` | string (max 100) \| `null` | No | Numero de lote actualizado (`null` o cadena vacia lo limpia). |
| `expirationDate` | ISO 8601 string \| `null` | No | Fecha de caducidad actualizada (`null` o cadena vacia la limpia). |

---

### 3.8 Reemplazar Compra Atomicamente
Ejecuta en una unica transaccion ACID la reversion de la compra original (incluyendo validacion de stock libre, recalculo inverso de CPP y `REVERSAL_EXIT` para bienes fisicos) junto con el registro de una nueva compra marcada automaticamente con `isEdited = true` y su respectivo `PURCHASE_ENTRY` (sincronizando `Stock.averageCost` y `MovementItem.unitCostSnapshot` en PEN para compras en `PEN` o `USD`). Deja la compra anterior vinculada mediante `replacedById` apuntando al nuevo comprobante y **preserva/reasigna automaticamente todos los adjuntos `DocumentAttachment`** de la compra original hacia el nuevo comprobante corregido.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/purchases/:id/replace`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER` asignado en `UserWarehouse`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Request Body (`ReplacePurchaseDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `(campos de CreatePurchaseDto)` | - | Segun DTO base | Incluye `supplierId`, `warehouseId` / `centralWarehouseId`, `invoiceSeries`, `voucherType`, `hasIgv`, `currency`, `exchangeRate`, `issueDate`, `subtotalPEN`, `igvAmountPEN`, `totalAmountPEN`, `notes` e `items` (con soporte completo de descuentos NIC 2, `lotNumber`, `expirationDate` e `ItemType.SERVICE`). |
| `reversalReason` | string (5..500 chars) | Si | Motivo del reemplazo y anulacion de la factura original. |

---

### 3.9 Adjuntar Evidencias y Comprobantes a una Compra
Permite subir fotografias (optimizadas automaticamente a WebP por Sharp, calidad 80%, maximo 1920x1080 px) o archivos PDF (validados por cabecera magica `%PDF-`) y vincularlos directamente a una compra existente con marca de confidencialidad `isConfidential: true`.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/purchases/:id/attachments`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER` asignado al almacen de la compra en `UserWarehouse`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: multipart/form-data`

#### Parametros
- `id` (URL Path): UUID del comprobante de compra.

#### Parametros Form-Data
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `files` | Array de Binarios (`File[]`, max 10) | Condicional | Multiples archivos PDF (hasta 15 MB c/u) o imagenes JPEG/PNG/WebP (hasta 10 MB c/u). |
| `file` | Binario (`File`, max 1) | Condicional | Archivo unico alternativo si no se usa el campo `files`. Debe enviarse al menos un archivo entre `files` y `file` (limite total de 10 por carga). |

#### Respuestas
**201 Created - Adjuntos registrados:**
```json
[
  {
    "id": "doc-uuid-1",
    "purchaseId": "purch-uuid-1",
    "transferId": null,
    "movementId": null,
    "custodyId": null,
    "proofType": null,
    "originalName": "factura_F001_0004523.pdf",
    "storedPath": "purchases/2026/09/uuid-generado.pdf",
    "mimeType": "application/pdf",
    "fileSizeBytes": 412800,
    "isConfidential": true,
    "createdAt": "2026-09-23T15:10:00.000Z"
  }
]
```

**400 Bad Request - Sin archivos o formato/limite invalido:**
```json
{
  "statusCode": 400,
  "message": "Debe proporcionar al menos un archivo para adjuntar a la compra",
  "error": "Bad Request"
}
```

**403 Forbidden - Almacenero sin acceso a la sede de la compra:**
```json
{
  "statusCode": 403,
  "message": "No tiene permisos para adjuntar documentos en compras de otro almacen",
  "error": "Forbidden"
}
```

---

### 3.10 Eliminar Adjunto de una Compra
Elimina el archivo fisico almacenado en disco y su registro `DocumentAttachment` validando previamente que el adjunto pertenezca a la compra especificada (via `DocumentsService.removePurchaseAttachment`).

- **Metodo:** `DELETE`
- **Ruta:** `/api/v1/purchases/:id/attachments/:attachmentId`
- **Acceso:** Protegido (Exclusivo `ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Parametros
- `id` (URL Path): UUID del comprobante de compra.
- `attachmentId` (URL Path): UUID del registro `DocumentAttachment`.

#### Respuestas
**200 OK - Adjunto eliminado:**
```json
{
  "id": "doc-uuid-1",
  "purchaseId": "purch-uuid-1",
  "deleted": true
}
```

**404 Not Found - Adjunto inexistente o perteneciente a otra compra:**
```json
{
  "statusCode": 404,
  "message": "Adjunto no encontrado para el comprobante de compra especificado",
  "error": "Not Found"
}
```

> Nota RBAC: Para `WAREHOUSE_KEEPER`, todas las claves financieras en las respuestas de `GET /purchases`, `GET /purchases/:id`, `POST /purchases`, `POST /purchases/:id/revert`, `PATCH /purchases/:id` y `POST /purchases/:id/replace` (incluyendo `unitPriceOriginal`, `unitCostBasePEN`, `subtotalPEN`, `igvAmountPEN`, `totalAmountPEN`, `discountValue`, `discountAmountPEN`, `totalSubtotalPEN`, `totalIgvPEN`, `averageCost` y `newWarehouseAverageCost`) son enmascaradas automaticamente por `CostMaskingInterceptor`. Para obtener unicamente compras activas usar `?voidFilter=ACTIVE_ONLY` (o `?includeReverted=false`), para anuladas `?voidFilter=VOIDED_ONLY` y para modificadas `?onlyEdited=true`.
