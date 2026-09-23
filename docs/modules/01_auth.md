# Modulo 01 - Autenticacion (Auth)

## 1. Descripcion General
El modulo de autenticacion gestiona la validacion de credenciales, emision y rotacion de tokens JWT (JSON Web Tokens), y la recuperacion de la sesion del usuario activo.

- **Ruta Base:** `/api/v1/auth`
- **Entidades Vinculadas:** `User`, `UserWarehouse`, `Warehouse`
- **Estrategia de Tokens:**
  - `Access Token`: Validez de corta duracion (15 minutos por defecto). Utilizado en la cabecera `Authorization: Bearer <token>` para consumir recursos protegidos.
  - `Refresh Token`: Validez extendida (7 dias por defecto). Utilizado para emitir un nuevo par de tokens sin requerir reingreso de contrasena.

---

## 2. Endpoints

### 2.1 Iniciar Sesion (Login)
Valida las credenciales del usuario y retorna los tokens de sesion junto con el perfil basico y los almacenes a los que tiene acceso permitido.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/auth/login`
- **Acceso:** Publico (sin autenticacion requerida)
- **Cabeceras:**
  - `Content-Type: application/json`

#### Request Body (`LoginDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `email` | string | Si | Correo electronico corporativo registrado. |
| `password` | string | Si | Contrasena de acceso. |

**Ejemplo de Peticion:**
```json
{
  "email": "admin@almacen.com",
  "password": "AdminPassword123!"
}
```

#### Respuestas
**200 OK - Inicio de sesion exitoso:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJlbWFpbCI6ImFkbWluQGFsbWFjZW4uY29tIiwicm9sZSI6IkFETUlOIiwiaWF0IjoxNzg0NzQ1NjAwLCJleHAiOjE3ODQ3NDY1MDB9.signature",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJlbWFpbCI6ImFkbWluQGFsbWFjZW4uY29tIiwicm9sZSI6IkFETUlOIiwiaWF0IjoxNzg0NzQ1NjAwLCJleHAiOjE3ODUzNTA0MDB9.signature",
  "user": {
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "admin@almacen.com",
    "fullName": "Administrador Principal",
    "role": "ADMIN",
    "defaultWarehouseId": "22222222-2222-2222-2222-222222222222",
    "warehouses": [
      {
        "id": "22222222-2222-2222-2222-222222222222",
        "name": "Almacen Central Lima",
        "type": "CENTRAL",
        "isDefault": true
      }
    ]
  }
}
```

**400 Bad Request - Formato invalido:**
```json
{
  "statusCode": 400,
  "message": [
    "El correo electronico no tiene formato valido",
    "La contrasena no puede estar vacia"
  ],
  "error": "Bad Request"
}
```

**401 Unauthorized - Credenciales invalidas:**
```json
{
  "statusCode": 401,
  "message": "Credenciales de acceso incorrectas",
  "error": "Unauthorized"
}
```

---

### 2.2 Renovar Tokens (Refresh Token)
Permite obtener un nuevo par de `accessToken` y `refreshToken` utilizando un token de refresco valido y no expirado.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/auth/refresh`
- **Acceso:** Publico
- **Cabeceras:**
  - `Content-Type: application/json`

#### Request Body (`RefreshTokenDto`)
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `refreshToken` | string | Si | Token JWT de tipo refresh emitido previamente. |

**Ejemplo de Peticion:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Respuestas
**200 OK - Renovacion exitosa:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.nuevoAccessToken...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.nuevoRefreshToken..."
}
```

**401 Unauthorized - Token invalido o expirado:**
```json
{
  "statusCode": 401,
  "message": "Token de refresco invalido o expirado",
  "error": "Unauthorized"
}
```

---

### 2.3 Obtener Perfil en Sesion (Profile)
Obtiene los datos completos del usuario autenticado actual, incluyendo el listado de almacenes asignados y el almacen predeterminado.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/auth/profile`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros
No requiere parametros en URL ni cuerpo de peticion.

#### Respuestas
**200 OK - Perfil obtenido:**
```json
{
  "id": "33333333-3333-3333-3333-333333333333",
  "email": "almacenero@obra.com",
  "fullName": "Carlos Almacenero",
  "role": "WAREHOUSE_KEEPER",
  "isActive": true,
  "defaultWarehouseId": "44444444-4444-4444-4444-444444444444",
  "warehouses": [
    {
      "id": "44444444-4444-4444-4444-444444444444",
      "name": "Almacen Obra San Isidro",
      "type": "PROJECT_SITE",
      "isDefault": true
    }
  ]
}
```

**401 Unauthorized - Falta token o ha expirado:**
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```
