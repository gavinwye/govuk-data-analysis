import express from "express";
import cors from "cors";
import { launchBrowser } from "./browser.js";
import { runAgentLoop } from "./agent-loop.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:5173", "https://statuesque-hummingbird-b3f62b.netlify.app"],
}));
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Main audit endpoint
app.post("/api/computer-use-audit", async (req, res) => {
  const { serviceName, serviceUrl, apiKey } = req.body;

  if (!serviceUrl) {
    return res.status(400).json({ error: "serviceUrl is required" });
  }
  if (!apiKey) {
    return res.status(400).json({ error: "apiKey is required" });
  }

  // Validate URL to prevent SSRF
  try {
    const parsed = new URL(serviceUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({ error: "Only http/https URLs are allowed" });
    }
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(parsed.hostname)) {
      return res.status(400).json({ error: "Local URLs are not allowed" });
    }
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  console.log(`\n[audit] Starting audit of: ${serviceName || serviceUrl}`);
  console.log(`[audit] URL: ${serviceUrl}`);

  let browser;
  try {
    const { browser: b, page } = await launchBrowser();
    browser = b;

    const result = await runAgentLoop(page, serviceUrl, apiKey, (progress) => {
      console.log(`[audit] Progress: step ${progress.iteration}/${progress.maxIterations}`);
    });

    console.log(`[audit] Completed: found ${result.dataFields?.length || 0} data fields`);

    res.json(result);
  } catch (err) {
    console.error(`[audit] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});

app.listen(PORT, () => {
  console.log(`\nGOV.UK Audit Server running on http://localhost:${PORT}`);
  console.log(`POST /api/computer-use-audit to audit a service\n`);
});
