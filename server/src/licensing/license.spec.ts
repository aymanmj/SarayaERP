
import { Test, TestingModule } from '@nestjs/testing';
import { LicenseService } from './license.service';
import { ConfigService } from '@nestjs/config';

describe('LicenseService', () => {
  let service: LicenseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicenseService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'LICENSE_PUBLIC_KEY') return 'mock-public-key';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LicenseService>(LicenseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isModuleEnabled', () => {
    it('should return true if module is present in modules array', () => {
      // @ts-ignore
      service._details = {
        modules: ['LAB', 'PHARMACY'],
        plan: 'BASIC', // Basic usually has nothing, but modules override
      };

      expect(service.isModuleEnabled('LAB')).toBe(true);
      expect(service.isModuleEnabled('PHARMACY')).toBe(true);
      expect(service.isModuleEnabled('RADIOLOGY')).toBe(false);
    });

    it('should fallback to Plan if modules array is missing (Legacy)', () => {
      // @ts-ignore
      service._details = {
        plan: 'ENTERPRISE',
      };
      expect(service.isModuleEnabled('HR')).toBe(true);

      // @ts-ignore
      service._details = {
        plan: 'PRO',
      };
      // PRO has no HR
      expect(service.isModuleEnabled('HR')).toBe(false); 
      // PRO has LAB
      expect(service.isModuleEnabled('LAB')).toBe(true);

      // @ts-ignore
      service._details = {
        plan: 'BASIC',
      };
      // BASIC has no LAB
      expect(service.isModuleEnabled('LAB')).toBe(false);
    });

    it('should prioritize modules array over plan if both exist', () => {
       // @ts-ignore
       service._details = {
        plan: 'ENTERPRISE', // Enterprise has everything
        modules: ['LAB'], // But modules array restricts it to ONLY Lab? 
                          // Logic says: if modules array exists, use it.
      };

      // So even if plan is Enterprise, if modules list is provided, strictly follow it?
      // My implementation: 
      // if (modules) return modules.includes(feature);
      // So yes, it restricts.
      
      expect(service.isModuleEnabled('LAB')).toBe(true);
      expect(service.isModuleEnabled('HR')).toBe(false); // Enterprise usually has HR, but modules array didn't include it
    });
  });
});
