/// <reference types="cypress" />

describe("Admission workflow", () => {
  it("admits a patient into an available bed", () => {
    cy.intercept("GET", "**/api/beds/tree*", {
      statusCode: 200,
      body: [
        {
          id: 1,
          name: "Ward A",
          type: "GENERAL",
          gender: "MALE",
          rooms: [
            {
              id: 10,
              roomNumber: "101",
              beds: [
                { id: 100, bedNumber: "B-01", status: "AVAILABLE" },
                { id: 101, bedNumber: "B-02", status: "OCCUPIED" },
              ],
            },
          ],
        },
      ],
    }).as("loadBeds");

    cy.intercept("GET", "**/api/patients?limit=100*", {
      statusCode: 200,
      body: {
        items: [{ id: 501, fullName: "Ahmed Ali", mrn: "MRN-501" }],
        meta: { total: 1 },
      },
    }).as("loadPatients");

    cy.intercept("GET", "**/api/users/doctors-list*", {
      statusCode: 200,
      body: [{ id: 77, fullName: "Dr. Fatima", departmentId: 12 }],
    }).as("loadDoctors");

    cy.intercept("POST", "**/api/admissions", (req) => {
      expect(req.body).to.deep.equal({
        patientId: 501,
        bedId: 100,
        admittingDoctorId: 77,
        primaryPhysicianId: 77,
        departmentId: 12,
        admissionType: "ELECTIVE",
        priority: "MEDIUM",
        admissionReason: "دخول إيواء عبر نظام الإيواء",
        isEmergency: false,
        isolationRequired: false,
      });

      req.reply({
        statusCode: 201,
        body: { id: 9001 },
      });
    }).as("createAdmission");

    cy.on("window:confirm", () => true);

    cy.visitAuthenticated("/admissions");
    cy.wait(["@loadBeds", "@loadPatients", "@loadDoctors"]);

    cy.getByTestId("admissions-page").should("be.visible");
    cy.getByTestId("admission-patient-select").select("501");
    cy.getByTestId("admission-doctor-select").select("77");
    cy.getByTestId("bed-card-100").click();
    cy.getByTestId("admission-selected-bed").should("contain", "B-01");
    cy.getByTestId("submit-admission").click();

    cy.wait("@createAdmission");
    cy.contains("تم إجراء الدخول وحجز السرير بنجاح.").should("be.visible");
  });
});
