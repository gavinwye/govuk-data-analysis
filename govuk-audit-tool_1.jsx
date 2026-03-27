import { useState, useCallback } from "react";

// Pre-seeded sample services from the GOV.UK services list
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

const STATUS = {
  IDLE: "idle",
  LOADING: "loading",
  DONE: "done",
  ERROR: "error",
};

const DATA_CATEGORIES = {
  identity: { label: "Identity", color: "#d4351c" },
  contact: { label: "Contact", color: "#1d70b8" },
  financial: { label: "Financial", color: "#00703c" },
  health: { label: "Health & medical", color: "#912b88" },
  location: { label: "Location", color: "#f47738" },
  credentials: { label: "Credentials & documents", color: "#0b0c0c" },
  eligibility: { label: "Eligibility & status", color: "#4c2c92" },
  consent: { label: "Consent & preferences", color: "#28a197" },
};

async function analyseService(service) {
  const prompt = `You are an expert in UK government digital services and data protection (GDPR/UK GDPR).

Analyse this GOV.UK service and provide a structured data collection audit:

Service name: ${service.name}
Service URL: ${service.url}
Organisation: ${service.organisation}
Topic: ${service.topic}

Based on your knowledge of this service, provide a JSON response ONLY (no markdown, no preamble) with this exact structure:

{
  "summary": "1-2 sentence overview of what personal data this service collects and why",
  "lawfulBasis": "The likely lawful basis under UK GDPR (e.g. Public task, Legal obligation, Contract, Consent)",
  "dataFields": [
    {
      "field": "Name of the data field (e.g. Full name, Date of birth)",
      "category": "One of: identity, contact, financial, health, location, credentials, eligibility, consent",
      "required": true or false,
      "purpose": "Brief purpose of collecting this field",
      "sensitive": true or false
    }
  ],
  "thirdPartySharing": ["List of organisations or types of organisations this data is likely shared with"],
  "retentionNote": "Brief note on likely data retention",
  "riskLevel": "low, medium, or high",
  "riskReason": "Brief reason for the risk rating"
}

Be precise and accurate. Only include data fields that are genuinely collected by this service.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  const text = data.content?.map(b => b.text || "").join("") || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

function RiskBadge({ level }) {
  const styles = {
    low: { bg: "#e8f5e9", color: "#00703c", border: "#00703c" },
    medium: { bg: "#fff7e6", color: "#f47738", border: "#f47738" },
    high: { bg: "#fde8e6", color: "#d4351c", border: "#d4351c" },
  };
  const s = styles[level] || styles.low;
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 3,
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: "0.02em",
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
      textTransform: "uppercase",
    }}>
      {level} risk
    </span>
  );
}

function CategoryTag({ category }) {
  const cat = DATA_CATEGORIES[category] || { label: category, color: "#505a5f" };
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 2,
      fontSize: 11,
      fontWeight: 700,
      background: cat.color + "18",
      color: cat.color,
      border: `1px solid ${cat.color}40`,
      marginRight: 4,
      marginBottom: 4,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
    }}>
      {cat.label}
    </span>
  );
}

function ServiceCard({ service, result, status, onAnalyse }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      border: "1px solid #b1b4b6",
      borderLeft: status === STATUS.DONE ? `4px solid ${result?.riskLevel === "high" ? "#d4351c" : result?.riskLevel === "medium" ? "#f47738" : "#00703c"}` : "4px solid #b1b4b6",
      marginBottom: 16,
      background: "#fff",
      transition: "border-color 0.3s",
    }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#0b0c0c", fontFamily: "'GDS Transport', Arial, sans-serif" }}>
              {service.name}
            </span>
            {status === STATUS.DONE && <RiskBadge level={result.riskLevel} />}
          </div>
          <div style={{ fontSize: 14, color: "#505a5f" }}>
            {service.organisation} · <span style={{ color: "#1d70b8" }}>{service.topic}</span>
          </div>
          {status === STATUS.DONE && (
            <div style={{ marginTop: 8, fontSize: 14, color: "#0b0c0c" }}>{result.summary}</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {status === STATUS.IDLE && (
            <button onClick={() => onAnalyse(service)} style={btnStyle("#1d70b8")}>
              Analyse
            </button>
          )}
          {status === STATUS.LOADING && (
            <button disabled style={btnStyle("#b1b4b6")}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Spinner /> Analysing…
              </span>
            </button>
          )}
          {status === STATUS.DONE && (
            <button onClick={() => setExpanded(e => !e)} style={btnStyle("#0b0c0c")}>
              {expanded ? "Hide details" : "View details"}
            </button>
          )}
          {status === STATUS.ERROR && (
            <button onClick={() => onAnalyse(service)} style={btnStyle("#d4351c")}>
              Retry
            </button>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {status === STATUS.DONE && expanded && (
        <div style={{ borderTop: "1px solid #e8e8e8", padding: "16px 20px" }}>

          {/* Categories summary */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#505a5f", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Data categories collected</div>
            <div>
              {[...new Set(result.dataFields.map(f => f.category))].map(cat => (
                <CategoryTag key={cat} category={cat} />
              ))}
            </div>
          </div>

          {/* Fields table */}
          <div style={{ marginBottom: 16, overflowX: "auto" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#505a5f", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Data fields</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f3f2f1" }}>
                  {["Field", "Category", "Required", "Sensitive", "Purpose"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#0b0c0c", borderBottom: "2px solid #b1b4b6", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.dataFields.map((f, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #e8e8e8", background: i % 2 === 0 ? "#fff" : "#f9f8f7" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600, color: "#0b0c0c" }}>{f.field}</td>
                    <td style={{ padding: "8px 12px" }}><CategoryTag category={f.category} /></td>
                    <td style={{ padding: "8px 12px", color: f.required ? "#00703c" : "#505a5f" }}>{f.required ? "Yes" : "No"}</td>
                    <td style={{ padding: "8px 12px", color: f.sensitive ? "#d4351c" : "#505a5f" }}>{f.sensitive ? "⚠ Yes" : "No"}</td>
                    <td style={{ padding: "8px 12px", color: "#505a5f" }}>{f.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Meta row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 12 }}>
            <MetaBox label="Lawful basis" value={result.lawfulBasis} />
            <MetaBox label="Data retention" value={result.retentionNote} />
            <MetaBox label="Risk reason" value={result.riskReason} accent={result.riskLevel === "high" ? "#d4351c" : result.riskLevel === "medium" ? "#f47738" : "#00703c"} />
          </div>

          {/* Third party sharing */}
          {result.thirdPartySharing?.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#505a5f", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Third-party sharing</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {result.thirdPartySharing.map((org, i) => (
                  <span key={i} style={{ padding: "3px 10px", background: "#f3f2f1", border: "1px solid #b1b4b6", fontSize: 13, color: "#0b0c0c", borderRadius: 2 }}>{org}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {status === STATUS.ERROR && (
        <div style={{ padding: "12px 20px", borderTop: "1px solid #e8e8e8", fontSize: 14, color: "#d4351c" }}>
          Failed to analyse this service. Please retry.
        </div>
      )}
    </div>
  );
}

function MetaBox({ label, value, accent }) {
  return (
    <div style={{ background: "#f3f2f1", padding: "10px 14px", borderLeft: `3px solid ${accent || "#b1b4b6"}` }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#505a5f", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#0b0c0c" }}>{value}</div>
    </div>
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
    background: bg,
    color: "#fff",
    border: "none",
    padding: "8px 16px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'GDS Transport', Arial, sans-serif",
    letterSpacing: "0.01em",
    whiteSpace: "nowrap",
  };
}

function SummaryBar({ results }) {
  const done = Object.values(results).filter(r => r.status === STATUS.DONE);
  if (done.length === 0) return null;

  const allFields = done.flatMap(r => r.data?.dataFields || []);
  const sensitiveCount = allFields.filter(f => f.sensitive).length;
  const highRisk = done.filter(r => r.data?.riskLevel === "high").length;
  const catCounts = {};
  allFields.forEach(f => { catCounts[f.category] = (catCounts[f.category] || 0) + 1; });
  const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div style={{ background: "#1d70b8", color: "#fff", padding: "16px 24px", marginBottom: 24, display: "flex", gap: 32, flexWrap: "wrap" }}>
      <Stat label="Services analysed" value={done.length} />
      <Stat label="Total data fields" value={allFields.length} />
      <Stat label="Sensitive fields" value={sensitiveCount} highlight={sensitiveCount > 0} />
      <Stat label="High-risk services" value={highRisk} highlight={highRisk > 0} />
      {topCat && <Stat label="Most common category" value={DATA_CATEGORIES[topCat[0]]?.label || topCat[0]} />}
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 700, color: highlight ? "#ffdd00" : "#fff", fontFamily: "'GDS Transport', Arial, sans-serif" }}>{value}</div>
      <div style={{ fontSize: 13, color: "#ffffffcc" }}>{label}</div>
    </div>
  );
}

export default function App() {
  const [services, setServices] = useState(SAMPLE_SERVICES);
  const [results, setResults] = useState({});
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [analysing, setAnalysing] = useState(false);

  const getKey = s => s.url;

  const analyseOne = useCallback(async (service) => {
    const key = getKey(service);
    setResults(r => ({ ...r, [key]: { status: STATUS.LOADING } }));
    try {
      const data = await analyseService(service);
      setResults(r => ({ ...r, [key]: { status: STATUS.DONE, data } }));
    } catch {
      setResults(r => ({ ...r, [key]: { status: STATUS.ERROR } }));
    }
  }, []);

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

  return (
    <div style={{ fontFamily: "'GDS Transport', Arial, sans-serif", background: "#f3f2f1", minHeight: "100vh" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        button:hover { opacity: 0.88; }
      `}</style>

      {/* GOV.UK-style header */}
      <div style={{ background: "#0b0c0c", padding: "12px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ background: "#fff", color: "#0b0c0c", fontWeight: 900, fontSize: 17, padding: "3px 8px", letterSpacing: "-0.01em" }}>GOV.UK</div>
        <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>Service Data Audit Tool</div>
      </div>

      {/* Phase banner */}
      <div style={{ background: "#1d70b8", padding: "6px 24px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ background: "#fff", color: "#1d70b8", fontWeight: 900, fontSize: 12, padding: "1px 6px" }}>BETA</span>
        <span style={{ color: "#fff", fontSize: 14 }}>Auditing personal data collected by UK government services using AI analysis</span>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 24px" }}>

        {/* Summary stats */}
        <SummaryBar results={results} />

        {/* Controls */}
        <div style={{ background: "#fff", border: "1px solid #b1b4b6", padding: "20px", marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 700, color: "#0b0c0c" }}>Add a service</h2>
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
            <span style={{ fontSize: 14, color: "#505a5f" }}>{services.length} services loaded · {Object.values(results).filter(r => r.status === STATUS.DONE).length} analysed</span>
            <button
              onClick={analyseAll}
              disabled={anyLoading || allDone}
              style={btnStyle(allDone ? "#b1b4b6" : "#d4351c")}
            >
              {anyLoading ? "Analysing all…" : allDone ? "All analysed" : `Analyse all ${services.length} services`}
            </button>
          </div>
        </div>

        {/* Service cards */}
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
                onAnalyse={analyseOne}
              />
            );
          })}
        </div>

        <div style={{ fontSize: 13, color: "#505a5f", marginTop: 24, borderTop: "1px solid #b1b4b6", paddingTop: 16 }}>
          Analysis is AI-generated based on publicly known service designs. Always verify findings against the service's own privacy notice. This tool is not a substitute for a formal Data Protection Impact Assessment (DPIA).
        </div>
      </div>
    </div>
  );
}
