import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { AssignWarehousesDto } from './dto/assign-warehouses.dto.js';

// Selector estandar de usuario omitiendo contrasena
const userSelectWithoutPassword = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  assignedWarehouses: {
    select: {
      id: true,
      warehouseId: true,
      isDefault: true,
      warehouse: {
        select: {
          id: true,
          name: true,
          type: true,
          isTemporary: true,
          isActive: true,
        },
      },
    },
  },
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Registrar un nuevo usuario con hash de contrasena y almacenes opcionales
  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (existing) {
      throw new ConflictException(
        'El correo electronico ya se encuentra registrado en el sistema',
      );
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase().trim(),
          passwordHash,
          fullName: dto.fullName.trim(),
          role: dto.role,
          isActive: dto.isActive ?? true,
        },
      });

      if (dto.warehouseIds && dto.warehouseIds.length > 0) {
        // Validar que los almacenes existan
        const foundWarehouses = await tx.warehouse.findMany({
          where: { id: { in: dto.warehouseIds } },
          select: { id: true },
        });

        if (foundWarehouses.length !== dto.warehouseIds.length) {
          throw new BadRequestException(
            'Uno o mas almacenes especificados no existen',
          );
        }

        const userWarehousesData = dto.warehouseIds.map((wId) => ({
          userId: user.id,
          warehouseId: wId,
          isDefault: dto.defaultWarehouseId ? dto.defaultWarehouseId === wId : false,
        }));

        await tx.userWarehouse.createMany({
          data: userWarehousesData,
        });
      }

      return tx.user.findUnique({
        where: { id: user.id },
        select: userSelectWithoutPassword,
      });
    });
  }

  // Obtener listado de todos los usuarios
  async findAll() {
    return this.prisma.user.findMany({
      select: userSelectWithoutPassword,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Buscar un usuario por su identificador unico
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelectWithoutPassword,
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  // Buscar usuario por correo incluyendo contrasena para autenticacion
  async findByEmailForAuth(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        assignedWarehouses: {
          include: {
            warehouse: true,
          },
        },
      },
    });
  }

  // Actualizar datos del usuario
  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    const updateData: {
      fullName?: string;
      role?: typeof dto.role;
      isActive?: boolean;
      passwordHash?: string;
    } = {};

    if (dto.fullName) {
      updateData.fullName = dto.fullName.trim();
    }
    if (dto.role !== undefined) {
      updateData.role = dto.role;
    }
    if (dto.isActive !== undefined) {
      updateData.isActive = dto.isActive;
    }
    if (dto.password) {
      updateData.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: userSelectWithoutPassword,
    });
  }

  // Asignar almacenes autorizados a un usuario
  async assignWarehouses(userId: string, dto: AssignWarehousesDto) {
    await this.findOne(userId);

    // Verificar existencia de almacenes solicitados
    const foundWarehouses = await this.prisma.warehouse.findMany({
      where: { id: { in: dto.warehouseIds } },
      select: { id: true },
    });

    if (foundWarehouses.length !== dto.warehouseIds.length) {
      throw new BadRequestException(
        'Uno o mas almacenes especificados no existen en el sistema',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Eliminar asignaciones previas
      await tx.userWarehouse.deleteMany({
        where: { userId },
      });

      // Crear nuevas asignaciones
      const data = dto.warehouseIds.map((warehouseId) => ({
        userId,
        warehouseId,
        isDefault: dto.defaultWarehouseId
          ? dto.defaultWarehouseId === warehouseId
          : false,
      }));

      await tx.userWarehouse.createMany({
        data,
      });

      return tx.user.findUnique({
        where: { id: userId },
        select: userSelectWithoutPassword,
      });
    });
  }
}
