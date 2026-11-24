export const BLOOD_GROUPS = [
  'O-',
  'O+',
  'A-',
  'A+',
  'B-',
  'B+',
  'AB-',
  'AB+',
] as const;

export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const BLOOD_COMPONENTS = [
  'PRBC',
  'WHOLE_BLOOD',
  'FFP',
  'PLATELETS',
  'CRYOPRECIPITATE',
] as const;

export type BloodComponentType = (typeof BLOOD_COMPONENTS)[number];

const RBC_COMPATIBLE_DONORS: Readonly<
  Record<BloodGroup, readonly BloodGroup[]>
> = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
};

// Plasma compatibility is the inverse of RBC ABO rules (AB is universal plasma donor, O is universal recipient)
const PLASMA_COMPATIBLE_ABO: Readonly<Record<string, readonly string[]>> = {
  O: ['O', 'A', 'B', 'AB'],
  A: ['A', 'AB'],
  B: ['B', 'AB'],
  AB: ['AB'],
};

function parseAboRh(group: BloodGroup): { abo: string; rh: '+' | '-' } {
  const rh = group.endsWith('+') ? '+' : '-';
  const abo = group.slice(0, -1);
  return { abo, rh };
}

export interface BloodCompatibilityCheck {
  compatible: boolean;
  reason: string;
}

/**
 * Evaluates clinical ABO/Rh compatibility per AABB standards for a given component.
 * - PRBC: standard RBC compatibility (Rh- patient MUST NOT receive Rh+ RBCs).
 * - WHOLE_BLOOD: ABO-identical + Rh-compatible (Rh- patient MUST NOT receive Rh+).
 * - FFP / CRYOPRECIPITATE: plasma ABO compatibility (AB is universal donor).
 * - PLATELETS: ABO-compatible plasma or RBC rules; Rh- patient flagged if Rh+ unit.
 */
export function evaluateBloodCompatibility(
  patientBloodGroup: BloodGroup,
  donorBloodGroup: BloodGroup,
  componentType: BloodComponentType,
): BloodCompatibilityCheck {
  const patient = parseAboRh(patientBloodGroup);
  const donor = parseAboRh(donorBloodGroup);

  if (componentType === 'PRBC') {
    const allowed = RBC_COMPATIBLE_DONORS[patientBloodGroup];
    if (allowed.includes(donorBloodGroup)) {
      return {
        compatible: true,
        reason: `متوافق لنقل كريات الدم الحمراء (${donorBloodGroup} ← ${patientBloodGroup})`,
      };
    }
    return {
      compatible: false,
      reason: `عدم توافق فصيلة الدم (PRBC): لا يجوز نقل وحدة ${donorBloodGroup} إلى مريض فصيلته ${patientBloodGroup}`,
    };
  }

  if (componentType === 'WHOLE_BLOOD') {
    if (patient.abo !== donor.abo) {
      return {
        compatible: false,
        reason: `عدم توافق دم كامل (WHOLE_BLOOD): يشترط تطابق فصيلة ABO (${donorBloodGroup} ≠ ${patientBloodGroup})`,
      };
    }
    if (patient.rh === '-' && donor.rh === '+') {
      return {
        compatible: false,
        reason: `عدم توافق عامل ريسوس (Rh): لا يجوز نقل دم كامل موجب (${donorBloodGroup}) لمريض سالب (${patientBloodGroup})`,
      };
    }
    return {
      compatible: true,
      reason: `متوافق لنقل الدم الكامل (${donorBloodGroup} ← ${patientBloodGroup})`,
    };
  }

  if (componentType === 'FFP' || componentType === 'CRYOPRECIPITATE') {
    const allowedAbo = PLASMA_COMPATIBLE_ABO[patient.abo] || [];
    if (allowedAbo.includes(donor.abo)) {
      return {
        compatible: true,
        reason: `متوافق لنقل البلازما/الراسب القري (${donorBloodGroup} ← ${patientBloodGroup})`,
      };
    }
    return {
      compatible: false,
      reason: `عدم توافق البلازما (${componentType}): وحدة ${donorBloodGroup} غير متوافقة مع مريض ${patientBloodGroup}`,
    };
  }

  // PLATELETS
  const allowedPlasmaAbo = PLASMA_COMPATIBLE_ABO[patient.abo] || [];
  if (!allowedPlasmaAbo.includes(donor.abo)) {
    return {
      compatible: false,
      reason: `عدم توافق الصفائح الدموية (ABO): وحدة ${donorBloodGroup} غير متوافقة مع مريض ${patientBloodGroup}`,
    };
  }
  if (patient.rh === '-' && donor.rh === '+') {
    return {
      compatible: false,
      reason: `تحذير عدم توافق Rh للصفائح: وحدة ${donorBloodGroup} غير متوافقة افتراضيًا مع مريض سالب (${patientBloodGroup})`,
    };
  }
  return {
    compatible: true,
    reason: `متوافق لنقل الصفائح الدموية (${donorBloodGroup} ← ${patientBloodGroup})`,
  };
}
