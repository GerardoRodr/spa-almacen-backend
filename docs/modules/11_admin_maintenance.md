# Modulo 11 - Administracion, Respaldo y Salud (Admin & Maintenance)

## 1. Descripcion General
Este modulo agrupa las utilidades de gobernanza del sistema, continuidad operativa y monitoreo del estado de los servicios:
- Endpoint de diagnostico de salud del sistema mediante `@nestjs/terminus` (conexion a PostgreSQL, espacio libre en disco, consumo de memoria Node.js).
- Generacion y gestion de copias de seguridad (backups SQL/dump) de la base de datos PostgreSQL alojada en el contenedor Docker.
- Mantenimiento programado y auditoria tecnica.

- **Ruta Base:** `/api/v1/admin` y `/api/v1/health`
- **Control de Acceso:** Restringido exclusivamente al rol `ADMIN`.

---

## 2. Endpoints

### 2.1 Monitoreo de Salud del Sistema (Health Check)
Verifica la disponibilidad de la base de datos PostgreSQL, espacio de almacenamiento disponible y estado de la memoria RAM del proceso.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/health`
- **Acceso:** Publico o con token de monitor
- **Cabeceras:** Ninguna requerida

#### Respuestas
**200 OK - Sistema saludable:**
```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up"
    },
    "storage": {
      "status": "up"
    },
    "memory": {
      "status": "up"
    }
  },
  "error": {},
  "details": {
    "database": {
      "status": "up"
    },
    "storage": {
      "status": "up"
    },
    "memory": {
      "status": "up"
    }
  }
}
```

---

### 2.2 Disparar Respaldo Manual de Base de Datos
Ejecuta la orden de extraccion `pg_dump` sobre la base de datos `almacen_erp` en el contenedor `almacen-postgres` (o vuelco de emergencia) y almacena el archivo comprimido `.dump` en la ruta segura de copias de seguridad.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/admin/backups` (alias `/api/v1/admin/backups/generate`)
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Respuestas
**201 Created - Respaldo generado:**
```json
{
  "backupId": "backup-2026-09-23T12-35-00.dump",
  "fileName": "almacen_erp_20260923_123500.dump",
  "sizeBytes": 2845920,
  "createdAt": "2026-09-23T12:35:00.000Z",
  "status": "COMPLETED"
}
```

---

### 2.3 Listar Copias de Seguridad Disponibles
Retorna el historial de archivos de backup existentes en el servidor ordenados por fecha descendente con su tamano en bytes y fecha de creacion.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/admin/backups`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Respuestas
**200 OK - Listado obtenido:**
```json
[
  {
    "fileName": "almacen_erp_20260923_123500.dump",
    "sizeBytes": 2845920,
    "createdAt": "2026-09-23T12:35:00.000Z"
  },
  {
    "fileName": "almacen_erp_20260922_000000.dump",
    "sizeBytes": 2798140,
    "createdAt": "2026-09-22T00:00:00.000Z"
  }
]
```

---

### 2.4 Descargar Copia de Seguridad
Descarga el archivo `.dump` binario para custodia off-site.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/admin/backups/:fileName` (alias `/api/v1/admin/backups/:fileName/download`)
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Parametros
- `fileName` (URL Path): Nombre del archivo (ej. `almacen_erp_20260923_123500.dump`).

#### Respuestas
**200 OK - Flujo binario retornado:**
- Cabeceras retornadas:
  - `Content-Type: application/octet-stream`
  - `Content-Disposition: attachment; filename="almacen_erp_20260923_123500.dump"`
  - `Content-Length: 2845920`

---

### 2.5 Eliminar Copia de Seguridad
Elimina un archivo de respaldo especifico del disco del servidor.

- **Metodo:** `DELETE`
- **Ruta:** `/api/v1/admin/backups/:fileName`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Parametros
- `fileName` (URL Path): Nombre del archivo a eliminar.

#### Respuestas
**200 OK - Copia eliminada:**
```json
{
  "fileName": "almacen_erp_20260923_123500.dump",
  "deleted": true
}
```

---

### 2.6 Respaldo Programado (Cron) y Politica de Retencion
El servicio incluye un cron job programado a las 02:00 UTC diario (`0 2 * * *`):
- Ejecuta el respaldo automatico comprimido con marca de tiempo.
- Aplica purga de archivos antiguos: elimina de forma automatica copias de seguridad con mas de 7 dias de antiguedad para preservar espacio en disco.
- Emite logs estructurados de auditoria del proceso de respaldo.

---

### 2.7 Suite de Pruebas E2E y Resiliencia
Para garantizar la estabilidad previa a produccion, el modulo integra:
- Pruebas E2E sobre flujos criticos de negocio (ciclo de compra con CPP, transferencias operativas en dos fases con mermas, custodia de herramientas con devolucion, salidas por consumo e ingesta S10).
- Verificacion de conexion a PostgreSQL y resiliencia ante reconexiones.
