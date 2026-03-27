# GOV.UK Service Data Audit Tool

A tool for identifying what personal data is collected by GOV.UK services and finding overlaps across services.

It analyses each service's user journey and lists every individual data field collected (e.g. "First name", "Postcode", "Sort code") rather than broad categories. Once multiple services are analysed, a cross-service overlap view shows which data fields are collected by more than one service.

## Example

![Screenshot showing the data fields collected by the Register to vote service, including First Name, Last Name, Date of Birth, Postcode, Email Address and more](screenshot.png)

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- One of the following AI providers:
  - **Ollama** (free, runs locally) — install from https://ollama.ai/
  - **Groq** (free tier, cloud) — get an API key at https://console.groq.com/keys
  - **Anthropic API key** — sign up at https://console.anthropic.com/

### Option 1: Ollama (local, free)

1. Install Ollama from https://ollama.ai/
2. Pull the model:

```bash
ollama pull gemma3:4b
```

3. Make sure Ollama is running (it starts automatically on macOS after install)

### Option 2: Groq (cloud, free tier)

No additional setup needed. Get a free API key at https://console.groq.com/keys and enter it in the app. This uses Gemma 2 9B hosted on Groq's infrastructure.

### Option 3: Anthropic API

No additional setup needed. You'll enter your API key in the app. This uses Claude Sonnet and will produce the highest quality results.

## Getting started

```bash
git clone https://github.com/gavinwye/govuk-data-analysis.git
cd govuk-data-analysis
npm install
npm run dev
```

This starts a local dev server, typically at `http://localhost:5173/`.

## How to use

1. Choose your AI provider at the top of the page (Ollama or Anthropic API)
2. The tool comes pre-loaded with 8 sample GOV.UK services
3. Click **Analyse** on any service to identify the data it collects, or **Analyse all** to run them all
4. Click **Show fields** on an analysed service to see the full list of data fields
5. Once 2 or more services are analysed, use the **Data overlaps** tab to see which data fields are collected by multiple services

You can add additional services using the "Add a service" form at the top. You can find a list of GOV.UK services at https://www.gov.uk/search/services.

## How it works

The tool sends each service's details to the chosen AI model, which returns a structured list of every data field collected during the user journey. Field names are normalised and compared across services to identify overlaps.

When using Ollama, all analysis runs locally on your machine. When using the Anthropic API, service names and URLs are sent to the Anthropic API for analysis.

## Notes

- Analysis quality depends on the model used. The Anthropic API (Claude Sonnet) will produce more detailed results than smaller local models. If using Ollama, larger models (e.g. `gemma3:12b`) will be more accurate than smaller ones.
- Results are AI-generated based on publicly known service designs. Always verify findings against the service's own privacy notice.
- This tool is not a substitute for a formal Data Protection Impact Assessment (DPIA).
