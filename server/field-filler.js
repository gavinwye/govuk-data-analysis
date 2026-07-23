// Maps field labels to plausible test data for GOV.UK forms
// Labels are matched case-insensitively using substring matching

const FIELD_PATTERNS = [
  // Names
  { match: ["first name", "given name", "forename"], value: "Jane" },
  { match: ["middle name"], value: "Anne" },
  { match: ["last name", "surname", "family name"], value: "Smith" },
  { match: ["full name", "your name"], value: "Jane Smith" },

  // Date of birth
  { match: ["day"], value: "15", context: ["date", "birth", "born", "when"] },
  { match: ["month"], value: "06", context: ["date", "birth", "born", "when"] },
  { match: ["year"], value: "1990", context: ["date", "birth", "born", "when"] },
  // Generic day/month/year without context
  { match: ["day"], value: "15" },
  { match: ["month"], value: "06" },
  { match: ["year"], value: "2024" },

  // Contact
  { match: ["email"], value: "jane.smith@example.com" },
  { match: ["phone", "telephone", "mobile", "contact number"], value: "07700 900000" },

  // Address
  { match: ["address line 1", "building and street", "address line one"], value: "10 Downing Street" },
  { match: ["address line 2", "address line two"], value: "" },
  { match: ["town", "city"], value: "London" },
  { match: ["county"], value: "Greater London" },
  { match: ["postcode", "post code", "zip"], value: "SW1A 1AA" },
  { match: ["country"], value: "United Kingdom" },

  // Identity numbers
  { match: ["national insurance", "ni number", "nino"], value: "QQ 12 34 56 C" },
  { match: ["passport number"], value: "533401572" },
  { match: ["driving licence", "driver license"], value: "SMITH 906152 JA 9IJ" },

  // Financial
  { match: ["sort code"], value: "123456" },
  { match: ["account number"], value: "12345678" },
  { match: ["account holder", "name on the account", "account name"], value: "Jane Smith" },
  { match: ["roll number", "reference"], value: "ABC123" },

  // Employment
  { match: ["employer name", "company name", "organisation name"], value: "Example Ltd" },
  { match: ["job title", "role", "occupation"], value: "Software Developer" },
  { match: ["salary", "income", "earnings", "pay"], value: "35000" },

  // General
  { match: ["number of"], value: "2" },
  { match: ["amount", "how much"], value: "500" },
  { match: ["description", "details", "explain", "tell us"], value: "Test data for audit purposes" },
];

/**
 * Get a plausible value for a form field based on its label text
 * @param {string} label - The field label text
 * @param {string} pageContext - Additional context from the page (heading, surrounding text)
 * @returns {string} A plausible test value
 */
export function getTestValue(label, pageContext = "") {
  const lowerLabel = label.toLowerCase();
  const lowerContext = (pageContext || "").toLowerCase();

  // First try patterns with context requirements
  for (const pattern of FIELD_PATTERNS) {
    if (!pattern.context) continue;
    const labelMatch = pattern.match.some((m) => lowerLabel.includes(m));
    const contextMatch = pattern.context.some(
      (c) => lowerLabel.includes(c) || lowerContext.includes(c)
    );
    if (labelMatch && contextMatch) return pattern.value;
  }

  // Then try patterns without context
  for (const pattern of FIELD_PATTERNS) {
    if (pattern.context) continue;
    if (pattern.match.some((m) => lowerLabel.includes(m))) return pattern.value;
  }

  // Fallback for unknown fields
  return "Test";
}

/**
 * Categorise a field based on its label
 * @param {string} label - The field label text
 * @returns {string} One of the data categories
 */
export function categoriseField(label) {
  const lower = label.toLowerCase();

  if (
    ["name", "surname", "forename", "date of birth", "gender", "sex", "title", "age", "nationality"].some(
      (k) => lower.includes(k)
    )
  )
    return "identity";
  if (["email", "phone", "telephone", "mobile", "contact"].some((k) => lower.includes(k)))
    return "contact";
  if (
    ["sort code", "account number", "bank", "salary", "income", "pay", "earnings", "tax", "amount", "payment"].some(
      (k) => lower.includes(k)
    )
  )
    return "financial";
  if (["health", "medical", "disability", "condition", "gp", "doctor", "hospital", "nhs"].some((k) => lower.includes(k)))
    return "health";
  if (["address", "postcode", "town", "city", "county", "country", "where"].some((k) => lower.includes(k)))
    return "location";
  if (
    ["national insurance", "ni number", "passport", "driving licence", "license", "reference", "crn", "utr"].some(
      (k) => lower.includes(k)
    )
  )
    return "credentials";
  if (["agree", "consent", "declaration", "confirm", "accept", "opt in", "permission"].some((k) => lower.includes(k)))
    return "consent";
  if (["employ", "job", "work", "occupation", "company", "employer"].some((k) => lower.includes(k)))
    return "employment";
  if (
    ["eligible", "qualify", "status", "married", "single", "citizen", "resident", "benefit"].some((k) =>
      lower.includes(k)
    )
  )
    return "eligibility";

  return "identity";
}
