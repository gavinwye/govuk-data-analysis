// Guards that stop the scraper before it does anything irreversible on a live service.
// The scraper fills forms with fake data, so it must never press a button that
// submits, sends, pays for or declares anything.
//
// Three layers, all must pass before a form button is pressed:
//   1. isProgressLabel: default-deny allowlist of forward-navigation labels.
//   2. isDangerousLabel: explicit blocklist (belt and braces).
//   3. looksLikeContactForm: pages collecting identity + contact details are
//      recorded but never submitted.

// Button/link labels that finalise something. Matched as whole words.
const DANGEROUS_LABEL =
  /\b(submit|send|confirm|pay|payment|declare|declaration|authori[sz]e|complete|finish|place order|sign and|delete|cancel|withdraw|withdrawal|close account|callback|call back|request|book)\b/i;

// Page headings that mean "the next click commits the journey".
const STOP_HEADING =
  /\b(check your answers|check your answer|review your|review and submit|declaration|before you submit|before you send|make a payment|pay for|payment details|card number|application (complete|submitted)|confirmation|thank you|what happens next|you have submitted|have been submitted)\b/i;

// Default-deny: the scraper may only press buttons that move forward through a
// journey. Anything else ("Request a callback", "Send", "Book", ...) is refused,
// even if it isn't on the dangerous list.
const PROGRESS_LABEL =
  /^(start( now)?|get started|continue|next|save and continue|agree and continue|accept and continue|apply now|continue to [a-z ]{1,40})$/i;

export function isDangerousLabel(text) {
  return DANGEROUS_LABEL.test((text || "").trim());
}

export function isStopHeading(heading) {
  return STOP_HEADING.test((heading || "").trim());
}

export function isProgressLabel(text) {
  // Strip leading arrows/symbols and trailing punctuation some services add.
  const t = (text || "").replace(/^[^a-z]+|[^a-z]+$/gi, "").replace(/\s+/g, " ").trim();
  return PROGRESS_LABEL.test(t);
}

// A page that collects who someone is AND how to reach them is almost always the
// last step: pressing its button sends personal details to a real department.
// Record the fields, don't press the button.
export function looksLikeContactForm(fields) {
  const labels = fields.map((f) => (f.label || "").toLowerCase());
  const hasName = labels.some((l) => /\b(full name|first name|last name|surname|your name|name of the person)\b/.test(l));
  const hasContact = labels.some((l) =>
    /\b(email|phone|telephone|mobile|number to ring|contact option|address|postcode)\b/.test(l)
  );
  return hasName && hasContact;
}

// Label for a button or link element (value for <input type=submit>).
export async function getControlLabel(handle) {
  return (
    (await handle.evaluate((el) => (el.value || el.innerText || el.textContent || "").trim())) || ""
  );
}
