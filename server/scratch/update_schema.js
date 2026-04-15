const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
let content = fs.readFileSync(schemaPath, 'utf8');

// 1. Hospital modifications
content = content.replace(
  /fertilityCases\s+FertilityCase\[\]/,
  'fertilityCases            FertilityCase[]\n  cryoTanks                 CryoTank[]'
);

// 2. Patient modifications
content = content.replace(
  /\/\/ Fertility \/ IVF\s+fertilityCases\s+FertilityCase\[\]/,
  `// Fertility / IVF
  femaleFertilityCases FertilityCase[] @relation("FemaleFertilityCases")
  maleFertilityCases   FertilityCase[] @relation("MaleFertilityCases")
  cryoItems            CryoItem[]
  semenAnalyses        SemenAnalysis[]
  andrologyVisits      AndrologyVisit[]`
);

// 3. Encounter modifications
content = content.replace(
  /deliveryAdmission\s+DeliveryAdmission\?/,
  'deliveryAdmission         DeliveryAdmission?\n  andrologyVisit            AndrologyVisit?'
);

// 4. Infertility / IVF Block Replacement
const ivfStartIndex = content.indexOf('// ==========================================');
const searchString = '// IVF / Fertility';
const exactStartIndex = content.indexOf(searchString);

if (exactStartIndex !== -1) {
    // Find the previous // ==========================================
    const actualStart = content.lastIndexOf('// ==========================================', exactStartIndex);
    
    // Find where the next section begins - GoodsReceipt in this case
    const nextSectionStart = content.indexOf('model GoodsReceipt {');
    
    if (actualStart !== -1 && nextSectionStart !== -1) {
        const replacementBlock = `// ==========================================
// 🧬 Andrology & Male Infertility (أمراض الذكورة والعقم للرجال)
// ==========================================

model AndrologyVisit {
  id              Int       @id @default(autoincrement())
  patientId       Int       
  encounterId     Int?      @unique
  fertilityCaseId Int?      
  
  erectileDisfunc Boolean   @default(false)
  smokingHabit    String?
  varicoceleGrade String?   
  testicularVol   String?   
  
  fshLevel        Decimal?  @db.Decimal(5, 2)
  lhLevel         Decimal?  @db.Decimal(5, 2)
  testosterone    Decimal?  @db.Decimal(6, 2)
  prolactin       Decimal?  @db.Decimal(5, 2)
  
  diagnosis       String?
  treatmentPlan   String?   
  createdAt       DateTime  @default(now())

  patient         Patient   @relation(fields: [patientId], references: [id])
  encounter       Encounter? @relation(fields: [encounterId], references: [id])
  fertilityCase   FertilityCase? @relation(fields: [fertilityCaseId], references: [id])
}

model SemenAnalysis {
  id              Int       @id @default(autoincrement())
  patientId       Int
  fertilityCaseId Int?
  sampleDate      DateTime  @default(now())
  abstinenceDays  Int?
  
  volumeMl        Decimal?  @db.Decimal(4, 1)
  ph              Decimal?  @db.Decimal(3, 1)
  viscosity       String?   
  liquefaction    String?   
  
  countMilPerMl   Decimal?  @db.Decimal(8, 2) 
  totalCountMil   Decimal?  @db.Decimal(8, 2) 
  
  progressivePR   Decimal?  @db.Decimal(5, 2) 
  nonProgressiveNP Decimal? @db.Decimal(5, 2) 
  immotileIM      Decimal?  @db.Decimal(5, 2) 
  
  normalForms     Decimal?  @db.Decimal(5, 2) 
  vitality        Decimal?  @db.Decimal(5, 2) 
  wbcCount        Decimal?  @db.Decimal(5, 2) 
  agglutination   String?   
  
  conclusion      String?   
  doctorNotes     String?
  
  patient         Patient   @relation(fields: [patientId], references: [id])
  fertilityCase   FertilityCase? @relation(fields: [fertilityCaseId], references: [id])
}

// ==========================================
// ❄️ Cryopreservation Bank (بنك تجميد الأجنة والحيوانات المنوية)
// ==========================================

model CryoTank {
  id          Int      @id @default(autoincrement())
  hospitalId  Int
  code        String   @unique 
  name        String
  location    String?
  canisters   CryoCanister[]
  hospital    Hospital @relation(fields: [hospitalId], references: [id])
}

model CryoCanister {
  id          Int      @id @default(autoincrement())
  tankId      Int
  code        String   
  tank        CryoTank @relation(fields: [tankId], references: [id])
  items       CryoItem[]
}

model CryoItem {
  id              Int       @id @default(autoincrement())
  canisterId      Int
  patientId       Int       
  itemType        CryoItemType
  freezeDate      DateTime  @default(now())
  thawDate        DateTime?
  status          CryoStatus @default(FROZEN)
  
  caneCode        String?   
  gobletColor     String?   
  visotubeColor   String?   
  
  strawCount      Int       @default(1)
  description     String?   
  
  ivfCycleId      Int?      
  
  canister        CryoCanister @relation(fields: [canisterId], references: [id])
  patient         Patient      @relation(fields: [patientId], references: [id])
  ivfCycle        IVFCycle?    @relation(fields: [ivfCycleId], references: [id])
}

enum CryoItemType {
  SPERM
  OOCYTES      
  EMBRYO_D3
  EMBRYO_D5
  TESTICULAR_TISSUE 
}

enum CryoStatus {
  FROZEN
  THAWED
  DISCARDED
  TRANSFERRED_OUT 
}

// ==========================================
// 🧬 IVF & Infertility (علاج العقم والحقن المجهري)
// ==========================================

model FertilityCase {
  id                 Int                 @id @default(autoincrement())
  hospitalId         Int
  femalePatientId    Int                 
  malePatientId      Int?                
  
  infertilityType    InfertilityType     @default(UNEXPLAINED)
  diagnosis          String? 
  durationYears      Int? 
  previousTreatments String?
  
  amhLevel           Decimal?            @db.Decimal(5, 2)
  fshLevel           Decimal?            @db.Decimal(5, 2)
  lhLevel            Decimal?            @db.Decimal(5, 2)
  
  status             FertilityCaseStatus @default(ACTIVE)
  notes              String?
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  hospital       Hospital   @relation(fields: [hospitalId], references: [id])
  femalePatient  Patient    @relation("FemaleFertilityCases", fields: [femalePatientId], references: [id])
  malePatient    Patient?   @relation("MaleFertilityCases", fields: [malePatientId], references: [id])
  cycles         IVFCycle[]
  semenAnalyses  SemenAnalysis[]
  andrologyVisits AndrologyVisit[]
}

model IVFCycle {
  id                   Int             @id @default(autoincrement())
  fertilityCaseId      Int
  cycleNumber          Int             @default(1)
  cycleType            CycleType       @default(ICSI)
  protocol             String? 
  startDate            DateTime?
  
  eggRetrievalDate     DateTime?
  eggsRetrieved        Int? 
  eggsMatureMII        Int? 
  eggsMI               Int? 
  eggsGV               Int? 
  
  spermSource          SpermSource     @default(EJACULATE)
  fertilizationMethod  FertilizationMethod @default(ICSI)
  eggsInjected         Int?
  eggsFertilized2PN    Int? 
  
  embryosDay3          Int?
  embryosDay5          Int?
  
  transferDate         DateTime?
  embryosTransferred   Int?
  endometrialThickness Decimal?        @db.Decimal(4, 1) 
  
  embryosFrozen        Int?
  
  betaHCGDate          DateTime?
  betaHCGResult        Decimal?        @db.Decimal(8, 2)
  pregnancyResult      PregnancyResult @default(PENDING)
  
  cancelReason         String?
  notes                String?
  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt

  fertilityCase FertilityCase         @relation(fields: [fertilityCaseId], references: [id])
  embryos       EmbryoRecord[]
  medications   FertilityMedication[]
  cryoItems     CryoItem[]
}

enum SpermSource {
  EJACULATE      
  TESE           
  PESA           
  FROZEN_SPERM   
}

enum FertilizationMethod {
  CONVENTIONAL_IVF 
  ICSI             
  IMSI             
  PICSI            
}

model EmbryoRecord {
  id            Int          @id @default(autoincrement())
  ivfCycleId    Int
  embryoNumber  Int 
  day           Int 
  grade         String? 
  fragmentation String? 
  status        EmbryoStatus @default(DEVELOPING)
  notes         String?
  createdAt     DateTime     @default(now())

  ivfCycle IVFCycle @relation(fields: [ivfCycleId], references: [id])
}

model FertilityMedication {
  id             Int       @id @default(autoincrement())
  ivfCycleId     Int
  medicationName String 
  dose           String 
  route          String? 
  startDate      DateTime
  endDate        DateTime?
  durationDays   Int?
  notes          String?
  createdAt      DateTime  @default(now())

  ivfCycle IVFCycle @relation(fields: [ivfCycleId], references: [id])
}

enum InfertilityType {
  MALE_FACTOR
  FEMALE_FACTOR
  COMBINED
  UNEXPLAINED
}

enum CycleType {
  ICSI
  IVF
  IUI
  FET 
  EGG_FREEZING
}

enum FertilityCaseStatus {
  ACTIVE
  SUCCESSFUL
  DISCONTINUED
  REFERRED
}

enum PregnancyResult {
  PENDING
  POSITIVE
  NEGATIVE
  BIOCHEMICAL
  ECTOPIC
  MISCARRIAGE
}

enum EmbryoStatus {
  DEVELOPING
  TRANSFERRED
  FROZEN
  ARRESTED   
  DONATED
}

`;

        content = content.substring(0, actualStart) + replacementBlock + content.substring(nextSectionStart);
        fs.writeFileSync(schemaPath, content);
        console.log("Schema upgraded successfully!");
    } else {
        console.log("Could not find the start or end bounds.");
    }
} else {
    console.log("Could not find the IVF section.");
}
