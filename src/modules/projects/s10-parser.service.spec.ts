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
      const text = '0201010001;ACERO DE REFUERZO;KG;500;3.80;1900.00';
      const buffer = Buffer.from(text, 'utf-8');
      const decoded = service.decodeBuffer(buffer);
      expect(decoded).toBe(text);
    });

    it('debe decodificar correctamente texto en Windows-1252 con enie y tildes', () => {
      const text = '0201010002;TUBERIA DE ALBANILERIA;M;120;15.00;1800.00';
      const buffer = iconv.encode(text, 'win1252');
      const decoded = service.decodeBuffer(buffer);
      expect(decoded).toContain('TUBERIA DE ALBANILERIA');
    });
  });

  describe('detectDelimiter', () => {
    it('debe detectar punto y coma cuando predomina', () => {
      const text = '0201010001;CEMENTO;BOL;100;26.50;2650.00';
      expect(service.detectDelimiter(text)).toBe(';');
    });

    it('debe detectar coma cuando predomina', () => {
      const text = '0201010001,CEMENTO,BOL,100,26.50,2650.00';
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

  describe('isPercentageValue', () => {
    it('debe identificar cadenas con simbolo de porcentaje', () => {
      expect(service.isPercentageValue('12.5%')).toBe(true);
      expect(service.isPercentageValue(' 0.45% ')).toBe(true);
      expect(service.isPercentageValue('26.50')).toBe(false);
      expect(service.isPercentageValue(26.5)).toBe(false);
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

    it('debe admitir recursos de tipo 02 (Materiales) y 03 (Equipos)', () => {
      expect(service.isDiscardedResource('0204010001', 'CEMENTO PORTLAND TIPO I')).toBe(false);
      expect(service.isDiscardedResource('0301010002', 'MEZCLADORA DE CONCRETO')).toBe(false);
    });

    it('debe descartar prefijos no reconocidos', () => {
      expect(service.isDiscardedResource('0501010001')).toBe(true);
      expect(service.isDiscardedResource('9901010001')).toBe(true);
    });

    it('debe descartar por descripcion si no se proporciona codigo', () => {
      expect(service.isDiscardedResource(undefined, 'MANO DE OBRA CALIFICADA')).toBe(true);
      expect(service.isDiscardedResource(undefined, 'SUBCONTRATO DE PINTURA')).toBe(true);
      expect(service.isDiscardedResource(undefined, 'ARENA GRUESA')).toBe(false);
    });
  });

  describe('resolveUnitPrice', () => {
    it('debe resolver precio unitario directo cuando existen precio y parcial (+4 y +5 positivos)', () => {
      const price = service.resolveUnitPrice(2500, '26.50', '66250.00');
      expect(price).toBe(26.5);
    });

    it('debe calcular precio unitario dividiendo parcial entre cantidad cuando la celda posterior es porcentaje', () => {
      // 66250 / 2500 = 26.5
      const price = service.resolveUnitPrice(2500, '66250.00', '14.25%');
      expect(price).toBe(26.5);
    });

    it('debe calcular precio unitario cuando la celda posterior esta vacia', () => {
      // 3600 / 100 = 36
      const price = service.resolveUnitPrice(100, '3600.00', '');
      expect(price).toBe(36);
    });

    it('debe retornar undefined si la cantidad es cero o el importe es no positivo', () => {
      expect(service.resolveUnitPrice(0, '26.50', '265.00')).toBeUndefined();
      expect(service.resolveUnitPrice(100, '0', '0')).toBeUndefined();
    });

    it('debe calcular precio unitario dividiendo parcial entre cantidad en reporte con incidencia sin signo % en datos', () => {
      // Cantidad: 8.10, Celda1 (Parcial): 99.52, Celda2 (Incidencia sin %): 98.54 con isIncidence=true
      // 99.52 / 8.10 = 12.286419... -> 12.2864
      const priceWithFlag = service.resolveUnitPrice(8.1, '99.52', '98.54', true);
      expect(priceWithFlag).toBe(12.2864);

      // Mismo caso sin flag explicita: la heuristica matematica detecta que 8.10 * 99.52 != 98.54
      const priceWithMath = service.resolveUnitPrice(8.1, '99.52', '98.54', false);
      expect(priceWithMath).toBe(12.2864);
    });
  });

  describe('parseS10Buffer', () => {
    it('debe lanzar BadRequestException si el buffer esta vacio', () => {
      expect(() => service.parseS10Buffer(Buffer.alloc(0))).toThrow(
        BadRequestException,
      );
    });

    it('debe parsear reporte clasico Crystal Reports S10 con 50 columnas, etiquetas repetidas y precio explicito', () => {
      // Simula linea de exportacion real de Crystal Reports con cabeceras de reporte en cada fila
      const line1 = [
        'Obra', '0102003', 'MEJORAMIENTO DE TRANSITABILIDAD VIAL',
        'Subpresupuesto', '001', 'ESTRUCTURAS',
        'Etiquetas', 'Código', 'Recurso', 'Unidad', 'Cantidad', 'Precio', 'Parcial',
        '0101010001', 'CAPATAZ DE OBRA', 'HH', '120.00', '25.00', '3000.00',
        'TOTAL', '3000.00',
      ].join(';');

      const line2 = [
        'Obra', '0102003', 'MEJORAMIENTO DE TRANSITABILIDAD VIAL',
        'Subpresupuesto', '001', 'ESTRUCTURAS',
        'Etiquetas', 'Código', 'Recurso', 'Unidad', 'Cantidad', 'Precio', 'Parcial',
        '0204010001', 'CEMENTO PORTLAND TIPO I (BOLSA 42.5KG)', 'BOL', '2,500.00', '26.50', '66,250.00',
        'TOTAL', '66250.00',
      ].join(';');

      const line3 = [
        'Obra', '0102003', 'MEJORAMIENTO DE TRANSITABILIDAD VIAL',
        'Subpresupuesto', '001', 'ESTRUCTURAS',
        'Etiquetas', 'Código', 'Recurso', 'Unidad', 'Cantidad', 'Precio', 'Parcial',
        '0202010005', 'ACERO CORRUGADO 1/2 FY=4200 KG/CM2', 'VAR', '800.00', '36.00', '28,800.00',
        'TOTAL', '28800.00',
      ].join(';');

      const line4 = [
        'Obra', '0102003', 'MEJORAMIENTO DE TRANSITABILIDAD VIAL',
        'Subpresupuesto', '001', 'ESTRUCTURAS',
        'Etiquetas', 'Código', 'Recurso', 'Unidad', 'Cantidad', 'Precio', 'Parcial',
        '0301010002', 'MEZCLADORA DE TROMPO 9P3', 'HM', '40.00', '45.00', '1,800.00',
        'TOTAL', '1800.00',
      ].join(';');

      const csvContent = [line1, line2, line3, line4].join('\n');
      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = service.parseS10Buffer(buffer);

      expect(result.s10ProjectCode).toBe('0102003');
      expect(result.s10ProjectName).toBe('MEJORAMIENTO DE TRANSITABILIDAD VIAL');
      expect(result.totalRowsParsed).toBe(4);
      expect(result.discardedRows).toBe(1); // 0101010001 Mano de Obra
      expect(result.materialsAndEquipmentRows).toBe(3); // Cemento, Acero, Mezcladora
      expect(result.resources).toHaveLength(3);

      expect(result.resources[0].s10Code).toBe('0204010001');
      expect(result.resources[0].s10RawName).toBe('CEMENTO PORTLAND TIPO I (BOLSA 42.5KG)');
      expect(result.resources[0].s10Unit).toBe('BOL');
      expect(result.resources[0].quantity).toBe(2500);
      expect(result.resources[0].unitPrice).toBe(26.5);

      expect(result.resources[1].s10Code).toBe('0202010005');
      expect(result.resources[1].quantity).toBe(800);
      expect(result.resources[1].unitPrice).toBe(36);

      expect(result.resources[2].s10Code).toBe('0301010002');
      expect(result.resources[2].quantity).toBe(40);
      expect(result.resources[2].unitPrice).toBe(45);
    });

    it('debe parsear reporte de incidencia Crystal Reports S10 con 48 columnas, calculando precio unitario desde parcial', () => {
      // Simula reporte de saneamiento con parcial acumulado y columna de porcentaje sin columna de precio unitario
      const line1 = [
        'Obra', '0301004', 'CREACION DEL SISTEMA DE SANEAMIENTO BASICO',
        'Subpresupuesto', '002', 'REDES DE AGUA',
        '0401010005', 'SUBCONTRATO EXCAVACION DE ZANJAS', 'GLB', '1.00', '15000.00', '12.50%',
      ].join(';');

      const line2 = [
        'Obra', '0301004', 'CREACION DEL SISTEMA DE SANEAMIENTO BASICO',
        'Subpresupuesto', '002', 'REDES DE AGUA',
        '0204010012', 'TUBERIA PVC PESADO SAP 2 PULGADAS', 'TUB', '300.00', '7500.00', '6.25%',
      ].join(';');

      const line3 = [
        'Obra', '0301004', 'CREACION DEL SISTEMA DE SANEAMIENTO BASICO',
        'Subpresupuesto', '002', 'REDES DE AGUA',
        '0301010010', 'COMPACTADOR VIBRATORIO TIPO CANGURO', 'HM', '50.00', '2250.00', '',
      ].join(';');

      const csvContent = [line1, line2, line3].join('\n');
      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = service.parseS10Buffer(buffer);

      expect(result.s10ProjectCode).toBe('0301004');
      expect(result.s10ProjectName).toBe('CREACION DEL SISTEMA DE SANEAMIENTO BASICO');
      expect(result.totalRowsParsed).toBe(3);
      expect(result.discardedRows).toBe(1); // 04 Subcontrato
      expect(result.materialsAndEquipmentRows).toBe(2);

      // Tuberia: parcial 7500 / cantidad 300 = 25.0
      expect(result.resources[0].s10Code).toBe('0204010012');
      expect(result.resources[0].quantity).toBe(300);
      expect(result.resources[0].unitPrice).toBe(25);

      // Canguro: parcial 2250 / cantidad 50 = 45.0 (celda posterior vacia)
      expect(result.resources[1].s10Code).toBe('0301010010');
      expect(result.resources[1].quantity).toBe(50);
      expect(result.resources[1].unitPrice).toBe(45);
    });

    it('debe admitir formato CSV tabular estandar ignorando la fila de cabecera', () => {
      const csvContent = [
        'Codigo;Descripcion;Unidad;Cantidad;Precio;Parcial',
        '0204010001;CEMENTO PORTLAND TIPO I;BOL;2500;26.50;66250.00',
        '0202010005;ACERO CORRUGADO 1/2;VAR;800;36.00;28800.00',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = service.parseS10Buffer(buffer);

      expect(result.totalRowsParsed).toBe(2);
      expect(result.resources).toHaveLength(2);
      expect(result.resources[0].s10Code).toBe('0204010001');
      expect(result.resources[0].unitPrice).toBe(26.5);
      expect(result.resources[0].suggestedType).toBe('CONSUMABLE');
      expect(result.resources[1].s10Code).toBe('0202010005');
      expect(result.resources[1].unitPrice).toBe(36);
      expect(result.resources[1].suggestedType).toBe('CONSUMABLE');
    });

    it('debe parsear fila con incidencia donde el porcentaje no tiene simbolo % y existe cabecera % Inc.', () => {
      // Simula fila real donde % Inc. viene en columnas previas y las celdas posteriores son 99.52 y 98.54
      const row = [
        'Obra', '0301004', 'CREACION DEL SISTEMA DE SANEAMIENTO BASICO',
        'Subpresupuesto', '002', 'REDES DE AGUA',
        'Etiquetas', 'Código', 'Descripción', 'Unidad', 'Cuadrilla', 'Cantidad', '% Inc.', 'Parcial',
        '0204010099', 'CODO PVC SAP 2 PULGADAS', 'UND', '8.10', '99.52', '98.54',
      ].join(';');

      const buffer = Buffer.from(row, 'utf-8');
      const result = service.parseS10Buffer(buffer);

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].s10Code).toBe('0204010099');
      expect(result.resources[0].quantity).toBe(8.1);
      // 99.52 / 8.10 = 12.286419... -> 12.2864 (no debe tomar 99.52 como precio unitario)
      expect(result.resources[0].unitPrice).toBe(12.2864);
      expect(result.resources[0].suggestedType).toBe('CONSUMABLE');
    });

    it('debe asignar suggestedType ASSET_TOOL para equipos o herramientas con prefijo 03', () => {
      const row = [
        '0301010002;MEZCLADORA DE CONCRETO 11P3;HM;15;55.00;825.00',
      ].join('\n');

      const buffer = Buffer.from(row, 'utf-8');
      const result = service.parseS10Buffer(buffer);

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].s10Code).toBe('0301010002');
      expect(result.resources[0].suggestedType).toBe('ASSET_TOOL');
    });

    it('debe lanzar BadRequestException si el archivo contiene partidas presupuestales sin codigos de insumos validos', () => {
      // Simula exportacion de "Hoja de Presupuesto / Resumen Cliente" con partidas contractuales pero sin recursos 02 ni 03
      const csvContent = [
        'Item;Descripcion;Unidad;Metrado;Precio S/.;Parcial S/.',
        '01;OBRAS PROVISIONALES, TRABAJOS PRELIMINARES;GLB;1.00;15000.00;15000.00',
        '01.01;CARTEL DE IDENTIFICACION DE LA OBRA DE 3.60 X 2.40 M;UND;1.00;1200.00;1200.00',
        '01.02;ALMACEN, OFICINA Y CASETA DE GUARDIANIA;M2;50.00;120.00;6000.00',
        '02;MOVIMIENTO DE TIERRAS;M3;250.00;45.00;11250.00',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      expect(() => service.parseS10Buffer(buffer)).toThrow(BadRequestException);
      expect(() => service.parseS10Buffer(buffer)).toThrow(
        /no contiene materiales \(02\) ni equipos \(03\) validos/,
      );
    });
  });
});
