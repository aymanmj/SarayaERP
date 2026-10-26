# Production secret validation

`StartupSecurityValidator` refuses production startup when `JWT_SECRET` or
`ENCRYPTION_KEY` is missing, blank, a known placeholder, or shorter than 32
characters. It reports the variable name without printing its value.
This is a minimum configuration check, not proof of cryptographic entropy.
Development continues with warnings for missing or unsafe configuration.

Generate unique random secrets for new installations. For example, generate a
JWT signing secret with `openssl rand -hex 32` and store it through the existing
deployment secret provisioning process. Do not commit secret values.

## Existing installations

- Audit configuration before deploying this change: an installation using a weak
  value will now stop at startup instead of accepting it silently.
- JWT signing key changes must follow the existing token/key rotation process.
- **Do not replace `ENCRYPTION_KEY` or `ENCRYPTION_SALT` on an existing database
  without a tested data migration.** Both participate in deriving the encryption
  key. Changing either can make patient data unreadable.
- The legacy salt warning remains non-blocking to preserve compatibility; this
  patch does not rotate secrets, change encryption, or rewrite patient records.
- A Telegram token disclosed outside its intended secret store must be revoked
  with the provider and replaced in deployment configuration. Removing a local
  copy alone does not revoke it.

Verification: `npm test -- --runInBand src/common/security/startup-security.validator.spec.ts`
from `server/`.
