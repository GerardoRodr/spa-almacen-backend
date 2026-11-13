# Modulo 14 - Unidades de Medida Maestras (Measurement Units)

## 1. Descripcion General
El modulo de Unidades de Medida centraliza el catalogo maestro corporativo de magnitudes y unidades base (`UND`, `BOLSA`, `KG`, `M3`, `VARILLA`, `LITRO`, etc.) utilizadas para el control de inventario, compras, kardex y presupuestos S10.

Este modulo permite:
- **Listar Unidades:** Proveer la lista de unidades activas para alimentar selectores, dropdowns y autocompletes en toda la aplicacion frontend.
- **Administrar Unidades (CRUD):** Permitir a usuarios con rol `ADMIN` o `MODERATOR` crear nuevas unidades maestras, actualizar su nombre o descripcion, y desactivar o eliminar unidades en desuso.
- **Proteccion Referencial:** Si una unidad ya esta asociada a uno o mas insumos (`Item.baseUnit`), la eliminacion fisica se bloquea automaticamente y el sistema realiza una desactivacion logica (`isActive = false`), preservando la integridad historica del inventario.
- **Auto-registro:** Al registrar o actualizar un insumo con una unidad no existente previamente, el sistema la incorpora de forma automatica al catalogo maestro con estado activo.

- **Ruta Base:** `/api/v1/measurement-units`
- **Entidades Vinculadas:** `MeasurementUnit`, `Item`

---

## 2. Endpoints

### 2.1 Listar Unidades de Medida
Obtiene el catalogo de unidades de medida ordenadas alfabeticamente por nombre. Incluye de forma dinamica el conteo de insumos vinculados (`itemsCount`).

- **Metodo:** `GET`
- **Ruta:** `/api/v1/measurement-units`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros Query
| Parametro | Tipo | Por Defecto | Descripcion |
|---|---|---|---|
| `includeInactive` | boolean | `false` | Si es `true`, incluye unidades inactivas. Util para la pantalla de administracion de unidades. |

**Ejemplo de Peticion:**
```http
GET /api/v1/measurement-units?includeInactive=false
```

#### Respuestas
**200 OK - Listado obtenido:**
```json
[
  {
    "id": "c1f7a012-3456-7890-abcd-ef1234567890",
    "code": "BOLSA",
    "name": "Bolsa",
    "description": "Bolsa (ej. Cemento 42.5 kg)",
    "isActive": true,
    "createdAt": "2026-11-09T23:05:00.000Z",
    "updatedAt": "2026-11-09T23:05:00.000Z",
    "itemsCount": 12
  },
  {
    "id": "d2e8b123-4567-8901-bcde-f23456789012",
    "code": "KG",
    "name": "Kilogramo",
    "description": "Unidad de masa en kilogramos",
    "isActive": true,
    "createdAt": "2026-11-09T23:05:00.000Z",
    "updatedAt": "2026-11-09T23:05:00.000Z",
    "itemsCount": 45
  },
  {
    "id": "e3f9c234-5678-9012-cdef-034567890123",
    "code": "UND",
    "name": "Unidad",
    "description": "Unidad de pieza o articulo individual",
    "isActive": true,
    "createdAt": "2026-11-09T23:05:00.000Z",
    "updatedAt": "2026-11-09T23:05:00.000Z",
    "itemsCount": 89
  }
]
```

---

### 2.2 Obtener Detalle de una Unidad de Medida
Consulta una unidad por su identificador UUID o por su codigo literal (`code`).

- **Metodo:** `GET`
- **Ruta:** `/api/v1/measurement-units/:id`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Respuestas
**200 OK:**
```json
{
  "id": "c1f7a012-3456-7890-abcd-ef1234567890",
  "code": "BOLSA",
  "name": "Bolsa",
  "description": "Bolsa (ej. Cemento 42.5 kg)",
  "isActive": true,
  "createdAt": "2026-11-09T23:05:00.000Z",
  "updatedAt": "2026-11-09T23:05:00.000Z",
  "itemsCount": 12
}
```

**404 Not Found:**
```json
{
  "statusCode": 404,
  "message": "Unidad de medida no encontrada",
  "error": "Not Found"
}
```

---

### 2.3 Crear Unidad de Medida
Crea una nueva unidad de medida en el catalogo maestro corporativo. El codigo se convierte automaticamente a mayusculas.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/measurement-units`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Cuerpo de la Peticion (`CreateMeasurementUnitDto`)
```json
{
  "code": "LITRO",
  "name": "Litro",
  "description": "Unidad de volumen para combustibles, aditivos y desmoldantes",
  "isActive": true
}
```

| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `code` | string | Si | Codigo unico de la unidad (max 30 caracteres). Se normaliza a mayusculas. |
| `name` | string | Si | Nombre descriptivo de la unidad (max 100 caracteres). Debe ser unico. |
| `description` | string | No | Descripcion tecnica o de uso (max 500 caracteres). |
| `isActive` | boolean | No | Estado activo (por defecto `true`). |

#### Respuestas
**201 Created:**
```json
{
  "id": "a9b8c7d6-1111-2222-3333-444455556666",
  "code": "LITRO",
  "name": "Litro",
  "description": "Unidad de volumen para combustibles, aditivos y desmoldantes",
  "isActive": true,
  "createdAt": "2026-11-09T23:15:00.000Z",
  "updatedAt": "2026-11-09T23:15:00.000Z"
}
```

**409 Conflict:**
```json
{
  "statusCode": 409,
  "message": "Ya existe una unidad de medida registrada con el codigo: LITRO",
  "error": "Conflict"
}
```

---

### 2.4 Actualizar Unidad de Medida
Actualiza el nombre, descripcion o estado activo/inactivo de una unidad.

- **Metodo:** `PATCH`
- **Ruta:** `/api/v1/measurement-units/:id`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Cuerpo de la Peticion (`UpdateMeasurementUnitDto`)
```json
{
  "name": "Litro Metrico",
  "description": "Unidad estandar de volumen de liquidos",
  "isActive": true
}
```

#### Respuestas
**200 OK:** Retorna el registro actualizado.

---

### 2.5 Eliminar o Desactivar Unidad de Medida
Elimina la unidad si no cuenta con insumos asociados; si ya tiene insumos vinculados en `Item.baseUnit`, se desactiva logicamente de forma automatica para proteger la consistencia de inventario.

- **Metodo:** `DELETE`
- **Ruta:** `/api/v1/measurement-units/:id`
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Respuestas
**200 OK - Desactivacion Logica (cuando tiene insumos asociados):**
```json
{
  "action": "DEACTIVATED",
  "message": "La unidad de medida tiene 12 insumo(s) asociado(s). Se ha desactivado logicamente para preservar la integridad del catalogo."
}
```

**200 OK - Eliminacion Fisica (cuando no tiene insumos):**
```json
{
  "action": "DELETED",
  "message": "Unidad de medida eliminada exitosamente."
}
```

---

## 3. Protocolo de Doble Confirmacion al Modificar `baseUnit` en Insumos

Al modificar la unidad base de un insumo existente (`PATCH /api/v1/items/:id`):

1. **Consulta Previa:**
   Al invocar `GET /api/v1/items/:id`, la respuesta incluye:
   ```json
   {
     "id": "item-uuid-cemento",
     "sku": "CEM-PORT-T1",
     "name": "Cemento Portland Tipo I",
     "baseUnit": "BOLSA",
     "hasTransactions": true,
     "transactionStats": {
       "stocksWithQtyCount": 2,
       "movementItemsCount": 15,
       "purchaseDetailsCount": 4,
       "transferItemsCount": 3
     }
   }
   ```
2. **Si `hasTransactions` es `false`:**
   El usuario puede cambiar `baseUnit` libremente sin confirmacion adicional.

3. **Si `hasTransactions` es `true` y el usuario altera `baseUnit`:**
   - Si se envia la peticion sin la bandera `confirmUnitChange: true`:
     El backend responde con `HTTP 400 Bad Request`:
     ```json
     {
       "statusCode": 400,
       "code": "REQUIRES_DOUBLE_CONFIRMATION",
       "message": "El insumo cuenta con existencias fisicas o movimientos historicos registrados. Modificar su unidad base requiere doble confirmacion explicita.",
       "details": {
         "stocksWithQtyCount": 2,
         "movementItemsCount": 15,
         "purchaseDetailsCount": 4,
         "transferItemsCount": 3
       }
     }
     ```
   - **Flujo en Frontend:**
     Al detectar `item.hasTransactions === true` y cambio en `baseUnit`, la interfaz muestra un dialogo modal de confirmacion advirtiendo que la unidad base alterara la dimension de los registros pasados.
   - Tras la aceptacion del usuario, el frontend envia el payload con:
     ```json
     {
       "baseUnit": "KG",
       "confirmUnitChange": true
     }
     ```
   - El backend autoriza la modificacion y actualiza el insumo con exito (`200 OK`).
