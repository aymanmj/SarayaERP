/// <reference types="cypress" />

describe("Cashier workflow", () => {
  it("collects payment for a selected invoice", () => {
    cy.intercept("GET", "**/api/cashier/worklist*", {
      statusCode: 200,
      body: [
        {
          id: 1201,
          status: "ISSUED",
          totalAmount: 250,
          discountAmount: 0,
          paidAmount: 50,
          remainingAmount: 200,
          patientShare: 200,
          insuranceShare: 50,
          createdAt: "2026-04-19T09:00:00.000Z",
          patient: {
            id: 10,
            fullName: "Salma Omar",
            mrn: "MRN-1201",
            insurancePolicy: {
              name: "Gold",
              provider: { name: "National Insurance" },
            },
          },
          encounter: {
            id: 77,
            type: "OPD",
          },
        },
      ],
    }).as("loadCashierWorklist");

    cy.intercept("POST", "**/api/cashier/invoices/1201/payments", (req) => {
      expect(req.body).to.deep.equal({
        amount: 200,
        method: "CARD",
        reference: "POS-7788",
      });

      req.reply({
        statusCode: 201,
        body: {
          id: 1201,
          paymentId: 8801,
        },
      });
    }).as("submitPayment");

    cy.visitAuthenticated("/cashier");
    cy.wait("@loadCashierWorklist");

    cy.window().then((win) => {
      cy.stub(win, "open").as("windowOpen");
    });

    cy.getByTestId("cashier-page").should("be.visible");
    cy.getByTestId("cashier-invoice-row-1201").click();
    cy.getByTestId("cashier-payment-amount").clear().type("200");
    cy.getByTestId("cashier-payment-method").select("CARD");
    cy.getByTestId("cashier-payment-reference").type("POS-7788");
    cy.getByTestId("cashier-submit-payment").click();

    cy.wait("@submitPayment");
    cy.contains("تم تسجيل الدفعة بنجاح.").should("be.visible");
    cy.get("@windowOpen").should("have.been.calledWithMatch", "/payments/8801/receipt");
  });
});
