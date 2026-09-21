### 1. Frontend: Angular 22 (SPA Web & Móvil Adaptativo)

El frontend está optimizado para dos contextos de uso diametralmente opuestos: la oficina técnica del arquitecto (pantallas grandes, análisis denso de datos y gráficos) y la caseta de obra (pantallas táctiles, registros rápidos y subida de fotos).

* **Núcleo del Framework:** **Angular 22**
* **Arquitectura Standalone:** Eliminación total de `NgModule` en favor de componentes, directivas y pipes independientes para un empaquetado (*tree-shaking*) óptimo.
* **Gestión de Estado:** **Angular Signals** (`signal`, `computed`, `effect`, `model`) como estándar reactivo primario para el estado de vistas, filtros de stock, almacén activo y reactividad local. RxJS se reserva exclusivamente para flujos asíncronos complejos (búsquedas con *debounce*, cancelaciones de peticiones HTTP).
* **Control Flow Nativo:** Uso de la sintaxis `@if`, `@for` y `@switch` para mayor rendimiento en el renderizado de tablas masivas de insumos.
* **Diseño e Interfaz de Usuario:**
  * **Tailwind CSS v4:** Para control granular de diseño responsivo, permitiendo vistas con zonas táctiles amplias (mínimo 48×48 px) en modo almacenero.
  * **Componentes Base:** **Angular Material** o **PrimeNG** (utilizados de forma modular para diálogos modales, selectores de fecha y autocompletados con virtual scroll para listas extensas de insumos).
  * **Iconografía:** **Lucide Angular** (iconos limpios y ligeros para acciones de almacén, herramientas y comprobantes).
* **Visualización de Datos y Métricas:**
  * **Chart.js** con `ng2-charts`: Gráficos de barras (comparativa presupuesto S10 vs. gasto real consumido), líneas temporales de compras y gráficos de distribución de inventario por almacén.
* **Generación de Documentos en Cliente:**
  * **`exceljs`:** Exportación del reporte de *Gap Analysis* (requerimientos faltantes) respetando estilos, anchos de columna y fórmulas de suma.
  * **`jspdf` + `jspdf-autotable`:** Emisión vectorial instantánea de fichas de compra y vales de entrega para firma de operarios directamente en obra.

---

### 2. Backend: NestJS 12+ (API REST Modular en ESM Puro)

El backend implementa un monolito modular con arquitectura orientada a dominios (DDD simplificado) ejecutándose en **ECMAScript Modules (ESM puro)** nativo, garantizando separación estricta entre transacciones de inventario, finanzas y control de accesos.

* **Entorno de Ejecución:** **Node.js 22 LTS / Node.js 24** (motor V8 optimizado para operaciones de E/S asíncronas).
* **Framework Principal:** **NestJS 12+** configurado con `"type": "module"`.
* **Directrices Técnicas de ESM para Desarrollo y Agentes:**
  * **Imports Relativos Obligatorios con `.js`:** Bajo TypeScript con `"moduleResolution": "NodeNext"`, todas las importaciones locales relativas deben incluir la extensión `.js` de forma obligatoria (ej: `import { ItemService } from './item.service.js';`).
  * **Prohibición de Variables CJS Globales:** No utilizar `__dirname` ni `__filename`. Usar la API estándar `import.meta.dirname` para resolución de directorios y rutas de uploads.
  * **Configuración del Proyecto:**
    * `package.json`: `"type": "module"`.
    * `tsconfig.json`: `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"target": "ES2023"`.
* **Seguridad y Autenticación:**
  * **`@nestjs/passport` + `passport-jwt`:** Autenticación sin estado (Stateless) mediante JSON Web Tokens (Access Token de 15 min + Refresh Token de 7 días).
  * **`bcrypt`:** Hashing criptográfico de contraseñas de almaceneros y administradores.
  * **Guards Personalizados:** `RolesGuard` para control de acceso RBAC y `WarehouseAccessGuard` para impedir que un almacenero altere registros de una obra a la que no está asignado en `UserWarehouse`.
  * **`helmet` + `@nestjs/throttler`:** Protección de cabeceras HTTP y limitación de tasa de peticiones (Rate Limiting) para prevenir ataques de fuerza bruta.
* **Validación y Serialización:**
  * **`class-validator` + `class-transformer`:** Sanitización automática de payloads en DTOs. Ocultación automática de costos en respuestas dirigidas a roles de almacenero mediante interceptores de serialización (`ClassSerializerInterceptor` y filtros personalizados).
* **Procesamiento de Archivos y Optimización Multimedia:**
  * **Multer:** Interceptor de formularios multipart para subida de facturas, guías y evidencias.
  * **`sharp`:** Pipeline de compresión de imágenes. Redimensiona fotos tomadas en campo a un máximo de 1080p, convierte a formato `.webp` con calidad 80% y reduce archivos de 12 MB a menos de 350 KB antes de escribir en disco.
* **Motor de Importación de S10:**
  * **`csv-parser` / `papaparse`:** Procesamiento por streams de archivos CSV delimitados por comas o punto y coma, con soporte de codificaciones `Windows-1252` y `UTF-8`, permitiendo procesar presupuestos de miles de líneas sin desbordar la memoria RAM del VPS.
* **Documentación de API:**
  * **`@nestjs/swagger`:** Generación automática de especificación OpenAPI 3 para prueba y tipado de endpoints.

---

### 3. Persistencia de Datos: PostgreSQL 16+ y Prisma ORM v6

* **Motor de Base de Datos:** **PostgreSQL 16+**
  * Cumplimiento ACID total, indispensable para evitar inconsistencias en reservas concurrentes de stock.
  * Tipos de datos exactos: Campos monetarios y cantidades físicas modelados estrictamente como `DECIMAL(14, 4)` y `DECIMAL(12, 4)` para evitar errores de redondeo de punto flotante.
  * Índices B-Tree optimizados en `(warehouseId, itemId)`, `sku`, `transferNumber` y `s10RawName` para garantizar consultas de stock en menos de 10 ms.
* **Capa de Mapeo Objeto-Relacional:** **Prisma ORM v6**
  * Esquema declarativo (`schema.prisma`) con tipado estático autogenerado para TypeScript.
  * **Transacciones Atómicas (`prisma.$transaction`):** Utilizadas de forma obligatoria en:
    1. Ingreso de compras y recálculo del Costo Promedio Ponderado (CPP).
    2. Reserva lógica de stock frente a requerimientos del S10.
    3. Transferencias operativas de dos fases (despacho y recepción con discrepancia y merma).
    4. Salidas por consumo en obra y vales de custodia de herramientas.
* **Prisma Migrations:** Control de versiones formal de la base de datos aplicable mediante pipelines automatizados.

---

### 4. Infraestructura, Despliegue y Servidor Web (VPS KVM 2)

Especificaciones de hardware: 2 vCPU, 4 GB RAM, 100 GB SSD NVMe.

* **Sistema Operativo:** **Ubuntu 24.04 LTS** (soporte a largo plazo y estabilidad de paquetes).
* **Contenedores y Orquestación:** **Docker & Docker Compose**
  * Contenedor 1: `postgres:16-alpine` (base de datos aislada con volumen persistente en SSD).
  * Contenedor 2: `almacen-api` (imagen optimizada de NestJS en multi-stage build, tamaño final menor a 150 MB).
* **Servidor Web Frontal y Reverse Proxy:** **Nginx**
  * Terminación SSL/TLS automatizada con **Certbot (Let's Encrypt)** con renovación programada.
  * Proxy reverso hacia `localhost:3000` para las rutas de la API (`/api/v1/*`).
  * **Entrega Segura de Documentos:**
    * Los comprobantes con datos financieros confidenciales (facturas de compra) se sirven a través del endpoint autenticado `GET /api/v1/documents/:id/download`, validando permisos de rol `ADMIN` (streaming directo o vía cabecera `X-Accel-Redirect`), evitando que almaceneros accedan a costos mediante URLs públicas.
    * Las guías de remisión física y fotos operativas de herramientas pueden ser servidas para los usuarios autenticados autorizados en su respectivo almacén.
* **Automatización de Mantenimiento y Respaldos:**
  * **Script Cron Diario:** Ejecuta `pg_dump`, comprime en `.tar.gz`, purga respaldos locales que superen los 7 días de antigüedad (para no saturar los 100 GB del disco) y ofrece un botón de descarga directa en 1 clic en la vista de administración del ERP.

---

### 5. Resumen de Dependencias Críticas

| Capa | Herramienta / Paquete | Propósito Central en el Proyecto |
| --- | --- | --- |
| **Frontend** | `@angular/core` (v22) | SPA reactiva principal basada en Standalone Components y Signals. |
| **Frontend** | `tailwindcss` | Estilos responsivos con botones táctiles de 48px para campo. |
| **Frontend** | `exceljs` & `jspdf` | Descarga de estimaciones S10 y vales de entrega en campo. |
| **Frontend** | `chart.js` & `ng2-charts` | Gráficos ejecutivos para el arquitecto (consumo vs presupuesto). |
| **Frontend** | `lucide-angular` | Iconografía vectorizada ligera para acciones operativas. |
| **Backend** | `@nestjs/core` (v12+ ESM) | Monolito modular en TypeScript con ECMAScript Modules puro. |
| **Backend** | `@prisma/client` (v6) | Cliente de base de datos tipado con soporte de transacciones ACID. |
| **Backend** | `sharp` | Compresión de facturas e imágenes de obra a WebP al 80%. |
| **Backend** | `csv-parser` / `papaparse` | Procesador por streams para el archivo de cotización de S10 (detecta `;` / `,`). |
| **Backend** | `passport-jwt` | Gestión de sesiones seguras y control de accesos RBAC. |
| **Base de Datos** | `PostgreSQL 16` | Almacenamiento relacional de alta consistencia transaccional. |
| **Servidor/Proxy** | `Nginx` | Reverse proxy con SSL y entrega segura de archivos adjuntos. |