# BUSINESS_RULES.md — Reglas de Negocio y Algoritmos Core (SPA-ALMACEN-ERP)

Este documento constituye la **Fuente Unica de Verdad (Single Source of Truth - SSOT)** para la logica de negocio, reglas de dominio y algoritmos financieros del sistema **SPA-ALMACEN-ERP**.

---

## 1. Clasificacion y Tipificacion de Items

### 1.1. `CONSUMABLE` (Materiales Consumibles)
- Materiales de gasto definitivo en obra (cemento, arena, acero corrugado, aditivos, tuberias, cables).
- Se procesan bajo el ciclo de abastecimiento de obra:
  1. Ingreso a Almacen Central por compra a proveedor (`PURCHASE_ENTRY`).
  2. Reserva logica para el proyecto receptor (`allocatedQty`).
  3. Transferencia física hacia el Almacen de Obra temporal (`TRANSFER_DISPATCH` / `TRANSFER_RECEIPT`).
  4. Salida por consumo definitivo entregada a capataces en obra (`CONSUMPTION_EXIT`).
- Admite unidades fraccionarias (`DECIMAL(12, 4)`) en su unidad base (`baseUnit`).

### 1.2. `ASSET_TOOL` (Equipos y Herramientas)
- Bienes no fungibles y retornables requeridos para la ejecucion de trabajos.
- **No se despachan como consumo definitivo.** Permanecen en el activo de la empresa.
- **Subtipos operativos:**
  - **Herramientas Mayores / Equipos:** Bienes de alto valor (rotomartillos, teodolitos, mezcladoras, vibradores de concreto). Registran obligatoriamente codigo patrimonial o numero de serie (`serialOrCode`).
  - **Herramientas Menores:** Bienes de bajo valor o fungibles en cuadrilla (palas, carretillas, picos, cinceles). Se controlan por cantidad (`quantity`).
- Requieren flujo de **Prestamo, Custodia y Devolucion** (`ToolCustody`) vinculado al DNI y nombre del trabajador receptor, registrando la condicion fisica al despacho y al retorno (`OPERATIVE`, `DAMAGED_USABLE`, `DAMAGED_UNUSABLE`, `MAINTENANCE_REQUIRED`, `LOST`).

---

## 2. Inmutabilidad del Kardex y Transacciones ACID

### 2.1. Principio Append-Only
- Todos los registros del libro mayor contable (`Movement` y `MovementItem`) son de solo lectura, secuenciales e inmutables.
- **Se prohiben terminantemente operaciones `UPDATE` o `DELETE` sobre `Movement` o `MovementItem`.**
- El ciclo de vida operativo de transferencias, aprobaciones y ordenes se gestiona en entidades independientes (`Transfer`, `Purchase`), dejando al Kardex unicamente el registro del hecho fisico consumado.

### 2.2. Ajustes de Inventario y Mermas
- Cualquier descuadre fisico detectado en toma de inventario se regulariza mediante un `Movement` de tipo `INVENTORY_ADJUSTMENT` o `SHRINKAGE_EXIT`.
- Exige obligatoriamente motivo justificado, evidencia fotografica adjunta y aprobacion exclusiva del rol `ADMIN`.

### 2.3. Transacciones Atomicas
- Toda operacion que modifique simultaneamente stocks (`physicalQty`, `reservedQty`, `loanedQty`), recalcule costos promedio o liquide transferencias debe ejecutarse dentro de un bloque transaccional atómico (`prisma.$transaction`).

---

## 3. Algoritmo del Costo Promedio Ponderado (CPP / WAC)

### 3.1. Moneda Base (PEN) y Base Imponible
- La valorizacion del inventario y el calculo de `Stock.averageCost` se realizan en Soles (PEN).
- **Criterio Tributario y Contable (NIC 2 / SUNAT):** El costo unitario computable a inventario es el **costo neto sin IGV (18%)**, dado que el IGV constituye credito fiscal para la constructora y no forma parte del costo del material.
- En compras en moneda extranjera (USD), se aplica el tipo de cambio oficial de compra (`exchangeRate`) registrado en el encabezado del comprobante.

### 3.2. Formula de Recalculo Atomico
Por cada ingreso por compra recibido en el Almacen Central:

$$\text{CPP}_{\text{nuevo}} = \frac{(S_{\text{ant}} \times \text{CPP}_{\text{ant}}) + (Q_{\text{ing}} \times C_{\text{unitPEN}})}{S_{\text{ant}} + Q_{\text{ing}}}$$

Donde:
- $S_{\text{ant}}$: `Stock.physicalQty` en Almacen Central previo al ingreso.
- $\text{CPP}_{\text{ant}}$: `Stock.averageCost` en Almacen Central previo al ingreso. Si $S_{\text{ant}} \le 0$, entonces $\text{CPP}_{\text{nuevo}} = C_{\text{unitPEN}}$.
- $Q_{\text{ing}}$: Cantidad ingresada expresada en la Unidad Base (`baseQty = purchaseQty \times conversionFactor`).
- $C_{\text{unitPEN}}$: Costo unitario neto en Soles por unidad base:
  $$C_{\text{unitPEN}} = \frac{\text{unitPriceOriginalNeto} \times \text{exchangeRate}}{\text{conversionFactor}}$$

### 3.3. Snapshot de Costo en Movimientos
- Cada transferencia despachada a obra o salida de consumo congela el `averageCost` vigente de ese momento en `MovementItem.unitCostSnapshot`.
- Esto garantiza que los informes financieros y valorizaciones de obra posteriores no se alteren cuando ingresen nuevas compras a precios diferentes en el Almacen Central.

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

## 5. Protocolo de Prestamo y Custodia de Herramientas (`ToolCustody`)

Las herramientas no son consumibles y requieren control de custodia por operario:

### 5.1. Triada de Stock para Herramientas
En la tabla `Stock` para items de tipo `ASSET_TOOL`:
- `physicalQty`: Cantidad total de herramientas bajo propiedad y custodia de ese almacen (en caseta o prestadas en obra).
- `loanedQty`: Cantidad de herramientas actualmente en poder de operarios en campo.
- **Disponibilidad para prestamo en caseta:**
  $$\text{Disponibles para prestar} = \text{Stock.physicalQty} - \text{Stock.loanedQty}$$

### 5.2. Flujo de Despacho en Prestamo (`LOAN_DISPATCH`)
- Se valida que `physicalQty - loanedQty >= Q_{\text{prestamo}}`.
- Se crea el vale en `ToolCustody` con estado de entrega `conditionOnDispatch` (por defecto `OPERATIVE`), fecha, DNI y nombre del operario.
- Se incrementa `Stock.loanedQty += Q_{\text{prestamo}}`.
- Se genera un `Movement` de tipo `LOAN_DISPATCH` (sin impacto en `physicalQty`).

### 5.3. Flujo de Retorno y Calificacion Fisica (`LOAN_RETURN`)
Al devolver la herramienta a la caseta, el almacenero evalua su condicion:
- **`OPERATIVE` o `DAMAGED_USABLE` (Operativo o Desgaste Normal):**
  - Se sella `returnDate = now()`.
  - Se decrementa `Stock.loanedQty -= Q_{\text{devuelta}}`.
  - Se genera `Movement` de tipo `LOAN_RETURN`.
- **`DAMAGED_UNUSABLE` o `LOST` (Inutilizable o Extraviado):**
  - Se exige adjuntar fotografia de evidencia o acta de perdida firmada.
  - Se sella `returnDate = now()` y `conditionOnReturn = DAMAGED_UNUSABLE | LOST`.
  - Se decrementa `Stock.loanedQty -= Q`.
  - Se decrementa `Stock.physicalQty -= Q` (baja patrimonial).
  - Se genera automaticamente un `Movement` de tipo `SHRINKAGE_EXIT` por baja de equipo.

---

## 6. Parser de S10, Aliasing y Gap Analysis

### 6.1. Ingesta y Decodificacion
- Soporta delimitadores por coma (`,`) y punto y coma (`;`).
- Soporta codificacion `Windows-1252` (estandar de exportacion de S10 en Peru) y `UTF-8` para evitar corrupcion de tildes o caracteres tecnicos.

### 6.2. Filtrado Estricto de Recursos
- El parser clasifica y descarta automaticamente las partidas agrupadas bajo:
  - `01 MANO DE OBRA`
  - `04 SUBCONTRATOS`
- Procesa unicamente insumos de tipo `02 MATERIALES` (`CONSUMABLE`) y `03 EQUIPOS` (`ASSET_TOOL`).

### 6.3. Resolucion de Alias y Factores de Conversion (`ItemAlias`)
- Si la descripcion cruda del S10 (`s10RawName`) coincide con un registro en `ItemAlias`, se vincula directamente al SKU maestro.
- **Factor de Conversion en Alias:** Permite convertir unidades de presupuesto hacia unidades base de stock (ej. S10 presupuesta en millares o bolsas y el almacen gestiona en unidades o kilogramos):
  $$\text{Cantidad Requerida Base} = \text{Cantidad S10} \times \text{ItemAlias.conversionFactor}$$
- Si no existe coincidencia, el recurso queda en estado `PENDIENTE_MAPEO` para vinculacion manual o creacion en catalogo.

### 6.4. Matriz de Brechas (Gap Analysis)
$$\text{Stock Neto Disponible Central} = \sum (\text{Stock.physicalQty} - \text{Stock.reservedQty})_{\text{Almacenes Centrales}}$$
$$\text{Deficit a Comprar} = \max(0, \text{Demanda Total S10 en Base} - \text{Stock Neto Disponible Central})$$

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

### 8.2. Rol `WAREHOUSE_KEEPER` (Almacenero de Obra / Caseta)
- Asignado a uno o mas almacenes mediante la tabla `UserWarehouse`. En la interfaz solo visualiza y opera los almacenes a los que tiene permiso activo.
- **Acceso Ciego a Finanzas (Data Masking Estricto):**
  - Los endpoints de la API filtran y omiten todo campo financiero (`averageCost`, `unitPriceOriginal`, `subtotalPEN`, `totalAmountPEN`, `unitCostSnapshot`).
  - No tiene permiso de visualizacion de facturas con montos; unicamente accede a guias de remision fisica y fotos de evidencia.
- Operatividad touch en caseta: recepcion de transferencias, salidas por consumo a capataces, vales de herramientas y conteo de inventario.
