// Guards that stop the scraper before it does anything irreversible on a live service.
// The scraper fills forms with fake data, so it must never press a button that
// submits, sends, pays for or declares anything.

// Button/link labels that finalise something. Matched as whole words.
const DANGEROUS_LABEL =
  /\b(submit|send|confirm|pay|payment|declare|declaration|authori[sz]e|complete|finish|place order|sign and|delete|cancel|withdraw|withdrawal|close account)\b/i;

// Page headings that mean "the next click commits the journey".
const STOP_HEADING =
  /\b(check your answers|check your answer|review your|review and submit|declaration|before you submit|before you send|make a payment|pay for|payment details|card number|application (complete|submitted)|confirmation|thank you|what happens next|you have submitted)\b/i;

export function isDangerousLabel(text) {
  return DANGEROUS_LABEL.test((text || "").trim());
}

export function isStopHeading(heading) {
  return STOP_HEADING.test((heading || "").trim());
}

// Label for a button or link element (value for <input type=submit>).
export async function getControlLabel(handle) {
  return (
    (await handle.evaluate((el) => (el.value || el.innerText || el.textContent || "").trim())) || ""
  );
}
