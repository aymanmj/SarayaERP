/// <reference types="cypress" />

describe("Insurance claims workflow", () => {
  it("submits pending claims in batch", () => {
    cy.intercept("GET", "**/api/insurance/providers*", {
      statusCode: 200,
      body: [{ id: 11, name: "National Insurance" }],
    }).as("loadProviders");

    cy.intercept("GET", "**/api/insurance/claims?*", (req) => {
      expect(req.query.status).to.equal("PENDING");

      req.reply({
        statusCode: 200,
        body: [
          {
            id: 4501,
            invoiceNumber: "INV-4501",
            createdAt: "2026-04-18T10:00:00.000Z",
            totalAmount: 400,
            insuranceShare: 320,
            patientShare: 80,
            claimStatus: "PENDING",
            patient: {
              fullName: "Nour Salah",
              mrn: "MRN-4501",
              insuranceMemberId: "INS-001",
            },
            insuranceProvider: { name: "National Insurance" },
          },
        ],
      });
    }).as("loadPendingClaims");

    cy.intercept("POST", "**/api/insurance/claims/update-status", (req) => {
      expect(req.body).to.deep.equal({
        invoiceIds: [4501],
        status: "SUBMITTED",
      });

      req.reply({
        statusCode: 200,
        body: { success: true },
      });
    }).as("submitClaims");

    cy.on("window:confirm", () => true);

    cy.visitAuthenticated("/insurance/claims");
    cy.wait(["@loadProviders", "@loadPendingClaims"]);

    cy.getByTestId("insurance-claims-page").should("be.visible");
    cy.getByTestId("claim-checkbox-4501").check();
    cy.getByTestId("claims-submit-selected").click();

    cy.wait("@submitClaims");
    cy.contains("تم تحديث الحالة بنجاح.").should("be.visible");
  });

  it("rejects submitted claims with a documented reason", () => {
    cy.intercept("GET", "**/api/insurance/providers*", {
      statusCode: 200,
      body: [{ id: 11, name: "National Insurance" }],
    }).as("loadProviders");

    cy.intercept("GET", "**/api/insurance/claims?*", (req) => {
      const status = req.query.status;

      if (status === "SUBMITTED") {
        req.alias = "loadSubmittedClaims";
        req.reply({
          statusCode: 200,
          body: [
            {
              id: 4502,
              invoiceNumber: "INV-4502",
              createdAt: "2026-04-18T11:00:00.000Z",
              totalAmount: 600,
              insuranceShare: 500,
              patientShare: 100,
              claimStatus: "SUBMITTED",
              patient: {
                fullName: "Rana Fathi",
                mrn: "MRN-4502",
                insuranceMemberId: "INS-002",
              },
              insuranceProvider: { name: "National Insurance" },
            },
          ],
        });
        return;
      }

      req.alias = "loadInitialPendingClaims";
      req.reply({
        statusCode: 200,
        body: [],
      });
    });

    cy.intercept("POST", "**/api/insurance/claims/update-status", (req) => {
      expect(req.body).to.deep.equal({
        invoiceIds: [4502],
        status: "REJECTED",
        rejectionReason: "Missing signed authorization",
      });

      req.reply({
        statusCode: 200,
        body: { success: true },
      });
    }).as("rejectClaims");

    cy.visitAuthenticated("/insurance/claims");
    cy.wait(["@loadProviders", "@loadInitialPendingClaims"]);

    cy.getByTestId("insurance-status-filter").select("SUBMITTED");
    cy.wait("@loadSubmittedClaims");
    cy.getByTestId("claim-checkbox-4502").check();
    cy.getByTestId("claims-reject-selected").click();
    cy.getByTestId("claims-reject-modal").should("be.visible");
    cy.getByTestId("claims-reject-reason").type("Missing signed authorization");
    cy.getByTestId("claims-confirm-reject").click();

    cy.wait("@rejectClaims");
    cy.contains("تم تسجيل الرفض بنجاح.").should("be.visible");
  });
});
