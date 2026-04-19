/// <reference types="cypress" />

describe("Nursing station workflow", () => {
  it("executes an active inpatient care-plan item", () => {
    cy.intercept("GET", "**/api/clinical/inpatient/all-patients*", {
      statusCode: 200,
      body: [
        {
          id: 800,
          patient: { id: 55, fullName: "Yousef Hassan", mrn: "MRN-800" },
          bedAssignments: [{ bed: { number: "12", ward: { name: "Ward B" } } }],
          carePlanItems: [
            {
              id: 1001,
              type: "MEDICATION",
              instruction: "Ceftriaxone 1g IV",
              frequency: "BID",
              status: "ACTIVE",
              createdAt: "2026-04-19T07:30:00.000Z",
              createdBy: { id: 1, fullName: "Dr. Samar" },
              executions: [],
            },
          ],
        },
      ],
    }).as("loadNursingPatients");

    cy.intercept("GET", "**/api/clinical/inpatient/encounters/800/care-plan*", {
      statusCode: 200,
      body: [
        {
          id: 1001,
          type: "MEDICATION",
          instruction: "Ceftriaxone 1g IV",
          frequency: "BID",
          status: "ACTIVE",
          createdAt: "2026-04-19T07:30:00.000Z",
          createdBy: { id: 1, fullName: "Dr. Samar" },
          executions: [],
        },
      ],
    }).as("loadCarePlan");

    cy.intercept("POST", "**/api/clinical/inpatient/care-plan/1001/execute", (req) => {
      expect(req.body).to.deep.equal({
        resultValue: "Administered on schedule",
        note: "Patient tolerated medication well",
      });

      req.reply({
        statusCode: 201,
        body: { id: 3001 },
      });
    }).as("executeCarePlan");

    cy.visitAuthenticated("/nursing");
    cy.wait("@loadNursingPatients");

    cy.getByTestId("nursing-page").should("be.visible");
    cy.getByTestId("nursing-encounter-800").click();
    cy.wait("@loadCarePlan");
    cy.getByTestId("execute-care-plan-1001").click();
    cy.getByTestId("nursing-execute-modal").should("be.visible");
    cy.getByTestId("nursing-execute-result").type("Administered on schedule");
    cy.getByTestId("nursing-execute-note").type("Patient tolerated medication well");
    cy.getByTestId("nursing-confirm-execution").click();

    cy.wait("@executeCarePlan");
    cy.contains("تم تسجيل التنفيذ بنجاح").should("be.visible");
  });
});
