describe("Test standalone activity module", () => {
  it("should create activity", () => {
    cy.visit("/activity/command.html");
    cy.contains("YAGNA_APPKEY").type("test_yagna_app_key");
    cy.contains("AGREEMENT_ID").type("test_agreement_id");
    cy.contains("Create Activity").click();
    cy.get("#logs").should("include.text", "Activity created");
  });

  it("should run deploy command", () => {
    cy.visit("/activity/command.html");
    cy.contains("YAGNA_APPKEY").type("test_yagna_app_key");
    cy.contains("AGREEMENT_ID").type("test_agreement_id");
    cy.contains("Create Activity").click();
    cy.contains("Deploy").click();
    cy.get("#logs").should("include.text", "Command Deploy has been executed");
  });

  it("should run exe command", () => {
    cy.visit("/activity/command.html");
    cy.contains("YAGNA_APPKEY").type("test_yagna_app_key");
    cy.contains("AGREEMENT_ID").type("test_agreement_id");
    cy.contains("Create Activity").click();
    cy.contains("Deploy").click();
    cy.contains("Start").click();
    cy.contains("RUN SHELL COMMAND").type('echo "test_result"');
    cy.contains("Execute").click();
    cy.get("#results").should("include.text", "[stdout] test_result");
  });

  it("should get state of activity", () => {
    cy.visit("/activity/command.html");
    cy.contains("YAGNA_APPKEY").type("test_yagna_app_key");
    cy.contains("AGREEMENT_ID").type("test_agreement_id");
    cy.contains("Create Activity").click();
    cy.contains("Get state").click();
    cy.get("#logs").should("include.text", "Activity State: Initialized");
  });

  it("should destroy activity", () => {
    cy.visit("/activity/command.html");
    cy.contains("YAGNA_APPKEY").type("test_yagna_app_key");
    cy.contains("AGREEMENT_ID").type("test_agreement_id");
    cy.contains("Create Activity").click();
    cy.contains("Destroy Activity").click();
    cy.get("#logs").should("include.text", "Activity has been destroyed");
  });
});
