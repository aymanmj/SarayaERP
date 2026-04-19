export enum SystemFeature {
  // Core / Default modules (Always in Standard)
  LAB = 'LAB',
  RADIOLOGY = 'RADIOLOGY',
  PHARMACY = 'PHARMACY',
  RECEPTION = 'RECEPTION',
  BILLING = 'BILLING',

  // Advanced modules (Requires Enterprise or specific add-on)
  CDSS_ENGINE = 'CDSS_ENGINE',
  FHIR_INTEGRATION = 'FHIR_INTEGRATION',
  API_GATEWAY = 'API_GATEWAY',
  ADVANCED_ANALYTICS = 'ADVANCED_ANALYTICS',
  TELEMETRY = 'TELEMETRY',
  HR = 'HR',
  ASSETS = 'ASSETS',
  ACCOUNTS = 'ACCOUNTS', // General accounting
  OBGYN = 'OBGYN',       // Specialty
}
