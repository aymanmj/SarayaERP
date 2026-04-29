/**
 * NPHIES FHIR Message Builder Service — Unit Tests
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NphiesService } from './nphies.service';
import { NphiesCryptoService } from './nphies-crypto.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('NphiesService', () => {
  let service: NphiesService;
  let cryptoService: NphiesCryptoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NphiesService,
        {
          provide: NphiesCryptoService,
          useValue: { signPayload: jest.fn().mockReturnValue('mock.jws.signature') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const map: Record<string, string> = {
                NPHIES_SENDER_ID: 'test-provider-001',
                NPHIES_RECEIVER_ID: 'test-payer-001',
              };
              return map[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<NphiesService>(NphiesService);
    cryptoService = module.get<NphiesCryptoService>(NphiesCryptoService);
  });

  describe('buildMessageHeader', () => {
    it('should return a valid FHIR MessageHeader resource', () => {
      const header = service.buildMessageHeader('eligibility-request', 'CoverageEligibilityRequest/123');
      expect(header.resourceType).toBe('MessageHeader');
      expect(header.id).toBeDefined();
    });

    it('should set correct event coding', () => {
      const header = service.buildMessageHeader('claim-request', 'Claim/456');
      expect(header.eventCoding.system).toBe('http://nphies.sa/terminology/CodeSystem/ksa-message-events');
      expect(header.eventCoding.code).toBe('claim-request');
    });

    it('should set destination with receiver ID', () => {
      const header = service.buildMessageHeader('eligibility-request', 'Test/1');
      expect(header.destination[0].receiver.identifier.value).toBe('test-payer-001');
    });

    it('should set sender with provider ID', () => {
      const header = service.buildMessageHeader('eligibility-request', 'Test/1');
      expect(header.sender.identifier.value).toBe('test-provider-001');
    });

    it('should set focus reference', () => {
      const header = service.buildMessageHeader('preauthorization-request', 'Claim/789');
      expect(header.focus).toEqual([{ reference: 'Claim/789' }]);
    });

    it('should include JWS signature extension', () => {
      const header = service.buildMessageHeader('claim-request', 'Claim/test');
      expect(header.extension).toHaveLength(1);
      expect(header.extension[0].valueSignature.sigFormat).toBe('application/jose');
    });

    it('should call cryptoService.signPayload', () => {
      service.buildMessageHeader('claim-request', 'Claim/test');
      expect(cryptoService.signPayload).toHaveBeenCalledTimes(1);
    });
  });

  describe('buildPatient', () => {
    it('should return a FHIR Patient resource', () => {
      const patient = service.buildPatient({ id: 'pat-001', fullName: 'أحمد محمد' });
      expect(patient.resourceType).toBe('Patient');
      expect(patient.id).toBe('pat-001');
    });

    it('should parse name correctly', () => {
      const patient = service.buildPatient({ id: '1', fullName: 'خالد عبدالله السعيد' });
      expect(patient.name[0].given[0]).toBe('خالد');
      expect(patient.name[0].family).toBe('السعيد');
    });

    it('should include national ID when provided', () => {
      const patient = service.buildPatient({ id: '1', fullName: 'Test', nationalId: '1234567890' });
      expect(patient.identifier[0].value).toBe('1234567890');
    });

    it('should have empty identifier when no nationalId', () => {
      const patient = service.buildPatient({ id: '1', fullName: 'Test' });
      expect(patient.identifier).toEqual([]);
    });

    it('should map gender correctly', () => {
      expect(service.buildPatient({ id: '1', fullName: 'T', gender: 'MALE' }).gender).toBe('male');
      expect(service.buildPatient({ id: '2', fullName: 'T', gender: 'FEMALE' }).gender).toBe('female');
      expect(service.buildPatient({ id: '3', fullName: 'T' }).gender).toBe('unknown');
    });

    it('should format birthDate as YYYY-MM-DD', () => {
      const patient = service.buildPatient({ id: '1', fullName: 'T', dateOfBirth: new Date('1990-05-15T00:00:00Z') });
      expect(patient.birthDate).toBe('1990-05-15');
    });

    it('should include phone when provided', () => {
      const patient = service.buildPatient({ id: '1', fullName: 'T', phone: '+966501234567' });
      expect(patient.telecom[0].value).toBe('+966501234567');
    });
  });

  describe('buildCoverage', () => {
    const base = {
      id: 'cov-001', memberId: 'MEM-123', payerIdentifier: 'PAYER-X',
      payerName: 'بوبا', patientRef: 'Patient/pat-001',
    };

    it('should return a FHIR Coverage resource', () => {
      const cov = service.buildCoverage(base);
      expect(cov.resourceType).toBe('Coverage');
      expect(cov.status).toBe('active');
    });

    it('should set payor correctly', () => {
      const cov = service.buildCoverage(base);
      expect(cov.payor[0].identifier.value).toBe('PAYER-X');
      expect(cov.payor[0].display).toBe('بوبا');
    });

    it('should default relationship to self', () => {
      expect(service.buildCoverage(base).relationship.coding[0].code).toBe('self');
    });
  });

  describe('buildBundle', () => {
    it('should create a Bundle with correct type and timestamp', () => {
      const bundle = service.buildBundle('message', []);
      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.type).toBe('message');
      expect(bundle.timestamp).toBeDefined();
    });

    it('should wrap resources in entry array with fullUrl', () => {
      const bundle = service.buildBundle('message', [
        { resourceType: 'MessageHeader', id: 'mh-1' },
        { resourceType: 'Patient', id: 'pat-1' },
      ]);
      expect(bundle.entry).toHaveLength(2);
      expect(bundle.entry[0].fullUrl).toContain('urn:uuid:');
    });
  });

  describe('buildAttachment', () => {
    let tempFile: string;

    beforeEach(() => {
      tempFile = path.join(os.tmpdir(), `nphies-att-${Date.now()}.pdf`);
      fs.writeFileSync(tempFile, 'mock PDF content');
    });

    afterEach(() => {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    });

    it('should read file and return base64 attachment', () => {
      const att = service.buildAttachment(tempFile, 'Lab Report');
      expect(att).not.toBeNull();
      expect(att.title).toBe('Lab Report');
      expect(att.contentType).toBe('application/pdf');
      expect(Buffer.from(att.data, 'base64').toString()).toBe('mock PDF content');
    });

    it('should return null for non-existent file', () => {
      expect(service.buildAttachment('/no/file.pdf', 'X')).toBeNull();
    });

    it('should use custom contentType', () => {
      const att = service.buildAttachment(tempFile, 'XRay', 'image/jpeg');
      expect(att.contentType).toBe('image/jpeg');
    });
  });
});
