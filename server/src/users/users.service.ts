import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { LicenseService } from '../licensing/license.service';
import { ForbiddenException } from '@nestjs/common';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private licenseService: LicenseService,
  ) {}

  async findAll(hospitalId: number) {
    return this.prisma.user.findMany({
      where: {
        hospitalId,
        isDeleted: false,
      },
      include: {
        userRoles: {
          include: { role: true },
        },
        department: true, // ✅ [FIX] جلب القسم
        specialty: true,  // ✅ [FIX] جلب التخصص
      },
      orderBy: { fullName: 'asc' },
    });
  }

  // async create(hospitalId: number, data: any) {
  //   // 1. التحقق من عدد المستخدمين النشطين الحاليين
  //   const activeUsersCount = await this.prisma.user.count({
  //     where: { hospitalId, isActive: true, isDeleted: false },
  //   });

  //   // 2. سؤال خدمة الترخيص: هل مسموح لي بإضافة المزيد؟
  //   const canAdd = await this.licenseService.checkUserLimit(activeUsersCount);

  //   if (!canAdd) {
  //     throw new ForbiddenException(
  //       `عذراً، لقد تجاوزت الحد المسموح به للمستخدمين في باقتك الحالية (${this.licenseService.maxUsersAllowed} مستخدم). يرجى ترقية الاشتراك لإضافة المزيد.`,
  //     );
  //   }

  //   // التحقق من اسم المستخدم
  //   const exists = await this.prisma.user.findUnique({
  //     where: { username: data.username },
  //   });
  //   if (exists) throw new BadRequestException('اسم المستخدم موجود مسبقاً.');

  //   const hashedPassword = await bcrypt.hash(data.password, 10);

  //   return this.prisma.$transaction(async (tx) => {
  //     // إنشاء المستخدم
  //     const user = await tx.user.create({
  //       data: {
  //         hospitalId,
  //         fullName: data.fullName,
  //         username: data.username,
  //         passwordHash: hashedPassword,
  //         email: data.email || null,
  //         phone: data.phone || null,
  //         isDoctor: data.isDoctor || false,

  //         // البيانات المالية
  //         basicSalary: data.basicSalary || 0,
  //         housingAllowance: data.housingAllowance || 0,
  //         transportAllowance: data.transportAllowance || 0,
  //         otherAllowance: data.otherAllowance || 0,
  //       },
  //     });

  //     // ربط الأدوار (Roles)
  //     if (data.roles && Array.isArray(data.roles)) {
  //       for (const roleName of data.roles) {
  //         const role = await tx.role.findUnique({ where: { name: roleName } });
  //         if (role) {
  //           await tx.userRole.create({
  //             data: { userId: user.id, roleId: role.id },
  //           });
  //         }
  //       }
  //     }

  //     // إذا كان طبيباً، ننشئ له جدول مواعيد افتراضي
  //     if (user.isDoctor) {
  //       await tx.doctorSchedule.create({
  //         data: {
  //           hospitalId,
  //           doctorId: user.id,
  //           maxPerDay: 20, // قيمة افتراضية
  //         },
  //       });
  //     }

  //     return user;
  //   });
  // }

  async create(hospitalId: number, data: any) {
    // 1. التحقق من اسم المستخدم
    const exists = await this.prisma.user.findUnique({
      where: { username: data.username },
    });
    if (exists) throw new BadRequestException('اسم المستخدم موجود مسبقاً.');

    // 2. 🛡️ التحقق من حد الاشتراك (Licensing Check)
    // نعد المستخدمين النشطين فقط
    const activeUsersCount = await this.prisma.user.count({
      where: { hospitalId, isActive: true, isDeleted: false },
    });

    const canAdd = this.licenseService.checkUserLimit(activeUsersCount);

    if (!canAdd) {
      const max = this.licenseService.details?.maxUsers;
      throw new ForbiddenException(
        `عذراً، لقد وصلت للحد الأقصى من المستخدمين المسموح به في باقتك (${max} مستخدم). يرجى ترقية الاشتراك لإضافة المزيد.`,
      );
    }

    // 3. إنشاء المستخدم (الكود القديم)
    const hashedPassword = await bcrypt.hash(data.password, 10);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          hospitalId,
          fullName: data.fullName,
          username: data.username,
          passwordHash: hashedPassword,
          email: data.email || null,
          phone: data.phone || null,
          isDoctor: data.isDoctor || false,
          basicSalary: data.basicSalary || 0,
          housingAllowance: data.housingAllowance || 0,
          transportAllowance: data.transportAllowance || 0,
          otherAllowance: data.otherAllowance || 0,

          // ✅ [FIX] حقول كانت مفقودة عند الإنشاء (موجودة فقط في التعديل)
          departmentId: data.departmentId || null,
          specialtyId: data.specialtyId || null,
          jobRank: data.isDoctor && data.jobRank ? data.jobRank : null,
          commissionRate: data.commissionRate ?? null,
          annualLeaveBalance: data.annualLeaveBalance ?? null,
        },
      });

      if (data.roles && Array.isArray(data.roles)) {
        for (const roleName of data.roles) {
          const role = await tx.role.findUnique({ where: { name: roleName } });
          if (role) {
            await tx.userRole.create({
              data: { userId: user.id, roleId: role.id },
            });
          }
        }
      }

      if (user.isDoctor) {
        await tx.doctorSchedule.create({
          data: {
            hospitalId,
            doctorId: user.id,
            maxPerDay: 20,
          },
        });
      }

      return user;
    });
  }

  async update(hospitalId: number, id: number, data: any) {
    const user = await this.prisma.user.findFirst({
      where: { id, hospitalId },
    });

    if (!user) throw new NotFoundException('المستخدم غير موجود.');

    // ✅ التحقق من تكرار البريد الإلكتروني (إذا تم تغييره)
    if (data.email && data.email !== user.email) {
      const emailExists = await this.prisma.user.findUnique({
        where: { email: data.email },
      });
      // إذا وجدنا مستخدماً آخر يحمل نفس الإيميل
      if (emailExists && emailExists.id !== id) {
        throw new BadRequestException(
          'البريد الإلكتروني مستخدم بالفعل لموظف آخر.',
        );
      }
    }

    // ✅ التحقق من تكرار اسم المستخدم (إذا تم تغييره)
    if (data.username && data.username !== user.username) {
      const usernameExists = await this.prisma.user.findUnique({
        where: { username: data.username },
      });
      if (usernameExists && usernameExists.id !== id) {
        throw new BadRequestException('اسم المستخدم موجود مسبقاً.');
      }
    }

    const updateData: any = {
      fullName: data.fullName,
      username: data.username,
      // تحويل النص الفارغ إلى null لتجنب مشاكل القيود الفريدة
      email: data.email ? data.email : null,
      phone: data.phone ? data.phone : null,
      isDoctor: data.isDoctor,
      isActive: data.isActive,

      // ✅ [FIX] إضافة القسم والتخصص
      departmentId: data.departmentId || null,
      specialtyId: data.specialtyId || null,

      // ✅ [NEW] إضافة الرتبة الوظيفية
      jobRank: data.isDoctor && data.jobRank ? data.jobRank : null,

      // البيانات المالية
      basicSalary: data.basicSalary,
      housingAllowance: data.housingAllowance,
      transportAllowance: data.transportAllowance,
      otherAllowance: data.otherAllowance,
      commissionRate: data.commissionRate,
      annualLeaveBalance: data.annualLeaveBalance,
    };

    if (data.password && data.password.trim() !== '') {
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id },
        data: updateData,
      });

      // تحديث الأدوار (حذف القديم وإضافة الجديد)
      if (data.roles && Array.isArray(data.roles)) {
        await tx.userRole.deleteMany({ where: { userId: id } });

        for (const roleName of data.roles) {
          const role = await tx.role.findUnique({ where: { name: roleName } });
          if (role) {
            await tx.userRole.create({
              data: { userId: id, roleId: role.id },
            });
          }
        }
      }

      return updatedUser;
    });
  }

  async findActiveDoctors(hospitalId: number) {
    return this.prisma.user.findMany({
      where: {
        hospitalId,
        isDoctor: true, // 🛡️ جلب الأطباء فقط
        isActive: true,
        isDeleted: false,
      },
      select: {
        id: true,
        fullName: true,
        departmentId: true, // ✅ [NEW] Required for admission
        specialty: { select: { name: true } }, // جلب التخصص للمساعدة في الاختيار
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async findAllRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
    });
  }

  // ✅ [NEW] Get all roles with their permissions
  async findAllRolesWithPermissions() {
    return this.prisma.role.findMany({
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ✅ [NEW] Get all available permissions
  async findAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: { code: 'asc' },
    });
  }

  // ✅ [NEW] Update permissions for a role
  async updateRolePermissions(roleId: number, permissionIds: number[]) {
    // Delete existing permissions
    await this.prisma.rolePermission.deleteMany({
      where: { roleId },
    });

    // Add new permissions
    const data = permissionIds.map((permissionId) => ({
      roleId,
      permissionId,
    }));

    await this.prisma.rolePermission.createMany({ data });

    return this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });
  }
  async fixDoctorPermissions() {
      const DOCTOR_PERMISSIONS = [
        'INPATIENT_VIEW_MY_PATIENTS',
        'INPATIENT_VIEW_NOTES',
        'INPATIENT_ADD_NOTE',
        'INPATIENT_VIEW_CARE_PLAN',
        'INPATIENT_ADD_ORDER',
        'INPATIENT_COMPLETE_ORDER',
        'INPATIENT_VIEW_EXECUTIONS'
      ];

      const doctorRole = await this.prisma.role.findUnique({ where: { name: 'DOCTOR' } });
      if (!doctorRole) throw new NotFoundException('Role DOCTOR not found');

      const results: string[] = [];

      for (const code of DOCTOR_PERMISSIONS) {
          let perm = await this.prisma.permission.findUnique({ where: { code } });
          if (!perm) {
              perm = await this.prisma.permission.create({
                  data: { code, description: 'Auto-generated by fix endpoint' }
              });
              results.push(`Created Permission: ${code}`);
          }

          try {
              await this.prisma.rolePermission.create({
                  data: { roleId: doctorRole.id, permissionId: perm.id }
              });
              results.push(`Assigned ${code} to DOCTOR`);
          } catch (e) {
              results.push(`Permission ${code} already assigned (or skipped)`);
          }
      }
      return { status: 'Success', details: results };
  }

  async fixNursePermissions() {
    const roleName = 'NURSE';
    const requiredPermissions = [
        'INPATIENT_VIEW_ALL_PATIENTS', // Required for Nursing Station
        'INPATIENT_VIEW_NOTES',
        'INPATIENT_ADD_NOTE',
        'INPATIENT_VIEW_CARE_PLAN',
        'INPATIENT_EXECUTE_ORDER',
        'INPATIENT_VIEW_EXECUTIONS',
        'emr:patient:view',
        'emr:vitals:record'
    ];

    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) return { status: 'Error', message: 'Role NURSE not found' };

    const results: string[] = [];

    for (const permCode of requiredPermissions) {
        let perm = await this.prisma.permission.findUnique({ where: { code: permCode } });
        if (!perm) {
            perm = await this.prisma.permission.create({
                data: { code: permCode, description: `Permission for ${permCode}` }
            });
            results.push(`Created Permission: ${permCode}`);
        }

        const rolePerm = await this.prisma.rolePermission.findUnique({
            where: {
                roleId_permissionId: { roleId: role.id, permissionId: perm.id }
            }
        });

        if (!rolePerm) {
            await this.prisma.rolePermission.create({
                data: { roleId: role.id, permissionId: perm.id }
            });
            results.push(`Assigned ${permCode} to NURSE`);
        }
    }

    return { status: 'Success', details: results };
  }
}
