import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Delete,
  Patch,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { DeveloperService } from './developer.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('integration:manage') // Enforce integration manage permission for developer portal tasks
@Controller('integration/developer')
export class DeveloperController {
  constructor(private developerService: DeveloperService) {}

  @Post('apps')
  async registerApp(
    @Req() req: any,
    @Body() body: { name: string; redirectUris: string[] },
  ) {
    return this.developerService.registerApp(
      req.user.hospitalId,
      body.name,
      body.redirectUris,
    );
  }

  @Get('apps')
  async listApps(@Req() req: any) {
    return this.developerService.listApps(req.user.hospitalId);
  }

  @Patch('apps/:id')
  async updateApp(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: { name?: string; redirectUris?: string[]; isActive?: boolean },
  ) {
    return this.developerService.updateApp(id, req.user.hospitalId, body);
  }

  @Delete('apps/:id')
  async deleteApp(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.developerService.deleteApp(id, req.user.hospitalId);
  }

  @Post('apps/:id/scopes')
  async addScope(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { scope: string },
  ) {
    return this.developerService.addScope(id, req.user.hospitalId, body.scope);
  }

  @Delete('apps/:id/scopes/:scopeId')
  async removeScope(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('scopeId', ParseIntPipe) scopeId: number,
  ) {
    return this.developerService.removeScope(id, req.user.hospitalId, scopeId);
  }

  @Post('apps/:id/keys')
  async generateApiKey(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; expiresDays?: number },
  ) {
    return this.developerService.generateApiKey(
      id,
      req.user.hospitalId,
      body.name,
      body.expiresDays,
    );
  }

  @Delete('apps/:id/keys/:keyId')
  async revokeApiKey(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('keyId', ParseIntPipe) keyId: number,
  ) {
    return this.developerService.revokeApiKey(id, req.user.hospitalId, keyId);
  }
}
