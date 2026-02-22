import {
  Body,
  Controller,
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
import { RolesGuard } from '../auth/roles.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.type';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('ADMIN')
  async findAll(@Req() req: any) {
    return this.usersService.findAll(req.user.hospitalId);
  }

  @Post()
  @Roles('ADMIN')
  async create(@Req() req: any, @Body() body: any) {
    return this.usersService.create(req.user.hospitalId, body);
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.usersService.update(req.user.hospitalId, id, body);
  }

  @Get('doctors-list')
  @Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTION', 'CASHIER')
  async getDoctors(@CurrentUser() user: JwtPayload) {
    return this.usersService.findActiveDoctors(user.hospitalId);
  }

  @Get('roles')
  @Permissions('ROLE_VIEW')
  async getRoles() {
    return this.usersService.findAllRoles();
  }

  // ✅ [NEW] Get roles with their assigned permissions
  @Get('roles-permissions')
  @Permissions('ROLE_VIEW')
  async getRolesWithPermissions() {
    return this.usersService.findAllRolesWithPermissions();
  }

  // ✅ [NEW] Get all available permissions
  @Get('permissions')
  @Permissions('ROLE_VIEW')
  async getPermissions() {
    return this.usersService.findAllPermissions();
  }

  // ✅ [NEW] Update role permissions
  @Patch('roles/:id/permissions')
  @Permissions('ROLE_MANAGE')
  async updateRolePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { permissionIds: number[] },
  ) {
    return this.usersService.updateRolePermissions(id, body.permissionIds);
  }

  // ✅ [Diagnostic] Fix Doctor Permissions
  // Allow simplified access for debugging
  @Post('fix-permissions')
  async fixPermissions() {
      return this.usersService.fixDoctorPermissions();
  }

  // ✅ [Diagnostic] Fix Nurse Permissions
  @Post('fix-nurse-permissions')
  async fixNursePermissions() {
      return this.usersService.fixNursePermissions();
  }
}
