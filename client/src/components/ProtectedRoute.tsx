// client/src/components/ProtectedRoute.tsx
// Professional Licensing System 2.0 - Fixed Version

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useLicenseStore } from "../stores/licenseStore";
import { useEffect } from "react";

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const licenseState = useLicenseStore((s) => s.licenseState);
  const fetchLicenseStatus = useLicenseStore((s) => s.fetchLicenseStatus);
  const hasFetched = useLicenseStore((s) => s.hasFetched);
  const location = useLocation();

  // Fetch license status when:
  // 1. User is authenticated
  // 2. We haven't fetched yet (hasFetched = false)
  // 3. State is idle (initial state)
  useEffect(() => {
    console.log("[ProtectedRoute] Check: isAuthenticated=", isAuthenticated, "licenseState=", licenseState, "hasFetched=", hasFetched);
    
    if (isAuthenticated && !hasFetched && licenseState === "idle") {
      console.log("[ProtectedRoute] Triggering fetchLicenseStatus...");
      fetchLicenseStatus();
    }
  }, [isAuthenticated, licenseState, hasFetched, fetchLicenseStatus]);

  // 1. Not authenticated -> Login
  if (!isAuthenticated) {
    console.log("[ProtectedRoute] Not authenticated -> redirect to login");
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // 2. License loading or idle -> Show loader
  if (licenseState === "idle" || licenseState === "loading") {
    console.log("[ProtectedRoute] License loading -> show spinner");
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-slate-500">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-500 mb-4"></div>
        <div className="text-sm animate-pulse">جارِ التحقق من الترخيص...</div>
      </div>
    );
  }

  // 3. License error -> Show error with retry
  if (licenseState === "error") {
    const errorMessage = useLicenseStore.getState().errorMessage;
    console.log("[ProtectedRoute] License error:", errorMessage);
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-slate-400">
        <div className="text-5xl mb-4">⚠️</div>
        <div className="text-lg font-semibold text-red-400 mb-2">
          خطأ في التحقق من الترخيص
        </div>
        <div className="text-sm text-slate-500 mb-6 text-center max-w-md">
          {errorMessage || "تعذر الاتصال بخادم الترخيص."}
        </div>
        <button
          onClick={() => {
            useLicenseStore.getState().reset();
            window.location.reload();
          }}
          className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  // 4. License inactive -> Activation page
  if (licenseState === "inactive") {
    console.log("[ProtectedRoute] License inactive -> redirect to activation");
    return <Navigate to="/activation" replace />;
  }

  // 5. License active -> Render children
  console.log("[ProtectedRoute] License active -> render children");
  return <Outlet />;
}
