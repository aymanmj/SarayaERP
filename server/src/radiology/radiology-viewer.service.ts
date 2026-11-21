import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { Response } from 'undici';
import { appendChainedAudit } from '../audit/audit-chain';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { PrismaService } from '../prisma/prisma.service';
import { fetchOrthanc, orthancConfig } from './radiology-pacs.service';
import { radiologyViewerRoot } from '../common/utils/request-log-path';

export const viewerRoot = radiologyViewerRoot;
export const viewerCookie = 'SarayaDicomView';
export const viewerLifetime = 15 * 60;
const audience = 'saraya-dicom-read';
const issuer = 'saraya-radiology';
const uidPattern = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))+$/u;

export function protectedViewerUrl(id: number, uid: string | null) {
  return process.env.RADIOLOGY_OHIF_ENABLED === 'true' && uid
    ? `${viewerRoot}/${id}/viewer`
    : null;
}

export function canReadDepartmentStudies(user: JwtPayload) {
  return (
    user.permissions.includes('radiology:manage') ||
    user.permissions.includes('ADMIN_FULL_ACCESS') ||
    user.roles.includes('ADMIN')
  );
}

function validUid(value: string) {
  return !!value && value.length <= 64 && uidPattern.test(value);
}

// Only study-scoped read routes used by OHIF. The browser cannot supply an upstream URL.
function studyResource(uid: string, segments: string[]) {
  if (segments.length === 0 || segments[0] !== uid) return null;
  const [, series, seriesUid, instances, instanceUid, operation, frame] =
    segments;
  if (
    segments.length === 2 &&
    ['series', 'metadata', 'instances'].includes(series)
  )
    return segments.join('/');
  if (series !== 'series' || !validUid(seriesUid)) return null;
  if (segments.length === 4 && ['metadata', 'instances'].includes(instances))
    return segments.join('/');
  if (instances !== 'instances' || !validUid(instanceUid)) return null;
  if (
    segments.length === 6 &&
    ['metadata', 'thumbnail', 'rendered'].includes(operation)
  )
    return segments.join('/');
  if (
    segments.length === 7 &&
    operation === 'frames' &&
    /^[1-9]\d{0,8}(?:,[1-9]\d{0,8}){0,63}$/u.test(frame)
  )
    return segments.join('/');
  return null;
}

@Injectable()
export class RadiologyViewerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async authorize(user: JwtPayload, id: number) {
    if (process.env.RADIOLOGY_OHIF_ENABLED !== 'true')
      throw new NotFoundException();
    const { hospitalId, sub } = user;
    const department = canReadDepartmentStudies(user);
    const exam = await this.prisma.radiologyOrder.findFirst({
      where: {
        id,
        dicomStudyUid: { not: null },
        status: { in: ['IN_PROGRESS', 'COMPLETED'] },
        study: { hospitalId, isDeleted: false },
        order: {
          hospitalId,
          type: 'RADIOLOGY',
          isDeleted: false,
          status: { not: 'CANCELLED' },
          encounter: {
            hospitalId,
            isDeleted: false,
            patient: { hospitalId, isDeleted: false },
          },
          ...(department
            ? {}
            : { OR: [{ orderedById: sub }, { encounter: { doctorId: sub } }] }),
        },
      },
      select: { dicomStudyUid: true },
    });
    if (!exam?.dicomStudyUid || !validUid(exam.dicomStudyUid))
      throw new NotFoundException();
    return exam.dicomStudyUid;
  }

  private grantClaims(user: JwtPayload, id: number, uid: string) {
    return {
      sid: user.sid,
      branchVersion: user.branchVersion,
      authVersion: user.authVersion,
      userId: user.sub,
      hospitalId: user.hospitalId,
      orderId: id,
      studyUid: uid,
    };
  }

  async launch(user: JwtPayload, id: number, uid: string, ipAddress?: string) {
    const response = await this.fetchArchive('/ohif/viewer', 'text/html');
    if (
      !response.ok ||
      !response.headers.get('content-type')?.startsWith('text/html')
    ) {
      await response.body?.cancel();
      throw new BadGatewayException('واجهة OHIF غير متاحة');
    }
    const html = (await response.text())
      .replace(
        /<script\b[^>]*\bsrc="\.\/init-service-worker\.js"[^>]*><\/script>/gu,
        '',
      )
      .replace(/<link\b[^>]*\bhref="\.\/manifest\.json"[^>]*>/gu, '');
    const scriptHashes = Array.from(
      html.matchAll(/<script>([\s\S]*?)<\/script>/gu),
      ([, script]) =>
        `'sha256-${createHash('sha256').update(script.replace(/\r\n?/gu, '\n')).digest('base64')}'`,
    ).join(' ');
    const token = await this.jwt.signAsync(this.grantClaims(user, id, uid), {
      audience,
      issuer,
      algorithm: 'HS256',
      expiresIn: viewerLifetime,
    });
    await appendChainedAudit(this.prisma, {
      hospitalId: user.hospitalId,
      userId: user.sub,
      action: 'RADIOLOGY_DICOM_VIEW_OPENED',
      entity: 'RadiologyOrder',
      entityId: id,
      ipAddress,
    });
    return { html, token, scriptHashes };
  }

  configuration(id: number) {
    const root = `${viewerRoot}/${id}`;
    const dicom = `${root}/dicom-web`;
    return `window.config = ${JSON.stringify({
      routerBasename: `${root}/`,
      showStudyList: false,
      extensions: [],
      modes: [],
      defaultDataSourceName: 'dicomweb',
      dataSources: [
        {
          namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
          sourceName: 'dicomweb',
          configuration: {
            name: 'saraya-dicom',
            qidoRoot: dicom,
            wadoRoot: dicom,
            wadoUriRoot: dicom,
            qidoSupportsIncludeField: false,
            supportsReject: false,
            supportsWildcard: false,
            imageRendering: 'wadors',
            thumbnailRendering: 'wadors',
            enableStudyLazyLoad: true,
            staticWado: true,
            bulkDataURI: { enabled: false },
          },
        },
      ],
    })};`;
  }

  async asset(segments: string[]) {
    if (
      !segments.length ||
      segments.some(
        (segment) =>
          !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/u.test(segment) ||
          /service-worker|workbox/iu.test(segment),
      )
    )
      throw new NotFoundException();
    const path = segments.join('/');
    if (
      !/\.(?:js|css|wasm|woff2?|ttf|png|jpe?g|gif|svg|ico|json|webp)$/iu.test(
        path,
      )
    )
      throw new NotFoundException();
    return this.stream(await this.fetchArchive(`/ohif/${path}`, '*/*'), false);
  }

  async retrieve(
    user: JwtPayload,
    id: number,
    uid: string,
    token: unknown,
    segments: string[],
    query: unknown,
    accept: string,
  ) {
    try {
      if (typeof token !== 'string') throw new UnauthorizedException();
      const claims = await this.jwt.verifyAsync<Record<string, unknown>>(
        token,
        { issuer, audience, algorithms: ['HS256'] },
      );
      for (const [key, value] of Object.entries(
        this.grantClaims(user, id, uid),
      )) {
        if (claims[key] !== value) throw new UnauthorizedException();
      }
    } catch {
      throw new UnauthorizedException('أعد فتح الدراسة من السرايا');
    }
    const resource = studyResource(uid, segments);
    if (!resource && (segments.length || query !== uid))
      throw new NotFoundException();
    const reading = resource
      ? `/studies/${resource}`
      : `/studies?${new URLSearchParams({ StudyInstanceUID: uid })}`;
    const response = await this.fetchArchive(`/dicom-web${reading}`, accept);
    if (
      response.ok &&
      response.headers.get('content-type')?.startsWith('application/dicom+json')
    ) {
      try {
        // JSON metadata can contain archive-local URLs. The DX viewer uses explicit frame routes.
        return JSON.parse(await response.text(), (key, value: unknown) =>
          key === 'BulkDataURI' || key === '00081190' ? undefined : value,
        ) as unknown;
      } catch {
        throw new BadGatewayException('تعذر قراءة بيانات دراسة الأشعة');
      }
    }
    return this.stream(response, true);
  }

  private async fetchArchive(path: string, accept: string) {
    const archive = orthancConfig();
    try {
      return await fetchOrthanc(`${archive.base}${path}`, {
        headers: { authorization: archive.authorization, accept },
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new BadGatewayException('تعذر الاتصال بأرشيف الأشعة');
    }
  }

  private async stream(response: Response, dicom: boolean) {
    const type = response.headers.get('content-type') ?? '';
    if (
      !response.ok ||
      !response.body ||
      !type ||
      /^text\/html/iu.test(type) ||
      (dicom &&
        !/^(?:multipart\/related|application\/(?:octet-stream|dicom)|image\/(?:jpeg|png|webp))(?:;|$)/iu.test(
          type,
        ))
    ) {
      await response.body?.cancel();
      if (response.status === 404) throw new NotFoundException();
      throw new BadGatewayException('تعذّر استرجاع محتوى الأشعة');
    }
    return new StreamableFile(
      Readable.fromWeb(
        response.body as unknown as NodeReadableStream<Uint8Array>,
      ),
      { type },
    );
  }
}
