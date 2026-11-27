// server/src/archive/archive.controller.ts
import type { Request, Response } from 'express';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CorrespondencePriority,
  CorrespondenceStatus,
  CorrespondenceType,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { AuditInTransaction } from '../audit/audit.decorator';
import type { UploadedAttachmentFile } from '../insurance/preauth-attachments';
import { ArchiveService } from './archive.service';
import {
  AcknowledgeRoutingDto,
  CreateArchiveCategoryDto,
  CreateArchiveDocumentDto,
  CreateCorrespondenceDto,
  CreateDocumentVersionDto,
  RouteCorrespondenceDto,
  UpdateArchiveCategoryDto,
  UpdateArchiveDocumentDto,
  UpdateCorrespondenceDto,
} from './dto/archive.dto';

const MAX_ARCHIVE_UPLOAD_BYTES = 25 * 1024 * 1024;

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('archive')
export class ArchiveController {
  constructor(private readonly archiveService: ArchiveService) {}

  @Get('stats')
  @Permissions('archive:view', 'archive:manage')
  getStats(@CurrentUser() user: JwtPayload) {
    return this.archiveService.getStats(user.hospitalId, user.sub);
  }

  // =========================================================================
  // CATEGORIES
  // =========================================================================

  @Get('categories')
  @Permissions('archive:view', 'archive:manage')
  getCategories(@CurrentUser() user: JwtPayload) {
    return this.archiveService.getCategories(user.hospitalId);
  }

  @Post('categories')
  @AuditInTransaction()
  @Permissions('archive:manage')
  createCategory(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateArchiveCategoryDto,
    @Req() req: Request,
  ) {
    return this.archiveService.createCategory(user.hospitalId, user.sub, dto, {
      ipAddress: req.ip,
      clientName: req.get('user-agent'),
    });
  }

  @Patch('categories/:id')
  @AuditInTransaction()
  @Permissions('archive:manage')
  updateCategory(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateArchiveCategoryDto,
    @Req() req: Request,
  ) {
    return this.archiveService.updateCategory(
      user.hospitalId,
      id,
      user.sub,
      dto,
      {
        ipAddress: req.ip,
        clientName: req.get('user-agent'),
      },
    );
  }

  @Delete('categories/:id')
  @AuditInTransaction()
  @Permissions('archive:delete', 'archive:manage')
  deleteCategory(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.archiveService.deleteCategory(user.hospitalId, id, user.sub, {
      ipAddress: req.ip,
      clientName: req.get('user-agent'),
    });
  }

  // =========================================================================
  // CORRESPONDENCE ROUTING (STATIC ROUTES BEFORE :id)
  // =========================================================================

  @Get('correspondence/routing/inbox')
  @Permissions('archive:view', 'archive:correspondence:route', 'archive:manage')
  getInbox(
    @CurrentUser() user: JwtPayload,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.archiveService.getInbox(
      user.hospitalId,
      user.sub,
      unreadOnly === 'true',
    );
  }

  @Get('correspondence/routing/users')
  @Permissions('archive:view', 'archive:correspondence:route', 'archive:manage')
  listRoutableUsers(@CurrentUser() user: JwtPayload) {
    return this.archiveService.listRoutableUsers(user.hospitalId);
  }

  @Patch('correspondence/routing/:routingId/acknowledge')
  @AuditInTransaction()
  @Permissions('archive:view', 'archive:correspondence:route', 'archive:manage')
  acknowledgeRouting(
    @CurrentUser() user: JwtPayload,
    @Param('routingId', ParseIntPipe) routingId: number,
    @Body() dto: AcknowledgeRoutingDto,
    @Req() req: Request,
  ) {
    return this.archiveService.acknowledgeRouting(
      user.hospitalId,
      routingId,
      user.sub,
      dto,
      {
        ipAddress: req.ip,
        clientName: req.get('user-agent'),
      },
    );
  }

  // =========================================================================
  // CORRESPONDENCE CRUD
  // =========================================================================

  @Get('correspondence')
  @Permissions('archive:view', 'archive:manage')
  findAllCorrespondence(
    @CurrentUser() user: JwtPayload,
    @Query('type') type?: CorrespondenceType,
    @Query('status') status?: CorrespondenceStatus,
    @Query('priority') priority?: CorrespondencePriority,
    @Query('search') search?: string,
  ) {
    return this.archiveService.findAllCorrespondence(user.hospitalId, {
      type,
      status,
      priority,
      search,
    });
  }

  @Post('correspondence')
  @AuditInTransaction()
  @Permissions('archive:manage')
  createCorrespondence(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCorrespondenceDto,
    @Req() req: Request,
  ) {
    return this.archiveService.createCorrespondence(
      user.hospitalId,
      user.sub,
      dto,
      {
        ipAddress: req.ip,
        clientName: req.get('user-agent'),
      },
    );
  }

  @Get('correspondence/:id')
  @Permissions('archive:view', 'archive:manage')
  findOneCorrespondence(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.archiveService.findOneCorrespondence(user.hospitalId, id);
  }

  @Patch('correspondence/:id')
  @AuditInTransaction()
  @Permissions('archive:manage')
  updateCorrespondence(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCorrespondenceDto,
    @Req() req: Request,
  ) {
    return this.archiveService.updateCorrespondence(
      user.hospitalId,
      id,
      user.sub,
      dto,
      {
        ipAddress: req.ip,
        clientName: req.get('user-agent'),
      },
    );
  }

  @Delete('correspondence/:id')
  @AuditInTransaction()
  @Permissions('archive:delete', 'archive:manage')
  deleteCorrespondence(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.archiveService.deleteCorrespondence(
      user.hospitalId,
      id,
      user.sub,
      {
        ipAddress: req.ip,
        clientName: req.get('user-agent'),
      },
    );
  }

  @Post('correspondence/:id/route')
  @AuditInTransaction()
  @Permissions('archive:correspondence:route', 'archive:manage')
  routeCorrespondence(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RouteCorrespondenceDto,
    @Req() req: Request,
  ) {
    return this.archiveService.routeCorrespondence(
      user.hospitalId,
      id,
      user.sub,
      dto,
      {
        ipAddress: req.ip,
        clientName: req.get('user-agent'),
      },
    );
  }

  // =========================================================================
  // ARCHIVE DOCUMENTS & VERSIONING
  // =========================================================================

  @Get('documents')
  @Permissions('archive:view', 'archive:manage')
  findAllDocuments(
    @CurrentUser() user: JwtPayload,
    @Query('categoryId') categoryId?: string,
    @Query('isStarred') isStarred?: string,
    @Query('tag') tag?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('relatedEntityType') relatedEntityType?: string,
    @Query('relatedEntityId') relatedEntityId?: string,
  ) {
    return this.archiveService.findAllDocuments(user.hospitalId, {
      categoryId: categoryId ? Number(categoryId) : undefined,
      isStarred,
      tag,
      search,
      startDate,
      endDate,
      relatedEntityType,
      relatedEntityId: relatedEntityId ? Number(relatedEntityId) : undefined,
    });
  }

  @Post('documents')
  @AuditInTransaction()
  @Permissions('archive:manage')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_ARCHIVE_UPLOAD_BYTES },
    }),
  )
  createDocument(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateArchiveDocumentDto,
    @UploadedFile() file: UploadedAttachmentFile | undefined,
    @Req() req: Request,
  ) {
    return this.archiveService.createDocument(
      user.hospitalId,
      user.sub,
      dto,
      file,
      {
        ipAddress: req.ip,
        clientName: req.get('user-agent'),
      },
    );
  }

  @Get('documents/:id')
  @Permissions('archive:view', 'archive:manage')
  findOneDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.archiveService.findOneDocument(user.hospitalId, id);
  }

  @Patch('documents/:id')
  @AuditInTransaction()
  @Permissions('archive:manage')
  updateDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateArchiveDocumentDto,
    @Req() req: Request,
  ) {
    return this.archiveService.updateDocument(
      user.hospitalId,
      id,
      user.sub,
      dto,
      {
        ipAddress: req.ip,
        clientName: req.get('user-agent'),
      },
    );
  }

  @Patch('documents/:id/star')
  @AuditInTransaction()
  @Permissions('archive:manage')
  toggleStar(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.archiveService.toggleStar(user.hospitalId, id, user.sub, {
      ipAddress: req.ip,
      clientName: req.get('user-agent'),
    });
  }

  @Post('documents/:id/versions')
  @AuditInTransaction()
  @Permissions('archive:manage')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_ARCHIVE_UPLOAD_BYTES },
    }),
  )
  addVersion(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: UploadedAttachmentFile | undefined,
    @Body() dto: CreateDocumentVersionDto,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('ملف النسخة الجديدة مطلوب.');
    }
    return this.archiveService.addVersion(
      user.hospitalId,
      id,
      user.sub,
      file,
      dto,
      {
        ipAddress: req.ip,
        clientName: req.get('user-agent'),
      },
    );
  }

  @Get('documents/:id/download')
  @Permissions('archive:view', 'archive:manage')
  async downloadDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query('inline') inline: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, mimeType, originalName } =
      await this.archiveService.downloadDocument(
        user.hospitalId,
        id,
        user.sub,
        {
          ipAddress: req.ip,
          clientName: req.get('user-agent'),
        },
      );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    const safeName = encodeURIComponent(originalName || `document-${id}`);
    const disp = inline === '1' || inline === 'true' ? 'inline' : 'attachment';
    return new StreamableFile(buffer, {
      type: mimeType,
      disposition: `${disp}; filename*=UTF-8''${safeName}`,
    });
  }

  @Get('documents/:id/versions/:versionId/download')
  @Permissions('archive:view', 'archive:manage')
  async downloadVersion(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @Query('inline') inline: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, mimeType, originalName } =
      await this.archiveService.downloadVersion(
        user.hospitalId,
        id,
        versionId,
        user.sub,
        {
          ipAddress: req.ip,
          clientName: req.get('user-agent'),
        },
      );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    const safeName = encodeURIComponent(originalName || `version-${versionId}`);
    const disp = inline === '1' || inline === 'true' ? 'inline' : 'attachment';
    return new StreamableFile(buffer, {
      type: mimeType,
      disposition: `${disp}; filename*=UTF-8''${safeName}`,
    });
  }

  @Delete('documents/:id')
  @AuditInTransaction()
  @Permissions('archive:delete', 'archive:manage')
  softDeleteDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.archiveService.softDeleteDocument(
      user.hospitalId,
      id,
      user.sub,
      {
        ipAddress: req.ip,
        clientName: req.get('user-agent'),
      },
    );
  }
}
