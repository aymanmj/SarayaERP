// server/src/common/http/validation-pipe.config.ts
import { BadRequestException, ValidationPipe } from '@nestjs/common';

export function createAppValidationPipe(isProduction: boolean): ValidationPipe {
  return new ValidationPipe({
    whitelist: true, // Strip unknown properties
    transform: true, // Auto-transform types
    forbidNonWhitelisted: isProduction,
    transformOptions: {
      enableImplicitConversion: true,
    },
    // Validation error formatting
    exceptionFactory: (errors) => {
      const messages = errors.map((error) => ({
        field: error.property,
        constraints: Object.values(error.constraints || {}),
      }));
      return new BadRequestException(JSON.stringify(messages));
    },
  });
}
