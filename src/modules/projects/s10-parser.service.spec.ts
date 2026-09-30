import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import iconv from 'iconv-lite';
import { S10ParserService } from './s10-parser.service.js';

describe('S10ParserService', () => {
  let service: S10ParserService;

  beforeEach(() => {
    service = new S10ParserService();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('decodeBuffer', () => {
    it('debe decodificar correctamente texto en UTF-8', () => {
      const text = 'CODIGO;DESCRIPCION;UNIDAD;CANTIDAD\n020101;ACERO DE REFUERZO;KG;500';
      const buffer = Buffer.from(text, 'utf-8');
      const decoded = service.decodeBuffer(buffer);
      expect(decoded).toBe(text);
    });

    it('debe decodificar correctamente texto en Windows-1252 con enie y tildes', () => {
      const text = 'CODIGO;DESCRIPCION;UNIDAD;CANTIDAD\n020101;TUBERIA DE ALBANILERIA;M;120';
      const buffer = iconv.encode(text, 'win1252');
      const decoded = service.decodeBuffer(buffer);
      expect(decoded).toContain('TUBERIA DE ALBANILERIA');
    });
  });

  describe('detectDelimiter', () => {
    it('debe detectar punto y coma cuando predomina', () => {
      const text = 'CODIGO;DESCRIPCION;UNIDAD;CANTIDAD\n0201;CEMENTO;BOL;100';
      expect(service.detectDelimiter(text)).toBe(';');
    });

    it('debe detectar coma cuando predomina', () => {
      const text = 'codigo,descripcion,unidad,cantidad\n0201,CEMENTO,BOL,100';
      expect(service.detectDelimiter(text)).toBe(',');
    });
  });

  describe('parseQuantity', () => {
    it('debe parsear enteros y decimales con punto', () => {
      expect(service.parseQuantity('2500')).toBe(2500);
      expect(service.parseQuantity('1250.75')).toBe(1250.75);
    });

    it('debe parsear decimales con coma', () => {
      expect(service.parseQuantity('300,50')).toBe(300.5);
    });

    it('debe parsear formato con separador de miles', () => {
      expect(service.parseQuantity('1,500.25')).toBe(1500.25);
      expect(service.parseQuantity('2.500,50')).toBe(2500.5);
    });

    it('debe retornar 0 para valores no numericos o vacios', () => {
      expect(service.parseQuantity('')).toBe(0);
      expect(service.parseQuantity('invalido')).toBe(0);
    });
  });

  describe('isDiscardedResource', () => {
    it('debe descartar recursos con codigo que inicia con 01 (Mano de Obra)', () => {
      expect(service.isDiscardedResource('0101010001', 'OPERARIO')).toBe(true);
      expect(service.isDiscardedResource('0101010002', 'PEON')).toBe(true);
    });

    it('debe descartar recursos con codigo que inicia con 04 (Subcontratos)', () => {
      expect(service.isDiscardedResource('0401010001', 'SUBCONTRATO EXCAVACION')).toBe(true);
    });

    it('debe descartar recursos por grupo o descripcion explicita', () => {
      expect(service.isDiscardedResource(undefined, 'MANO DE OBRA CALIFICADA', '01 MANO DE OBRA')).toBe(true);
      expect(service.isDiscardedResource(undefined, 'SUBCONTRATO DE PINTURA', 'SUBCONTRATOS')).toBe(true);
    });

    it('debe admitir recursos de tipo 02 (Materiales) y 03 (Equipos)', () => {
      expect(service.isDiscardedResource('0204010001', 'CEMENTO PORTLAND TIPO I')).toBe(false);
      expect(service.isDiscardedResource('0301010002', 'MEZCLADORA DE CONCRETO')).toBe(false);
      expect(service.isDiscardedResource(undefined, 'ARENA GRUESA', '02 MATERIALES')).toBe(false);
    });
  });

  describe('parseS10Buffer', () => {
    it('debe lanzar BadRequestException si el buffer esta vacio', () => {
      expect(() => service.parseS10Buffer(Buffer.alloc(0))).toThrow(
        BadRequestException,
      );
    });

    it('debe parsear archivo CSV completo descartando mano de obra y subcontratos', () => {
      const csvContent = [
        'Codigo;Descripcion;Unidad;Cantidad',
        '0101010001;CAPATAZ DE OBRA;HH;120',
        '0204010001;CEMENTO PORTLAND TIPO I;BOL;2500',
        '0202010005;ACERO CORRUGADO 1/2;VAR;800',
        '0301010002;MEZCLADORA DE TROMPO 9P3;HM;40',
        '0401010005;SUBCONTRATO DE INSTALACIONES;GLB;1',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = service.parseS10Buffer(buffer);

      expect(result.totalRowsParsed).toBe(5);
      expect(result.discardedRows).toBe(2); // Capataz (01) y Subcontrato (04)
      expect(result.materialsAndEquipmentRows).toBe(3); // Cemento, Acero y Mezcladora
      expect(result.resources).toHaveLength(3);

      expect(result.resources[0].s10Code).toBe('0204010001');
      expect(result.resources[0].s10RawName).toBe('CEMENTO PORTLAND TIPO I');
      expect(result.resources[0].s10Unit).toBe('BOL');
      expect(result.resources[0].quantity).toBe(2500);

      expect(result.resources[1].s10Code).toBe('0202010005');
      expect(result.resources[1].quantity).toBe(800);

      expect(result.resources[2].s10Code).toBe('0301010002');
      expect(result.resources[2].quantity).toBe(40);
    });
  });
});
