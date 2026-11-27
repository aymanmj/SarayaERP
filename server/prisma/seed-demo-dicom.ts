import {
  OrderStatus,
  OrderType,
  PrismaClient,
  RadiologyStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const LEGACY_SYNTHETIC_UIDS = [
  '2.25.20261127000101',
  '2.25.20261127000102',
  '2.25.20261127000103',
] as const;

export const DEMO_DICOM_UIDS = {
  cxrStudy: '2.25.20261127000201',
  ctStudy: '2.25.20261127000202',
  mriStudy: '2.25.20261127000203',
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

function ellipseDist(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Air-gapped fallback synthetic generators if offline without local .dcm cache */
export function buildChestXrayStudy(patientId = 'MRN-2026-1004', patientName = 'Khaled^Al-Gharyani'): Buffer[] {
  const size = 256;
  const pixels = new Uint16Array(size * size);
  for (let y = 0; y < size; y++) {
    const ny = (y / (size - 1)) * 2 - 1;
    for (let x = 0; x < size; x++) {
      const nx = (x / (size - 1)) * 2 - 1;
      let val = 260;
      const torsoD = ellipseDist(nx, ny * 0.85, 0, 0.08, 0.82, 0.92);
      if (torsoD <= 1.0) val = 1850 - 300 * torsoD * torsoD;
      pixels[y * size + x] = clamp(val, 0, 4095);
    }
  }
  return [
    encodeDicomPart10({
      sopClassUid: SOP_CLASSES.DX,
      sopInstanceUid: `${DEMO_DICOM_UIDS.cxrStudy}.99.1`,
      studyInstanceUid: DEMO_DICOM_UIDS.cxrStudy,
      seriesInstanceUid: `${DEMO_DICOM_UIDS.cxrStudy}.99`,
      frameOfReferenceUid: `${DEMO_DICOM_UIDS.cxrStudy}.98`,
      accessionNumber: 'ACC-DEMO-2026-001',
      modality: 'DX',
      studyDescription: 'Portable AP Chest X-Ray',
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
  const size = 128;
  const pixels = new Uint16Array(size * size);
  pixels.fill(1064);
  return [
    encodeDicomPart10({
      sopClassUid: SOP_CLASSES.CT,
      sopInstanceUid: `${DEMO_DICOM_UIDS.ctStudy}.99.1`,
      studyInstanceUid: DEMO_DICOM_UIDS.ctStudy,
      seriesInstanceUid: `${DEMO_DICOM_UIDS.ctStudy}.99`,
      frameOfReferenceUid: `${DEMO_DICOM_UIDS.ctStudy}.98`,
      accessionNumber: 'ACC-DEMO-2026-002',
      modality: 'CT',
      studyDescription: 'CT Thorax & Abdomen',
      seriesDescription: 'Axial 5mm',
      patientName,
      patientId,
      patientBirthDate: '19820412',
      patientSex: 'M',
      studyDate: '20261127',
      studyTime: '140000',
      instanceNumber: 1,
      sliceThickness: '5.0',
      imagePositionPatient: '-180\\-180\\0',
      sliceLocation: '0',
      pixelSpacing: '1.40\\1.40',
      rows: size,
      cols: size,
      bitsStored: 16,
      windowCenter: '40',
      windowWidth: '400',
      rescaleIntercept: '-1024',
      pixels,
    }),
  ];
}

export function buildBrainMriStudy(patientId = 'MRN-2026-1003', patientName = 'Mohamed^Al-Fitouri'): Buffer[] {
  const size = 128;
  const pixels = new Uint16Array(size * size);
  pixels.fill(520);
  return [
    encodeDicomPart10({
      sopClassUid: SOP_CLASSES.MR,
      sopInstanceUid: `${DEMO_DICOM_UIDS.mriStudy}.99.1`,
      studyInstanceUid: DEMO_DICOM_UIDS.mriStudy,
      seriesInstanceUid: `${DEMO_DICOM_UIDS.mriStudy}.99`,
      frameOfReferenceUid: `${DEMO_DICOM_UIDS.mriStudy}.98`,
      accessionNumber: 'ACC-DEMO-2026-003',
      modality: 'MR',
      studyDescription: 'MRI Brain Structural',
      seriesDescription: 'Structural T1',
      patientName,
      patientId,
      patientBirthDate: '19750130',
      patientSex: 'M',
      studyDate: '20261127',
      studyTime: '101500',
      instanceNumber: 1,
      sliceThickness: '5.0',
      imagePositionPatient: '-115\\-115\\0',
      sliceLocation: '0',
      pixelSpacing: '0.90\\0.90',
      rows: size,
      cols: size,
      bitsStored: 12,
      windowCenter: '560',
      windowWidth: '1120',
      pixels,
    }),
  ];
}

interface RealClinicalStudySpec {
  key: 'dx' | 'ct' | 'mr';
  label: string;
  targetStudyUid: string;
  accessionNumber: string;
  patientId: string;
  patientName: string;
  studyDescription: string;
  urls: string[];
  minExpectedCount: number;
  fallbackFn: () => Buffer[];
}

function rangeUrls(template: (n: number) => string, start: number, end: number, step = 1): string[] {
  const out: string[] = [];
  for (let i = start; i <= end; i += step) {
    out.push(template(i));
  }
  return out;
}

export const REAL_CLINICAL_STUDIES: RealClinicalStudySpec[] = [
  {
    key: 'dx',
    label: 'Chest X-Ray (Real Clinical CR)',
    targetStudyUid: DEMO_DICOM_UIDS.cxrStudy,
    accessionNumber: 'ACC-DEMO-2026-001',
    patientId: 'MRN-2026-1004',
    patientName: 'Khaled^Al-Gharyani',
    studyDescription: 'AP Chest Radiograph (Clinical Sample)',
    urls: [
      'https://raw.githubusercontent.com/ivmartel/dwv/master/tests/data/gdcm-CR-MONO1-10-chest.dcm',
    ],
    minExpectedCount: 1,
    fallbackFn: () => buildChestXrayStudy(),
  },
  {
    key: 'ct',
    label: 'Thorax/Abdomen CT (40 Real Clinical Slices)',
    targetStudyUid: DEMO_DICOM_UIDS.ctStudy,
    accessionNumber: 'ACC-DEMO-2026-002',
    patientId: 'MRN-2026-1001',
    patientName: 'Ahmed^Al-Warfalli',
    studyDescription: 'CT Thorax & Upper Abdomen (Clinical Sample)',
    urls: rangeUrls(
      (i) =>
        `https://raw.githubusercontent.com/OHIF/viewer-testdata/master/dcm/acrin/ct-1-${String(i).padStart(3, '0')}.dcm`,
      45,
      84,
      1,
    ),
    minExpectedCount: 30,
    fallbackFn: () => buildAbdomenCtStudy(),
  },
  {
    key: 'mr',
    label: 'Brain MRI Structural (32 Real Clinical Slices)',
    targetStudyUid: DEMO_DICOM_UIDS.mriStudy,
    accessionNumber: 'ACC-DEMO-2026-003',
    patientId: 'MRN-2026-1003',
    patientName: 'Mohamed^Al-Fitouri',
    studyDescription: 'MRI Brain Structural (De-faced Clinical Sample)',
    urls: rangeUrls(
      (i) =>
        `https://raw.githubusercontent.com/datalad/example-dicom-structural/master/dicoms/N2D_${String(i).padStart(4, '0')}.dcm`,
      120,
      244,
      4,
    ),
    minExpectedCount: 24,
    fallbackFn: () => buildBrainMriStudy(),
  },
];

async function waitForOrthanc(orthancUrl: string, authorization: string): Promise<boolean> {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${orthancUrl}/system`, {
        headers: { authorization },
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok) return true;
    } catch {
      // Wait for Orthanc startup
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function deleteStudyByUid(orthancUrl: string, authorization: string, studyUid: string): Promise<void> {
  try {
    const lookupRes = await fetch(`${orthancUrl}/tools/lookup`, {
      method: 'POST',
      headers: { authorization, 'content-type': 'text/plain' },
      body: studyUid,
      signal: AbortSignal.timeout(8_000),
    });
    if (!lookupRes.ok) return;
    const matches = (await lookupRes.json()) as Array<{ ID?: string; Type?: string }>;
    if (!Array.isArray(matches)) return;
    for (const m of matches) {
      if (m?.Type === 'Study' && m.ID) {
        await fetch(`${orthancUrl}/studies/${m.ID}`, {
          method: 'DELETE',
          headers: { authorization },
          signal: AbortSignal.timeout(10_000),
        });
      }
    }
  } catch {
    // Non-fatal cleanup
  }
}

async function studyExistsInOrthanc(
  orthancUrl: string,
  authorization: string,
  studyUid: string,
  minCount: number,
): Promise<boolean> {
  try {
    const res = await fetch(`${orthancUrl}/dicom-web/studies/${studyUid}/metadata`, {
      headers: { authorization, accept: 'application/dicom+json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return false;
    const meta = (await res.json()) as unknown[];
    return Array.isArray(meta) && meta.length >= minCount;
  } catch {
    return false;
  }
}

async function loadOrFetchStudyBuffers(
  spec: RealClinicalStudySpec,
  cacheRoot: string,
): Promise<{ buffers: Buffer[]; source: 'cache' | 'remote' | 'fallback' }> {
  const dir = path.join(cacheRoot, spec.key);
  try {
    if (fs.existsSync(dir)) {
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith('.dcm'))
        .sort();
      if (files.length >= spec.minExpectedCount) {
        return {
          buffers: files.map((f) => fs.readFileSync(path.join(dir, f))),
          source: 'cache',
        };
      }
    }
  } catch {
    // Ignore unreadable cache dir and try remote fetch
  }

  try {
    const downloaded: Array<{ filename: string; buf: Buffer }> = [];
    const batchSize = 6;
    for (let i = 0; i < spec.urls.length; i += batchSize) {
      const batch = spec.urls.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (url) => {
          const res = await fetch(url, {
            headers: { 'user-agent': 'saraya-erp-demo-pacs' },
            signal: AbortSignal.timeout(25_000),
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} fetching ${url}`);
          }
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < 256 || buf.subarray(128, 132).toString('ascii') !== 'DICM') {
            throw new Error(`Invalid DICOM header from ${url}`);
          }
          const filename = path.basename(new URL(url).pathname);
          return { filename, buf };
        }),
      );
      downloaded.push(...batchResults);
    }

    try {
      fs.mkdirSync(dir, { recursive: true });
      for (const item of downloaded) {
        fs.writeFileSync(path.join(dir, item.filename), item.buf);
      }
    } catch {
      // Cache persistence is best-effort
    }

    return {
      buffers: downloaded.map((d) => d.buf),
      source: 'remote',
    };
  } catch (err) {
    console.warn(
      `⚠️ Could not fetch real clinical DICOM for ${spec.label} (${(err as Error).message}); using fallback phantom.`,
    );
    return {
      buffers: spec.fallbackFn(),
      source: 'fallback',
    };
  }
}

async function ingestStudyWithModify(
  orthancUrl: string,
  authorization: string,
  spec: RealClinicalStudySpec,
  buffers: Buffer[],
): Promise<number> {
  const parentStudyIds = new Set<string>();
  const batchSize = 6;
  for (let i = 0; i < buffers.length; i += batchSize) {
    const chunk = buffers.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async (dicomBuffer) => {
        const res = await fetch(`${orthancUrl}/instances`, {
          method: 'POST',
          headers: {
            authorization,
            'content-type': 'application/dicom',
          },
          body: new Uint8Array(dicomBuffer),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
          throw new Error(`Orthanc upload failed for ${spec.label}: HTTP ${res.status}`);
        }
        const info = (await res.json()) as { ParentStudy?: string };
        if (info?.ParentStudy) {
          parentStudyIds.add(info.ParentStudy);
        }
      }),
    );
  }

  for (const parentStudyId of parentStudyIds) {
    const modRes = await fetch(`${orthancUrl}/studies/${parentStudyId}/modify`, {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        Replace: {
          StudyInstanceUID: spec.targetStudyUid,
          AccessionNumber: spec.accessionNumber,
          PatientID: spec.patientId,
          PatientName: spec.patientName,
          StudyDescription: spec.studyDescription,
        },
        Force: true,
        KeepSource: false,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!modRes.ok) {
      throw new Error(`Orthanc modify failed for ${spec.label}: HTTP ${modRes.status} ${await modRes.text()}`);
    }
  }

  return buffers.length;
}

export async function syncRealDemoStudiesToOrthanc(
  orthancUrl: string,
  authorization: string,
  cacheRoot = process.env.DEMO_DICOM_DIR || '/app/data/demo-dicom',
): Promise<Record<'dx' | 'ct' | 'mr', { count: number; source: string }>> {
  for (const oldUid of LEGACY_SYNTHETIC_UIDS) {
    await deleteStudyByUid(orthancUrl, authorization, oldUid);
  }

  const summary = {} as Record<'dx' | 'ct' | 'mr', { count: number; source: string }>;

  for (const spec of REAL_CLINICAL_STUDIES) {
    const alreadyPresent = await studyExistsInOrthanc(
      orthancUrl,
      authorization,
      spec.targetStudyUid,
      spec.minExpectedCount,
    );
    if (alreadyPresent) {
      summary[spec.key] = { count: spec.minExpectedCount, source: 'orthanc-existing' };
      continue;
    }

    const { buffers, source } = await loadOrFetchStudyBuffers(spec, cacheRoot);
    const uploadedCount = await ingestStudyWithModify(orthancUrl, authorization, spec, buffers);
    summary[spec.key] = { count: uploadedCount, source };
  }

  return summary;
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

  const summary = await syncRealDemoStudiesToOrthanc(orthancUrl, authorization);

  // 1. Link Chest X-Ray (ACC-DEMO-2026-001) to Real Clinical UID
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

  // 2. Link CT (ACC-DEMO-2026-002) & promote to IN_PROGRESS so 40-slice OHIF + 3D MPR is active
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

  // 3. Ensure Brain MRI (ACC-DEMO-2026-003) exists & is linked to Real Clinical Brain MRI UID
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
            techniqueText: 'Structural Brain MRI (T1-weighted volumetric clinical study)',
            findingsText:
              'Normal ventricular caliber and cortical gyral symmetry. No midline shift, acute infarction, or space-occupying lesion.',
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

  // 4. Ensure an interactive PENDING Ultrasound study exists
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
    `🩻 Real Clinical PACS/OHIF Studies ready: DX=${summary.dx.count} (${summary.dx.source}), CT=${summary.ct.count} (${summary.ct.source}), MR=${summary.mr.count} (${summary.mr.source}).`,
  );
}
