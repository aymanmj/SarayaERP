declare module 'bcrypt' {
  export function genSalt(rounds?: number, minor?: 'a' | 'b'): Promise<string>;
  export function genSaltSync(rounds?: number, minor?: 'a' | 'b'): string;
  export function hash(
    data: string | Buffer,
    saltOrRounds: string | number,
  ): Promise<string>;
  export function hashSync(
    data: string | Buffer,
    saltOrRounds: string | number,
  ): string;
  export function compare(
    data: string | Buffer,
    encrypted: string,
  ): Promise<boolean>;
  export function compareSync(
    data: string | Buffer,
    encrypted: string,
  ): boolean;
  export function getRounds(encrypted: string): number;
}

declare module 'passport-jwt' {
  import type { Request } from 'express';

  export type JwtFromRequestFunction<T = Request> = (req: T) => string | null;

  export type SecretOrKeyProvider = (
    request: Request,
    rawJwtToken: string,
    done: (err: unknown, secretOrKey?: string | Buffer) => void,
  ) => void | Promise<void>;

  export type VerifiedCallback = (
    error: unknown,
    user?: unknown,
    info?: unknown,
  ) => void;

  export type VerifyCallback = (
    payload: unknown,
    done: VerifiedCallback,
  ) => void;

  export type VerifyCallbackWithRequest = (
    req: Request,
    payload: unknown,
    done: VerifiedCallback,
  ) => void;

  export interface StrategyOptionsBase {
    jwtFromRequest: JwtFromRequestFunction;
    secretOrKey?: string | Buffer;
    secretOrKeyProvider?: SecretOrKeyProvider;
    issuer?: string | string[];
    audience?: string | string[];
    algorithms?: string[];
    ignoreExpiration?: boolean;
    jsonWebTokenOptions?: Record<string, unknown>;
  }

  export interface StrategyOptionsWithoutRequest extends StrategyOptionsBase {
    passReqToCallback?: false;
  }

  export interface StrategyOptionsWithRequest extends StrategyOptionsBase {
    passReqToCallback: true;
  }

  export type StrategyOptions =
    | StrategyOptionsWithoutRequest
    | StrategyOptionsWithRequest;

  export const ExtractJwt: {
    fromHeader(headerName: string): JwtFromRequestFunction;
    fromBodyField(fieldName: string): JwtFromRequestFunction;
    fromUrlQueryParameter(paramName: string): JwtFromRequestFunction;
    fromAuthHeaderWithScheme(authScheme: string): JwtFromRequestFunction;
    fromAuthHeaderAsBearerToken(): JwtFromRequestFunction;
    fromExtractors(
      extractors: JwtFromRequestFunction[],
    ): JwtFromRequestFunction;
  };

  export class Strategy {
    name: string;
    constructor(opt: StrategyOptionsWithoutRequest, verify: VerifyCallback);
    constructor(
      opt: StrategyOptionsWithRequest,
      verify: VerifyCallbackWithRequest,
    );
    authenticate(req: Request, options?: unknown): void;
  }
}
