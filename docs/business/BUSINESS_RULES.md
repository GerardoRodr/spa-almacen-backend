# BUSINESS_RULES.md — Reglas de Negocio y Algoritmos Core (SPA-ALMACEN-ERP)

Este documento constituye la **Fuente Unica de Verdad (Single Source of Truth - SSOT)** para la logica de negocio, reglas de dominio y algoritmos financieros del sistema **SPA-ALMACEN-ERP**.

---

## 1. Clasificacion, Tipificacion, Trazabilidad y Ciclo de Vida de Items

### 1.1. `CONSUMABLE` (Materiales Consumibles)
- Materiales de gasto definitivo en obra (cemento, arena, acero corrugado, aditivos, tuberias, cables).
- **Clasificaciones Personalizadas (`ItemCategory`):**
  - Permite agrupar los insumos en categorias adicionales creadas por la administracion (ej. "Arrendamiento", "Agregados", "Material Electrico", "Pinturas"), facilitando filtros avanzados sin alterar la tipificacion base.
- **Atributo de Perecibilidad (`isPerishable`):**
  - Si es `true`: materiales con vida util limitada o propensos a caducidad (quimicos, aditivos, resinas epoxicas, bolsas de cemento).
  - Si es `false`: materiales sin fecha de vencimiento corto (acero corrugado, agregados gruesos, ladrillos, tuberias PVC).
- Se procesan bajo el ciclo de abastecimiento de obra:
  1. Ingreso a Almacen Central por compra a proveedor (`PURCHASE_ENTRY`).
  2. Reserva logica para el proyecto receptor (`allocatedQty`).
  3. Transferencia fisica hacia el Almacen de Obra temporal (`TRANSFER_DISPATCH` / `TRANSFER_RECEIPT`).
  4. Salida por consumo definitivo entregada a capataces en obra (`CONSUMPTION_EXIT`).
- Admite unidades fraccionarias (`DECIMAL(12, 4)`) en su unidad base (`baseUnit`).

### 1.2. `TOOL` (Herramientas Menores y de Mano)
- Bienes manuales requeridos para ejecucion de cuadrillas (palas, picos, carretillas, combas, llanas, serruchos, cinceles).
- No son consumibles; permanecen en el activo patrimonial de la empresa.
- Se gestionan en piso mediante vales de prestamo y custodia en caseta (`ToolCustody`), controlados por cantidad (`quantity`).
- **Condicion Inicial en Despacho:** Soporta entrega en condicion `NEW` (nueva), `OPERATIVE` (operativa) o `DAMAGED_USABLE` (desgaste normal).

### 1.3. `EQUIPMENT` (Equipos Menores y Portatiles)
- Bienes electromecanicos o electronicos portatiles de obra (rotomartillos, vibradoras de concreto, teodolitos, compactadoras livianas, bombas sumergibles).
- No son consumibles. Requieren registro de serie o codigo patrimonial (`serialOrCode`) y vales de custodia (`ToolCustody`) vinculados a un responsable individual con DNI.
- **Condicion Inicial en Despacho:** Soporta entrega en condicion `NEW` (nueva), `OPERATIVE` (operativa) o `DAMAGED_USABLE` (desgaste normal).

### 1.4. `MACHINERY` (Maquinaria Pesada y Flota)
- Equipos pesados o autopropulsados (retroexcavadoras, cargadores frontales, camiones volquete, torres grua, grupos electrogenos de alta potencia).
- No se prestan como herramientas menores en caseta de obra. Su control operativo se gestiona mediante partes diarios (`MachineryShiftLog`), registrando horometro inicial/final o kilometraje (`MeterType`: `HOUR_METER` | `KILOMETER`), operador y evidencias fotograficas.

### 1.5. `SERVICE` (Servicios y Conceptos Facturables sin Stock)
- Conceptos no inventariables adquiridos a proveedores y facturables en el modulo de Compras (fletes, transporte de carga, calibraciones, ensayos de laboratorio, alquileres por evento o servicios tecnicos externos).
- **Prefijo SKU Estandarizado:** Se autogenera correlativamente bajo el prefijo **`SER-XXXX`** mediante `SequenceGeneratorService`.
- **Facturacion sin Impacto en Inventario Fisico:**
  - Las lineas de compra con `Item.type = SERVICE` se registran normalmente en `PurchaseDetail` (incluyendo descuentos comerciales por linea, `subtotalPEN`, `lotNumber`/`expirationDate` y `notes`) y computan dentro de los totales del comprobante (`subtotalPEN`, `igvAmountPEN`, `totalAmountPEN`).
  - **Excluidos de Stock y CPP:** No crean ni actualizan registros en `Stock` ni participan en el recalculo de `averageCost` durante la creacion (`POST /purchases`), valorizacion (`PATCH /purchases/:id/valuation`) o reversion (`POST /purchases/:id/revert`) de compras.
  - **Excluidos de Kardex:** No emiten lineas ni movimientos `PURCHASE_ENTRY` al comprar ni contra-asientos `REVERSAL_EXIT` al anular. Si una factura contiene unicamente items `SERVICE`, el campo `movementId` queda en `null`.
  - **Bloqueo de Stock Inicial y Movimientos Fisicos:** El alta de insumo (`POST /items`) rechaza con `400 Bad Request` cualquier intento de ingresar `initialStock.quantity > 0` para un item `SERVICE`. Asimismo, los consumos definitivos (`CONSUMPTION_EXIT`) aceptan solo `CONSUMABLE` y la custodia (`ToolCustody`) acepta solo `TOOL`/`EQUIPMENT`.
  - **Excluidos de Alertas de Stock Critico:** Tanto el indicador `criticalItemsCount` en `GET /dashboard/metrics` como el filtro `lowStockOnly=true` en `GET /items` excluyen explicitamente los insumos con `type = 'SERVICE'` y los registros inactivos (`isActive = false`).

### 1.6. Trazabilidad Opcional por Insumo (`trackLot`, `trackExpiration`)
- Cada insumo del catalogo (`Item`) dispone de dos banderas booleanas opcionales configurables al crear o editar:
  - `trackLot` (por defecto `false`): indica que el insumo requiere control de numero de lote en compras.
  - `trackExpiration` (por defecto `false`): indica que el insumo requiere control de fecha de caducidad en compras.
- Los atributos estructurados `lotNumber` (cadena de hasta 100 caracteres) y `expirationDate` (fecha ISO 8601) se persisten directamente por linea en `PurchaseDetail` durante:
  1. Registro de compra (`POST /purchases`).
  2. Valorizacion formal (`PATCH /purchases/:id/valuation`).
  3. Edicion de metadatos por renglon (`PATCH /purchases/:id` mediante `itemNotes`).
  4. Reemplazo atomico de compra (`POST /purchases/:id/replace`).
- Ambos campos se exponen ademas en el Cuadro Comparativo de Precios (`GET /purchases/price-comparison`) para auditoria historica de lotes y vencimientos.

### 1.7. Eliminacion Segura de Items (`DELETE /items/:id`)
- Operacion habilitada para los roles **`ADMIN`** y **`MODERATOR`** (`WAREHOUSE_KEEPER` recibe `403 Forbidden`).
- **Precondiciones Obligatorias de Inventario Cero (Error `400 Bad Request` si se incumplen):**
  1. Stock fisico consolidado en todos los almacenes igual a cero ($\sum \text{Stock.physicalQty} = 0$).
  2. Stock reservado consolidado en todos los almacenes igual a cero ($\sum \text{Stock.reservedQty} = 0$).
  3. Cero vales de custodia abiertos y vigentes (`ToolCustody` con `returnDate == null` e `isReverted = false`).
- **Regla de Borrado Fisico vs. Borrado Logico (`isActive`):**
  El sistema evalua el conteo de historial transaccional en `PurchaseDetail`, `MovementItem`, `TransferItem`, `ProjectRequirement`, `ToolCustody` y `MachineryShiftLog`:
  - **Sin historial (`totalHistoryCount === 0`):** Se ejecuta **eliminacion fisica permanente** (`prisma.item.delete`), retornando `{ action: 'DELETED' }`.
  - **Con historial (`totalHistoryCount > 0`):** Se ejecuta **desactivacion logica** marcando `Item.isActive = false`, retornando `{ action: 'DEACTIVATED' }` para preservar intacta la integridad referencial del Kardex, compras, transferencias y proyectos historicos.
- **Restricciones sobre Items Inactivos (`isActive = false`):**
  - Se excluyen por defecto de `GET /items` (solo visibles con `includeInactive=true`), alertas de perecibles (`GET /items/perishable-alerts`) y metricas/graficos de Dashboard.
  - Se bloquea su uso en nuevas compras (`POST /purchases`, `POST /purchases/:id/replace`), nuevos o actualizados alias S10 (`POST /items/aliases`, `PUT /items/aliases/:id`) y altas/reasignaciones de requerimientos en proyectos (`POST/PUT /projects/:id/requirements`).

---

## 2. Inmutabilidad del Kardex, Contra-Asientos y Transacciones ACID

### 2.1. Principio Append-Only y Trazabilidad Contable
- Todos los registros del libro mayor contable (`Movement` y `MovementItem`) conservan su secuencia historica e integridad contable.
- **Se prohiben operaciones `DELETE` fisicas o mutaciones directas de cantidades/costos sobre `Movement` o `MovementItem`.**
- El ciclo de vida operativo de transferencias, aprobaciones, ordenes, custodias y jornadas se gestiona en entidades independientes (`Transfer`, `Purchase`, `ToolCustody`, `MachineryShiftLog`), dejando al Kardex el registro del hecho fisico consumado.

### 2.2. Ajustes de Inventario y Mermas
- Cualquier descuadre fisico detectado en toma de inventario se regulariza mediante un `Movement` de tipo `INVENTORY_ADJUSTMENT` o `SHRINKAGE_EXIT`.
- Exige obligatoriamente motivo justificado, evidencia fotografica adjunta y aprobacion de los roles `ADMIN` o `MODERATOR`.

### 2.3. Transacciones Atomicas
- Toda operacion que modifique simultaneamente stocks (`physicalQty`, `reservedQty`, `loanedQty`), recalcule costos promedio, revierta o reemplace transacciones, cambie almacenes asignados a proyectos o liquide transferencias debe ejecutarse dentro de un bloque transaccional atomico (`prisma.$transaction`).

### 2.4. Politica de Correccion en Tres Niveles y Contra-Asientos
El sistema resuelve correcciones operativas sin destruir el historial contable mediante tres niveles excluyentes de intervencion:
1. **Nivel 1 — Reversion Contable / Anulacion (`revert`, `cancel`, `revert-reception`, `revert-dispatch`, `revert-return`):**
   - Marca la transaccion o movimiento como revertido/cancelado (`isReverted = true` o `status = CANCELLED`, con sello de `revertedAt`/`cancelledAt`, usuario y motivo obligatorio).
   - Emite un contra-asiento compensatorio en `Movement` de tipo **`REVERSAL_EXIT`** (para revertir ingresos previos) o **`REVERSAL_ENTRY`** (para revertir salidas previas), vinculado mediante `reversesMovementId`.
   - **Validacion de Stock y Recalculo Inverso de CPP:** Al revertir un ingreso (`Purchase`, recepcion de transferencia o ajuste positivo), valida que `Stock.physicalQty - reservedQty - loanedQty >= Q`. El CPP se recalcula inversamente descontando el lote revertido; si `nuevoStock <= 0`, `averageCost` retorna a `0.0000`. En compras, las lineas con `Item.type = SERVICE` se omiten de la validacion de stock, recalculo de CPP y generacion de `REVERSAL_EXIT`.
   - **Restauracion de Cuotas de Proyecto y Prestamos:** Revertir `CONSUMPTION_EXIT` descuenta `ProjectRequirement.consumedQty`; cancelar una transferencia `IN_TRANSIT` puede restaurar `ProjectRequirement.allocatedQty` y `Stock.reservedQty` en Central; revertir un despacho o retorno de custodia restaura `Stock.loanedQty` (y `physicalQty` en bajas).
2. **Nivel 2 — Edicion de Metadatos No Contables (`PATCH`):**
   - Permite corregir campos descriptivos sin alterar cantidades, costos, almacenes ni inventario (observaciones, notas por lote/renglon, `lotNumber` y `expirationDate` en `PurchaseDetail`, serie de factura, tipo de comprobante, fecha de emision y proveedor en compras sin cambiar importes, notas de despacho/recepcion, datos de operario/DNI o lecturas de horometro/kilometraje en jornadas).
   - En Compras (`PATCH /purchases/:id`), toda edicion exitosa sella automaticamente la bandera de auditoria **`Purchase.isEdited = true`**.
   - Bloqueado para registros ya revertidos/cancelados (`400 Bad Request`).
3. **Nivel 3 — Reemplazo Atomico (`POST :id/replace*`):**
   - Dentro de una unica transaccion ACID (`prisma.$transaction`), ejecuta primero la reversion completa (Nivel 1) del registro original y crea de inmediato el nuevo registro corregido, enlazando el original con `replacedById`.
   - En Compras (`POST /purchases/:id/replace`), el nuevo comprobante se crea con **`isEdited = true`** y **preserva automaticamente los documentos adjuntos previos**, reasignando `DocumentAttachment.purchaseId` del comprobante anulado al nuevo comprobante dentro de la misma transaccion.
   - Aplicable en compras, transferencias (`IN_TRANSIT` o `COMPLETED`/`DISCREPANCY`), consumos, mermas directas y vales de custodia de herramientas.

### 2.5. Exclusion de Registros Anulados, Auditoria de Compras y Gestion de Adjuntos
- **Filtros de Anulacion, Auditoria y Busqueda por Monto en Compras (`GET /purchases`):**
  - Soporta el parametro explicito **`voidFilter`** con tres modos: `ACTIVE_ONLY` (`isReverted = false`), `VOIDED_ONLY` (`isReverted = true`) y `ALL` (sin filtro de anulacion). Tiene precedencia sobre el parametro retrocompatible `includeReverted`.
  - Soporta el parametro booleano **`onlyEdited=true`** para filtrar exclusivamente comprobantes marcados con `Purchase.isEdited = true` (editados en Nivel 2 o generados mediante reemplazo en Nivel 3).
  - Soporta el parametro numerico **`approximateAmount`** (`>= 0`) para ordenar por cercania absoluta a `totalAmountPEN` (con desempate por `issueDate` descendente y minimo de `10` resultados por pagina). Se ignora automaticamente para `WAREHOUSE_KEEPER` para preservar la ceguera financiera.
- **Resumen Financiero Global (`summary` y `globalSummary` en `GET /purchases`):**
  - El listado de compras retorna dos bloques de agregacion `{ totalCount, totalSubtotalPEN, totalIgvPEN, totalAmountPEN }` calculados en PostgreSQL via `prisma.purchase.aggregate` sobre registros vigentes (`isReverted = false`), independientemente de la pagina consultada (`page`/`limit`):
    - **`summary`:** Totales del subconjunto filtrado actual (incluye filtros de busqueda puntual).
    - **`globalSummary`:** Totales estables por alcance de sede y `voidFilter` sin filtros de busqueda puntual (`invoiceSeries`, `supplierId`, `startDate`, `endDate`, `onlyEdited`, `itemId`, `itemSearch`), reutilizando `summary` sin consultas duplicadas cuando no hay filtros activos.
  - Cuando `voidFilter = VOIDED_ONLY`, las sumatorias monetarias retornan `0`.
  - Los campos monetarios de ambos resumenes (`totalSubtotalPEN`, `totalIgvPEN`, `totalAmountPEN`) son purgados recursivamente por `CostMaskingInterceptor` para el rol `WAREHOUSE_KEEPER`.
- **Eliminacion Segura de Proveedores Duplicados (`DELETE /suppliers/:id`):**
  - Restringido a `ADMIN` y `MODERATOR`; exige `0` compras asociadas (`_count.purchases === 0`, retornando `400 Bad Request` en caso contrario) para ejecutar la eliminacion fisica del registro duplicado.
- **Gestion de Adjuntos en Compras Existentes:**
  - `POST /purchases/:id/attachments`: Permite adjuntar nuevas fotografias (convertidas a WebP con Sharp) o PDFs a una compra existente (`isConfidential = true`). Autorizado para `ADMIN`, `MODERATOR`, y `WAREHOUSE_KEEPER` unicamente sobre compras de sus almacenes asignados.
  - `DELETE /purchases/:id/attachments/:attachmentId`: Eliminacion fisica en disco y logica en `DocumentAttachment`, validando pertenencia a la compra. Restringido exclusivamente al rol **`ADMIN`**.
- **Exclusion Automatica de Anulados en Operaciones y Analitica:**
  - Los listados operativos exponen `includeReverted` (por defecto `true` para auditoria historica; `false` oculta anulados).
  - Las consultas operativas activas y metricas de negocio excluyen automaticamente registros con `isReverted = true`:
    - Prestamos pendientes (`onlyPending=true`), deuda por operario (`worker/:dni`) y conteo `toolsInField` en Dashboard.
    - Calculo de `minHistoricalUnitCost` en `Gap Analysis`, historial en `price-comparison` y ultima compra en `perishable-alerts`.
    - Calculo de jornada abierta (`onlyOpen=true`), validacion de inicio de turno y ultimo medidor (`lastMeter`) en Maquinaria.

---

## 3. Algoritmo del Costo Promedio Ponderado (CPP / WAC) y Descuentos NIC 2

### 3.1. Moneda Base (PEN), Base Imponible, Tipo de Cambio y Descuentos Comerciales (NIC 2)
- La valorizacion del inventario y el calculo de `Stock.averageCost` se realizan en Soles (PEN).
- **Tratamiento Tributario (Comprobantes Gravados vs Sin IGV):**
  - **Operaciones Gravadas (`hasIgv = true`):** El costo unitario computable al inventario es el **costo neto sin IGV**, pues el IGV es credito fiscal para la empresa y no forma parte del costo de adquisicion (NIC 2 / SUNAT). Se valida coherencia `|totalAmountPEN - (subtotalPEN + igvAmountPEN)| <= 0.05`.
  - **Operaciones Exoneradas o No Gravadas (`hasIgv = false`):** En adquisiciones sin IGV desglosado (boletas, recibos o proveedores exonerados), el costo total pagado entra integro a la base imponible y computa directamente en el nuevo CPP, validando que `igvAmountPEN === 0` y `|totalAmountPEN - subtotalPEN| <= 0.05`.
- **Tipo de Cambio Obligatorio en Dolares (USD):**
  - En compras con `currency = USD` (en creacion, valorizacion y reemplazo), el campo `exchangeRate` es estrictamente obligatorio y mayor a cero (`exchangeRate > 0`). Cualquier omision o valor menor o igual a cero es rechazado con `400 Bad Request`.
  - En compras con `currency = PEN`, `exchangeRate` adopta `1.0000` por defecto.
- **Descuentos Comerciales por Linea (NIC 2):**
  - Conforme a la NIC 2 (Inventarios), los descuentos comerciales, rebajas y otras partidas similares se deducen al determinar el costo de adquisicion **antes** de calcular el IGV y el Costo Promedio Ponderado (CPP).
  - Cada linea en `PurchaseDetail` registra `discountType` (`DiscountType`: `NONE` | `PERCENTAGE` | `FIXED`), `discountValue` y `discountAmountPEN`:
    - `NONE`: Sin descuento (`discountValue = 0`, `discountAmountOriginal = 0`).
    - `PERCENTAGE`: Porcentaje sobre el importe bruto de la linea (`0 <= discountValue <= 100`):
      $$\text{discountAmountOriginal} = (\text{purchaseQty} \times \text{unitPriceOriginal}) \times \frac{\text{discountValue}}{100}$$
    - `FIXED`: Monto fijo en la moneda original de la compra (`0 <= discountValue <= grossLineOriginal`):
      $$\text{discountAmountOriginal} = \min(\text{discountValue},\ \text{purchaseQty} \times \text{unitPriceOriginal})$$
  - **Validaciones Estrictas (`400 Bad Request`):** Se rechazan descuentos negativos (`discountValue < 0`), porcentajes superiores al `100%` o descuentos fijos que superen el importe bruto de la linea (`grossLineOriginal = purchaseQty * unitPriceOriginal`).
  - **Calculo Neto por Linea:**
    $$\text{netLineOriginal} = \max(0,\ \text{purchaseQty} \times \text{unitPriceOriginal} - \text{discountAmountOriginal})$$
    $$\text{discountAmountPEN} = \text{round}_2(\text{discountAmountOriginal} \times \text{exchangeRate})$$
    $$\text{subtotalPEN}_{\text{linea}} = \text{round}_2(\text{netLineOriginal} \times \text{exchangeRate})$$

### 3.2. Formula de Recalculo Atomico (Unificada PEN/USD con Descuentos)
Por cada ingreso fisico por compra recibido en el Almacen Central o en un Almacen de Obra temporal (`PROJECT_SITE`) (omitiendo lineas de tipo `SERVICE`):

$$\text{CPP}_{\text{nuevo}} = \frac{(S_{\text{ant}} \times \text{CPP}_{\text{ant}}) + (Q_{\text{ing}} \times C_{\text{unitPEN}})}{S_{\text{ant}} + Q_{\text{ing}}}$$

Donde:
- $S_{\text{ant}}$: `Stock.physicalQty` en el almacen de destino previo al ingreso.
- $\text{CPP}_{\text{ant}}$: `Stock.averageCost` en el almacen de destino previo al ingreso. Si $S_{\text{ant}} \le 0$ o $\text{CPP}_{\text{ant}} \le 0$, entonces $\text{CPP}_{\text{nuevo}} = C_{\text{unitPEN}}$ (regla de adopcion directa que evita dilucion contra cero cuando existia inventario inicial no valorizado).
- $Q_{\text{ing}}$: Cantidad ingresada expresada en la Unidad Base (`baseQty = purchaseQty * conversionFactor`, redondeada a 4 decimales).
- $C_{\text{unitPEN}}$: Costo unitario neto descontado en Soles por unidad base (formula unificada para PEN y USD, redondeada a 4 decimales):
  $$C_{\text{unitPEN}} = \frac{\text{netLineOriginal} \times \text{exchangeRate}}{\text{purchaseQty} \times \text{conversionFactor}}$$

- **Compras Multi-Almacen:** Las compras directas a almacenes de obra calculan y actualizan el CPP especifico de esa obra sin alterar el Almacen Central, reflejando fletes locales o costos provinciales (ej. Trujillo, Pacasmayo, Chepen).
- **Cuadro Comparativo de Precios:** Los costos historicos de adquisicion de cada insumo (excluyendo compras anuladas) alimentan el cuadro comparativo corporativo ordenado de menor a mayor costo unitario base (`unitCostBasePEN ASC`), identificando al mejor proveedor historico y mostrando los descuentos, lotes y fechas de caducidad registrados.

### 3.3. Snapshot de Costo en Movimientos
- Cada transferencia despachada a obra o salida de consumo congela el `averageCost` vigente de ese momento en `MovementItem.unitCostSnapshot`.
- Esto garantiza que los informes financieros y valorizaciones de obra posteriores no se alteren cuando ingresen nuevas compras a precios diferentes en el Almacen Central.

### 3.4. Valorizacion Manual Administrativa de Stock
- En escenarios donde un insumo ingresa al inventario mediante toma fisica en caseta o carga inicial con costo cero (`averageCost = 0.0000`), `ADMIN` o `MODERATOR` puede valorizarlo o actualizar el CPP de cualquier sede directamente mediante `PATCH /api/v1/warehouses/:id/stock/:itemId/valuation`.
- Esta operacion no modifica las cantidades fisicas existentes, unicamente actualiza la base monetaria de costeo promedio para imputaciones futuras de salida por consumo y transferencias.

### 3.5. Alta Agilizada de Insumos y Toma de Stock Inicial Ciego
- **Descentralizacion Operativa:** Para eliminar la friccion burocratica en frentes de obra y permitir compras rapidas de insumos no catalogados, el rol `WAREHOUSE_KEEPER` esta facultado para registrar nuevos items en el catalogo maestro directamente desde caseta o dispositivos moviles.
- **Autogeneracion Estandarizada de SKU:** Los codigos de inventario se autogeneran de forma correlativa por clasificacion (`MAT-XXXX`, `HER-XXXX`, `EQU-XXXX`, `MAQ-XXXX`, `SER-XXXX`) mediante `SequenceGeneratorService`, evitando colisiones o codificaciones arbitrarias.
- **Restriccion para Servicios:** No se permite enviar `initialStock.quantity > 0` al crear un insumo de tipo `SERVICE` (`400 Bad Request`).
- **Principio de Costo Ciego:**
  - El personal de caseta y almaceneros operan bajo un esquema estrictamente fisico, sin acceso a costos de compra, descuentos, margenes o precios de venta.
  - Al dar de alta un insumo con stock inicial o al registrar una toma fisica en caseta (`POST /api/v1/movements/initial-stock`), el sistema fuerza el costo a `0.00` y `CostMaskingInterceptor` enmascara cualquier atributo financiero en las respuestas.
- **Ruta de Convergencia Contable:**
  - Todo stock inicial a costo cero queda claramente senalizado con el estado "Sin valorizar" para la administracion.
  - Se valoriza contablemente de manera transparente tan pronto se registre la primera compra formal con factura (mediante la regla de guarda $S_{\text{ant}} \le 0 \lor \text{CPP}_{\text{ant}} \le 0$), o mediante la actualizacion manual de valoracion por parte de `ADMIN` o `MODERATOR`.

### 3.6. Descentralizacion de Compras, Recepcion a Precio Cero y Valorizacion Formal
- **Facultades Operativas de Almaceneros (`WAREHOUSE_KEEPER`):**
  - Los almaceneros de caseta y campo estan autorizados para registrar comprobantes de compra e ingreso directo de materiales (`POST /api/v1/purchases`), adjuntar evidencias (`POST /api/v1/purchases/:id/attachments`) y crear nuevos proveedores comerciales (`POST /api/v1/suppliers`).
  - **Segregacion por Sede Asignada:** El almacenero unicamente puede registrar compras, cargar evidencias y visualizar historiales (`GET /api/v1/purchases`, `GET /api/v1/purchases/:id`) para los almacenes u obras que tiene vinculados en la tabla `UserWarehouse`.
- **Recepciones con Guia de Remision y Precio 0.00:**
  - En situaciones de campo donde el material arriba solo con Guia de Remision del transportista o remision sin valorizar, el almacenero registra el ingreso con precio unitario `0.00`.
  - **Regla de Proteccion de CPP frente a Precio Cero:** Si `unitCostBasePEN <= 0`, el algoritmo no diluye el CPP preexistente del insumo; se mantiene intacto el costo anterior:
    $$\text{CPP}_{\text{nuevo}} = \text{CPP}_{\text{anterior}} > 0 ? \text{CPP}_{\text{anterior}} : 0$$
- **Valorizacion Formal Administrativa:**
  - Los comprobantes recepcionados con precio cero quedan identificados con el badge "Por Valorizar".
  - Los roles `ADMIN` y `MODERATOR` poseen el permiso para formalizar contablemente la factura mediante `PATCH /api/v1/purchases/:id/valuation`, con soporte completo de moneda USD (`exchangeRate > 0`), descuentos por linea (`discountType`, `discountValue`), `lotNumber` y `expirationDate`.
  - Esta regularizacion recalcula el costo promedio `Stock.averageCost` en el almacen destino y sincroniza `MovementItem.unitCostSnapshot` / `totalCostSnapshot` en el movimiento `PURCHASE_ENTRY` asociado, sin duplicar ni alterar la cantidad fisica en inventario ni crear nuevos movimientos (omitiendo lineas `SERVICE` de Stock y Kardex).
- **Privacidad Financiera Corporativa:**
  - El Cuadro Comparativo de Precios (`GET /api/v1/purchases/price-comparison`) y el simulador de CPP son exclusivos de `ADMIN` y `MODERATOR` (retornando `403 Forbidden` a `WAREHOUSE_KEEPER`).
  - La edicion de datos maestros de proveedores (`PUT /api/v1/suppliers/:id`) permanece restringida a `ADMIN` y `MODERATOR`.

---

## 4. Cadena de Suministro en Tres Etapas (De Presupuesto S10 a Consumo Real)

El flujo de materiales opera en 3 etapas estrictamente desacopladas:

```
[ Presupuesto S10 ] ──► (1. Reserva Logica en Central)
                                 │
                                 ▼
                         (2. Transferencia en 2 Fases) ──► [ Almacen de Obra ]
                                                                 │
                                                                 ▼
                                                       (3. Salida de Consumo) ──► [ Frente de Obra ]
```

### Etapa 1: Reserva Logica en Almacen Central (Opcion A)
- Al aprobarse un requerimiento de proyecto proveniente del S10, el material no se traslada de inmediato.
- Se valida disponibilidad en Almacen Central:
  $$\text{Stock.physicalQty} - \text{Stock.reservedQty} \ge Q_{\text{solicitada}}$$
- En una transaccion atomica se incrementa `Stock.reservedQty` en Central y `ProjectRequirement.allocatedQty` en el proyecto.
- **Liberacion Administrativa:** El Administrador o Moderador puede reducir `allocatedQty` manualmente (`POST /projects/:id/release-stock`). Esto reduce `Stock.reservedQty` en Central de inmediato sin generar ningun movimiento de Kardex.

### Etapa 2: Transferencia en Dos Fases (Central hacia Obra Temporal)
El material se envia fisicamente a la caseta de obra:
1. **Fase 1 (Despacho desde Central):**
   - Se valida que `ProjectRequirement.allocatedQty >= Q_despacho` (si corresponde a proyecto con reserva).
   - Se decrementa el stock fisico y la reserva en Central: `Stock.physicalQty -= Q` y `Stock.reservedQty -= Q`.
   - Se decrementa `ProjectRequirement.allocatedQty -= Q`.
   - Se genera el registro inmutable `Movement` de tipo `TRANSFER_DISPATCH`.
   - Se crea el documento operativo `Transfer` en estado `IN_TRANSIT`.
2. **Fase 2 (Recepcion en Almacen de Obra):**
   - El almacenero de obra inspecciona fisicamente el cargamento.
   - **Caso Conforme:** `Transfer.status` pasa a `COMPLETED`. Se incrementa `Stock.physicalQty` en el Almacen de Obra. Se registra `Movement` de tipo `TRANSFER_RECEIPT`. El costo promedio del Almacen de Obra se actualiza con el costo snapshot transferido.
   - **Caso Discrepancia / Merma en Ruta:** Si se despacharon 100 bolsas y llegan 95:
     - Se ingresan 95 bolsas a `Stock.physicalQty` en el Almacen de Obra (`TRANSFER_RECEIPT`).
     - Por las 5 bolsas faltantes, el sistema genera automaticamente un `Movement` secundario de tipo `SHRINKAGE_EXIT` asignado al Almacen Central o transporte con observacion *"Perdida en transporte"* y estado de la transferencia `DISCREPANCY`.

### Etapa 3: Salida por Consumo Definitivo en Obra
- El material se encuentra fisicamente en la caseta del Almacen de Obra.
- Cuando el capataz o cuadrilla solicita material para el vaciado o colocacion:
  1. El almacenero de obra registra una salida desde su terminal movil o PC (exclusivamente sobre items `CONSUMABLE`).
  2. Se decrementa `Stock.physicalQty` del Almacen de Obra.
  3. Se incrementa `ProjectRequirement.consumedQty += Q_consumo`.
  4. Se registra el movimiento inmutable `Movement` de tipo `CONSUMPTION_EXIT` con DNI y nombre del capataz receptor.

---

## 5. Protocolo de Prestamo y Custodia de Herramientas y Equipos (`ToolCustody`)

Las herramientas menores (`TOOL`) y equipos portatiles (`EQUIPMENT`) no son consumibles y requieren control de custodia por operario:

### 5.1. Triada de Stock para Herramientas y Equipos
En la tabla `Stock` para items de tipo `TOOL` y `EQUIPMENT`:
- `physicalQty`: Cantidad total de bienes bajo propiedad y custodia de ese almacen (en caseta o prestados en obra).
- `loanedQty`: Cantidad de bienes actualmente en poder de operarios en campo.
- **Disponibilidad para prestamo en caseta:**
  $$\text{Disponibles para prestar} = \text{Stock.physicalQty} - \text{Stock.loanedQty}$$

### 5.2. Flujo de Despacho en Prestamo (`LOAN_DISPATCH`)
- Se valida que `physicalQty - loanedQty >= Q_prestamo`.
- Se valida que el item sea de tipo `TOOL` o `EQUIPMENT` (rechazando `CONSUMABLE`, `MACHINERY` y `SERVICE`).
- Se crea el vale en `ToolCustody` con estado de entrega `conditionOnDispatch` (por defecto `OPERATIVE`), fecha, DNI y nombre del operario.
- Se incrementa `Stock.loanedQty += Q_prestamo`.
- Se genera un `Movement` de tipo `LOAN_DISPATCH` (sin impacto en `physicalQty`).
- Si se adjuntan actas o evidencias de entrega, se registran en `DocumentAttachment` con `proofType = DISPATCH`.

### 5.3. Flujo de Retorno y Calificacion Fisica (`LOAN_RETURN`)
Al devolver la herramienta o equipo a la caseta, el almacenero evalua su condicion:
- **`OPERATIVE` o `DAMAGED_USABLE` (Operativo o Desgaste Normal):**
  - Se sella `returnDate = now()`.
  - Se decrementa `Stock.loanedQty -= Q_devuelta`.
  - Se genera `Movement` de tipo `LOAN_RETURN`.
- **`DAMAGED_UNUSABLE` o `LOST` (Inutilizable o Extraviado):**
  - Se exige adjuntar fotografia de evidencia o acta de perdida firmada (`DocumentAttachment` con `proofType = RETURN`).
  - Se sella `returnDate = now()` y `conditionOnReturn = DAMAGED_UNUSABLE | LOST`.
  - Se decrementa `Stock.loanedQty -= Q`.
  - Se decrementa `Stock.physicalQty -= Q` (baja patrimonial).
  - Se genera automaticamente un `Movement` de tipo `SHRINKAGE_EXIT` por baja de equipo.

### 5.4. Reversion de Despacho, Reversion de Retorno y Reemplazo (`ToolCustody`)
- **Reversion de Despacho (`revert-dispatch`):** Solo permitida en vales abiertos sin retorno (`returnDate == null`) y no anulados. Marca `isReverted = true`, decrementa `Stock.loanedQty` y emite `REVERSAL_ENTRY` anulando `LOAN_DISPATCH`.
- **Reversion de Retorno (`revert-return`):** Reabre un vale cerrado restaurando `Stock.loanedQty += Q` (si `conditionOnReturn` fue `DAMAGED_UNUSABLE` o `LOST`, restaura tambien `Stock.physicalQty += Q` y revierte `SHRINKAGE_EXIT` con `REVERSAL_ENTRY`), emitiendo `REVERSAL_EXIT` sobre `LOAN_RETURN` y limpiando `returnDate`/`receivedById`/`conditionOnReturn`.
- **Edicion y Reemplazo:** Admite correccion de metadatos (`PATCH`) y reemplazo atomico (`replace`, revirtiendo despacho/retorno previo y emitiendo nuevo vale con vinculo `replacedById`).
- Los vales anulados quedan excluidos automaticamente de `onlyPending=true` y `GET /worker/:dni`.

---

## 6. Parser de S10, Persistencia Local, Aliasing 1:N y Matriz de Brechas

### 6.1. Ingesta, Decodificacion y Persistencia Local de Archivos CSV S10
- Soporta delimitadores por coma (`,`) y punto y coma (`;`).
- Soporta codificacion `Windows-1252` (estandar de exportacion de S10 en Peru) y `UTF-8` para evitar corrupcion de caracteres tecnicos.
- **Persistencia Local (`UPLOAD_DIR/s10/`):**
  - Al ejecutar `POST /projects/:id/s10-import`, tras parsear e ingerir las partidas, el archivo CSV/TXT original se persiste fisicamente en `UPLOAD_DIR/s10/` con nombre unico (`s10-{projectId}-{uuid}.{csv|txt}`) mediante `StorageService.saveS10File`.
  - Se registran en `Project` los metadatos `s10FilePath`, `s10FileName` y `s10UploadedAt`. Si el proyecto ya poseia un archivo anterior, este se elimina automaticamente del disco tras guardar la nueva version.
  - **Descarga Segura (`GET /projects/:id/s10-file`):** Emite el archivo original en streaming respetando autorizacion por sede (`WAREHOUSE_KEEPER` solo puede descargar archivos S10 de proyectos cuyo almacen tenga asignado).
  - **Eliminacion (`DELETE /projects/:id/s10-file`):** Exclusivo de `ADMIN` y `MODERATOR`; elimina el archivo fisico y limpia `s10FilePath`, `s10FileName` y `s10UploadedAt`.

### 6.2. Clasificacion de Recursos y Captura Presupuestal
- El parser clasifica y extrae los montos parciales de todas las partidas S10 segun sus dos primeros digitos:
  - `01 MANO DE OBRA`: Acumulado en `s10LaborBudget` / `laborBudget`.
  - `02 MATERIALES`: Acumulado en `s10MaterialsBudget` / `materialsBudget`.
  - `03 EQUIPOS Y HERRAMIENTAS`: Acumulado en `s10EquipmentBudget` / `equipmentBudget` (incluyendo partidas porcentuales `%mo` con metrado `0.00`).
  - `04 SUBCONTRATOS`: Acumulado en `s10SubcontractsBudget` / `subcontractsBudget`.
- **Descarte Operativo para Almacen:**
  - Las partidas de `01` y `04` son descartadas de la lista de requerimientos de abastecimiento (`ProjectRequirement`), pero sus importes economicos se conservan para los totales y KPIs del proyecto.
  - Se admiten exclusivamente insumos con metrado positivo de tipo `02` (`CONSUMABLE`) y `03` (`TOOL`, `EQUIPMENT`, `MACHINERY`).
- **Costo Directo Total y Consistencia:**
  - El Costo Directo Total (`s10TotalBudget`) se detecta prioritariamente de la firma `TOTAL` del pie de pagina del reporte S10. Si esta ausente, se calcula como la suma de los 4 grupos:
    $$\text{s10TotalBudget} = \text{materialsBudget} + \text{equipmentBudget} + \text{laborBudget} + \text{subcontractsBudget}$$
- **Metadatos del Expediente:**
  - Extrae de forma resiliente la fecha del presupuesto (`s10BudgetDate`), codigo ubigeo (`s10Ubigeo`) y ubicacion geografica (`s10Location`).

### 6.3. Resolucion y Gestion CRUD de Alias S10 (Relacion `1:N` en `ItemAlias`)
- **Cardinalidad `1:N`:** Un mismo insumo maestro (`Item`) puede tener **multiples alias S10** (`ItemAlias.itemId` con indice `@@index([itemId])`), permitiendo homologar diferentes nombres crudos o partidas regionales hacia un unico SKU corporativo. La restriccion `@unique` reside exclusivamente en `s10RawName` para garantizar mapeo inequivoco.
- **Orden de Resolucion en Ingesta S10:** 1) Coincidencia exacta por `ItemAlias.s10RawName`, 2) Coincidencia por `ItemAlias.s10Code`, 3) Nombre directo en `Item.name` (activos), 4) Codigo directo en `Item.sku` (activos). Si no existe coincidencia, el recurso queda en `unmappedItems` para vinculacion manual o alta en catalogo.
- **Factor de Conversion en Alias:** Permite convertir unidades de presupuesto hacia unidades base de stock (ej. S10 presupuesta en millares o bolsas y el almacen gestiona en unidades o kilogramos):
  $$\text{Cantidad Requerida Base} = \text{Cantidad S10} \times \text{ItemAlias.conversionFactor}$$
- **Gestion CRUD Completa (Exclusivo `ADMIN` y `MODERATOR`):**
  - `GET /items/aliases`: Listado paginado con busqueda por codigo S10, nombre crudo, unidad, nombre o SKU de insumo, y filtro opcional por `itemId`.
  - `POST /items/aliases`: Crea un nuevo alias verificando que el insumo destino este activo (`isActive = true`) y que `s10RawName` no este duplicado (`409 Conflict`).
  - `PUT /items/aliases/:id`: Permite actualizar `itemId` (rechaza insumos inactivos), `s10RawName` (valida unicidad `409 Conflict`), `s10Code`, `s10Unit` y `conversionFactor`.
  - `DELETE /items/aliases/:id`: Elimina la equivalencia S10.

### 6.4. Matriz de Brechas (Gap Analysis) y Edicion Manual (`ProjectRequirement`)
$$\text{Stock Neto Disponible Central} = \sum (\text{Stock.physicalQty} - \text{Stock.reservedQty})_{\text{Almacenes Centrales}}$$
$$\text{Deficit a Comprar} = \max(0,\ \text{Pendiente por Abastecer} - \text{Stock Neto Disponible Central})$$
- El campo `minHistoricalUnitCost` calcula el menor `unitCostBasePEN` entre detalles de compras vigentes (`purchase.isReverted = false`), excluyendo automaticamente facturas anuladas.
- **Edicion Completa de la Matriz de Brechas (Exclusivo rol `ADMIN`):**
  - Toda modificacion manual queda bloqueada en proyectos con estado `LIQUIDATED` o `ARCHIVED` (`400 Bad Request`).
  - **Agregar Requerimiento (`POST /projects/:id/requirements`):** Incorpora un insumo activo (`Item.isActive = true`) con `requiredQty > 0` y `s10UnitPrice` opcional (`>= 0`). Si el insumo ya existe en la matriz del proyecto, retorna `409 Conflict`.
  - **Actualizar Requerimiento (`PUT /projects/:id/requirements/:reqId`):**
    - Permite ajustar `requiredQty` siempre que `requiredQty >= allocatedQty` (en caso contrario retorna `400 Bad Request`) y modificar `s10UnitPrice`.
    - Permite reasignar `itemId` unicamente cuando `allocatedQty == 0` y `consumedQty == 0`, validando que el nuevo insumo este activo y no exista en otra fila del proyecto (`409 Conflict`).
  - **Eliminar Requerimiento (`DELETE /projects/:id/requirements/:reqId`):** Solo permitido si `allocatedQty == 0` y `consumedQty == 0`; de lo contrario retorna `400 Bad Request`.

---

## 7. Gestion de Almacenes de Obra (`PROJECT_SITE`) y Protocolo de Liquidacion

### 7.1. Vinculacion y Cambio Seguro de Almacenes `PROJECT_SITE` en Proyectos
- **Consulta de Almacenes Disponibles (`GET /warehouses/available-for-project`):** Lista los almacenes activos de tipo `PROJECT_SITE` sin proyecto vinculado (`projectId = null`), accesible para `ADMIN` y `MODERATOR`.
- **Vinculacion al Crear Proyecto (`POST /projects`):** Permite especificar `warehouseId` para vincular un almacen `PROJECT_SITE` existente y libre; si se omite, el sistema crea automaticamente un nuevo almacen temporal de obra.
- **Validacion del Almacen Destino:** Solo se permiten almacenes existentes (`404 Not Found`), activos (`400 Bad Request`), de tipo `PROJECT_SITE` (`400 Bad Request`) y sin asignacion a otro proyecto (`409 Conflict`).
- **Cambio de Almacen en Proyecto Existente (`PUT /projects/:id` con nuevo `warehouseId`):**
  Antes de desvincular el almacen actualmente asignado (`projectId = null`) y asociar el nuevo almacen dentro de una transaccion atomica, el almacen saliente debe superar tres validaciones estrictas de integridad; cualquier incumplimiento rechaza la operacion con **`HTTP 409 Conflict`**:
  1. **Stock Cero:** $\sum \text{Stock.physicalQty} = 0$ y $\sum \text{Stock.reservedQty} = 0$.
  2. **Cero Custodias Abiertas:** Cero registros en `ToolCustody` con `returnDate == null` e `isReverted = false`.
  3. **Cero Transferencias Activas:** Cero transferencias en estado `PENDING` o `IN_TRANSIT` donde participe como almacen origen o destino.

### 7.2. Protocolo de Liquidacion y Cierre de Almacen de Obra
Un almacen de obra (`PROJECT_SITE`) se liquida formalmente (`isActive = false`, `status = LIQUIDATED`) mediante `POST /projects/:id/liquidate` unicamente si cumple tres condiciones de consistencia estricta:
1. **Stock Fisico Cero:** $\sum \text{Stock.physicalQty} = 0$ para todos los items en ese almacen. Si queda remanente, el sistema bloquea la liquidacion y requiere la transferencia de retorno al Almacen Central.
2. **Cero Prestamos de Herramientas Abiertos:** No debe existir ningun registro en `ToolCustody` con `returnDate == null` asignado a ese almacen.
3. **Cero Transferencias en Transito:** No deben existir transferencias en estado `IN_TRANSIT` o `PENDING` cuyo origen o destino sea dicho almacen.

---

## 8. Control de Acceso y Segregacion de Roles (RBAC)

### 8.1. Rol `ADMIN` (Arquitecto / Residente General / Jefe de Logistica)
- Acceso irrestricto a todos los almacenes desde el selector de obra.
- Visibilidad completa de precios unitarios, descuentos, subtotal, IGV, CPP, valorizaciones y presupuesto S10.
- Aprobacion de ajustes de inventario, bajas de herramientas, creacion/edicion de SKUs, gestion CRUD de Alias S10, vinculacion/cambio de almacenes en proyectos y liquidacion de obras.
- Generacion, descarga y eliminacion de copias de seguridad de la base de datos (.sql/.tar.gz).
- **Facultades Exclusivas de `ADMIN` (bloqueadas para `MODERATOR` y `WAREHOUSE_KEEPER` con `403 Forbidden`):**
  - Administracion total de usuarios (`/api/v1/users`: listado, alta, edicion, cambio de roles y asignacion de sedes).
  - Eliminacion de adjuntos de compras (`DELETE /api/v1/purchases/:id/attachments/:attachmentId`).
  - Edicion manual CRUD de la Matriz de Brechas (`POST`, `PUT`, `DELETE /api/v1/projects/:id/requirements`).

### 8.2. Rol `MODERATOR` (Moderador Operativo)
- Facultades administrativas operativas equivalentes al rol `ADMIN` en la gestion cotidiana:
  - Bypass global e irrestricto a todos los almacenes del sistema en `WarehouseAccessGuard` y `WarehousesService`.
  - Visibilidad financiera completa de costos unitarios, descuentos, precios, valorizaciones, CPP y comparativa de compras (`CostMaskingInterceptor` no enmascara costos).
  - Gestion de proyectos S10 (carga/descarga/eliminacion de CSV S10, vinculacion/cambio de almacen `PROJECT_SITE`, reservas de stock y liquidacion), CRUD completo de Alias S10 (`ItemAlias`), catalogos maestros (incluida eliminacion/desactivacion segura de items mediante `DELETE /items/:id` con stock en cero), clasificaciones y unidades de medida.
  - Generacion, descarga y eliminacion de copias de seguridad de PostgreSQL.
  - Aprobacion de ajustes de inventario fisico en Kardex, valorizacion de compras y descarga de documentos confidenciales.
- **Restricciones Estrictas de `MODERATOR` (`403 Forbidden`):**
  - Aislamiento total del modulo de usuarios (`UsersController` en `/api/v1/users`).
  - Sin acceso a operaciones destructivas/estructurales exclusivas de `ADMIN`: `DELETE /purchases/:id/attachments/:attachmentId` y CRUD manual de `/projects/:id/requirements`.

### 8.3. Rol `WAREHOUSE_KEEPER` (Almacenero de Obra / Caseta)
- Asignado a uno o mas almacenes mediante la tabla `UserWarehouse`. En la interfaz solo visualiza y opera los almacenes a los que tiene permiso activo.
- **Acceso Ciego a Finanzas (`CostMaskingInterceptor` Estricto):**
  - Los endpoints de la API purgan de forma recursiva todos los campos monetarios y de descuento:
    - Costos, precios y totales de compras/movimientos: `averageCost`, `unitPriceOriginal`, `unitCostBasePEN`, `subtotalPEN`, `igvAmountPEN`, `totalAmountPEN`, `totalSubtotalPEN`, `totalIgvPEN`, `discountValue`, `discountAmountPEN`, `unitCostSnapshot`, `totalCostSnapshot`, `newWarehouseAverageCost`.
    - Valorizaciones y comparativas: `inventoryValuationPEN`, `suppliesValuationPEN`, `toolsInvestmentPEN`, `minUnitCostPEN`, `maxUnitCostPEN`, `currentWeightedAverageCostPEN`, `s10UnitPrice`, `minHistoricalUnitCost`, `weightedAverageCost`, `s10BudgetUnitPrice`.
    - Totales presupuestales y KPIs monetarios S10: `s10TotalBudget`, `s10MaterialsBudget`, `s10EquipmentBudget`, `s10LaborBudget`, `s10SubcontractsBudget`, `totalBudgetPEN`, `materialsBudgetPEN`, `equipmentBudgetPEN`, `laborBudgetPEN`, `subcontractsBudgetPEN`, `totalDeficitEstimatedCostPEN`.
  - Se preservan metadatos, fechas y cantidades operativas (`physicalQty`, `reservedQty`, `loanedQty`, `s10Location`, `s10Ubigeo`, `s10BudgetDate`, `totalRequiredItemsCount`, `requiredQty`, `allocatedQty`, `consumedQty`, `purchaseDeficit`).
- **Acceso Acotado a Documentos:** Puede adjuntar y consultar comprobantes o evidencias vinculados a compras de sus almacenes asignados; cualquier documento confidencial de otra sede o ajeno a sus compras asignadas retorna `403 Forbidden`.
- Operatividad touch en caseta: recepcion de compras y transferencias, salidas por consumo a capataces, vales de herramientas, jornadas de maquinaria y conteo de inventario.

---

## 9. Gestion de Unidades de Medida y Regla de Doble Confirmacion

### 9.1. Catalogo Maestro de Unidades de Medida (`MeasurementUnit`)
- Las unidades de medida base constituyen un catalogo maestro corporativo persistido en la tabla `MeasurementUnit`.
- Cada registro contiene un codigo abreviado unico en mayusculas (`code`, ej. `UND`, `BOLSA`, `KG`, `M3`, `VARILLA`), nombre descriptivo (`name`), descripcion opcional y estado (`isActive`).
- Los endpoints CRUD de administracion (`/measurement-units`) estan restringidos a los roles `ADMIN` y `MODERATOR` para creacion, edicion y baja.
- El listado de unidades activas (`GET /measurement-units`) esta disponible para todos los roles autenticados para alimentar selectores en la interfaz.

### 9.2. Politica de Eliminacion de Unidades de Medida
- **Eliminacion Fisica:** Permitida unicamente si ningun insumo en el catalogo maestro (`Item`) tiene asignada dicha unidad en `Item.baseUnit`.
- **Desactivacion Logica:** Si la unidad esta asignada a uno o mas insumos, la peticion `DELETE` no elimina el registro de la base de datos; en su lugar, marca `isActive = false` para preservar la trazabilidad historica y evitar que sea seleccionada en nuevos insumos.

### 9.3. Regla de Integridad de Stock y Doble Confirmacion en Modificacion de `baseUnit`
- **Insumos Nuevos o sin Movimientos:** Si un insumo no registra existencias fisicas (`physicalQty == 0`) ni registros historicos en compras, movimientos de Kardex o transferencias, su unidad base (`baseUnit`) puede modificarse libremente.
- **Insumos con Historial Transaccional:** Si un insumo cuenta con existencias fisicas (`Stock.physicalQty > 0`), movimientos en Kardex (`MovementItem`), detalles de compra (`PurchaseDetail`) o transferencias (`TransferItem`), modificar su `baseUnit` altera la interpretacion dimensional de los saldos y costos promedio calculados.
- **Requisito de Doble Confirmacion (`confirmUnitChange`):**
  - Si se intenta mutar `baseUnit` en un insumo con transacciones sin enviar la bandera `confirmUnitChange: true`, el backend rechaza la operacion retornando `HTTP 400 Bad Request` con codigo `REQUIRES_DOUBLE_CONFIRMATION` y el detalle cuantitativo de transacciones asociadas.
  - Al recibir `confirmUnitChange: true`, el backend autoriza la mutacion de la unidad base en el insumo.
  - El detalle de insumo retornado por `GET /items/:id` expone los campos `hasTransactions: boolean` y `transactionStats: object` para que el frontend pueda advertir preventivamente al usuario y solicitar la confirmacion antes de enviar la peticion.

---

## 10. Politica de Migraciones Aditivas y Compatibilidad con Produccion

- Toda actualizacion del esquema relacional en PostgreSQL se disena como **migracion estrictamente aditiva**, agregando nuevos enums (`CREATE TYPE`), nuevos valores de enum (`ALTER TYPE ... ADD VALUE`), nuevas columnas con valores por defecto seguros o nulables (`ALTER TABLE ... ADD COLUMN`) e indices no bloqueantes (`CREATE INDEX`).
- Se prohiben migraciones destructivas (`DROP COLUMN`, `DROP TABLE`, truncados o reinicios de esquema) sobre entornos productivos para garantizar la preservacion total del historial contable y operativo existente (ejemplo: `20261122225515_add_post_meeting_observations`).
- Las migraciones se aplican de forma automatizada e idempotente en produccion mediante **`npx prisma migrate deploy`** (`docker-entrypoint.sh` y script `npm run prisma:migrate:deploy`) antes del arranque del servidor NestJS.
