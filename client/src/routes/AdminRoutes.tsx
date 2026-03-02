import { lazy } from "react";
import { Route } from "react-router-dom";

// --- Admin & Settings ---
const OrganizationSettingsPage = lazy(
  () => import("../pages/OrganizationSettingsPage"),
);
const DepartmentsPage = lazy(() => import("../pages/settings/DepartmentsPage"));
const SpecialtiesPage = lazy(() => import("../pages/settings/SpecialtiesPage"));
const BedManagementSettingsPage = lazy(
  () => import("../pages/settings/BedManagementSettingsPage"),
);
const ServicesMasterPage = lazy(() => import("../pages/ServicesMasterPage"));
const BackupSettingsPage = lazy(() => import("../pages/settings/BackupSettingsPage"));
const SystemSettingsPage = lazy(() => import("../pages/settings/SystemSettingsPage"));
const PriceListsPage = lazy(() => import("../pages/PriceListsPage"));
const PriceListDetailsPage = lazy(() => import("../pages/PriceListDetailsPage"));
const UsersAndRolesPage = lazy(() => import("../pages/UsersAndRolesPage"));
const AuditLogsPage = lazy(() => import("../pages/AuditLogsPage"));
const IntegrationPage = lazy(() => import("../pages/IntegrationPage"));
const ExecutiveDashboardPage = lazy(() =>
  import("../pages/dashboard/ExecutiveDashboard").then((m) => ({
    default: m.ExecutiveDashboard,
  })),
);
const DoctorPerformancePage = lazy(() => import("../pages/DoctorPerformancePage"));
const CommissionSettingsPage = lazy(() => import("../pages/settings/CommissionSettingsPage"));

// --- HR ---
const PayrollPage = lazy(() => import("../pages/PayrollPage"));
const AttendancePage = lazy(() => import("../pages/AttendancePage"));
const ShiftsPage = lazy(() => import("../pages/ShiftsPage"));
const RosterPage = lazy(() => import("../pages/RosterPage"));
const LeavesPage = lazy(() => import("../pages/LeavesPage"));

const DoctorSchedulesPage = lazy(() => import("../pages/settings/DoctorSchedulesPage"));

export const AdminRoutes = (
  <>
    {/* Admin & Settings */}
    <Route path="/users" element={<UsersAndRolesPage />} />
    <Route path="/settings" element={<OrganizationSettingsPage />} />
    <Route
      path="/settings/departments"
      element={<DepartmentsPage />}
    />
    {/* ✅ جداول الأطباء */}
    <Route
      path="/settings/doctor-schedules"
      element={<DoctorSchedulesPage />}
    />
    <Route
      path="/settings/specialties"
      element={<SpecialtiesPage />}
    />
    <Route
      path="/settings/bed-management"
      element={<BedManagementSettingsPage />}
    />
    <Route
      path="/settings/price-lists"
      element={<PriceListsPage />}
    />
    <Route path="/settings/backup" element={<BackupSettingsPage />} />
    <Route path="/settings/system" element={<SystemSettingsPage />} />
    <Route path="/settings/commissions" element={<CommissionSettingsPage />} />
    <Route
      path="/price-lists/:id"
      element={<PriceListDetailsPage />}
    />
    <Route path="/services" element={<ServicesMasterPage />} />

    <Route path="/audit/logs" element={<AuditLogsPage />} />
    <Route path="/integration" element={<IntegrationPage />} />
    <Route path="/analytics/executive" element={<ExecutiveDashboardPage />} />
    <Route path="/reports/doctor-performance" element={<DoctorPerformancePage />} />
    <Route path="/settings/commissions" element={<CommissionSettingsPage />} />

    {/* HR */}
    <Route path="/hr/shifts" element={<ShiftsPage />} />
    <Route path="/hr/roster" element={<RosterPage />} />
    <Route path="/hr/leaves" element={<LeavesPage />} />
    <Route path="/attendance" element={<AttendancePage />} />
    <Route path="/payroll" element={<PayrollPage />} />
  </>
);

