# Documentacion Tecnica de Modulos API - ERP Almacen

Este directorio contiene la especificacion tecnica, contratos de interfaz y ejemplos de consumo de los modulos del sistema backend para el ERP de Gestion de Almacen y Control de Obras.

Esta guia esta dirigida a los desarrolladores de frontend (Angular 22), integradores y evaluadores de API.

---

## 1. Convenciones Globales

### 1.1 Base URL y Prefijo de Versionado
Todos los endpoints de la API se exponen bajo el prefijo global:
```http
http://localhost:3000/api/v1
```
En ambientes de produccion o staging, sustituir `http://localhost:3000` por el dominio o IP correspondiente.

### 1.2 Documentacion Interactiva Swagger
La aplicacion expone documentacion OpenAPI / Swagger UI en:
```http
http://localhost:3000/api/docs
```
Nota: La politica de seguridad CSP de Helmet se encuentra configurada en modo permisivo para `/api/docs` para permitir la renderizacion fluida de estilos y scripts de Swagger.

### 1.3 Cabeceras Estandar de Peticion

| Cabecera | Obligatoria | Descripcion |
|---|---|---|
| `Content-Type` | Si (en POST, PUT, PATCH) | Debe ser siempre `application/json` (o `multipart/form-data` para carga de archivos). |
| `Authorization` | Si (rutas protegidas) | Formato: `Bearer <token_jwt>`. Contiene el Access Token emitido por el endpoint de login. |
| `x-warehouse-id` | Condicional | Identificador UUID del almacen sobre el cual se realiza la operacion en caseta de obra. Requerido o evaluado por `WarehouseAccessGuard`. |

---

## 2. Matriz de Control de Acceso Basado en Roles (RBAC)

El sistema implementa dos roles principales:

1. `ADMIN`: Control corporativo total. Acceso a todos los almacenes, catalogo maestro, creacion de usuarios, asignacion de almacenes y visualizacion sin restricciones de costos financieros y precios de compra.
2. `WAREHOUSE_KEEPER`: Operador de almacen o caseta de obra. Restringido estrictamente a los almacenes que tiene asignados en su perfil (`UserWarehouse`). Tiene bloqueo automatico de campos financieros mediante `CostMaskingInterceptor`.

### Comportamiento del Interceptor de Costos (`CostMaskingInterceptor`)
Para los usuarios con rol `WAREHOUSE_KEEPER`, el interceptor elimina recursivamente en las respuestas JSON los siguientes campos sensibles:
- `averageCost`
- `unitPriceOriginal`
- `unitCostBasePEN`
- `subtotalPEN`
- `igvAmountPEN`
- `totalAmountPEN`
- `unitCostSnapshot`
- `totalCostSnapshot`

Para el usuario con rol `ADMIN`, todos estos campos se entregan con sus valores numericos decimales correspondientes.

---

## 3. Formato Estandar de Respuestas y Errores

### 3.1 Respuesta Exitosa Directa
Las respuestas exitosas retornan el recurso directamente con codigo HTTP `200 OK` o `201 Created`.

Ejemplo:
```json
{
  "id": "11111111-1111-1111-1111-111111111111",
  "name": "Almacen Central Lima",
  "type": "CENTRAL",
  "isTemporary": false,
  "isActive": true
}
```

### 3.2 Respuestas de Error
Los errores siguen el formato estandar de excepciones de NestJS:

```json
{
  "statusCode": 400,
  "message": [
    "El correo electronico no es valido",
    "La contrasena debe contener al menos 6 caracteres"
  ],
  "error": "Bad Request"
}
```

Codigos HTTP comunes:
- `400 Bad Request`: Error de validacion de DTOs o argumentos invalidos.
- `401 Unauthorized`: Token no proporcionado, invalido, expirado o credenciales incorrectas.
- `403 Forbidden`: El rol no tiene privilegios para este recurso o el usuario no tiene acceso al almacen solicitado.
- `404 Not Found`: Recurso no encontrado.
- `409 Conflict`: Conflicto de unicidad (ej. correo duplicado, SKU duplicado, nombre de almacen repetido).

---

## 4. Indice de Modulos

### Modulos Implementados (Fases 1, 2, 3, 4, 5 y 6)
1. [01 - Autenticacion](01_auth.md): Inicio de sesion, renovacion de tokens (Refresh Token) y perfil en sesion.
2. [02 - Usuarios y RBAC](02_users.md): Administracion de usuarios, asignacion de almacenes y cambio de estado.
3. [03 - Almacenes y Stock](03_warehouses.md): Gestion de almacenes Central y Obra, stock en tiempo real y alertas minimas.
4. [04 - Catalogo de Items y Alias S10](04_items.md): Catalogo maestro, consumibles, herramientas, stock consolidado y homologacion S10.
5. [05 - Proveedores y Compras](05_purchases_suppliers.md): Registro de proveedores con RUC de 11 digitos, facturas bimoneda con IGV y recalculo ponderado de CPP (WAC).
6. [06 - Transferencias Operativas](06_transfers.md): Despacho en dos fases, transito, recepcion en caseta y mermas en transporte.
7. [07 - Movimientos de Inventario y Kardex](07_movements_kardex.md): Vales de salida a cuadrillas, mermas y kardex inmutable.
8. [08 - Custodia de Herramientas](08_tool_custody.md): Prestamo temporal a operarios por DNI, control de caseta vs campo, devolucion y bajas patrimoniales.

### Modulos en Especificacion y Diseno (Fases 7, 8 y 9)
9. [09 - Proyectos y Presupuestos S10](09_projects_s10.md): Carga de archivos S10, presupuesto de obra y matriz de brechas.
10. [10 - Documentos y Evidencias](10_documents.md): Subida y visualizacion segura de facturas, guias y remisiones.
11. [11 - Administracion y Mantenimiento](11_admin_maintenance.md): Copias de seguridad de PostgreSQL, metricas de salud y auditoria.
