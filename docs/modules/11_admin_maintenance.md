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
    "memory_heap": {
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
    "memory_heap": {
      "status": "up"
    }
  }
}
```

---

### 2.2 Disparar Respaldo Manual de Base de Datos
Ejecuta la orden de extraccion `pg_dump` sobre la base de datos `almacen_erp` en el contenedor `almacen-postgres` y almacena el archivo comprimido `.dump` en la ruta segura de copias de seguridad.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/admin/backups`
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
Retorna el historial de archivos de backup existentes en el servidor con su peso y fecha de creacion.

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
- **Ruta:** `/api/v1/admin/backups/:fileName`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Parametros
- `fileName` (URL Path): Nombre del archivo (ej. `almacen_erp_20260923_123500.dump`).
