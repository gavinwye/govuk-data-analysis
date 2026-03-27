import { chromium } from "playwright";

const VIEWPORT = { width: 1280, height: 800 };

export async function launchBrowser() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  return { browser, page };
}

export async function takeScreenshot(page) {
  const buffer = await page.screenshot({ type: "png" });
  return buffer.toString("base64");
}

export async function executeAction(page, action) {
  const { type, coordinate, text, key } = action;

  switch (type) {
    case "screenshot":
      return await takeScreenshot(page);

    case "left_click":
      if (coordinate) {
        await page.mouse.click(coordinate[0], coordinate[1]);
        await page.waitForTimeout(500);
      }
      break;

    case "right_click":
      if (coordinate) {
        await page.mouse.click(coordinate[0], coordinate[1], { button: "right" });
      }
      break;

    case "double_click":
      if (coordinate) {
        await page.mouse.dblclick(coordinate[0], coordinate[1]);
      }
      break;

    case "triple_click":
      if (coordinate) {
        await page.mouse.click(coordinate[0], coordinate[1], { clickCount: 3 });
      }
      break;

    case "middle_click":
      if (coordinate) {
        await page.mouse.click(coordinate[0], coordinate[1], { button: "middle" });
      }
      break;

    case "left_click_drag":
      if (action.start_coordinate && coordinate) {
        await page.mouse.move(action.start_coordinate[0], action.start_coordinate[1]);
        await page.mouse.down();
        await page.mouse.move(coordinate[0], coordinate[1]);
        await page.mouse.up();
      }
      break;

    case "type":
      if (text) {
        await page.keyboard.type(text, { delay: 30 });
      }
      break;

    case "key":
      if (key) {
        // Anthropic sends keys like "Return", "Tab", "space", etc.
        // Map to Playwright key names
        const keyMap = {
          Return: "Enter",
          space: " ",
          BackSpace: "Backspace",
          Delete: "Delete",
          Escape: "Escape",
          Tab: "Tab",
          Up: "ArrowUp",
          Down: "ArrowDown",
          Left: "ArrowLeft",
          Right: "ArrowRight",
        };
        const mappedKey = keyMap[key] || key;
        await page.keyboard.press(mappedKey);
      }
      break;

    case "scroll":
      if (coordinate && action.scroll_direction) {
        await page.mouse.move(coordinate[0], coordinate[1]);
        const delta = action.scroll_amount || 3;
        const pixels = delta * 100;
        if (action.scroll_direction === "down") {
          await page.mouse.wheel(0, pixels);
        } else if (action.scroll_direction === "up") {
          await page.mouse.wheel(0, -pixels);
        } else if (action.scroll_direction === "left") {
          await page.mouse.wheel(-pixels, 0);
        } else if (action.scroll_direction === "right") {
          await page.mouse.wheel(pixels, 0);
        }
      }
      break;

    case "wait":
      await page.waitForTimeout(1000);
      break;

    case "cursor_position":
      // Return current mouse position - not easily trackable, just return centre
      break;

    default:
      console.warn(`Unknown action type: ${type}`);
  }

  // After any action (except screenshot), wait for potential navigation/loading
  if (type !== "screenshot" && type !== "wait") {
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 3000 });
    } catch {
      // Timeout is fine - page may not be navigating
    }
  }

  return null;
}

export { VIEWPORT };
