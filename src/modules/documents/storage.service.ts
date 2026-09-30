import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

export interface SavedFileResult {
  storedPath: string;
  mimeType: string;
  fileSizeBytes: number;
}

@Injectable()
export class StorageService {
  private readonly baseUploadDir: string;

  constructor(private readonly configService: ConfigService) {
    const configuredDir =
      this.configService.get<string>('uploads.dir') ?? './uploads';
    this.baseUploadDir = path.resolve(process.cwd(), configuredDir);
  }

  // Obtener ruta absoluta segura validando que no haya path traversal
  getAbsoluteFilePath(storedPath: string): string {
    const cleanStored = storedPath.replace(/^[/\\]+/, '');
    const absolute = path.resolve(this.baseUploadDir, cleanStored);

    if (!absolute.startsWith(this.baseUploadDir)) {
      throw new BadRequestException('Ruta de archivo no permitida');
    }

    return absolute;
  }

  // Generar ruta relativa por categoria y fecha
  private generateRelativePath(category: string, extension: string): {
    relativeDir: string;
    relativePath: string;
    fullTargetDir: string;
    fullFilePath: string;
  } {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const fileId = crypto.randomUUID();

    const relativeDir = path.join(category, year, month);
    const fileName = `${fileId}.${extension}`;
    const relativePath = path.join(relativeDir, fileName).replace(/\\/g, '/');

    const fullTargetDir = path.resolve(this.baseUploadDir, relativeDir);
    const fullFilePath = path.resolve(fullTargetDir, fileName);

    return {
      relativeDir,
      relativePath,
      fullTargetDir,
      fullFilePath,
    };
  }

  // Procesar imagen con Sharp: redimensionar a max 1080p y convertir a WebP
  async processAndSaveImage(
    buffer: Buffer,
    category: string,
  ): Promise<SavedFileResult> {
    try {
      const processedBuffer = await sharp(buffer)
        .resize({
          width: 1920,
          height: 1080,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();

      const { relativePath, fullTargetDir, fullFilePath } =
        this.generateRelativePath(category, 'webp');

      await fs.promises.mkdir(fullTargetDir, { recursive: true });
      await fs.promises.writeFile(fullFilePath, processedBuffer);

      return {
        storedPath: relativePath,
        mimeType: 'image/webp',
        fileSizeBytes: processedBuffer.length,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Error al procesar la imagen con Sharp: ${error instanceof Error ? error.message : 'archivo invalido'}`,
      );
    }
  }

  // Validar cabecera PDF y guardar archivo en disco
  async savePdf(buffer: Buffer, category: string): Promise<SavedFileResult> {
    // Validar cabecera magica de archivo PDF (%PDF-)
    if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException(
        'El archivo no cuenta con una cabecera valida de formato PDF',
      );
    }

    const { relativePath, fullTargetDir, fullFilePath } =
      this.generateRelativePath(category, 'pdf');

    await fs.promises.mkdir(fullTargetDir, { recursive: true });
    await fs.promises.writeFile(fullFilePath, buffer);

    return {
      storedPath: relativePath,
      mimeType: 'application/pdf',
      fileSizeBytes: buffer.length,
    };
  }

  // Eliminar archivo fisico del almacenamiento
  async deleteFile(storedPath: string): Promise<void> {
    try {
      const fullPath = this.getAbsoluteFilePath(storedPath);
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
      }
    } catch {
      // Ignorar error si el archivo ya no existe fisicamente
    }
  }

  // Abrir stream de lectura para descarga segura
  getFileStream(storedPath: string): {
    stream: fs.ReadStream;
    absolutePath: string;
  } {
    const absolutePath = this.getAbsoluteFilePath(storedPath);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException(
        'El archivo fisico no existe en el almacenamiento',
      );
    }
    const stream = fs.createReadStream(absolutePath);
    return { stream, absolutePath };
  }
}
