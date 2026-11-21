import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequireFeature } from '../licensing/license.decorator';
import { BypassLocalization } from '../common/decorators/bypass-localization.decorator';
import {
  RadiologyViewerService,
  viewerCookie,
  viewerLifetime,
  viewerRoot,
} from './radiology-viewer.service';

@Controller('radiology/viewer')
@RequireFeature('RADIOLOGY')
@BypassLocalization()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('radiology:view', 'radiology:manage')
export class RadiologyViewerController {
  constructor(private readonly viewer: RadiologyViewerService) {}

  @Get(':id/viewer')
  async open(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query('StudyInstanceUIDs') query: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.set({
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    });
    const uid = await this.viewer.authorize(user, id);
    if (query === undefined) {
      return res.redirect(
        303,
        `${viewerRoot}/${id}/viewer?${new URLSearchParams({ StudyInstanceUIDs: uid })}`,
      );
    }
    if (query !== uid) throw new NotFoundException();
    const { html, token, scriptHashes } = await this.viewer.launch(
      user,
      id,
      uid,
      req.ip,
    );
    return res
      .cookie(viewerCookie, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure:
          req.secure ||
          process.env.COOKIE_SECURE === 'true' ||
          (process.env.NODE_ENV === 'production' &&
            process.env.COOKIE_SECURE !== 'false'),
        path: `${viewerRoot}/${id}/dicom-web`,
        maxAge: viewerLifetime * 1000,
      })
      .set(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "base-uri 'none'",
          "object-src 'none'",
          "frame-ancestors 'none'",
          `script-src 'self' 'wasm-unsafe-eval' ${scriptHashes}`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "worker-src 'self' blob:",
          "connect-src 'self'",
          "media-src 'self' blob:",
          "form-action 'none'",
        ].join('; '),
      )
      .type('html')
      .send(html);
  }

  @Get(':id/app-config.js')
  @Header('Cache-Control', 'private, no-store')
  @Header('Content-Type', 'text/javascript; charset=utf-8')
  async configuration(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.viewer.authorize(user, id);
    return this.viewer.configuration(id);
  }

  @Get([':id/dicom-web/studies', ':id/dicom-web/studies/*resource'])
  @Header('Cache-Control', 'private, no-store')
  @Header('Cross-Origin-Resource-Policy', 'same-origin')
  @Header('X-Accel-Buffering', 'no')
  async dicom(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Param('resource') resource: string[] | undefined,
    @Query('StudyInstanceUID') query: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const uid = await this.viewer.authorize(user, id);
    const token: unknown = req.cookies?.[viewerCookie];
    const result = await this.viewer.retrieve(
      user,
      id,
      uid,
      token,
      resource ?? [],
      query,
      req.get('accept') ?? '*/*',
    );
    if (!(result instanceof StreamableFile)) res.type('application/dicom+json');
    return result;
  }

  @Get(':id/*asset')
  @Header('Cache-Control', 'private, no-store')
  async asset(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Param('asset') asset: string[],
  ) {
    await this.viewer.authorize(user, id);
    return this.viewer.asset(asset);
  }
}
