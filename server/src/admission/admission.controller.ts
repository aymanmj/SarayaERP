import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { AdmissionService } from './admission.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Sensitive } from '../audit/audit.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { CreateAdmissionDto } from './dto/create-admission.dto';
import { UpdateAdmissionDto } from './dto/update-admission.dto';
import { CreateDischargePlanningDto } from './dto/create-discharge-planning.dto';
import { CreateBedTransferDto } from './dto/create-bed-transfer.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Admissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('admission:view')
@Controller('admissions')
export class AdmissionController {
  constructor(private readonly admissionService: AdmissionService) {}

  @Get('test')
  getTest() {
    return { message: 'Admission API is working!', timestamp: new Date() };
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('admission:view')
  @ApiOperation({ summary: 'List admissions' })
  @ApiResponse({
    status: 200,
    description: 'Admissions retrieved successfully',
  })
  async listAdmissions(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('status') status: string,
    @Query('wardId') wardId: number,
    @Query('departmentId') departmentId: number,
    @Query('doctorId') doctorId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admissionService.listAdmissions(user.hospitalId, {
      page,
      limit,
      status: status as any,
      wardId,
      departmentId,
      doctorId,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('admission:view')
  @ApiOperation({ summary: 'Get admission by ID' })
  @ApiResponse({ status: 200, description: 'Admission retrieved successfully' })
  async getAdmissionById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admissionService.getAdmissionById(user.hospitalId, id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('admission:manage')
  @Sensitive('CREATE_ADMISSION')
  @ApiOperation({ summary: 'Create a new admission' })
  @ApiResponse({ status: 201, description: 'Admission created successfully' })
  async createAdmission(
    @Body() dto: CreateAdmissionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admissionService.createAdmission(
      user.hospitalId,
      dto,
      user.sub,
    );
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('admission:manage')
  @Sensitive('UPDATE_ADMISSION')
  @ApiOperation({ summary: 'Update admission' })
  @ApiResponse({ status: 200, description: 'Admission updated successfully' })
  async updateAdmission(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdmissionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admissionService.updateAdmission(
      user.hospitalId,
      id,
      dto,
      user.sub,
    );
  }

  @Post(':id/discharge')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('admission:manage')
  @Sensitive('DISCHARGE_PATIENT')
  @ApiOperation({ summary: 'Discharge patient' })
  @ApiResponse({ status: 200, description: 'Patient discharged successfully' })
  async dischargePatient(
    @Param('id', ParseIntPipe) id: number,
    @Body() dischargeData: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admissionService.dischargePatient(
      user.hospitalId,
      id,
      dischargeData,
      user.sub,
    );
  }

  @Get(':id/discharge-readiness')
  @Permissions('admission:view')
  @Sensitive('VIEW_DISCHARGE_READINESS')
  async dischargeReadiness(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admissionService.checkDischargeReadiness(user.hospitalId, id);
  }

  @Post(':id/discharge-planning')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('admission:manage')
  @Sensitive('CREATE_DISCHARGE_PLANNING')
  @ApiOperation({ summary: 'Create discharge planning' })
  @ApiResponse({
    status: 201,
    description: 'Discharge planning created successfully',
  })
  async createDischargePlanning(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateDischargePlanningDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admissionService.createDischargePlanning(
      user.hospitalId,
      id,
      dto,
      user.sub,
    );
  }

  @Delete(':id/discharge-planning')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('admission:manage')
  @Sensitive('DELETE_DISCHARGE_PLANNING')
  @ApiOperation({ summary: 'Delete discharge planning (PENDING only)' })
  @ApiResponse({
    status: 200,
    description: 'Discharge planning deleted successfully',
  })
  async deleteDischargePlanning(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admissionService.deleteDischargePlanning(user.hospitalId, id);
  }

  @Get('discharge-planning/list')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('admission:view')
  @ApiOperation({ summary: 'List discharge plans' })
  async listDischargePlans(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('status') status: string,
    @Query('departmentId') departmentId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admissionService.listDischargePlans(user.hospitalId, {
      page,
      limit,
      status,
      departmentId,
    });
  }

  @Patch('discharge-planning/:planId/status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('admission:manage')
  @Sensitive('UPDATE_DISCHARGE_PLANNING')
  @ApiOperation({ summary: 'Update discharge plan status' })
  async updateDischargePlanStatus(
    @Param('planId', ParseIntPipe) planId: number,
    @Body('status') status: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!status) {
      throw new BadRequestException('Status is required');
    }
    return this.admissionService.updateDischargePlanStatus(
      user.hospitalId,
      planId,
      status,
    );
  }

  @Post(':id/bed-transfer/request')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('admission:manage')
  @Sensitive('REQUEST_BED_TRANSFER')
  @ApiOperation({ summary: 'Request bed transfer' })
  @ApiResponse({
    status: 201,
    description: 'Bed transfer requested successfully',
  })
  async requestBedTransfer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateBedTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admissionService.requestBedTransfer(
      user.hospitalId,
      id,
      dto,
      user.sub,
    );
  }

  @Post('transfers/:id/approve')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('inpatient:transfers:approve')
  @Sensitive('APPROVE_BED_TRANSFER')
  @ApiOperation({ summary: 'Approve and execute bed transfer' })
  @ApiResponse({
    status: 200,
    description: 'Bed transfer approved and completed successfully',
  })
  async approveBedTransfer(
    @Param('id', ParseIntPipe) transferId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admissionService.approveBedTransfer(
      transferId,
      user.hospitalId,
      user.sub,
    );
  }

  @Post('bed-transfer/:transferId/complete')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('inpatient:transfers:approve')
  @Sensitive('COMPLETE_BED_TRANSFER')
  @ApiOperation({ summary: 'Complete bed transfer' })
  @ApiResponse({
    status: 200,
    description: 'Bed transfer completed successfully',
  })
  async completeBedTransfer(
    @Param('transferId', ParseIntPipe) transferId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admissionService.completeBedTransfer(
      user.hospitalId,
      transferId,
      user.sub,
    );
  }

  @Post('bed-transfer/:transferId/cancel')
  @Permissions('admission:manage', 'inpatient:transfers:approve')
  @Sensitive('CANCEL_BED_TRANSFER')
  async cancelBedTransfer(
    @Param('transferId', ParseIntPipe) transferId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admissionService.cancelBedTransfer(user.hospitalId, transferId);
  }

  @Get('statistics/overview')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('admission:view')
  @ApiOperation({ summary: 'Get admission statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getAdmissionStatistics(
    @Query('period') period: string = 'today',
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admissionService.getAdmissionStatistics(
      user.hospitalId,
      period,
    );
  }

  @Get('reports/bed-occupancy')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('admission:view')
  @ApiOperation({ summary: 'Get bed occupancy report' })
  @ApiResponse({
    status: 200,
    description: 'Bed occupancy report retrieved successfully',
  })
  async getBedOccupancyReport(@CurrentUser() user: JwtPayload) {
    return this.admissionService.getBedOccupancyReport(user.hospitalId);
  }

  @Post('quick-admission')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('admission:manage')
  @Sensitive('QUICK_ADMISSION')
  @ApiOperation({ summary: 'Quick admission for emergency cases' })
  @ApiResponse({
    status: 201,
    description: 'Quick admission completed successfully',
  })
  async quickAdmission(
    @Body()
    dto: {
      patientId: number;
      bedId: number;
      admittingDoctorId: number;
      departmentId: number;
      admissionReason: string;
      primaryDiagnosis?: string;
    },
    @CurrentUser() user: JwtPayload,
  ) {
    const admissionData: CreateAdmissionDto = {
      ...dto,
      primaryPhysicianId: dto.admittingDoctorId,
      admissionType: 'ELECTIVE' as any,
      priority: 'MEDIUM' as any,
      isEmergency: true,
      isolationRequired: false,
    };

    return this.admissionService.createAdmission(
      user.hospitalId,
      admissionData,
      user.sub,
    );
  }
}
