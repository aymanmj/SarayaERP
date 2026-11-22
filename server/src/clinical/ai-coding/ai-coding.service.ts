import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  ServiceUnavailableException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  type GenerativeModel,
} from '@google/generative-ai';
import { VaultService } from '../../common/vault/vault.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PriceListsService } from '../../price-lists/price-lists.service';
import { BillingService } from '../../billing/billing.service';
import {
  DiagnosisType,
  ChargeSource,
  ServiceType,
  TerminologySystem,
} from '@prisma/client';
import { ServicesService } from '../../services/services.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_GEMINI_FALLBACK_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
];

// ─── Interfaces ────────────────────────────────────────────────────

export interface AiCodingSuggestion {
  diagnoses: Array<{
    code: string;
    nameEn: string;
    nameAr: string;
    confidence: number;
  }>;
  procedures: Array<{
    code: string;
    modifier?: string;
    nameEn: string;
    nameAr: string;
    confidence: number;
  }>;
  reasoning: string;
}

export interface ApplyCodesDto {
  encounterId: number;
  selectedDiagnoses: Array<{
    code: string;
    nameEn: string;
    nameAr: string;
    type: 'PRIMARY' | 'SECONDARY';
  }>;
  selectedProcedures: Array<{
    code: string;
    nameEn: string;
    nameAr: string;
    modifier?: string;
  }>;
}

export interface ApplyCodesResult {
  diagnosesSaved: number;
  proceduresSaved: number;
  warnings: string[];
}

// ─── Service ───────────────────────────────────────────────────────

@Injectable()
export class AiCodingService implements OnModuleInit {
  private readonly logger = new Logger(AiCodingService.name);
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel | null = null;
  private currentApiKey: string | null = null;
  private currentModelName: string = DEFAULT_GEMINI_MODEL;
  private requestOptions: { baseUrl?: string; apiVersion?: string } = {};
  private fallbackModelNames: string[] = [];

  constructor(
    private configService: ConfigService,
    private vaultService: VaultService,
    private prisma: PrismaService,
    private priceService: PriceListsService,
    private billingService: BillingService,
    private servicesService: ServicesService,
    private eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    await this.ensureModelLoaded();
  }

  private createGenerativeModel(modelName: string): GenerativeModel {
    return this.genAI.getGenerativeModel(
      {
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.0,
          topP: 0.8,
        },
      },
      this.requestOptions,
    );
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
      const msg = (error as { message?: unknown }).message;
      if (typeof msg === 'string') return msg;
    }
    return '';
  }

  private isQuotaError(error: unknown): boolean {
    const errObj =
      error && typeof error === 'object'
        ? (error as { status?: unknown; code?: unknown })
        : {};
    const status = Number(errObj.status ?? errObj.code ?? 0);
    if (status === 429) return true;
    const msg = this.extractErrorMessage(error).toLowerCase();
    return (
      msg.includes('429') ||
      msg.includes('resource_exhausted') ||
      msg.includes('quota') ||
      msg.includes('rate limit')
    );
  }

  private isRetryableModelError(error: unknown): boolean {
    if (this.isQuotaError(error)) return true;
    const errObj =
      error && typeof error === 'object'
        ? (error as { status?: unknown; code?: unknown })
        : {};
    const status = Number(errObj.status ?? errObj.code ?? 0);
    if (status === 404 || status === 503) return true;
    const msg = this.extractErrorMessage(error).toLowerCase();
    return (
      msg.includes('404') ||
      msg.includes('not_found') ||
      msg.includes('503') ||
      msg.includes('unavailable') ||
      msg.includes('deprecated')
    );
  }

  private cleanJsonText(rawText: string): string {
    return rawText
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim();
  }

  private async generateJsonText(prompt: string): Promise<string> {
    if (!this.model) {
      throw new InternalServerErrorException('AI Model is not initialized');
    }

    try {
      const result = await this.model.generateContent(prompt);
      return this.cleanJsonText(result.response.text());
    } catch (primaryError: unknown) {
      if (!this.isRetryableModelError(primaryError)) {
        throw primaryError;
      }

      let lastError: unknown = primaryError;
      for (const fallbackModelName of this.fallbackModelNames) {
        this.logger.warn(
          `Gemini model "${this.currentModelName}" unavailable/throttled; retrying with fallback "${fallbackModelName}".`,
        );
        try {
          const fallbackModel = this.createGenerativeModel(fallbackModelName);
          const fallbackResult = await fallbackModel.generateContent(prompt);
          return this.cleanJsonText(fallbackResult.response.text());
        } catch (fallbackError: unknown) {
          lastError = fallbackError;
          if (!this.isRetryableModelError(fallbackError)) {
            throw fallbackError;
          }
        }
      }

      throw lastError;
    }
  }

  private async ensureModelLoaded() {
    let apiKey = await this.vaultService.getOptionalSecret('GEMINI_API_KEY');

    if (!apiKey) {
      try {
        await this.vaultService.refreshKeys();
        apiKey = await this.vaultService.getOptionalSecret('GEMINI_API_KEY');
      } catch (error: any) {
        this.logger.warn(
          `Unable to refresh Vault secrets for Gemini key: ${error.message}`,
        );
      }
    }

    if (!apiKey) {
      apiKey =
        process.env.GEMINI_API_KEY ||
        this.configService.get<string>('GEMINI_API_KEY') ||
        null;
    }

    if (!apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY is not configured in Vault or ENV. AI Coding Assist will not function properly.',
      );
      return false;
    }

    if (this.model && this.currentApiKey === apiKey) {
      return true;
    }

    this.currentApiKey = apiKey;
    this.genAI = new GoogleGenerativeAI(apiKey);

    // Model selection: configurable via env, defaulting to free-tier lightweight Gemini model
    const modelName =
      this.configService.get<string>('GEMINI_MODEL')?.trim() ||
      DEFAULT_GEMINI_MODEL;
    this.currentModelName = modelName;
    this.logger.log(`🤖 Initializing AI Coding with model: ${modelName}`);

    const requestOptions: { baseUrl?: string; apiVersion?: string } = {};
    const baseUrl =
      this.configService.get<string>('GEMINI_BASE_URL') ||
      process.env.GEMINI_BASE_URL;
    const apiVersion =
      this.configService.get<string>('GEMINI_API_VERSION') ||
      process.env.GEMINI_API_VERSION;

    if (baseUrl) {
      requestOptions.baseUrl = baseUrl.trim();
      this.logger.log(
        `🤖 AI Coding configured with Custom Base URL: ${requestOptions.baseUrl}`,
      );
    }
    if (apiVersion) {
      requestOptions.apiVersion = apiVersion.trim();
      this.logger.log(
        `🤖 AI Coding configured with Custom API Version: ${requestOptions.apiVersion}`,
      );
    }
    this.requestOptions = requestOptions;

    const configuredFallbacks = (
      this.configService.get<string>('GEMINI_FALLBACK_MODELS') ||
      process.env.GEMINI_FALLBACK_MODELS ||
      DEFAULT_GEMINI_FALLBACK_MODELS.join(',')
    )
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item !== modelName);
    this.fallbackModelNames = Array.from(new Set(configuredFallbacks));

    this.model = this.createGenerativeModel(modelName);
    return true;
  }

  /**
   * Analyze clinical notes and suggest ICD-10 and CPT codes
   */
  async suggestCodes(
    clinicalNote: string,
    patientDemographics?: string,
  ): Promise<AiCodingSuggestion> {
    const ready = await this.ensureModelLoaded();
    if (!ready || !this.model) {
      throw new InternalServerErrorException(
        'AI Model is not configured (Missing GEMINI_API_KEY)',
      );
    }

    const prompt = `
You are an expert medical coder (HIM / AAPC certified) and a senior physician. 
Your primary goal is MAXIMUM CLINICAL ACCURACY. 
Analyze the following clinical note and suggest the most appropriate and highly specific ICD-10-CM and CPT-4 codes.
Strictly adhere to the official WHO ICD-10 guidelines and AMA CPT coding standards. Do not hallucinate codes.

CRITICAL INSTRUCTIONS:
1. EXTRACT NUANCES: Pay strict attention to laterality, specific anatomic sites, encounter type, and EXACT patient role (e.g., driver code V47.5- vs. passenger code V47.6-).
2. COMBINATION CODES: Prioritize combination codes for conditions with common symptoms/manifestations (e.g., Diabetes with Neuropathy) over individual codes.
3. CPT & E/M CODES: Every clinical encounter involves at least one procedure. Include the appropriate E&M CPT code matching the Medical Decision Making (MDM) complexity. NEVER return an empty "procedures" array.
4. BUNDLING, IMAGING & MODIFIERS: Do not unbundle surgical procedures. HOWEVER, diagnostic imaging (X-rays, CT scans) and laboratory tests are NEVER bundled with E&M visits; they MUST be explicitly extracted as separate CPT codes. Suggest standard CPT modifiers (-RT, -LT, etc.) when clinically appropriate.
5. LOCALIZATION & TERMINOLOGY: Accurately interpret local medical terms if present. For example, treat the Arabic term "إيواء" as Hospital Admission (Inpatient Care), not merely an outpatient observation.

Provide your response strictly in the following JSON format.
IMPORTANT: You MUST write the "reasoning" key BEFORE the "diagnoses" and "procedures" arrays. This is required to ensure step-by-step clinical thinking before generating the codes.

{
  "reasoning": "Step-by-step explanation of finding specific diagnoses, laterality, complexity, and checking NCCI edits.",
  "diagnoses": [ { "code": "ICD-10 code", "nameEn": "English name", "nameAr": "Arabic name", "confidence": 0.0 - 1.0 } ],
  "procedures": [ { "code": "CPT code", "modifier": "Modifier code (e.g., RT, 57) or null", "nameEn": "English name", "nameAr": "Arabic name", "confidence": 0.0 - 1.0 } ]
}

Ensure the output is ONLY valid JSON, without markdown formatting like \`\`\`json.

Patient Context: ${patientDemographics || 'Not Provided'}
Clinical Note:
${clinicalNote}
`;

    try {
      const text = await this.generateJsonText(prompt);
      const parsed = JSON.parse(text) as AiCodingSuggestion;

      // Validate response structure
      if (!Array.isArray(parsed.diagnoses)) {
        parsed.diagnoses = [];
      }
      if (!Array.isArray(parsed.procedures)) {
        parsed.procedures = [];
        this.logger.warn('⚠️ AI model returned empty procedures array.');
      }

      return parsed;
    } catch (error: unknown) {
      const message = this.extractErrorMessage(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to generate AI coding suggestions: ${message}`,
        stack,
      );
      if (this.isQuotaError(error)) {
        throw new ServiceUnavailableException(
          'تم تجاوز حد الاستخدام المجاني لنموذج Gemini مؤقتاً. يرجى المحاولة بعد قليل أو ضبط GEMINI_MODEL / ترقية الحصة.',
        );
      }
      throw new InternalServerErrorException(
        'Failed to process AI Coding request',
      );
    }
  }

  /**
   * Automatically determine the appropriate ServiceType from a CPT/HCPCS code
   */
  private determineServiceTypeFromCpt(cptCode: string): ServiceType {
    const codeStr = cptCode.trim().toUpperCase();
    const numericCode = parseInt(codeStr, 10);

    if (!isNaN(numericCode)) {
      // Pathology and Laboratory (80000–89398)
      if (numericCode >= 80000 && numericCode <= 89398) return ServiceType.LAB;
      // Radiology (70000–79999)
      if (numericCode >= 70000 && numericCode <= 79999)
        return ServiceType.RADIOLOGY;
      // Evaluation and Management (99202–99499)
      if (numericCode >= 99202 && numericCode <= 99499)
        return ServiceType.CONSULTATION;
      // Surgery (10000–69990)
      if (numericCode >= 10000 && numericCode <= 69990)
        return ServiceType.SURGERY;
      // Medicine / General Procedures (90000–99199)
      if (numericCode >= 90000 && numericCode <= 99199)
        return ServiceType.PROCEDURE;
      // Anesthesia (00100–01999)
      if (numericCode >= 100 && numericCode <= 1999) return ServiceType.OTHER;
    } else {
      // HCPCS Level II Alphanumeric codes
      if (codeStr.startsWith('J')) return ServiceType.PHARMACY; // Injectable Drugs
      if (codeStr.startsWith('P')) return ServiceType.LAB; // Pathology/Lab
      if (codeStr.startsWith('R')) return ServiceType.RADIOLOGY; // Radiology
    }

    return ServiceType.PROCEDURE; // Fallback
  }

  /**
   * Apply AI-suggested codes to the encounter:
   * - ICD-10 codes → EncounterDiagnosis records
   * - CPT codes → EncounterCharge records (with price lookup)
   *
   * Uses a transaction to ensure all-or-nothing consistency.
   */
  async applySuggestedCodes(
    dto: ApplyCodesDto,
    userId: number,
    hospitalId: number,
  ): Promise<ApplyCodesResult> {
    const { encounterId, selectedDiagnoses, selectedProcedures } = dto;

    if (!selectedDiagnoses?.length && !selectedProcedures?.length) {
      throw new BadRequestException('يرجى اختيار كود واحد على الأقل للاعتماد.');
    }

    // Verify encounter exists and belongs to this hospital
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, hospitalId },
      include: {
        patient: { select: { id: true, insurancePolicy: true } },
      },
    });

    if (!encounter) {
      throw new BadRequestException('الحالة الطبية غير موجودة.');
    }

    if (encounter.status !== 'OPEN') {
      throw new BadRequestException('لا يمكن إضافة أكواد لحالة مغلقة.');
    }

    const warnings: string[] = [];
    let diagnosesSaved = 0;
    let proceduresSaved = 0;

    await this.prisma.$transaction(async (tx) => {
      // ─── 1. Save ICD-10 Diagnoses ───────────────────────────────
      for (const dx of selectedDiagnoses) {
        try {
          // Find or create TerminologyConcept for this ICD-10
          let termConcept = await tx.terminologyConcept.findFirst({
            where: {
              system: TerminologySystem.ICD10,
              code: dx.code,
            },
          });

          if (!termConcept) {
            termConcept = await tx.terminologyConcept.create({
              data: {
                system: TerminologySystem.ICD10,
                code: dx.code,
                display: dx.nameEn,
                displayAr: dx.nameAr || null,
                isActive: true,
              },
            });
            this.logger.log(
              `📚 Auto-created TerminologyConcept (ICD10): ${dx.code}`,
            );
          }

          // Find or create the DiagnosisCode record
          let diagCode = await tx.diagnosisCode.findFirst({
            where: {
              OR: [{ code: dx.code }, { icd10Code: dx.code }],
            },
          });

          if (!diagCode) {
            // Auto-create DiagnosisCode for this ICD-10 code
            diagCode = await tx.diagnosisCode.create({
              data: {
                code: dx.code,
                nameEn: dx.nameEn,
                nameAr: dx.nameAr || null,
                icd10Code: dx.code,
                terminologyConceptId: termConcept.id,
                isActive: true,
              },
            });
            this.logger.log(
              `📝 Auto-created DiagnosisCode: ${dx.code} — ${dx.nameEn}`,
            );
          } else if (!diagCode.terminologyConceptId) {
            // Link existing DiagnosisCode to the TerminologyConcept if not linked
            await tx.diagnosisCode.update({
              where: { id: diagCode.id },
              data: { terminologyConceptId: termConcept.id },
            });
          }

          // Check for duplicates before inserting
          const existing = await tx.encounterDiagnosis.findFirst({
            where: {
              encounterId,
              diagnosisCodeId: diagCode.id,
            },
          });

          if (existing) {
            warnings.push(`التشخيص ${dx.code} موجود مسبقاً في هذه الحالة`);
            continue;
          }

          // Create EncounterDiagnosis
          await tx.encounterDiagnosis.create({
            data: {
              encounterId,
              diagnosisCodeId: diagCode.id,
              type:
                dx.type === 'PRIMARY'
                  ? DiagnosisType.PRIMARY
                  : DiagnosisType.SECONDARY,
              note: `[AI-Assisted] ${dx.nameEn}`,
              createdById: userId,
            },
          });

          diagnosesSaved++;
        } catch (err: any) {
          this.logger.warn(
            `⚠️ Failed to save diagnosis ${dx.code}: ${err.message}`,
          );
          warnings.push(`تعذر حفظ التشخيص ${dx.code}: ${err.message}`);
        }
      }

      // ─── 2. Save CPT Procedures as Encounter Charges ────────────
      for (const px of selectedProcedures) {
        try {
          // Look up ServiceItem by CPT code
          let serviceItem = await tx.serviceItem.findFirst({
            where: {
              hospitalId,
              isActive: true,
              OR: [
                { cptCode: px.code },
                { code: px.code },
                { code: `CPT-${px.code}` },
              ],
            },
          });

          if (!serviceItem) {
            // Auto-create ServiceItem for this CPT code
            serviceItem = await tx.serviceItem.create({
              data: {
                hospitalId,
                code: px.code,
                cptCode: px.code,
                name: px.nameEn,
                type: this.determineServiceTypeFromCpt(px.code),
                defaultPrice: 0,
                isActive: true,
                isBillable: true,
              },
            });
            this.logger.log(
              `📝 Auto-created ServiceItem: ${px.code} — ${px.nameEn}`,
            );
          }

          // Check for duplicate charges
          const existingCharge = await tx.encounterCharge.findFirst({
            where: {
              encounterId,
              serviceItemId: serviceItem.id,
            },
          });

          if (existingCharge) {
            warnings.push(`الخدمة ${px.code} مُضافة مسبقاً للفوترة`);
            continue;
          }

          // Get price from the price list (considers insurance if applicable)
          const insurancePolicyId = encounter.patient?.insurancePolicy?.isActive
            ? (encounter.patient.insurancePolicy as any).id
            : null;

          const explodedItems =
            await this.servicesService.explodeServiceCharges(
              hospitalId,
              serviceItem.id,
              insurancePolicyId,
            );

          for (const expItem of explodedItems) {
            let itemPrice = 0;
            try {
              itemPrice = await this.priceService.getServicePrice(
                hospitalId,
                expItem.serviceItemId,
                insurancePolicyId,
              );
            } catch {
              itemPrice = Number(serviceItem.defaultPrice || 0); // Should ideally be child's defaultPrice, but this fallback is rare
            }

            // Create EncounterCharge
            await tx.encounterCharge.create({
              data: {
                hospitalId,
                encounterId,
                serviceItemId: expItem.serviceItemId,
                sourceType: ChargeSource.MANUAL,
                quantity: expItem.quantity,
                unitPrice: itemPrice,
                totalAmount: itemPrice * expItem.quantity,
                performerId: encounter.doctorId ?? userId,
              },
            });
          }

          proceduresSaved++;
          this.logger.log(
            `💰 Auto-billed CPT ${px.code} (encounter #${encounterId})`,
          );
        } catch (err: any) {
          this.logger.warn(
            `⚠️ Failed to save procedure ${px.code}: ${err.message}`,
          );
          warnings.push(`تعذر إضافة الإجراء ${px.code}: ${err.message}`);
        }
      }
    });

    if (proceduresSaved > 0) {
      try {
        await this.billingService.createInvoiceForEncounter(
          encounterId,
          hospitalId,
          userId,
        );
        this.logger.log(
          `Generated Invoice for AI-coded CPT procedures on Encounter #${encounterId}`,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to generate invoice for AI-coded CPT procedures on Encounter #${encounterId}: ${err.message}`,
          err.stack,
        );
        warnings.push(
          `تم حفظ الإجراءات، ولكن تعذر إنشاء الفاتورة التلقائية: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `✅ AI Coding Applied: ${diagnosesSaved} diagnoses, ${proceduresSaved} procedures ` +
        `for encounter #${encounterId} by user #${userId}`,
    );

    return { diagnosesSaved, proceduresSaved, warnings };
  }

  // =====================================================================
  // Phase 3: Smart Follow-up Scheduling (AI)
  // =====================================================================

  /**
   * استخراج خطط المتابعة من ملاحظات الطبيب (حقل Plan في SOAP Note)
   * يُرجع قائمة بالإجراءات/المواعيد الموصى بها مع الإطار الزمني
   */
  async extractFollowUpPlan(planText: string): Promise<FollowUpExtraction[]> {
    const isReady = await this.ensureModelLoaded();
    if (!isReady) {
      this.logger.warn('AI Model not loaded. Cannot extract follow-up plan.');
      return [];
    }

    if (!planText || planText.trim().length < 10) {
      return [];
    }

    const prompt = `You are a medical follow-up extraction system. Analyze the following physician's "Plan" section from a clinical SOAP note and extract any follow-up appointments, procedures, or tests that need to be scheduled.

Plan text:
"""
${planText}
"""

Return a JSON array of follow-up items. Each item should have:
- "action": string - What needs to be done (e.g., "EGD", "Ultrasound", "Follow-up visit", "Blood test")
- "actionAr": string - Arabic translation of the action
- "timeframe": string - When it should be scheduled (e.g., "2 weeks", "1 month", "3 days")
- "timeframeDays": number - Approximate number of days from now
- "priority": "ROUTINE" | "URGENT" | "STAT"
- "department": string - Suggested department (e.g., "Gastroenterology", "Radiology", "Lab")
- "notes": string - Any additional context from the plan text

If no follow-up items are found, return an empty array [].
Only return valid JSON, no markdown or explanation.`;

    try {
      const text = await this.generateJsonText(prompt);
      const parsed = JSON.parse(text) as unknown;

      if (!Array.isArray(parsed)) {
        this.logger.warn('AI returned non-array for follow-up extraction');
        return [];
      }

      return parsed.map((raw) => {
        const item = (raw && typeof raw === 'object' ? raw : {}) as {
          action?: string;
          actionAr?: string;
          timeframe?: string;
          timeframeDays?: number;
          priority?: string;
          department?: string;
          notes?: string;
        };
        const priority: FollowUpExtraction['priority'] =
          item.priority === 'URGENT' || item.priority === 'STAT'
            ? item.priority
            : 'ROUTINE';
        return {
          action: item.action || '',
          actionAr: item.actionAr || '',
          timeframe: item.timeframe || '',
          timeframeDays: Number(item.timeframeDays) || 14,
          priority,
          department: item.department || '',
          notes: item.notes || '',
        };
      });
    } catch (error: unknown) {
      const message = this.extractErrorMessage(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to extract follow-up plan: ${message}`, stack);
      return [];
    }
  }
}

// ─── Interfaces (Phase 3) ──────────────────────────────────────────

export interface FollowUpExtraction {
  action: string;
  actionAr: string;
  timeframe: string;
  timeframeDays: number;
  priority: 'ROUTINE' | 'URGENT' | 'STAT';
  department: string;
  notes: string;
}
