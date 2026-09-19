import { useEffect, useState } from "react";
import {
  Users, ShieldCheck, KeyRound, UserX, TrendingUp, AlertTriangle,
  Server, Database, Mail, CheckCircle2, XCircle, CircleAlert,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area, BarChart as RBarChart, Bar, XAxis, CartesianGrid, Tooltip,
} from "recharts";
import client from "../../../api/client";
import PermissionsPanel from "../../../components/PermissionsPanel";
import "../styles/SystemAdminDashboard.css";

// Fixed categorical order (dataviz-validated, CVD-safe) — never cycled,
// never reassigned per filter. A 6th+ role folds into "Other".
const ROLE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const OTHER_COLOR = "#9a9993";

function formatDay(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Shared hover-tooltip shell, styled to match the app's card language —
// used by all three charts below so hovering a data point shows exactly
// what it represents instead of making the viewer eyeball pixel heights.
function ChartTooltip({ label, rows }) {
  return (
    <div className="sad-tooltip">
      {label && <div className="sad-tooltip-label">{label}</div>}
      {rows.map((r) => (
        <div className="sad-tooltip-row" key={r.name}>
          <span className="sad-tooltip-swatch" style={{ background: r.color }} />
          <span className="sad-tooltip-name">{r.name}</span>
          <span className="sad-tooltip-val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ slices, total }) {
  return (
    <div className="sad-donut-wrap">
      <ResponsiveContainer width="100%" height={150}>
        <PieChart>
          <Pie
            data={slices} dataKey="count" nameKey="role_name"
            innerRadius={52} outerRadius={72} paddingAngle={1.5} stroke="none"
          >
            {slices.map((s) => <Cell key={s.role_name} fill={s.color} />)}
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
      <div className="sad-donut-center">
        <span className="sad-donut-total">{total}</span>
        <span className="sad-donut-caption">total</span>
      </div>
    </div>
  );
}

function LineChart({ points }) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <AreaChart data={points} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="lineFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a78d6" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#2a78d6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#eef0f3" />
        <XAxis
          dataKey="date" tickFormatter={formatDay} axisLine={{ stroke: "#c3c2b7" }} tickLine={false}
          tick={{ fontSize: 12, fill: "#8a93a6", fontFamily: "Manrope, sans-serif" }}
          interval="preserveStartEnd"
        />
        <Tooltip
          cursor={{ stroke: "#c3c2b7", strokeDasharray: "3 3" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return <ChartTooltip label={formatDay(label)} rows={[{ name: "Accounts created", value: payload[0].value, color: "#2a78d6" }]} />;
          }}
        />
        <Area type="monotone" dataKey="count" stroke="#2a78d6" strokeWidth={2.5} fill="url(#lineFade)" activeDot={{ r: 4, fill: "#2a78d6" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function BarChart({ bars }) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <RBarChart data={bars} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="date" tickFormatter={(d) => formatDay(d).split(" ")[0]} axisLine={{ stroke: "#c3c2b7" }} tickLine={false}
          tick={{ fontSize: 12, fill: "#8a93a6", fontFamily: "Manrope, sans-serif" }}
          interval={bars.length > 4 ? 1 : 0}
        />
        <Tooltip
          cursor={{ fill: "#f5f7fa" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return <ChartTooltip label={formatDay(label)} rows={[{ name: "New requests", value: payload[0].value, color: "#eb6834" }]} />;
          }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {bars.map((b, i) => <Cell key={b.date} fill={i === bars.length - 1 ? "#d95926" : "#eb6834"} />)}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  );
}

const HEALTH_META = {
  online: { bg: "#dcfce7", fg: "#0ca30c", label: "Online" },
  connected: { bg: "#dcfce7", fg: "#0ca30c", label: "Connected" },
  reachable: { bg: "#dcfce7", fg: "#0ca30c", label: "Reachable" },
  unreachable: { bg: "#ffedd5", fg: "#b45309", label: "Unreachable" },
  not_configured: { bg: "#fbe7e5", fg: "#96271f", label: "Not configured" },
};

function HealthRow({ icon, name, sub, state }) {
  const meta = HEALTH_META[state];
  return (
    <div className="sad-health-row">
      <span className="sad-health-icon" style={{ background: meta.bg, color: meta.fg }}>{icon}</span>
      <div className="sad-health-text">
        <span className="sad-health-name">{name}</span>
        <span className="sad-health-sub">{sub}</span>
      </div>
      <span className="sad-health-badge" style={{ background: meta.bg, color: meta.fg }}>
        {state === "unreachable" || state === "not_configured" ? <CircleAlert size={11} /> : <CheckCircle2 size={11} />}
        {meta.label}
      </span>
    </div>
  );
}

function SystemAdminDashboard({ user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    client.get("/api/identity/admin-dashboard/")
      .then(({ data }) => setData(data))
      .catch(() => setError("Couldn't load the dashboard right now."));
  }, []);

  if (error) return <div className="sad-body"><p className="sad-error">{error}</p></div>;
  if (!data) return <div className="sad-body"><p className="sad-loading">Loading dashboard…</p></div>;

  const { kpis, role_distribution, new_accounts_trend, approvals_trend, system_health, recent_activity, permissions } = data;

  const roleSlices = role_distribution.slice(0, 5).map((r, i) => ({ ...r, color: ROLE_COLORS[i] }));
  const otherCount = role_distribution.slice(5).reduce((sum, r) => sum + r.count, 0);
  if (otherCount > 0) roleSlices.push({ role_name: "Other", count: otherCount, color: OTHER_COLOR });
  const roleTotal = roleSlices.reduce((sum, r) => sum + r.count, 0);

  const db = system_health.database;
  const dbLabel = db.mode === "shared" ? "Shared Database (Tailscale)" : "Local Database (fallback)";

  return (
    <div className="sad-body vet-page-enter">
      <div className="sad-page-head">
        <h1>System Administrator Dashboard</h1>
        <p>An overview of accounts, approvals, and system status across VetriOS.</p>
      </div>

      <div className="sad-kpi-row">
        <div className="sad-kpi-card">
          <div className="sad-kpi-top">
            <span className="sad-kpi-label">Total Users</span>
            <span className="sad-kpi-icon" style={{ background: "#e7f0f7", color: "#14486e" }}><Users size={16} /></span>
          </div>
          <div className="sad-kpi-value">{kpis.total_users}</div>
        </div>
        <div className="sad-kpi-card">
          <div className="sad-kpi-top">
            <span className="sad-kpi-label">Active Roles</span>
            <span className="sad-kpi-icon" style={{ background: "#e7f0f7", color: "#14486e" }}><ShieldCheck size={16} /></span>
          </div>
          <div className="sad-kpi-value">{kpis.active_roles}</div>
        </div>
        <div className="sad-kpi-card">
          <div className="sad-kpi-top">
            <span className="sad-kpi-label">Pending Requests</span>
            <span className="sad-kpi-icon" style={{ background: "#ffedd5", color: "#b45309" }}><KeyRound size={16} /></span>
          </div>
          <div className="sad-kpi-value">{kpis.pending_login_requests + kpis.pending_permission_requests}</div>
          <div className="sad-kpi-delta attn">
            <AlertTriangle size={12} />
            {kpis.pending_login_requests} login &middot; {kpis.pending_permission_requests} permission
          </div>
        </div>
        <div className="sad-kpi-card">
          <div className="sad-kpi-top">
            <span className="sad-kpi-label">No Login Yet</span>
            <span className="sad-kpi-icon" style={{ background: "#fbe7e5", color: "#96271f" }}><UserX size={16} /></span>
          </div>
          <div className="sad-kpi-value">{kpis.employees_without_login}</div>
          <div className="sad-kpi-delta"><span className="sad-muted">employees awaiting a login</span></div>
        </div>
      </div>

      <div className="sad-charts-row">
        <div className="sad-card">
          <div className="sad-card-head">
            <span className="sad-card-title">Role Distribution</span>
            <span className="sad-card-sub">{roleTotal} users</span>
          </div>
          <DonutChart slices={roleSlices} total={roleTotal} />
          <div className="sad-legend">
            {roleSlices.map((s) => (
              <div className="sad-legend-row" key={s.role_name}>
                <span className="sad-legend-swatch" style={{ background: s.color }} />
                <span className="sad-legend-name">{s.role_name}</span>
                <span className="sad-legend-val">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="sad-card">
          <div className="sad-card-head">
            <span className="sad-card-title">New Accounts</span>
            <span className="sad-card-sub">last 14 days</span>
          </div>
          <LineChart points={new_accounts_trend} />
          <div className="sad-legend-row" style={{ justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="sad-legend-swatch" style={{ background: "#2a78d6", borderRadius: "999px" }} />
              Accounts created / day
            </span>
            <span className="sad-legend-val">{new_accounts_trend.reduce((s, p) => s + p.count, 0)} total</span>
          </div>
        </div>

        <div className="sad-card">
          <div className="sad-card-head">
            <span className="sad-card-title">Approvals Trend</span>
            <span className="sad-card-sub">last 7 days</span>
          </div>
          <BarChart bars={approvals_trend} />
          <div className="sad-legend-row" style={{ justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="sad-legend-swatch" style={{ background: "#eb6834" }} />
              New requests / day
            </span>
            <span className="sad-legend-val">{approvals_trend[approvals_trend.length - 1]?.count ?? 0} today</span>
          </div>
        </div>
      </div>

      <div className="sad-bottom-row">
        <div className="sad-card">
          <div className="sad-card-head">
            <span className="sad-card-title">System Health</span>
            <span className="sad-card-sub">as of just now</span>
          </div>

          <HealthRow icon={<Server size={17} />} name="Backend API" sub="Django" state="online" />
          <HealthRow
            icon={<Database size={17} />}
            name={dbLabel}
            sub={db.host}
            state={db.connected ? "connected" : "unreachable"}
          />
          <HealthRow
            icon={<Mail size={17} />}
            name="Email Service"
            sub={system_health.email.backend.split(".").pop()}
            state={system_health.email.configured ? "online" : "not_configured"}
          />
        </div>

        <div className="sad-card">
          <div className="sad-card-head">
            <span className="sad-card-title">Recent Activity</span>
            <span className="sad-card-sub">your notifications</span>
          </div>
          {recent_activity.length === 0 ? (
            <p className="sad-loading">Nothing yet.</p>
          ) : (
            recent_activity.map((a, i) => (
              <div className="sad-activity-row" key={i}>
                <span className="sad-activity-icon" style={{ background: "#e7f0f7", color: "#14486e" }}>
                  <TrendingUp size={15} />
                </span>
                <div className="sad-activity-text">
                  <div className="sad-activity-title">{a.title}</div>
                  {a.message && <div className="sad-activity-sub">{a.message}</div>}
                </div>
                <span className="sad-activity-time">{formatTime(a.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <PermissionsPanel permissions={permissions} />
    </div>
  );
}

export default SystemAdminDashboard;
