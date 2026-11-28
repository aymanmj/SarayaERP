// server/src/common/http/body-parsers.config.ts
import type { INestApplication } from '@nestjs/common';
import express from 'express';

export const JSON_BODY_LIMIT = '10mb';
export const URLENCODED_BODY_LIMIT = '10mb';
export const ICLOCK_TEXT_BODY_LIMIT = '2mb';

/**
 * Registers HTTP body parsers explicitly after creating the Nest app with
 * `{ bodyParser: false }` so NestJS does not mount Express's default 100kb
 * JSON limit ahead of bulk-import endpoints while preserving ZKTeco `/iclock`
 * plain-text payload parsing.
 */
export function registerAppBodyParsers(app: INestApplication): void {
  app.use(
    '/iclock',
    express.text({ type: 'text/plain', limit: ICLOCK_TEXT_BODY_LIMIT }),
  );
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: URLENCODED_BODY_LIMIT }));
}
