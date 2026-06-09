import React, { useState, useMemo, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  Thermometer, Droplets, Sprout, Wind, Sun, Lightbulb,
  Fan, CloudFog, Waves, Activity, ChevronDown, Circle,
  Plus, LogOut, X, Lock, Loader2,
} from "lucide-react";

/* ----------------------------------------------------------------
   DEMO LOGIN CREDENTIALS  (client-side only — not real security)
-----------------------------------------------------------------*/
const DEMO_USER = "admin";
const DEMO_PASS = "greenhouse2026";

/* ----------------------------------------------------------------
   THEME
-----------------------------------------------------------------*/
const C = {
  bg: "#0e1512",
  panel: "#16201b",
  panel2: "#1c2a23",
  line: "#26352c",
  text: "#e8f0ea",
  dim: "#8aa394",
  faint: "#5d756a",
  green: "#7ee787",
  lime: "#b6f06a",
  temp: "#ff8a5c",
  hum: "#5cc8ff",
  soil: "#c9a36a",
  co2: "#c792ea",
  light: "#ffd66b",
};

/* ----------------------------------------------------------------
   SAMPLE DATA  (matches your Cosmos document schema exactly)
   Replace generateData() with a real fetch() to your /api/readings
-----------------------------------------------------------------*/
const DEVICES = ["GreenHouseID", "GreenHouse-A", "GreenHouse-B"];

function seeded(i, salt) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function generateData(deviceId, hours) {
  const now = Date.now();
  const stepMin = hours <= 6 ? 5 : hours <= 48 ? 30 : 120;
  const points = Math.floor((hours * 60) / stepMin);
  const salt = deviceId.length * 7;
  const rows = [];
  let soil = 60;
  for (let p = points; p >= 0; p--) {
    const t = now - p * stepMin * 60 * 1000;
    const d = new Date(t);
    const hod = d.getHours() + d.getMinutes() / 60;
    // diurnal sun curve 0..1 peaking ~13:00
    const sun = Math.max(0, Math.sin(((hod - 6) / 12) * Math.PI));
    const n = (k) => (seeded(p + k, salt) - 0.5);

    const lightPercent = Math.round(Math.min(100, Math.max(0, sun * 95 + n(1) * 6)));
    const temperature = +(17 + sun * 11 + n(2) * 1.4).toFixed(1);
    const humidity = +(82 - sun * 26 + n(3) * 4).toFixed(1);
    const co2Ppm = Math.round(700 + (1 - sun) * 260 + n(4) * 40);

    // soil dries through the day, pump refills when low
    soil -= 0.25 + sun * 0.35;
    let pumpRelayOn = false;
    if (soil < 40) { soil += 14; pumpRelayOn = true; }
    soil = Math.min(75, Math.max(30, soil + n(5) * 0.6));

    rows.push({
      deviceId,
      id: `${t}-${deviceId}`,
      temperature,
      humidity,
      soilPercent: Math.round(soil),
      co2Ppm,
      lightPercent,
      growLightOn: sun < 0.18,
      ventRelayOn: temperature > 26,
      co2RelayOn: co2Ppm > 900,
      pumpRelayOn,
      eventTime: d.toISOString(),
      _ts: Math.floor(t / 1000),
    });
  }
  return rows;
}

/* ----------------------------------------------------------------
   METRIC DEFINITIONS
-----------------------------------------------------------------*/
const METRICS = {
  temperature: { label: "Temperature", unit: "°C", color: C.temp, icon: Thermometer, min: 18, max: 28 },
  humidity: { label: "Humidity", unit: "%", color: C.hum, icon: Droplets, min: 50, max: 80 },
  soilPercent: { label: "Soil Moisture", unit: "%", color: C.soil, icon: Sprout, min: 40, max: 70 },
  co2Ppm: { label: "CO₂", unit: "ppm", color: C.co2, icon: Wind, min: 600, max: 1000 },
  lightPercent: { label: "Light", unit: "%", color: C.light, icon: Sun, min: 0, max: 100 },
};

const RANGES = [
  { key: 6, label: "6h" },
  { key: 24, label: "24h" },
  { key: 72, label: "3d" },
  { key: 168, label: "7d" },
];

const ACTUATORS = [
  { key: "growLightOn", label: "Grow Light", icon: Lightbulb },
  { key: "ventRelayOn", label: "Vent Relay", icon: Fan },
  { key: "co2RelayOn", label: "CO₂ Relay", icon: CloudFog },
  { key: "pumpRelayOn", label: "Pump Relay", icon: Waves },
];

/* ----------------------------------------------------------------
   COMPONENT
-----------------------------------------------------------------*/
function Dashboard({ reloadKey, onAddClick, onLogout, device, setDevice }) {
  const [hours, setHours] = useState(24);
  const [metric, setMetric] = useState("temperature");
  const [devOpen, setDevOpen] = useState(false);

  // Live data from the Azure Function API, with a graceful fallback to
  // generated sample data if the API is unreachable or returns nothing.
  const [data, setData] = useState(() => generateData(device, hours));

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/readings?deviceId=${encodeURIComponent(device)}&hours=${hours}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((rows) => {
        if (cancelled) return;
        setData(Array.isArray(rows) && rows.length ? rows : generateData(device, hours));
      })
      .catch(() => {
        if (!cancelled) setData(generateData(device, hours));
      });
    return () => { cancelled = true; };
  }, [device, hours, reloadKey]);

  const latest = data[data.length - 1];
  if (!latest) return <div style={{ color: "#8aa394", padding: 40, fontFamily: "monospace" }}>Loading…</div>;
  const m = METRICS[metric];

  const fmtTime = (iso) => {
    const d = new Date(iso);
    return hours <= 24
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const chartData = data.map((r) => ({
    t: fmtTime(r.eventTime),
    v: r[metric],
  }));

  const stats = useMemo(() => {
    const vals = data.map((r) => r[metric]);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return {
      avg: +avg.toFixed(1),
      min: +Math.min(...vals).toFixed(1),
      max: +Math.max(...vals).toFixed(1),
    };
  }, [data, metric]);

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif", padding: 0 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Archivo:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .gh-card { background: ${C.panel}; border: 1px solid ${C.line}; border-radius: 16px; }
        .gh-mono { font-family: 'IBM Plex Mono', monospace; }
        .gh-disp { font-family: 'Bricolage Grotesque', sans-serif; }
        .gh-btn { transition: all .15s ease; cursor: pointer; }
        .gh-btn:hover { filter: brightness(1.18); }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        .gh-live { animation: pulse 2s infinite; }
        .recharts-cartesian-axis-tick text { fill: ${C.faint}; font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
      `}</style>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 56px" }}>
        {/* HEADER */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.green}, ${C.lime})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Sprout size={20} color={C.bg} />
              </div>
              <h1 className="gh-disp" style={{ fontSize: 26, margin: 0, fontWeight: 800, letterSpacing: -0.5 }}>
                Smart Greenhouse
              </h1>
            </div>
            <p style={{ color: C.dim, margin: "8px 0 0", fontSize: 14 }}>
              Live telemetry from Azure Cosmos DB · IoT &amp; Cloud Technology
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.dim }}>
              <Circle className="gh-live" size={9} fill={C.green} color={C.green} />
              <span className="gh-mono">{new Date(latest.eventTime).toLocaleTimeString()}</span>
            </div>
            <button className="gh-btn" onClick={onAddClick}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 11, border: "none",
                background: `linear-gradient(135deg, ${C.green}, ${C.lime})`, color: C.bg, fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>
              <Plus size={17} /> Add reading
            </button>
            <button className="gh-btn" onClick={onLogout} title="Log out"
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", borderRadius: 11,
                background: C.panel2, color: C.dim, border: `1px solid ${C.line}`, fontSize: 14, fontFamily: "inherit" }}>
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* FILTER BAR */}
        <div className="gh-card" style={{ padding: 14, marginBottom: 22, display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center" }}>
          {/* device filter */}
          <div style={{ position: "relative" }}>
            <span style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Device</span>
            <button className="gh-btn" onClick={() => setDevOpen(!devOpen)}
              style={{ background: C.panel2, color: C.text, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontFamily: "inherit" }}>
              <span className="gh-mono">{device}</span>
              <ChevronDown size={15} color={C.dim} />
            </button>
            {devOpen && (
              <div className="gh-card" style={{ position: "absolute", top: "100%", marginTop: 6, zIndex: 20, width: "100%", padding: 6 }}>
                {DEVICES.map((d) => (
                  <div key={d} className="gh-btn gh-mono" onClick={() => { setDevice(d); setDevOpen(false); }}
                    style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, background: d === device ? C.panel2 : "transparent" }}>
                    {d}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ width: 1, height: 38, background: C.line }} />

          {/* timeline filter */}
          <div>
            <span style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Timeline</span>
            <div style={{ display: "flex", gap: 6 }}>
              {RANGES.map((r) => (
                <button key={r.key} className="gh-btn gh-mono" onClick={() => setHours(r.key)}
                  style={{
                    padding: "9px 16px", borderRadius: 10, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace",
                    border: `1px solid ${hours === r.key ? C.green : C.line}`,
                    background: hours === r.key ? "rgba(126,231,135,.12)" : C.panel2,
                    color: hours === r.key ? C.green : C.dim,
                  }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginLeft: "auto", fontSize: 12, color: C.faint }} className="gh-mono">
            {data.length} readings
          </div>
        </div>

        {/* METRIC CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 22 }}>
          {Object.entries(METRICS).map(([key, def]) => {
            const Icon = def.icon;
            const val = latest[key];
            const active = metric === key;
            return (
              <button key={key} className="gh-btn" onClick={() => setMetric(key)}
                style={{
                  textAlign: "left", padding: 18, borderRadius: 16, fontFamily: "inherit",
                  background: C.panel, color: C.text,
                  border: `1px solid ${active ? def.color : C.line}`,
                  boxShadow: active ? `0 0 0 1px ${def.color}, 0 8px 28px -12px ${def.color}` : "none",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 13, color: C.dim }}>{def.label}</span>
                  <Icon size={18} color={def.color} />
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                  <span className="gh-mono" style={{ fontSize: 30, fontWeight: 600, color: def.color }}>{val}</span>
                  <span style={{ fontSize: 13, color: C.faint }}>{def.unit}</span>
                </div>
                {/* mini range bar */}
                <div style={{ marginTop: 12, height: 5, borderRadius: 3, background: C.panel2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${Math.min(100, Math.max(4, ((val - def.min) / (def.max - def.min)) * 100))}%`,
                    background: def.color, borderRadius: 3,
                  }} />
                </div>
              </button>
            );
          })}
        </div>

        {/* MAIN CHART */}
        <div className="gh-card" style={{ padding: 22, marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <m.icon size={18} color={m.color} />
                <h2 className="gh-disp" style={{ fontSize: 19, margin: 0, fontWeight: 700 }}>{m.label} over time</h2>
              </div>
              <p style={{ color: C.faint, fontSize: 13, margin: "6px 0 0" }} className="gh-mono">
                {device} · last {RANGES.find((r) => r.key === hours)?.label}
              </p>
            </div>
            <div style={{ display: "flex", gap: 22 }}>
              {[["AVG", stats.avg], ["MIN", stats.min], ["MAX", stats.max]].map(([k, v]) => (
                <div key={k} style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>{k}</div>
                  <div className="gh-mono" style={{ fontSize: 18, color: C.text }}>{v}<span style={{ fontSize: 11, color: C.faint }}> {m.unit}</span></div>
                </div>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={m.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={m.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" tickLine={false} axisLine={{ stroke: C.line }} minTickGap={40} />
              <YAxis tickLine={false} axisLine={false} width={48} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
                labelStyle={{ color: C.dim }}
                itemStyle={{ color: m.color }}
                formatter={(v) => [`${v} ${m.unit}`, m.label]}
              />
              <ReferenceLine y={m.max} stroke={C.faint} strokeDasharray="4 4" strokeOpacity={0.5} />
              <ReferenceLine y={m.min} stroke={C.faint} strokeDasharray="4 4" strokeOpacity={0.5} />
              <Area type="monotone" dataKey="v" stroke={m.color} strokeWidth={2} fill="url(#grad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ACTUATORS */}
        <div className="gh-card" style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}>
            <Activity size={18} color={C.green} />
            <h2 className="gh-disp" style={{ fontSize: 19, margin: 0, fontWeight: 700 }}>Actuator status</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            {ACTUATORS.map((a) => {
              const on = latest[a.key];
              const Icon = a.icon;
              return (
                <div key={a.key} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: 16, borderRadius: 14,
                  background: C.panel2, border: `1px solid ${on ? C.green : C.line}`,
                }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center",
                    background: on ? "rgba(126,231,135,.14)" : C.panel,
                  }}>
                    <Icon size={20} color={on ? C.green : C.faint} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14 }}>{a.label}</div>
                    <div className="gh-mono" style={{ fontSize: 12, color: on ? C.green : C.faint, marginTop: 2 }}>
                      {on ? "● ON" : "○ OFF"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p style={{ textAlign: "center", color: C.faint, fontSize: 12, marginTop: 26 }} className="gh-mono">
          IoT &amp; Cloud Technology · Smart Greenhouse · Azure Cosmos DB
        </p>
      </div>
    </div>
  );
}

/* ================================================================
   LOGIN SCREEN  (hardcoded credentials — demo only)
================================================================= */
function Login({ onLogin }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (user === DEMO_USER && pass === DEMO_PASS) {
      setError("");
      onLogin();
    } else {
      setError("Invalid username or password");
    }
  };

  const field = {
    width: "100%", boxSizing: "border-box", padding: "12px 14px", marginTop: 6,
    background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 10,
    color: C.text, fontSize: 15, fontFamily: "'IBM Plex Mono', monospace", outline: "none",
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Archivo:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');`}</style>
      <div style={{ width: "100%", maxWidth: 380, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 20, padding: 34 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 6 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: `linear-gradient(135deg, ${C.green}, ${C.lime})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sprout size={22} color={C.bg} />
          </div>
          <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 23, margin: 0, color: C.text, fontWeight: 800 }}>
            Smart Greenhouse
          </h1>
        </div>
        <p style={{ color: C.dim, fontSize: 13, margin: "0 0 26px" }}>Sign in to view the dashboard</p>

        <label style={{ fontSize: 12, color: C.faint, letterSpacing: 0.5 }}>USERNAME</label>
        <input style={field} value={user} autoFocus
          onChange={(e) => setUser(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} />

        <div style={{ height: 16 }} />
        <label style={{ fontSize: 12, color: C.faint, letterSpacing: 0.5 }}>PASSWORD</label>
        <input style={field} type="password" value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} />

        {error && (
          <div style={{ color: "#ff7a7a", fontSize: 13, marginTop: 14 }}>{error}</div>
        )}

        <button className="gh-btn" onClick={submit}
          style={{ width: "100%", marginTop: 24, padding: "13px", borderRadius: 11, border: "none",
            background: `linear-gradient(135deg, ${C.green}, ${C.lime})`, color: C.bg, fontSize: 15, fontWeight: 700,
            fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
          <Lock size={16} /> Sign in
        </button>

        <p style={{ color: C.faint, fontSize: 11, marginTop: 18, textAlign: "center", lineHeight: 1.6 }} className="gh-mono">
          Demo login · admin / greenhouse2026
        </p>
      </div>
    </div>
  );
}

/* ================================================================
   ADD READING  — sets default values and writes a new doc to Cosmos
================================================================= */
const DEFAULTS = {
  temperature: 25.0, humidity: 70, soilPercent: 50,
  co2Ppm: 800, lightPercent: 50,
  growLightOn: false, ventRelayOn: false, co2RelayOn: false, pumpRelayOn: false,
};

function AddReadingModal({ device, onClose, onAdded }) {
  const [form, setForm] = useState({ ...DEFAULTS });
  const [status, setStatus] = useState("idle"); // idle | saving | error
  const [msg, setMsg] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const numFields = [
    ["temperature", "Temperature", "°C"],
    ["humidity", "Humidity", "%"],
    ["soilPercent", "Soil Moisture", "%"],
    ["co2Ppm", "CO₂", "ppm"],
    ["lightPercent", "Light", "%"],
  ];

  const save = async () => {
    setStatus("saving");
    setMsg("");
    try {
      const res = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: device,
          ...form,
          eventTime: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      onAdded();
      onClose();
    } catch (e) {
      setStatus("error");
      setMsg(e.message + " — is the Cosmos connection string set?");
    }
  };

  const field = {
    width: "100%", boxSizing: "border-box", padding: "10px 12px", marginTop: 5,
    background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 9,
    color: C.text, fontSize: 14, fontFamily: "'IBM Plex Mono', monospace", outline: "none",
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 18, padding: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 20, margin: 0, color: C.text, fontWeight: 700 }}>Add reading</h2>
          <button className="gh-btn" onClick={onClose} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer" }}><X size={20} /></button>
        </div>
        <p style={{ color: C.dim, fontSize: 13, margin: "0 0 20px" }} className="gh-mono">Inserts a document into Cosmos for {device}</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {numFields.map(([key, label, unit]) => (
            <div key={key}>
              <label style={{ fontSize: 12, color: C.faint }}>{label} ({unit})</label>
              <input style={field} type="number" value={form[key]}
                onChange={(e) => set(key, e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {ACTUATORS.map((a) => (
            <button key={a.key} className="gh-btn" onClick={() => set(a.key, !form[a.key])}
              style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 13px", borderRadius: 10,
                background: form[a.key] ? "rgba(126,231,135,.12)" : C.panel2,
                border: `1px solid ${form[a.key] ? C.green : C.line}`, color: form[a.key] ? C.green : C.dim,
                fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
              <a.icon size={16} /> {a.label}: {form[a.key] ? "ON" : "OFF"}
            </button>
          ))}
        </div>

        {status === "error" && (
          <div style={{ color: "#ff7a7a", fontSize: 13, marginTop: 16 }}>{msg}</div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button className="gh-btn" onClick={onClose}
            style={{ flex: 1, padding: 12, borderRadius: 11, background: C.panel2, color: C.dim, border: `1px solid ${C.line}`, fontSize: 14, fontFamily: "inherit", cursor: "pointer" }}>
            Cancel
          </button>
          <button className="gh-btn" onClick={save} disabled={status === "saving"}
            style={{ flex: 2, padding: 12, borderRadius: 11, border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: `linear-gradient(135deg, ${C.green}, ${C.lime})`, color: C.bg, fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
            {status === "saving" ? <Loader2 size={16} className="gh-live" /> : <Plus size={16} />}
            {status === "saving" ? "Saving…" : "Save to Cosmos DB"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   APP  — login gate + dashboard + add-reading modal
================================================================= */
export default function App() {
  const [authed, setAuthed] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [device, setDevice] = useState(DEVICES[0]);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <>
      <Dashboard
        reloadKey={reloadKey}
        device={device}
        setDevice={setDevice}
        onAddClick={() => setShowAdd(true)}
        onLogout={() => setAuthed(false)}
      />
      {showAdd && (
        <AddReadingModal
          device={device}
          onClose={() => setShowAdd(false)}
          onAdded={() => setReloadKey((k) => k + 1)}
        />
      )}
    </>
  );
}
