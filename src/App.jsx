import { useState, useCallback, useMemo, useEffect } from "react";
import { supabase } from "./supabase";

function loadFromStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore quota errors */ }
}

const SAMPLE_SERVICES = [
  { name: "Register to vote", url: "https://www.gov.uk/register-to-vote", organisation: "Cabinet Office", topic: "Democracy" },
  { name: "Apply for a passport", url: "https://www.gov.uk/apply-renew-passport", organisation: "HM Passport Office", topic: "Passports, travel and living abroad" },
  { name: "Check or update your company car tax", url: "https://www.gov.uk/check-company-car-tax-calculator", organisation: "HMRC", topic: "Tax" },
  { name: "Apply for Universal Credit", url: "https://www.gov.uk/universal-credit/how-to-claim", organisation: "DWP", topic: "Benefits" },
  { name: "Renew vehicle tax", url: "https://www.gov.uk/renew-vehicle-tax", organisation: "DVLA", topic: "Driving and transport" },
  { name: "Check your State Pension forecast", url: "https://www.gov.uk/check-state-pension", organisation: "DWP", topic: "Pensions" },
  { name: "Apply for a DBS check", url: "https://www.gov.uk/request-copy-criminal-record", organisation: "DBS", topic: "Crime and justice" },
  { name: "Get a divorce", url: "https://www.gov.uk/apply-for-divorce", organisation: "HMCTS", topic: "Family" },
];

const STATUS = { IDLE: "idle", LOADING: "loading", DONE: "done", ERROR: "error" };

const DATA_CATEGORIES = {
  identity: { label: "Identity", color: "#d4351c" },
  contact: { label: "Contact", color: "#1d70b8" },
  financial: { label: "Financial", color: "#00703c" },
  health: { label: "Health & medical", color: "#912b88" },
  location: { label: "Location", color: "#f47738" },
  credentials: { label: "Credentials & documents", color: "#0b0c0c" },
  eligibility: { label: "Eligibility & status", color: "#4c2c92" },
  consent: { label: "Consent & preferences", color: "#28a197" },
  employment: { label: "Employment", color: "#505a5f" },
};

function buildPrompt(service) {
  return `List every individual data field collected from users by this GOV.UK service.

Service: ${service.name}
URL: ${service.url}
Organisation: ${service.organisation}

IMPORTANT: List each field at the most granular level. Do NOT group fields together.
For example, do NOT say "Name" - instead list "First name", "Middle name", "Last name" as separate fields.
Do NOT say "Address" - instead list "Address line 1", "Address line 2", "Town or city", "County", "Postcode", "Country" as separate fields.
Do NOT say "Bank details" - instead list "Account holder name", "Sort code", "Account number" as separate fields.
Do NOT say "Contact details" - instead list "Email address", "Phone number", "Mobile number" as separate fields.

Think through every page and step of the service journey. Include:
- Every form input field across all pages
- Reference numbers and identifiers (e.g. National Insurance number, passport number)
- Account/login details (e.g. email, password)
- Verification questions
- Declaration checkboxes and consent fields

Respond with JSON ONLY:

{
  "dataFields": [
    {
      "field": "The specific granular field name e.g. First name, Last name, Date of birth, Postcode, Sort code, National Insurance number",
      "category": "One of: identity, contact, financial, health, location, credentials, eligibility, consent, employment",
      "required": true or false,
      "step": "Which page or step collects this"
    }
  ]
}`;
}

async function analyseWithOllama(service) {
  const response = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemma3:4b",
      messages: [{ role: "user", content: buildPrompt(service) }],
      format: "json",
      stream: false,
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  const text = data.message?.content || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

async function analyseWithAnthropic(service, apiKey) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: buildPrompt(service) }],
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  const text = data.content?.map(b => b.text || "").join("") || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

async function analyseWithGroq(service, apiKey) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: buildPrompt(service) }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  const text = data.choices?.[0]?.message?.content || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

async function analyseService(service, provider, apiKey) {
  if (provider === "anthropic") return analyseWithAnthropic(service, apiKey);
  if (provider === "groq") return analyseWithGroq(service, apiKey);
  return analyseWithOllama(service);
}

function CategoryTag({ category }) {
  const cat = DATA_CATEGORIES[category] || { label: category, color: "#505a5f" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 2, fontSize: 11,
      fontWeight: 700, background: cat.color + "18", color: cat.color,
      border: `1px solid ${cat.color}40`, marginRight: 4, marginBottom: 4,
      letterSpacing: "0.04em", textTransform: "uppercase",
    }}>
      {cat.label}
    </span>
  );
}

function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: 14, height: 14,
      border: "2px solid #ccc", borderTopColor: "#1d70b8",
      borderRadius: "50%", animation: "spin 0.7s linear infinite",
    }} />
  );
}

function btnStyle(bg) {
  return {
    background: bg, color: "#fff", border: "none", padding: "8px 16px",
    fontSize: 14, fontWeight: 700, cursor: "pointer",
    fontFamily: "'GDS Transport', Arial, sans-serif", whiteSpace: "nowrap",
  };
}

function ServiceCard({ service, result, status, error, onAnalyse }) {
  const [expanded, setExpanded] = useState(false);
  const fields = result?.dataFields || [];

  return (
    <div style={{
      border: "1px solid #b1b4b6",
      borderLeft: status === STATUS.DONE ? "4px solid #1d70b8" : "4px solid #b1b4b6",
      marginBottom: 16, background: "#fff",
    }}>
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#0b0c0c" }}>{service.name}</span>
            {status === STATUS.DONE && (
              <span style={{ fontSize: 13, color: "#505a5f" }}>{fields.length} data fields</span>
            )}
          </div>
          <div style={{ fontSize: 14, color: "#505a5f" }}>
            {service.organisation} · <span style={{ color: "#1d70b8" }}>{service.topic}</span>
          </div>
          {status === STATUS.DONE && (
            <div style={{ marginTop: 8 }}>
              {[...new Set(fields.map(f => f.category))].map(cat => (
                <CategoryTag key={cat} category={cat} />
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {status === STATUS.IDLE && <button onClick={() => onAnalyse(service)} style={btnStyle("#1d70b8")}>Analyse</button>}
          {status === STATUS.LOADING && <button disabled style={btnStyle("#b1b4b6")}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><Spinner /> Analysing…</span></button>}
          {status === STATUS.DONE && <button onClick={() => setExpanded(e => !e)} style={btnStyle("#0b0c0c")}>{expanded ? "Hide fields" : "Show fields"}</button>}
          {status === STATUS.ERROR && <button onClick={() => onAnalyse(service)} style={btnStyle("#d4351c")}>Retry</button>}
        </div>
      </div>

      {status === STATUS.DONE && expanded && (
        <div style={{ borderTop: "1px solid #e8e8e8", padding: "16px 20px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f3f2f1" }}>
                {["Data field", "Category", "Required", "Journey step"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, borderBottom: "2px solid #b1b4b6", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #e8e8e8", background: i % 2 === 0 ? "#fff" : "#f9f8f7" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>{f.field}</td>
                  <td style={{ padding: "8px 12px" }}><CategoryTag category={f.category} /></td>
                  <td style={{ padding: "8px 12px", color: f.required ? "#00703c" : "#505a5f" }}>{f.required ? "Yes" : "No"}</td>
                  <td style={{ padding: "8px 12px", color: "#505a5f" }}>{f.step}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {status === STATUS.ERROR && (
        <div style={{ padding: "12px 20px", borderTop: "1px solid #e8e8e8", fontSize: 14, color: "#d4351c" }}>
          Failed: {error || "Unknown error"}. Please retry.
        </div>
      )}
    </div>
  );
}

function OverlapView({ services, results }) {
  const doneResults = useMemo(() => {
    const out = [];
    for (const s of services) {
      const r = results[s.url];
      if (r?.status === STATUS.DONE && r.data?.dataFields) {
        out.push({ service: s, fields: r.data.dataFields });
      }
    }
    return out;
  }, [services, results]);

  const overlapData = useMemo(() => {
    if (doneResults.length < 2) return null;

    // Normalise field names for matching
    const normalise = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();

    // Build a map: normalised field name -> list of services that collect it
    const fieldMap = {};
    for (const { service, fields } of doneResults) {
      for (const f of fields) {
        const key = normalise(f.field);
        if (!fieldMap[key]) fieldMap[key] = { displayName: f.field, category: f.category, services: [] };
        fieldMap[key].services.push(service.name);
      }
    }

    // Only keep fields collected by 2+ services
    const overlaps = Object.values(fieldMap)
      .filter(f => f.services.length >= 2)
      .sort((a, b) => b.services.length - a.services.length);

    return overlaps;
  }, [doneResults]);

  if (!overlapData || doneResults.length < 2) {
    return (
      <div style={{ background: "#fff", border: "1px solid #b1b4b6", padding: "20px", marginBottom: 24, color: "#505a5f", fontSize: 14 }}>
        Analyse at least 2 services to see data overlaps.
      </div>
    );
  }

  if (overlapData.length === 0) {
    return (
      <div style={{ background: "#fff", border: "1px solid #b1b4b6", padding: "20px", marginBottom: 24, fontSize: 14 }}>
        No overlapping data fields found across analysed services.
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #b1b4b6", padding: "20px", marginBottom: 24, overflowX: "auto" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#0b0c0c" }}>
        Data collected by multiple services
      </h2>
      <p style={{ margin: "0 0 16px", fontSize: 14, color: "#505a5f" }}>
        {overlapData.length} data fields are collected by 2 or more services
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: "#f3f2f1" }}>
            <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, borderBottom: "2px solid #b1b4b6" }}>Data field</th>
            <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, borderBottom: "2px solid #b1b4b6" }}>Category</th>
            <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, borderBottom: "2px solid #b1b4b6", whiteSpace: "nowrap" }}>No. of services</th>
            <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, borderBottom: "2px solid #b1b4b6" }}>Services</th>
          </tr>
        </thead>
        <tbody>
          {overlapData.map((f, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #e8e8e8", background: i % 2 === 0 ? "#fff" : "#f9f8f7" }}>
              <td style={{ padding: "8px 12px", fontWeight: 600 }}>{f.displayName}</td>
              <td style={{ padding: "8px 12px" }}><CategoryTag category={f.category} /></td>
              <td style={{ padding: "8px 12px", textAlign: "center" }}>
                <span style={{
                  display: "inline-block", minWidth: 24, padding: "2px 8px", borderRadius: 2,
                  background: f.services.length >= 4 ? "#d4351c" : f.services.length >= 3 ? "#f47738" : "#1d70b8",
                  color: "#fff", fontWeight: 700, fontSize: 13, textAlign: "center",
                }}>
                  {f.services.length}
                </span>
              </td>
              <td style={{ padding: "8px 12px", color: "#505a5f" }}>{f.services.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryBar({ services, results }) {
  const done = Object.values(results).filter(r => r.status === STATUS.DONE);
  if (done.length === 0) return null;

  const allFields = done.flatMap(r => r.data?.dataFields || []);
  const uniqueFields = new Set(allFields.map(f => f.field.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim()));
  const catCounts = {};
  allFields.forEach(f => { catCounts[f.category] = (catCounts[f.category] || 0) + 1; });
  const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div style={{ background: "#1d70b8", color: "#fff", padding: "16px 24px", marginBottom: 24, display: "flex", gap: 32, flexWrap: "wrap" }}>
      <Stat label="Services analysed" value={done.length} />
      <Stat label="Total data fields" value={allFields.length} />
      <Stat label="Unique data fields" value={uniqueFields.size} />
      {topCat && <Stat label="Most common category" value={DATA_CATEGORIES[topCat[0]]?.label || topCat[0]} />}
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 700, color: highlight ? "#ffdd00" : "#fff" }}>{value}</div>
      <div style={{ fontSize: 13, color: "#ffffffcc" }}>{label}</div>
    </div>
  );
}

export default function App() {
  const [services, setServices] = useState(() => loadFromStorage("audit-services", SAMPLE_SERVICES));
  const [results, setResults] = useState(() => loadFromStorage("audit-results", {}));
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [analysing, setAnalysing] = useState(false);
  const [view, setView] = useState("services");
  const [provider, setProvider] = useState(() => loadFromStorage("audit-provider", "ollama"));
  const [apiKey, setApiKey] = useState(() => loadFromStorage("audit-apikey", ""));
  const [dbLoaded, setDbLoaded] = useState(false);

  // Load existing results from Supabase on startup
  useEffect(() => {
    async function loadFromDb() {
      const { data, error } = await supabase
        .from("service_audits")
        .select("*");
      if (error || !data) { setDbLoaded(true); return; }

      setResults(prev => {
        const merged = { ...prev };
        const knownUrls = new Set(services.map(s => s.url));
        const newServices = [];

        for (const row of data) {
          // Add result
          merged[row.service_url] = {
            status: STATUS.DONE,
            data: { dataFields: row.data_fields },
          };
          // Add service if not already in the list
          if (!knownUrls.has(row.service_url)) {
            knownUrls.add(row.service_url);
            newServices.push({
              name: row.service_name,
              url: row.service_url,
              organisation: row.organisation || "Unknown",
              topic: row.topic || "Unknown",
            });
          }
        }

        if (newServices.length > 0) {
          setServices(s => [...s, ...newServices]);
        }
        return merged;
      });
      setDbLoaded(true);
    }
    loadFromDb();
  }, []);

  useEffect(() => { saveToStorage("audit-services", services); }, [services]);
  useEffect(() => { saveToStorage("audit-results", results); }, [results]);
  useEffect(() => { saveToStorage("audit-provider", provider); }, [provider]);
  useEffect(() => { saveToStorage("audit-apikey", apiKey); }, [apiKey]);

  const getKey = s => s.url;

  // Save a result to Supabase
  async function saveToDb(service, dataFields, usedProvider) {
    await supabase.from("service_audits").upsert({
      service_name: service.name,
      service_url: service.url,
      organisation: service.organisation,
      topic: service.topic,
      data_fields: dataFields,
      provider: usedProvider,
    }, { onConflict: "service_url" });
  }

  const analyseOne = useCallback(async (service) => {
    const key = getKey(service);
    setResults(r => ({ ...r, [key]: { status: STATUS.LOADING } }));
    try {
      const data = await analyseService(service, provider, apiKey);
      setResults(r => ({ ...r, [key]: { status: STATUS.DONE, data } }));
      saveToDb(service, data.dataFields, provider);
    } catch (err) {
      setResults(r => ({ ...r, [key]: { status: STATUS.ERROR, error: err.message } }));
    }
  }, [provider, apiKey]);

  const analyseAll = async () => {
    setAnalysing(true);
    for (const s of services) {
      const key = getKey(s);
      if (results[key]?.status === STATUS.DONE) continue;
      await analyseOne(s);
    }
    setAnalysing(false);
  };

  const addService = () => {
    if (!newUrl.trim()) return;
    const url = newUrl.trim().startsWith("http") ? newUrl.trim() : "https://" + newUrl.trim();
    const name = newName.trim() || new URL(url).hostname;
    setServices(s => [...s, { name, url, organisation: "Unknown", topic: "Unknown" }]);
    setNewUrl("");
    setNewName("");
  };

  const allDone = services.every(s => results[getKey(s)]?.status === STATUS.DONE);
  const anyLoading = services.some(s => results[getKey(s)]?.status === STATUS.LOADING);
  const doneCount = Object.values(results).filter(r => r.status === STATUS.DONE).length;

  return (
    <div style={{ fontFamily: "'GDS Transport', Arial, sans-serif", background: "#f3f2f1", minHeight: "100vh" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        button:hover { opacity: 0.88; }
      `}</style>

      <div style={{ background: "#0b0c0c", padding: "12px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ background: "#fff", color: "#0b0c0c", fontWeight: 900, fontSize: 17, padding: "3px 8px" }}>GOV.UK</div>
        <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>Service Data Audit Tool</div>
      </div>

      <div style={{ background: "#1d70b8", padding: "6px 24px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ background: "#fff", color: "#1d70b8", fontWeight: 900, fontSize: 12, padding: "1px 6px" }}>BETA</span>
        <span style={{ color: "#fff", fontSize: 14 }}>Identify what personal data is collected by government services and find overlaps</span>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px" }}>

        <SummaryBar services={services} results={results} />

        {/* AI provider settings */}
        <div style={{ background: "#fff", border: "1px solid #b1b4b6", padding: "20px", marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 700, color: "#0b0c0c" }}>AI provider</h2>
          <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
              <input type="radio" name="provider" value="ollama" checked={provider === "ollama"} onChange={() => setProvider("ollama")} />
              <strong>Ollama</strong> <span style={{ color: "#505a5f" }}>(local, free)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
              <input type="radio" name="provider" value="groq" checked={provider === "groq"} onChange={() => setProvider("groq")} />
              <strong>Groq</strong> <span style={{ color: "#505a5f" }}>(cloud, free tier)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
              <input type="radio" name="provider" value="anthropic" checked={provider === "anthropic"} onChange={() => setProvider("anthropic")} />
              <strong>Anthropic API</strong> <span style={{ color: "#505a5f" }}>(Claude, requires API key)</span>
            </label>
          </div>
          {provider === "ollama" && (
            <div style={{ fontSize: 13, color: "#505a5f" }}>
              Using gemma3:4b via Ollama on localhost:11434. Make sure Ollama is running.
            </div>
          )}
          {provider === "groq" && (
            <div>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Groq API key (gsk_...)"
                style={{ width: "100%", maxWidth: 500, padding: "8px 12px", border: "2px solid #0b0c0c", fontSize: 14, fontFamily: "inherit", marginBottom: 6 }}
              />
              {!apiKey && <div style={{ fontSize: 13, color: "#d4351c" }}>API key required — get a free one at <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" style={{ color: "#1d70b8" }}>console.groq.com/keys</a></div>}
            </div>
          )}
          {provider === "anthropic" && (
            <div>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Anthropic API key (sk-ant-...)"
                style={{ width: "100%", maxWidth: 500, padding: "8px 12px", border: "2px solid #0b0c0c", fontSize: 14, fontFamily: "inherit" }}
              />
              {!apiKey && <div style={{ fontSize: 13, color: "#d4351c", marginTop: 6 }}>API key required</div>}
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ background: "#fff", border: "1px solid #b1b4b6", padding: "20px", marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "#0b0c0c" }}>Add a service</h2>
          <p style={{ margin: "0 0 16px", fontSize: 14, color: "#505a5f" }}>
            Find services to audit from the <a href="https://govuk-services-list.x-govuk.org/topic" target="_blank" rel="noopener noreferrer" style={{ color: "#1d70b8" }}>GOV.UK services list</a>
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Service name (optional)"
              style={{ flex: "1 1 200px", padding: "8px 12px", border: "2px solid #0b0c0c", fontSize: 14, fontFamily: "inherit" }}
            />
            <input
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="Service URL e.g. https://www.gov.uk/apply-for-divorce"
              onKeyDown={e => e.key === "Enter" && addService()}
              style={{ flex: "2 1 320px", padding: "8px 12px", border: "2px solid #0b0c0c", fontSize: 14, fontFamily: "inherit" }}
            />
            <button onClick={addService} style={btnStyle("#00703c")}>Add service</button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontSize: 14, color: "#505a5f" }}>{services.length} services · {doneCount} analysed</span>
            <button
              onClick={analyseAll}
              disabled={anyLoading || allDone}
              style={btnStyle(allDone ? "#b1b4b6" : "#d4351c")}
            >
              {anyLoading ? "Analysing all…" : allDone ? "All analysed" : `Analyse all ${services.length} services`}
            </button>
          </div>
        </div>

        {/* View toggle */}
        {doneCount >= 2 && (
          <div style={{ display: "flex", gap: 0, marginBottom: 24 }}>
            {[
              { key: "services", label: "Services" },
              { key: "overlaps", label: "Data overlaps" },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                style={{
                  padding: "10px 20px", fontSize: 15, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'GDS Transport', Arial, sans-serif",
                  background: view === tab.key ? "#0b0c0c" : "#fff",
                  color: view === tab.key ? "#fff" : "#0b0c0c",
                  border: "1px solid #0b0c0c",
                  borderRight: tab.key === "services" ? "none" : "1px solid #0b0c0c",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {view === "services" && (
          <div>
            {services.map(service => {
              const key = getKey(service);
              const r = results[key] || { status: STATUS.IDLE };
              return (
                <ServiceCard
                  key={key}
                  service={service}
                  result={r.data}
                  status={r.status}
                  error={r.error}
                  onAnalyse={analyseOne}
                />
              );
            })}
          </div>
        )}

        {view === "overlaps" && (
          <OverlapView services={services} results={results} />
        )}

        <div style={{ fontSize: 13, color: "#505a5f", marginTop: 24, borderTop: "1px solid #b1b4b6", paddingTop: 16 }}>
          Analysis is AI-generated based on publicly known service designs. Always verify findings against the service's own privacy notice.
        </div>
      </div>
    </div>
  );
}
