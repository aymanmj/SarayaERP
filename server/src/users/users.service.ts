import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { LicenseService } from '../licensing/license.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { invalidateStaffSessions } from '../auth/staff-session-lock';

const PLATFORM_PRIVILEGED_ROLES = new Set(['SUPER_ADMIN', 'SYSTEM_ADMIN']);

function sanitizeUser<
  T extends { passwordHash?: unknown; mfaSecret?: unknown },
>(user: T): Omit<T, 'passwordHash' | 'mfaSecret'> {
  const { passwordHash: _omitted, mfaSecret: _omittedMfa, ...safe } = user;
  void _omitted;
  void _omittedMfa;
  return safe;
}

export interface CreateUserInput {
  fullName: string;
  username: string;
  password: string;
  email?: string | null;
  phone?: string | null;
  isDoctor?: boolean;
  basicSalary?: Prisma.UserUncheckedCreateInput['basicSalary'];
  housingAllowance?: Prisma.UserUncheckedCreateInput['housingAllowance'];
  transportAllowance?: Prisma.UserUncheckedCreateInput['transportAllowance'];
  otherAllowance?: Prisma.UserUncheckedCreateInput['otherAllowance'];
  departmentId?: number | null;
  specialtyId?: number | null;
  jobRank?: Prisma.UserUncheckedCreateInput['jobRank'];
  commissionRate?: Prisma.UserUncheckedCreateInput['commissionRate'];
  annualLeaveBalance?: number | null;
  roles?: string[];
}

export interface UpdateUserInput {
  fullName?: string;
  username?: string;
  password?: string;
  email?: string | null;
  phone?: string | null;
  isDoctor?: boolean;
  isActive?: boolean;
  basicSalary?: Prisma.UserUncheckedUpdateInput['basicSalary'];
  housingAllowance?: Prisma.UserUncheckedUpdateInput['housingAllowance'];
  transportAllowance?: Prisma.UserUncheckedUpdateInput['transportAllowance'];
  otherAllowance?: Prisma.UserUncheckedUpdateInput['otherAllowance'];
  departmentId?: number | null;
  specialtyId?: number | null;
  jobRank?: Prisma.UserUncheckedCreateInput['jobRank'];
  commissionRate?: Prisma.UserUncheckedUpdateInput['commissionRate'];
  annualLeaveBalance?: number | null;
  roles?: string[];
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private licenseService: LicenseService,
    @Optional() private eventEmitter?: EventEmitter2,
  ) {}

  async findAll(hospitalId: number) {
    const users = await this.prisma.user.findMany({
      where: {
        hospitalId,
        isDeleted: false,
      },
      include: {
        userRoles: {
          include: { role: true },
        },
        department: true, // ✅ [FIX] جلب القسم
        specialty: true, // ✅ [FIX] جلب التخصص
      },
      orderBy: { fullName: 'asc' },
    });
    return users.map((u) => sanitizeUser(u));
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

  async create(
    hospitalId: number,
    data: CreateUserInput,
    actorIsSuperAdmin = false,
  ) {
    if (typeof data.password !== 'string' || data.password.trim().length < 8) {
      throw new BadRequestException('كلمة المرور يجب أن لا تقل عن 8 أحرف.');
    }

    if (Array.isArray(data.roles)) {
      const requestsPrivileged = data.roles.some((roleName) =>
        PLATFORM_PRIVILEGED_ROLES.has(roleName.trim().toUpperCase()),
      );
      if (requestsPrivileged && !actorIsSuperAdmin) {
        throw new ForbiddenException(
          'لا تملك صلاحية إسناد أدوار إدارة المنصة.',
        );
      }
    }

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

    const created = await this.prisma.$transaction(async (tx) => {
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
          commissionRate: data.commissionRate ?? undefined,
          annualLeaveBalance: data.annualLeaveBalance ?? undefined,
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

    return sanitizeUser(created);
  }

  async update(
    hospitalId: number,
    id: number,
    data: UpdateUserInput,
    actorIsSuperAdmin = false,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id, hospitalId },
      include: {
        userRoles: {
          include: {
            role: { select: { name: true } },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('المستخدم غير موجود.');

    const targetIsPrivileged = (user.userRoles || []).some((ur) =>
      PLATFORM_PRIVILEGED_ROLES.has(ur.role.name.trim().toUpperCase()),
    );
    if (targetIsPrivileged && !actorIsSuperAdmin) {
      throw new ForbiddenException('لا تملك صلاحية تعديل حساب إدارة المنصة.');
    }

    if (Array.isArray(data.roles)) {
      const requestsPrivileged = data.roles.some((roleName) =>
        PLATFORM_PRIVILEGED_ROLES.has(roleName.trim().toUpperCase()),
      );
      if (requestsPrivileged && !actorIsSuperAdmin) {
        throw new ForbiddenException(
          'لا تملك صلاحية إسناد أدوار إدارة المنصة.',
        );
      }
    }

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

    const updateData: Prisma.UserUncheckedUpdateInput = {
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
      commissionRate: data.commissionRate ?? undefined,
      annualLeaveBalance: data.annualLeaveBalance ?? undefined,
    };

    const passwordChanged =
      typeof data.password === 'string' && data.password.trim() !== '';
    if (passwordChanged) {
      if ((data.password ?? '').trim().length < 8) {
        throw new BadRequestException('كلمة المرور يجب أن لا تقل عن 8 أحرف.');
      }
      updateData.passwordHash = await bcrypt.hash(data.password as string, 10);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
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

      if (passwordChanged) {
        await invalidateStaffSessions(tx, id);
      }

      return updatedUser;
    });

    if (data.isActive === false || passwordChanged) {
      this.eventEmitter?.emit('user.deactivated', { hospitalId, userId: id });
    } else if (Array.isArray(data.roles)) {
      this.eventEmitter?.emit('user.roles_updated', { hospitalId, userId: id });
    }

    return sanitizeUser(updated);
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

  // ✅ [NEW] جلب جميع الموظفين الطبيين (أطباء + تمريض + فنيين) لطاقم العمليات
  async findActiveStaff(hospitalId: number) {
    return this.prisma.user.findMany({
      where: {
        hospitalId,
        isActive: true,
        isDeleted: false,
      },
      select: {
        id: true,
        fullName: true,
        departmentId: true,
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
    if (
      !Number.isSafeInteger(roleId) ||
      roleId <= 0 ||
      roleId > 2147483647 ||
      !Array.isArray(permissionIds) ||
      permissionIds.some(
        (id) => !Number.isSafeInteger(id) || id <= 0 || id > 2147483647,
      ) ||
      new Set(permissionIds).size !== permissionIds.length
    )
      throw new BadRequestException('معرفات الدور والصلاحيات غير صالحة');
    const updatedRole = await this.prisma.$transaction(async (tx) => {
      const roles = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM "Role" WHERE id = ${roleId} FOR UPDATE
      `;
      if (!roles.length) throw new NotFoundException('الدور غير موجود');
      const permissions = await tx.permission.count({
        where: { id: { in: permissionIds } },
      });
      if (permissions !== permissionIds.length)
        throw new BadRequestException('تحتوي القائمة على صلاحية غير موجودة');
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissionIds.length) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        });
      }
      return tx.role.findUniqueOrThrow({
        where: { id: roleId },
        include: {
          rolePermissions: { include: { permission: true } },
        },
      });
    });

    this.eventEmitter?.emit('auth.role_permissions_updated', { roleId });
    return updatedRole;
  }
  async fixDoctorPermissions() {
    const DOCTOR_PERMISSIONS = [
      'INPATIENT_VIEW_MY_PATIENTS',
      'INPATIENT_VIEW_NOTES',
      'INPATIENT_ADD_NOTE',
      'INPATIENT_VIEW_CARE_PLAN',
      'INPATIENT_ADD_ORDER',
      'INPATIENT_COMPLETE_ORDER',
      'INPATIENT_VIEW_EXECUTIONS',
    ];

    const doctorRole = await this.prisma.role.findUnique({
      where: { name: 'DOCTOR' },
    });
    if (!doctorRole) throw new NotFoundException('Role DOCTOR not found');

    const results: string[] = [];

    for (const code of DOCTOR_PERMISSIONS) {
      let perm = await this.prisma.permission.findUnique({ where: { code } });
      if (!perm) {
        perm = await this.prisma.permission.create({
          data: { code, description: 'Auto-generated by fix endpoint' },
        });
        results.push(`Created Permission: ${code}`);
      }

      try {
        await this.prisma.rolePermission.create({
          data: { roleId: doctorRole.id, permissionId: perm.id },
        });
        results.push(`Assigned ${code} to DOCTOR`);
      } catch {
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
      'emr:vitals:record',
    ];

    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
    });
    if (!role) return { status: 'Error', message: 'Role NURSE not found' };

    const results: string[] = [];

    for (const permCode of requiredPermissions) {
      let perm = await this.prisma.permission.findUnique({
        where: { code: permCode },
      });
      if (!perm) {
        perm = await this.prisma.permission.create({
          data: { code: permCode, description: `Permission for ${permCode}` },
        });
        results.push(`Created Permission: ${permCode}`);
      }

      const rolePerm = await this.prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: perm.id },
        },
      });

      if (!rolePerm) {
        await this.prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: perm.id },
        });
        results.push(`Assigned ${permCode} to NURSE`);
      }
    }

    return { status: 'Success', details: results };
  }
}
