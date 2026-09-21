# UI_SPECIFICATION.md — Especificacion de Interfaz de Usuario y Componentes (SPA-ALMACEN-ERP)

**Sistema:** SPA-ALMACEN-ERP  
**Version:** 2.0 (Consolidada y Definitiva)  
**Estado:** Fuente Unica de Verdad para UI/UX, Diseno Responsivo y Componentes Angular 22 (SSOT)

---

## 1. Filosofia de Diseno y Arquitectura de Experiencia (UX)

El sistema **SPA-ALMACEN-ERP** atiende dos realidades operativas radicalmente opuestas dentro de una empresa constructora:

```
┌─────────────────────────────────────────────────────────┐   ┌─────────────────────────────────────────────────────────┐
│        PERFIL 1: OFICINA TECNICA / ADMINISTRACION       │   │           PERFIL 2: CASETA DE ALMACEN DE OBRA           │
│   (Arquitecto, Residente General, Jefe de Logistica)    │   │               (Almacenero de Obra / Campo)              │
├─────────────────────────────────────────────────────────┤   ├─────────────────────────────────────────────────────────┤
│ • Dispositivos: PC de Escritorio / Laptop (1024px+)     │   │ • Dispositivos: Tablet / Smartphone / PC Caseta         │
│ • Contexto: Analisis denso, presupuestos, proyecciones   │   │ • Contexto: Rapidez en mostrador, polvo, luz de sol     │
│ • Datos: Costos, precios, IGV, CPP, proveedores y S10   │   │ • Datos: 100% CIEGO a costos, precios y facturas        │
│ • Foco: Decisiones estrategicas y control financiero    │   │ • Foco: Conteo fisico, firmas de capataces y fotos      │
└─────────────────────────────────────────────────────────┘   └─────────────────────────────────────────────────────────┘
```

### 1.1 Principios Rectores
1. **Segregacion Estricta RBAC en UI (Principio de Datos Ciegos):** Ningun componente, tabla o modal consumido por un `WAREHOUSE_KEEPER` contendra referencias, atributos ni texto vinculado a dinero (`averageCost`, `unitPrice`, `subtotal`, `total`). La informacion financiera no solo se oculta visualmente con CSS, sino que se remueve del arbol DOM con directivas estructurales (`@if` y `*appHasRole`).
2. **Contexto Multi-Almacen con Selector Reactivo:** Tanto en escritorio como en movil, la aplicacion opera bajo un "Almacen Activo". Para administradores, el selector permite alternar entre cualquier obra temporal o ver el "Consolidado Global". Para almaceneros, el selector restringe estrictamente a los almacenes a los que fue asignado formalmente en `UserWarehouse`.
3. **Diseno Tactil para Campo (Touch-First >= 48px):** En las vistas moviles de obra, todo boton de confirmacion, incremento numerico o captura de foto posee un area interactiva minima de 48×48 px con espaciado generoso para operar con guantes o en condiciones de faena.
4. **Resiliencia y Captura In-Situ:** Integracion nativa con camara movil (`capture="environment"`) para registrar guias de remision firmadas y fotos de herramientas danadas sin requerir apps intermedias.

---

## 2. Sistema de Diseno y Tokens Visuales (Tailwind CSS v4)

### 2.1 Paleta Cromatica Neutral y Semantica
- **Base Neutra:** `slate-950` (fondo sidebar y contrastes maximos), `slate-900` (texto principal), `slate-600` (secundarios y leyendas), `slate-100` (fondos de tarjeta y contenedores), `white` (fondo de trabajo).
- **Verde Exito (`emerald-600` / `emerald-100`):** Material recibido conforme, transferencias `COMPLETED`, stock suficiente en gap analysis, herramientas en condicion `OPERATIVE`.
- **Ambar Alerta (`amber-600` / `amber-100`):** Insumos proximos al stock minimo, requerimientos en `PENDIENTE_MAPEO`, transferencias `IN_TRANSIT`, herramientas en devolucion regular (`DAMAGED_USABLE`).
- **Rojo Peligro (`rose-600` / `rose-100`):** Desabastecimiento critico, discrepancias con merma en transporte (`DISCREPANCY`), herramientas inutilizables o extraviadas (`DAMAGED_UNUSABLE`, `LOST`).
- **Azul Corporativo (`sky-700` / `sky-100`):** Botones de accion principal, reservas logicas de stock y ordenes de despacho.

---

## 3. Arquitectura de Layouts y Navegacion

```
                                  [ SISTEMA SPA-ALMACEN-ERP ]
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       ▼                                               ▼
            [ AdminLayoutComponent ]                        [ MobileLayoutComponent ]
              (Pantallas >= 1024px)                           (Pantallas < 1024px)
          ┌───────────────────────────┐                   ┌───────────────────────────┐
          │ • Topbar (Selector Obra)  │                   │ • Header (Obra Activa)    │
          │ • Sidebar de Navegacion   │                   │ • Area Tactil Central     │
          │ • Contenedor Central      │                   │ • Bottom Navigation Bar   │
          └───────────────────────────┘                   └───────────────────────────┘
```

### 3.1 Layout de Escritorio: `AdminLayoutComponent`
- **Topbar Superior (Fijo, H-16):**
  - **Logotipo y Brand:** Isotipo minimalista y titulo "SPA-ALMACEN".
  - **Selector de Almacen Activo:** Dropdown destacado. 
    - Opciones para Administrador: `[ Consolidado General (Todos) ]`, `[ Almacen Central ]`, `[ Obra Edificio Panorama ]`, `[ Obra Puente San Martin ]`.
    - Al cambiar la seleccion, todas las consultas y KPI de la vista activa se recalculan de forma reactiva con Angular Signals.
  - **Indicador de Conectividad:** Badge verde pulsante "Online" con validacion de latencia del VPS.
  - **Perfil de Usuario:** Avatar con iniciales, Nombre Completo, Rol (`ADMIN` o `ALMACENERO`) y boton de cerrar sesion.
- **Sidebar Izquierdo (Fijo, W-64, Slate-950):**
  - 📊 **Dashboard:** Metricas consolidadas, valorizacion y alertas (`/dashboard`).
  - 📦 **Catalogo Maestro:** Gestion de SKUs, unidades base y equivalencias S10 (`/catalogo`).
  - 🛒 **Compras y CPP:** Facturas con desglose de IGV, proveedores y recalculo atómico (`/compras`).
  - 🏗️ **Proyectos y S10:** Matriz de brechas (Gap Analysis), carga de CSV y reserva logica (`/proyectos-s10`).
  - 🚚 **Transferencias:** Monitoreo y despacho entre Central y Obras en 2 fases (`/transferencias`).
  - 🔄 **Kardex e Historico:** Libro contable append-only y auditoria de consumos (`/kardex`).
  - ⚙️ **Mantenimiento:** Respaldos de PostgreSQL en 1 clic y usuarios (`/admin/mantenimiento`).

### 3.2 Layout Movil / Tablet: `MobileLayoutComponent`
- **Header Movil Compacto (H-14):**
  - Nombre del Almacen de Obra temporal asignado. Si el almacenero tiene mas de una obra autorizada, actua como selector tactil.
  - Icono de campana con contador de despachos en transito hacia la obra (`IN_TRANSIT`).
- **Bottom Navigation Bar (Fijo Inferior, H-16, 5 Botones Accesibles):**
  1. 🏠 **Inicio (`/movil/operaciones`):** Resumen de pendientes y accesos rapidos.
  2. 🚚 **Recepcion (`/movil/recepcion`):** Confirmacion de transferencias con conteo e inspeccion.
  3. 📦 **Salida Consumo (`/movil/consumo`):** Despacho rapido a capataces de obra por partida.
  4. 🛠️ **Herramientas (`/movil/herramientas`):** Vales de prestamo por DNI y devoluciones.
  5. 🔍 **Stock (`/movil/stock`):** Consulta rapida de existencias fisicas en caseta.

---

## 4. Especificacion Detallada de Vistas

### 4.1 Vistas de Escritorio (Oficina Tecnica y Gestion)

#### Vista E1: Dashboard General (`/dashboard`)
- **Filtro Contextual:** Vinculado al selector del Topbar (muestra datos del almacen seleccionado o consolidado).
- **Tarjetas KPI (Grid 4 col):**
  1. *Total SKUs Activos:* Cantidad de insumos con stock positivo.
  2. *Valorizacion de Inventario (Solo ADMIN):* Monto total en Soles (PEN) valorizado a CPP neto sin IGV.
  3. *Herramientas en Campo:* Cantidad total de bienes con vale activo (`loanedQty`).
  4. *Insumos Criticos:* SKUs con stock fisico por debajo de `minStockAlert`.
- **Panel Principal:**
  - *Grafico de Barras (Chart.js):* Comparativa de Stock Central vs. Stock distribuido en Obras.
  - *Tabla de Reposicion Urgente:* Listado con boton de accion rapida `[ Generar Orden de Compra ]`.
  - *Resumen de Reservas Logicas (Opcion A):* Stock comprometido para proyectos que aun no ha salido de Central.

#### Vista E2: Catalogo Maestro de Insumos (`/catalogo`)
- **Barra de Acciones:** Buscador en tiempo real (SKU, nombre, alias), filtro por tipo (`CONSUMABLE` vs `ASSET_TOOL`) y boton `[ + Nuevo Insumo ]`.
- **Tabla de Insumos:**
  - Columnas: SKU, Descripcion Oficial, Unidad Base (`baseUnit`), Tipo, Stock Central, Stock en Obras, Costo Promedio (CPP - protegido por `*appHasRole="'ADMIN'"`), Acciones.
  - Acciones por fila: `[ Editar ]`, `[ Historial Kardex ]`, `[ Gestionar Alias S10 ]`.
- **Modal de Mapeo de Alias S10:**
  - Formulario para registrar variantes de nombres crudos del S10 (`s10RawName`), unidad del presupuesto (`s10Unit`) y factor de conversion hacia la unidad base (`conversionFactor`).

#### Vista E3: Compras, Proveedores y Recalculo de CPP (`/compras`) — [Exclusivo ADMIN]
- **Buscador y Filtros:** Rango de fechas, proveedor por RUC y serie de comprobante.
- **Tabla de Compras:** N° Comprobante, Proveedor, Fecha, Moneda (PEN/USD), Tipo de Cambio, Subtotal Neto, IGV (18%), Total Facturado, Estado, Evidencia Adjunta.
- **Drawer Lateral de Registro de Compra:**
  - Seleccion de Proveedor (RUC con autocompletado) y Tipo de Comprobante (Factura / Boleta / Guia).
  - Selector de Moneda y Tipo de Cambio en Soles.
  - Insercion dinamica de lineas: Insumo, Unidad de Compra (ej. PALLET), Factor de Conversion, Cantidad de Compra, Precio Unitario Neto.
  - Calculo automatico en vivo: Cantidad Base resultante, Costo Base PEN resultante, Subtotal, IGV y Total.
  - Zona de carga de comprobante (Dropzone PDF/JPG/PNG con procesamiento Sharp a WebP).

#### Vista E4: Proyectos, Ingesta S10 y Matriz de Brechas (`/proyectos-s10`) — [Exclusivo ADMIN]
- **Cabecera de Proyecto:** Selector de proyecto civil, codigo de presupuesto S10, estado (`PLANNING`, `ACTIVE`, `LIQUIDATED`) y boton de `[ Liquidar Obra ]`.
- **Seccion Carga S10:** Uploader de archivo plano (.csv) con deteccion automatica de delimitador (`;` o `,`) y codificacion `Windows-1252` / `UTF-8`.
- **Tabla Matriz de Brechas (Gap Analysis):**
  - Columnas: Codigo S10, Descripcion Cruda, Cantidad Requerida (convertida a base), Stock Neto Disponible en Central (`physicalQty - reservedQty`), Brecha / Deficit a Comprar, Estado de Mapeo (`MAPEADO` verde vs `PENDIENTE_MAPEO` naranja).
  - Acciones por fila: Enlaces directos para vincular a SKU existente o dar de alta en catalogo.
  - Barra de Accion Inferior: Boton `[ Ejecutar Reserva Logica (Opcion A) ]` para bloquear el disponible de Central hacia la obra, y boton `[ Exportar Reporte Excel ]` (`exceljs`).

#### Vista E5: Transferencias y Despacho en Dos Fases (`/transferencias`)
- **Tabs de Navegacion:** `[ En Transito ]` | `[ Historial de Despachos ]` | `[ Nueva Transferencia ]`.
- **Formulario de Despacho (Central hacia Obra o Retorno):**
  - Almacen Origen y Almacen Destino (Obra temporal).
  - Seleccion de items con validacion de saldo reservado en proyecto (`allocatedQty`).
  - Generacion de Guia de Transferencia interna con codigo correlativo (`TR-2026-XXXXX`).

#### Vista E6: Kardex Financiero e Historico (`/kardex`)
- **Filtros Avanzados:** Almacen, rango de fechas, tipo de movimiento (`PURCHASE_ENTRY`, `CONSUMPTION_EXIT`, `TRANSFER_DISPATCH`, etc.) e insumo.
- **Tabla de Libro Mayor:** Fecha y Hora, N° Movimiento, Tipo, Almacen Origen, Almacen Destino, Cantidad, Costo Unitario Snapshot (Solo visible para `ADMIN`), Responsable / DNI, Observaciones y Comprobante adjunto.

#### Vista E7: Mantenimiento, Usuarios y Respaldos (`/admin/mantenimiento`) — [Exclusivo ADMIN]
- **Gestion de Respaldos de Base de Datos:**
  - Tarjeta de ejecucion rapida con boton destacado: `[ ⬇️ Descargar Copia de Seguridad Inmutable (.sql/.tar.gz) ]`.
  - Historial de respaldos programados en VPS con antiguedad y tamano.
- **Administracion de Usuarios y Almacenes:**
  - Asignacion de usuarios a almacenes en la tabla `UserWarehouse`.

---

### 4.2 Vistas Moviles (Caseta de Almacen de Obra)

#### Vista M1: Home de Operaciones Diarias (`/movil/operaciones`)
- **Tarjeta de Identificacion:** Muestra el nombre del almacenero y la Obra activa en curso.
- **Alerta de Transferencias Entrantes:** Banner amarillo visible si existen cargamentos `IN_TRANSIT` dirigiendose hacia esa obra con boton directo `[ Ver y Recepcionar ]`.
- **Grid de Acciones Tactiles (4 Botones Grandes de 2x2):**
  1. 🚚 **Recepcionar Envio:** Conteo y verificacion de despachos de Central.
  2. 📦 **Salida a Cuadrilla:** Entrega de materiales a capataces en obra.
  3. 🛠️ **Vale de Herramientas:** Prestamo o recepcion de equipos por DNI.
  4. 🔍 **Consultar Caseta:** Busqueda de saldo fisico disponible en la obra.

#### Vista M2: Recepcion de Transferencias en 2 Fases (`/movil/recepcion`)
- **Listado de Guias Entrantes:** Tarjetas expandibles con N° de Guia, Almacen Origen y transportista.
- **Inspeccion Tactil por Item:**
  - Muestra nombre del material y Cantidad Despachada desde Central.
  - Control de Conteo Fisico: Input numerico grande con botones incrementales `[ - ]` y `[ + ]`.
  - Checkbox interactivo: `¿Llego Completo y Conforme?` (al marcarlo, autocompleta la cantidad recibida con la despachada).
  - Si la cantidad recibida es menor a la despachada, el sistema despliega automaticamente:
    - Campo de motivo obligatorio: *"Dano en transporte"*, *"Extravio en ruta"*, *"Rotura de empaque"*.
  - Boton de Camara: `[ 📷 Tomar Foto a Guia de Remision Firmada ]` (conecta directo a la camara trasera del movil).
  - Boton de Accion Final: `[ Confirmar Recepcion e Ingresar a Caseta ]` (ejecuta la transaccion atomica registrando `TRANSFER_RECEIPT` y `SHRINKAGE_EXIT` por discrepancia).

#### Vista M3: Salida de Materiales a Cuadrilla en Obra (`/movil/consumo`)
- **Formulario Tactil Rapido:**
  - Autocompletado de insumo consumible del stock disponible local en caseta.
  - Cantidad a entregar.
  - Seleccion de Frente o Partida de Obra (ej. "Vaciado Losa Piso 4", "Muros Eje A").
  - Identificacion del Receptor: DNI (8 digitos) y Nombre del Capataz o Maestro de Obra.
  - Boton `[ Registrar Entrega Definitiva ]` (emite movimiento `CONSUMPTION_EXIT` y descuenta inmediatamente el stock fisico de caseta, acumulando el `consumedQty` del proyecto).

#### Vista M4: Vales de Custodia de Herramientas (`/movil/herramientas`)
- **Selector Superior de Modo:** `[ Prestar Herramienta ]` | `[ Registrar Devolucion ]`.
- **Sub-Flujo Préstamo:**
  - Buscador de herramienta por SKU o escaneo de codigo patrimonial/serie (`serialOrCode`).
  - Validacion de saldo: muestra cantidad disponible en estante (`physicalQty - loanedQty`).
  - Ingreso de DNI del operario (autocompleta el nombre si el trabajador ya tiene historial en el sistema).
  - Fecha estimada de devolucion (hoy al final de jornada por defecto).
  - Boton `[ Generar Vale de Custodia ]`.
- **Sub-Flujo Devolucion:**
  - Lista de vales pendientes de devolucion en la obra activa, ordenados por operario.
  - Selector de Condicion Fisica de Retorno:
    - `[ Operativo ]` (verde)
    - `[ Desgaste Normal ]` (amarillo)
    - `[ Danado / Inutilizable ]` (rojo - despliega boton de foto evidencia obligatoria)
    - `[ Extraviado / No Devuelto ]` (rojo)
  - Boton `[ Finalizar Custodia ]` (libera `loanedQty` o ejecuta la baja por merma segun corresponda).

#### Vista M5: Consulta Rapida de Stock en Caseta (`/movil/stock`)
- Buscador reactivo por texto o voz con respuesta instantanea (< 100 ms).
- Tarjetas limpias de alto contraste: Nombre del Insumo, Unidad de Medida, Saldo Fisico en Caseta y Saldo Disponible para Prestamo (en caso de herramientas).

---

## 5. UI Kit de Componentes Compartidos (Angular 22 Standalone con Signals)

Para garantizar total homogeneidad y empaquetado optimo, todos los componentes residen en `src/app/shared/components/` y operan con la arquitectura reactiva nativa de **Signals**:

### 5.1 `UiButtonComponent` (`ui-button`)
- **Inputs:** `variant` ('primary' | 'secondary' | 'danger' | 'outline' | 'touch'), `size` ('sm' | 'md' | 'lg'), `disabled` (boolean), `loading` (signal boolean).
- **Caracteristica Especial:** La variante `'touch'` fuerza dimensiones minimas de 48×48 px y esquinas redondeadas optimizadas para pulsaciones tactiles.

### 5.2 `UiInputComponent` (`ui-input`)
- **Inputs:** `label` (string), `type` (string), `placeholder` (string), `error` (signal string | null), `control` (FormControl).
- **Estilos:** Borde sutil `border-slate-300` con enfoque de alto contraste `focus:ring-2 focus:ring-sky-600`.

### 5.3 `UiBadgeComponent` (`ui-badge`)
- **Inputs:** `status` ('SUCCESS' | 'WARNING' | 'DANGER' | 'INFO' | 'IN_TRANSIT').
- **Mapeo:**
  - `SUCCESS`: `bg-emerald-100 text-emerald-800 border-emerald-300`
  - `WARNING`: `bg-amber-100 text-amber-800 border-amber-300`
  - `DANGER`: `bg-rose-100 text-rose-800 border-rose-300`
  - `IN_TRANSIT`: `bg-sky-100 text-sky-800 border-sky-300`

### 5.4 `UiTableComponent` (`ui-table`)
- **Slots Content Projection:** `[header]`, `[body]`, `[emptyState]`, `[pagination]`.
- **Caracteristicas:** Scroll horizontal responsivo suave, soporte de *virtual scroll* para listas mayores a 1,000 filas.

### 5.5 `UiModalComponent` (`ui-modal`)
- **Inputs:** `isOpen` (model boolean), `title` (string), `maxWidth` ('sm' | 'md' | 'lg' | 'full').
- **Efectos:** Backdrop blur (`backdrop-blur-sm bg-slate-950/60`), captura automatica de tecla `Escape` y accesibilidad WAI-ARIA.

### 5.6 `UiStatCardComponent` (`ui-stat-card`)
- **Inputs:** `title` (string), `value` (string | number), `icon` (LucideIcon), `trend` (string | null), `variant` ('neutral' | 'success' | 'warning' | 'danger').

### 5.7 `UiDropzoneComponent` (`ui-dropzone`)
- **Inputs:** `accept` (string), `maxSizeBytes` (number), `allowCamera` (boolean).
- **Outputs:** `fileSelected` (EventEmitter<File>).
- **Caracteristicas:** Soporte drag-and-drop en escritorio y boton de apertura directa de camara en dispositivos moviles.

---

## 6. Servicios de Estado Global y Directivas RBAC

### 6.1 `WarehouseContextService`
Servicio singleton que gobierna el almacen activo de la sesion:
```typescript
@Injectable({ providedIn: 'root' })
export class WarehouseContextService {
  private authService = inject(AuthService);
  private warehouseApi = inject(WarehouseApiService);

  // Almacen activo gobernado por Signals
  activeWarehouseId = signal<string | 'ALL'>('ALL');
  
  // Lista de almacenes a los que el usuario tiene acceso formal
  availableWarehouses = signal<Warehouse[]>([]);

  // Computed: Obtiene el objeto de almacen activo seleccionado
  currentWarehouse = computed(() => {
    const id = this.activeWarehouseId();
    if (id === 'ALL') return null;
    return this.availableWarehouses().find(w => w.id === id) ?? null;
  });

  selectWarehouse(warehouseId: string | 'ALL'): void {
    this.activeWarehouseId.set(warehouseId);
  }
}
```

### 6.2 Directiva Estructural `HasRoleDirective` (`*appHasRole`)
Remueve elementos del DOM si el rol autenticado no coincide:
```typescript
@Directive({
  selector: '[appHasRole]',
  standalone: true
})
export class HasRoleDirective {
  private authService = inject(AuthService);
  private templateRef = inject(TemplateRef<any>);
  private viewContainer = inject(ViewContainerRef);

  @Input() set appHasRole(role: Role | Role[]) {
    const userRole = this.authService.currentUser()?.role;
    const allowed = Array.isArray(role) ? role.includes(userRole!) : userRole === role;

    if (allowed) {
      this.viewContainer.createEmbeddedView(this.templateRef);
    } else {
      this.viewContainer.clear();
    }
  }
}
```

---

## 7. Mapeo de Wireframes Existentes (`wireframes-low/`) a Componentes Angular

Los wireframes HTML estaticos creados en el proyecto se traducen directamente a las siguientes rutas y componentes de Angular 22:

| Archivo Wireframe HTML | Ruta Angular | Componente Standalone | Layout |
| :--- | :--- | :--- | :--- |
| `wireframes-low/desktop/dashboard.html` | `/dashboard` | `DashboardComponent` | `AdminLayoutComponent` |
| `wireframes-low/desktop/catalogo.html` | `/catalogo` | `CatalogoComponent` | `AdminLayoutComponent` |
| `wireframes-low/desktop/compras.html` | `/compras` | `ComprasComponent` | `AdminLayoutComponent` |
| `wireframes-low/desktop/s10-brechas.html` | `/proyectos-s10` | `ProyectosS10Component` | `AdminLayoutComponent` |
| `wireframes-low/desktop/mantenimiento.html` | `/admin/mantenimiento`| `MantenimientoComponent` | `AdminLayoutComponent` |
| `wireframes-low/mobile/movil-operaciones.html`| `/movil/operaciones` | `MovilOperacionesComponent` | `MobileLayoutComponent` |
| `wireframes-low/mobile/movil-recepcion.html` | `/movil/recepcion` | `MovilRecepcionComponent` | `MobileLayoutComponent` |
| `wireframes-low/mobile/movil-herramientas.html`| `/movil/herramientas`| `MovilHerramientasComponent`| `MobileLayoutComponent` |
| *(Nuevo Formulario Touch)* | `/movil/consumo` | `MovilConsumoComponent` | `MobileLayoutComponent` |
| *(Nuevo Buscador Touch)* | `/movil/stock` | `MovilStockComponent` | `MobileLayoutComponent` |

---

**Fin de la Especificacion UI/UX Definitiva (`UI_SPECIFICATION.md`)**
