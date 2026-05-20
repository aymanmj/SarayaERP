import { useAuthStore } from "@/stores/authStore";
import { useCallback } from "react";

export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      // ADMIN has all permissions
      if (user.roles?.includes("ADMIN")) return true;
      // Check explicit permissions
      if (user.permissions?.includes(permission)) return true;
      // Check if the permission prefix matches a role
      return false;
    },
    [user]
  );

  return {
    user,
    isAuthenticated,
    login,
    logout,
    hasPermission,
  };
}
