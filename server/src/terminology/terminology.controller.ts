import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TerminologyService } from './terminology.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { TerminologySystem } from '@prisma/client';

@Controller('terminology')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TerminologyController {
  constructor(private terminologyService: TerminologyService) {}

  @Permissions('terminology:view')
  @Get(':system/search')
  async search(
    @Param('system', new ParseEnumPipe(TerminologySystem))
    system: TerminologySystem,
    @Query('q') query: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    if (!query || query.trim().length < 2) {
      throw new BadRequestException(
        'Query parameter "q" must be at least 2 characters',
      );
    }

    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    return this.terminologyService.searchConcepts(
      system,
      query.trim(),
      boundedLimit,
    );
  }

  @Permissions('terminology:view')
  @Get(':system/code/:code')
  async getByCode(
    @Param('system', new ParseEnumPipe(TerminologySystem))
    system: TerminologySystem,
    @Param('code') code: string,
  ) {
    return this.terminologyService.getConceptByCode(system, code);
  }
}

