# Modulo 02 - Usuarios y Acceso Multi-Almacen (Users)

## 1. Descripcion General
El modulo de administracion de usuarios permite gestionar las cuentas del personal, roles de acceso (`ADMIN` y `WAREHOUSE_KEEPER`) y la vinculacion explicita a uno o varios almacenes fisicos mediante la entidad `UserWarehouse`.

- **Ruta Base:** `/api/v1/users`
- **Entidades Vinculadas:** `User`, `UserWarehouse`, `Warehouse`
- **Control de Acceso:** Todos los endpoints de este modulo requieren obligatoriamente rol de administrador (`ADMIN`).

---

## 2. Endpoints

### 2.1 Listar Todos los Usuarios
Retorna el catalogo completo de usuarios registrados en la plataforma junto con la relacion de almacenes a los que estan asignados.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/users`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Respuestas
**200 OK - Listado exitoso:**
```json
[
  {
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "admin@almacen.com",
    "fullName": "Administrador Principal",
    "role": "ADMIN",
    "isActive": true,
    "createdAt": "2026-09-20T22:55:00.000Z",
    "assignedWarehouses": [
      {
        "warehouseId": "22222222-2222-2222-2222-222222222222",
        "isDefault": true,
        "warehouse": {
          "id": "22222222-2222-2222-2222-222222222222",
          "name": "Almacen Central Lima",
          "type": "CENTRAL"
        }
      }
    ]
  },
  {
    "id": "33333333-3333-3333-3333-333333333333",
    "email": "almacenero@obra.com",
    "fullName": "Carlos Almacenero",
    "role": "WAREHOUSE_KEEPER",
    "isActive": true,
    "createdAt": "2026-09-21T08:30:00.000Z",
    "assignedWarehouses": [
      {
        "warehouseId": "44444444-4444-4444-4444-444444444444",
        "isDefault": true,
        "warehouse": {
          "id": "44444444-4444-4444-4444-444444444444",
          "name": "Almacen Obra San Isidro",
          "type": "PROJECT_SITE"
        }
      }
    ]
  }
]
```

---

### 2.2 Crear Nuevo Usuario
Registra un nuevo usuario en la base de datos con contrasena encriptada mediante algoritmo bcrypt y asignacion opcional inicial de almacenes.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/users`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Request Body (`CreateUserDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `email` | string | Si | Correo electronico unico del usuario. |
| `password` | string | Si | Contrasena inicial (minimo 6 caracteres). |
| `fullName` | string | Si | Nombres y apellidos completos. |
| `role` | `ADMIN` \| `WAREHOUSE_KEEPER` | No | Rol del sistema (por defecto: `WAREHOUSE_KEEPER`). |
| `isActive` | boolean | No | Estado de activacion de la cuenta (por defecto: `true`). |
| `warehouseIds` | string[] | No | Lista de identificadores UUID de almacenes autorizados. |
| `defaultWarehouseId` | string | No | UUID del almacen activo predeterminado. |

**Ejemplo de Peticion:**
```json
{
  "email": "juan.perez@constructora.com",
  "password": "PasswordObra2026!",
  "fullName": "Juan Perez Ramos",
  "role": "WAREHOUSE_KEEPER",
  "isActive": true,
  "warehouseIds": [
    "44444444-4444-4444-4444-444444444444"
  ],
  "defaultWarehouseId": "44444444-4444-4444-4444-444444444444"
}
```

#### Respuestas
**201 Created - Usuario creado:**
```json
{
  "id": "55555555-5555-5555-5555-555555555555",
  "email": "juan.perez@constructora.com",
  "fullName": "Juan Perez Ramos",
  "role": "WAREHOUSE_KEEPER",
  "isActive": true,
  "createdAt": "2026-09-23T12:00:00.000Z",
  "assignedWarehouses": [
    {
      "warehouseId": "44444444-4444-4444-4444-444444444444",
      "isDefault": true,
      "warehouse": {
        "id": "44444444-4444-4444-4444-444444444444",
        "name": "Almacen Obra San Isidro",
        "type": "PROJECT_SITE"
      }
    }
  ]
}
```

**409 Conflict - Correo electronico ya registrado:**
```json
{
  "statusCode": 409,
  "message": "El correo electronico ya se encuentra registrado",
  "error": "Conflict"
}
```

---

### 2.3 Obtener Detalle de Usuario por ID
Recupera el perfil de un usuario especifico identificado por su UUID.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/users/:id`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Parametros
- `id` (URL Path): UUID del usuario a consultar.

#### Respuestas
**200 OK - Usuario encontrado:**
```json
{
  "id": "33333333-3333-3333-3333-333333333333",
  "email": "almacenero@obra.com",
  "fullName": "Carlos Almacenero",
  "role": "WAREHOUSE_KEEPER",
  "isActive": true,
  "createdAt": "2026-09-21T08:30:00.000Z",
  "assignedWarehouses": [
    {
      "warehouseId": "44444444-4444-4444-4444-444444444444",
      "isDefault": true,
      "warehouse": {
        "id": "44444444-4444-4444-4444-444444444444",
        "name": "Almacen Obra San Isidro",
        "type": "PROJECT_SITE"
      }
    }
  ]
}
```

**404 Not Found - Usuario inexistente:**
```json
{
  "statusCode": 404,
  "message": "Usuario no encontrado",
  "error": "Not Found"
}
```

---

### 2.4 Actualizar Datos del Usuario
Permite modificar datos personales, rol o estado activo/inactivo de una cuenta.

- **Metodo:** `PUT`
- **Ruta:** `/api/v1/users/:id`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Parametros
- `id` (URL Path): UUID del usuario.

#### Request Body (`UpdateUserDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `email` | string | No | Nuevo correo electronico. |
| `password` | string | No | Nueva contrasena (minimo 6 caracteres). |
| `fullName` | string | No | Nombres y apellidos actualizados. |
| `role` | `ADMIN` \| `WAREHOUSE_KEEPER` | No | Nuevo rol asignado. |
| `isActive` | boolean | No | Desactivar o reactivar acceso. |

**Ejemplo de Peticion:**
```json
{
  "fullName": "Carlos Almacenero Martinez",
  "isActive": true
}
```

#### Respuestas
**200 OK - Actualizacion exitosa:**
```json
{
  "id": "33333333-3333-3333-3333-333333333333",
  "email": "almacenero@obra.com",
  "fullName": "Carlos Almacenero Martinez",
  "role": "WAREHOUSE_KEEPER",
  "isActive": true,
  "updatedAt": "2026-09-23T12:05:00.000Z"
}
```

---

### 2.5 Asignar Almacenes a un Usuario
Reemplaza de forma atomica la lista de almacenes fisicos autorizados para el usuario especificado.

- **Metodo:** `PUT`
- **Ruta:** `/api/v1/users/:id/warehouses`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`
  - `Content-Type: application/json`

#### Parametros
- `id` (URL Path): UUID del usuario al que se asignan almacenes.

#### Request Body (`AssignWarehousesDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `warehouseIds` | string[] | Si | Arreglo de identificadores UUID de almacenes autorizados. No puede ser vacio. |
| `defaultWarehouseId` | string | No | UUID del almacen a establecer como activo predeterminado. Debe estar incluido en `warehouseIds`. |

**Ejemplo de Peticion:**
```json
{
  "warehouseIds": [
    "22222222-2222-2222-2222-222222222222",
    "44444444-4444-4444-4444-444444444444"
  ],
  "defaultWarehouseId": "22222222-2222-2222-2222-222222222222"
}
```

#### Respuestas
**200 OK - Asignacion exitosa:**
```json
{
  "id": "33333333-3333-3333-3333-333333333333",
  "email": "almacenero@obra.com",
  "fullName": "Carlos Almacenero Martinez",
  "role": "WAREHOUSE_KEEPER",
  "assignedWarehouses": [
    {
      "warehouseId": "22222222-2222-2222-2222-222222222222",
      "isDefault": true,
      "warehouse": {
        "id": "22222222-2222-2222-2222-222222222222",
        "name": "Almacen Central Lima",
        "type": "CENTRAL"
      }
    },
    {
      "warehouseId": "44444444-4444-4444-4444-444444444444",
      "isDefault": false,
      "warehouse": {
        "id": "44444444-4444-4444-4444-444444444444",
        "name": "Almacen Obra San Isidro",
        "type": "PROJECT_SITE"
      }
    }
  ]
}
```
