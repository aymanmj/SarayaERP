const defaultUser = {
  id: 1,
  fullName: "Cypress Test User",
  username: "cypress.admin",
  hospitalId: 1,
  roles: ["ADMIN"],
  permissions: [
    "admissions.manage",
    "billing.collect",
    "pharmacy.dispense",
    "nursing.execute",
    "insurance.claims.manage",
  ],
};

const defaultLicense = {
  isValid: true,
  machineId: "cypress-machine",
  hospitalName: "Saraya Test Hospital",
  plan: "enterprise",
  maxUsers: 500,
  modules: ["CLINICAL", "FINANCE", "PHARMACY", "NURSING", "INSURANCE"],
};

Cypress.Commands.add("getByTestId", (testId, ...args) => {
  return cy.get(`[data-testid="${testId}"]`, ...args);
});

Cypress.Commands.add("visitAuthenticated", (path, options = {}) => {
  const user = { ...defaultUser, ...(options.user || {}) };
  const license = { ...defaultLicense, ...(options.license || {}) };

  cy.intercept("GET", "**/api/license/status*", {
    statusCode: 200,
    body: license,
  }).as("licenseStatus");

  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.setItem("auth_status", "true");
      win.localStorage.setItem("user_info", JSON.stringify(user));
      win.localStorage.setItem("auth_token", "cypress-token");

      if (typeof options.onBeforeLoad === "function") {
        options.onBeforeLoad(win);
      }
    },
  });

  cy.wait("@licenseStatus");
});
