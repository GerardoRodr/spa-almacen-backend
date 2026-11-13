# BUSINESS_RULES.md — Reglas de Negocio y Algoritmos Core (SPA-ALMACEN-ERP)

Este documento constituye la **Fuente Unica de Verdad (Single Source of Truth - SSOT)** para la logica de negocio, reglas de dominio y algoritmos financieros del sistema **SPA-ALMACEN-ERP**.

---

## 1. Clasificacion y Tipificacion de Items

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
- No se prestan como herramientas menores en caseta de obra. Su control operativo se gestiona mediante partes diarios (`MachineryShiftLog`), registrando horometro inicial/final, kilometraje, operador y galones de combustible consumidos.

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
- Toda operacion que modifique simultaneamente stocks (`physicalQty`, `reservedQty`, `loanedQty`), recalcule costos promedio, revierta o reemplace transacciones o liquide transferencias debe ejecutarse dentro de un bloque transaccional atomico (`prisma.$transaction`).

### 2.4. Politica de Correccion en Tres Niveles y Contra-Asientos
El sistema resuelve correcciones operativas sin destruir el historial contable mediante tres niveles excluyentes de intervencion:
1. **Nivel 1 — Reversion Contable / Anulacion (`revert`, `cancel`, `revert-reception`, `revert-dispatch`, `revert-return`):**
   - Marca la transaccion o movimiento como revertido/cancelado (`isReverted = true` o `status = CANCELLED`, con sello de `revertedAt`/`cancelledAt`, usuario y motivo obligatorio).
   - Emite un contra-asiento compensatorio en `Movement` de tipo **`REVERSAL_EXIT`** (para revertir ingresos previos) o **`REVERSAL_ENTRY`** (para revertir salidas previas), vinculado mediante `reversesMovementId`.
   - **Validacion de Stock y Recalculo Inverso de CPP:** Al revertir un ingreso (`Purchase`, recepcion de transferencia o ajuste positivo), valida que `Stock.physicalQty - reservedQty - loanedQty >= Q`. El CPP se recalcula inversamente descontando el lote revertido; si `nuevoStock <= 0`, `averageCost` retorna a `0.0000`.
   - **Restauracion de Cuotas de Proyecto y Prestamos:** Revertir `CONSUMPTION_EXIT` descuenta `ProjectRequirement.consumedQty`; cancelar una transferencia `IN_TRANSIT` puede restaurar `ProjectRequirement.allocatedQty` y `Stock.reservedQty` en Central; revertir un despacho o retorno de custodia restaura `Stock.loanedQty` (y `physicalQty` en bajas).
2. **Nivel 2 — Edicion de Metadatos No Contables (`PATCH`):**
   - Permite corregir campos descriptivos sin alterar cantidades, costos, almacenes ni inventario (observaciones, notas por lote/renglon, serie de factura, proveedor en compras sin cambiar importes, notas de despacho/recepcion, datos de operario/DNI o lecturas de horometro/kilometraje en jornadas).
   - Bloqueado para registros ya revertidos/cancelados (`400 Bad Request`).
3. **Nivel 3 — Reemplazo Atomico (`POST :id/replace*`):**
   - Dentro de una unica transaccion ACID (`prisma.$transaction`), ejecuta primero la reversion completa (Nivel 1) del registro original y crea de inmediato el nuevo registro corregido, enlazando el original con `replacedById`.
   - Aplicable en compras, transferencias (`IN_TRANSIT` o `COMPLETED`/`DISCREPANCY`), consumos, mermas directas y vales de custodia de herramientas.

### 2.5. Exclusion de Registros Anulados en Consultas y Analitica
- Los listados operativos exponen el filtro opcional `includeReverted` (por defecto `true` para auditoria historica; `false` oculta anulados).
- Las consultas operativas activas y metricas de negocio excluyen automaticamente registros con `isReverted = true`:
  - Prestamos pendientes (`onlyPending=true`), deuda por operario (`worker/:dni`) y conteo `toolsInField` en Dashboard.
  - Calculo de `minHistoricalUnitCost` en `Gap Analysis` y ultima compra en `perishable-alerts`.
  - Calculo de jornada abierta (`onlyOpen=true`), validacion de inicio de turno y ultimo medidor (`lastMeter`) en Maquinaria.

---

## 3. Algoritmo del Costo Promedio Ponderado (CPP / WAC)

### 3.1. Moneda Base (PEN) y Base Imponible
- La valorizacion del inventario y el calculo de `Stock.averageCost` se realizan en Soles (PEN).
- **Tratamiento Tributario (Comprobantes Gravados vs Sin IGV):**
  - **Operaciones Gravadas (`hasIgv = true`):** El costo unitario computable al inventario es el **costo neto sin IGV**, pues el IGV es credito fiscal para la empresa y no forma parte del costo de adquisicion (NIC 2 / SUNAT).
  - **Operaciones Exoneradas o No Gravadas (`hasIgv = false`):** En adquisiciones sin IGV desglosado (boletas, recibos o proveedores exonerados), el costo total pagado entra integro a la base imponible y computa directamente en el nuevo CPP, validando que `igvAmountPEN === 0` y `totalAmountPEN === subtotalPEN`.
- En compras en moneda extranjera (USD), se aplica el tipo de cambio de compra (`exchangeRate`) registrado en el comprobante.

### 3.2. Formula de Recalculo Atomico
Por cada ingreso por compra recibido en el Almacen Central o en un Almacen de Obra temporal (`PROJECT_SITE`):

$$\text{CPP}_{\text{nuevo}} = \frac{(S_{\text{ant}} \times \text{CPP}_{\text{ant}}) + (Q_{\text{ing}} \times C_{\text{unitPEN}})}{S_{\text{ant}} + Q_{\text{ing}}}$$

Donde:
- $S_{\text{ant}}$: `Stock.physicalQty` en el almacen de destino previo al ingreso.
- $\text{CPP}_{\text{ant}}$: `Stock.averageCost` en el almacen de destino previo al ingreso. Si $S_{\text{ant}} \le 0$ o $\text{CPP}_{\text{ant}} \le 0$, entonces $\text{CPP}_{\text{nuevo}} = C_{\text{unitPEN}}$ (regla de adopcion directa que evita dilucion contra cero cuando existia inventario inicial no valorizado).
- $Q_{\text{ing}}$: Cantidad ingresada expresada en la Unidad Base (`baseQty = purchaseQty \times conversionFactor`).
- $C_{\text{unitPEN}}$: Costo unitario neto en Soles por unidad base:
  $$C_{\text{unitPEN}} = \frac{\text{unitPriceOriginalNeto} \times \text{exchangeRate}}{\text{conversionFactor}}$$

- **Compras Multi-Almacen:** Las compras directas a almacenes de obra calculan y actualizan el CPP especifico de esa obra sin alterar el Almacen Central, reflejando fletes locales o costos provinciales (ej. Trujillo, Pacasmayo, Chepen).
- **Cuadro Comparativo de Precios:** Los costos historicos de adquisicion de cada insumo alimentan el cuadro comparativo corporativo ordenado de menor a mayor costo unitario base (`unitCostBasePEN ASC`), identificando al mejor proveedor historico.

### 3.3. Snapshot de Costo en Movimientos
- Cada transferencia despachada a obra o salida de consumo congela el `averageCost` vigente de ese momento en `MovementItem.unitCostSnapshot`.
- Esto garantiza que los informes financieros y valorizaciones de obra posteriores no se alteren cuando ingresen nuevas compras a precios diferentes en el Almacen Central.

### 3.4. Valorizacion Manual Administrativa de Stock
- En escenarios donde un insumo ingresa al inventario mediante toma fisica en caseta o carga inicial con costo cero (`averageCost = 0.0000`), el Administrador corporativo puede valorizarlo o actualizar el CPP de cualquier sede directamente mediante `PATCH /api/v1/warehouses/:id/stock/:itemId/valuation`.
- Esta operacion no modifica las cantidades fisicas existentes, unicamente actualiza la base monetaria de costeo promedio para imputaciones futuras de salida por consumo y transferencias.

### 3.5. Alta Agilizada de Insumos y Toma de Stock Inicial Ciego
- **Descentralizacion Operativa:** Para eliminar la friccion burocratica en frentes de obra y permitir compras rapidas de insumos no catalogados, el rol `WAREHOUSE_KEEPER` esta facultado para registrar nuevos items en el catalogo maestro directamente desde caseta o dispositivos moviles.
- **Autogeneracion Estandarizada de SKU:** Los codigos de inventario se autogeneran de forma correlativa por clasificacion (`MAT-XXXX`, `HER-XXXX`, `EQU-XXXX`, `MAQ-XXXX`) mediante `SequenceGeneratorService`, evitando colisiones o codificaciones arbitrarias.
- **Principio de Costo Ciego:**
  - El personal de caseta y almaceneros operan bajo un esquema estrictamente fisico, sin acceso a costos de compra, margenes o precios de venta.
  - Al dar de alta un insumo con stock inicial o al registrar una toma fisica en caseta (`POST /api/v1/movements/initial-stock`), el sistema fuerza el costo a `0.00` y `CostMaskingInterceptor` enmascara cualquier atributo financiero en las respuestas.
- **Ruta de Convergencia Contable:**
  - Todo stock inicial a costo cero queda claramente senalizado con el estado "Sin valorizar" para la administracion.
  - Se valoriza contablemente de manera transparente tan pronto se registre la primera compra formal con factura (mediante la regla de guarda $S_{\text{ant}} \le 0 \lor \text{CPP}_{\text{ant}} \le 0$), o mediante la actualizacion manual de valoracion por parte del Administrador.

### 3.6. Descentralizacion de Compras, Recepcion a Precio Cero y Valorizacion Formal
- **Facultades Operativas de Almaceneros (`WAREHOUSE_KEEPER`):**
  - Los almaceneros de caseta y campo estan autorizados para registrar comprobantes de compra e ingreso directo de materiales (`POST /api/v1/purchases`) y crear nuevos proveedores comerciales (`POST /api/v1/suppliers`).
  - **Segregacion por Sede Asignada:** El almacenero unicamente puede registrar compras y visualizar historiales (`GET /api/v1/purchases`, `GET /api/v1/purchases/:id`) para los almacenes u obras que tiene vinculados en la tabla `UserWarehouse`.
- **Recepciones con Guia de Remision y Precio 0.00:**
  - En situaciones de campo donde el material arriba solo con Guia de Remision del transportista o remision sin valorizar, el almacenero registra el ingreso con precio unitario `0.00`.
  - **Regla de Proteccion de CPP frente a Precio Cero:** Si `unitCostBasePEN <= 0`, el algoritmo no diluye el CPP preexistente del insumo; se mantiene intacto el costo anterior:
    $$\text{CPP}_{\text{nuevo}} = \text{CPP}_{\text{anterior}} > 0 ? \text{CPP}_{\text{anterior}} : 0$$
- **Valorizacion Formal Administrativa:**
  - Los comprobantes recepcionados con precio cero quedan identificados con el badge "Por Valorizar".
  - Los roles `ADMIN` y `MODERATOR` poseen el permiso para formalizar contablemente la factura mediante `PATCH /api/v1/purchases/:id/valuation`.
  - Esta regularizacion recalcula el costo promedio `Stock.averageCost` en el almacen destino incorporando el costo real de la compra, sin duplicar ni alterar la cantidad fisica en inventario ni emitir nuevos movimientos en Kardex.
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
- **Liberacion Administrativa:** El Administrador puede reducir `allocatedQty` manualmente. Esto reduce `Stock.reservedQty` en Central de inmediato sin generar ningun movimiento de Kardex.

### Etapa 2: Transferencia en Dos Fases (Central hacia Obra Temporal)
El material se envia fisicamente a la caseta de obra:
1. **Fase 1 (Despacho desde Central):**
   - Se valida que `ProjectRequirement.allocatedQty \ge Q_{\text{despacho}}`.
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
- El material se encuentra físicamente en la caseta del Almacen de Obra.
- Cuando el capataz o cuadrilla solicita material para el vaciado o colocacion:
  1. El almacenero de obra registra una salida desde su terminal movil o PC.
  2. Se decrementa `Stock.physicalQty` del Almacen de Obra.
  3. Se incrementa `ProjectRequirement.consumedQty += Q_{\text{consumo}}`.
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
- Se valida que `physicalQty - loanedQty >= Q_{\text{prestamo}}`.
- Se valida que el item sea de tipo `TOOL` o `EQUIPMENT` (rechazando `CONSUMABLE` y `MACHINERY`).
- Se crea el vale en `ToolCustody` con estado de entrega `conditionOnDispatch` (por defecto `OPERATIVE`), fecha, DNI y nombre del operario.
- Se incrementa `Stock.loanedQty += Q_{\text{prestamo}}`.
- Se genera un `Movement` de tipo `LOAN_DISPATCH` (sin impacto en `physicalQty`).
- Si se adjuntan actas o evidencias de entrega, se registran en `DocumentAttachment` con `proofType = DISPATCH`.

### 5.3. Flujo de Retorno y Calificacion Fisica (`LOAN_RETURN`)
Al devolver la herramienta o equipo a la caseta, el almacenero evalua su condicion:
- **`OPERATIVE` o `DAMAGED_USABLE` (Operativo o Desgaste Normal):**
  - Se sella `returnDate = now()`.
  - Se decrementa `Stock.loanedQty -= Q_{\text{devuelta}}`.
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

## 6. Parser de S10, Aliasing y Gap Analysis

### 6.1. Ingesta y Decodificacion
- Soporta delimitadores por coma (`,`) y punto y coma (`;`).
- Soporta codificacion `Windows-1252` (estandar de exportacion de S10 en Peru) y `UTF-8` para evitar corrupcion de caracteres tecnicos.

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

### 6.3. Resolucion de Alias y Factores de Conversion (`ItemAlias`)
- Si la descripcion cruda del S10 (`s10RawName`) coincide con un registro en `ItemAlias`, se vincula directamente al SKU maestro.
- **Factor de Conversion en Alias:** Permite convertir unidades de presupuesto hacia unidades base de stock (ej. S10 presupuesta en millares o bolsas y el almacen gestiona en unidades o kilogramos):
  $$\text{Cantidad Requerida Base} = \text{Cantidad S10} \times \text{ItemAlias.conversionFactor}$$
- Si no existe coincidencia, el recurso queda en estado `PENDIENTE_MAPEO` para vinculacion manual o creacion en catalogo.

### 6.4. Matriz de Brechas (Gap Analysis)
$$\text{Stock Neto Disponible Central} = \sum (\text{Stock.physicalQty} - \text{Stock.reservedQty})_{\text{Almacenes Centrales}}$$
$$\text{Deficit a Comprar} = \max(0, \text{Demanda Total S10 en Base} - \text{Stock Neto Disponible Central})$$
- El campo `minHistoricalUnitCost` calcula el menor `unitCostBasePEN` entre detalles de compras vigentes (`purchase.isReverted = false`), excluyendo automaticamente facturas anuladas.

---

## 7. Protocolo de Liquidacion y Cierre de Almacen de Obra

Un almacen de obra (`PROJECT_SITE`) se liquida formalmente (`isActive = false`, `status = LIQUIDATED`) unicamente si cumple tres condiciones de consistencia estricta:
1. **Stock Fisico Cero:** $\sum \text{Stock.physicalQty} = 0$ para todos los items en ese almacen. Si queda remanente, el sistema bloquea la liquidacion y genera una propuesta automatica de `Transfer` de retorno al Almacen Central.
2. **Cero Prestamos de Herramientas Abiertos:** No debe existir ningun registro en `ToolCustody` con `returnDate == null` asignado a ese almacen.
3. **Cero Transferencias en Transito:** No deben existir transferencias en estado `IN_TRANSIT` o `PENDING` cuyo origen o destino sea dicho almacen.

---

## 8. Control de Acceso y Segregacion de Roles (RBAC)

### 8.1. Rol `ADMIN` (Arquitecto / Residente General / Jefe de Logistica)
- Acceso irrestricto a todos los almacenes desde el selector de obra.
- Visibilidad completa de precios unitarios, subtotal, IGV, CPP, valorizaciones y presupuesto S10.
- Aprobacion de ajustes de inventario, bajas de herramientas, creacion de SKUs y liquidacion de obras.
- Generacion y descarga de copias de seguridad de la base de datos (.sql/.tar.gz).
- Administracion total de cuentas de usuarios, altas, asignacion de sedes, cambio de roles y desactivacion/baja.

### 8.2. Rol `MODERATOR` (Moderador Operativo)
- Facultades administrativas operativas equivalentes al rol `ADMIN` en todos los modulos:
  - Bypass global e irrestricto a todos los almacenes del sistema en `WarehouseAccessGuard` y `WarehousesService`.
  - Visibilidad financiera completa de costos unitarios, precios, valorizaciones, CPP y comparativa de compras (`CostMaskingInterceptor` no enmascara costos).
  - Gestion completa de proyectos S10, reservas de stock, catalogos maestros, clasificaciones y unidades de medida.
  - Generacion, descarga y eliminacion de copias de seguridad de PostgreSQL.
  - Aprobacion de ajustes de inventario fisico en Kardex y descarga de documentos confidenciales.
- **Aislamiento Estricto del Modulo de Usuarios:**
  - Bloqueo total (HTTP 403 Forbidden) en todos los endpoints de `UsersController` (`/api/v1/users`).
  - No puede consultar, crear, modificar, promover a ADMIN ni dar de baja/desactivar ningun colaborador.

### 8.3. Rol `WAREHOUSE_KEEPER` (Almacenero de Obra / Caseta)
- Asignado a uno o mas almacenes mediante la tabla `UserWarehouse`. En la interfaz solo visualiza y opera los almacenes a los que tiene permiso activo.
- **Acceso Ciego a Finanzas (Data Masking Estricto):**
  - Los endpoints de la API filtran y omiten todo campo financiero (`averageCost`, `unitPriceOriginal`, `subtotalPEN`, `totalAmountPEN`, `unitCostSnapshot`, `s10UnitPrice`, `minHistoricalUnitCost`, `weightedAverageCost`, `s10BudgetUnitPrice`).
  - Los totales presupuestales y KPIs monetarios S10 (`s10TotalBudget`, `s10MaterialsBudget`, `s10EquipmentBudget`, `s10LaborBudget`, `s10SubcontractsBudget`, `totalBudgetPEN`, `materialsBudgetPEN`, `equipmentBudgetPEN`, `laborBudgetPEN`, `subcontractsBudgetPEN`, `totalDeficitEstimatedCostPEN`) son purgados de forma automatica por `CostMaskingInterceptor`.
  - Se preservan metadatos y cantidades operativas (`s10Location`, `s10Ubigeo`, `s10BudgetDate`, `totalRequiredItemsCount`, `requiredQty`, `allocatedQty`, `consumedQty`, `purchaseDeficit`).
  - No tiene permiso de visualizacion de facturas con montos; unicamente accede a guias de remision fisica y fotos de evidencia.
- Operatividad touch en caseta: recepcion de transferencias, salidas por consumo a capataces, vales de herramientas y conteo de inventario.

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

