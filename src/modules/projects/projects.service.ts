import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ProjectStatus,
  Role,
  WarehouseType,
  TransferStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ProjectFilterDto } from './dto/project-filter.dto.js';
import { IngestS10Dto } from './dto/ingest-s10.dto.js';
import { AllocateStockDto } from './dto/allocate-stock.dto.js';
import { ReleaseStockDto } from './dto/release-stock.dto.js';
import { LiquidateProjectDto } from './dto/liquidate-project.dto.js';
import { S10ParserService } from './s10-parser.service.js';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s10ParserService: S10ParserService,
  ) {}

  // Listar obras civiles registradas segun rol y permisos de usuario
  async findAll(filter: ProjectFilterDto, user: { id: string; role: Role }) {
    const where: Prisma.ProjectWhereInput = {};

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.search) {
      const term = filter.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { budgetCode: { contains: term, mode: 'insensitive' } },
      ];
    }

    // Para almaceneros se restringe a proyectos cuyo almacen tenga asignado
    if (user.role === Role.WAREHOUSE_KEEPER) {
      const userWarehouses = await this.prisma.userWarehouse.findMany({
        where: { userId: user.id },
        select: { warehouseId: true },
      });
      const allowedIds = userWarehouses.map((uw) => uw.warehouseId);
      where.warehouse = {
        id: { in: allowedIds },
      };
    }

    return this.prisma.project.findMany({
      where,
      include: {
        warehouse: {
          select: { id: true, name: true, type: true, isActive: true },
        },
        _count: {
          select: { requirements: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Consultar detalle completo de un proyecto civil
  async findOne(id: string, user: { id: string; role: Role }) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            type: true,
            isTemporary: true,
            isActive: true,
          },
        },
        requirements: {
          include: {
            item: {
              select: {
                id: true,
                sku: true,
                name: true,
                baseUnit: true,
                type: true,
              },
            },
          },
          orderBy: { item: { name: 'asc' } },
        },
        _count: {
          select: { transfers: true, movements: true, requirements: true },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Proyecto civil no encontrado');
    }

    // Validar permiso si el usuario es almacenero
    if (user.role === Role.WAREHOUSE_KEEPER) {
      if (!project.warehouse) {
        throw new ForbiddenException(
          'No tiene autorizacion para acceder a este proyecto',
        );
      }
      const userWh = await this.prisma.userWarehouse.findUnique({
        where: {
          userId_warehouseId: {
            userId: user.id,
            warehouseId: project.warehouse.id,
          },
        },
      });
      if (!userWh) {
        throw new ForbiddenException(
          'No tiene autorizacion para acceder al almacen asignado a este proyecto',
        );
      }
    }

    return project;
  }

  // Registrar nuevo proyecto civil y crear automaticamente su almacen de obra temporal
  async create(dto: CreateProjectDto) {
    const nameFormatted = dto.name.trim();

    const existingProject = await this.prisma.project.findFirst({
      where: { name: { equals: nameFormatted, mode: 'insensitive' } },
    });

    if (existingProject) {
      throw new ConflictException(
        'Ya existe un proyecto registrado con ese nombre',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Crear el proyecto civil en estado inicial PLANNING
      const project = await tx.project.create({
        data: {
          name: nameFormatted,
          budgetCode: dto.budgetCode?.trim() || null,
          status: dto.status ?? ProjectStatus.PLANNING,
        },
      });

      // 2. Determinar nombre unico para el almacen de obra
      let preferredWhName = dto.warehouseName?.trim();
      if (!preferredWhName) {
        if (
          project.name.toLowerCase().startsWith('obra ') ||
          project.name.toLowerCase().startsWith('almacen ')
        ) {
          preferredWhName = `Almacen ${project.name}`;
        } else {
          preferredWhName = `Almacen Obra ${project.name}`;
        }
      }
      let finalWhName = preferredWhName;

      const existingWh = await tx.warehouse.findFirst({
        where: { name: finalWhName },
      });
      if (existingWh) {
        finalWhName = `${preferredWhName} - ${project.id.slice(0, 8)}`;
      }

      // 3. Crear el almacen de obra temporal vinculado
      const warehouse = await tx.warehouse.create({
        data: {
          name: finalWhName,
          type: WarehouseType.PROJECT_SITE,
          isTemporary: true,
          isActive: true,
          projectId: project.id,
        },
      });

      return {
        ...project,
        warehouse: {
          id: warehouse.id,
          name: warehouse.name,
        },
      };
    });
  }

  // Actualizar informacion basica del proyecto
  async update(id: string, dto: UpdateProjectDto) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException('Proyecto civil no encontrado');
    }

    if (dto.name && dto.name.trim() !== project.name) {
      const duplicate = await this.prisma.project.findFirst({
        where: {
          name: { equals: dto.name.trim(), mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (duplicate) {
        throw new ConflictException(
          'Ya existe otro proyecto registrado con ese nombre',
        );
      }
    }

    return this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name ? dto.name.trim() : undefined,
        budgetCode: dto.budgetCode !== undefined ? dto.budgetCode.trim() : undefined,
        status: dto.status,
      },
      include: {
        warehouse: {
          select: { id: true, name: true, type: true, isActive: true },
        },
      },
    });
  }

  // Ingesta de presupuesto S10 via payload estructurado JSON
  async ingestS10(id: string, dto: IngestS10Dto) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException('Proyecto civil no encontrado');
    }

    if (
      project.status === ProjectStatus.LIQUIDATED ||
      project.status === ProjectStatus.ARCHIVED
    ) {
      throw new BadRequestException(
        'No se pueden cargar requerimientos a un proyecto en estado LIQUIDATED o ARCHIVED',
      );
    }

    // Actualizar budgetCode si no estaba registrado
    if (dto.budgetCode?.trim() && !project.budgetCode) {
      await this.prisma.project.update({
        where: { id },
        data: { budgetCode: dto.budgetCode.trim() },
      });
    }

    // Filtrar partidas de mano de obra (01) o subcontratos (04)
    const validResources = dto.resources.filter(
      (r) => !this.s10ParserService.isDiscardedResource(r.s10Code, r.s10RawName),
    );

    // Cargar diccionarios de homologacion y catalogo maestro
    const [aliases, items] = await Promise.all([
      this.prisma.itemAlias.findMany({
        include: { item: true },
      }),
      this.prisma.item.findMany(),
    ]);

    const aliasByName = new Map<string, (typeof aliases)[0]>();
    const aliasByCode = new Map<string, (typeof aliases)[0]>();
    for (const a of aliases) {
      aliasByName.set(a.s10RawName.trim().toUpperCase(), a);
      if (a.s10Code?.trim()) {
        aliasByCode.set(a.s10Code.trim().toUpperCase(), a);
      }
    }

    const itemByName = new Map<string, (typeof items)[0]>();
    const itemBySku = new Map<string, (typeof items)[0]>();
    for (const item of items) {
      itemByName.set(item.name.trim().toUpperCase(), item);
      itemBySku.set(item.sku.trim().toUpperCase(), item);
    }

    const mappedDemands = new Map<string, number>();
    const unmappedItems: Array<{
      s10Code?: string;
      s10RawName: string;
      s10Unit?: string;
      quantity: number;
    }> = [];

    for (const res of validResources) {
      const cleanRawName = res.s10RawName.trim().toUpperCase();
      const cleanCode = res.s10Code?.trim().toUpperCase();

      let matchedItemId: string | undefined;
      let conversionFactor = 1.0;

      // 1. Intento por alias exacto con descripcion cruda
      if (aliasByName.has(cleanRawName)) {
        const alias = aliasByName.get(cleanRawName)!;
        matchedItemId = alias.itemId;
        conversionFactor = Number(alias.conversionFactor);
      } else if (cleanCode && aliasByCode.has(cleanCode)) {
        // 2. Intento por alias con codigo S10
        const alias = aliasByCode.get(cleanCode)!;
        matchedItemId = alias.itemId;
        conversionFactor = Number(alias.conversionFactor);
      } else if (itemByName.has(cleanRawName)) {
        // 3. Intento por nombre directo en catalogo maestro
        const it = itemByName.get(cleanRawName)!;
        matchedItemId = it.id;
      } else if (itemBySku.has(cleanRawName)) {
        // 4. Intento por SKU directo
        const it = itemBySku.get(cleanRawName)!;
        matchedItemId = it.id;
      }

      if (matchedItemId) {
        const baseQty = Number((res.quantity * conversionFactor).toFixed(4));
        const prev = mappedDemands.get(matchedItemId) ?? 0;
        mappedDemands.set(matchedItemId, Number((prev + baseQty).toFixed(4)));
      } else {
        unmappedItems.push({
          s10Code: res.s10Code,
          s10RawName: res.s10RawName,
          s10Unit: res.s10Unit,
          quantity: res.quantity,
        });
      }
    }

    // Persistir o actualizar ProjectRequirement en transaccion atomica
    let requirementsCreatedOrUpdated = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const [itemId, baseQty] of mappedDemands.entries()) {
        const existingReq = await tx.projectRequirement.findUnique({
          where: {
            projectId_itemId: {
              projectId: id,
              itemId,
            },
          },
        });

        if (existingReq) {
          const newRequired = Number(
            (Number(existingReq.requiredQty) + baseQty).toFixed(4),
          );
          await tx.projectRequirement.update({
            where: { id: existingReq.id },
            data: { requiredQty: newRequired },
          });
        } else {
          await tx.projectRequirement.create({
            data: {
              projectId: id,
              itemId,
              requiredQty: baseQty,
              allocatedQty: 0,
              consumedQty: 0,
            },
          });
        }
        requirementsCreatedOrUpdated++;
      }
    });

    return {
      projectId: id,
      totalProcessed: dto.resources.length,
      mappedCount: mappedDemands.size,
      unmappedCount: unmappedItems.length,
      unmappedItems,
      requirementsCreatedOrUpdated,
    };
  }

  // Importacion de archivo delimitado S10 (CSV / TXT)
  async importS10File(
    id: string,
    file: { buffer?: Buffer; originalname?: string },
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Archivo no proporcionado o vacio');
    }

    const parseResult = this.s10ParserService.parseS10Buffer(file.buffer);

    const ingestResult = await this.ingestS10(id, {
      resources: parseResult.resources,
    });

    return {
      projectId: id,
      totalRowsParsed: parseResult.totalRowsParsed,
      materialsAndEquipmentRows: parseResult.materialsAndEquipmentRows,
      mappedItems: ingestResult.mappedCount,
      unmappedItems: ingestResult.unmappedItems,
      requirementsCreatedOrUpdated: ingestResult.requirementsCreatedOrUpdated,
    };
  }

  // Generar la Matriz de Brechas (Gap Analysis) en tiempo real
  async getGapAnalysis(id: string, user: { id: string; role: Role }) {
    await this.findOne(id, user);

    const requirements = await this.prisma.projectRequirement.findMany({
      where: { projectId: id },
      include: {
        item: {
          select: {
            id: true,
            sku: true,
            name: true,
            baseUnit: true,
            type: true,
          },
        },
        project: {
          select: { id: true, name: true },
        },
      },
      orderBy: { item: { name: 'asc' } },
    });

    if (requirements.length === 0) {
      const proj = await this.prisma.project.findUnique({
        where: { id },
        select: { id: true, name: true },
      });
      return {
        projectId: id,
        projectName: proj?.name ?? '',
        analysis: [],
      };
    }

    const itemIds = requirements.map((r) => r.itemId);

    // Obtener almacenes de tipo CENTRAL activos
    const centralWarehouses = await this.prisma.warehouse.findMany({
      where: {
        type: WarehouseType.CENTRAL,
        isActive: true,
      },
      select: { id: true },
    });
    const centralWarehouseIds = centralWarehouses.map((w) => w.id);

    // Consultar stock neto disponible en Almacenes Centrales
    const centralStocks = await this.prisma.stock.findMany({
      where: {
        warehouseId: { in: centralWarehouseIds },
        itemId: { in: itemIds },
      },
    });

    const centralAvailableMap = new Map<string, number>();
    for (const cs of centralStocks) {
      const available = Math.max(
        0,
        Number(cs.physicalQty) - Number(cs.reservedQty),
      );
      const current = centralAvailableMap.get(cs.itemId) ?? 0;
      centralAvailableMap.set(
        cs.itemId,
        Number((current + available).toFixed(4)),
      );
    }

    const analysis = requirements.map((req) => {
      const requiredQty = Number(req.requiredQty);
      const allocatedQty = Number(req.allocatedQty);
      const consumedQty = Number(req.consumedQty);

      // Cantidad pendiente por abastecer
      const pendingToSupply = Math.max(
        0,
        Number((requiredQty - allocatedQty - consumedQty).toFixed(4)),
      );

      // Porcentaje de cumplimiento
      const fulfillmentPercentage =
        requiredQty > 0
          ? Math.min(
              100,
              Number(
                (((allocatedQty + consumedQty) / requiredQty) * 100).toFixed(1),
              ),
            )
          : 100;

      // Stock disponible consolidado en Almacenes Centrales
      const centralAvailableStock =
        centralAvailableMap.get(req.itemId) ?? 0;

      // Deficit a comprar para satisfacer lo pendiente
      const purchaseDeficit = Math.max(
        0,
        Number((pendingToSupply - centralAvailableStock).toFixed(4)),
      );

      return {
        itemId: req.itemId,
        sku: req.item.sku,
        itemName: req.item.name,
        baseUnit: req.item.baseUnit,
        requiredQty: requiredQty.toFixed(4),
        allocatedQty: allocatedQty.toFixed(4),
        consumedQty: consumedQty.toFixed(4),
        pendingToSupply: pendingToSupply.toFixed(4),
        fulfillmentPercentage,
        centralAvailableStock: centralAvailableStock.toFixed(4),
        purchaseDeficit: purchaseDeficit.toFixed(4),
      };
    });

    const projectName = requirements[0]?.project?.name ?? '';

    return {
      projectId: id,
      projectName,
      analysis,
    };
  }

  // Reservar stock logico en Almacen Central para el proyecto (Opcion A)
  async allocateStock(id: string, dto: AllocateStockDto) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException('Proyecto civil no encontrado');
    }

    if (
      project.status === ProjectStatus.LIQUIDATED ||
      project.status === ProjectStatus.ARCHIVED
    ) {
      throw new BadRequestException(
        'No se pueden reservar existencias para un proyecto liquidado o archivado',
      );
    }

    const centralWarehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.centralWarehouseId },
    });
    if (!centralWarehouse) {
      throw new NotFoundException('Almacen central no encontrado');
    }
    if (centralWarehouse.type !== WarehouseType.CENTRAL) {
      throw new BadRequestException(
        'El almacen especificado para la reserva debe ser de tipo CENTRAL',
      );
    }
    if (!centralWarehouse.isActive) {
      throw new BadRequestException('El almacen central no se encuentra activo');
    }

    const requirement = await this.prisma.projectRequirement.findUnique({
      where: {
        projectId_itemId: {
          projectId: id,
          itemId: dto.itemId,
        },
      },
    });
    if (!requirement) {
      throw new BadRequestException(
        'El insumo no forma parte de los requerimientos presupuestados del proyecto',
      );
    }

    const stock = await this.prisma.stock.findUnique({
      where: {
        warehouseId_itemId: {
          warehouseId: dto.centralWarehouseId,
          itemId: dto.itemId,
        },
      },
    });

    const currentPhysical = stock ? Number(stock.physicalQty) : 0;
    const currentReserved = stock ? Number(stock.reservedQty) : 0;
    const availableStock = currentPhysical - currentReserved;

    if (availableStock < dto.quantityToAllocate) {
      throw new BadRequestException(
        `Stock disponible insuficiente en el almacen central para realizar la reserva. Disponible: ${availableStock.toFixed(4)}, Solicitado: ${dto.quantityToAllocate}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const newReserved = Number(
        (currentReserved + dto.quantityToAllocate).toFixed(4),
      );

      await tx.stock.update({
        where: {
          warehouseId_itemId: {
            warehouseId: dto.centralWarehouseId,
            itemId: dto.itemId,
          },
        },
        data: {
          reservedQty: newReserved,
        },
      });

      const newAllocated = Number(
        (Number(requirement.allocatedQty) + dto.quantityToAllocate).toFixed(4),
      );

      await tx.projectRequirement.update({
        where: { id: requirement.id },
        data: {
          allocatedQty: newAllocated,
        },
      });

      return {
        projectId: id,
        itemId: dto.itemId,
        allocatedQty: newAllocated.toFixed(4),
        centralWarehouseAvailableStock: (
          availableStock - dto.quantityToAllocate
        ).toFixed(4),
      };
    });
  }

  // Liberar stock reservado en Almacen Central
  async releaseStock(id: string, dto: ReleaseStockDto) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException('Proyecto civil no encontrado');
    }

    const centralWarehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.centralWarehouseId },
    });
    if (!centralWarehouse) {
      throw new NotFoundException('Almacen central no encontrado');
    }
    if (centralWarehouse.type !== WarehouseType.CENTRAL) {
      throw new BadRequestException(
        'El almacen especificado para liberar reserva debe ser de tipo CENTRAL',
      );
    }

    const requirement = await this.prisma.projectRequirement.findUnique({
      where: {
        projectId_itemId: {
          projectId: id,
          itemId: dto.itemId,
        },
      },
    });
    if (!requirement) {
      throw new BadRequestException(
        'El insumo no forma parte de los requerimientos presupuestados del proyecto',
      );
    }

    const currentAllocated = Number(requirement.allocatedQty);
    if (currentAllocated < dto.quantityToRelease) {
      throw new BadRequestException(
        `La cantidad a liberar (${dto.quantityToRelease}) supera la cantidad reservada para el proyecto (${currentAllocated})`,
      );
    }

    const stock = await this.prisma.stock.findUnique({
      where: {
        warehouseId_itemId: {
          warehouseId: dto.centralWarehouseId,
          itemId: dto.itemId,
        },
      },
    });

    const currentReserved = stock ? Number(stock.reservedQty) : 0;
    if (currentReserved < dto.quantityToRelease) {
      throw new BadRequestException(
        `La cantidad a liberar (${dto.quantityToRelease}) supera la reserva registrada en el almacen central (${currentReserved})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const newReserved = Number(
        (currentReserved - dto.quantityToRelease).toFixed(4),
      );

      await tx.stock.update({
        where: {
          warehouseId_itemId: {
            warehouseId: dto.centralWarehouseId,
            itemId: dto.itemId,
          },
        },
        data: {
          reservedQty: newReserved,
        },
      });

      const newAllocated = Number(
        (currentAllocated - dto.quantityToRelease).toFixed(4),
      );

      await tx.projectRequirement.update({
        where: { id: requirement.id },
        data: {
          allocatedQty: newAllocated,
        },
      });

      return {
        projectId: id,
        itemId: dto.itemId,
        allocatedQty: newAllocated.toFixed(4),
        releasedQty: dto.quantityToRelease.toFixed(4),
      };
    });
  }

  // Protocolo formal de liquidacion y cierre de obra
  async liquidate(id: string, dto?: LiquidateProjectDto) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { warehouse: true },
    });

    if (!project) {
      throw new NotFoundException('Proyecto civil no encontrado');
    }

    if (project.status === ProjectStatus.LIQUIDATED) {
      throw new ConflictException('El proyecto ya ha sido liquidado');
    }

    const errorMessages: string[] = [];
    const warehouse = project.warehouse;

    if (warehouse) {
      // Condicion 1: Stock fisico cero en el almacen de obra
      const stocks = await this.prisma.stock.findMany({
        where: { warehouseId: warehouse.id },
      });
      const totalPhysical = stocks.reduce(
        (acc, s) => acc + Number(s.physicalQty),
        0,
      );
      if (totalPhysical > 0) {
        errorMessages.push(
          `No se puede liquidar la obra: existen ${totalPhysical} unidades de stock fisico remanente en el almacen de obra`,
        );
      }

      // Condicion 2: Cero prestamos de herramientas abiertos
      const openCustodies = await this.prisma.toolCustody.count({
        where: {
          warehouseId: warehouse.id,
          returnDate: null,
        },
      });
      if (openCustodies > 0) {
        errorMessages.push(
          `No se puede liquidar la obra: existen ${openCustodies} vales de herramientas pendientes de devolucion`,
        );
      }

      // Condicion 3: Cero transferencias en transito o pendientes
      const pendingTransfers = await this.prisma.transfer.count({
        where: {
          OR: [
            { originWarehouseId: warehouse.id },
            { destWarehouseId: warehouse.id },
          ],
          status: {
            in: [TransferStatus.PENDING, TransferStatus.IN_TRANSIT],
          },
        },
      });
      if (pendingTransfers > 0) {
        errorMessages.push(
          `No se puede liquidar la obra: existen ${pendingTransfers} transferencias en transito o pendientes`,
        );
      }

      if (errorMessages.length > 0) {
        throw new BadRequestException(errorMessages);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedProject = await tx.project.update({
        where: { id },
        data: {
          status: ProjectStatus.LIQUIDATED,
        },
      });

      let warehouseDeactivated: { id: string; isActive: boolean } | null = null;
      if (warehouse) {
        const updatedWarehouse = await tx.warehouse.update({
          where: { id: warehouse.id },
          data: {
            isActive: false,
          },
        });
        warehouseDeactivated = {
          id: updatedWarehouse.id,
          isActive: updatedWarehouse.isActive,
        };
      }

      return {
        id: updatedProject.id,
        name: updatedProject.name,
        status: updatedProject.status,
        liquidatedAt: new Date(),
        notes: dto?.liquidationNotes?.trim() || null,
        warehouseDeactivated,
      };
    });
  }
}
