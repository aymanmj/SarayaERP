import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { Money } from '../common/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  type AdjudicateClaimDecisionInput,
  BatchSubmissionService,
} from './batch-submission.service';

const UUID_V4_PATTERN =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const HMAC_SIG_PATTERN = /^sha256=[\da-f]{64}$/i;
const MAX_WEBHOOK_SKEW_MS = 5 * 60 * 1000;

export type UpsertPayerIntegrationProfileInput = {
  providerId: number;
  webhookUrl?: string;
  mtlsSubjectDn?: string;
  allowedScopes?: string;
};

export type ExportFhirBatchBundleInput = {
  requestId: string;
};

export type FhirClaimResponseWebhookPayload = {
  resourceType: 'ClaimResponse';
  batchId: number;
  paymentDate?: string;
  decisions: AdjudicateClaimDecisionInput[];
};

export type InboundSignedClaimResponseWebhookInput = {
  clientId: string;
  apiKey: string;
  deliveryId: string;
  timestamp: string;
  signature: string;
  mtlsClientSubjectDn?: string;
  fhirClaimResponse: FhirClaimResponseWebhookPayload;
};

export function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function computePayerWebhookHmac(
  signingSecret: string,
  timestampIso: string,
  deliveryId: string,
  payloadSha256: string,
): string {
  const signingInput = `${timestampIso}.${deliveryId.toLowerCase()}.${payloadSha256}`;
  const digest = createHmac('sha256', signingSecret)
    .update(signingInput, 'utf8')
    .digest('hex');
  return `sha256=${digest}`;
}

function safeEqualHexOrAscii(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * بوابة التكامل القياسي للجهات الضامنة (HL7 FHIR R4 + HMAC-SHA256 Signed Webhooks + mTLS + Zero-Trust Payer Isolation)
 */
@Injectable()
export class PayerFhirGatewayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly batchSubmissionService: BatchSubmissionService,
  ) {}

  async listIntegrationProfiles(hospitalId: number) {
    const profiles = await this.prisma.payerIntegrationProfile.findMany({
      where: { hospitalId },
      include: {
        provider: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
      orderBy: [{ id: 'desc' }],
    });

    return profiles.map((p) => ({
      id: p.id,
      hospitalId: p.hospitalId,
      providerId: p.providerId,
      provider: p.provider,
      clientId: p.clientId,
      webhookUrl: p.webhookUrl,
      mtlsSubjectDn: p.mtlsSubjectDn,
      allowedScopes: p.allowedScopes,
      isActive: p.isActive,
      signingSecretHint: `...${p.webhookSigningSecret.slice(-4)}`,
      rotatedAt: p.rotatedAt,
      createdAt: p.createdAt,
      createdBy: p.createdBy,
    }));
  }

  async upsertIntegrationProfile(
    hospitalId: number,
    userId: number,
    input: UpsertPayerIntegrationProfileInput,
  ) {
    if (!Number.isInteger(input.providerId) || input.providerId <= 0) {
      throw new BadRequestException('معرّف شركة التأمين غير صالح');
    }

    const webhookUrl = input.webhookUrl?.trim() || null;
    if (webhookUrl && !/^https:\/\/\S+$/i.test(webhookUrl)) {
      throw new BadRequestException(
        'رابط Webhook للجهة الضامنة يجب أن يستخدم بروتوكول HTTPS الآمن (https://)',
      );
    }

    const mtlsSubjectDn = input.mtlsSubjectDn?.trim() || null;
    if (
      mtlsSubjectDn &&
      (mtlsSubjectDn.length < 3 || mtlsSubjectDn.length > 300)
    ) {
      throw new BadRequestException('معرّف شهادة mTLS غير صالح');
    }

    const allowedScopes =
      input.allowedScopes?.trim() ||
      'Claim.read ClaimResponse.write PreAuth.write';

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(27011, ${hospitalId}::integer)`;

        const activeUser = await tx.user.findFirst({
          where: { id: userId, hospitalId, isActive: true, isDeleted: false },
          select: { id: true },
        });
        if (!activeUser) {
          throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
        }

        const provider = await tx.insuranceProvider.findFirst({
          where: { id: input.providerId, hospitalId, isActive: true },
          select: { id: true, name: true, code: true },
        });
        if (!provider) {
          throw new NotFoundException(
            'شركة التأمين غير موجودة أو غير نشطة ضمن المنشأة',
          );
        }

        const rawApiKey = `sry_payer_${randomBytes(24).toString('hex')}`;
        const apiKeyHash = sha256Hex(rawApiKey);
        const webhookSigningSecret = randomBytes(32).toString('hex');

        const existing = await tx.payerIntegrationProfile.findUnique({
          where: { providerId: provider.id },
        });

        if (existing && existing.hospitalId !== hospitalId) {
          throw new ForbiddenException(
            'لا يمكن تعديل ملف تكامل يخص منشأة أخرى',
          );
        }

        const profile = existing
          ? await tx.payerIntegrationProfile.update({
              where: { id: existing.id },
              data: {
                apiKeyHash,
                webhookSigningSecret,
                webhookUrl,
                mtlsSubjectDn,
                allowedScopes,
                isActive: true,
                rotatedAt: new Date(),
              },
              include: {
                provider: { select: { id: true, name: true, code: true } },
              },
            })
          : await tx.payerIntegrationProfile.create({
              data: {
                hospitalId,
                providerId: provider.id,
                clientId: `payer_client_${hospitalId}_${provider.id}_${randomBytes(8).toString('hex')}`,
                apiKeyHash,
                webhookSigningSecret,
                webhookUrl,
                mtlsSubjectDn,
                allowedScopes,
                isActive: true,
                createdById: userId,
              },
              include: {
                provider: { select: { id: true, name: true, code: true } },
              },
            });

        await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId,
          entity: 'PayerIntegrationProfile',
          entityId: profile.id,
          action: 'CONFIGURE_PAYER_INTEGRATION_PROFILE',
          details: {
            providerId: provider.id,
            providerCode: provider.code,
            clientId: profile.clientId,
            webhookUrl: profile.webhookUrl,
            mtlsEnforced: Boolean(profile.mtlsSubjectDn),
            rotated: Boolean(existing),
          },
        });

        return {
          id: profile.id,
          hospitalId: profile.hospitalId,
          providerId: profile.providerId,
          provider: profile.provider,
          clientId: profile.clientId,
          apiKey: rawApiKey,
          webhookSigningSecret,
          webhookUrl: profile.webhookUrl,
          mtlsSubjectDn: profile.mtlsSubjectDn,
          allowedScopes: profile.allowedScopes,
          isActive: profile.isActive,
        };
      },
      { maxWait: 10000, timeout: 30000 },
    );
  }

  async exportBatchAsSignedFhirBundle(
    hospitalId: number,
    userId: number,
    batchId: number,
    input: ExportFhirBatchBundleInput,
  ) {
    if (!UUID_V4_PATTERN.test(input.requestId ?? '')) {
      throw new BadRequestException('يلزم معرف طلب بصيغة UUID v4 صالحة');
    }

    const deliveryId = input.requestId.toLowerCase();

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(27011, ${hospitalId}::integer)`;

        const activeUser = await tx.user.findFirst({
          where: { id: userId, hospitalId, isActive: true, isDeleted: false },
          select: { id: true },
        });
        if (!activeUser) {
          throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
        }

        const batch = await tx.claimBatch.findFirst({
          where: { id: batchId, hospitalId },
          include: {
            hospital: { select: { id: true, name: true, code: true } },
            provider: { select: { id: true, name: true, code: true } },
            claims: {
              orderBy: { id: 'asc' },
              include: {
                invoice: {
                  include: {
                    patient: {
                      select: {
                        id: true,
                        mrn: true,
                        fullName: true,
                        globalPatientId: true,
                        insuranceMemberId: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (!batch) {
          throw new NotFoundException('دفعة المطالبات غير موجودة');
        }

        if (batch.status !== 'SUBMITTED' && batch.status !== 'CLOSED') {
          throw new BadRequestException(
            'يلزم إرسال الدفعة إلى غرفة المقاصة قبل تصدير حزمة FHIR R4',
          );
        }

        const profile = await tx.payerIntegrationProfile.findFirst({
          where: {
            hospitalId,
            providerId: batch.providerId,
            isActive: true,
          },
        });
        if (!profile) {
          throw new BadRequestException(
            'لا يوجد ملف تكامل قياسي (FHIR/Webhook) مفعّل لشركة التأمين الخاصة بهذه الدفعة',
          );
        }

        const existingEvent = await tx.payerWebhookEvent.findUnique({
          where: { deliveryId },
        });
        if (existingEvent) {
          if (
            existingEvent.hospitalId === hospitalId &&
            existingEvent.claimBatchId === batch.id &&
            existingEvent.direction === 'OUTBOUND'
          ) {
            return existingEvent;
          }
          throw new ConflictException(
            'معرّف التسليم (deliveryId) مستخدم مسبقًا لحدث مختلف',
          );
        }

        const signatureTimestamp = new Date();
        const timestampIso = signatureTimestamp.toISOString();

        const fhirBundle = {
          resourceType: 'Bundle',
          id: `saraya-clh-batch-${batch.id}`,
          type: 'collection',
          timestamp: timestampIso,
          meta: {
            profile: [
              'https://saraya-health.ly/fhir/StructureDefinition/LibyaNationalClearingBatch',
            ],
          },
          entry: [
            {
              fullUrl: `urn:uuid:organization-hospital-${batch.hospital.id}`,
              resource: {
                resourceType: 'Organization',
                id: `hospital-${batch.hospital.id}`,
                identifier: [
                  {
                    system: 'https://saraya-health.ly/fhir/hospital-code',
                    value: batch.hospital.code,
                  },
                ],
                name: batch.hospital.name,
              },
            },
            {
              fullUrl: `urn:uuid:organization-payer-${batch.provider.id}`,
              resource: {
                resourceType: 'Organization',
                id: `payer-${batch.provider.id}`,
                identifier: [
                  {
                    system: 'https://saraya-health.ly/fhir/payer-code',
                    value: batch.provider.code,
                  },
                ],
                name: batch.provider.name,
              },
            },
            ...batch.claims.map((claim) => ({
              fullUrl: `urn:uuid:claim-${claim.id}`,
              resource: {
                resourceType: 'Claim',
                id: String(claim.id),
                identifier: [
                  {
                    system: 'https://saraya-health.ly/fhir/claim-number',
                    value: claim.claimNumber,
                  },
                  {
                    system: 'https://saraya-health.ly/fhir/clearinghouse-id',
                    value:
                      claim.externalClaimId ?? `LY-CLH-${batch.id}-${claim.id}`,
                  },
                ],
                status: 'active',
                type: {
                  coding: [
                    {
                      system:
                        'http://terminology.hl7.org/CodeSystem/claim-type',
                      code: 'institutional',
                    },
                  ],
                },
                use: 'claim',
                patient: {
                  reference: `Patient/${claim.invoice.patient.id}`,
                  display: claim.invoice.patient.fullName,
                  identifier: {
                    system: 'https://saraya-health.ly/fhir/mpi-global-id',
                    value: String(
                      claim.invoice.patient.globalPatientId ??
                        claim.invoice.patient.mrn,
                    ),
                  },
                },
                created: claim.createdAt.toISOString(),
                insurer: {
                  reference: `Organization/payer-${batch.provider.id}`,
                  display: batch.provider.name,
                },
                provider: {
                  reference: `Organization/hospital-${batch.hospital.id}`,
                  display: batch.hospital.name,
                },
                total: {
                  value: Money.toDbString(claim.claimedAmount),
                  currency: 'LYD',
                },
              },
            })),
          ],
        };

        const rawJson = JSON.stringify(fhirBundle);
        const payloadSha256 = sha256Hex(rawJson);
        const hmacSignature = computePayerWebhookHmac(
          profile.webhookSigningSecret,
          timestampIso,
          deliveryId,
          payloadSha256,
        );

        const event = await tx.payerWebhookEvent.create({
          data: {
            hospitalId,
            providerId: batch.providerId,
            profileId: profile.id,
            direction: 'OUTBOUND',
            eventType: 'FHIR_CLAIM_BATCH_BUNDLE',
            deliveryId,
            payloadSha256,
            hmacSignature,
            signatureTimestamp,
            fhirResourceType: 'Bundle',
            claimBatchId: batch.id,
            status: 'DISPATCHED',
            fhirPayload: fhirBundle as Prisma.InputJsonValue,
          },
        });

        await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId,
          entity: 'PayerWebhookEvent',
          entityId: event.id,
          action: 'EXPORT_FHIR_CLAIM_BATCH_BUNDLE',
          details: {
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            providerId: batch.providerId,
            deliveryId,
            payloadSha256,
            hmacSignature,
          },
        });

        return event;
      },
      { maxWait: 10000, timeout: 30000 },
    );
  }

  async processInboundSignedClaimResponseWebhook(
    hospitalId: number,
    userId: number,
    input: InboundSignedClaimResponseWebhookInput,
  ) {
    if (!UUID_V4_PATTERN.test(input.deliveryId ?? '')) {
      throw new BadRequestException(
        'يلزم معرّف تسليم (deliveryId) بصيغة UUID v4',
      );
    }
    if (!HMAC_SIG_PATTERN.test(input.signature ?? '')) {
      throw new UnauthorizedException(
        'صيغة توقيع HMAC-SHA256 غير صالحة (المتوقع sha256=<hex>)',
      );
    }
    const sigTime = new Date(input.timestamp);
    if (Number.isNaN(sigTime.getTime())) {
      throw new BadRequestException('الطابع الزمني لتوقيع Webhook غير صالح');
    }
    if (Math.abs(Date.now() - sigTime.getTime()) > MAX_WEBHOOK_SKEW_MS) {
      throw new BadRequestException(
        'الطابع الزمني لرسالة Webhook خارج النافذة المسموحة (±5 دقائق — حماية ضد الإعادة)',
      );
    }
    if (
      !input.fhirClaimResponse ||
      input.fhirClaimResponse.resourceType !== 'ClaimResponse' ||
      !Number.isInteger(input.fhirClaimResponse.batchId) ||
      input.fhirClaimResponse.batchId <= 0
    ) {
      throw new BadRequestException(
        'حمولة FHIR R4 ClaimResponse غير صالحة أو تفتقد batchId',
      );
    }

    const profile = await this.prisma.payerIntegrationProfile.findFirst({
      where: {
        clientId: (input.clientId ?? '').trim(),
        hospitalId,
        isActive: true,
      },
    });
    if (!profile) {
      throw new NotFoundException(
        'ملف تكامل الجهة الضامنة غير موجود أو غير نشط ضمن المنشأة',
      );
    }

    const incomingKeyHash = sha256Hex((input.apiKey ?? '').trim());
    if (!safeEqualHexOrAscii(profile.apiKeyHash, incomingKeyHash)) {
      throw new UnauthorizedException('مفتاح API للجهة الضامنة غير صالح');
    }

    if (profile.mtlsSubjectDn) {
      const actualDn = (input.mtlsClientSubjectDn ?? '').trim();
      if (!actualDn || !safeEqualHexOrAscii(profile.mtlsSubjectDn, actualDn)) {
        throw new ForbiddenException(
          'بصمة شهادة mTLS للجهة الضامنة غير مطابقة للعقد المسجل',
        );
      }
    }

    const deliveryId = input.deliveryId.toLowerCase();
    const rawJson = JSON.stringify(input.fhirClaimResponse);
    const payloadSha256 = sha256Hex(rawJson);
    const expectedHmac = computePayerWebhookHmac(
      profile.webhookSigningSecret,
      input.timestamp,
      deliveryId,
      payloadSha256,
    );

    if (
      !safeEqualHexOrAscii(
        expectedHmac.toLowerCase(),
        input.signature.trim().toLowerCase(),
      )
    ) {
      throw new UnauthorizedException(
        'توقيع HMAC-SHA256 لحمولة FHIR ClaimResponse غير مطابق',
      );
    }

    const existingEvent = await this.prisma.payerWebhookEvent.findUnique({
      where: { deliveryId },
    });
    if (existingEvent) {
      if (
        existingEvent.hospitalId === hospitalId &&
        existingEvent.profileId === profile.id &&
        existingEvent.payloadSha256 === payloadSha256
      ) {
        const currentBatch = await this.batchSubmissionService.getBatchById(
          hospitalId,
          input.fhirClaimResponse.batchId,
        );
        return {
          webhookEvent: existingEvent,
          adjudication: {
            success: true,
            batchId: currentBatch.id,
            batchNumber: currentBatch.batchNumber,
            status: currentBatch.status,
            approvedAmount: Money.toDbString(currentBatch.approvedAmount ?? 0),
            rejectedClaimsCount: currentBatch.rejectedClaimsCount,
            eraTransaction: currentBatch.eraTransaction,
          },
        };
      }
      throw new ConflictException(
        'معرّف التسليم (deliveryId) مستخدم مسبقًا بحمولة مختلفة',
      );
    }

    const targetBatch = await this.prisma.claimBatch.findFirst({
      where: { id: input.fhirClaimResponse.batchId, hospitalId },
      select: { id: true, providerId: true, status: true },
    });
    if (!targetBatch) {
      throw new NotFoundException('دفعة المطالبات غير موجودة ضمن المنشأة');
    }

    // Zero-Trust Cross-Payer Isolation: Payer A cannot adjudicate Payer B's batch
    if (targetBatch.providerId !== profile.providerId) {
      throw new ForbiddenException(
        'عزل الجهات الضامنة (Zero-Trust): لا تملك هذه الجهة الضامنة صلاحية البت في دفعة تخص شركة تأمين أخرى',
      );
    }

    const adjudication =
      await this.batchSubmissionService.adjudicateBatchInClearinghouse(
        hospitalId,
        userId,
        targetBatch.id,
        {
          requestId: deliveryId,
          paymentDate: input.fhirClaimResponse.paymentDate,
          decisions: input.fhirClaimResponse.decisions,
        },
      );

    const webhookEvent = await this.prisma.$transaction(async (tx) => {
      const createdEvent = await tx.payerWebhookEvent.create({
        data: {
          hospitalId,
          providerId: profile.providerId,
          profileId: profile.id,
          direction: 'INBOUND',
          eventType: 'FHIR_CLAIM_ADJUDICATION_CALLBACK',
          deliveryId,
          payloadSha256,
          hmacSignature: expectedHmac,
          signatureTimestamp: sigTime,
          fhirResourceType: 'ClaimResponse',
          claimBatchId: targetBatch.id,
          status: 'VERIFIED',
          fhirPayload:
            input.fhirClaimResponse as unknown as Prisma.InputJsonValue,
        },
      });

      await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        entity: 'PayerWebhookEvent',
        entityId: createdEvent.id,
        action: 'PROCESS_PAYER_FHIR_CLAIM_RESPONSE_WEBHOOK',
        details: {
          batchId: targetBatch.id,
          providerId: profile.providerId,
          clientId: profile.clientId,
          deliveryId,
          payloadSha256,
          eraNumber: adjudication.eraTransaction?.eraNumber ?? null,
        },
      });

      return createdEvent;
    });

    return {
      webhookEvent,
      adjudication,
    };
  }

  listWebhookEvents(hospitalId: number, providerId?: number) {
    return this.prisma.payerWebhookEvent.findMany({
      where: {
        hospitalId,
        ...(providerId ? { providerId } : {}),
      },
      include: {
        provider: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
}
