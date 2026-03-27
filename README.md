# GOV.UK Service Data Audit Tool

A tool for identifying what personal data is collected by GOV.UK services and finding overlaps across services.

It analyses each service's user journey and lists every individual data field collected (e.g. "First name", "Postcode", "Sort code") rather than broad categories. Once multiple services are analysed, a cross-service overlap view shows which data fields are collected by more than one service.

You can also try it at https://statuesque-hummingbird-b3f62b.netlify.app (requires a Groq or Anthropic API key).

## Example

![Screenshot showing all 8 sample services analysed, with data categories and field counts for each service](screenshot.png)

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- One of the following AI providers:
  - **Ollama** (free, runs locally) — install from https://ollama.ai/
  - **Groq** (free tier, cloud) — get an API key at https://console.groq.com/keys
  - **Anthropic API** — sign up at https://console.anthropic.com/

### Option 1: Ollama (local, free)

1. Install Ollama from https://ollama.ai/
2. Pull the model:

```bash
ollama pull gemma3:4b
```

3. Make sure Ollama is running (it starts automatically on macOS after install)

### Option 2: Groq (cloud, free tier)

No additional setup needed. Get a free API key at https://console.groq.com/keys and enter it in the app. This uses Llama 3.3 70B hosted on Groq's infrastructure.

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

1. Choose your AI provider at the top of the page (Ollama, Groq, or Anthropic API)
2. The tool comes pre-loaded with 8 sample GOV.UK services
3. Click **Analyse** on any service to identify the data it collects, or **Analyse all** to run them all
4. Click **Show fields** on an analysed service to see the full list of data fields
5. Once 2 or more services are analysed, use the **Data overlaps** tab to see which data fields are collected by multiple services

You can add additional services using the "Add a service" form. Find services to audit from the [GOV.UK services list](https://govuk-services-list.x-govuk.org/topic).

Results are saved to your browser's local storage, so they persist across page refreshes.

## How it works

The tool sends each service's name, URL, and organisation to the chosen AI model with a prompt asking it to list every data field collected by that service. The model responds based on its **training knowledge** of what the service collects — it does not visit the URL, scrape the live service, or read the service's actual privacy notice.

The prompt instructs the model to think through every page and step of the user journey and list each field at the most granular level (e.g. "First name", "Postcode", "Sort code" rather than "Name", "Address", "Bank details"). Each field is categorised, marked as required or optional, and tagged with the journey step that collects it.

Field names are then normalised and compared across services to identify overlaps in the "Data overlaps" view.

When using Ollama, all analysis runs locally on your machine. When using Groq or the Anthropic API, service names and URLs are sent to the respective API for analysis.

## Disclaimer

**The analysis is entirely AI-generated.** The tool does not access, scrape, or verify data against the live services. Results are based on what the AI model knows from its training data about each service's data collection practices. This means:

- Results may be incomplete, inaccurate, or out of date
- Fields listed may not reflect the current live service
- The tool may miss data fields or include fields that are no longer collected
- Accuracy varies depending on the AI model used

**Always verify findings against the service's own privacy notice and published forms.** This tool is intended as a starting point for analysis, not a definitive audit. It is not a substitute for a formal Data Protection Impact Assessment (DPIA).

## Notes

- Analysis quality depends on the model used. The Anthropic API (Claude Sonnet) will produce the most detailed results. Groq (Llama 3.3 70B) is a good free alternative. If using Ollama, larger models (e.g. `gemma3:12b`) will be more accurate than smaller ones.
