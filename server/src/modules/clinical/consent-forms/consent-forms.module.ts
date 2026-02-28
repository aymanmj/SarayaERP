import { Module } from '@nestjs/common';
import { ConsentFormsService } from './consent-forms.service';
import { ConsentFormsController } from './consent-forms.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ConsentFormsController],
  providers: [ConsentFormsService],
  exports: [ConsentFormsService],
})
export class ConsentFormsModule {}
