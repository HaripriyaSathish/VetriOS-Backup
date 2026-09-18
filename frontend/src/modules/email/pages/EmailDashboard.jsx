import { useEffect, useState } from "react";
import { Send, Clock, Layers, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, CartesianGrid, Tooltip,
} from "recharts";
import client from "../../../api/client";
import "../styles/Email.css";

// Fixed categorical order (same dataviz-validated set used across the
// other dashboards) — never cycled, never reassigned per data.
const TYPE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const OTHER_COLOR = "#9a9993";
const SENT_COLOR = "#2a78d6";

const BATCH_STATUS_META = {
  DRAFT: { label: "Draft", color: "#6b7280" },
  SCHEDULED: { label: "Scheduled", color: "#b45309" },
  PROCESSING: { label: "Processing", color: "#14486e" },
  COMPLETED: { label: "Completed", color: "#16a34a" },
  FAILED: { label: "Failed", color: "#96271f" },
};

function formatDay(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ChartTooltip({ label, rows }) {
  return (
    <div className="maild-tooltip">
      {label && <div className="maild-tooltip-label">{label}</div>}
      {rows.map((r) => (
        <div className="maild-tooltip-row" key={r.name}>
          <span className="maild-tooltip-swatch" style={{ background: r.color }} />
          <span className="maild-tooltip-name">{r.name}</span>
          <span className="maild-tooltip-val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function TypeDonut({ slices, total }) {
  return (
    <div className="maild-donut-wrap">
      <ResponsiveContainer width="100%" height={150}>
        <PieChart>
          <Pie data={slices} dataKey="count" nameKey="type_name" innerRadius={52} outerRadius={72} paddingAngle={1.5} stroke="none">
            {slices.map((s) => <Cell key={s.type_name} fill={s.color} />)}
          </Pie>
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0];
              const pct = total > 0 ? Math.round((p.value / total) * 100) : 0;
              return <ChartTooltip rows={[{ name: p.name, value: `${p.value} (${pct}%)`, color: p.payload.color }]} />;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="maild-donut-center">
        <span className="maild-donut-total">{total}</span>
        <span className="maild-donut-caption">typed</span>
      </div>
    </div>
  );
}

function SentTrendChart({ points }) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <AreaChart data={points} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="sentFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SENT_COLOR} stopOpacity="0.16" />
            <stop offset="100%" stopColor={SENT_COLOR} stopOpacity="0" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#eef0f3" />
        <XAxis
          dataKey="date" tickFormatter={formatDay} axisLine={{ stroke: "#c3c2b7" }} tickLine={false}
          tick={{ fontSize: 10.5, fill: "#8a93a6", fontFamily: "Manrope, sans-serif" }}
          interval="preserveStartEnd"
        />
        <Tooltip
          cursor={{ stroke: "#c3c2b7", strokeDasharray: "3 3" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return <ChartTooltip label={formatDay(label)} rows={[{ name: "Emails sent", value: payload[0].value, color: SENT_COLOR }]} />;
          }}
        />
        <Area type="monotone" dataKey="count" stroke={SENT_COLOR} strokeWidth={2.5} fill="url(#sentFade)" activeDot={{ r: 4, fill: SENT_COLOR }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function EmailDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    client.get("/api/email/dashboard/")
      .then(({ data }) => setStats(data))
      .catch(() => setError("Couldn't load email stats."));
  }, []);

  const typeSlices = stats
    ? (() => {
        const top = stats.emails_by_type.slice(0, 5).map((t, i) => ({ ...t, color: TYPE_COLORS[i] }));
        const otherCount = stats.emails_by_type.slice(5).reduce((s, t) => s + t.count, 0);
        if (otherCount > 0) top.push({ type_name: "Other", count: otherCount, color: OTHER_COLOR });
        return top;
      })()
    : [];
  const typeTotal = typeSlices.reduce((s, t) => s + t.count, 0);

  return (
    <div className="mail-screen">
      <div className="mail-head">
        <div>
          <span className="mail-eyebrow">Email</span>
          <h1>Overview</h1>
          <p>Draft, approve, and send emails backed by real templates and batches.</p>
        </div>
        <span className="mail-provider-badge">Gmail only</span>
      </div>

      {error && <div className="mail-error">{error}</div>}

      {stats && (
        <>
          <div className="mail-stat-row">
            <div className="mail-stat">
              <div className="mail-stat-icon navy"><Send size={18} /></div>
              <div>
                <div className="mail-stat-value">{stats.sent}</div>
                <div className="mail-stat-label">Sent</div>
              </div>
            </div>
            <div className="mail-stat">
              <div className="mail-stat-icon orange"><Clock size={18} /></div>
              <div>
                <div className="mail-stat-value">{stats.pending_approval}</div>
                <div className="mail-stat-label">Pending approval</div>
              </div>
            </div>
            <div className="mail-stat">
              <div className="mail-stat-icon green"><Layers size={18} /></div>
              <div>
                <div className="mail-stat-value">{stats.active_batches}</div>
                <div className="mail-stat-label">Active batches</div>
              </div>
            </div>
            <div className="mail-stat">
              <div className="mail-stat-icon rose"><AlertTriangle size={18} /></div>
              <div>
                <div className="mail-stat-value">{stats.failed}</div>
                <div className="mail-stat-label">Failed</div>
              </div>
            </div>
          </div>

          <div className="maild-charts-row">
            <div className="maild-card">
              <div className="maild-card-head">
                <span className="maild-card-title">Emails by Type</span>
                <span className="maild-card-sub">{typeTotal} typed</span>
              </div>
              {typeTotal === 0 ? (
                <p className="maild-loading">No typed emails yet.</p>
              ) : (
                <>
                  <TypeDonut slices={typeSlices} total={typeTotal} />
                  <div className="maild-legend">
                    {typeSlices.map((s) => (
                      <div className="maild-legend-row" key={s.type_name}>
                        <span className="maild-legend-swatch" style={{ background: s.color }} />
                        <span className="maild-legend-name">{s.type_name}</span>
                        <span className="maild-legend-val">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="maild-card">
              <div className="maild-card-head">
                <span className="maild-card-title">Emails Sent</span>
                <span className="maild-card-sub">last 14 days</span>
              </div>
              <SentTrendChart points={stats.sent_trend} />
            </div>

            <div className="maild-card">
              <div className="maild-card-head">
                <span className="maild-card-title">Batch Status</span>
                <span className="maild-card-sub">{stats.batch_status.reduce((s, b) => s + b.count, 0)} batches</span>
              </div>
              {stats.batch_status.length === 0 ? (
                <p className="maild-loading">No batches yet.</p>
              ) : (
                <div className="maild-pipeline">
                  {stats.batch_status.map((b) => {
                    const meta = BATCH_STATUS_META[b.status] || { label: b.status, color: "#6b7280" };
                    const max = Math.max(...stats.batch_status.map((x) => x.count), 1);
                    return (
                      <div className="maild-pipeline-row" key={b.status}>
                        <span className="maild-pipeline-label" style={{ color: meta.color }}>{meta.label}</span>
                        <div className="maild-pipeline-bar-track">
                          <div className="maild-pipeline-bar-fill" style={{ width: `${(b.count / max) * 100}%`, background: meta.color }} />
                        </div>
                        <span className="maild-pipeline-count">{b.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="maild-bottom-row">
            <div className="maild-card">
              <div className="maild-card-head">
                <span className="maild-card-title">Recent Batches</span>
                <span className="maild-card-sub">latest 5</span>
              </div>
              {stats.recent_batches.length === 0 ? (
                <p className="maild-loading">No batches yet.</p>
              ) : (
                stats.recent_batches.map((b, i) => (
                  <div className="maild-list-row" key={i}>
                    <span className="maild-list-icon" style={{ background: "#e7f0f7", color: "#14486e" }}><Layers size={15} /></span>
                    <div className="maild-list-text">
                      <div className="maild-list-title">{b.batch_name}</div>
                      <div className="maild-list-sub">{b.successful_emails}/{b.total_emails} sent{b.failed_emails > 0 ? ` · ${b.failed_emails} failed` : ""}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="maild-card">
              <div className="maild-card-head">
                <span className="maild-card-title">Recently Sent</span>
                <span className="maild-card-sub">latest 5</span>
              </div>
              {stats.recent_sent.length === 0 ? (
                <p className="maild-loading">Nothing sent yet.</p>
              ) : (
                stats.recent_sent.map((e, i) => (
                  <div className="maild-list-row" key={i}>
                    <span className="maild-list-icon" style={{ background: "#dcfce7", color: "#16a34a" }}><CheckCircle2 size={15} /></span>
                    <div className="maild-list-text">
                      <div className="maild-list-title">{e.subject}</div>
                      <div className="maild-list-sub">{e.recipient_email}</div>
                    </div>
                    <span className="maild-list-time">{formatTime(e.generated_at)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default EmailDashboard;
