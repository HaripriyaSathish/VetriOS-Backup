import { useEffect, useState } from "react";
import {
  Users, UserCheck, CalendarClock, UserX, TrendingUp, Award,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import client from "../../../api/client";
import "../styles/HROverview.css";

const DEPT_COLOR = "#2a78d6";
const LEAVE_COLOR = "#eb6834";

const ATTENDANCE_META = {
  PRESENT: { label: "Present", color: "#16a34a" },
  HALF_DAY: { label: "Half day", color: "#b45309" },
  ON_LEAVE: { label: "On leave", color: "#14486e" },
  ABSENT: { label: "Absent", color: "#96271f" },
  NO_LOGIN: { label: "No login", color: "#6b7280" },
};

const PIPELINE_META = {
  NOT_STARTED: { label: "Not started", color: "#6b7280", bg: "#f0f2f5" },
  IN_PROGRESS: { label: "In progress", color: "#b45309", bg: "#ffedd5" },
  COMPLETED: { label: "Completed", color: "#16a34a", bg: "#dcfce7" },
};

function formatDay(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ChartTooltip({ label, rows }) {
  return (
    <div className="hrd-tooltip">
      {label && <div className="hrd-tooltip-label">{label}</div>}
      {rows.map((r) => (
        <div className="hrd-tooltip-row" key={r.name}>
          <span className="hrd-tooltip-swatch" style={{ background: r.color }} />
          <span className="hrd-tooltip-name">{r.name}</span>
          <span className="hrd-tooltip-val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// Horizontal bars — the department name sits directly beside its own
// bar on the y-axis, so a long name (e.g. "Training and Development")
// just reads left-to-right on its own row instead of fighting its
// neighbors for space underneath a narrow vertical bar.
function DepartmentBarChart({ rows }) {
  const height = Math.max(150, rows.length * 38);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category" dataKey="department_name" width={120}
          axisLine={{ stroke: "#c3c2b7" }} tickLine={false}
          tick={{ fontSize: 11, fill: "#3a4152", fontFamily: "Manrope, sans-serif" }}
        />
        <Tooltip
          cursor={{ fill: "#f3f5f8" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return <ChartTooltip label={label} rows={[{ name: "Employees", value: payload[0].value, color: DEPT_COLOR }]} />;
          }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} fill={DEPT_COLOR} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function LeaveTrendChart({ points }) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <AreaChart data={points} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="leaveFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={LEAVE_COLOR} stopOpacity="0.18" />
            <stop offset="100%" stopColor={LEAVE_COLOR} stopOpacity="0" />
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
            return <ChartTooltip label={formatDay(label)} rows={[{ name: "Leave requests", value: payload[0].value, color: LEAVE_COLOR }]} />;
          }}
        />
        <Area type="monotone" dataKey="count" stroke={LEAVE_COLOR} strokeWidth={2.5} fill="url(#leaveFade)" activeDot={{ r: 4, fill: LEAVE_COLOR }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function AttendanceDonut({ counts }) {
  const slices = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({ key, count, ...ATTENDANCE_META[key] }));
  const total = slices.reduce((s, x) => s + x.count, 0);

  return (
    <div className="hrd-donut-wrap">
      <ResponsiveContainer width="100%" height={150}>
        <PieChart>
          <Pie data={slices} dataKey="count" nameKey="label" innerRadius={52} outerRadius={72} paddingAngle={1.5} stroke="none">
            {slices.map((s) => <Cell key={s.key} fill={s.color} />)}
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
      <div className="hrd-donut-center">
        <span className="hrd-donut-total">{total}</span>
        <span className="hrd-donut-caption">active</span>
      </div>
    </div>
  );
}

function HROverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    client.get("/api/hr/dashboard/")
      .then(({ data }) => setData(data))
      .catch(() => setError("Couldn't load the dashboard right now."));
  }, []);

  if (error) return <div className="hrd-body"><p className="hrd-error">{error}</p></div>;
  if (!data) return <div className="hrd-body"><p className="hrd-loading">Loading dashboard…</p></div>;

  const { kpis, attendance_today, headcount_by_department, leave_trend, onboarding_pipeline, pending_promotions, recent_activity } = data;
  const pipelineTotal = Object.values(onboarding_pipeline).reduce((s, n) => s + n, 0);

  return (
    <div className="hrd-body">
      <div className="hrd-page-head">
        <h1>HR Dashboard</h1>
        <p>An overview of headcount, attendance, and requests across VetriOS.</p>
      </div>

      <div className="hrd-kpi-row">
        <div className="hrd-kpi-card">
          <div className="hrd-kpi-top">
            <span className="hrd-kpi-label">Active Employees</span>
            <span className="hrd-kpi-icon" style={{ background: "#e7f0f7", color: "#14486e" }}><Users size={16} /></span>
          </div>
          <div className="hrd-kpi-value">{kpis.total_active_employees}</div>
        </div>
        <div className="hrd-kpi-card">
          <div className="hrd-kpi-top">
            <span className="hrd-kpi-label">Present Today</span>
            <span className="hrd-kpi-icon" style={{ background: "#dcfce7", color: "#16a34a" }}><UserCheck size={16} /></span>
          </div>
          <div className="hrd-kpi-value">{kpis.present_today}</div>
        </div>
        <div className="hrd-kpi-card">
          <div className="hrd-kpi-top">
            <span className="hrd-kpi-label">Pending Leave</span>
            <span className="hrd-kpi-icon" style={{ background: "#ffedd5", color: "#b45309" }}><CalendarClock size={16} /></span>
          </div>
          <div className="hrd-kpi-value">{kpis.pending_leave_requests}</div>
        </div>
        <div className="hrd-kpi-card">
          <div className="hrd-kpi-top">
            <span className="hrd-kpi-label">No Login Yet</span>
            <span className="hrd-kpi-icon" style={{ background: "#fbe7e5", color: "#96271f" }}><UserX size={16} /></span>
          </div>
          <div className="hrd-kpi-value">{kpis.employees_without_login}</div>
        </div>
      </div>

      <div className="hrd-charts-row">
        <div className="hrd-card">
          <div className="hrd-card-head">
            <span className="hrd-card-title">Headcount by Department</span>
            <span className="hrd-card-sub">{kpis.total_active_employees} active</span>
          </div>
          {headcount_by_department.length === 0 ? (
            <p className="hrd-loading">No department data yet.</p>
          ) : (
            <DepartmentBarChart rows={headcount_by_department} />
          )}
        </div>

        <div className="hrd-card">
          <div className="hrd-card-head">
            <span className="hrd-card-title">Leave Requests</span>
            <span className="hrd-card-sub">last 7 days</span>
          </div>
          <LeaveTrendChart points={leave_trend} />
        </div>

        <div className="hrd-card">
          <div className="hrd-card-head">
            <span className="hrd-card-title">Today's Attendance</span>
            <span className="hrd-card-sub">as of just now</span>
          </div>
          <AttendanceDonut counts={attendance_today} />
          <div className="hrd-legend">
            {Object.entries(attendance_today).filter(([, c]) => c > 0).map(([key, count]) => (
              <div className="hrd-legend-row" key={key}>
                <span className="hrd-legend-swatch" style={{ background: ATTENDANCE_META[key].color }} />
                <span className="hrd-legend-name">{ATTENDANCE_META[key].label}</span>
                <span className="hrd-legend-val">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="hrd-bottom-row">
        <div className="hrd-card">
          <div className="hrd-card-head">
            <span className="hrd-card-title">Pending Promotions</span>
            <span className="hrd-card-sub">{pending_promotions.length} awaiting approval</span>
          </div>
          {pending_promotions.length === 0 ? (
            <p className="hrd-loading">Nothing pending.</p>
          ) : (
            pending_promotions.map((p, i) => (
              <div className="hrd-list-row" key={i}>
                <span className="hrd-list-icon" style={{ background: "#e7f0f7", color: "#14486e" }}><Award size={15} /></span>
                <div className="hrd-list-text">
                  <div className="hrd-list-title">{p.employee_name}</div>
                  <div className="hrd-list-sub">→ {p.new_designation}</div>
                </div>
                <span className="hrd-list-time">{p.effective_date}</span>
              </div>
            ))
          )}
        </div>

        <div className="hrd-card">
          <div className="hrd-card-head">
            <span className="hrd-card-title">Onboarding Pipeline</span>
            <span className="hrd-card-sub">{pipelineTotal} interns</span>
          </div>
          {pipelineTotal === 0 ? (
            <p className="hrd-loading">No interns onboarding right now.</p>
          ) : (
            <div className="hrd-pipeline">
              {Object.entries(onboarding_pipeline).map(([key, count]) => (
                <div className="hrd-pipeline-row" key={key}>
                  <span className="hrd-pipeline-label" style={{ color: PIPELINE_META[key].color }}>{PIPELINE_META[key].label}</span>
                  <div className="hrd-pipeline-bar-track">
                    <div
                      className="hrd-pipeline-bar-fill"
                      style={{ width: `${pipelineTotal ? (count / pipelineTotal) * 100 : 0}%`, background: PIPELINE_META[key].color }}
                    />
                  </div>
                  <span className="hrd-pipeline-count" style={{ background: PIPELINE_META[key].bg, color: PIPELINE_META[key].color }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="hrd-card">
          <div className="hrd-card-head">
            <span className="hrd-card-title">Recent Activity</span>
            <span className="hrd-card-sub">your notifications</span>
          </div>
          {recent_activity.length === 0 ? (
            <p className="hrd-loading">Nothing yet.</p>
          ) : (
            recent_activity.map((a, i) => (
              <div className="hrd-list-row" key={i}>
                <span className="hrd-list-icon" style={{ background: "#e7f0f7", color: "#14486e" }}><TrendingUp size={15} /></span>
                <div className="hrd-list-text">
                  <div className="hrd-list-title">{a.title}</div>
                  {a.message && <div className="hrd-list-sub">{a.message}</div>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default HROverview;
