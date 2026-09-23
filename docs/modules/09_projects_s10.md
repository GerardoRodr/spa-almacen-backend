# Modulo 09 - Proyectos, Ingesta S10 y Matriz de Brechas (Projects & S10)

## 1. Descripcion General
Este modulo vincula las obras de ingenieria civil con el sistema de abastecimiento mediante:
- Administracion de proyectos civiles y sus estados (`PLANNING`, `ACTIVE`, `LIQUIDATED`, `ARCHIVED`).
- Ingesta y decodificacion de presupuestos de obra provenientes de hojas tecnicas o exportaciones del software S10.
- Resolucion automatica de insumos mediante el diccionario de sinonimos (`ItemAlias`).
- Generacion de la **Matriz de Brechas (Gap Analysis)** para comparar en tiempo real la demanda presupuestada (`requiredQty`), el stock reservado en Almacen Central (`allocatedQty`) y el material consumido fisicamente en obra (`consumedQty`).
- Reserva logica de materiales en Almacen Central para el proyecto.

- **Ruta Base:** `/api/v1/projects`
- **Entidades Vinculadas:** `Project`, `ProjectRequirement`, `Item`, `ItemAlias`, `Warehouse`, `Stock`

---

## 2. Endpoints

### 2.1 Listar Proyectos
Retorna la relacion de obras civiles registradas con su estado y el almacen de obra asignado.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/projects`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Respuestas
**200 OK - Listado obtenido:**
```json
[
  {
    "id": "77777777-7777-7777-7777-777777777777",
    "name": "Residencial Las Palmeras - San Isidro",
    "budgetCode": "S10-OBRA-2026-01",
    "status": "ACTIVE",
    "warehouse": {
      "id": "44444444-4444-4444-4444-444444444444",
      "name": "Almacen Obra San Isidro"
    },
    "_count": {
      "requirements": 48
    }
  }
]
```

---

### 2.2 Registrar Nuevo Proyecto
Crea una obra en estado inicial `PLANNING`.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/projects`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body
```json
{
  "name": "Construccion Edificio Corporativo Los Sauces",
  "budgetCode": "S10-OBRA-2026-02",
  "status": "PLANNING"
}
```

#### Respuestas
**201 Created - Proyecto creado:**
```json
{
  "id": "88888888-8888-8888-8888-888888888888",
  "name": "Construccion Edificio Corporativo Los Sauces",
  "budgetCode": "S10-OBRA-2026-02",
  "status": "PLANNING",
  "createdAt": "2026-09-23T12:25:00.000Z"
}
```

---

### 2.3 Ingesta de Presupuesto S10
Procesa un archivo estructurado (CSV o JSON) con el listado de recursos del presupuesto S10. Mapea cada nombre crudo contra `ItemAlias` o `Item.name`. Si no existe equivalencia, el item se reporta como "No Mapeado" para que el administrador registre el alias correspondiente.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/projects/:id/ingest-s10`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`IngestS10Dto`)
```json
{
  "budgetCode": "S10-OBRA-2026-01",
  "resources": [
    {
      "s10Code": "0204010001",
      "s10RawName": "CEMENTO PORTLAND TIPO I (BOLSA 42.5KG)",
      "s10Unit": "BOL",
      "quantity": 2500
    },
    {
      "s10Code": "0202010005",
      "s10RawName": "ACERO CORRUGADO 1/2 FY=4200 KG/CM2",
      "s10Unit": "VAR",
      "quantity": 800
    }
  ]
}
```

#### Respuestas
**200 OK - Resumen de ingesta procesada:**
```json
{
  "projectId": "77777777-7777-7777-7777-777777777777",
  "totalProcessed": 2,
  "mappedCount": 2,
  "unmappedCount": 0,
  "unmappedItems": [],
  "requirementsCreated": 2
}
```

---

### 2.4 Matriz de Brechas (Gap Analysis)
Calcula el estado del abastecimiento del proyecto comparando:
- `requiredQty`: Demanda total estipulada en el S10.
- `allocatedQty`: Cantidad reservada en Almacen Central a favor de esta obra.
- `consumedQty`: Cantidad ya entregada y consumida en el frente de trabajo.
- `pendingToSupply`: Cantidad restante por proveer (`requiredQty - allocatedQty - consumedQty`).

- **Metodo:** `GET`
- **Ruta:** `/api/v1/projects/:id/gap-analysis`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado a la obra)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Respuestas
**200 OK - Matriz de brechas calculada:**
```json
{
  "projectId": "77777777-7777-7777-7777-777777777777",
  "projectName": "Residencial Las Palmeras - San Isidro",
  "analysis": [
    {
      "itemId": "item-uuid-cemento",
      "sku": "CEM-PORT-T1",
      "itemName": "Cemento Portland Tipo I (Bolsa 42.5 kg)",
      "baseUnit": "BOLSA",
      "requiredQty": "2500.0000",
      "allocatedQty": "500.0000",
      "consumedQty": "1200.0000",
      "pendingToSupply": "800.0000",
      "fulfillmentPercentage": 68.0
    }
  ]
}
```

---

### 2.5 Reservar Insumos en Almacen Central para el Proyecto
Incrementa `allocatedQty` en el proyecto y `Stock.reservedQty` en el Almacen Central tras validar que existe stock fisico disponible no comprometido.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/projects/:id/reserve`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`ReserveProjectRequirementDto`)
```json
{
  "centralWarehouseId": "22222222-2222-2222-2222-222222222222",
  "itemId": "item-uuid-cemento",
  "quantityToReserve": 300
}
```

#### Respuestas
**200 OK - Reserva confirmada:**
```json
{
  "projectId": "77777777-7777-7777-7777-777777777777",
  "itemId": "item-uuid-cemento",
  "allocatedQty": "800.0000",
  "centralWarehouseAvailableStock": "700.0000"
}
```
