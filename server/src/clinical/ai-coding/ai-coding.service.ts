import { Injectable, Logger, InternalServerErrorException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { VaultService } from '../../common/vault/vault.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PriceListsService } from '../../price-lists/price-lists.service';
import { DiagnosisType, ChargeSource, ServiceType, TerminologySystem } from '@prisma/client';

// ─── Interfaces ────────────────────────────────────────────────────

export interface AiCodingSuggestion {
  diagnoses: Array<{ code: string; nameEn: string; nameAr: string; confidence: number }>;
  procedures: Array<{ code: string; modifier?: string; nameEn: string; nameAr: string; confidence: number }>;
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
  private model: any;
  private currentApiKey: string | null = null;

  constructor(
    private configService: ConfigService,
    private vaultService: VaultService,
    private prisma: PrismaService,
    private priceService: PriceListsService,
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
        temperature: 0.0,
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
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      let text = response.text();
      
      // Clean up markdown if model decides to output it anyway
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const parsed: AiCodingSuggestion = JSON.parse(text);

      // Validate response structure
      if (!Array.isArray(parsed.diagnoses)) {
        parsed.diagnoses = [];
      }
      if (!Array.isArray(parsed.procedures)) {
        parsed.procedures = [];
        this.logger.warn('⚠️ AI model returned empty procedures array.');
      }

      return parsed;
    } catch (error) {
      this.logger.error(`Failed to generate AI coding suggestions: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to process AI Coding request');
    }
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
            this.logger.log(`📚 Auto-created TerminologyConcept (ICD10): ${dx.code}`);
          }

          // Find or create the DiagnosisCode record
          let diagCode = await tx.diagnosisCode.findFirst({
            where: {
              OR: [
                { code: dx.code },
                { icd10Code: dx.code },
              ],
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
            this.logger.log(`📝 Auto-created DiagnosisCode: ${dx.code} — ${dx.nameEn}`);
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
              type: dx.type === 'PRIMARY' ? DiagnosisType.PRIMARY : DiagnosisType.SECONDARY,
              note: `[AI-Assisted] ${dx.nameEn}`,
              createdById: userId,
            },
          });

          diagnosesSaved++;
        } catch (err: any) {
          this.logger.warn(`⚠️ Failed to save diagnosis ${dx.code}: ${err.message}`);
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
                name: px.nameEn,
                type: ServiceType.PROCEDURE,
                defaultPrice: 0,
                isActive: true,
                isBillable: true,
              },
            });
            this.logger.log(`📝 Auto-created ServiceItem: ${px.code} — ${px.nameEn}`);
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

          let price = 0;
          try {
            price = await this.priceService.getServicePrice(
              hospitalId,
              serviceItem.id,
              insurancePolicyId,
            );
          } catch {
            // Use the service item's base price if price list lookup fails
            price = Number(serviceItem.defaultPrice || 0);
          }

          // Create EncounterCharge
          await tx.encounterCharge.create({
            data: {
              hospitalId,
              encounterId,
              serviceItemId: serviceItem.id,
              sourceType: ChargeSource.MANUAL,
              quantity: 1,
              unitPrice: price,
              totalAmount: price,
              performerId: encounter.doctorId ?? userId,
            },
          });

          proceduresSaved++;
          this.logger.log(`💰 Auto-billed CPT ${px.code}: ${price} (encounter #${encounterId})`);
        } catch (err: any) {
          this.logger.warn(`⚠️ Failed to save procedure ${px.code}: ${err.message}`);
          warnings.push(`تعذر إضافة الإجراء ${px.code}: ${err.message}`);
        }
      }
    });

    this.logger.log(
      `✅ AI Coding Applied: ${diagnosesSaved} diagnoses, ${proceduresSaved} procedures ` +
      `for encounter #${encounterId} by user #${userId}`
    );

    return { diagnosesSaved, proceduresSaved, warnings };
  }
}
