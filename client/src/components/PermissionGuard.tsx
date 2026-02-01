// src/components/PermissionGuard.tsx

import { ReactNode } from "react";
import { useAuthStore } from "../stores/authStore";

type Props = {
  allowedRoles: string[]; // الأدوار المسموح لها (OR logic)
  children: ReactNode;
};

export const PermissionGuard = ({ allowedRoles, children }: Props) => {
  const user = useAuthStore((s) => s.user);

  if (!user) return null;

  // هل المستخدم يملك واحداً من الأدوار المسموحة؟
  // ملاحظة: الـ ADMIN يملك صلاحية مطلقة دائماً (Best Practice)
  const hasPermission =
    user.roles.includes("ADMIN") ||
    allowedRoles.some((role) => user.roles.includes(role));

  if (!hasPermission) return null;

  return <>{children}</>;
};
