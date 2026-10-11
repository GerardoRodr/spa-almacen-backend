# Modulo 10 - Documentos Seguros y Evidencias (Documents & Storage)

## 1. Descripcion General
Este modulo proporciona almacenamiento seguro para evidencias fisicas, guias de remision, facturas SUNAT y actas de rotura/extravio de herramientas.

### Caracteristicas de Seguridad y Procesamiento:
- **Proteccion de Confidencialidad (`isConfidential`):**
  - Los documentos marcados como confidenciales (como facturas de proveedores con precios unitarios) son de acceso exclusivo para `ADMIN`.
  - Si un usuario con rol `WAREHOUSE_KEEPER` intenta descargar un archivo confidencial, el servidor responde `403 Forbidden`.
- **Pipeline de Optimizacion de Imagenes con Sharp:**
  - Las fotos capturadas desde smartphones en obra (formatos JPEG, PNG) se procesan y convierten automaticamente al formato optimizado WebP con calidad del 85% para reducir el consumo de datos moviles.
- **Validacion Estricta de Mime-Type:**
  - Tipos permitidos: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Tamano maximo por archivo: 10 MB para fotografias e imagenes, 15 MB para expedientes tecnicos y facturas PDF.

- **Ruta Base:** `/api/v1/documents`
- **Entidades Vinculadas:** `DocumentAttachment`, `Purchase`, `Transfer`, `Movement`, `ToolCustody`

---

## 2. Endpoints

### 2.1 Cargar Archivo o Evidencia Individual (Upload)
Permite subir un archivo binario y asociarlo opcionalmente a una compra, transferencia, movimiento o prestamo de herramienta.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/documents/upload`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: multipart/form-data`

#### Parametros Form-Data
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `file` | Binario (File) | Si | Archivo PDF (hasta 15MB) o imagen JPEG, PNG, WebP (hasta 10MB). |
| `purchaseId` | UUID | No | Vincular a factura de compra. |
| `transferId` | UUID | No | Vincular a guia de transferencia. |
| `movementId` | UUID | No | Vincular a salida de consumo o merma. |
| `custodyId` | UUID | No | Vincular a vale de custodia o acta de dano. |
| `proofType` | string (`DISPATCH` \| `RETURN`) | No | Tipo de evidencia operativa de custodia de herramientas. |
| `isConfidential` | boolean | No | Si es true, restringe descarga a solo administradores (por defecto: `false`, salvo en compras donde es `true` por defecto). |

**Ejemplo de Peticion:**
```bash
curl -X POST "http://localhost:3000/api/v1/documents/upload" \
  -H "Authorization: Bearer <token>" \
  -F "file=@guia_remision_obra.jpg;type=image/jpeg" \
  -F "transferId=transf-uuid-1" \
  -F "isConfidential=false"
```

#### Respuestas
**201 Created - Archivo subido y optimizado:**
```json
{
  "id": "doc-uuid-1",
  "originalName": "guia_remision_obra.jpg",
  "storedPath": "uploads/transfers/2026/09/transf-uuid-1-1784745600.webp",
  "mimeType": "image/webp",
  "fileSizeBytes": 184200,
  "isConfidential": false,
  "proofType": null,
  "transferId": "transf-uuid-1",
  "createdAt": "2026-09-23T12:30:00.000Z"
}
```

**400 Bad Request - Formato o tamano invalido:**
```json
{
  "statusCode": 400,
  "message": "Tipo de archivo no permitido. Solo se aceptan PDF (hasta 15MB) o imagenes JPEG, PNG y WebP (hasta 10MB)",
  "error": "Bad Request"
}
```

---

### 2.2 Cargar Multiples Archivos y Evidencias Simultaneas (Upload Multiple)
Permite subir hasta 10 archivos de forma paralela en una unica transaccion HTTP. Cada fotografia es procesada concurrentemente por Sharp hacia WebP (calidad 80%, maximo 1920x1080 px) y los PDFs son verificados contra cabecera magica.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/documents/upload-multiple`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: multipart/form-data`

#### Parametros Form-Data
| Campo | Tipo | Obligatorio | Descripcion |
|---|---|---|---|
| `files` | Array de Binarios (File[]) | Si | Hasta 10 archivos (PDF hasta 15MB o imagenes hasta 10MB c/u). |
| `purchaseId` | UUID | No | Vincular a factura de compra. |
| `transferId` | UUID | No | Vincular a guia de traslado. |
| `movementId` | UUID | No | Vincular a salida o merma. |
| `custodyId` | UUID | No | Vincular a vale de custodia. |
| `proofType` | string (`DISPATCH` \| `RETURN`) | No | Clasificacion de la evidencia (entrega o retorno de herramientas). |
| `isConfidential` | boolean | No | Marca de confidencialidad para administradores. |

**Ejemplo de Peticion:**
```bash
curl -X POST "http://localhost:3000/api/v1/documents/upload-multiple" \
  -H "Authorization: Bearer <token>" \
  -F "files=@factura.pdf;type=application/pdf" \
  -F "files=@voucher_banco.jpg;type=image/jpeg" \
  -F "purchaseId=pur-uuid-1"
```

#### Respuestas
**201 Created - Arreglo de documentos procesados:**
```json
[
  {
    "id": "doc-uuid-1",
    "originalName": "factura.pdf",
    "storedPath": "uploads/purchases/2026/10/pur-uuid-1-factura.pdf",
    "mimeType": "application/pdf",
    "fileSizeBytes": 450200,
    "isConfidential": true,
    "proofType": null,
    "purchaseId": "pur-uuid-1",
    "createdAt": "2026-10-11T09:30:00.000Z"
  },
  {
    "id": "doc-uuid-2",
    "originalName": "voucher_banco.jpg",
    "storedPath": "uploads/purchases/2026/10/pur-uuid-1-voucher.webp",
    "mimeType": "image/webp",
    "fileSizeBytes": 128400,
    "isConfidential": true,
    "proofType": null,
    "purchaseId": "pur-uuid-1",
    "createdAt": "2026-10-11T09:30:00.000Z"
  }
]
```

**400 Bad Request - Lote vacio o limite excedido:**
```json
{
  "statusCode": 400,
  "message": "Se permite un maximo de 10 archivos por carga",
  "error": "Bad Request"
}
```

---

### 2.3 Listar Documentos Registrados
Consulta el listado de documentos y evidencias adjuntas con filtros por entidad foranea y paginacion. Si el usuario tiene rol `WAREHOUSE_KEEPER`, el backend filtra de forma transparente los documentos marcados como confidenciales (`isConfidential = false`).

- **Metodo:** `GET`
- **Ruta:** `/api/v1/documents`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros Query (`DocumentFilterDto`)
| Parametro | Tipo | Por Defecto | Descripcion |
|---|---|---|---|
| `purchaseId` | UUID | opcional | Filtrar por factura de compra vinculada. |
| `transferId` | UUID | opcional | Filtrar por guia de traslado vinculada. |
| `movementId` | UUID | opcional | Filtrar por salida de consumo o merma. |
| `custodyId` | UUID | opcional | Filtrar por vale de custodia o acta de dano. |
| `proofType` | string (`DISPATCH` \| `RETURN`) | opcional | Filtrar por tipo de evidencia de custodia. |
| `page` | integer | `1` | Numero de pagina. |
| `limit` | integer | `20` | Cantidad de registros por pagina. |

#### Respuestas
**200 OK - Listado obtenido:**
```json
{
  "data": [
    {
      "id": "doc-uuid-1",
      "originalName": "guia_remision_obra.jpg",
      "storedPath": "uploads/transfers/2026/09/transf-uuid-1-1784745600.webp",
      "mimeType": "image/webp",
      "fileSizeBytes": 184200,
      "isConfidential": false,
      "purchaseId": null,
      "transferId": "transf-uuid-1",
      "movementId": null,
      "custodyId": null,
      "createdAt": "2026-09-23T12:30:00.000Z"
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

### 2.4 Descargar Archivo Binario
Descarga o transmite en flujo binario protegido el documento solicitado. Verifica permisos de confidencialidad antes de emitir los bytes.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/documents/:id/download` (o `GET /api/v1/documents/:id` sin cabecera JSON)
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` autorizado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros
- `id` (URL Path): UUID del documento adjunto.

#### Respuestas
**200 OK - Flujo binario retornado:**
- Cabeceras retornadas:
  - `Content-Type: image/webp` (o `application/pdf`)
  - `Content-Disposition: inline; filename="guia_remision_obra.jpg"`
  - `Content-Length: 184200`

**403 Forbidden - Intento de acceso a documento confidencial por almacenero:**
```json
{
  "statusCode": 403,
  "message": "Acceso denegado: El documento es confidencial y solo puede ser consultado por administradores",
  "error": "Forbidden"
}
```

---

### 2.5 Consultar Metadatos del Documento
Obtiene la ficha JSON de metadatos de un archivo adjunto sin transmitir el flujo binario.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/documents/:id`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` autorizado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Accept: application/json`

#### Respuestas
**200 OK - Metadatos JSON:**
```json
{
  "id": "doc-uuid-1",
  "originalName": "guia_remision_obra.jpg",
  "storedPath": "uploads/transfers/2026/09/transf-uuid-1-1784745600.webp",
  "mimeType": "image/webp",
  "fileSizeBytes": 184200,
  "isConfidential": false,
  "purchaseId": null,
  "transferId": "transf-uuid-1",
  "movementId": null,
  "custodyId": null,
  "createdAt": "2026-09-23T12:30:00.000Z"
}
```

---

### 2.6 Eliminar Documento Adjunto
Elimina el registro de la base de datos y borra el archivo fisico del almacenamiento en disco.

- **Metodo:** `DELETE`
- **Ruta:** `/api/v1/documents/:id`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Parametros
- `id` (URL Path): UUID del documento.

#### Respuestas
**200 OK - Documento eliminado:**
```json
{
  "id": "doc-uuid-1",
  "deleted": true
}
```
