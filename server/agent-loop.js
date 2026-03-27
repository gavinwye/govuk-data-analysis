import Anthropic from "@anthropic-ai/sdk";
import { executeAction, takeScreenshot, VIEWPORT } from "./browser.js";

const SYSTEM_PROMPT = `You are auditing a GOV.UK government service to catalogue every data field it collects from users.

Your task:
1. Navigate to the provided service URL
2. If it is a GOV.UK start page, find and click the "Start now" button to enter the service
3. On each page, BEFORE clicking anything, carefully examine ALL form fields visible: text inputs, textareas, radio buttons, checkboxes, select dropdowns, date inputs (day/month/year), file uploads
4. Record every field's exact label text as shown on screen
5. Fill in plausible but clearly fake test data to progress to the next page:
   - Names: use "Jane Smith"
   - Date of birth: use "01/01/1990" (day: 01, month: 01, year: 1990)
   - Email: use "jane.smith@example.com"
   - Phone: use "07700 900000"
   - National Insurance number: use "QQ 12 34 56 C"
   - Postcode: use "SW1A 1AA"
   - Address: use "10 Downing Street, London"
   - Bank sort code: use "12-34-56", account number: use "12345678"
   - For radio buttons: select the first option (note ALL options as separate fields)
   - For checkboxes: check them
   - For select dropdowns: select the first real option (note all options if they represent data choices)
6. Click "Continue", "Next", "Submit", or the primary action button to proceed
7. If you encounter validation errors, try to fix the input and retry
8. If you hit a login/authentication wall (GOV.UK One Login, Government Gateway), STOP and note "Requires authentication"
9. Continue until you reach a summary/check-answers page, confirmation page, or can go no further
10. Take note of which page/step each field appears on (use the page heading as the step name)

IMPORTANT RULES:
- List each field at the MOST GRANULAR level (e.g. "First name" and "Last name" not "Full name")
- For date fields split into day/month/year boxes, record as ONE field "Date of birth" (or whatever the label says)
- For radio button groups, record the GROUP label as the field (e.g. "Are you employed?" not each individual radio option)
- For address lookups, record each individual address field shown
- Do NOT make up fields you cannot see on the actual pages
- ONLY record fields you actually see in the form on screen

When you have finished navigating the service, output your findings as JSON in this exact format:

{
  "dataFields": [
    {
      "field": "The exact label text of the field as shown on screen",
      "category": "One of: identity, contact, financial, health, location, credentials, eligibility, consent, employment",
      "required": true,
      "step": "Page heading or step name where this field appears"
    }
  ],
  "notes": "Any relevant notes, e.g. if authentication was required, if the service was unavailable, etc."
}

Output ONLY the JSON when you are done. Do not output JSON until you have finished navigating all pages.`;

export async function runAgentLoop(page, serviceUrl, apiKey, onProgress) {
  const client = new Anthropic({ apiKey });

  // Navigate to the service URL first
  await page.goto(serviceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);

  // Take initial screenshot
  const initialScreenshot = await takeScreenshot(page);

  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Please audit this GOV.UK service: ${serviceUrl}\n\nI have already navigated to the URL. Here is what the page looks like. Begin by examining the page and then navigate through the service to catalogue all data fields collected.`,
        },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: initialScreenshot,
          },
        },
      ],
    },
  ];

  const tools = [
    {
      type: "computer_20250124",
      name: "computer",
      display_width_px: VIEWPORT.width,
      display_height_px: VIEWPORT.height,
      display_number: 1,
    },
  ];

  let iterations = 0;
  const MAX_ITERATIONS = 60; // Safety limit

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    if (onProgress) {
      onProgress({ iteration: iterations, maxIterations: MAX_ITERATIONS });
    }

    console.log(`[agent-loop] Iteration ${iterations}/${MAX_ITERATIONS}`);

    const response = await client.beta.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
      tools,
      betas: ["computer-use-2025-01-24"],
    });

    // Check if the response contains just text (final answer)
    const hasToolUse = response.content.some((block) => block.type === "tool_use");
    const textBlocks = response.content.filter((block) => block.type === "text");
    const textContent = textBlocks.map((b) => b.text).join("");

    if (response.stop_reason === "end_turn" && !hasToolUse) {
      // The model has finished - parse the JSON output
      console.log("[agent-loop] Model finished, parsing output");
      return parseResult(textContent);
    }

    // Process tool use blocks
    const toolResults = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        console.log(`[agent-loop] Action: ${block.input.action}${block.input.coordinate ? ` at (${block.input.coordinate})` : ""}${block.input.text ? ` text: "${block.input.text.substring(0, 50)}"` : ""}`);

        const screenshotData = await executeAction(page, block.input);

        // Always take a screenshot after the action to show the result
        const screenshot = screenshotData || (await takeScreenshot(page));

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: screenshot,
              },
            },
          ],
        });
      }
    }

    // Add the assistant response and tool results to the conversation
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    // If stop reason is end_turn but there were tool uses, check the text for JSON
    if (response.stop_reason === "end_turn" && textContent.includes('"dataFields"')) {
      console.log("[agent-loop] Found JSON in response with tool uses, parsing");
      return parseResult(textContent);
    }
  }

  throw new Error(`Agent loop exceeded ${MAX_ITERATIONS} iterations without completing`);
}

function parseResult(text) {
  // Try to extract JSON from the text
  const jsonMatch = text.match(/\{[\s\S]*"dataFields"[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not find JSON output in agent response: " + text.substring(0, 200));
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.dataFields || !Array.isArray(parsed.dataFields)) {
      throw new Error("Invalid response format: missing dataFields array");
    }
    return parsed;
  } catch (err) {
    // Try cleaning up common JSON issues
    const cleaned = jsonMatch[0]
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]");
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error(`Failed to parse JSON: ${err.message}\n${jsonMatch[0].substring(0, 300)}`);
    }
  }
}
