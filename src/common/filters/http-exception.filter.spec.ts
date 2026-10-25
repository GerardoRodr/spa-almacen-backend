import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AllExceptionsFilter } from './http-exception.filter.js';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockRequest: Partial<Request>;
  let mockResponse: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();

    mockRequest = {
      method: 'GET',
      url: '/api/v1/test',
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockHost = {
      switchToHttp: () => ({
        getRequest: () => mockRequest as Request,
        getResponse: () => mockResponse as unknown as Response,
      }),
    } as unknown as ArgumentsHost;
  });

  it('debe aplanar la respuesta y exponer message cuando exceptionResponse es un string', () => {
    const exception = new HttpException('Recurso no disponible', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        path: '/api/v1/test',
        message: 'Recurso no disponible',
        error: 'HttpException',
        timestamp: expect.any(String),
      }),
    );
  });

  it('debe extraer message directo en el primer nivel cuando es un objeto con message', () => {
    const exception = new NotFoundException('Insumo no encontrado');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        path: '/api/v1/test',
        message: 'Insumo no encontrado',
        error: 'NotFoundException',
        timestamp: expect.any(String),
      }),
    );
  });

  it('debe preservar un arreglo de validaciones en message para el frontend', () => {
    const validationErrors = [
      'El campo nombre es obligatorio',
      'El stock debe ser un numero positivo',
    ];
    const exception = new BadRequestException(validationErrors);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        path: '/api/v1/test',
        message: validationErrors,
        error: 'BadRequestException',
        timestamp: expect.any(String),
      }),
    );
  });

  it('debe usar exception.message si exceptionResponse es un objeto sin propiedad message', () => {
    const exception = new HttpException({ customCode: 'CUSTOM_ERR' }, HttpStatus.CONFLICT);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        path: '/api/v1/test',
        message: exception.message,
        error: 'HttpException',
        timestamp: expect.any(String),
      }),
    );
  });

  it('debe responder 500 con InternalServerError y mensaje generico ante errores no controlados', () => {
    const error = new Error('Fallo critico en base de datos');

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        path: '/api/v1/test',
        message: 'Error interno del servidor',
        error: 'InternalServerError',
        timestamp: expect.any(String),
      }),
    );
  });

  it('debe manejar excepciones desconocidas no instancias de Error', () => {
    filter.catch('Error desconocido tipo string', mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        path: '/api/v1/test',
        message: 'Error interno del servidor',
        error: 'InternalServerError',
        timestamp: expect.any(String),
      }),
    );
  });
});
