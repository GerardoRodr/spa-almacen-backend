# SPA-ALMACEN-ERP - Backend API

Sistema backend para la gestion integral de inventarios, abastecimiento en tres etapas y control logistico de obras de construccion civil.

Desarrollado con **NestJS 12+** en arquitectura modular con soporte nativo de **ESM puro (NodeNext)**, base de datos relacional **PostgreSQL 16 en contenedor Docker**, persistencia mediante **Prisma ORM v6**, y validacion tipada con **Swagger / OpenAPI**.

---

## 1. Caracteristicas Principales del Sistema

- **Arquitectura Multi-Almacen y RBAC:**
  - Segregacion de permisos mediante roles de usuario: `ADMIN` (control corporativo) y `WAREHOUSE_KEEPER` (personal operativo de caseta de obra).
  - Vinculacion explicita de usuarios a almacenes autorizados con verificacion por guard (`WarehouseAccessGuard`).
- **Proteccion Financiera y Data Masking:**
  - Enmascaramiento automatico de precios de compra, costos promedios y valorizaciones hacia usuarios de obra mediante `CostMaskingInterceptor`.
- **Catalogo Maestro e Integracion con S10:**
  - Clasificacion entre materiales consumibles (`CONSUMABLE`) y herramientas o equipos patrimoniales (`ASSET_TOOL`).
  - Capa de homologacion de nombres crudos provenientes del software de presupuestos S10 (`ItemAlias`) con factores de conversion a unidades base.
- **Logistica de Abastecimiento en Tres Etapas:**
  1. Reserva logica en Almacen Central sobre la demanda del presupuesto de obra.
  2. Transferencia fisica en dos fases: despacho en origen (`IN_TRANSIT`) e inspeccion en caseta con registro de discrepancias y mermas.
  3. Salida por consumo definitivo entregada a capataces y cuadrillas en el frente de obra.
- **Kardex Inmutable (Append-Only):**
  - Registro de hechos fisicos consumados sin operaciones de actualizacion o borrado, conservando instantaneas congeladas de costo (`unitCostSnapshot`).
- **Motor Financiero de Costo Promedio Ponderado (CPP / WAC):**
  - Valorizacion en Soles (PEN) computable sobre la base imponible neta sin IGV (18%), conforme a la normativa tributaria y contable (NIC 2 / SUNAT).
- **Control de Custodia de Herramientas:**
  - Prestamos temporales vinculados al DNI y nombre del operario con evaluacion fisica de salida y retorno (`OPERATIVE`, `DAMAGED_USABLE`, `DAMAGED_UNUSABLE`, `LOST`).

---

## 2. Stack Tecnologico

| Componente | Tecnologia | Version / Detalle |
|---|---|---|
| **Entorno de Ejecucion** | Node.js | v22+ (ESM puro, `type: module`) |
| **Framework Backend** | NestJS | 12+ (TypeScript en modo `NodeNext`) |
| **Base de Datos** | PostgreSQL | 16 Alpine en contenedor Docker |
| **ORM / Persistencia** | Prisma ORM | v6.19+ |
| **Autenticacion** | Passport JWT | Access Token (15 min) + Refresh Token (7 dias) |
| **Encriptacion** | bcrypt | Hashing seguro de contrasenas |
| **Documentacion Viva** | Swagger / OpenAPI | UI interactiva en `/api/docs` |
| **Seguridad de Cabeceras** | Helmet + Throttler | CSP adaptada para Swagger y rate limiting |
| **Procesamiento de Imagenes** | Sharp | Pipeline WebP con compresion optimizada para obra |
| **Pruebas Unitarias** | Vitest | Suite de testing ultrarrapida |
| **Analisis Estatico** | Oxlint | Linter de alto rendimiento |

---

## 3. Estructura del Proyecto

```
spa-almacen-backend/
├── docker/                     # Configuracion de Dockerfile para PostgreSQL
├── docker-compose.yml          # Orquestacion de servicios locales (PostgreSQL)
├── docs/                       # Documentacion tecnica y funcional del proyecto
│   ├── business/               # Reglas de negocio, arquitectura y especificacion UI
│   │   ├── ARCHITECTURE.md     # Diseno de arquitectura tecnica y de datos
│   │   ├── BUSINESS_RULES.md   # Fuente unica de verdad de algoritmos y dominio
│   │   └── UI_SPECIFICATION.md # Diseno de pantallas y flujo de usuario
│   ├── modules/                # Especificacion de endpoints y contratos de la API
│   │   ├── README.md           # Indice central, cabeceras y matriz de roles
│   │   ├── 01_auth.md          # Autenticacion y renovacion de tokens
│   │   ├── 02_users.md         # Usuarios y asignacion multi-almacen
│   │   ├── 03_warehouses.md    # Almacenes, stock en tiempo real y alertas minimas
│   │   ├── 04_items.md         # Catalogo maestro, herramientas y alias S10
│   │   ├── 05_purchases_suppliers.md # Proveedores, compras y motor CPP
│   │   ├── 06_transfers.md     # Transferencias operativas en dos fases
│   │   ├── 07_movements_kardex.md    # Salidas a cuadrillas y Kardex inmutable
│   │   ├── 08_tool_custody.md  # Vales de prestamo de herramientas por DNI
│   │   ├── 09_projects_s10.md  # Presupuestos S10 y analisis de brechas
│   │   ├── 10_documents.md     # Documentos seguros y pipeline Sharp
│   │   └── 11_admin_maintenance.md   # Backups de base de datos y salud
│   └── todo.md                 # Roadmap y estado de ejecucion de fases
├── prisma/                     # Modelado de datos relacional
│   ├── schema.prisma           # 18 modelos y 8 enums de dominio
│   ├── seed.ts                 # Poblacion de datos iniciales
│   └── migrations/             # Historial de migraciones SQL
├── src/                        # Codigo fuente de la aplicacion
│   ├── common/                 # Decoradores, guards, interceptores y filtros
│   ├── config/                 # Validacion y carga de variables de entorno
│   ├── modules/                # Modulos desacoplados de dominio
│   ├── app.module.ts           # Modulo raiz
│   └── main.ts                 # Bootstrap de la aplicacion NestJS
└── test/                       # Pruebas de integracion y e2e
```

---

## 4. Instalacion y Puesta en Marcha Local

### 4.1 Requisitos Previos
- Node.js version 22 o superior instalado.
- Docker y Docker Compose instalados y en ejecucion.
- Gestor de paquetes `npm`.

### 4.2 Configuracion del Entorno
Clonar el repositorio y verificar la configuracion del archivo de variables de entorno `.env` en la raiz del proyecto:

```env
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/almacen_erp?schema=public"

JWT_SECRET="clave_secreta_super_segura_de_desarrollo_2026"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_SECRET="clave_refresh_secreta_super_segura_2026"
JWT_REFRESH_EXPIRES_IN="7d"

BCRYPT_SALT_ROUNDS=10
THROTTLE_TTL=60000
THROTTLE_LIMIT=100
STORAGE_UPLOAD_PATH="./uploads"
```

### 4.3 Iniciar la Base de Datos en Docker
Ejecutar el contenedor de PostgreSQL configurado para el proyecto:

```bash
docker compose up -d
```
El contenedor `almacen-postgres` se iniciara en el puerto `5432:5432` con volumen persistente `almacen_pgdata`.

### 4.4 Ejecutar Migraciones de Base de Datos
Aplicar el esquema de Prisma en la base de datos de desarrollo:

```bash
npx prisma migrate dev
```

### 4.5 Cargar Datos Iniciales (Seed)
Poblar los datos de prueba y administracion (Almacen Central, Administrador y Almacenero de prueba):

```bash
npx prisma db seed
```

Credenciales de prueba generadas por el seed:
- **Administrador:**
  - Correo: `admin@almacen.com`
  - Contrasena: `Admin1234!`
  - Rol: `ADMIN`
- **Almacenero:**
  - Correo: `almacenero@obra.com`
  - Contrasena: `Almacen1234!`
  - Rol: `WAREHOUSE_KEEPER`

### 4.6 Iniciar el Servidor de Desarrollo
```bash
npm run start:dev
```
La API estara disponible en:
- **Endpoints de la API:** `http://localhost:3000/api/v1`
- **Documentacion Swagger UI:** `http://localhost:3000/api/docs`

---

## 5. Comandos de Verificacion y Calidad de Codigo

| Comando | Descripcion |
|---|---|
| `npm run build` | Compila el proyecto con TypeScript en modo ESM NodeNext. |
| `npm run test` | Ejecuta la suite completa de pruebas unitarias con Vitest. |
| `npm run lint` | Ejecuta el analisis estatico de codigo con Oxlint. |
| `npx prisma studio` | Abre la consola visual de administracion de datos de Prisma en el navegador. |

---

## 6. Documentacion Detallada

Para consultar la especificacion completa del sistema, revisar los documentos ubicados en `docs/`:

- **[Documentacion Tecnica de Modulos (docs/modules)](docs/modules/README.md):** Guia de integracion de endpoints, headers requeridos, query params, DTOs y ejemplos de request/response en JSON.
- **[Reglas de Negocio Core (docs/business/BUSINESS_RULES.md)](docs/business/BUSINESS_RULES.md):** Algoritmo del CPP, ciclo de vida de herramientas y protocolo de abastecimiento en 3 etapas.
- **[Arquitectura de Software (docs/business/ARCHITECTURE.md)](docs/business/ARCHITECTURE.md):** Diagramas de arquitectura, flujo de datos y modelo de seguridad.
- **[Roadmap del Proyecto (docs/todo.md)](docs/todo.md):** Estado detallado de implementacion de cada paso.
