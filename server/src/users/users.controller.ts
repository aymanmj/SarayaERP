import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('users:manage')
  async findAll(@Req() req: any) {
    return this.usersService.findAll(req.user.hospitalId);
  }

  @Post()
  @Permissions('users:manage')
  async create(@Req() req: any, @Body() body: any) {
    return this.usersService.create(req.user.hospitalId, body);
  }

  @Patch(':id')
  @Permissions('users:manage')
  async update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.usersService.update(req.user.hospitalId, id, body);
  }

  @Get('doctors-list')
  @Permissions('users:view')
  async getDoctors(@CurrentUser() user: JwtPayload) {
    return this.usersService.findActiveDoctors(user.hospitalId);
  }

  @Get('staff-list')
  @Permissions('users:view')
  async getStaff(@CurrentUser() user: JwtPayload) {
    return this.usersService.findActiveStaff(user.hospitalId);
  }

  @Get('roles')
  @Permissions('users:view')
  async getRoles() {
    return this.usersService.findAllRoles();
  }

  // ✅ [NEW] Get roles with their assigned permissions
  @Get('roles-permissions')
  @Permissions('users:view')
  async getRolesWithPermissions() {
    return this.usersService.findAllRolesWithPermissions();
  }

  // ✅ [NEW] Get all available permissions
  @Get('permissions')
  @Permissions('users:view')
  async getPermissions() {
    return this.usersService.findAllPermissions();
  }

  // ✅ [NEW] Update role permissions
  @Patch('roles/:id/permissions')
  @Permissions('users:manage')
  async updateRolePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { permissionIds: number[] },
  ) {
    return this.usersService.updateRolePermissions(id, body.permissionIds);
  }

  // ✅ [Diagnostic] Fix Doctor Permissions
  // Allow simplified access for debugging
  @Post('fix-permissions')
  @Permissions('users:manage')
  async fixPermissions() {
    if (process.env.ENABLE_DIAGNOSTIC_ENDPOINTS !== 'true') {
      throw new ForbiddenException('Diagnostic endpoints are disabled');
    }

    return this.usersService.fixDoctorPermissions();
  }

  // ✅ [Diagnostic] Fix Nurse Permissions
  @Post('fix-nurse-permissions')
  @Permissions('users:manage')
  async fixNursePermissions() {
    if (process.env.ENABLE_DIAGNOSTIC_ENDPOINTS !== 'true') {
      throw new ForbiddenException('Diagnostic endpoints are disabled');
    }

    return this.usersService.fixNursePermissions();
  }
}
