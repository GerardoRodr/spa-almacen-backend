# Especificacion Tecnica y Plan de Trabajo Cruzado: Reversion, Edicion y Reemplazo de Transacciones (SPA-ALMACEN-ERP)

Este documento define la arquitectura contable, cambios en el esquema de base de datos, contratos de endpoints REST, algoritmos matematicos de reversion (Stock y CPP) y tareas de implementacion para dotar al sistema **SPA-ALMACEN-ERP** de capacidades completas para subsanar errores humanos en todas las transacciones operativas y administrativas.

Esta disenado para compartirse directamente con el agente del repositorio **Backend** (`spa-almacen-backend`) y coordinar la posterior integracion en el **Frontend** (`spa-almacen-frontend`).

---

## 1. Convenciones y Principios de Arquitectura

1. **Estado de tareas**:
   - `[ ]` Tarea pendiente de desarrollo o verificacion.
   - `[x]` Tarea implementada, probada y validada en su respectivo entorno.
2. **Convenciones de codigo**:
   - Comentarios y textos tecnicos en espanol neutro, directos, sin tildes y sin emojis.
   - **Backend**: NestJS 12+ en ESM puro (imports relativos obligatorios con extension `.js`), Prisma ORM v6 sobre PostgreSQL 16, bloques transaccionales atomicos (`prisma.$transaction`), precision `DECIMAL(12, 4)` en existencias y `DECIMAL(14, 4)` en costos unitarios.
   - **Frontend**: Angular 22 standalone, reactividad con Signals (`signal`, `computed`, `effect`, `model`), Tailwind CSS v4, diseno **Mobile-First** con objetivos tactiles minimos de 48x48 px (`min-h-[48px]`) y aislamiento financiero RBAC mediante `*appHasRole="['ADMIN', 'MODERATOR']"`.
3. **Patron Hibrido Contable (3 Niveles de Correccion)**:
   Para conciliar el principio de auditoria inmutable del Kardex (`BUSINESS_RULES.md` Seccion 2) con la necesidad real de corregir errores humanos en obra y oficina, se implementan tres mecanismos complementarios:
   - **Nivel 1 - Anular / Revertir Transaccion (`POST .../revert` o `cancel`)**:
     - No ejecuta `DELETE` fisico sobre el Kardex.
     - Marca la entidad original como revertida/anulada (`isReverted = true`, `revertedAt`, `revertedById`, `reversalReason`).
     - Emite automaticamente un **contra-asiento compensatorio** en la tabla `Movement` (`REVERSAL_ENTRY` o `REVERSAL_EXIT`) vinculado al movimiento original mediante `reversesMovementId`.
     - Restaura atomicamente `Stock.physicalQty`, `Stock.reservedQty`, `Stock.loanedQty`, `ProjectRequirement.allocatedQty`, `ProjectRequirement.consumedQty` y recalcula el `Stock.averageCost` (CPP).
   - **Nivel 2 - Edicion de Metadatos No Contables (`PATCH .../:id`)**:
     - Permite corregir en caliente atributos descriptivos o de identificacion que no alteran las cantidades fisicas ni el costo en Kardex (ej. serie de comprobante, fecha de emision, notas/lote, DNI/nombre de capataz u operario, codigo de serie de equipo, o lecturas de horometro/kilometraje en maquinaria).
   - **Nivel 3 - Corregir y Reemplazar Cantidades / Precios (`POST .../:id/replace`)**:
     - Ejecuta en un unico bloque `prisma.$transaction`: (a) la reversion completa de la transaccion original erronea (Nivel 1), y (b) el registro inmediato de la nueva transaccion corregida, vinculando ambas mediante `replacedById` / `replacesId`.
4. **Matriz de Permisos por Rol (RBAC)**:
   - **`ADMIN` y `MODERATOR`**: Autorizados sin restriccion de sede ni tiempo en todos los endpoints de reversion, edicion de metadatos y reemplazo.
   - **`WAREHOUSE_KEEPER`**: Autorizado para revertir, editar metadatos y reemplazar operaciones de campo (consumos, mermas, tomas de stock inicial, despachos/recepciones de transferencias, prestamos/devoluciones de herramientas, turnos de maquinaria y compras registradas en su sede) **unicamente en los almacenes que tiene asignados en `UserWarehouse`** (validado por `WarehouseAccessGuard`). `CostMaskingInterceptor` debe seguir ocultando cualquier atributo monetario en las respuestas para este rol.

---

## 2. Fase 1 (Backend): Evolucion del Esquema Prisma (`prisma/schema.prisma`)

### 2.1. Extension de Enums

Agregar los tipos de contra-asiento al enum `MovementType`:

```prisma
enum MovementType {
  PURCHASE_ENTRY       // Ingreso por compra a proveedor
  CONSUMPTION_EXIT     // Salida definitiva entregada a cuadrilla en obra
  TRANSFER_DISPATCH    // Salida fisica desde origen hacia transito
  TRANSFER_RECEIPT     // Entrada fisica confirmada en destino
  LOAN_DISPATCH        // Salida de herramienta a operario en custodia
  LOAN_RETURN          // Retorno de herramienta a caseta
  SHRINKAGE_EXIT       // Merma fisica, perdida en transporte o rotura
  INVENTORY_ADJUSTMENT // Ajuste manual o stock inicial
  REVERSAL_ENTRY       // Contra-asiento de ingreso (revierte una salida previa)
  REVERSAL_EXIT        // Contra-asiento de salida (revierte un ingreso previo)
}
```

### 2.2. Campos de Auditoria de Reversion y Reemplazo por Modelo

Agregar los siguientes campos opcionales (con valores por defecto compatibles con los registros existentes) en `prisma/schema.prisma`:

#### A. Modelo `Movement`
```prisma
model Movement {
  // ... campos actuales ...
  isReverted          Boolean    @default(false)
  revertedAt          DateTime?
  revertedById        String?
  reversalReason      String?    @db.Text
  reversesMovementId  String?    @unique // Si este movimiento es un contra-asiento, apunta al Movement original
  replacedById        String?    @unique // Si fue corregido mediante replace, apunta al nuevo Movement valido

  revertedBy          User?      @relation("RevertedMovements", fields: [revertedById], references: [id])
  reversesMovement    Movement?  @relation("MovementReversal", fields: [reversesMovementId], references: [id])
  reversedByMovement  Movement?  @relation("MovementReversal")

  @@index([isReverted])
}
```

#### B. Modelo `Purchase`
```prisma
model Purchase {
  // ... campos actuales ...
  isReverted          Boolean    @default(false)
  revertedAt          DateTime?
  revertedById        String?
  reversalReason      String?    @db.Text
  reversalMovementId  String?    // UUID del Movement REVERSAL_EXIT generado al anular
  replacedById        String?    @unique // UUID de la nueva Purchase si se uso replace

  revertedBy          User?      @relation("RevertedPurchases", fields: [revertedById], references: [id])

  @@index([isReverted])
}
```

#### C. Modelo `Transfer`
*(Nota: `TransferStatus` ya incluye el valor `CANCELLED` en el esquema actual)*.
```prisma
model Transfer {
  // ... campos actuales ...
  cancelledAt         DateTime?
  cancelledById       String?
  cancellationReason  String?    @db.Text
  replacedById        String?    @unique

  cancelledBy         User?      @relation("CancelledTransfers", fields: [cancelledById], references: [id])
}
```

#### D. Modelo `ToolCustody`
```prisma
model ToolCustody {
  // ... campos actuales ...
  isReverted          Boolean    @default(false) // true si el vale fue anulado por error de despacho
  revertedAt          DateTime?
  revertedById        String?
  reversalReason      String?    @db.Text
  replacedById        String?    @unique

  revertedBy          User?      @relation("RevertedToolCustodies", fields: [revertedById], references: [id])

  @@index([isReverted])
}
```

#### E. Modelo `MachineryShiftLog`
```prisma
model MachineryShiftLog {
  // ... campos actuales ...
  isReverted          Boolean    @default(false)
  revertedAt          DateTime?
  revertedById        String?
  reversalReason      String?    @db.Text

  revertedBy          User?      @relation("RevertedMachineryShifts", fields: [revertedById], references: [id])

  @@index([isReverted])
}
```

#### F. Relaciones inversas en `User`
Agregar en `model User`:
```prisma
  revertedMovements       Movement[]          @relation("RevertedMovements")
  revertedPurchases       Purchase[]          @relation("RevertedPurchases")
  cancelledTransfers      Transfer[]          @relation("CancelledTransfers")
  revertedToolCustodies   ToolCustody[]       @relation("RevertedToolCustodies")
  revertedMachineryShifts MachineryShiftLog[] @relation("RevertedMachineryShifts")
```

---

## 3. Fase 2 (Backend): Algoritmos de Negocio y Endpoints por Modulo

### 3.1. Modulo 05: Compras (`/api/v1/purchases`)

#### 3.1.1. Anular / Revertir Compra
- **Endpoint**: `POST /api/v1/purchases/:id/revert`
- **Acceso**: `ADMIN`, `MODERATOR`, `WAREHOUSE_KEEPER` (validando sede en `UserWarehouse`).
- **Request Body (`RevertPurchaseDto`)**:
  ```json
  {
    "reversalReason": "Factura registrada por duplicado o error en cantidades ingresadas"
  }
  ```
  - `reversalReason`: `@IsString() @IsNotEmpty() @MinLength(5) @MaxLength(500)`
- **Logica Transaccional (`prisma.$transaction`)**:
  1. Verificar que la compra exista y que `purchase.isReverted === false` (si ya esta revertida, lanzar `ConflictException` 409 `"La compra ya fue anulada previamente"`).
  2. Determinar el almacen receptor (`warehouseId = purchase.warehouseId || purchase.centralWarehouseId`). Si el usuario es `WAREHOUSE_KEEPER`, validar pertenencia en `UserWarehouse`.
  3. **Validacion de Stock Disponible**: Para cada linea `detail` en `purchase.details`:
     - Consultar `stock` en `(warehouseId, detail.itemId)`.
     - Calcular disponible neto para retiro: `availableForExit = stock.physicalQty - stock.reservedQty - stock.loanedQty`.
     - Si `availableForExit < detail.baseQty`: lanzar `BadRequestException` (400):
       `"No se puede anular la compra: el insumo [SKU] solo tiene [availableForExit] unidades libres en almacen y se requieren retirar [detail.baseQty]. Revierta primero los consumos, prestamos o transferencias posteriores."`
  4. **Recalculo Inverso de CPP y Descuento de Stock**:
     Para cada `detail`:
     - Sea $S_{\text{act}} = \text{stock.physicalQty}$, $\text{CPP}_{\text{act}} = \text{stock.averageCost}$, $Q_{\text{rev}} = \text{detail.baseQty}$, $C_{\text{rev}} = \text{detail.unitCostBasePEN}$.
     - Nuevo stock fisico: $S_{\text{nuevo}} = S_{\text{act}} - Q_{\text{rev}}$.
     - Nuevo costo promedio $\text{CPP}_{\text{nuevo}}$:
       - Si $S_{\text{nuevo}} \le 0$: $\text{CPP}_{\text{nuevo}} = 0$.
       - Si $S_{\text{nuevo}} > 0$ y $C_{\text{rev}} \le 0$ (la compra era a costo cero): $\text{CPP}_{\text{nuevo}} = \text{CPP}_{\text{act}}$ (no altera el CPP).
       - Si $S_{\text{nuevo}} > 0$ y $C_{\text{rev}} > 0$:
         $$\text{ValorRestante} = (S_{\text{act}} \times \text{CPP}_{\text{act}}) - (Q_{\text{rev}} \times C_{\text{rev}})$$
         - Si $\text{ValorRestante} > 0$: $\text{CPP}_{\text{nuevo}} = \text{ValorRestante} / S_{\text{nuevo}}$.
         - Si $\text{ValorRestante} \le 0$: consultar la ultima compra activa (`isReverted = false`, `id != purchase.id`, `unitCostBasePEN > 0`) de ese `itemId` en ese almacen; usar su `unitCostBasePEN` o `0` si no existen compras previas.
     - Actualizar `Stock` con `physicalQty = S_nuevo` y `averageCost = CPP_nuevo`.
  5. **Contra-Asiento en Kardex**:
     - Crear un nuevo `Movement` con tipo `REVERSAL_EXIT`, correlativo generado por `SequenceGeneratorService`, `originWarehouseId = warehouseId`, `observation = "Anulacion de compra " + purchase.invoiceSeries + ": " + dto.reversalReason`, y `reversesMovementId` apuntando al `Movement` original de la compra (si existe).
     - Crear los `MovementItem` correspondientes con `quantity = detail.baseQty` y `unitCostSnapshot = detail.unitCostBasePEN`.
     - Marcar el `Movement` original de la compra (si existe) con `isReverted = true`, `revertedAt = now()`, `revertedById = user.id`, `reversalReason = dto.reversalReason`.
  6. **Actualizar Cabecera `Purchase`**:
     - Marcar `isReverted = true`, `revertedAt = now()`, `revertedById = user.id`, `reversalReason = dto.reversalReason`, `reversalMovementId = reversalMovement.id`.
  7. Retornar la compra actualizada con su estado `isReverted: true` y datos del contra-asiento.

#### 3.1.2. Editar Metadatos de Compra
- **Endpoint**: `PATCH /api/v1/purchases/:id`
- **Acceso**: `ADMIN`, `MODERATOR`, `WAREHOUSE_KEEPER` (en su sede).
- **Request Body (`UpdatePurchaseMetadataDto`)**:
  - `supplierId?: string` (UUID)
  - `invoiceSeries?: string`
  - `voucherType?: string` (`FACTURA`, `BOLETA`, `GUIA`, `RECIBO`)
  - `issueDate?: string` (ISO Date)
  - `notes?: string`
  - `itemNotes?: Array<{ detailId: string; notes: string }>` (para actualizar lotes o fechas de vencimiento por renglon sin tocar cantidades ni precios)
- **Logica**:
  - Valida que `purchase.isReverted === false`.
  - Actualiza los campos enviados en `Purchase` y, si se incluye `itemNotes`, actualiza `PurchaseDetail.notes` de cada `detailId` perteneciente a la compra.

#### 3.1.3. Corregir y Reemplazar Compra Atomica
- **Endpoint**: `POST /api/v1/purchases/:id/replace`
- **Acceso**: `ADMIN`, `MODERATOR`, `WAREHOUSE_KEEPER` (en su sede).
- **Request Body (`ReplacePurchaseDto`)**:
  - Extiende `CreatePurchaseDto` + campo obligatorio `reversalReason: string`.
- **Logica (`prisma.$transaction`)**:
  1. Ejecuta internamente la logica de reversion de `POST /purchases/:id/revert` sobre la compra `:id`.
  2. Ejecuta internamente la logica de creacion `createPurchase()` con los nuevos datos dentro de la misma transaccion de base de datos.
  3. Vincula `oldPurchase.replacedById = newPurchase.id`.
  4. Retorna la nueva compra creada.

#### 3.1.4. Ajustes en Consultas de Compras y S10
- En `GET /api/v1/purchases`:
  - Agregar filtro opcional `includeReverted?: boolean` (por defecto `true` en el historial general para que se vean con badge `ANULADA`, o filtrable por estado).
  - En `GET /api/v1/purchases/price-comparison`: filtrar obligatoriamente `purchase: { isReverted: false }` para que las facturas anuladas **nunca** contaminen el Precio Minimo Historico ni la tabla comparativa de proveedores.
- En `ProjectsService.getGapAnalysis()`:
  - Al calcular `minHistoricalUnitCost` desde `PurchaseDetail`, filtrar `purchase: { isReverted: false }`.

---

### 3.2. Modulo 06: Transferencias (`/api/v1/transfers`)

#### 3.2.1. Cancelar Transferencia en Transito (Fase 1)
- **Endpoint**: `POST /api/v1/transfers/:id/cancel`
- **Acceso**: `ADMIN`, `MODERATOR`, `WAREHOUSE_KEEPER` (asignado al almacen de origen o destino).
- **Request Body (`CancelTransferDto`)**:
  ```json
  {
    "cancellationReason": "Error en guia de despacho: camion no salio de almacen central",
    "restoreProjectAllocation": true
  }
  ```
  - `cancellationReason`: `@IsString() @IsNotEmpty() @MinLength(5) @MaxLength(500)`
  - `restoreProjectAllocation?: boolean` (default: `true`)
- **Logica (`prisma.$transaction`)**:
  1. Validar que `transfer.status === 'IN_TRANSIT'` o `'PENDING'`. Si ya esta `COMPLETED`, `DISCREPANCY` o `CANCELLED`, lanzar `BadRequestException`.
  2. Para cada `item` en `transfer.items`:
     - Incrementar `Stock.physicalQty += item.dispatchedQty` en `transfer.originWarehouseId`.
     - Si la transferencia tenia `projectId` y `restoreProjectAllocation !== false`:
       - Buscar si existe `ProjectRequirement` para `(transfer.projectId, item.itemId)`.
       - Si existe: incrementar `ProjectRequirement.allocatedQty += item.dispatchedQty` e incrementar `Stock.reservedQty += item.dispatchedQty` en el almacen de origen (si es `CENTRAL`), sin exceder `ProjectRequirement.requiredQty - ProjectRequirement.consumedQty`.
  3. Emitir contra-asiento `Movement` de tipo `REVERSAL_ENTRY` en `destWarehouseId = transfer.originWarehouseId` con los items y su `unitCostSnapshot`.
  4. Marcar el movimiento original `TRANSFER_DISPATCH` con `isReverted = true`.
  5. Actualizar `Transfer`: `status = 'CANCELLED'`, `cancelledAt = now()`, `cancelledById = user.id`, `cancellationReason = dto.cancellationReason`.

#### 3.2.2. Revertir Recepcion de Transferencia (Fase 2)
- **Endpoint**: `POST /api/v1/transfers/:id/revert-reception`
- **Acceso**: `ADMIN`, `MODERATOR`, `WAREHOUSE_KEEPER` (asignado al almacen de destino).
- **Request Body (`RevertTransferReceptionDto`)**:
  ```json
  {
    "reversalReason": "Error de conteo en caseta al recepcionar bolsas de cemento",
    "mode": "BACK_TO_TRANSIT"
  }
  ```
  - `reversalReason`: `@IsString() @IsNotEmpty() @MinLength(5) @MaxLength(500)`
  - `mode`: `'BACK_TO_TRANSIT' | 'CANCEL_COMPLETELY'` (default: `'BACK_TO_TRANSIT'`)
- **Logica (`prisma.$transaction`)**:
  1. Validar que `transfer.status === 'COMPLETED' || transfer.status === 'DISCREPANCY'`.
  2. Para cada `item` en `transfer.items`:
     - Sea `recQty = Number(item.receivedQty || 0)`.
     - Si `recQty > 0`:
       - Validar en `transfer.destWarehouseId` que `Stock.physicalQty - Stock.reservedQty - Stock.loanedQty >= recQty`. Si no alcanza, lanzar `BadRequestException` indicando que el material recibido ya fue consumido o prestado en la obra.
       - Decrementar `Stock.physicalQty -= recQty` en `transfer.destWarehouseId` y recalcular el CPP inverso en destino usando `item.unitCostSnapshot`.
  3. Emitir contra-asiento `Movement` (`REVERSAL_EXIT`) en `transfer.destWarehouseId` por las unidades recibidas revertidas.
  4. Si `transfer.status === 'DISCREPANCY'` (hubo merma automatica `SHRINKAGE_EXIT`), marcar dicho movimiento de merma como `isReverted = true` y emitir su `REVERSAL_ENTRY` compensatorio.
  5. Limpiar en `TransferItem`: `receivedQty = null`, `discrepancyQty = null`.
  6. Si `mode === 'BACK_TO_TRANSIT'`:
     - Actualizar `Transfer`: `status = 'IN_TRANSIT'`, `receivedAt = null`, `receivedById = null`, agregando nota de auditoria en `receptionNotes`.
     - La transferencia vuelve a aparecer inmediatamente en la bandeja de **"En Transito"** para que el almacenero registre la recepcion correcta.
  7. Si `mode === 'CANCEL_COMPLETELY'`:
     - Ademas de revertir la recepcion en destino, ejecuta inmediatamente los pasos de `cancel` (Seccion 3.2.1) devolviendo `dispatchedQty` al almacen de origen y dejando `Transfer.status = 'CANCELLED'`.

#### 3.2.3. Editar Metadatos y Reemplazar Transferencia
- **`PATCH /api/v1/transfers/:id`**:
  - Permite actualizar `dispatchNotes` y `receptionNotes`.
- **`POST /api/v1/transfers/:id/replace`**:
  - Si la transferencia esta `IN_TRANSIT`, ejecuta `cancel` y despacha una nueva transferencia corregida en un solo `prisma.$transaction`, vinculando `replacedById`.

---

### 3.3. Modulo 07: Movimientos y Kardex (`/api/v1/movements`)

Aplica a los movimientos directos creados en caseta u oficina:
- `CONSUMPTION_EXIT` (Salidas por consumo a cuadrilla)
- `SHRINKAGE_EXIT` (Salidas por merma o baja)
- `INVENTORY_ADJUSTMENT` (Ajustes de inventario y cargas de Stock Inicial `initial-stock`)

*(Nota: Los movimientos originados por Compras, Transferencias o Custodias deben revertirse a traves de sus respectivos endpoints de dominio `/purchases/:id/revert`, `/transfers/:id/cancel` o `/tools/custody/:id/revert-*` para mantener sincronizadas sus tablas maestras. Si se invoca `/movements/:id/revert` sobre un movimiento de compra/transferencia/custodia, el backend puede delegar internamente al servicio correspondiente o indicar usar el endpoint de su modulo).*

#### 3.3.1. Revertir Movimiento Directo (Consumo, Merma, Ajuste / Stock Inicial)
- **Endpoint**: `POST /api/v1/movements/:id/revert`
- **Acceso**: `ADMIN`, `MODERATOR`, `WAREHOUSE_KEEPER` (asignado al almacen del movimiento).
- **Request Body (`RevertMovementDto`)**:
  ```json
  {
    "reason": "Error de digitacion: se entregaron 4 bolsas en lugar de 40",
    "adjustmentDirections": [
      { "itemId": "uuid-insumo-opcional", "direction": "INCREASE" }
    ]
  }
  ```
- **Logica (`prisma.$transaction`)**:
  1. Verificar que el movimiento exista, que `movement.isReverted === false` y que no sea un movimiento de tipo `REVERSAL_ENTRY` ni `REVERSAL_EXIT`.
  2. Segun `movement.type`:
     - **Caso `CONSUMPTION_EXIT`**:
       - Para cada `movItem` en `movement.items`:
         - Incrementar `Stock.physicalQty += movItem.quantity` en `movement.originWarehouseId`.
         - Si `movement.projectId` existe: decrementar en `ProjectRequirement`: `consumedQty = max(0, consumedQty - movItem.quantity)`.
       - Crear contra-asiento `Movement` de tipo `REVERSAL_ENTRY` con `destWarehouseId = movement.originWarehouseId`, `projectId = movement.projectId`, `reversesMovementId = movement.id`.
     - **Caso `SHRINKAGE_EXIT`**:
       - Para cada `movItem`: incrementar `Stock.physicalQty += movItem.quantity` en `movement.originWarehouseId`.
       - Crear contra-asiento `Movement` de tipo `REVERSAL_ENTRY` con `destWarehouseId = movement.originWarehouseId`, `reversesMovementId = movement.id`.
     - **Caso `INVENTORY_ADJUSTMENT` (incluyendo `initial-stock`)**:
       - Determinar si cada renglon o el movimiento fue de ingreso (`destWarehouseId != null` o incremento) o salida (`DECREASE`):
         - Si incremento el stock: validar `Stock.physicalQty - Stock.reservedQty - Stock.loanedQty >= movItem.quantity`, decrementar `Stock.physicalQty -= movItem.quantity` y emitir `REVERSAL_EXIT`.
         - Si disminuyo el stock: incrementar `Stock.physicalQty += movItem.quantity` y emitir `REVERSAL_ENTRY`.
  3. Marcar el `Movement` original con `isReverted = true`, `revertedAt = now()`, `revertedById = user.id`, `reversalReason = dto.reversalReason`.
  4. Retornar `{ originalMovement, reversalMovement }`.

#### 3.3.2. Editar Metadatos de Movimiento (Receptor, DNI, Observacion, Motivo)
- **Endpoint**: `PATCH /api/v1/movements/:id`
- **Acceso**: `ADMIN`, `MODERATOR`, `WAREHOUSE_KEEPER` (en su sede).
- **Request Body (`UpdateMovementMetadataDto`)**:
  - `recipientName?: string`
  - `recipientDni?: string` (8 digitos)
  - `observation?: string`
  - `shrinkageReason?: string`
- **Logica**:
  - Valida que `movement.isReverted === false`.
  - Actualiza los campos descriptivos sin modificar cantidades ni costos.

#### 3.3.3. Corregir y Reemplazar Consumo / Merma / Ajuste
- **Endpoints**:
  - `POST /api/v1/movements/:id/replace-consumption` (Body: `CreateConsumptionExitDto` + `reversalReason: string`)
  - `POST /api/v1/movements/:id/replace-shrinkage` (Body: `CreateShrinkageExitDto` + `reversalReason: string`)
- **Logica (`prisma.$transaction`)**:
  1. Ejecuta la reversion del movimiento `:id` (`revertMovement`).
  2. Crea el nuevo movimiento de consumo o merma con los items y cantidades corregidos.
  3. Vincula `oldMovement.replacedById = newMovement.id` y retorna el nuevo movimiento creado.

---

### 3.4. Modulo 08: Custodia y Prestamo de Herramientas (`/api/v1/tools/custody`)

#### 3.4.1. Anular Prestamo Abierto (Despacho por Error)
- **Endpoint**: `POST /api/v1/tools/custody/:id/revert-dispatch`
- **Acceso**: `ADMIN`, `MODERATOR`, `WAREHOUSE_KEEPER` (en su sede).
- **Request Body (`RevertCustodyDto`)**:
  ```json
  {
    "reason": "Herramienta seleccionada por error, el operario llevo otra unidad"
  }
  ```
- **Logica (`prisma.$transaction`)**:
  1. Validar que el vale exista, que `custody.isReverted === false` y que `custody.returnDate === null` (si ya fue devuelto, primero debe revertirse la devolucion).
  2. En `Stock` para `(custody.warehouseId, custody.itemId)`:
     - Decrementar `Stock.loanedQty = max(0, loanedQty - custody.quantity)`.
  3. Marcar `ToolCustody`: `isReverted = true`, `revertedAt = now()`, `revertedById = user.id`, `reversalReason = dto.reversalReason`.
  4. Emitir movimiento compensatorio en Kardex (`REVERSAL_ENTRY` o marcar el `LOAN_DISPATCH` original como `isReverted = true`).

#### 3.4.2. Revertir Devolucion de Herramienta (Reabrir Vale o Corregir Calificacion)
- **Endpoint**: `POST /api/v1/tools/custody/:id/revert-return`
- **Acceso**: `ADMIN`, `MODERATOR`, `WAREHOUSE_KEEPER` (en su sede).
- **Request Body (`RevertCustodyDto`)**:
  ```json
  {
    "reason": "Se marco como EXTRAVIADO por error, el operario aun tiene la herramienta en frente de obra"
  }
  ```
- **Logica (`prisma.$transaction`)**:
  1. Validar que el vale exista, que `custody.isReverted === false` y que `custody.returnDate !== null`.
  2. Verificar el impacto que tuvo la devolucion original segun `custody.conditionOnReturn`:
     - Si `conditionOnReturn` fue `'DAMAGED_UNUSABLE'` o `'LOST'` (baja patrimonial que resto `physicalQty` y `loanedQty` y genero un `SHRINKAGE_EXIT`):
       - Incrementar `Stock.physicalQty += custody.quantity`.
       - Incrementar `Stock.loanedQty += custody.quantity`.
       - Emitir `REVERSAL_ENTRY` compensando la baja patrimonial.
     - Si `conditionOnReturn` fue `'NEW'`, `'OPERATIVE'`, `'DAMAGED_USABLE'` o `'MAINTENANCE_REQUIRED'` (retorno conforme que solo resto `loanedQty`):
       - Validar que en el almacen exista disponibilidad (`Stock.physicalQty - Stock.loanedQty >= custody.quantity`).
       - Incrementar `Stock.loanedQty += custody.quantity`.
  3. Limpiar en `ToolCustody`:
     - `returnDate = null`
     - `conditionOnReturn = null`
     - `receivedById = null`
     - `returnNotes = null` (o conservar nota historica en `notes`)
  4. Retornar el vale reabierto (ahora nuevamente en estado `PENDING` / `EN CAMPO`), listo para registrar la devolucion correcta o continuar en obra.

#### 3.4.3. Editar Metadatos de Vale de Custodia y Reemplazar
- **`PATCH /api/v1/tools/custody/:id` (`UpdateToolCustodyMetadataDto`)**:
  - Permite editar `assignedToName`, `assignedToDni`, `serialOrCode`, `expectedReturnDate`, `conditionOnDispatch` (`NEW`, `OPERATIVE`, `DAMAGED_USABLE`), `notes`, `returnNotes`.
- **`POST /api/v1/tools/custody/:id/replace` (`ReplaceToolCustodyDto`)**:
  - Revierte el despacho del vale abierto `:id` y emite el nuevo vale con la herramienta o cantidad corregida en un solo `prisma.$transaction`.

#### 3.4.4. Ajuste en Listados y Deuda por Trabajador
- En `GET /api/v1/tools/custody` y `GET /api/v1/tools/custody/worker/:dni`:
  - Excluir por defecto los vales con `isReverted = true` en el conteo de deuda activa (`onlyPending = true`) y en `worker/:dni`, permitiendo consultarlos en el historial general si se filtra por anulados.

---

### 3.5. Modulo 12: Maquinaria Pesada, Horometros y Kilometrajes (`/api/v1/machinery`)

En maquinaria pesada, un error humano al digitar el horometro o kilometraje (ej. escribir `12500` en lugar de `1250.0`) bloquea la apertura de futuros turnos porque el sistema valida que `startMeter >= lastMeter`.

#### 3.5.1. Editar / Corregir Jornada de Maquinaria (Lecturas y Datos)
- **Endpoint**: `PATCH /api/v1/machinery/shifts/:id`
- **Acceso**: `ADMIN`, `MODERATOR`, `WAREHOUSE_KEEPER` (en su sede).
- **Request Body (`UpdateMachineryShiftDto`)**:
  ```json
  {
    "operatorName": "Carlos Alberto Huaman",
    "operatorDni": "45678912",
    "startMeter": 1250.5,
    "endMeter": 1258.75,
    "startPhotoId": "uuid-opcional",
    "endPhotoId": "uuid-opcional",
    "fuelPhotoId": "uuid-opcional",
    "notes": "Lectura corregida segun fotografia de tablero"
  }
  ```
- **Logica (`prisma.$transaction`)**:
  1. Validar que el turno exista y que `shift.isReverted === false`.
  2. Determinar `newStartMeter = dto.startMeter ?? Number(shift.startMeter)` y `newEndMeter = dto.endMeter !== undefined ? dto.endMeter : (shift.endMeter !== null ? Number(shift.endMeter) : null)`.
  3. Si `newEndMeter !== null`:
     - Validar que `newEndMeter >= newStartMeter`. Si es menor, lanzar `BadRequestException` (`"La lectura final no puede ser menor a la lectura inicial"`).
     - Recalcular `totalUsage = newEndMeter - newStartMeter`.
  4. Validar consistencia cronologica contra el turno activo/cerrado inmediatamente anterior (`prevShift` con `isReverted = false` y `startDateTime < shift.startDateTime`):
     - Si existe `prevShift` con `endMeter !== null` y `newStartMeter < Number(prevShift.endMeter)`: lanzar `BadRequestException` indicando la lectura final del turno previo.
  5. Actualizar `MachineryShiftLog` y retornar el registro enriquecido con `item`, `warehouse`, `startPhoto`, `endPhoto` y `fuelPhoto`.

#### 3.5.2. Anular / Revertir Jornada de Maquinaria
- **Endpoint**: `POST /api/v1/machinery/shifts/:id/revert`
- **Acceso**: `ADMIN`, `MODERATOR`, `WAREHOUSE_KEEPER` (en su sede).
- **Request Body (`RevertMachineryShiftDto`)**:
  ```json
  {
    "reason": "Turno abierto por error en maquina equivocada"
  }
  ```
- **Logica**:
  1. Validar que `shift.isReverted === false`.
  2. Marcar `isReverted = true`, `revertedAt = now()`, `revertedById = user.id`, `reversalReason = dto.reversalReason`.
  3. **Impacto inmediato en `GET /api/v1/machinery/item/:itemId/status`**:
     - Asegurar que `getItemStatus(itemId)` filtre `isReverted: false` tanto al buscar el turno abierto (`endDateTime: null, isReverted: false`) como al buscar el ultimo turno cerrado para obtener `lastMeter`. Asi, al anular un turno erroneo, la maquina queda libre de inmediato y recupera el `lastMeter` real anterior.

---

## 4. Checklist de Tareas para el Agente del Backend (`spa-almacen-backend`)

- [x] **Paso 1: Esquema Prisma y Migracion**:
  - [x] Agregar `REVERSAL_ENTRY` y `REVERSAL_EXIT` al enum `MovementType` en `prisma/schema.prisma`.
  - [x] Agregar campos de auditoria de reversion/reemplazo (`isReverted`, `revertedAt`, `revertedById`, `reversalReason`, `reversesMovementId`, `replacedById`, `cancelledAt`, `cancelledById`, `cancellationReason`) en `Movement`, `Purchase`, `Transfer`, `ToolCustody` y `MachineryShiftLog`.
  - [x] Ejecutar migracion `npx prisma migrate dev --name add_transaction_reversals_and_edits` y regenerar Prisma Client.
- [x] **Paso 2: Modulo de Compras (`src/modules/purchases`)**:
  - [x] Implementar `POST /api/v1/purchases/:id/revert` con validacion de stock disponible, recalculo inverso de CPP y contra-asiento `REVERSAL_EXIT`.
  - [x] Implementar `PATCH /api/v1/purchases/:id` para edicion de metadatos de cabecera y notas de detalle.
  - [x] Implementar `POST /api/v1/purchases/:id/replace` para reversion y recreacion atomica.
  - [x] Excluir compras con `isReverted: true` en `getPriceComparison()` y en `ProjectsService.getGapAnalysis()` (`minHistoricalUnitCost`).
- [x] **Paso 3: Modulo de Transferencias (`src/modules/transfers`)**:
  - [x] Implementar `POST /api/v1/transfers/:id/cancel` para guias `IN_TRANSIT` / `PENDING` restaurando stock en origen y reserva de proyecto.
  - [x] Implementar `POST /api/v1/transfers/:id/revert-reception` con soporte para `mode: 'BACK_TO_TRANSIT' | 'CANCEL_COMPLETELY'`.
  - [x] Implementar `PATCH /api/v1/transfers/:id` y `POST /api/v1/transfers/:id/replace`.
- [x] **Paso 4: Modulo de Movimientos y Kardex (`src/modules/movements`)**:
  - [x] Implementar `POST /api/v1/movements/:id/revert` para `CONSUMPTION_EXIT`, `SHRINKAGE_EXIT` e `INVENTORY_ADJUSTMENT` (`initial-stock`), ajustando `Stock.physicalQty` y `ProjectRequirement.consumedQty`.
  - [x] Implementar `PATCH /api/v1/movements/:id` para editar `recipientName`, `recipientDni`, `observation` y `shrinkageReason`.
  - [x] Implementar `POST /api/v1/movements/:id/replace-consumption` y `POST /api/v1/movements/:id/replace-shrinkage`.
- [x] **Paso 5: Modulo de Custodia de Herramientas (`src/modules/tool-custody`)**:
  - [x] Implementar `POST /api/v1/tools/custody/:id/revert-dispatch` para anular prestamos abiertos y liberar `Stock.loanedQty`.
  - [x] Implementar `POST /api/v1/tools/custody/:id/revert-return` para revertir devoluciones (restaurando `Stock.physicalQty` si fue baja por dano/perdida y reabriendo el vale a estado `PENDING`).
  - [x] Implementar `PATCH /api/v1/tools/custody/:id` y `POST /api/v1/tools/custody/:id/replace`.
  - [x] Filtrar `isReverted: false` en `getCustodyByWorker()` y cuando `onlyPending === true`.
- [x] **Paso 6: Modulo de Maquinaria (`src/modules/machinery`)**:
  - [x] Implementar `PATCH /api/v1/machinery/shifts/:id` permitiendo corregir `startMeter`, `endMeter`, `operatorName`, `operatorDni`, fotos y `notes`, recalculando `totalUsage`.
  - [x] Implementar `POST /api/v1/machinery/shifts/:id/revert` y filtrar `isReverted: false` en `getItemStatus()` y metricas.
- [x] **Paso 7: Seguridad, Pruebas y Documentacion Backend**:
  - [x] Verificar que `WarehouseAccessGuard` permita a `WAREHOUSE_KEEPER` operar estos endpoints en sus almacenes asignados (`UserWarehouse`) y que `CostMaskingInterceptor` oculte campos financieros.
  - [x] Agregar pruebas unitarias en cada `*.service.spec.ts` y verificar compilacion limpia (`npm run build` y `npm test`).
  - [x] Actualizar documentacion en `docs/modules/05_purchases_suppliers.md`, `06_transfers.md`, `07_movements_kardex.md`, `08_tool_custody.md` y `12_machinery.md`.

---

## 5. Checklist de Tareas para el Agente del Frontend (`spa-almacen-frontend`)

*(A ejecutar una vez que el Backend haya completado los pasos anteriores)*

- [ ] **Paso 1: Modelos, Servicios y Componente Modal de Reversion Compartido**:
  - [ ] Actualizar modelos en `src/app/core/models/` (`purchase.models.ts`, `transfer.models.ts`, `movement.models.ts`, `tool-custody.models.ts`, `machinery.models.ts`) agregando campos de estado de reversion y DTOs (`Revert*Dto`, `Update*MetadataDto`, `Replace*Dto`).
  - [ ] Agregar los metodos HTTP correspondientes en `PurchaseService`, `TransferService`, `MovementService`, `ToolCustodyService` y `MachineryService`.
  - [ ] Crear componente standalone `TransactionRevertModalComponent` (`src/app/shared/components/transaction-revert-modal/`) optimizado para movil y escritorio, con chips tactiles de motivos rapidos (`min-h-[48px]`), selector de modo (cuando aplique) y validacion de motivo obligatorio.
- [ ] **Paso 2: Interfaz de Compras (`/compras`)**:
  - [ ] En `PurchaseDetailModalComponent`: agregar modo edicion inline de metadatos (`PATCH /purchases/:id`), boton **"Corregir / Reemplazar"** (abriendo `PurchaseFormComponent` precargado con los datos de la factura para reemplazo atomico) y boton **"Anular Compra"** (`POST /purchases/:id/revert`).
  - [ ] Mostrar badge `ANULADA` en la tabla y tarjetas moviles, excluyendo compras anuladas de los KPIs superiores de gasto.
- [ ] **Paso 3: Interfaz de Transferencias (`/transferencias` y `/movil/recepcion`, `/movil/transferencias`)**:
  - [ ] En `TransferDetailModalComponent` y tarjetas moviles: agregar boton **"Cancelar Envio"** para transferencias `IN_TRANSIT`, boton **"Revertir Recepcion"** (con opcion de devolver a `En Transito` o cancelar totalmente) para transferencias `COMPLETED`/`DISCREPANCY`, y edicion rapida de notas.
- [ ] **Paso 4: Interfaz de Consumos y Kardex (`/consumos`, `/kardex`, `/movil/consumo`, `/movil/consumos`)**:
  - [ ] En el detalle de vale de consumo y en `MovementDetailModalComponent`: incorporar edicion rapida de receptor/DNI/frente (`PATCH /movements/:id`), boton **"Corregir Cantidades"** (precargando `ConsumptionCreateModalComponent` o `ShrinkageModalComponent` en modo reemplazo) y boton **"Anular Vale / Movimiento"**.
  - [ ] Identificar visualmente en Kardex los movimientos revertidos (`ANULADO`) y los asientos inversos (`REVERSAL_ENTRY` / `REVERSAL_EXIT`).
- [ ] **Paso 5: Interfaz de Custodia de Herramientas (`/herramientas-custodia` y `/movil/herramientas`)**:
  - [ ] En `CustodyDetailModalComponent` y vista movil: habilitar **"Anular Prestamo"**, **"Editar Datos"** y **"Corregir Prestamo"** para vales en campo, y **"Revertir Devolucion"** para vales devueltos por error o con calificacion equivocada.
- [ ] **Paso 6: Interfaz de Maquinaria (`/maquinaria` y `/movil/maquinaria`)**:
  - [ ] En `MachineryShiftDetailModalComponent` y bitacora movil: agregar formulario tactil para **"Corregir Lecturas / Operador"** (`PATCH /machinery/shifts/:id`) y boton **"Anular Turno"** (`POST /machinery/shifts/:id/revert`).
- [ ] **Paso 7: Verificacion Frontend**:
  - [ ] Ejecutar `npm run build` y suite de pruebas unitarias con Vitest (`npm test`).
