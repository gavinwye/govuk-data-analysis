# GOV.UK Service Data Audit Tool

A tool for identifying what personal data is collected by GOV.UK services and finding overlaps across services.

It analyses each service's user journey and lists every individual data field collected (e.g. "First name", "Postcode", "Sort code") rather than broad categories. Once multiple services are analysed, a cross-service overlap view shows which data fields are collected by more than one service.

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [Ollama](https://ollama.ai/) installed and running
- The `gemma3:4b` model pulled in Ollama

### Install Ollama and the model

1. Install Ollama from https://ollama.ai/
2. Pull the model:

```bash
ollama pull gemma3:4b
```

3. Make sure Ollama is running (it starts automatically on macOS after install)

## Getting started

```bash
git clone https://github.com/gavinwye/govuk-data-analysis.git
cd govuk-data-analysis
npm install
npm run dev
```

This starts a local dev server, typically at `http://localhost:5173/`.

## How to use

1. The tool comes pre-loaded with 8 sample GOV.UK services
2. Click **Analyse** on any service to identify the data it collects, or **Analyse all** to run them all
3. Click **Show fields** on an analysed service to see the full list of data fields
4. Once 2 or more services are analysed, use the **Data overlaps** tab to see which data fields are collected by multiple services

You can add additional services using the "Add a service" form at the top.

## How it works

The tool sends each service's details to a local Ollama model, which returns a structured list of every data field collected during the user journey. Field names are normalised and compared across services to identify overlaps.

All analysis runs locally on your machine — no data is sent to external APIs.

## Notes

- Analysis quality depends on the Ollama model used. Larger models (e.g. `gemma3:12b`) will produce more accurate results.
- Results are AI-generated based on publicly known service designs. Always verify findings against the service's own privacy notice.
- This tool is not a substitute for a formal Data Protection Impact Assessment (DPIA).
