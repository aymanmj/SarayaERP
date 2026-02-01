import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LicensingModule } from '../licensing/licensing.module';

@Module({
  imports: [PrismaModule, LicensingModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
