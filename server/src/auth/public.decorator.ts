// src/auth/public.decorator.ts
// Decorator to mark endpoints as public (skip authentication)

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
