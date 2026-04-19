import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || "http://localhost:5173",
    supportFile: "cypress/support/e2e.js",
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    viewportWidth: 1440,
    viewportHeight: 900,
    retries: {
      runMode: 2,
      openMode: 0,
    },
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
});
