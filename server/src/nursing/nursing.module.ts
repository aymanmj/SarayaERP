import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NursingService } from './nursing.service';
import { NursingController } from './nursing.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NursingGateway } from '../websocket/nursing.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule],
  controllers: [NursingController],
  providers: [NursingService, NursingGateway],
})
export class NursingModule {}
