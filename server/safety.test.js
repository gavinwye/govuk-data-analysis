import test from "node:test";
import assert from "node:assert/strict";
import { isDangerousLabel, isStopHeading, isProgressLabel, looksLikeContactForm } from "./safety.js";

test("dangerous labels are blocked", () => {
  for (const l of ["Submit", "Accept and send", "Confirm and submit", "Pay now", "Submit application", "Declare and send", "Request a callback"]) {
    assert.equal(isDangerousLabel(l), true, l);
  }
});

test("normal navigation labels are not on the blocklist", () => {
  for (const l of ["Continue", "Start now", "Apply now", "Save and continue", "Next", "Agree and continue"]) {
    assert.equal(isDangerousLabel(l), false, l);
  }
});

test("commit pages stop the scrape", () => {
  for (const h of ["Check your answers before sending your application", "Declaration", "Application submitted", "Pay for your licence", "Your details have been submitted"]) {
    assert.equal(isStopHeading(h), true, h);
  }
  assert.equal(isStopHeading("What is your name?"), false);
});

test("only forward-navigation buttons are on the allowlist", () => {
  for (const l of ["Continue", "Start now", "▶ Next", "Save and continue", "Apply now", "Continue to payment"]) {
    assert.equal(isProgressLabel(l), true, l);
  }
  for (const l of ["Request a callback", "Send", "Book appointment", "Submit", "Return to GOV.UK", "Start again", "Get a quote", ""]) {
    assert.equal(isProgressLabel(l), false, l);
  }
});

test("name plus contact details is treated as a contact form", () => {
  assert.equal(looksLikeContactForm([{ label: "Your full name" }, { label: "Email (optional)" }, { label: "Postcode" }]), true);
  assert.equal(looksLikeContactForm([{ label: "How many children?" }, { label: "What is your total taxable income?" }]), false);
  assert.equal(looksLikeContactForm([{ label: "Postcode" }]), false);
});
