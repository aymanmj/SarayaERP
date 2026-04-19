/// <reference types="cypress" />

describe("Pharmacy dispense workflow", () => {
  it("dispenses an outpatient prescription with payment", () => {
    cy.intercept("GET", "**/api/pharmacy/worklist*", {
      statusCode: 200,
      body: [
        {
          id: 301,
          status: "ACTIVE",
          createdAt: "2026-04-19T08:00:00.000Z",
          encounterId: 17,
          encounter: { type: "OPD" },
          patient: { id: 4, fullName: "Mona Adel", mrn: "MRN-301" },
          doctor: { id: 7, fullName: "Dr. Karim" },
          items: [
            {
              id: 901,
              dose: "500 mg",
              route: "ORAL",
              frequency: "BID",
              durationDays: 5,
              quantity: 2,
              notes: null,
              drugItem: {
                id: 7001,
                code: "AMX",
                name: "Amoxicillin",
                genericName: "Amoxicillin",
                strength: "500 mg",
                form: "Capsule",
                unitPrice: 12,
                stockOnHand: 40,
              },
            },
          ],
        },
      ],
    }).as("loadPharmacyWorklist");

    cy.intercept("GET", "**/api/pharmacy/stock*", {
      statusCode: 200,
      body: [
        {
          id: 7001,
          code: "AMX",
          name: "Amoxicillin",
          genericName: "Amoxicillin",
          strength: "500 mg",
          form: "Capsule",
          unitPrice: 12,
          stockOnHand: 40,
        },
        {
          id: 7002,
          code: "AMX-FORTE",
          name: "Amoxicillin Forte",
          genericName: "Amoxicillin",
          strength: "625 mg",
          form: "Tablet",
          unitPrice: 15,
          stockOnHand: 20,
        },
      ],
    }).as("loadPharmacyStock");

    cy.intercept("POST", "**/api/pharmacy/prescriptions/301/dispense-pay", (req) => {
      expect(req.body).to.deep.equal({
        paymentMethod: "CARD",
        amountPaid: 30,
        items: [
          {
            prescriptionItemId: 901,
            quantity: 2,
            dispensedDrugItemId: 7002,
          },
        ],
        notes: "صرف مباشر (POS)",
      });

      req.reply({
        statusCode: 200,
        body: { success: true },
      });
    }).as("dispenseAndPay");

    cy.visitAuthenticated("/pharmacy");
    cy.wait(["@loadPharmacyWorklist", "@loadPharmacyStock"]);

    cy.getByTestId("pharmacy-page").should("be.visible");
    cy.getByTestId("dispense-prescription-301").click();
    cy.getByTestId("pharmacy-dispense-modal").should("be.visible");
    cy.getByTestId("dispense-product-901").select("7002");
    cy.getByTestId("dispense-qty-901").type("{selectall}2");
    cy.getByTestId("pharmacy-payment-method").select("CARD");
    cy.getByTestId("pharmacy-amount-paid").clear().type("30");
    cy.getByTestId("pharmacy-confirm-dispense").click();

    cy.wait("@dispenseAndPay");
    cy.contains("تم الصرف والدفع بنجاح.").should("be.visible");
    cy.getByTestId("pharmacy-prescription-row-301").should("not.exist");
  });
});
