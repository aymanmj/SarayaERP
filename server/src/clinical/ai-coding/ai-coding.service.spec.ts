import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AiCodingService } from './ai-coding.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { VaultService } from '../../common/vault/vault.service';
import { PriceListsService } from '../../price-lists/price-lists.service';
import { BillingService } from '../../billing/billing.service';
import { ServicesService } from '../../services/services.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Mock the GoogleGenerativeAI SDK
jest.mock('@google/generative-ai', () => {
  const getGenerativeModelMock = jest.fn().mockReturnValue({
    generateContent: jest.fn().mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            reasoning: 'test reasoning',
            diagnoses: [],
            procedures: [],
          }),
      },
    }),
  });

  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => {
      return {
        getGenerativeModel: getGenerativeModelMock,
      };
    }),
  };
});

describe('AiCodingService', () => {
  let service: AiCodingService;
  let configService: { get: jest.Mock };
  let vaultService: { getOptionalSecret: jest.Mock };
  let prismaService: Record<string, unknown>;
  let priceListsService: Record<string, unknown>;
  let billingService: Record<string, unknown>;

  beforeEach(async () => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'GEMINI_MODEL') return 'gemini-2.5-flash';
        if (key === 'GEMINI_BASE_URL') return undefined;
        if (key === 'GEMINI_API_VERSION') return undefined;
        if (key === 'GEMINI_API_KEY') return 'test-key';
        return undefined;
      }),
    };

    vaultService = {
      getOptionalSecret: jest.fn().mockResolvedValue('vault-test-key'),
    };

    prismaService = {};
    priceListsService = {};
    billingService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiCodingService,
        { provide: ConfigService, useValue: configService },
        { provide: VaultService, useValue: vaultService },
        { provide: PrismaService, useValue: prismaService },
        { provide: PriceListsService, useValue: priceListsService },
        { provide: BillingService, useValue: billingService },
        {
          provide: ServicesService,
          useValue: { explodeServiceCharges: jest.fn().mockResolvedValue([]) },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<AiCodingService>(AiCodingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ensureModelLoaded', () => {
    it('should initialize GoogleGenerativeAI with vault key', async () => {
      // @ts-ignore
      const success = await service.ensureModelLoaded();
      expect(success).toBe(true);
      expect(GoogleGenerativeAI).toHaveBeenCalledWith('vault-test-key');

      // Default instantiation options
      const genAIInstance = (GoogleGenerativeAI as jest.Mock).mock.results[0]
        .value;
      expect(genAIInstance.getGenerativeModel).toHaveBeenCalledWith(
        {
          model: 'gemini-2.5-flash',
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.0,
            topP: 0.8,
          },
        },
        {}, // no custom options passed since they are undefined
      );
    });

    it('should initialize with custom base URL and API version if configured', async () => {
      configService.get = jest.fn().mockImplementation((key: string) => {
        if (key === 'GEMINI_MODEL') return 'gemini-2.5-flash';
        if (key === 'GEMINI_BASE_URL') return 'https://my-proxy-url.com';
        if (key === 'GEMINI_API_VERSION') return 'v1beta';
        if (key === 'GEMINI_API_KEY') return 'test-key';
        return undefined;
      });

      // @ts-ignore
      const success = await service.ensureModelLoaded();
      expect(success).toBe(true);

      const genAIInstance = (GoogleGenerativeAI as jest.Mock).mock.results[0]
        .value;
      expect(genAIInstance.getGenerativeModel).toHaveBeenCalledWith(
        {
          model: 'gemini-2.5-flash',
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.0,
            topP: 0.8,
          },
        },
        {
          baseUrl: 'https://my-proxy-url.com',
          apiVersion: 'v1beta',
        },
      );
    });
  });

  describe('free-tier fallback and rate-limit resilience', () => {
    it('defaults to gemini-3.1-flash-lite when GEMINI_MODEL is unset', async () => {
      configService.get = jest.fn().mockReturnValue(undefined);
      vaultService.getOptionalSecret.mockResolvedValue('vault-default-key');

      const generateContent = jest.fn().mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              reasoning: 'Default model test',
              diagnoses: [],
              procedures: [],
            }),
        },
      });
      const getGenerativeModel = jest.fn().mockReturnValue({ generateContent });
      (GoogleGenerativeAI as unknown as jest.Mock).mockImplementationOnce(
        () => ({ getGenerativeModel }),
      );

      await service.suggestCodes('Acute pharyngitis');

      expect(getGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3.1-flash-lite' }),
        {},
      );
    });

    it('falls back to gemini-2.5-flash-lite when primary free-tier model hits 429 quota or 404', async () => {
      configService.get = jest.fn().mockReturnValue(undefined);
      vaultService.getOptionalSecret.mockResolvedValue('vault-fallback-key');

      const primaryGenerate = jest
        .fn()
        .mockRejectedValue(new Error('429 Resource Exhausted: Quota exceeded'));
      const fallbackGenerate = jest.fn().mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              reasoning: 'Fallback succeeded',
              diagnoses: [
                {
                  code: 'J06.9',
                  nameEn: 'Acute URI',
                  nameAr: 'التهاب جهاز تنفسي علوي حاد',
                  confidence: 0.92,
                },
              ],
              procedures: [
                {
                  code: '99213',
                  nameEn: 'Office visit',
                  nameAr: 'زيارة عيادة',
                  confidence: 0.9,
                },
              ],
            }),
        },
      });

      const getGenerativeModel = jest
        .fn()
        .mockReturnValueOnce({ generateContent: primaryGenerate })
        .mockReturnValueOnce({ generateContent: fallbackGenerate });

      (GoogleGenerativeAI as unknown as jest.Mock).mockImplementationOnce(
        () => ({ getGenerativeModel }),
      );

      const res = await service.suggestCodes('Fever and sore throat');

      expect(getGenerativeModel).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ model: 'gemini-3.1-flash-lite' }),
        {},
      );
      expect(getGenerativeModel).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ model: 'gemini-2.5-flash-lite' }),
        {},
      );
      expect(res.diagnoses[0].code).toBe('J06.9');
    });

    it('throws ServiceUnavailableException when all configured models hit 429 quota limits', async () => {
      configService.get = jest.fn().mockReturnValue(undefined);
      vaultService.getOptionalSecret.mockResolvedValue('vault-quota-key');

      const quotaError = new Error('429 Too Many Requests: quota exceeded');
      const getGenerativeModel = jest.fn().mockReturnValue({
        generateContent: jest.fn().mockRejectedValue(quotaError),
      });

      (GoogleGenerativeAI as unknown as jest.Mock).mockImplementationOnce(
        () => ({ getGenerativeModel }),
      );

      await expect(
        service.suggestCodes('Hypertension follow-up'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
