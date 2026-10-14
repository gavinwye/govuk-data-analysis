import { launchBrowser } from "./browser.js";
import { getTestValue, categoriseField } from "./field-filler.js";
import { isDangerousLabel, isStopHeading, isProgressLabel, looksLikeContactForm, getControlLabel } from "./safety.js";

// SCRAPE_DRY_RUN=1: follow links and "Start now" only, never press a form button.
const DRY_RUN = process.env.SCRAPE_DRY_RUN === "1";

const MAX_PAGES = 40;

/**
 * Extract all form fields from the current page
 */
async function extractFields(page, stepName) {
  return await page.evaluate((step) => {
    const fields = [];
    let idxCounter = 0;
    // Stable selector even when the element has no id.
    const sel = (el) => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      idxCounter += 1;
      el.setAttribute("data-scrape-idx", String(idxCounter));
      return `[data-scrape-idx="${idxCounter}"]`;
    };

    // Helper to get label text for an input
    function getLabelText(el) {
      // Check for aria-label
      if (el.getAttribute("aria-label")) return el.getAttribute("aria-label").trim();

      // Check for associated <label> via id
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) return label.textContent.trim();
      }

      // Check for parent <label>
      const parentLabel = el.closest("label");
      if (parentLabel) return parentLabel.textContent.trim();

      // Check for GOV.UK fieldset legend (for radio/checkbox groups)
      const fieldset = el.closest("fieldset");
      if (fieldset) {
        const legend = fieldset.querySelector("legend");
        if (legend) return legend.textContent.trim();
      }

      // Check for preceding heading or label-like element
      const formGroup = el.closest(".govuk-form-group");
      if (formGroup) {
        const label = formGroup.querySelector(".govuk-label, .govuk-fieldset__legend");
        if (label) return label.textContent.trim();
      }

      // Fallback to placeholder or name
      return el.getAttribute("placeholder") || el.getAttribute("name") || "";
    }

    // Find all text inputs, textareas, selects
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="password"], input[type="url"], input[type="search"], input:not([type]), textarea, select'
    );

    const seenLabels = new Set();

    for (const input of inputs) {
      // Skip hidden inputs
      if (input.type === "hidden" || input.offsetParent === null) continue;

      const label = getLabelText(input);
      if (!label || seenLabels.has(label)) continue;
      seenLabels.add(label);

      fields.push({
        label: label,
        type: input.tagName.toLowerCase() === "select" ? "select" : input.type || "text",
        numeric: input.getAttribute("inputmode") === "numeric",
        required: input.hasAttribute("required") || input.getAttribute("aria-required") === "true",
        selector: sel(input),
        step: step,
      });
    }

    // Find radio button groups (by fieldset)
    const fieldsets = document.querySelectorAll("fieldset");
    for (const fieldset of fieldsets) {
      const radios = fieldset.querySelectorAll('input[type="radio"]');
      if (radios.length === 0) continue;

      const legend = fieldset.querySelector("legend, .govuk-fieldset__legend");
      const label = legend ? legend.textContent.trim() : "";
      if (!label || seenLabels.has(label)) continue;
      seenLabels.add(label);

      fields.push({
        label: label,
        type: "radio",
        required: radios[0].hasAttribute("required"),
        selector: sel(radios[0]),
        step: step,
      });
    }

    // Find standalone checkboxes (not in a radio group)
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    for (const cb of checkboxes) {
      if (cb.offsetParent === null) continue;
      const label = getLabelText(cb);
      if (!label || seenLabels.has(label)) continue;
      seenLabels.add(label);

      fields.push({
        label: label,
        type: "checkbox",
        required: cb.hasAttribute("required"),
        selector: sel(cb),
        step: step,
      });
    }

    // Find file inputs
    const fileInputs = document.querySelectorAll('input[type="file"]');
    for (const fi of fileInputs) {
      if (fi.offsetParent === null) continue;
      const label = getLabelText(fi);
      if (!label || seenLabels.has(label)) continue;
      seenLabels.add(label);

      fields.push({
        label: label,
        type: "file",
        required: fi.hasAttribute("required"),
        selector: sel(fi),
        step: step,
      });
    }

    // Find date inputs (GOV.UK date pattern: 3 inputs for day/month/year)
    const dateGroups = document.querySelectorAll(".govuk-date-input");
    for (const group of dateGroups) {
      const formGroup = group.closest(".govuk-form-group");
      const legend = formGroup
        ? formGroup.querySelector(".govuk-fieldset__legend, .govuk-label")
        : null;
      const label = legend ? legend.textContent.trim() : "Date";
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);

      // Remove any individual day/month/year entries we already added
      const dateInputIds = Array.from(group.querySelectorAll("input")).map((i) => i.id);
      // We'll keep the composite date field instead

      fields.push({
        label: label,
        type: "date",
        required: group.querySelector("input[required]") !== null,
        selector: null,
        isDateGroup: true,
        dateInputIds: dateInputIds,
        step: step,
      });
    }

    return fields;
  }, stepName);
}

/**
 * Get the current page heading to use as step name
 */
async function getPageHeading(page) {
  return await page.evaluate(() => {
    // Prefer a visible heading inside <main>, skipping timeout/cookie dialogs.
    const candidates = Array.from(
      document.querySelectorAll("main h1, h1, .govuk-heading-l, .govuk-heading-xl, .govuk-fieldset__heading")
    ).filter((h) => h.offsetParent !== null && !h.closest('dialog, [role="dialog"], [aria-modal="true"], [hidden]'));
    const h1 = candidates[0];
    return h1 ? h1.textContent.trim() : document.title || "Unknown page";
  });
}

/**
 * Fill in form fields with test data
 */
const NUMBER_VALUES = ["2", "1", "10", "35000"];
const TEXT_VALUES = [null, "Jane Smith", "ABC123", "10 Downing Street"];

const NUMERIC_LABEL = /\b(how many|number of|total number|how much|how old|age)\b/i;

function valueFor(field, pageContext, attempt) {
  if (field.type === "number" || field.numeric || NUMERIC_LABEL.test(field.label)) {
    const v = getTestValue(field.label, pageContext);
    return attempt === 0 && /^\d+$/.test(v) ? v : NUMBER_VALUES[attempt % NUMBER_VALUES.length];
  }
  if (field.type === "email") return "jane.smith@example.com";
  if (field.type === "tel") return "07700 900000";
  if (field.type === "url") return "https://example.com";
  const v = getTestValue(field.label, pageContext);
  // A recognised field (name, email, postcode...) keeps its value on retries;
  // only generic free-text fields rotate through alternatives.
  if (attempt === 0 || v !== "Test") return v;
  return TEXT_VALUES[attempt % TEXT_VALUES.length] ?? v;
}

async function fillFields(page, fields, pageContext, attempt = 0) {
  for (const field of fields) {
    try {
      if (field.type === "radio") {
        // Click the first radio button in the group
        if (field.selector) {
          // On retries pick a different option in the group, in case the
          // first one leads to a validation error or a dead end.
          const radioName = await page.$eval(field.selector, (el) => el.name).catch(() => "");
          const group = radioName ? await page.$$(`input[type="radio"][name="${radioName}"]`) : [];
          const pick = group.length ? group[attempt % group.length] : null;
          if (pick) {
            // GOV.UK radios are visually hidden; fall back to clicking the label.
            await pick.check({ force: true, timeout: 3000 }).catch(async () => {
              const id = await pick.getAttribute("id");
              if (id) await page.click(`label[for="${id}"]`, { timeout: 3000 });
            });
          } else await page.click(field.selector);
        } else {
          // Try to find first radio in the fieldset
          const radio = await page.$('fieldset input[type="radio"]');
          if (radio) await radio.click();
        }
      } else if (field.type === "checkbox") {
        if (field.selector) {
          await page.check(field.selector);
        }
      } else if (field.type === "date" || field.isDateGroup) {
        // Fill day/month/year separately
        if (field.dateInputIds && field.dateInputIds.length >= 3) {
          const values = getTestValue(field.label, pageContext);
          // Default date values
          for (const id of field.dateInputIds) {
            const lower = id.toLowerCase();
            let val = "01";
            if (lower.includes("day")) val = "15";
            else if (lower.includes("month")) val = "06";
            else if (lower.includes("year")) val = "1990";
            await page.fill(`#${id}`, val);
          }
        }
      } else if (field.type === "select") {
        if (field.selector) {
          // Select the second option (first is usually a placeholder like "Select one")
          const options = await page.$$eval(`${field.selector} option`, (opts) =>
            opts.map((o) => o.value).filter((v) => v && v !== "")
          );
          if (options.length > 0) {
            await page.selectOption(field.selector, options[0]);
          }
        }
      } else if (field.type === "file") {
        // Skip file inputs - can't meaningfully fill these
      } else {
        // Text-like input
        if (field.selector) {
          await page.fill(field.selector, valueFor(field, pageContext, attempt));
        }
      }
    } catch (err) {
      console.log(`[scraper] Could not fill field "${field.label}": ${err.message}`);
    }
  }
}

async function getErrorSummary(page) {
  return await page.evaluate(() => {
    const el = document.querySelector(".govuk-error-summary, [role='alert'] .govuk-error-message, .govuk-error-message");
    return el ? el.textContent.replace(/\s+/g, " ").trim().slice(0, 160) : "";
  });
}

/**
 * Try to click the continue/next button.
 * Never clicks a button whose label submits, sends, pays or declares.
 * Returns { navigated: boolean, blocked?: string } where blocked is the label
 * of the dangerous button we refused to press.
 */
// Selector fragment that excludes cookie/consent banner buttons, which also use
// GOV.UK button classes and otherwise get clicked instead of the real form submit.
const NOT_COOKIE_BANNER = ':not([class*="cookie" i] *):not([id*="cookie" i] *)';

async function clickContinue(page, serviceHost) {
  // Only look inside the main content so header, footer, breadcrumbs, phase
  // banners and cookie banners can never be mistaken for the journey button.
  const IN_MAIN = (await page.$("main")) ? "main " : "";
  const buttonSelectors = [
    `${IN_MAIN}form button.govuk-button:not(.govuk-button--secondary):not(.govuk-button--warning)`,
    `${IN_MAIN}form input[type="submit"]`,
    `${IN_MAIN}button[type="submit"]`,
    `${IN_MAIN}input[type="submit"]`,
    `${IN_MAIN}button.govuk-button:not(.govuk-button--secondary):not(.govuk-button--warning)`,
    `${IN_MAIN}a.govuk-button:not(.govuk-button--secondary)`,
    `${IN_MAIN}a.govuk-button--start`,
  ];

  const buttonTexts = ["start now", "continue", "next", "save and continue", "agree and continue", "accept and continue", "apply"];
  const textSelectors = buttonTexts.map((t) => `${IN_MAIN}button:has-text("${t}"), ${IN_MAIN}a.govuk-button:has-text("${t}")`);

  for (const selector of [...buttonSelectors, ...textSelectors]) {
    const button = await page.$(selector);
    if (!button || !(await button.isVisible())) continue;

    const label = await getControlLabel(button);
    if (isDangerousLabel(label) || !isProgressLabel(label)) return { navigated: false, blocked: label };
    if (DRY_RUN && !/^start/i.test(label.replace(/^[^a-z]+/i, ""))) {
      return { navigated: false, blocked: `dry-run (would press "${label}")` };
    }

    // Never follow a button-styled link off the service (e.g. "Return to GOV.UK").
    const href = await button.evaluate((el) => (el.tagName === "A" ? el.href : null));
    if (href && !isSameService(href, serviceHost)) continue;

    const urlBefore = page.url();
    await button.click();
    await page.waitForTimeout(1500);
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
    } catch {}
    if (page.url() !== urlBefore || (await hasNewContent(page))) {
      return { navigated: true };
    }
  }
  return { navigated: false };
}

function isSameService(href, serviceHost) {
  try {
    const u = new URL(href);
    return ["http:", "https:"].includes(u.protocol) && (!serviceHost || u.hostname === serviceHost);
  } catch {
    return false;
  }
}

// Pages that are a list of choices (links) rather than a form: follow the first
// unvisited link that stays on the service. Returns the link label or null.
async function clickChoiceLink(page, serviceHost, visited) {
  const candidates = await page.$$eval(
    "main a[href]:not(.govuk-back-link):not(.govuk-button)",
    (links) =>
      links
        .filter((a) => a.offsetParent !== null && !a.closest("nav, footer, header, .govuk-breadcrumbs"))
        .map((a) => ({ href: a.href, label: a.textContent.trim() }))
  );
  const skip = /^(back|return|start again|search again|cookies|privacy|accessibility|feedback|contact|help|sign in|log in)\b/i;
  for (const c of candidates) {
    if (!c.label || skip.test(c.label) || isDangerousLabel(c.label)) continue;
    if (!isSameService(c.href, serviceHost) || visited.has(c.href.split("#")[0])) continue;
    const link = await page.$(`main a[href="${new URL(c.href).pathname + new URL(c.href).search}"], main a[href="${c.href}"]`);
    if (!link) continue;
    await link.click();
    await page.waitForTimeout(1500);
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
    } catch {}
    return c.label;
  }
  return null;
}

/**
 * Dismiss any cookie consent banner so its GOV.UK-styled buttons can't be
 * mistaken for the form's real "Continue" button later in the journey.
 */
async function dismissCookieBanner(page) {
  const selectors = [
    '[id*="cookie" i] button:has-text("Accept")',
    '[class*="cookie" i] button:has-text("Accept")',
    '[id*="cookie" i] button:has-text("Reject")',
    '[class*="cookie" i] button:has-text("Reject")',
    "#acceptAll",
    "#rejectAll",
  ];
  for (const selector of selectors) {
    const button = await page.$(selector);
    if (button && (await button.isVisible())) {
      try {
        await button.click();
        await page.waitForTimeout(300);
        console.log("[scraper] Dismissed cookie banner");
        return;
      } catch {}
    }
  }
}

async function hasNewContent(page) {
  // Simple check - see if the page has a form or new heading
  return await page.evaluate(() => !!document.querySelector("form, .govuk-heading-l, h1"));
}

/**
 * Check if we've reached the end of the service journey
 */
async function isEndPage(page) {
  return await page.evaluate(() => {
    const text = document.body.textContent.toLowerCase();
    const heading = (document.querySelector("h1") || {}).textContent || "";
    const headingLower = heading.toLowerCase();

    // Check for common end-page indicators
    if (headingLower.includes("check your answers")) return true;
    if (headingLower.includes("review your")) return true;
    if (headingLower.includes("application complete")) return true;
    if (headingLower.includes("application submitted")) return true;
    if (headingLower.includes("confirmation")) return true;
    if (headingLower.includes("thank you")) return true;
    if (headingLower.includes("what happens next")) return true;
    if (headingLower.includes("you have submitted")) return true;

    // Check for GOV.UK confirmation panel
    if (document.querySelector(".govuk-panel--confirmation")) return true;

    // Check for login/auth walls
    if (headingLower.includes("sign in") || headingLower.includes("log in")) return true;
    if (headingLower.includes("create an account")) return true;
    if (headingLower.includes("government gateway")) return true;
    if (text.includes("gov.uk one login")) return true;

    return false;
  });
}

/**
 * Check if the current page is a login/auth page
 */
async function isAuthPage(page) {
  return await page.evaluate(() => {
    const heading = (document.querySelector("h1") || {}).textContent || "";
    const lower = heading.toLowerCase();
    const text = document.body.textContent.toLowerCase();

    return (
      lower.includes("sign in") ||
      lower.includes("log in") ||
      lower.includes("create an account") ||
      lower.includes("government gateway") ||
      text.includes("gov.uk one login") ||
      text.includes("sign in to your account")
    );
  });
}

/**
 * Main scraper function - navigates a GOV.UK service and extracts all form fields
 */
export async function scrapeService(serviceUrl, onProgress) {
  const { browser, page } = await launchBrowser();
  const allFields = [];
  let pagesVisited = 0;
  let lastSignature = null;
  let notes = "";
  let stopReason = "unknown";
  const pages = [];

  try {
    console.log(`[scraper] Navigating to ${serviceUrl}`);
    await page.goto(serviceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    // If we're on the govuk-services-list metadata page, follow through to the actual service
    if (page.url().includes("govuk-services-list")) {
      console.log("[scraper] On services list page, looking for actual service URL");
      const govukLink = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a"));
        for (const link of links) {
          const href = link.href || "";
          const text = link.textContent.toLowerCase();
          if (href.includes("gov.uk") && !href.includes("govuk-services-list") &&
              (text.includes("start page") || text.includes("gov.uk"))) {
            return href;
          }
        }
        // Fallback: look for any gov.uk link
        for (const link of links) {
          const href = link.href || "";
          if (href.includes("www.gov.uk/") && !href.includes("govuk-services-list")) {
            return href;
          }
        }
        return null;
      });

      if (govukLink) {
        console.log(`[scraper] Following link to actual service: ${govukLink}`);
        await page.goto(govukLink, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(2000);
      } else {
        console.log("[scraper] Could not find actual service URL on services list page");
        notes = "Could not find actual service URL from services list metadata page";
      }
    }

    await dismissCookieBanner(page);

    // If we're on a GOV.UK start page, click "Start now"
    let startButton = await page.$('a.govuk-button--start, a:has-text("Start now")');
    if (startButton && !isProgressLabel(await getControlLabel(startButton))) startButton = null;
    if (startButton) {
      console.log("[scraper] Found 'Start now' button, clicking");
      await startButton.click();
      await page.waitForTimeout(2000);
      try {
        await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
      } catch {}
    }

    await dismissCookieBanner(page);

    stopReason = "max-pages";
    let serviceHost = null;
    let attempt = 0;
    const visited = new Set();
    for (let pageNum = 0; pageNum < MAX_PAGES; pageNum++) {
      const currentUrl = page.url();
      const heading = await getPageHeading(page);

      // Many GOV.UK services reuse the same URL for every step (session-based
      // state machine), so detect stalls by URL+heading rather than URL alone.
      const signature = `${currentUrl}::${heading}`;
      if (signature === lastSignature) {
        const errText = await getErrorSummary(page);
        if (errText && attempt < 3) {
          // Validation error: re-fill with different values and try again.
          attempt++;
          console.log(`[scraper] Validation error ("${errText}"), retry ${attempt}`);
          const retryFields = await extractFields(page, heading);
          await fillFields(page, retryFields, heading, attempt);
          const retry = await clickContinue(page, serviceHost);
          if (retry.blocked) {
            stopReason = `blocked: ${retry.blocked}`;
            break;
          }
          continue;
        }
        console.log(`[scraper] No change since last page ("${heading}"), stopping`);
        stopReason = errText ? `validation-error: ${errText}` : "no-change";
        break;
      }
      attempt = 0;
      lastSignature = signature;
      if (pageNum === 0) serviceHost = new URL(currentUrl).hostname;
      visited.add(currentUrl.split("#")[0]);
      pagesVisited++;
      pages.push({ heading, url: currentUrl });

      console.log(`[scraper] Page ${pageNum + 1}: "${heading}" (${currentUrl})`);

      if (onProgress) {
        onProgress({ page: pageNum + 1, heading, url: currentUrl });
      }

      // Check if we've hit an auth wall
      if (await isAuthPage(page)) {
        console.log("[scraper] Hit authentication page, stopping");
        notes = "Requires authentication (GOV.UK One Login or Government Gateway). Could not navigate past the login page.";
        stopReason = "auth";
        break;
      }

      // Check if we've reached the end
      if (pageNum > 0 && (isStopHeading(heading) || (await isEndPage(page)))) {
        console.log("[scraper] Reached end page");
        stopReason = "end-page";
        break;
      }

      // Extract fields from this page
      const pageFields = await extractFields(page, heading);
      console.log(`[scraper] Found ${pageFields.length} fields on this page`);

      // Filter out date sub-fields if we have a date group
      const dateGroupLabels = new Set();
      for (const f of pageFields) {
        if (f.isDateGroup) dateGroupLabels.add(f.label);
      }

      for (const field of pageFields) {
        // Skip individual day/month/year if part of a date group
        if (
          dateGroupLabels.size > 0 &&
          !field.isDateGroup &&
          ["day", "month", "year"].some((d) => field.label.toLowerCase() === d)
        ) {
          continue;
        }
        allFields.push(field);
      }

      // A page that collects identity + contact details is where a journey
      // sends data to a real department. Keep the fields, never press the button.
      if (looksLikeContactForm(pageFields)) {
        console.log("[scraper] Contact-details form, recording fields and stopping before submit");
        stopReason = "contact-form (not submitted)";
        break;
      }

      // Fill in the form
      await fillFields(page, pageFields, heading);

      // Try to navigate to next page
      const result = await clickContinue(page, serviceHost);
      if (result.blocked) {
        console.log(`[scraper] Refused to press "${result.blocked}", stopping`);
        stopReason = `blocked: ${result.blocked}`;
        break;
      }
      if (!result.navigated && pageFields.length === 0) {
        // A list of choices rather than a form: follow the first link that stays on the service.
        const chosen = await clickChoiceLink(page, serviceHost, visited);
        if (chosen) {
          console.log(`[scraper] Followed choice link "${chosen}"`);
          continue;
        }
      }
      if (!result.navigated) {
        console.log("[scraper] Could not find a continue button, stopping");
        stopReason = "no-continue";
        break;
      }

      // Wait for new page
      await page.waitForTimeout(1000);
    }
  } catch (err) {
    console.error(`[scraper] Error: ${err.message}`);
    notes = `Scraper error: ${err.message}`;
    stopReason = "error";
  } finally {
    await browser.close().catch(() => {});
  }

  // Convert to the standard dataFields format
  // GOV.UK convention: fields are required unless the label says "(optional)".
  const dataFields = allFields.map((f) => ({
    field: f.label.replace(/\s*\(optional\)\s*$/i, ""),
    category: categoriseField(f.label),
    required: !/\(optional\)/i.test(f.label),
    step: f.step,
  }));

  // Deduplicate fields (same label + same step)
  const seen = new Set();
  const uniqueFields = dataFields.filter((f) => {
    const key = `${f.field.toLowerCase()}|${f.step.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[scraper] Total unique fields found: ${uniqueFields.length}`);

  return {
    dataFields: uniqueFields,
    pages,
    stopReason,
    notes: notes || `Scraped ${pagesVisited} pages`,
  };
}
