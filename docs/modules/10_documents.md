# Modulo 10 - Documentos Seguros y Evidencias (Documents & Storage)

## 1. Descripcion General
Este modulo proporciona almacenamiento seguro en disco local para evidencias fisicas, guias de remision, facturas SUNAT, actas de rotura/extravio de herramientas y archivos fuente de presupuestos S10.

### Caracteristicas de Seguridad y Procesamiento:
- **Proteccion de Confidencialidad (`isConfidential`):**
  - Los documentos marcados como confidenciales (como facturas de proveedores con precios unitarios) son accesibles para `ADMIN` y `MODERATOR`. Un usuario `WAREHOUSE_KEEPER` solo puede consultar o descargar adjuntos confidenciales vinculados a compras de sus almacenes asignados en `UserWarehouse`.
  - Si un `WAREHOUSE_KEEPER` intenta descargar un archivo confidencial sin autorizacion de sede o de otro modulo, el servidor responde `403 Forbidden`.
- **Pipeline de Optimizacion de Imagenes con Sharp:**
  - Las fotos capturadas desde smartphones en obra (formatos JPEG, PNG, WebP) se procesan, redimensionan hasta un maximo de `1920x1080` px (`fit: 'inside'`, sin ampliacion) y se convierten automaticamente al formato optimizado WebP con calidad del 80% para reducir el consumo de datos moviles y almacenamiento.
- **Validacion Estricta de Mime-Type y Cabecera Magica:**
  - Tipos permitidos en endpoints de evidencias: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Tamano maximo por archivo: 10 MB para fotografias e imagenes, 15 MB para expedientes tecnicos y facturas PDF (verificados contra cabecera `%PDF-`).
- **Almacenamiento Organizado y Proteccion contra Path Traversal:**
  - Los archivos se almacenan bajo el directorio configurado en la variable de entorno `UPLOAD_DIR` (por defecto `./uploads`), organizados por categoria y fecha (`purchases/YYYY/MM/`, `transfers/YYYY/MM/`, `movements/YYYY/MM/`, `custody/YYYY/MM/`, `general/YYYY/MM/`) y en el subdirectorio dedicado `s10/` para archivos de presupuesto S10 (`.csv`/`.txt`).
  - `StorageService.getAbsoluteFilePath` valida que toda ruta resuelta permanezca estrictamente dentro de `UPLOAD_DIR`.

- **Ruta Base:** `/api/v1/documents`
- **Entidades Vinculadas:** `DocumentAttachment`, `Purchase`, `Transfer`, `Movement`, `ToolCustody`, `Project`
- **Servicios Exportados:** `DocumentsService`, `StorageService` (exportados por `DocumentsModule` para consumo de `PurchasesModule` y `ProjectsModule`)

---

## 2. Endpoints

### 2.1 Cargar Archivo o Evidencia Individual (Upload)
Permite subir un archivo binario y asociarlo opcionalmente a una compra, transferencia, movimiento o prestamo de herramienta.

- **Metodo:** `POST`
- **Ruta:** `/api/v1/documents/upload`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
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
  "storedPath": "transfers/2026/09/uuid-generado.webp",
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
Permite subir hasta 10 archivos de forma paralela en una unica transaccion HTTP. Cada fotografia es procesada concurrentemente por Sharp hacia WebP (calidad 80%, maximo 1920x1080 px) y los PDFs son verificados contra cabecera magica (`%PDF-`).

- **Metodo:** `POST`
- **Ruta:** `/api/v1/documents/upload-multiple`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
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
    "storedPath": "purchases/2026/10/uuid-factura.pdf",
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
    "storedPath": "purchases/2026/10/uuid-voucher.webp",
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
Consulta el listado de documentos y evidencias adjuntas con filtros por entidad foranea y paginacion. Si el usuario tiene rol `WAREHOUSE_KEEPER`, el backend limita de forma transparente los resultados a documentos no confidenciales (`isConfidential = false`) o adjuntos vinculados a compras pertenecientes a sus almacenes autorizados en `UserWarehouse`.

- **Metodo:** `GET`
- **Ruta:** `/api/v1/documents`
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER`)
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
| `limit` | integer | `20` | Cantidad de registros por pagina (maximo `100`). |

#### Respuestas
**200 OK - Listado obtenido:**
```json
{
  "data": [
    {
      "id": "doc-uuid-1",
      "originalName": "guia_remision_obra.jpg",
      "storedPath": "transfers/2026/09/uuid-generado.webp",
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
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER` autorizado)
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
- **Acceso:** Protegido (`ADMIN`, `MODERATOR` o `WAREHOUSE_KEEPER` autorizado)
- **Cabeceras:**
  - `Authorization: Bearer <accessToken>`
  - `Accept: application/json`

#### Respuestas
**200 OK - Metadatos JSON:**
```json
{
  "id": "doc-uuid-1",
  "originalName": "guia_remision_obra.jpg",
  "storedPath": "transfers/2026/09/uuid-generado.webp",
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
- **Acceso:** Protegido (`ADMIN` o `MODERATOR`)
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

---

## 3. Servicios Internos Exportados y Almacenamiento Especializado

`DocumentsModule` exporta `DocumentsService` y `StorageService` para ofrecer operaciones especializadas de almacenamiento y control de integridad a otros modulos del ERP.

### 3.1 `DocumentsService.removePurchaseAttachment(purchaseId, attachmentId)`
Metodo de servicio invocado por el endpoint `DELETE /api/v1/purchases/:id/attachments/:attachmentId` (exclusivo `ADMIN`, ver Modulo 05) para garantizar aislamiento entre compras al eliminar evidencias.

- **Firma:** `removePurchaseAttachment(purchaseId: string, attachmentId: string)`
- **Logica Ejecutada:**
  1. Busca el registro `DocumentAttachment` por `attachmentId`.
  2. Valida que el registro exista y que pertenezca exactamente a la compra indicada (`doc.purchaseId === purchaseId`). En caso contrario, lanza `NotFoundException` (`404 Not Found`: `"Adjunto no encontrado para el comprobante de compra especificado"`).
  3. Elimina el archivo fisico en disco mediante `storageService.deleteFile(doc.storedPath)`.
  4. Elimina el registro en la tabla `DocumentAttachment`.
- **Retorno:**
```json
{
  "id": "doc-uuid-1",
  "purchaseId": "purch-uuid-1",
  "deleted": true
}
```

---

### 3.2 `StorageService.saveS10File(buffer, projectId, originalName?)`
Metodo de almacenamiento dedicado para persistir los archivos fuente de presupuestos S10 (`.csv` o `.txt`) subidos desde el modulo de proyectos (`ProjectsModule`).

- **Firma:** `saveS10File(buffer: Buffer, projectId: string, originalName?: string): Promise<SavedFileResult>`
- **Comportamiento y Reglas:**
  - **Ubicacion en Disco:** Guarda el archivo en el subdirectorio `s10/` dentro de `UPLOAD_DIR` (`config.uploads.dir`, por defecto `./uploads`), creando el directorio de forma recursiva si no existe.
  - **Normalizacion de Extension y MIME:** Evalua `path.extname(originalName || '').toLowerCase()`. Si es `.txt`, conserva extension `.txt` con `mimeType: "text/plain"`; en cualquier otro caso asigna extension `.csv` con `mimeType: "text/csv"`.
  - **Nomenclatura Segura:** Genera un nombre unico `s10-<projectId>-<uuid><ext>`, devolviendo como ruta relativa `storedPath = "s10/s10-<projectId>-<uuid><ext>"`.
  - **Retorno (`SavedFileResult`):**
```json
{
  "storedPath": "s10/s10-proj-uuid-1-8a9b7c6d-1234-4abc-9def-0123456789ab.csv",
  "mimeType": "text/csv",
  "fileSizeBytes": 42150
}
```
  - **Integracion:** La ruta resultante se persiste en la entidad `Project` (`s10FilePath`, `s10FileName`, `s10UploadedAt`) y puede descargarse posteriormente de forma segura via `StorageService.getFileStream(storedPath)`.
