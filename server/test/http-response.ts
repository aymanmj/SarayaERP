import type { Response } from 'supertest';
export function responseBody<T extends object>(response: Response): T {
  const value: unknown = response.body;
  if (value === null || typeof value !== 'object')
    throw new Error(
      `Expected JSON response object, received HTTP ${response.status}`,
    );
  return value as T;
}
