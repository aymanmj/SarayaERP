import {
  OrderStatus,
  OrderType,
  PrismaClient,
  RadiologyStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';

export const DEMO_DICOM_UIDS = {
  cxrStudy: '2.25.20261127000101',
  ctStudy: '2.25.20261127000102',
  mriStudy: '2.25.20261127000103',
} as const;

const SOP_CLASSES = {
  DX: '1.2.840.10008.5.1.4.1.1.1.1',
  CT: '1.2.840.10008.5.1.4.1.1.2',
  MR: '1.2.840.10008.5.1.4.1.1.4',
} as const;

const LONG_VRS = new Set(['OB', 'OD', 'OF', 'OL', 'OW', 'SQ', 'UC', 'UR', 'UT', 'UN']);

interface DicomTag {
  group: number;
  element: number;
  vr: string;
  value: Buffer | string | number;
}

function encodeTagValue(tag: DicomTag): Buffer {
  if (Buffer.isBuffer(tag.value)) {
    if (tag.value.length % 2 === 0) return tag.value;
    const padByte = tag.vr === 'UI' || tag.vr === 'OB' ? 0x00 : 0x20;
    return Buffer.concat([tag.value, Buffer.from([padByte])]);
  }
  if (tag.vr === 'US') {
    const buf = Buffer.allocUnsafe(2);
    buf.writeUInt16LE(Number(tag.value), 0);
    return buf;
  }
  if (tag.vr === 'UL') {
    const buf = Buffer.allocUnsafe(4);
    buf.writeUInt32LE(Number(tag.value), 0);
    return buf;
  }
  let raw = Buffer.from(String(tag.value), 'utf8');
  if (raw.length % 2 !== 0) {
    const padByte = tag.vr === 'UI' ? 0x00 : 0x20;
    raw = Buffer.concat([raw, Buffer.from([padByte])]);
  }
  return raw;
}

function serializeElement(tag: DicomTag): Buffer {
  const val = encodeTagValue(tag);
  const vrBuf = Buffer.from(tag.vr, 'ascii');
  if (LONG_VRS.has(tag.vr)) {
    const hdr = Buffer.allocUnsafe(12);
    hdr.writeUInt16LE(tag.group, 0);
    hdr.writeUInt16LE(tag.element, 2);
    vrBuf.copy(hdr, 4);
    hdr.writeUInt16LE(0, 6);
    hdr.writeUInt32LE(val.length, 8);
    return Buffer.concat([hdr, val]);
  }
  const hdr = Buffer.allocUnsafe(8);
  hdr.writeUInt16LE(tag.group, 0);
  hdr.writeUInt16LE(tag.element, 2);
  vrBuf.copy(hdr, 4);
  hdr.writeUInt16LE(val.length, 6);
  return Buffer.concat([hdr, val]);
}

interface BuildDicomParams {
  sopClassUid: string;
  sopInstanceUid: string;
  studyInstanceUid: string;
  seriesInstanceUid: string;
  frameOfReferenceUid: string;
  accessionNumber: string;
  modality: 'DX' | 'CT' | 'MR';
  studyDescription: string;
  seriesDescription: string;
  patientName: string;
  patientId: string;
  patientBirthDate: string;
  patientSex: 'M' | 'F';
  studyDate: string;
  studyTime: string;
  instanceNumber: number;
  sliceThickness?: string;
  imagePositionPatient?: string;
  sliceLocation?: string;
  pixelSpacing: string;
  rows: number;
  cols: number;
  bitsStored: number;
  windowCenter: string;
  windowWidth: string;
  rescaleIntercept?: string;
  pixels: Uint16Array;
}

function encodeDicomPart10(params: BuildDicomParams): Buffer {
  const preamble = Buffer.alloc(128, 0);
  const magic = Buffer.from('DICM', 'ascii');

  const metaTags: DicomTag[] = [
    { group: 0x0002, element: 0x0001, vr: 'OB', value: Buffer.from([0x00, 0x01]) },
    { group: 0x0002, element: 0x0002, vr: 'UI', value: params.sopClassUid },
    { group: 0x0002, element: 0x0003, vr: 'UI', value: params.sopInstanceUid },
    { group: 0x0002, element: 0x0010, vr: 'UI', value: '1.2.840.10008.1.2.1' },
    { group: 0x0002, element: 0x0012, vr: 'UI', value: '1.2.826.0.1.3680043.8.498.1' },
    { group: 0x0002, element: 0x0013, vr: 'SH', value: 'SARAYA_PACS_1' },
  ];
  const metaBody = Buffer.concat(metaTags.map(serializeElement));
  const metaGroupLen = serializeElement({
    group: 0x0002,
    element: 0x0000,
    vr: 'UL',
    value: metaBody.length,
  });

  const pixelBuf = Buffer.allocUnsafe(params.pixels.length * 2);
  for (let i = 0; i < params.pixels.length; i++) {
    pixelBuf.writeUInt16LE(params.pixels[i], i * 2);
  }

  const datasetTags: DicomTag[] = [
    { group: 0x0008, element: 0x0005, vr: 'CS', value: 'ISO_IR 192' },
    { group: 0x0008, element: 0x0008, vr: 'CS', value: 'ORIGINAL\\PRIMARY' },
    { group: 0x0008, element: 0x0016, vr: 'UI', value: params.sopClassUid },
    { group: 0x0008, element: 0x0018, vr: 'UI', value: params.sopInstanceUid },
    { group: 0x0008, element: 0x0020, vr: 'DA', value: params.studyDate },
    { group: 0x0008, element: 0x0030, vr: 'TM', value: params.studyTime },
    { group: 0x0008, element: 0x0050, vr: 'SH', value: params.accessionNumber },
    { group: 0x0008, element: 0x0060, vr: 'CS', value: params.modality },
    { group: 0x0008, element: 0x1030, vr: 'LO', value: params.studyDescription },
    { group: 0x0008, element: 0x103e, vr: 'LO', value: params.seriesDescription },
    { group: 0x0010, element: 0x0010, vr: 'PN', value: params.patientName },
    { group: 0x0010, element: 0x0020, vr: 'LO', value: params.patientId },
    { group: 0x0010, element: 0x0030, vr: 'DA', value: params.patientBirthDate },
    { group: 0x0010, element: 0x0040, vr: 'CS', value: params.patientSex },
  ];

  if (params.sliceThickness) {
    datasetTags.push({
      group: 0x0018,
      element: 0x0050,
      vr: 'DS',
      value: params.sliceThickness,
    });
  }

  datasetTags.push(
    { group: 0x0020, element: 0x000d, vr: 'UI', value: params.studyInstanceUid },
    { group: 0x0020, element: 0x000e, vr: 'UI', value: params.seriesInstanceUid },
    { group: 0x0020, element: 0x0010, vr: 'SH', value: params.accessionNumber },
    { group: 0x0020, element: 0x0011, vr: 'IS', value: '1' },
    { group: 0x0020, element: 0x0013, vr: 'IS', value: String(params.instanceNumber) },
  );

  if (params.imagePositionPatient) {
    datasetTags.push({
      group: 0x0020,
      element: 0x0032,
      vr: 'DS',
      value: params.imagePositionPatient,
    });
    datasetTags.push({
      group: 0x0020,
      element: 0x0037,
      vr: 'DS',
      value: '1\\0\\0\\0\\1\\0',
    });
  }

  datasetTags.push({
    group: 0x0020,
    element: 0x0052,
    vr: 'UI',
    value: params.frameOfReferenceUid,
  });

  if (params.sliceLocation !== undefined) {
    datasetTags.push({
      group: 0x0020,
      element: 0x1041,
      vr: 'DS',
      value: params.sliceLocation,
    });
  }

  datasetTags.push(
    { group: 0x0028, element: 0x0002, vr: 'US', value: 1 },
    { group: 0x0028, element: 0x0004, vr: 'CS', value: 'MONOCHROME2' },
    { group: 0x0028, element: 0x0010, vr: 'US', value: params.rows },
    { group: 0x0028, element: 0x0011, vr: 'US', value: params.cols },
    { group: 0x0028, element: 0x0030, vr: 'DS', value: params.pixelSpacing },
    { group: 0x0028, element: 0x0100, vr: 'US', value: 16 },
    { group: 0x0028, element: 0x0101, vr: 'US', value: params.bitsStored },
    { group: 0x0028, element: 0x0102, vr: 'US', value: params.bitsStored - 1 },
    { group: 0x0028, element: 0x0103, vr: 'US', value: 0 },
    { group: 0x0028, element: 0x1050, vr: 'DS', value: params.windowCenter },
    { group: 0x0028, element: 0x1051, vr: 'DS', value: params.windowWidth },
  );

  if (params.rescaleIntercept !== undefined) {
    datasetTags.push(
      { group: 0x0028, element: 0x1052, vr: 'DS', value: params.rescaleIntercept },
      { group: 0x0028, element: 0x1053, vr: 'DS', value: '1' },
    );
  }

  datasetTags.push({
    group: 0x7fe0,
    element: 0x0010,
    vr: 'OW',
    value: pixelBuf,
  });

  datasetTags.sort((a, b) => (a.group !== b.group ? a.group - b.group : a.element - b.element));

  const body = Buffer.concat(datasetTags.map(serializeElement));
  return Buffer.concat([preamble, magic, metaGroupLen, metaBody, body]);
}

function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : Math.round(val);
}

/** Smooth 2D ellipse test in normalized [-1, 1] coordinates */
function ellipseDist(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return Math.sqrt(dx * dx + dy * dy);
}

export function buildChestXrayStudy(patientId = 'MRN-2026-1004', patientName = 'Khaled^Al-Gharyani'): Buffer[] {
  const size = 512;
  const pixels = new Uint16Array(size * size);

  for (let y = 0; y < size; y++) {
    const ny = (y / (size - 1)) * 2 - 1;
    for (let x = 0; x < size; x++) {
      const nx = (x / (size - 1)) * 2 - 1;
      let val = 260; // Air outside torso

      // Torso soft-tissue attenuation silhouette
      const torsoD = ellipseDist(nx, ny * 0.85, 0, 0.08, 0.82, 0.92);
      if (torsoD <= 1.0) {
        val = 1850 - 300 * torsoD * torsoD;
      }

      // Radiolucent lung fields (right and left hemithorax)
      const rightLung = ellipseDist(nx - 0.02 * ny, ny, -0.34, -0.08, 0.28, 0.56);
      const leftLung = ellipseDist(nx + 0.02 * ny, ny, 0.34, -0.08, 0.27, 0.53);
      if (rightLung < 1.0 && ny < 0.36 + 0.08 * Math.cos(nx * 3)) {
        val -= 1050 * (1 - Math.pow(rightLung, 2.4));
      }
      if (leftLung < 1.0 && ny < 0.39 + 0.08 * Math.cos(nx * 3)) {
        val -= 1020 * (1 - Math.pow(leftLung, 2.4));
      }

      // Mediastinum & cardiac apex shifted to patient's left (+nx)
      const mediastinum = ellipseDist(nx, ny, 0.03, -0.05, 0.14, 0.65);
      if (mediastinum < 1.0) {
        val = Math.max(val, 2150 - 400 * mediastinum);
      }
      const heart = ellipseDist(nx, ny, 0.14, 0.18, 0.21, 0.22);
      if (heart < 1.0) {
        val = Math.max(val, 2450 - 450 * heart * heart);
      }

      // Thoracic vertebral column & spinous processes
      if (Math.abs(nx) < 0.095 && ny > -0.78 && ny < 0.72) {
        const discWave = 0.5 + 0.5 * Math.cos(ny * 36);
        val = Math.max(val, 2750 + 260 * discWave - Math.abs(nx) * 3500);
      }

      // Posterior/anterior rib arcs
      if (torsoD < 0.88 && Math.abs(nx) > 0.09 && ny > -0.62 && ny < 0.38) {
        const arcY = ny - 0.14 * nx * nx;
        const ribBand = Math.cos((arcY + 0.65) * 32);
        if (ribBand > 0.68) {
          val += 380 * ((ribBand - 0.68) / 0.32);
        }
      }

      // Clavicles
      const clavR = Math.abs(ny + 0.52 - 0.18 * (nx + 0.35));
      if (nx < -0.07 && nx > -0.62 && clavR < 0.035) {
        val += 650 * (1 - clavR / 0.035);
      }
      const clavL = Math.abs(ny + 0.52 + 0.18 * (nx - 0.35));
      if (nx > 0.07 && nx < 0.62 && clavL < 0.035) {
        val += 650 * (1 - clavL / 0.035);
      }

      // Subtle bronchovascular lung markings
      if (rightLung < 0.85 || leftLung < 0.85) {
        const hilumDist = Math.hypot(Math.abs(nx) - 0.18, ny + 0.04);
        const vessel = Math.sin(nx * 35 + ny * 20) * Math.cos(ny * 28 - nx * 15);
        val += 95 * Math.exp(-hilumDist * 4) + 30 * vessel;
      }

      // Subdiaphragmatic hepatic/abdominal density
      if (ny >= 0.36 + 0.07 * Math.cos(nx * 3) && torsoD <= 0.95) {
        val = Math.max(val, 2280);
      }

      pixels[y * size + x] = clamp(val, 0, 4095);
    }
  }

  return [
    encodeDicomPart10({
      sopClassUid: SOP_CLASSES.DX,
      sopInstanceUid: `${DEMO_DICOM_UIDS.cxrStudy}.1.1`,
      studyInstanceUid: DEMO_DICOM_UIDS.cxrStudy,
      seriesInstanceUid: `${DEMO_DICOM_UIDS.cxrStudy}.1`,
      frameOfReferenceUid: `${DEMO_DICOM_UIDS.cxrStudy}.99`,
      accessionNumber: 'ACC-DEMO-2026-001',
      modality: 'DX',
      studyDescription: 'Portable AP Chest X-Ray (Post-PCI)',
      seriesDescription: 'AP Chest Radiograph',
      patientName,
      patientId,
      patientBirthDate: '19641105',
      patientSex: 'M',
      studyDate: '20261127',
      studyTime: '073000',
      instanceNumber: 1,
      pixelSpacing: '0.75\\0.75',
      rows: size,
      cols: size,
      bitsStored: 12,
      windowCenter: '1650',
      windowWidth: '2400',
      pixels,
    }),
  ];
}

export function buildAbdomenCtStudy(patientId = 'MRN-2026-1001', patientName = 'Ahmed^Al-Warfalli'): Buffer[] {
  const size = 256;
  const sliceCount = 24;
  const buffers: Buffer[] = [];

  for (let s = 0; s < sliceCount; s++) {
    const zNorm = s / (sliceCount - 1); // 0 = upper diaphragm, 1 = lower abdomen/pelvic rim
    const pixels = new Uint16Array(size * size);

    for (let y = 0; y < size; y++) {
      const ny = (y / (size - 1)) * 2 - 1;
      for (let x = 0; x < size; x++) {
        const nx = (x / (size - 1)) * 2 - 1;
        let hu = -1000; // Air background

        const bodyD = ellipseDist(nx, ny, 0, 0.04, 0.84, 0.64);
        if (bodyD <= 1.0) {
          hu = bodyD > 0.92 ? -95 : 42; // Subcutaneous fat rim -> abdominal cavity
          // Visceral intra-abdominal fat attenuation base
          if (bodyD < 0.86) hu = -75;

          // Liver (patient's right -> screen left, prominent upper-mid slices)
          const liverScale = Math.max(0.25, 1.15 - zNorm * 0.9);
          if (ellipseDist(nx, ny, -0.34, -0.06, 0.34 * liverScale, 0.32 * liverScale) < 1.0) {
            hu = 62;
          }

          // Spleen (patient's left -> screen right, upper-mid slices)
          if (zNorm < 0.65 && ellipseDist(nx, ny, 0.48, 0.06, 0.16, 0.2) < 1.0) {
            hu = 52;
          }

          // Stomach / bowel lumen with gas-fluid level
          const stomachD = ellipseDist(nx, ny, 0.18, -0.18, 0.18, 0.13);
          if (stomachD < 1.0) {
            hu = ny < -0.2 ? -650 : 12;
          }

          // Kidneys (mid slices zNorm 0.3..0.82)
          if (zNorm >= 0.25 && zNorm <= 0.82) {
            const kR = ellipseDist(nx, ny, -0.26, 0.19, 0.12, 0.16);
            const kL = ellipseDist(nx, ny, 0.26, 0.19, 0.12, 0.16);
            if (kR < 1.0 || kL < 1.0) {
              const kd = Math.min(kR, kL);
              hu = kd < 0.45 ? 110 : 145; // Contrast-enhanced renal cortex
            }
          }

          // Contrast-enhanced Descending Aorta & IVC anterior to spine
          const aortaD = ellipseDist(nx, ny, 0.06, 0.16, 0.055, 0.055);
          if (aortaD < 1.0) hu = 240;
          const ivcD = ellipseDist(nx, ny, -0.07, 0.14, 0.05, 0.045);
          if (ivcD < 1.0) hu = 115;

          // Lumbar vertebral body + spinal canal + spinous process
          const vertD = ellipseDist(nx, ny, 0, 0.31, 0.11, 0.09);
          if (vertD < 1.0) hu = 680;
          const canalD = ellipseDist(nx, ny, 0, 0.42, 0.05, 0.045);
          if (canalD < 1.0) hu = 28;
          if (Math.abs(nx) < 0.03 && ny > 0.45 && ny < 0.56) hu = 540;

          // Lower rib cage cortical bone dots on upper slices
          if (zNorm < 0.55 && bodyD > 0.84 && bodyD < 0.91) {
            const ribAngle = Math.atan2(ny, nx);
            if (Math.cos(ribAngle * 10) > 0.86) hu = 720;
          }
        }

        pixels[y * size + x] = clamp(hu + 1024, 0, 65535);
      }
    }

    const zMm = (-s * 5).toFixed(2);
    buffers.push(
      encodeDicomPart10({
        sopClassUid: SOP_CLASSES.CT,
        sopInstanceUid: `${DEMO_DICOM_UIDS.ctStudy}.1.${s + 1}`,
        studyInstanceUid: DEMO_DICOM_UIDS.ctStudy,
        seriesInstanceUid: `${DEMO_DICOM_UIDS.ctStudy}.1`,
        frameOfReferenceUid: `${DEMO_DICOM_UIDS.ctStudy}.99`,
        accessionNumber: 'ACC-DEMO-2026-002',
        modality: 'CT',
        studyDescription: 'CT Abdomen & Pelvis (Contrast)',
        seriesDescription: 'Axial Portal Venous 5mm',
        patientName,
        patientId,
        patientBirthDate: '19820412',
        patientSex: 'M',
        studyDate: '20261127',
        studyTime: '140000',
        instanceNumber: s + 1,
        sliceThickness: '5.0',
        imagePositionPatient: `-180\\-180\\${zMm}`,
        sliceLocation: zMm,
        pixelSpacing: '1.40\\1.40',
        rows: size,
        cols: size,
        bitsStored: 16,
        windowCenter: '40',
        windowWidth: '400',
        rescaleIntercept: '-1024',
        pixels,
      }),
    );
  }

  return buffers;
}

export function buildBrainMriStudy(patientId = 'MRN-2026-1003', patientName = 'Mohamed^Al-Fitouri'): Buffer[] {
  const size = 256;
  const sliceCount = 16;
  const buffers: Buffer[] = [];

  for (let s = 0; s < sliceCount; s++) {
    const zNorm = s / (sliceCount - 1);
    const skullRadiusScale = Math.sin((0.18 + 0.68 * zNorm) * Math.PI);
    const pixels = new Uint16Array(size * size);

    for (let y = 0; y < size; y++) {
      const ny = (y / (size - 1)) * 2 - 1;
      for (let x = 0; x < size; x++) {
        const nx = (x / (size - 1)) * 2 - 1;
        let sig = 25; // Air

        const headD = ellipseDist(nx, ny, 0, 0, 0.64 * skullRadiusScale, 0.78 * skullRadiusScale);
        if (headD <= 1.0) {
          if (headD > 0.93) {
            sig = 880; // Scalp T2 signal
          } else if (headD > 0.87) {
            sig = 110; // Cortical bone cranium (dark on MRI)
          } else {
            // Brain parenchyma (gray matter cortex + white matter core)
            const gyriWave = 0.04 * Math.sin(nx * 24) * Math.cos(ny * 24);
            sig = headD + gyriWave > 0.72 ? 720 : 520;

            // Interhemispheric falx/CSF fissure
            if (Math.abs(nx) < 0.018 && headD > 0.25) {
              sig = 1080;
            }

            // Lateral ventricles (bright T2 CSF) in middle axial cuts
            if (zNorm > 0.22 && zNorm < 0.72) {
              const ventAmp = Math.sin(((zNorm - 0.22) / 0.5) * Math.PI);
              const ventR = ellipseDist(nx, ny, -0.11, -0.02, 0.07 * ventAmp, 0.22 * ventAmp);
              const ventL = ellipseDist(nx, ny, 0.11, -0.02, 0.07 * ventAmp, 0.22 * ventAmp);
              if (ventR < 1.0 || ventL < 1.0) {
                sig = 1150;
              }
            }
          }
        }

        pixels[y * size + x] = clamp(sig, 0, 4095);
      }
    }

    const zMm = (s * 5).toFixed(2);
    buffers.push(
      encodeDicomPart10({
        sopClassUid: SOP_CLASSES.MR,
        sopInstanceUid: `${DEMO_DICOM_UIDS.mriStudy}.1.${s + 1}`,
        studyInstanceUid: DEMO_DICOM_UIDS.mriStudy,
        seriesInstanceUid: `${DEMO_DICOM_UIDS.mriStudy}.1`,
        frameOfReferenceUid: `${DEMO_DICOM_UIDS.mriStudy}.99`,
        accessionNumber: 'ACC-DEMO-2026-003',
        modality: 'MR',
        studyDescription: 'MRI Brain Axial T2-W',
        seriesDescription: 'AXIAL T2 FSE',
        patientName,
        patientId,
        patientBirthDate: '19750130',
        patientSex: 'M',
        studyDate: '20261127',
        studyTime: '101500',
        instanceNumber: s + 1,
        sliceThickness: '5.0',
        imagePositionPatient: `-115\\-115\\${zMm}`,
        sliceLocation: zMm,
        pixelSpacing: '0.90\\0.90',
        rows: size,
        cols: size,
        bitsStored: 12,
        windowCenter: '560',
        windowWidth: '1120',
        pixels,
      }),
    );
  }

  return buffers;
}

async function uploadStudyToOrthanc(
  orthancUrl: string,
  authorization: string,
  label: string,
  instances: Buffer[],
): Promise<number> {
  let uploaded = 0;
  for (const dicomBuffer of instances) {
    const res = await fetch(`${orthancUrl}/instances`, {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/dicom',
      },
      body: new Uint8Array(dicomBuffer),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Orthanc upload failed for ${label}: HTTP ${res.status}`);
    }
    uploaded++;
  }
  return uploaded;
}

async function waitForOrthanc(orthancUrl: string, authorization: string): Promise<boolean> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${orthancUrl}/system`, {
        headers: { authorization },
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok) return true;
    } catch {
      // Wait for Orthanc container startup
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function ensureDemoPacsStudies(prisma: PrismaClient, hospitalId: number): Promise<void> {
  const rawUrl = process.env.RADIOLOGY_ORTHANC_URL;
  const username = process.env.RADIOLOGY_ORTHANC_USERNAME;
  const password = process.env.RADIOLOGY_ORTHANC_PASSWORD;

  if (!rawUrl || !username || !password) {
    console.log('ℹ️ RADIOLOGY_ORTHANC_URL not configured — skipping PACS/OHIF study upload.');
    return;
  }

  const orthancUrl = rawUrl.replace(/\/+$/, '');
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const ready = await waitForOrthanc(orthancUrl, authorization);
  if (!ready) {
    console.warn(`⚠️ Orthanc PACS unreachable at ${orthancUrl}; skipping demo DICOM upload.`);
    return;
  }

  const [cxrCount, ctCount, mriCount] = await Promise.all([
    uploadStudyToOrthanc(orthancUrl, authorization, 'DX-CXR', buildChestXrayStudy()),
    uploadStudyToOrthanc(orthancUrl, authorization, 'CT-ABD', buildAbdomenCtStudy()),
    uploadStudyToOrthanc(orthancUrl, authorization, 'MR-BRAIN', buildBrainMriStudy()),
  ]);

  // 1. Link Chest X-Ray (ACC-DEMO-2026-001) to Study UID
  await prisma.radiologyOrder.updateMany({
    where: {
      dicomAccessionNumber: 'ACC-DEMO-2026-001',
      study: { hospitalId },
    },
    data: {
      dicomStudyUid: DEMO_DICOM_UIDS.cxrStudy,
      status: RadiologyStatus.COMPLETED,
    },
  });

  // 2. Link Abdomen CT (ACC-DEMO-2026-002) & promote to IN_PROGRESS so OHIF viewer is immediately available
  const ctOrder = await prisma.radiologyOrder.findFirst({
    where: {
      dicomAccessionNumber: 'ACC-DEMO-2026-002',
      study: { hospitalId },
    },
    select: { id: true, status: true, orderId: true },
  });
  if (ctOrder) {
    await prisma.radiologyOrder.update({
      where: { id: ctOrder.id },
      data: {
        dicomStudyUid: DEMO_DICOM_UIDS.ctStudy,
        status:
          ctOrder.status === RadiologyStatus.COMPLETED
            ? RadiologyStatus.COMPLETED
            : RadiologyStatus.IN_PROGRESS,
      },
    });
    if (ctOrder.status === RadiologyStatus.PENDING) {
      await prisma.order.update({
        where: { id: ctOrder.orderId },
        data: { status: OrderStatus.IN_PROGRESS, paymentStatus: 'PAID' },
      });
    }
  }

  // 3. Ensure Brain MRI (ACC-DEMO-2026-003) exists & is linked for multi-modality MRI demo
  const existingMri = await prisma.radiologyOrder.findFirst({
    where: {
      dicomAccessionNumber: 'ACC-DEMO-2026-003',
      study: { hospitalId },
    },
    select: { id: true },
  });
  if (!existingMri) {
    const mriStudyCatalog = await prisma.radiologyStudy.findFirst({
      where: { hospitalId, isDeleted: false, code: { in: ['MRI-BRAIN', 'MRI-HEAD'] } },
    });
    const mriPatient = await prisma.patient.findFirst({
      where: { hospitalId, mrn: 'MRN-2026-1003', isDeleted: false },
    });
    const mriDoctor = await prisma.user.findUnique({ where: { username: 'dr_ahmed' } });
    const radUser = await prisma.user.findUnique({ where: { username: 'rad_user' } });
    if (mriStudyCatalog && mriPatient && mriDoctor) {
      const mriEncounter = await prisma.encounter.findFirst({
        where: { hospitalId, patientId: mriPatient.id, isDeleted: false },
        orderBy: { id: 'desc' },
      });
      if (mriEncounter) {
        const signedAt = new Date();
        const ord = await prisma.order.create({
          data: {
            hospitalId,
            encounterId: mriEncounter.id,
            orderedById: mriDoctor.id,
            type: OrderType.RADIOLOGY,
            status: OrderStatus.COMPLETED,
            paymentStatus: 'PAID',
            completedAt: signedAt,
          },
        });
        await prisma.radiologyOrder.create({
          data: {
            orderId: ord.id,
            studyId: mriStudyCatalog.id,
            status: RadiologyStatus.COMPLETED,
            dicomAccessionNumber: 'ACC-DEMO-2026-003',
            dicomStudyUid: DEMO_DICOM_UIDS.mriStudy,
            scheduledAt: signedAt,
            reportedAt: signedAt,
            reportStatus: 'FINAL',
            indicationText: 'Persistent occipital headache & dizziness',
            techniqueText: 'Axial T2-weighted FSE 5mm brain MRI',
            findingsText: 'Normal ventricular caliber and cortical gyral symmetry. No midline shift, acute infarction, or space-occupying lesion.',
            impressionText: 'Unremarkable Brain MRI study.',
            reportText: 'Unremarkable Brain MRI study.',
            reportedById: radUser?.id ?? mriDoctor.id,
            signedById: mriDoctor.id,
            signedAt,
            signatureHash: sha256(`RAD|${ord.id}|ACC-DEMO-2026-003|FINAL|${signedAt.toISOString()}`),
          },
        });
      }
    }
  } else {
    await prisma.radiologyOrder.update({
      where: { id: existingMri.id },
      data: { dicomStudyUid: DEMO_DICOM_UIDS.mriStudy },
    });
  }

  // 4. Ensure an interactive PENDING Ultrasound study exists so technician/radiologist can also click Start
  const existingUs = await prisma.radiologyOrder.findFirst({
    where: {
      dicomAccessionNumber: 'ACC-DEMO-2026-004',
      study: { hospitalId },
    },
    select: { id: true },
  });
  if (!existingUs) {
    const usStudyCatalog = await prisma.radiologyStudy.findFirst({
      where: { hospitalId, isDeleted: false, code: 'US-ABD' },
    });
    const usPatient = await prisma.patient.findFirst({
      where: { hospitalId, mrn: 'MRN-2026-1002', isDeleted: false },
    });
    const usDoctor = await prisma.user.findUnique({ where: { username: 'dr_sara' } });
    if (usStudyCatalog && usPatient && usDoctor) {
      const usEncounter = await prisma.encounter.findFirst({
        where: { hospitalId, patientId: usPatient.id, isDeleted: false },
        orderBy: { id: 'desc' },
      });
      if (usEncounter) {
        const ordUs = await prisma.order.create({
          data: {
            hospitalId,
            encounterId: usEncounter.id,
            orderedById: usDoctor.id,
            type: OrderType.RADIOLOGY,
            status: OrderStatus.NEW,
            paymentStatus: 'PENDING',
          },
        });
        await prisma.radiologyOrder.create({
          data: {
            orderId: ordUs.id,
            studyId: usStudyCatalog.id,
            status: RadiologyStatus.PENDING,
            dicomAccessionNumber: 'ACC-DEMO-2026-004',
            scheduledAt: new Date(),
            reportStatus: 'DRAFT',
            indicationText: 'Right upper quadrant discomfort — rule out biliary sludge',
          },
        });
      }
    }
  }

  console.log(
    `🩻 PACS/OHIF Demo Studies ready (DX=${cxrCount}, CT=${ctCount} slices, MR=${mriCount} slices).`,
  );
}
