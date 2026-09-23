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
  - Tipos permitidos: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Tamano maximo por archivo: 10 MB.

- **Ruta Base:** `/api/v1/documents`
- **Entidades Vinculadas:** `DocumentAttachment`, `Purchase`, `Transfer`, `Movement`, `ToolCustody`

---

## 2. Endpoints

### 2.1 Cargar Archivo o Evidencia (Upload)
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
| `file` | Binario (File) | Si | Archivo PDF o imagen. |
| `purchaseId` | UUID | No | Vincular a factura de compra. |
| `transferId` | UUID | No | Vincular a guia de transferencia. |
| `movementId` | UUID | No | Vincular a salida de consumo o merma. |
| `custodyId` | UUID | No | Vincular a vale de custodia o acta de dano. |
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
  "transferId": "transf-uuid-1",
  "createdAt": "2026-09-23T12:30:00.000Z"
}
```

**400 Bad Request - Formato o tamano invalido:**
```json
{
  "statusCode": 400,
  "message": "Tipo de archivo no permitido. Solo se aceptan PDF, JPEG, PNG y WebP con tamano maximo de 10MB",
  "error": "Bad Request"
}
```

---

### 2.2 Descargar o Visualizar Documento
Descarga o transmite en flujo binario el documento solicitado. Verifica permisos de confidencialidad antes de emitir los bytes.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/documents/:id`
- **Acceso:** Protegido (`ADMIN` o `WAREHOUSE_KEEPER` autorizado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`

#### Parametros
- `id` (URL Path): UUID del documento adjunto.

#### Respuestas
**200 OK - Flujo binario retornado:**
- Cabeceras retornadas:
  - `Content-Type: image/webp` (o `application/pdf`)
  - `Content-Disposition: inline; filename="guia_remision_obra.webp"`

**403 Forbidden - Intento de acceso a documento confidencial por almacenero:**
```json
{
  "statusCode": 403,
  "message": "Acceso denegado: El documento es confidencial y solo puede ser consultado por administradores",
  "error": "Forbidden"
}
```

---

### 2.3 Eliminar Documento Adjunto
Elimina el registro de la base de datos y borra el archivo fisico del almacenamiento en disco.

- **Metodo:** `DELETE`
- **Ruta:** `/api/v1/documents/:id`
- **Acceso:** Protegido (`ADMIN`)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken_admin>`

#### Respuestas
**200 OK - Documento eliminado:**
```json
{
  "id": "doc-uuid-1",
  "deleted": true
}
```
