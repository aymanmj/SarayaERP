import { lazy, Suspense } from 'react';
import { Route, Navigate } from 'react-router-dom';
import { usePortalAuthStore } from '../stores/portalAuthStore';

const PortalLogin = lazy(() => import('../pages/portal/PortalLogin'));
const PortalLayoutModule = lazy(() => import('../pages/portal/PortalLayout').then(m => ({ default: m.PortalLayout })));
const PortalDashboard = lazy(() => import('../pages/portal/PortalDashboard'));
const PortalAppointments = lazy(() => import('../pages/portal/PortalAppointments'));
const PortalMedicalRecords = lazy(() => import('../pages/portal/PortalMedicalRecords'));
const PortalMessages = lazy(() => import('../pages/portal/PortalMessages'));
const PortalRefills = lazy(() => import('../pages/portal/PortalRefills'));
const PortalInvoices = lazy(() => import('../pages/portal/PortalInvoices'));
const PortalProfile = lazy(() => import('../pages/portal/PortalProfile'));

function PortalGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = usePortalAuthStore();
  if (!isAuthenticated) return <Navigate to="/portal/login" replace />;
  return <>{children}</>;
}

export const PortalRoutes = (
  <>
    <Route path="/portal/login" element={<PortalLogin />} />
    <Route path="/portal" element={<PortalGuard><PortalLayoutModule /></PortalGuard>}>
      <Route index element={<PortalDashboard />} />
      <Route path="appointments" element={<PortalAppointments />} />
      <Route path="records" element={<PortalMedicalRecords />} />
      <Route path="messages" element={<PortalMessages />} />
      <Route path="refills" element={<PortalRefills />} />
      <Route path="invoices" element={<PortalInvoices />} />
      <Route path="profile" element={<PortalProfile />} />
    </Route>
  </>
);
