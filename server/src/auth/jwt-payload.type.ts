export interface JwtPayload {
  sub: number; // userId
  username: string;
  hospitalId: number;
  organizationId?: number; // ✅ Multi-Tenancy: المؤسسة التابع لها
  isSuperAdmin?: boolean;  // ✅ Multi-Tenancy: صلاحية الوصول لكل المؤسسات
  roles: string[]; // مثل: ['ADMIN', 'DOCTOR']
  permissions: string[]; // ✅ Added granular permissions
}
