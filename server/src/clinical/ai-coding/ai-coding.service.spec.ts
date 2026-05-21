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
  let configService: any;
  let vaultService: any;
  let prismaService: any;
  let priceListsService: any;
  let billingService: any;
  let mockGoogleGenAIInstance: any;

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
        { provide: ServicesService, useValue: { explodeServiceCharges: jest.fn().mockResolvedValue([]) } },
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
      const genAIInstance = (GoogleGenerativeAI as jest.Mock).mock.results[0].value;
      expect(genAIInstance.getGenerativeModel).toHaveBeenCalledWith(
        {
          model: 'gemini-2.5-flash',
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.0,
            topP: 0.8,
          },
        },
        {} // no custom options passed since they are undefined
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

      const genAIInstance = (GoogleGenerativeAI as jest.Mock).mock.results[0].value;
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
        }
      );
    });
  });
});
