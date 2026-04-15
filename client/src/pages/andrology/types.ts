export type SemenAnalysis = {
  id: number;
  patientId: number;
  sampleDate: string;
  abstinenceDays?: number;
  collectionMethod?: string;
  volumeMl?: number;
  ph?: number;
  appearance?: string;
  color?: string;
  viscosity?: string;
  liquefaction?: string;
  liquefactionMinutes?: number;
  countMilPerMl?: number;
  totalCountMil?: number;
  progressivePR?: number;
  nonProgressiveNP?: number;
  immotileIM?: number;
  totalMotility?: number;
  normalForms?: number;
  headDefects?: number;
  midpieceDefects?: number;
  tailDefects?: number;
  vitality?: number;
  wbcCount?: number;
  roundCells?: number;
  agglutination?: string;
  marTestIgG?: string;
  marTestIgA?: string;
  dnaFragmentation?: number;
  dfiMethod?: string;
  autoClassification?: string;
  conclusion?: string;
  doctorNotes?: string;
};

export type AndrologyVisit = {
  id: number;
  patientId: number;
  chiefComplaint?: string;
  infertilityMonths?: number;
  previousPregnancies?: number;
  coitalFrequency?: string;
  erectileDisfunc: boolean;
  ejaculatoryDisfunc: boolean;
  retrogradeEjac: boolean;
  libidoLevel?: string;
  prematureEjac: boolean;
  smokingHabit?: string;
  alcoholUse?: string;
  occupationalExposure?: string;
  bmi?: number;
  cryptorchidismHistory: boolean;
  orchitisHistory: boolean;
  inguinalSurgery: boolean;
  chemotherapy: boolean;
  radiationExposure: boolean;
  currentMedications?: string;
  surgicalHistory?: string;
  medicalConditions?: string;
  varicoceleGrade?: string;
  varicoceleRight?: string;
  varicoceleLeft?: string;
  testicularVolR?: number;
  testicularVolL?: number;
  testisConsistency?: string;
  epididymalFindings?: string;
  vasPresence?: string;
  penileExam?: string;
  gynecomastia: boolean;
  bodyHairPattern?: string;
  fshLevel?: number;
  lhLevel?: number;
  testosterone?: number;
  prolactin?: number;
  diagnosis?: string;
  treatmentPlan?: string;
  followUpDate?: string;
  referralNotes?: string;
  createdAt: string;
};

export type HormoneTest = {
  id: number;
  patientId: number;
  testDate: string;
  fsh?: number;
  lh?: number;
  totalTestosterone?: number;
  freeTestosterone?: number;
  estradiol?: number;
  prolactin?: number;
  tsh?: number;
  inhibinB?: number;
  shbg?: number;
  amhMale?: number;
  notes?: string;
};

export type AndrologySurgery = {
  id: number;
  patientId: number;
  surgeryDate: string;
  procedure: string;
  technique?: string;
  surgeonName?: string;
  findings?: string;
  outcome?: string;
  complications?: string;
  spermRetrieved: boolean;
  notes?: string;
  createdAt: string;
};

export type AndrologyMedication = {
  id: number;
  patientId: number;
  medication: string;
  category?: string;
  dose?: string;
  frequency?: string;
  startDate: string;
  endDate?: string;
  response?: string;
  sideEffects?: string;
  notes?: string;
  createdAt: string;
};

export type AndrologyInvestigation = {
  id: number;
  patientId: number;
  investigationDate: string;
  type: string;
  facilityName?: string;
  findings: string;
  interpretation?: string;
  normalRange?: string;
  attachmentUrl?: string;
  notes?: string;
  createdAt: string;
};

export type CryoTank = {
  id: number;
  hospitalId: number;
  code: string;
  name: string;
  location?: string;
  canisters: CryoCanister[];
};

export type CryoCanister = {
  id: number;
  tankId: number;
  code: string;
  _count?: { items: number };
  items?: CryoItem[];
};

export type CryoItem = {
  id: number;
  canisterId: number;
  patientId: number;
  itemType: 'SPERM' | 'OOCYTES' | 'EMBRYO_D3' | 'EMBRYO_D5' | 'TESTICULAR_TISSUE';
  freezeDate: string;
  thawDate?: string;
  status: 'FROZEN' | 'THAWED' | 'DISCARDED' | 'TRANSFERRED_OUT';
  caneCode?: string;
  gobletColor?: string;
  visotubeColor?: string;
  strawCount: number;
  description?: string;
  ivfCycleId?: number;
  patient?: { id: number; fullName: string; mrn: string };
  canister?: { tank: { code: string; name: string } };
};

export type PatientInfo = { id: number; fullName: string; mrn: string; phone?: string; };
