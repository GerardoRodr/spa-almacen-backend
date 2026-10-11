# Modulo 12 - Maquinaria Pesada y Control de Horometros (Machinery & Shifts)

## 1. Descripcion General
Este modulo controla la operacion, control de jornadas y registro de horometros de activos categorizados como `MACHINERY` (retroexcavadoras, rodillos compactadores, cargadores frontales, motoniveladoras, etc.) que operan en almacenes centrales y frentes de obra civil.

### Reglas Clave y Control de Horometros:
- **Clasificacion de Activos:** Unicamente los items con `ItemType` igual a `MACHINERY` son admitidos en este modulo. Se rechazan consumibles, equipos menores o herramientas.
- **Unicidad de Jornada Abierta:** Una maquina no puede registrar multiples turnos simultaneos en paralelo. Si existe una jornada previa con `endDateTime == null`, se deniega una nueva apertura hasta cerrar la anterior.
- **Validacion de Consistencia de Horometro:**
  - El horometro inicial (`startHourMeter`) de un nuevo turno debe ser mayor o igual al ultimo horometro final (`endHourMeter`) registrado en la jornada inmediatamente anterior de esa maquina.
  - El horometro final (`endHourMeter`) debe ser mayor o igual al horometro inicial (`startHourMeter`).
- **Calculo Automatico de Horas Trabajadas:** Al sellar el cierre de jornada, el sistema calcula de forma inmutable:
  ```
  totalHours = endHourMeter - startHourMeter
  ```
- **Evidencias Fotograficas Obligatorias:**
  - `startPhotoId`: Fotografia obligatoria de la esfera o pantalla del horometro al iniciar la jornada.
  - `endPhotoId`: Fotografia obligatoria del horometro al finalizar el trabajo diario.
  - `fuelPhotoId`: Fotografia opcional del comprobante de despacho o medidor de combustible.
- **Segregacion por Rol (RBAC):**
  - `ADMIN`: Consulta y opera sobre maquinarias de cualquier almacen de la empresa.
  - `WAREHOUSE_KEEPER`: Restringido exclusivamente a registrar y consultar turnos de los almacenes u obras que tiene asignados en `UserWarehouse`.

- **Ruta Base:** `/api/v1/machinery`
- **Entidades Vinculadas:** `MachineryShiftLog`, `Item`, `Warehouse`, `DocumentAttachment`

---

## 2. Endpoints

### 2.1 Iniciar Jornada de Maquinaria (`POST /shift/start`)
Registra la apertura del turno diario de un equipo pesado con el horometro inicial y fotografia obligatoria.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/machinery/shift/start`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Request Body (`StartMachineryShiftDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `itemId` | UUID | Si | Identificador de la maquinaria (`ItemType.MACHINERY`). |
| `warehouseId` | UUID | Si | Almacen u obra civil donde opera el equipo. |
| `operatorName` | string | Si | Nombre completo del operador. |
| `operatorDni` | string (8 digitos) | Si | DNI del operador de maquinaria. |
| `startHourMeter` | number (DECIMAL 10,2) | Si | Lectura inicial del horometro (ej. `1250.50`). |
| `startPhotoId` | UUID | Si | Identificador del adjunto de la foto cargada en `/documents/upload`. |
| `notes` | string | No | Observaciones iniciales (estado del equipo, fluidos, etc.). |

**Ejemplo de Peticion:**
```json
{
  "itemId": "e0000000-0000-4000-8000-000000000016",
  "warehouseId": "b0000000-0000-4000-8000-000000000002",
  "operatorName": "Carlos Alberto Huaman",
  "operatorDni": "45678912",
  "startHourMeter": 1250.5,
  "startPhotoId": "f0000000-0000-4000-8000-000000000001",
  "notes": "Niveles de aceite y refrigerante conformes antes del encendido"
}
```

#### Respuestas
**201 Created - Jornada iniciada:**
```json
{
  "id": "shift-uuid-1",
  "itemId": "e0000000-0000-4000-8000-000000000016",
  "warehouseId": "b0000000-0000-4000-8000-000000000002",
  "operatorName": "Carlos Alberto Huaman",
  "operatorDni": "45678912",
  "startHourMeter": "1250.50",
  "endHourMeter": null,
  "totalHours": null,
  "startDateTime": "2026-10-11T08:00:00.000Z",
  "endDateTime": null,
  "startPhotoId": "f0000000-0000-4000-8000-000000000001",
  "endPhotoId": null,
  "fuelPhotoId": null,
  "notes": "Niveles de aceite y refrigerante conformes antes del encendido",
  "item": {
    "id": "e0000000-0000-4000-8000-000000000016",
    "sku": "MAQ-RET-001",
    "name": "Retroexcavadora sobre Orugas CAT 420F2",
    "baseUnit": "UNIDAD",
    "type": "MACHINERY"
  },
  "warehouse": {
    "id": "b0000000-0000-4000-8000-000000000002",
    "name": "Almacen Obra San Isidro",
    "type": "PROJECT_SITE"
  },
  "startPhoto": {
    "id": "f0000000-0000-4000-8000-000000000001",
    "originalName": "horometro_apertura.jpg",
    "storedPath": "general/2026/10/horometro_apertura.webp",
    "mimeType": "image/webp",
    "fileSizeBytes": 112500
  },
  "endPhoto": null,
  "fuelPhoto": null
}
```

---

### 2.2 Finalizar Jornada de Maquinaria (`POST /shift/:id/end`)
Registra el cierre del turno, calcula las horas trabajadas y asienta las fotos de horometro final y combustible.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/machinery/shift/:id/end`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Parametros
- `id` (URL Path): UUID de la jornada iniciada.

#### Request Body (`EndMachineryShiftDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `endHourMeter` | number (DECIMAL 10,2) | Si | Lectura final del horometro (`>= startHourMeter`). |
| `endPhotoId` | UUID | Si | Identificador de la foto del horometro final. |
| `fuelPhotoId` | UUID | No | Foto opcional del voucher o medidor de combustible. |
| `notes` | string | No | Observaciones de cierre, incidencias mecanicas o rendimiento. |

**Ejemplo de Peticion:**
```json
{
  "endHourMeter": 1258.75,
  "endPhotoId": "f0000000-0000-4000-8000-000000000002",
  "fuelPhotoId": "f0000000-0000-4000-8000-000000000003",
  "notes": "Zanja de alcantarillado completada. Abastecido con 25 galones de diesel D2."
}
```

#### Respuestas
**200 OK - Jornada cerrada:**
```json
{
  "id": "shift-uuid-1",
  "itemId": "e0000000-0000-4000-8000-000000000016",
  "warehouseId": "b0000000-0000-4000-8000-000000000002",
  "operatorName": "Carlos Alberto Huaman",
  "operatorDni": "45678912",
  "startHourMeter": "1250.50",
  "endHourMeter": "1258.75",
  "totalHours": "8.25",
  "startDateTime": "2026-10-11T08:00:00.000Z",
  "endDateTime": "2026-10-11T17:15:00.000Z",
  "startPhotoId": "f0000000-0000-4000-8000-000000000001",
  "endPhotoId": "f0000000-0000-4000-8000-000000000002",
  "fuelPhotoId": "f0000000-0000-4000-8000-000000000003",
  "notes": "Niveles conformes | Cierre: Zanja completada. Abastecido con 25 galones diesel",
  "startPhoto": {
    "id": "f0000000-0000-4000-8000-000000000001",
    "originalName": "horometro_apertura.jpg",
    "storedPath": "general/2026/10/horometro_apertura.webp"
  },
  "endPhoto": {
    "id": "f0000000-0000-4000-8000-000000000002",
    "originalName": "horometro_cierre.jpg",
    "storedPath": "general/2026/10/horometro_cierre.webp"
  },
  "fuelPhoto": {
    "id": "f0000000-0000-4000-8000-000000000003",
    "originalName": "comprobante_combustible.jpg",
    "storedPath": "general/2026/10/comprobante_combustible.webp"
  }
}
```

---

### 2.3 Listar Historial de Jornadas (`GET /shifts`)
Consulta jornadas con filtros combinados y paginacion.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/machinery/shifts`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros Query (`MachineryShiftFilterDto`)
| Parametro | Tipo | Por Defecto | Descripcion |
|---|---|---|---|
| `itemId` | UUID | opcional | Filtrar por maquinaria especifica. |
| `warehouseId` | UUID | opcional | Filtrar por almacen u obra. |
| `operatorDni` | string | opcional | Filtrar por DNI del operador. |
| `onlyOpen` | boolean | opcional | Si es true, retorna solo turnos en marcha (`endDateTime == null`). |
| `startDate` | ISO Date | opcional | Fecha minima de apertura de turno. |
| `endDate` | ISO Date | opcional | Fecha maxima de apertura de turno. |
| `page` | integer | `1` | Numero de pagina. |
| `limit` | integer | `20` | Cantidad de registros por pagina. |

---

### 2.4 Consultar Detalle de Jornada (`GET /shifts/:id`)
Obtiene la ficha individual completa de un turno de maquinaria con sus fotos enriquecidas.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/machinery/shifts/:id`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` asignado)

---

### 2.5 Consultar Estado Operativo de Maquinaria (`GET /item/:itemId/status`)
Permite a las interfaces moviles verificar si una maquinaria se encuentra actualmente en operacion y recuperar el ultimo horometro registrado para precargar formularios de apertura.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/machinery/item/:itemId/status`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)

#### Respuestas
**200 OK - Estado obtenido:**
```json
{
  "itemId": "e0000000-0000-4000-8000-000000000016",
  "sku": "MAQ-RET-001",
  "name": "Retroexcavadora sobre Orugas CAT 420F2",
  "hasActiveShift": false,
  "activeShift": null,
  "lastHourMeter": 1258.75,
  "lastShiftEndDateTime": "2026-10-11T17:15:00.000Z"
}
```
