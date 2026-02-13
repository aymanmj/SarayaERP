import { PartialType } from '@nestjs/mapped-types';
import { CreateObstetricHistoryDto } from './create-obstetric-history.dto';

export class UpdateObstetricHistoryDto extends PartialType(CreateObstetricHistoryDto) {}
