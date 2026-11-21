import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import {
  disposalQuantityPattern,
  RecallDisposalService,
} from './recall-disposal.service';

class DisposalRequestDto {
  @IsInt()
  @Min(1)
  isolationId!: number;

  @IsUUID('4')
  requestId!: string;

  @Matches(disposalQuantityPattern)
  quantity!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}

class DisposalDecisionDto {
  @IsIn(['APPROVE', 'REJECT', 'CANCEL'])
  decision!: 'APPROVE' | 'REJECT' | 'CANCEL';

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note!: string;
}

class DisposalEvidenceDto {
  @Matches(disposalQuantityPattern)
  quantity!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  evidenceReference!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  performedBy!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.+(?:Z|[+-]\d{2}:\d{2})$/)
  performedAt!: string;
}

class DisposalReconciliationDto {
  @Matches(disposalQuantityPattern)
  countedRemaining!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reference!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note!: string;
}

class DisposalInvestigationDto {
  @IsUUID('4')
  requestId!: string;

  @Matches(disposalQuantityPattern)
  countedRemaining!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  countReference!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  findings!: string;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  version!: number;

  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(2147483647, { each: true })
  movementIds!: number[];
}

class DisposalInvestigationDecisionDto {
  @IsIn(['RESOLVE', 'ESCALATE'])
  decision!: 'RESOLVE' | 'ESCALATE';

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note!: string;
}

@Controller('inventory/stock/:stockId/recall-disposals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RecallDisposalController {
  constructor(private readonly service: RecallDisposalService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Permissions(
    'inventory:manage',
    'inventory:recall-disposal:review',
    'inventory:recall-disposal:post',
  )
  list(
    @CurrentUser() actor: JwtPayload,
    @Param('stockId', ParseIntPipe) stockId: number,
    @Query('before', new ParseIntPipe({ optional: true })) before?: number,
  ) {
    return this.service.list(actor, stockId, before);
  }

  @Post()
  @Permissions('inventory:manage')
  request(
    @CurrentUser() actor: JwtPayload,
    @Param('stockId', ParseIntPipe) stockId: number,
    @Body() input: DisposalRequestDto,
  ) {
    return this.service.request(actor, stockId, input);
  }

  @Post(':id/review')
  @Permissions('inventory:recall-disposal:review')
  review(
    @CurrentUser() actor: JwtPayload,
    @Param('stockId', ParseIntPipe) stockId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() input: DisposalDecisionDto,
  ) {
    return this.service.review(actor, stockId, id, input);
  }

  @Post(':id/evidence')
  @Permissions('inventory:manage')
  evidence(
    @CurrentUser() actor: JwtPayload,
    @Param('stockId', ParseIntPipe) stockId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() input: DisposalEvidenceDto,
  ) {
    return this.service.evidence(actor, stockId, id, input);
  }

  @Post(':id/post')
  @Permissions('inventory:recall-disposal:post')
  post(
    @CurrentUser() actor: JwtPayload,
    @Param('stockId', ParseIntPipe) stockId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.post(actor, stockId, id);
  }

  @Post(':id/reconcile')
  @Permissions('inventory:recall-disposal:review')
  reconcile(
    @CurrentUser() actor: JwtPayload,
    @Param('stockId', ParseIntPipe) stockId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() input: DisposalReconciliationDto,
  ) {
    return this.service.reconcile(actor, stockId, id, input);
  }

  @Get(':id/investigations')
  @Header('Cache-Control', 'private, no-store')
  @Permissions('inventory:manage', 'inventory:recall-disposal:review')
  investigationHistory(
    @CurrentUser() actor: JwtPayload,
    @Param('stockId', ParseIntPipe) stockId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query('before', new ParseIntPipe({ optional: true })) before?: number,
  ) {
    return this.service.investigationHistory(actor, stockId, id, before);
  }

  @Post(':id/investigations')
  @Permissions('inventory:manage')
  submitInvestigation(
    @CurrentUser() actor: JwtPayload,
    @Param('stockId', ParseIntPipe) stockId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() input: DisposalInvestigationDto,
  ) {
    return this.service.submitInvestigation(actor, stockId, id, input);
  }

  @Post(':id/investigations/:investigationId/review')
  @Permissions('inventory:recall-disposal:review')
  reviewInvestigation(
    @CurrentUser() actor: JwtPayload,
    @Param('stockId', ParseIntPipe) stockId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('investigationId', ParseIntPipe) investigationId: number,
    @Body() input: DisposalInvestigationDecisionDto,
  ) {
    return this.service.reviewInvestigation(
      actor,
      stockId,
      id,
      investigationId,
      input,
    );
  }
}
