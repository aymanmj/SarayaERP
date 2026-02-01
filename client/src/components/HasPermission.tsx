// src/components/HasPermission.tsx

import { ReactNode } from "react";
import { useAuthStore } from "../stores/authStore";

type Props = {
  access: string; // كود الصلاحية المطلوبة مثلاً 'billing:invoice:cancel'
  children: ReactNode;
  fallback?: ReactNode; // اختياري: ماذا يظهر بدلاً من العنصر المخفي
};

export const HasPermission = ({ access, children, fallback = null }: Props) => {
  const user = useAuthStore((s) => s.user);

  if (!user) return <>{fallback}</>;

  // الأدمن المطلق يرى كل شيء
  if (user.roles.includes("ADMIN")) return <>{children}</>;

  // التحقق من وجود الصلاحية في مصفوفة صلاحيات المستخدم
  const hasAccess = user.permissions?.includes(access);

  if (!hasAccess) return <>{fallback}</>;

  return <>{children}</>;
};
