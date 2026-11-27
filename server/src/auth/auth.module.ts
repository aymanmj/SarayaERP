import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { RtStrategy } from './rt.strategy';
import { LoginLockoutStore } from '../common/security/redis-throttler.storage';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule, JwtModule.register({})],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const secret =
          config.get<string>('JWT_SECRET') ?? 'dev_secret_change_me';

        const expiresRaw = config.get<string>('JWT_EXPIRES_IN');
        // نخليها بالثواني، مثلاً 86400 = يوم
        const expiresIn = expiresRaw ? Number(expiresRaw) : 60 * 60 * 24; // 1 يوم

        return {
          secret,
          signOptions: {
            expiresIn,
          },
        };
      },
    }),
  ],
  providers: [AuthService, JwtStrategy, RtStrategy, LoginLockoutStore],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, JwtStrategy],
})
export class AuthModule {}
