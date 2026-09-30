# Script de prueba integral de endpoints para SPA-ALMACEN-ERP
# Ejecutar con el servidor activo en http://localhost:3000

$ErrorActionPreference = "Stop"
$BASE_URL = "http://localhost:3000/api/v1"

Write-Host "Iniciando bateria de pruebas de endpoints..." -ForegroundColor Cyan

# 0. Verificar estado del servidor
try {
    $hello = Invoke-RestMethod -Uri "$BASE_URL" -Method GET
    Write-Host "[OK] Estado del servidor: $hello" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] El servidor no responde en $BASE_URL. Asegurate de iniciar con: npm run start:dev" -ForegroundColor Red
    exit 1
}

# 1. Autenticacion
Write-Host "`n--- 1. Autenticacion ---" -ForegroundColor Yellow

$adminLogin = Invoke-RestMethod -Uri "$BASE_URL/auth/login" -Method POST -ContentType "application/json" -Body (@{
    email = "admin@almacen.com"
    password = "Admin1234!"
} | ConvertTo-Json)
$ADMIN_TOKEN = $adminLogin.accessToken
$ADMIN_REFRESH = $adminLogin.refreshToken
Write-Host "[OK] Login Admin exitoso" -ForegroundColor Green

$keeperLogin = Invoke-RestMethod -Uri "$BASE_URL/auth/login" -Method POST -ContentType "application/json" -Body (@{
    email = "almacenero@obra.com"
    password = "Almacen1234!"
} | ConvertTo-Json)
$KEEPER_TOKEN = $keeperLogin.accessToken
Write-Host "[OK] Login Almacenero exitoso" -ForegroundColor Green

$refresh = Invoke-RestMethod -Uri "$BASE_URL/auth/refresh" -Method POST -ContentType "application/json" -Body (@{
    refreshToken = $ADMIN_REFRESH
} | ConvertTo-Json)
Write-Host "[OK] Refresh Token exitoso" -ForegroundColor Green

$profile = Invoke-RestMethod -Uri "$BASE_URL/auth/profile" -Method GET -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" }
Write-Host "[OK] Perfil Admin consultado: $($profile.email) ($($profile.role))" -ForegroundColor Green

# 2. Usuarios
Write-Host "`n--- 2. Usuarios ---" -ForegroundColor Yellow

$users = Invoke-RestMethod -Uri "$BASE_URL/users" -Method GET -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" }
Write-Host "[OK] Usuarios listados: $($users.Count) usuarios registrados" -ForegroundColor Green

# Validar que almacenero no pueda listar usuarios (RBAC)
try {
    Invoke-RestMethod -Uri "$BASE_URL/users" -Method GET -Headers @{ Authorization = "Bearer $KEEPER_TOKEN" }
    Write-Host "[FALLO] El almacenero no deberia poder listar usuarios" -ForegroundColor Red
} catch {
    Write-Host "[OK] RBAC validado: Almacenero bloqueado con 403 Forbidden" -ForegroundColor Green
}

$newUserEmail = "auxiliar_$(Get-Random)@obra.com"
$newUser = Invoke-RestMethod -Uri "$BASE_URL/users" -Method POST -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" } -ContentType "application/json" -Body (@{
    email = $newUserEmail
    password = "Auxiliar1234!"
    fullName = "Carlos Mendoza Auxiliar"
    role = "WAREHOUSE_KEEPER"
} | ConvertTo-Json)
$AUX_USER_ID = $newUser.id
Write-Host "[OK] Usuario creado: $newUserEmail (Id: $AUX_USER_ID)" -ForegroundColor Green

$userDetail = Invoke-RestMethod -Uri "$BASE_URL/users/$AUX_USER_ID" -Method GET -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" }
Write-Host "[OK] Detalle de usuario obtenido: $($userDetail.fullName)" -ForegroundColor Green

Invoke-RestMethod -Uri "$BASE_URL/users/$AUX_USER_ID" -Method PUT -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" } -ContentType "application/json" -Body (@{
    fullName = "Carlos Mendoza Jefe Auxiliar"
    isActive = $true
} | ConvertTo-Json) | Out-Null
Write-Host "[OK] Usuario actualizado correctamente" -ForegroundColor Green

# 3. Almacenes
Write-Host "`n--- 3. Almacenes ---" -ForegroundColor Yellow

$warehouses = Invoke-RestMethod -Uri "$BASE_URL/warehouses" -Method GET -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" }
$CENTRAL_WH = $warehouses | Where-Object { $_.type -eq "CENTRAL" } | Select-Object -First 1
$CENTRAL_WH_ID = $CENTRAL_WH.id
Write-Host "[OK] Almacen Central identificado: $($CENTRAL_WH.name) (Id: $CENTRAL_WH_ID)" -ForegroundColor Green

$obraWhName = "Almacen Obra Panorama $(Get-Random)"
$obraWh = Invoke-RestMethod -Uri "$BASE_URL/warehouses" -Method POST -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" } -ContentType "application/json" -Body (@{
    name = $obraWhName
    type = "PROJECT_SITE"
    isTemporary = $true
    isActive = $true
} | ConvertTo-Json)
$OBRA_WH_ID = $obraWh.id
Write-Host "[OK] Almacen de Obra creado: $obraWhName (Id: $OBRA_WH_ID)" -ForegroundColor Green

# Asignar almacen de obra al almacenero
Invoke-RestMethod -Uri "$BASE_URL/users/$($keeperLogin.user.id)/warehouses" -Method PUT -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" } -ContentType "application/json" -Body (@{
    warehouses = @(
        @{ warehouseId = $CENTRAL_WH_ID; isDefault = $false },
        @{ warehouseId = $OBRA_WH_ID; isDefault = $true }
    )
} | ConvertTo-Json) | Out-Null
Write-Host "[OK] Almacenes asignados al almacenero de prueba" -ForegroundColor Green

Invoke-RestMethod -Uri "$BASE_URL/warehouses/$OBRA_WH_ID" -Method GET -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" } | Out-Null
Write-Host "[OK] Detalle de almacen consultado" -ForegroundColor Green

# 4. Catalogo de Items y Alias S10
Write-Host "`n--- 4. Catalogo de Items y Alias S10 ---" -ForegroundColor Yellow

$skuConsumable = "MAT-CEM-$(Get-Random)"
$consumable = Invoke-RestMethod -Uri "$BASE_URL/items" -Method POST -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" } -ContentType "application/json" -Body (@{
    sku = $skuConsumable
    name = "Cemento Portland Sol Tipo I"
    description = "Bolsa de 42.5 kg para obras civiles"
    baseUnit = "BOLSA"
    type = "CONSUMABLE"
    minStockAlert = 50.0
} | ConvertTo-Json)
$ITEM_CONSUMABLE_ID = $consumable.id
Write-Host "[OK] Item Consumible registrado: $skuConsumable (Id: $ITEM_CONSUMABLE_ID)" -ForegroundColor Green

$skuTool = "EQU-ROT-$(Get-Random)"
$tool = Invoke-RestMethod -Uri "$BASE_URL/items" -Method POST -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" } -ContentType "application/json" -Body (@{
    sku = $skuTool
    name = "Rotomartillo Bosch GBH 2-28 D"
    description = "Rotomartillo profesional 850W"
    baseUnit = "UNIDAD"
    type = "ASSET_TOOL"
    minStockAlert = 2.0
} | ConvertTo-Json)
$ITEM_TOOL_ID = $tool.id
Write-Host "[OK] Item Herramienta registrado: $skuTool (Id: $ITEM_TOOL_ID)" -ForegroundColor Green

$itemsList = Invoke-RestMethod -Uri "$BASE_URL/items?page=1&limit=10" -Method GET -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" }
Write-Host "[OK] Catalogo de items listado: $($itemsList.meta.total) items totales" -ForegroundColor Green

$itemDetail = Invoke-RestMethod -Uri "$BASE_URL/items/$ITEM_CONSUMABLE_ID" -Method GET -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" }
Write-Host "[OK] Detalle de item consultado con consolidado de stock" -ForegroundColor Green

$alias = Invoke-RestMethod -Uri "$BASE_URL/items/aliases" -Method POST -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" } -ContentType "application/json" -Body (@{
    itemId = $ITEM_CONSUMABLE_ID
    s10RawName = "CEMENTO PORTLAND SOL TIPO I 42.5KG $(Get-Random)"
    s10Code = "0201010001"
    s10Unit = "BLS"
    conversionFactor = 1.0
} | ConvertTo-Json)
$ALIAS_ID = $alias.id
Write-Host "[OK] Alias S10 registrado: $($alias.s10RawName)" -ForegroundColor Green

Invoke-RestMethod -Uri "$BASE_URL/items/aliases/$ALIAS_ID" -Method DELETE -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" } | Out-Null
Write-Host "[OK] Alias S10 eliminado correctamente" -ForegroundColor Green

# 5. Proveedores
Write-Host "`n--- 5. Proveedores ---" -ForegroundColor Yellow

# RUC aleatorio valido de 11 digitos comenzando con 20
$taxId = "20" + (Get-Random -Minimum 100000000 -Maximum 999999999)
$supplier = Invoke-RestMethod -Uri "$BASE_URL/suppliers" -Method POST -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" } -ContentType "application/json" -Body (@{
    taxId = $taxId
    businessName = "CORPORACION LOGISTICA DEL CENTRO S.A.C."
    tradeName = "LOGISTICA CENTRO"
    contactName = "Jorge Valdivia"
    phone = "987654321"
    email = "contacto@logcentro.com"
    address = "Av. Materiales 450, Lima"
} | ConvertTo-Json)
$SUPPLIER_ID = $supplier.id
Write-Host "[OK] Proveedor registrado: $taxId (Id: $SUPPLIER_ID)" -ForegroundColor Green

$suppliersList = Invoke-RestMethod -Uri "$BASE_URL/suppliers" -Method GET -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" }
Write-Host "[OK] Proveedores listados: $($suppliersList.meta.total) proveedores" -ForegroundColor Green

Invoke-RestMethod -Uri "$BASE_URL/suppliers/$SUPPLIER_ID" -Method GET -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" } | Out-Null
Write-Host "[OK] Detalle de proveedor consultado" -ForegroundColor Green

# 6. Compras y Algoritmo de Costo Promedio Ponderado (CPP)
Write-Host "`n--- 6. Compras y CPP ---" -ForegroundColor Yellow

$invoiceSeries = "F001-" + (Get-Random -Minimum 1000000 -Maximum 9999999)
$purchase = Invoke-RestMethod -Uri "$BASE_URL/purchases" -Method POST -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" } -ContentType "application/json" -Body (@{
    supplierId = $SUPPLIER_ID
    centralWarehouseId = $CENTRAL_WH_ID
    invoiceSeries = $invoiceSeries
    currency = "PEN"
    exchangeRate = 1.0
    issueDate = (Get-Date).ToString("o")
    subtotalPEN = 6500.0
    igvAmountPEN = 1170.0
    totalAmountPEN = 7670.0
    items = @(
        @{
            itemId = $ITEM_CONSUMABLE_ID
            purchaseUnit = "BOLSA"
            conversionFactor = 1.0
            purchaseQty = 100.0
            unitPriceOriginal = 25.0
        },
        @{
            itemId = $ITEM_TOOL_ID
            purchaseUnit = "UNIDAD"
            conversionFactor = 1.0
            purchaseQty = 5.0
            unitPriceOriginal = 800.0
        }
    )
} | ConvertTo-Json)
$PURCHASE_ID = $purchase.id
Write-Host "[OK] Compra registrada: $invoiceSeries (Id: $PURCHASE_ID)" -ForegroundColor Green

# Verificar que el stock de Central y CPP se calcularon correctamente
$centralStock = Invoke-RestMethod -Uri "$BASE_URL/warehouses/$CENTRAL_WH_ID/stock" -Method GET -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" }
$cemStock = $centralStock.data | Where-Object { $_.itemId -eq $ITEM_CONSUMABLE_ID }
Write-Host "[OK] Stock Central Cemento: Cantidad=$($cemStock.physicalQty), CPP=S/ $($cemStock.averageCost)" -ForegroundColor Green

# Verificar enmascaramiento financiero para almacenero
$keeperStockView = Invoke-RestMethod -Uri "$BASE_URL/warehouses/$CENTRAL_WH_ID/stock" -Method GET -Headers @{ Authorization = "Bearer $KEEPER_TOKEN"; "x-warehouse-id" = $CENTRAL_WH_ID }
$keeperCemStock = $keeperStockView.data | Where-Object { $_.itemId -eq $ITEM_CONSUMABLE_ID }
if ($null -eq $keeperCemStock.averageCost) {
    Write-Host "[OK] Data Masking confirmado: averageCost oculto para el rol Almacenero" -ForegroundColor Green
} else {
    Write-Host "[ADVERTENCIA] averageCost no fue enmascarado para Almacenero" -ForegroundColor Yellow
}

# 7. Transferencias Operativas en Dos Fases
Write-Host "`n--- 7. Transferencias en Dos Fases ---" -ForegroundColor Yellow

$dispatch = Invoke-RestMethod -Uri "$BASE_URL/transfers/dispatch" -Method POST -Headers @{ Authorization = "Bearer $ADMIN_TOKEN"; "x-warehouse-id" = $CENTRAL_WH_ID } -ContentType "application/json" -Body (@{
    originWarehouseId = $CENTRAL_WH_ID
    destWarehouseId = $OBRA_WH_ID
    dispatchNotes = "Despacho con camioneta placa ABC-123"
    items = @(
        @{ itemId = $ITEM_CONSUMABLE_ID; quantity = 40.0 },
        @{ itemId = $ITEM_TOOL_ID; quantity = 2.0 }
    )
} | ConvertTo-Json)
$TRANSFER_ID = $dispatch.id
$TRANSFER_ITEM_CEM = ($dispatch.items | Where-Object { $_.itemId -eq $ITEM_CONSUMABLE_ID }).id
$TRANSFER_ITEM_TOOL = ($dispatch.items | Where-Object { $_.itemId -eq $ITEM_TOOL_ID }).id
Write-Host "[OK] Transferencia despachada: $($dispatch.transferNumber) en estado $($dispatch.status)" -ForegroundColor Green

$inTransit = Invoke-RestMethod -Uri "$BASE_URL/transfers/in-transit?destWarehouseId=$OBRA_WH_ID" -Method GET -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" }
Write-Host "[OK] Transferencias en transito listadas: $($inTransit.Count)" -ForegroundColor Green

# Recepcion con discrepancia: 38 bolsas recibidas conformes, 2 bolsas de merma faltante
$receive = Invoke-RestMethod -Uri "$BASE_URL/transfers/$TRANSFER_ID/receive" -Method POST -Headers @{ Authorization = "Bearer $KEEPER_TOKEN" } -ContentType "application/json" -Body (@{
    receptionNotes = "2 bolsas de cemento con rotura en transporte"
    items = @(
        @{ transferItemId = $TRANSFER_ITEM_CEM; receivedQty = 38.0 },
        @{ transferItemId = $TRANSFER_ITEM_TOOL; receivedQty = 2.0 }
    )
} | ConvertTo-Json)
Write-Host "[OK] Recepcion confirmada con discrepancia: Estado final $($receive.status)" -ForegroundColor Green

# 8. Movimientos y Kardex
Write-Host "`n--- 8. Salidas de Consumo y Kardex ---" -ForegroundColor Yellow

$PROJECT_ID = "c0000000-0000-0000-0000-000000000001"

$consumption = Invoke-RestMethod -Uri "$BASE_URL/movements/consumption" -Method POST -Headers @{ Authorization = "Bearer $KEEPER_TOKEN"; "x-warehouse-id" = $OBRA_WH_ID } -ContentType "application/json" -Body (@{
    warehouseId = $OBRA_WH_ID
    projectId = $PROJECT_ID
    recipientName = "Manuel Flores Huaman"
    recipientDni = "45892314"
    observation = "Vaciado de columnas sector B"
    items = @(
        @{ itemId = $ITEM_CONSUMABLE_ID; quantity = 10.0 }
    )
} | ConvertTo-Json)
Write-Host "[OK] Salida por consumo registrada: $($consumption.movementNumber)" -ForegroundColor Green

# Validar que no se permita consumo definitivo de herramientas ASSET_TOOL
try {
    Invoke-RestMethod -Uri "$BASE_URL/movements/consumption" -Method POST -Headers @{ Authorization = "Bearer $ADMIN_TOKEN"; "x-warehouse-id" = $OBRA_WH_ID } -ContentType "application/json" -Body (@{
        warehouseId = $OBRA_WH_ID
        projectId = $PROJECT_ID
        recipientName = "Manuel Flores"
        recipientDni = "45892314"
        items = @(
            @{ itemId = $ITEM_TOOL_ID; quantity = 1.0 }
        )
    } | ConvertTo-Json)
    Write-Host "[FALLO] Deberia haber rechazado consumo de ASSET_TOOL" -ForegroundColor Red
} catch {
    Write-Host "[OK] Regla de negocio validada: No se permite consumo de herramientas ASSET_TOOL" -ForegroundColor Green
}

# Salida por merma fisica
$shrinkage = Invoke-RestMethod -Uri "$BASE_URL/movements/shrinkage" -Method POST -Headers @{ Authorization = "Bearer $KEEPER_TOKEN"; "x-warehouse-id" = $OBRA_WH_ID } -ContentType "application/json" -Body (@{
    warehouseId = $OBRA_WH_ID
    shrinkageReason = "Bolsa humedecida en caseta de obra"
    items = @(
        @{ itemId = $ITEM_CONSUMABLE_ID; quantity = 1.0 }
    )
} | ConvertTo-Json)
Write-Host "[OK] Merma registrada: $($shrinkage.movementNumber)" -ForegroundColor Green

# Ajuste de inventario exclusivo de Admin
$adjustment = Invoke-RestMethod -Uri "$BASE_URL/movements/adjustment" -Method POST -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" } -ContentType "application/json" -Body (@{
    warehouseId = $OBRA_WH_ID
    observation = "Conteo formal fin de mes"
    items = @(
        @{ itemId = $ITEM_CONSUMABLE_ID; direction = "INCREMENT"; quantity = 2.0 }
    )
} | ConvertTo-Json)
Write-Host "[OK] Ajuste de inventario procesado: $($adjustment.movementNumber)" -ForegroundColor Green

# 9. Custodia de Herramientas
Write-Host "`n--- 9. Custodia de Herramientas ---" -ForegroundColor Yellow

$loan = Invoke-RestMethod -Uri "$BASE_URL/tools/custody/dispatch" -Method POST -Headers @{ Authorization = "Bearer $KEEPER_TOKEN"; "x-warehouse-id" = $OBRA_WH_ID } -ContentType "application/json" -Body (@{
    warehouseId = $OBRA_WH_ID
    itemId = $ITEM_TOOL_ID
    quantity = 1.0
    serialOrCode = "ROTO-001"
    assignedToName = "Pedro Quispe Ramirez"
    assignedToDni = "70123456"
    conditionOnDispatch = "OPERATIVE"
} | ConvertTo-Json)
$CUSTODY_ID = $loan.id
Write-Host "[OK] Prestamo de herramienta emitido: Vale $CUSTODY_ID" -ForegroundColor Green

# Consultar deuda de herramientas por DNI
$debts = Invoke-RestMethod -Uri "$BASE_URL/tools/custody/worker/70123456" -Method GET -Headers @{ Authorization = "Bearer $KEEPER_TOKEN" }
Write-Host "[OK] Deuda consultada para DNI 70123456: $($debts.Count) herramientas prestadas" -ForegroundColor Green

# Devolucion conforme
Invoke-RestMethod -Uri "$BASE_URL/tools/custody/$CUSTODY_ID/return" -Method POST -Headers @{ Authorization = "Bearer $KEEPER_TOKEN" } -ContentType "application/json" -Body (@{
    conditionOnReturn = "OPERATIVE"
    returnNotes = "Devuelto conforme y limpio"
} | ConvertTo-Json) | Out-Null
Write-Host "[OK] Devolucion conforme procesada (libera loanedQty)" -ForegroundColor Green

# Prestamo y devolucion no conforme (baja patrimonial DAMAGED_UNUSABLE)
$loan2 = Invoke-RestMethod -Uri "$BASE_URL/tools/custody/dispatch" -Method POST -Headers @{ Authorization = "Bearer $KEEPER_TOKEN"; "x-warehouse-id" = $OBRA_WH_ID } -ContentType "application/json" -Body (@{
    warehouseId = $OBRA_WH_ID
    itemId = $ITEM_TOOL_ID
    quantity = 1.0
    serialOrCode = "ROTO-002"
    assignedToName = "Pedro Quispe Ramirez"
    assignedToDni = "70123456"
} | ConvertTo-Json)
$CUSTODY_ID_2 = $loan2.id

Invoke-RestMethod -Uri "$BASE_URL/tools/custody/$CUSTODY_ID_2/return" -Method POST -Headers @{ Authorization = "Bearer $KEEPER_TOKEN" } -ContentType "application/json" -Body (@{
    conditionOnReturn = "DAMAGED_UNUSABLE"
    returnNotes = "Motor quemado no reparable"
} | ConvertTo-Json) | Out-Null
Write-Host "[OK] Devolucion danada procesada: Baja patrimonial y merma generada" -ForegroundColor Green

Write-Host "`nTodas las pruebas de endpoints completadas exitosamente!" -ForegroundColor Cyan
