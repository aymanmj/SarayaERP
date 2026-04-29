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

    // Model selection: configurable via env, with stable fallback
    const modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash';
    this.logger.log(`🤖 Initializing AI Coding with model: ${modelName}`);

    this.model = this.genAI.getGenerativeModel({ 
      model: modelName,
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

//     const prompt = `
// You are an expert medical coder (HIM / AAPC certified) and a senior physician. 
// Your primary goal is MAXIMUM CLINICAL ACCURACY. 
// Analyze the following clinical note and suggest the most appropriate and highly specific ICD-10-CM and CPT-4 codes.
// Strictly adhere to the official WHO ICD-10 guidelines and AMA CPT coding standards. Do not hallucinate codes.

// CRITICAL INSTRUCTIONS:
// 1. You MUST provide BOTH ICD-10 diagnosis codes AND CPT procedure codes.
// 2. For CPT codes: Every clinical encounter involves at least one procedure (e.g., office visit 99213-99215, consultation 99241-99245, ED visit 99281-99285, hospital care 99221-99223). Include the appropriate E&M (Evaluation & Management) CPT code at minimum.
// 3. If the note mentions any examination, test, imaging, or treatment, include the corresponding CPT code.
// 4. NEVER return an empty "procedures" array — at minimum, include the E&M visit code that matches the complexity of the documented encounter.

// Provide your response strictly in the following JSON format:
// {
//   "diagnoses": [ { "code": "ICD-10 code", "nameEn": "English name", "nameAr": "Arabic name", "confidence": 0.0 - 1.0 } ],
//   "procedures": [ { "code": "CPT code", "nameEn": "English name", "nameAr": "Arabic name", "confidence": 0.0 - 1.0 } ],
//   "reasoning": "Brief explanation of how the codes were derived from the clinical text."
// }

// Ensure the output is ONLY valid JSON, without markdown formatting like \`\`\`json.

// Patient Context: ${patientDemographics || 'Not Provided'}
// Clinical Note:
// ${clinicalNote}
// `;

const prompt = `
You are an expert medical coder (HIM / AAPC certified) and a senior physician. 
Your primary goal is MAXIMUM CLINICAL ACCURACY. 
Analyze the following clinical note and suggest the most appropriate and highly specific ICD-10-CM and CPT-4 codes.
Strictly adhere to the official WHO ICD-10 guidelines and AMA CPT coding standards. Do not hallucinate codes.

CRITICAL INSTRUCTIONS:
1. EXTRACT NUANCES: Pay strict attention to laterality (left/right), specific anatomic sites (e.g., midshaft vs. distal), encounter type (initial vs. subsequent), and patient role in accidents (e.g., driver vs. passenger).
2. COMBINATION CODES: Prioritize combination codes for conditions with common symptoms/manifestations (e.g., Diabetes with Neuropathy) over individual codes.
3. CPT & E/M CODES: Every clinical encounter involves at least one procedure. Include the appropriate E&M CPT code matching the Medical Decision Making (MDM) complexity. NEVER return an empty "procedures" array.
4. BUNDLING & MODIFIERS: Do not unbundle procedures (adhere strictly to NCCI edits). If appropriate, suggest standard CPT modifiers in a separate field (e.g., -RT, -LT, -25, -57).
5. LOCALIZATION & TERMINOLOGY: Accurately interpret local medical terms if present. For example, treat the Arabic term "إيواء" as Hospital Admission (Inpatient Care), not merely an outpatient observation.

Provide your response strictly in the following JSON format.
IMPORTANT: You MUST write the "reasoning" key BEFORE the "diagnoses" and "procedures" arrays. This is required to ensure step-by-step clinical thinking before generating the codes.

{
  "reasoning": "Step-by-step explanation of finding specific diagnoses, laterality, complexity, and checking NCCI edits.",
  "diagnoses": [ { "code": "ICD-10 code", "nameEn": "English name", "nameAr": "Arabic name", "confidence": 0.0 - 1.0 } ],
  "procedures": [ { "code": "CPT code", "modifier": "Modifier code (e.g., RT, 57) or null", "nameEn": "English name", "nameAr": "Arabic name", "confidence": 0.0 - 1.0 } ]
}

Ensure the output is ONLY valid JSON, without markdown formatting like \\\`json.

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

      // Validate response structure — ensure both arrays exist
      if (!Array.isArray(parsed.diagnoses)) {
        parsed.diagnoses = [];
      }
      if (!Array.isArray(parsed.procedures)) {
        parsed.procedures = [];
        this.logger.warn('⚠️ AI model returned empty procedures array — prompt may need adjustment or model may have filtered CPT codes.');
      }

      return parsed;
    } catch (error) {
      this.logger.error(`Failed to generate AI coding suggestions: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to process AI Coding request');
    }
  }
}
