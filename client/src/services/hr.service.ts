// client/src/services/hr.service.ts
import { apiClient } from "../api/apiClient";

export type EmployeeStatus =
  | "ACTIVE"
  | "PROBATION"
  | "ON_LEAVE"
  | "SUSPENDED"
  | "TERMINATED"
  | "RESIGNED";

export type ContractType =
  | "PERMANENT"
  | "TEMPORARY"
  | "PART_TIME"
  | "LOCUM"
  | "CONTRACTOR"
  | "INTERN";

export type StaffCategory =
  | "MEDICAL"
  | "NURSING"
  | "PHARMACY"
  | "LABORATORY"
  | "RADIOLOGY"
  | "TECHNICAL"
  | "ADMINISTRATIVE";

export type EmployeeActionType =
  | "HIRE"
  | "PROMOTION"
  | "TRANSFER"
  | "SALARY_ADJUSTMENT"
  | "BONUS"
  | "WARNING"
  | "SUSPENSION"
  | "TERMINATION"
  | "RESIGNATION"
  | "REHIRE";

export type RosterDayType = "WORK" | "REST" | "OFF" | "LEAVE" | "HOLIDAY";

export type ShiftType = "MORNING" | "EVENING" | "NIGHT" | "FULL_DAY";

export interface HrConfig {
  altamamIntegrationEnabled: boolean;
  defaultCurrency: string;
}

export interface EmployeeStats {
  total: number;
  active: number;
  inactive: number;
  linkedToUser: number;
  nonLoginStaff: number;
  byCategory: { staffCategory: StaffCategory; count: number }[];
  byDepartment: {
    departmentId: number | null;
    departmentName: string;
    count: number;
  }[];
}

export interface DepartmentLite {
  id: number;
  name: string;
  nameEn?: string | null;
  type?: string;
}

export interface SectionItem {
  id: number;
  hospitalId: number;
  departmentId: number;
  name: string;
  nameEn?: string | null;
  code?: string | null;
  isActive: boolean;
  department?: { id: number; name: string; nameEn?: string | null };
  _count?: { employees: number };
}

export interface JobTitleItem {
  id: number;
  hospitalId: number;
  name: string;
  nameEn?: string | null;
  code?: string | null;
  level?: number | null;
  isActive: boolean;
  _count?: { employees: number };
}

export interface SpecialtyLite {
  id: number;
  name: string;
  nameAr?: string | null;
}

export interface EmployeeListItem {
  id: number;
  employeeNo: string;
  altamamEmployeeNo?: string | null;
  biometricId?: string | null;
  userId?: number | null;
  fullName: string;
  firstNameAr: string;
  secondNameAr: string;
  thirdNameAr: string;
  lastNameAr?: string | null;
  staffCategory: StaffCategory;
  medicalRank?: string | null;
  status: EmployeeStatus;
  contractType: ContractType;
  basicSalary: string;
  currency: string;
  phone?: string | null;
  nationalId?: string | null;
  hireDate: string;
  isActive: boolean;
  department?: { id: number; name: string; nameEn?: string | null } | null;
  section?: { id: number; name: string; nameEn?: string | null } | null;
  jobTitle?: { id: number; name: string; nameEn?: string | null } | null;
  specialty?: { id: number; name: string; nameAr?: string | null } | null;
  user?: {
    id: number;
    username: string;
    isActive: boolean;
    isDoctor: boolean;
  } | null;
  _count?: {
    qualifications: number;
    trainingCourses: number;
    documents: number;
    credentials: number;
  };
}

export interface EmployeeQualification {
  id: number;
  degree: string;
  major?: string | null;
  institution: string;
  graduationYear?: number | null;
  grade?: string | null;
  documentRef?: string | null;
  notes?: string | null;
}

export interface EmployeeTrainingCourse {
  id: number;
  courseName: string;
  provider: string;
  completionDate?: string | null;
  hoursCount?: number | null;
  certificateNo?: string | null;
  documentRef?: string | null;
  notes?: string | null;
}

export interface EmployeeDocument {
  id: number;
  title: string;
  category?: string | null;
  originalName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  isEncrypted: boolean;
  expiryDate?: string | null;
  alertDaysBefore?: number;
  isVerified: boolean;
  isMandatory: boolean;
  notes?: string | null;
  createdAt: string;
}

export interface EmployeeAction {
  id: number;
  actionType: EmployeeActionType;
  fromValue?: string | null;
  toValue?: string | null;
  effectiveDate: string;
  notes?: string | null;
  approvedBy?: { id: number; fullName: string } | null;
  createdAt: string;
}

export interface WorkShiftItem {
  id: number;
  code?: string | null;
  name: string;
  nameEn?: string | null;
  type: ShiftType;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceMinutes: number;
  workHours: string;
  overtimeMultiplier: string;
  holidayMultiplier: string;
  nightAllowance: string;
  isOvernight: boolean;
  isFlexible: boolean;
  isScrubShift: boolean;
  isActive: boolean;
}

export interface ShiftAssignmentItem {
  id: number;
  employeeId: number;
  shiftId: number;
  startDate: string;
  endDate?: string | null;
  isActive: boolean;
  shift: WorkShiftItem;
  employee?: {
    id: number;
    employeeNo: string;
    fullName: string;
    staffCategory: StaffCategory;
    department?: { id: number; name: string } | null;
  };
}

export interface EmployeeDetail extends EmployeeListItem {
  firstNameEn?: string | null;
  secondNameEn?: string | null;
  thirdNameEn?: string | null;
  lastNameEn?: string | null;
  dateOfBirth?: string | null;
  gender?: "MALE" | "FEMALE" | null;
  nationality?: string | null;
  religion?: string | null;
  maritalStatus?: string | null;
  dependentsCount?: number | null;
  nationalIdExpiry?: string | null;
  passportNo?: string | null;
  passportExpiry?: string | null;
  residenceNo?: string | null;
  residenceExpiry?: string | null;
  phone2?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyRelation?: string | null;
  departmentId?: number | null;
  sectionId?: number | null;
  jobTitleId?: number | null;
  secondaryDepartmentId?: number | null;
  secondaryJobTitleId?: number | null;
  managerId?: number | null;
  specialtyId?: number | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  probationEndDate?: string | null;
  terminationDate?: string | null;
  terminationReason?: string | null;
  payBasis: string;
  housingAllowance: string;
  transportAllowance: string;
  otherAllowance: string;
  hourlyRate: string;
  fixedShift6hRate: string;
  fixedShift12hRate: string;
  fixedShift24hRate: string;
  onCallDailyRate: string;
  standardMonthlyHours: number;
  bankName?: string | null;
  bankAccountNo?: string | null;
  iban?: string | null;
  socialInsuranceNo?: string | null;
  socialInsuranceRate?: string | null;
  medicalInsuranceNo?: string | null;
  medicalInsuranceClass?: string | null;
  medicalInsuranceExpiry?: string | null;
  isTaxExempt: boolean;
  isSocialInsuranceExempt: boolean;
  payrollExemptionReason?: string | null;
  annualLeaveBalance: number;
  secondaryDepartment?: { id: number; name: string; nameEn?: string | null } | null;
  secondaryJobTitle?: { id: number; name: string; nameEn?: string | null } | null;
  manager?: { id: number; employeeNo: string; fullName: string } | null;
  user?: {
    id: number;
    username: string;
    isActive: boolean;
    isDoctor: boolean;
    jobRank?: string | null;
    userRoles?: { role: { id: number; name: string } }[];
  } | null;
  qualifications: EmployeeQualification[];
  trainingCourses: EmployeeTrainingCourse[];
  documents: EmployeeDocument[];
  actions: EmployeeAction[];
  credentials: Array<{
    id: number;
    credentialType: string;
    title: string;
    licenseNumber: string;
    issuingAuthority: string;
    issueDate: string;
    expiryDate: string;
    status: string;
  }>;
  shiftAssignments: ShiftAssignmentItem[];
}

export interface EmployeeShiftDayItem {
  id: number;
  employeeId: number;
  rosterDate: string;
  dayType: RosterDayType;
  shiftId: number | null;
  notes?: string | null;
  shift?: {
    id: number;
    code?: string | null;
    name: string;
    startTime: string;
    endTime: string;
    type: ShiftType;
  } | null;
}

export interface MonthlyShiftGridResponse {
  fromDate: string;
  toDate: string;
  shifts: WorkShiftItem[];
  employees: Array<{
    id: number;
    employeeNo: string;
    fullName: string;
    staffCategory: StaffCategory;
    departmentId: number | null;
    department?: { id: number; name: string } | null;
    jobTitle?: { id: number; name: string } | null;
  }>;
  days: EmployeeShiftDayItem[];
}

export interface RosterCsvPreviewResult {
  total: number;
  rows: Array<{
    employeeId: number;
    employeeNo: string;
    employeeName: string;
    rosterDate: string;
    dayType: RosterDayType;
    shiftId: number | null;
    shiftName: string | null;
    notes?: string;
  }>;
  errors: Array<{ line: number; message: string }>;
}

export interface BiometricHoursPeriod {
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

export interface BiometricHoursIssue {
  punchId: number;
  punchedAt: string;
  reason: string;
}

export interface BiometricHoursSession {
  workDate: string;
  periods: BiometricHoursPeriod[];
  issues: BiometricHoursIssue[];
  duplicateCount: number;
  totalMinutes: number;
}

export interface BiometricHoursRow {
  employeeId: number;
  employeeNo: string;
  biometricId: string;
  fullName: string;
  department: string;
  section: string;
  staffCategory: StaffCategory;
  totalMinutes: number;
  totalHours: number;
  periodCount: number;
  issueCount: number;
  sessions: BiometricHoursSession[];
}

export interface BiometricHoursReportResponse {
  startDate: string;
  endDate: string;
  debounceMinutes: number;
  generatedAt: string;
  rows: BiometricHoursRow[];
  summary: {
    employeeCount: number;
    totalMinutes: number;
    totalHours: number;
    issueCount: number;
  };
}

export interface BulkImportResult {
  total: number;
  imported: number;
  updated: number;
  errors: string[];
}

export const hrService = {
  // Config & Stats
  getConfig: async (): Promise<HrConfig> =>
    (await apiClient.get<HrConfig>("/hr/employees/config")).data,

  getNextEmployeeNo: async (): Promise<{ nextEmployeeNo: string }> =>
    (await apiClient.get<{ nextEmployeeNo: string }>("/hr/employees/next-number")).data,

  getStats: async (): Promise<EmployeeStats> =>
    (await apiClient.get<EmployeeStats>("/hr/employees/stats")).data,

  // Employees CRUD
  listEmployees: async (params?: {
    search?: string;
    departmentId?: number;
    sectionId?: number;
    staffCategory?: string;
    status?: string;
    hasUserAccount?: string;
    isActive?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: EmployeeListItem[]; total: number; page: number; limit: number }> =>
    (await apiClient.get("/hr/employees", { params })).data,

  getEmployee: async (id: number): Promise<EmployeeDetail> =>
    (await apiClient.get<EmployeeDetail>(`/hr/employees/${id}`)).data,

  createEmployee: async (payload: Record<string, unknown>): Promise<EmployeeDetail> =>
    (await apiClient.post<EmployeeDetail>("/hr/employees", payload)).data,

  updateEmployee: async (
    id: number,
    payload: Record<string, unknown>,
  ): Promise<EmployeeDetail> =>
    (await apiClient.patch<EmployeeDetail>(`/hr/employees/${id}`, payload)).data,

  deleteEmployee: async (id: number) =>
    (await apiClient.delete(`/hr/employees/${id}`)).data,

  bulkImportEmployees: async (
    employees: Record<string, unknown>[],
  ): Promise<BulkImportResult> =>
    (await apiClient.post<BulkImportResult>("/hr/employees/bulk-import", { employees })).data,

  // Account link / unlink
  linkUser: async (
    employeeId: number,
    payload: {
      userId?: number;
      username?: string;
      password?: string;
      roleNames?: string[];
      isDoctor?: boolean;
    },
  ): Promise<EmployeeDetail> =>
    (await apiClient.post<EmployeeDetail>(`/hr/employees/${employeeId}/link-user`, payload)).data,

  unlinkUser: async (employeeId: number): Promise<EmployeeDetail> =>
    (await apiClient.post<EmployeeDetail>(`/hr/employees/${employeeId}/unlink-user`)).data,

  listUsersAndRoles: async () => {
    const [usersRes, rolesRes] = await Promise.all([
      apiClient.get<
        Array<{
          id: number;
          fullName: string;
          username: string;
          isActive: boolean;
        }>
      >("/users"),
      apiClient.get<Array<{ id: number; name: string; description?: string | null }>>(
        "/users/roles",
      ),
    ]);
    return { users: usersRes.data, roles: rolesRes.data };
  },

  // Qualifications / Courses / Actions / Encrypted Docs
  addQualification: async (
    employeeId: number,
    payload: {
      degree: string;
      major?: string;
      institution: string;
      graduationYear?: number;
      grade?: string;
      notes?: string;
    },
  ) =>
    (await apiClient.post(`/hr/employees/${employeeId}/qualifications`, payload)).data,

  removeQualification: async (employeeId: number, qid: number) =>
    (await apiClient.delete(`/hr/employees/${employeeId}/qualifications/${qid}`)).data,

  addTrainingCourse: async (
    employeeId: number,
    payload: {
      courseName: string;
      provider: string;
      completionDate?: string;
      hoursCount?: number;
      certificateNo?: string;
      notes?: string;
    },
  ) =>
    (await apiClient.post(`/hr/employees/${employeeId}/training-courses`, payload)).data,

  removeTrainingCourse: async (employeeId: number, cid: number) =>
    (await apiClient.delete(`/hr/employees/${employeeId}/training-courses/${cid}`)).data,

  createAction: async (
    employeeId: number,
    payload: {
      actionType: EmployeeActionType;
      fromValue?: string;
      toValue?: string;
      effectiveDate: string;
      notes?: string;
    },
  ) => (await apiClient.post(`/hr/employees/${employeeId}/actions`, payload)).data,

  uploadDocument: async (employeeId: number, formData: FormData) =>
    (
      await apiClient.post(`/hr/employees/${employeeId}/documents`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    ).data,

  downloadDocumentBlob: async (employeeId: number, docId: number): Promise<Blob> =>
    (
      await apiClient.get(`/hr/employees/${employeeId}/documents/${docId}/download`, {
        responseType: "blob",
      })
    ).data,

  removeDocument: async (employeeId: number, docId: number) =>
    (await apiClient.delete(`/hr/employees/${employeeId}/documents/${docId}`)).data,

  // Org structure
  listDepartments: async (): Promise<DepartmentLite[]> =>
    (await apiClient.get<DepartmentLite[]>("/departments")).data,

  listSpecialties: async (): Promise<SpecialtyLite[]> =>
    (await apiClient.get<SpecialtyLite[]>("/specialties")).data,

  listSections: async (departmentId?: number): Promise<SectionItem[]> =>
    (
      await apiClient.get<SectionItem[]>("/hr/org/sections", {
        params: departmentId ? { departmentId } : undefined,
      })
    ).data,

  createSection: async (payload: {
    departmentId: number;
    name: string;
    nameEn?: string;
    code?: string;
  }) => (await apiClient.post("/hr/org/sections", payload)).data,

  updateSection: async (
    id: number,
    payload: {
      departmentId?: number;
      name?: string;
      nameEn?: string;
      code?: string;
      isActive?: boolean;
    },
  ) => (await apiClient.patch(`/hr/org/sections/${id}`, payload)).data,

  deleteSection: async (id: number) =>
    (await apiClient.delete(`/hr/org/sections/${id}`)).data,

  listJobTitles: async (): Promise<JobTitleItem[]> =>
    (await apiClient.get<JobTitleItem[]>("/hr/org/job-titles")).data,

  createJobTitle: async (payload: {
    name: string;
    nameEn?: string;
    code?: string;
    level?: number;
  }) => (await apiClient.post("/hr/org/job-titles", payload)).data,

  updateJobTitle: async (
    id: number,
    payload: {
      name?: string;
      nameEn?: string;
      code?: string;
      level?: number;
      isActive?: boolean;
    },
  ) => (await apiClient.patch(`/hr/org/job-titles/${id}`, payload)).data,

  deleteJobTitle: async (id: number) =>
    (await apiClient.delete(`/hr/org/job-titles/${id}`)).data,

  // Shifts & Monthly Rostering
  listShifts: async (): Promise<WorkShiftItem[]> =>
    (await apiClient.get<WorkShiftItem[]>("/hr/shifts")).data,

  createShift: async (payload: Record<string, unknown>): Promise<WorkShiftItem> =>
    (await apiClient.post<WorkShiftItem>("/hr/shifts", payload)).data,

  updateShift: async (
    id: number,
    payload: Record<string, unknown>,
  ): Promise<WorkShiftItem> =>
    (await apiClient.patch<WorkShiftItem>(`/hr/shifts/${id}`, payload)).data,

  deleteShift: async (id: number) =>
    (await apiClient.delete(`/hr/shifts/${id}`)).data,

  listShiftAssignments: async (params?: {
    employeeId?: number;
    departmentId?: number;
  }): Promise<ShiftAssignmentItem[]> =>
    (await apiClient.get<ShiftAssignmentItem[]>("/hr/shifts/assignments", { params })).data,

  assignShift: async (payload: {
    employeeId: number;
    shiftId: number;
    startDate: string;
    endDate?: string;
  }) => (await apiClient.post("/hr/shifts/assignments", payload)).data,

  bulkAssignShift: async (payload: {
    employeeIds?: number[];
    departmentId?: number;
    shiftId: number;
    startDate: string;
    endDate?: string;
  }) => (await apiClient.post("/hr/shifts/assignments/bulk", payload)).data,

  removeShiftAssignment: async (id: number) =>
    (await apiClient.delete(`/hr/shifts/assignments/${id}`)).data,

  getMonthlyShiftGrid: async (params: {
    month?: string;
    fromDate?: string;
    toDate?: string;
    departmentId?: number;
    employeeId?: number;
  }): Promise<MonthlyShiftGridResponse> =>
    (await apiClient.get<MonthlyShiftGridResponse>("/hr/shifts/roster-days", { params }))
      .data,

  upsertShiftDay: async (payload: {
    employeeId: number;
    rosterDate: string;
    dayType: RosterDayType;
    shiftId?: number;
    notes?: string;
  }) => (await apiClient.post("/hr/shifts/roster-days", payload)).data,

  bulkUpsertShiftDays: async (
    days: Array<{
      employeeId: number;
      rosterDate: string;
      dayType: RosterDayType;
      shiftId?: number;
      notes?: string;
    }>,
  ) => (await apiClient.post("/hr/shifts/roster-days/bulk", { days })).data,

  deleteShiftDay: async (id: number) =>
    (await apiClient.delete(`/hr/shifts/roster-days/${id}`)).data,

  previewRosterCsv: async (content: string): Promise<RosterCsvPreviewResult> =>
    (await apiClient.post<RosterCsvPreviewResult>("/hr/shifts/roster-import/preview", { content }))
      .data,

  applyRosterCsv: async (content: string) =>
    (await apiClient.post("/hr/shifts/roster-import/apply", { content })).data,

  // Biometric Hours Report
  getBiometricHoursReport: async (params: {
    startDate: string;
    endDate: string;
    departmentId?: number;
    debounceMinutes?: number;
  }): Promise<BiometricHoursReportResponse> =>
    (
      await apiClient.get<BiometricHoursReportResponse>(
        "/attendance/biometric/hours-report",
        { params },
      )
    ).data,
};
