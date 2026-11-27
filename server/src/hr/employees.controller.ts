// server/src/hr/employees.controller.ts
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
import { EmployeeStatus, StaffCategory } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { RequireFeature } from '../licensing/license.decorator';
import { AuditInTransaction } from '../audit/audit.decorator';
import type { UploadedAttachmentFile } from '../insurance/preauth-attachments';
import { EmployeesService } from './employees.service';
import {
  BulkImportEmployeesDto,
  CreateEmployeeActionDto,
  CreateEmployeeDocumentMetaDto,
  CreateEmployeeDto,
  CreateEmployeeQualificationDto,
  CreateEmployeeTrainingCourseDto,
  CreateJobTitleDto,
  CreateSectionDto,
  LinkEmployeeUserDto,
  UpdateEmployeeDto,
  UpdateJobTitleDto,
  UpdateSectionDto,
} from './dto/employee.dto';

const MAX_HR_DOC_UPLOAD_BYTES = 20 * 1024 * 1024;

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('hr')
@RequireFeature('HR')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  // --- Static & Collection Employee Endpoints ---

  @Get('employees/config')
  @Permissions(
    'hr:employees:view',
    'hr:employees:manage',
    'hr:view',
    'hr:manage',
  )
  getConfig(@CurrentUser() user: JwtPayload) {
    return this.employeesService.getHrConfig(user.hospitalId);
  }

  @Get('employees/next-number')
  @Permissions(
    'hr:employees:view',
    'hr:employees:manage',
    'hr:view',
    'hr:manage',
  )
  getNextNumber(@CurrentUser() user: JwtPayload) {
    return this.employeesService.getNextEmployeeNumber(user.hospitalId);
  }

  @Get('employees/stats')
  @Permissions(
    'hr:employees:view',
    'hr:employees:manage',
    'hr:view',
    'hr:manage',
    'hr:dashboard:view',
  )
  getStats(@CurrentUser() user: JwtPayload) {
    return this.employeesService.getStats(user.hospitalId);
  }

  @Post('employees/bulk-import')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage')
  bulkImport(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BulkImportEmployeesDto,
    @Req() req: Request,
  ) {
    return this.employeesService.bulkImport(user.hospitalId, user.sub, dto, {
      ipAddress: req.ip,
      clientName: req.get('user-agent'),
    });
  }

  @Get('employees')
  @Permissions(
    'hr:employees:view',
    'hr:employees:manage',
    'hr:view',
    'hr:manage',
  )
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('departmentId') departmentId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('staffCategory') staffCategory?: StaffCategory,
    @Query('status') status?: EmployeeStatus,
    @Query('hasUserAccount') hasUserAccount?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.employeesService.findAll(user.hospitalId, {
      search,
      departmentId: departmentId ? Number(departmentId) : undefined,
      sectionId: sectionId ? Number(sectionId) : undefined,
      staffCategory,
      status,
      hasUserAccount,
      isActive,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('employees')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateEmployeeDto,
    @Req() req: Request,
  ) {
    return this.employeesService.create(user.hospitalId, user.sub, dto, {
      ipAddress: req.ip,
      clientName: req.get('user-agent'),
    });
  }

  // --- Org Structure: Sections & Job Titles ---

  @Get('org/sections')
  @Permissions(
    'hr:employees:view',
    'hr:employees:manage',
    'hr:view',
    'hr:manage',
    'departments:view',
  )
  listSections(
    @CurrentUser() user: JwtPayload,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.employeesService.listSections(
      user.hospitalId,
      departmentId ? Number(departmentId) : undefined,
    );
  }

  @Post('org/sections')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage', 'departments:manage')
  createSection(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSectionDto,
  ) {
    return this.employeesService.createSection(user.hospitalId, dto);
  }

  @Patch('org/sections/:id')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage', 'departments:manage')
  updateSection(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.employeesService.updateSection(user.hospitalId, id, dto);
  }

  @Delete('org/sections/:id')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage', 'departments:manage')
  deleteSection(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeesService.deleteSection(user.hospitalId, id);
  }

  @Get('org/job-titles')
  @Permissions(
    'hr:employees:view',
    'hr:employees:manage',
    'hr:view',
    'hr:manage',
    'departments:view',
  )
  listJobTitles(@CurrentUser() user: JwtPayload) {
    return this.employeesService.listJobTitles(user.hospitalId);
  }

  @Post('org/job-titles')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage', 'departments:manage')
  createJobTitle(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateJobTitleDto,
  ) {
    return this.employeesService.createJobTitle(user.hospitalId, dto);
  }

  @Patch('org/job-titles/:id')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage', 'departments:manage')
  updateJobTitle(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateJobTitleDto,
  ) {
    return this.employeesService.updateJobTitle(user.hospitalId, id, dto);
  }

  @Delete('org/job-titles/:id')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage', 'departments:manage')
  deleteJobTitle(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeesService.deleteJobTitle(user.hospitalId, id);
  }

  // --- Parameterized Single Employee Endpoints ---

  @Get('employees/:id')
  @Permissions(
    'hr:employees:view',
    'hr:employees:manage',
    'hr:view',
    'hr:manage',
  )
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeesService.findOne(user.hospitalId, id);
  }

  @Patch('employees/:id')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
    @Req() req: Request,
  ) {
    return this.employeesService.update(user.hospitalId, id, user.sub, dto, {
      ipAddress: req.ip,
      clientName: req.get('user-agent'),
    });
  }

  @Delete('employees/:id')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage')
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.employeesService.remove(user.hospitalId, id, user.sub, {
      ipAddress: req.ip,
      clientName: req.get('user-agent'),
    });
  }

  @Post('employees/:id/link-user')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage', 'admin:users:manage')
  linkUser(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LinkEmployeeUserDto,
    @Req() req: Request,
  ) {
    return this.employeesService.linkUser(user.hospitalId, id, user.sub, dto, {
      ipAddress: req.ip,
      clientName: req.get('user-agent'),
    });
  }

  @Post('employees/:id/unlink-user')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage', 'admin:users:manage')
  unlinkUser(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.employeesService.unlinkUser(user.hospitalId, id, user.sub, {
      ipAddress: req.ip,
      clientName: req.get('user-agent'),
    });
  }

  // --- Qualifications, Training Courses, HR Actions ---

  @Post('employees/:id/qualifications')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage')
  addQualification(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEmployeeQualificationDto,
  ) {
    return this.employeesService.addQualification(user.hospitalId, id, dto);
  }

  @Delete('employees/:id/qualifications/:qid')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage')
  removeQualification(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Param('qid', ParseIntPipe) qid: number,
  ) {
    return this.employeesService.removeQualification(user.hospitalId, id, qid);
  }

  @Post('employees/:id/training-courses')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage')
  addTrainingCourse(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEmployeeTrainingCourseDto,
  ) {
    return this.employeesService.addTrainingCourse(user.hospitalId, id, dto);
  }

  @Delete('employees/:id/training-courses/:cid')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage')
  removeTrainingCourse(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Param('cid', ParseIntPipe) cid: number,
  ) {
    return this.employeesService.removeTrainingCourse(user.hospitalId, id, cid);
  }

  @Get('employees/:id/actions')
  @Permissions(
    'hr:employees:view',
    'hr:employees:manage',
    'hr:view',
    'hr:manage',
  )
  listActions(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeesService.listActions(user.hospitalId, id);
  }

  @Post('employees/:id/actions')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage')
  createAction(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEmployeeActionDto,
    @Req() req: Request,
  ) {
    return this.employeesService.createAction(
      user.hospitalId,
      id,
      user.sub,
      dto,
      { ipAddress: req.ip, clientName: req.get('user-agent') },
    );
  }

  // --- Encrypted Employee Documents (SEC05) ---

  @Post('employees/:id/documents')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_HR_DOC_UPLOAD_BYTES },
    }),
  )
  uploadDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: UploadedAttachmentFile | undefined,
    @Body() dto: CreateEmployeeDocumentMetaDto,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('ملف الوثيقة مطلوب.');
    }
    return this.employeesService.uploadDocument(
      user.hospitalId,
      id,
      user.sub,
      file,
      dto,
      { ipAddress: req.ip, clientName: req.get('user-agent') },
    );
  }

  @Get('employees/:id/documents/:docId/download')
  @Permissions(
    'hr:employees:view',
    'hr:employees:manage',
    'hr:view',
    'hr:manage',
  )
  async downloadDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Param('docId', ParseIntPipe) docId: number,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, mimeType, originalName } =
      await this.employeesService.downloadDocument(
        user.hospitalId,
        id,
        docId,
        user.sub,
        { ipAddress: req.ip, clientName: req.get('user-agent') },
      );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    const safeName = encodeURIComponent(originalName || `document-${docId}`);
    return new StreamableFile(buffer, {
      type: mimeType,
      disposition: `attachment; filename*=UTF-8''${safeName}`,
    });
  }

  @Delete('employees/:id/documents/:docId')
  @AuditInTransaction()
  @Permissions('hr:employees:manage', 'hr:manage')
  removeDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Param('docId', ParseIntPipe) docId: number,
    @Req() req: Request,
  ) {
    return this.employeesService.removeDocument(
      user.hospitalId,
      id,
      docId,
      user.sub,
      { ipAddress: req.ip, clientName: req.get('user-agent') },
    );
  }
}
