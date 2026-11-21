import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';

/**
 * خدمة إدارة عقود التأمين (Insurance Contracts)
 *
 * الميزات:
 * 1. إنشاء وإدارة العقود والمنافع التأمينية
 * 2. تطبيق RLS تلقائياً لكل مؤسسة طبية (Multi-Tenancy)
 * 3. التحقق من صلاحية العقود
 */
@Injectable()
export class InsuranceContractService {
  private readonly logger = new Logger(InsuranceContractService.name);

  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
  ) {}

  /**
   * إنشاء عقد تأمين جديد
   */
  async createContract(data: {
    insuranceProviderId: number;
    contractNumber: string;
    name: string;
    effectiveFrom: Date;
    effectiveTo: Date;
    discountPercentage?: number;
    copayPercentage?: number;
    deductible?: number;
    maxCoverage?: number;
    preAuthRequired?: boolean;
    networkType?: string;
    paymentTermDays?: number;
    notes?: string;
    benefits?: Array<{
      serviceType: string;
      serviceCode?: string;
      agreedPrice?: number;
      discountPercent?: number;
      copayAmount?: number;
      copayPercent?: number;
      maxQuantity?: number;
      requiresPreAuth?: boolean;
    }>;
  }) {
    const hospitalId = this.cls.get('hospitalId');
    if (!hospitalId) {
      throw new BadRequestException('معرّف المستشفى غير متوفر في السياق');
    }

    return this.prisma.insuranceContract.create({
      data: {
        hospitalId,
        ...data,
        benefits: {
          create: data.benefits || [],
        },
      },
      include: {
        benefits: true,
      },
    });
  }

  /**
   * جلب عقد تأمين مع جميع المنافع
   */
  async getContract(id: number, hospitalIdParam?: number) {
    const hospitalId = hospitalIdParam ?? this.cls.get('hospitalId');
    const contract = await this.prisma.insuranceContract.findFirst({
      where: {
        id,
        ...(hospitalId ? { hospitalId } : {}),
      },
      include: {
        benefits: true,
        insuranceProvider: true,
      },
    });

    if (!contract || contract.isDeleted) {
      throw new NotFoundException('عقد التأمين غير موجود');
    }

    return contract;
  }

  /**
   * البحث عن العقود الفعالة
   */
  async findActiveContracts(
    insuranceProviderId?: number,
    hospitalIdParam?: number,
  ) {
    const hospitalId = hospitalIdParam ?? this.cls.get('hospitalId');
    const whereClause: any = {
      isDeleted: false,
      status: 'ACTIVE',
      effectiveFrom: { lte: new Date() },
      effectiveTo: { gte: new Date() },
      ...(hospitalId ? { hospitalId } : {}),
    };

    if (insuranceProviderId) {
      whereClause.insuranceProviderId = insuranceProviderId;
    }

    return this.prisma.insuranceContract.findMany({
      where: whereClause,
      include: {
        insuranceProvider: true,
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  /**
   * إيقاف أو إلغاء عقد تأمين
   */
  async suspendContract(id: number, reason?: string, hospitalIdParam?: number) {
    const hospitalId = hospitalIdParam ?? this.cls.get('hospitalId');
    const existing = await this.prisma.insuranceContract.findFirst({
      where: {
        id,
        isDeleted: false,
        ...(hospitalId ? { hospitalId } : {}),
      },
    });
    if (!existing) {
      throw new NotFoundException('عقد التأمين غير موجود');
    }

    return this.prisma.insuranceContract.update({
      where: { id: existing.id },
      data: {
        status: 'SUSPENDED',
        notes: reason,
      },
    });
  }
}
