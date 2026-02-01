export interface JwtPayload {
  sub: number; // userId
  username: string;
  hospitalId: number;
  roles: string[]; // مثل: ['ADMIN', 'DOCTOR']
  permissions: string[]; // ✅ Added granular permissions
}
