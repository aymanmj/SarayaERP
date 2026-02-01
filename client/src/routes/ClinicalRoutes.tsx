import { lazy } from "react";
import { Route } from "react-router-dom";

// --- Clinical ---
const PatientsPage = lazy(() =>
  import("../pages/PatientsPage").then((m) => ({ default: m.PatientsPage })),
);
const EncountersListPage = lazy(() => import("../pages/EncountersListPage"));
const EncounterDetailsPage = lazy(() => import("../pages/EncounterDetailsPage"));
const AppointmentsPage = lazy(() => import("../pages/AppointmentsPage"));
const AdmissionsPage = lazy(() => import("../pages/AdmissionsPage"));
const ActiveInpatientsPage = lazy(() => import("../pages/ActiveInpatientsPage"));
const DoctorRoundsPage = lazy(() => import("../pages/DoctorRoundsPage")); // ✅
const TriageDashboardPage = lazy(() =>
  import("../pages/clinical/triage/TriageDashboard").then((m) => ({
    default: m.TriageDashboard,
  })),
);
const TriageAssessmentFormPage = lazy(() =>
  import("../pages/clinical/triage/TriageAssessmentForm").then((m) => ({
    default: m.TriageAssessmentForm,
  })),
);

// Specialized
const NursingStationPage = lazy(() => import("../pages/NursingStationPage"));
const NursingPatientDetailsPage = lazy(
  () => import("../pages/NursingPatientDetailsPage"),
);
const HousekeepingPage = lazy(() => import("../pages/HousekeepingPage"));

const LabWorklistPage = lazy(() => import("../pages/LabWorklistPage"));
const LabReportPrintPage = lazy(() => import("../pages/LabReportPrintPage"));

const RadiologyWorklistPage = lazy(
  () => import("../pages/RadiologyWorklistPage"),
);
const RadiologyReportPrintPage = lazy(
  () => import("../pages/RadiologyReportPrintPage"),
);

const PharmacyWorklistPage = lazy(() => import("../pages/PharmacyWorklistPage"));
const PharmacyStockPage = lazy(() => import("../pages/PharmacyStockPage"));
const PharmacyStockReportPage = lazy(
  () => import("../pages/PharmacyStockReportPage"),
);

const SurgerySchedulePage = lazy(() => import("../pages/SurgerySchedulePage"));
const SurgeryCaseDetailsPage = lazy(
  () => import("../pages/SurgeryCaseDetailsPage"),
);

export const ClinicalRoutes = (
  <>
    {/* Core Clinical */}
    <Route path="/patients" element={<PatientsPage />} />
    <Route path="/encounters" element={<EncountersListPage />} />
    <Route path="/encounters/:id" element={<EncounterDetailsPage />} />
    <Route path="/appointments" element={<AppointmentsPage />} />
    <Route path="/admissions" element={<AdmissionsPage />} />
    <Route path="/active-inpatients" element={<ActiveInpatientsPage />} />
    <Route path="/doctor-rounds" element={<DoctorRoundsPage />} /> {/* ✅ */}
    <Route path="/triage" element={<TriageDashboardPage />} />
    {/* Triage Assessment Route */}
    <Route
      path="/clinical/triage/assess/:id"
      element={<TriageAssessmentFormPage />}
    />

    {/* Nursing & Housekeeping */}
    <Route path="/nursing" element={<NursingStationPage />} />
    <Route
      path="/nursing/patient/:id"
      element={<NursingPatientDetailsPage />}
    />
    <Route path="/housekeeping" element={<HousekeepingPage />} />

    {/* Lab */}
    <Route path="/lab" element={<LabWorklistPage />} />
    <Route
      path="/lab/encounters/:id/print"
      element={<LabReportPrintPage />}
    />

    {/* Radiology */}
    <Route path="/radiology" element={<RadiologyWorklistPage />} />
    <Route
      path="/radiology/orders/:id/print"
      element={<RadiologyReportPrintPage />}
    />

    {/* Pharmacy */}
    <Route path="/pharmacy" element={<PharmacyWorklistPage />} />
    <Route path="/pharmacy/stock" element={<PharmacyStockPage />} />
    <Route
      path="/pharmacy/stock-report"
      element={<PharmacyStockReportPage />}
    />

    {/* Surgery */}
    <Route path="/surgery" element={<SurgerySchedulePage />} />
    <Route path="/surgery/:id" element={<SurgeryCaseDetailsPage />} />
  </>
);
