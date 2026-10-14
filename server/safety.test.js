import test from "node:test";
import assert from "node:assert/strict";
import { isDangerousLabel, isStopHeading } from "./safety.js";

test("dangerous labels are blocked", () => {
  for (const l of ["Submit", "Accept and send", "Confirm and submit", "Pay now", "Submit application", "Declare and send"]) {
    assert.equal(isDangerousLabel(l), true, l);
  }
});

test("normal navigation labels are allowed", () => {
  for (const l of ["Continue", "Start now", "Apply now", "Save and continue", "Next", "Agree and continue"]) {
    assert.equal(isDangerousLabel(l), false, l);
  }
});

test("commit pages stop the scrape", () => {
  for (const h of ["Check your answers before sending your application", "Declaration", "Application submitted", "Pay for your licence"]) {
    assert.equal(isStopHeading(h), true, h);
  }
  assert.equal(isStopHeading("What is your name?"), false);
});
