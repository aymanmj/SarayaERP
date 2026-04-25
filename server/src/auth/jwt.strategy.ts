import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import type { Request } from 'express';
import { VaultService } from '../common/vault/vault.service';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(
      config: ConfigService, 
      private readonly cls: ClsService,
      private readonly vaultService: VaultService
    ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          if (req && req.cookies) {
            return req.cookies['Authentication'];
          }
          return null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      issuer: 'saraya-staff', // Enforce Token Isolation
      secretOrKeyProvider: async (request: any, rawJwtToken: string, done: any) => {
        try {
          const decoded = jwt.decode(rawJwtToken, { complete: true }) as any;
          const kid = decoded?.header?.kid;
          const secret = await this.vaultService.getKeyOrSecret(kid);
          done(null, secret);
        } catch (error) {
          done(error);
        }
      },
    });
  }

  async validate(payload: any) {
    if (this.cls.isActive()) {
      this.cls.set('userId', payload.sub);
      this.cls.set('hospitalId', payload.hospitalId);
      this.cls.set('organizationId', payload.organizationId || null);
      this.cls.set('isSuperAdmin', payload.isSuperAdmin || false);
      this.cls.set('user', payload);
    }
    return payload;
  }
}

// import { Injectable } from '@nestjs/common';
// import { PassportStrategy } from '@nestjs/passport';
// import { ExtractJwt, Strategy } from 'passport-jwt';
// import { ConfigService } from '@nestjs/config';
// import { JwtPayload } from './jwt-payload.type';

// @Injectable()
// export class JwtStrategy extends PassportStrategy(Strategy) {
//   constructor(config: ConfigService) {
//     super({
//       jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
//       ignoreExpiration: false,
//       secretOrKey: config.get<string>('JWT_SECRET'),
//     });
//   }

//   async validate(payload: JwtPayload) {
//     // هنا يرجع كـ request.user
//     return payload;
//   }
// }
