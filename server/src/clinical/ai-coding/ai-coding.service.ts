import { Injectable, Logger, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { VaultService } from '../../common/vault/vault.service';

export interface AiCodingSuggestion {
  diagnoses: Array<{ code: string; nameEn: string; nameAr: string; confidence: number }>;
  procedures: Array<{ code: string; nameEn: string; nameAr: string; confidence: number }>;
  reasoning: string;
}

@Injectable()
export class AiCodingService implements OnModuleInit {
  private readonly logger = new Logger(AiCodingService.name);
  private genAI: GoogleGenerativeAI;
  private model: any;
  private currentApiKey: string | null = null;

  constructor(
    private configService: ConfigService,
    private vaultService: VaultService,
  ) {}

  async onModuleInit() {
    await this.ensureModelLoaded();
  }

  private async ensureModelLoaded() {
    let apiKey = await this.vaultService.getOptionalSecret('GEMINI_API_KEY');

    if (!apiKey) {
      try {
        await this.vaultService.refreshKeys();
        apiKey = await this.vaultService.getOptionalSecret('GEMINI_API_KEY');
      } catch (error: any) {
        this.logger.warn(`Unable to refresh Vault secrets for Gemini key: ${error.message}`);
      }
    }

    if (!apiKey) {
      apiKey =
        process.env.GEMINI_API_KEY ||
        this.configService.get<string>('GEMINI_API_KEY') ||
        null;
    }

    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not configured in Vault or ENV. AI Coding Assist will not function properly.');
      return false;
    }

    if (this.model && this.currentApiKey === apiKey) {
      return true;
    }

    this.currentApiKey = apiKey;
    this.genAI = new GoogleGenerativeAI(apiKey);
    // Using gemini-3.1-pro-preview for maximum clinical accuracy over speed
    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-3.1-pro-preview',
      generationConfig: { 
        responseMimeType: 'application/json',
        temperature: 0.0, // Force deterministic and factual responses
        topP: 0.8
      }
    });
    return true;
  }

  /**
   * Analyze clinical notes and suggest ICD-10 and CPT codes
   */
  async suggestCodes(clinicalNote: string, patientDemographics?: string): Promise<AiCodingSuggestion> {
    const ready = await this.ensureModelLoaded();
    if (!ready || !this.model) {
      throw new InternalServerErrorException('AI Model is not configured (Missing GEMINI_API_KEY)');
    }

    const prompt = `
You are an expert medical coder (HIM / AAPC certified) and a senior physician. 
Your primary goal is MAXIMUM CLINICAL ACCURACY. 
Analyze the following clinical note and suggest the most appropriate and highly specific ICD-10-CM and CPT-4 codes.
Strictly adhere to the official WHO ICD-10 guidelines and AMA CPT coding standards. Do not hallucinate codes.

Provide your response strictly in the following JSON format:
{
  "diagnoses": [ { "code": "...", "nameEn": "...", "nameAr": "...", "confidence": 0.0 - 1.0 } ],
  "procedures": [ { "code": "...", "nameEn": "...", "nameAr": "...", "confidence": 0.0 - 1.0 } ],
  "reasoning": "Brief explanation of how the codes were derived from the clinical text."
}

Ensure the output is ONLY valid JSON, without markdown formatting like \`\`\`json.

Patient Context: ${patientDemographics || 'Not Provided'}
Clinical Note:
${clinicalNote}
`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      let text = response.text();
      
      // Clean up markdown if model decides to output it anyway
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const parsed: AiCodingSuggestion = JSON.parse(text);
      return parsed;
    } catch (error) {
      this.logger.error(`Failed to generate AI coding suggestions: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to process AI Coding request');
    }
  }
}
