import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, Palmtree, Briefcase, FileText, Mail, TrendingUp, FolderKanban } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import client from "../api/client";
import PermissionsPanel from "../components/PermissionsPanel";
import "../styles/CommonDashboard.css";

const PROJECT_STATUS_META = {
  Planned: { color: "#8a93a6", bg: "#f0f2f5" },
  Active: { color: "#16a34a", bg: "#dcfce7" },
  "On Hold": { color: "#b45309", bg: "#ffedd5" },
  Completed: { color: "#14486e", bg: "#e7f0f7" },
  Cancelled: { color: "#96271f", bg: "#fbe7e5" },
  Archived: { color: "#8a93a6", bg: "#f0f2f5" },
};
const DEFAULT_STATUS_META = { color: "#8a93a6", bg: "#f0f2f5" };

const ATTENDANCE_META = {
  PRESENT: { label: "Present", color: "#16a34a" },
  HALF_DAY: { label: "Half day", color: "#b45309" },
  ON_LEAVE: { label: "On leave", color: "#14486e" },
  ABSENT: { label: "Absent", color: "#96271f" },
};

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Small donut + legend, reused for both the project-status and attendance
// breakdowns — only the slices and total caption differ.
function MiniDonut({ slices, total, caption }) {
  return (
    <div className="cmnd-project-layout">
      <div className="cmnd-project-donut-wrap">
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Pie data={slices} dataKey="count" nameKey="label" innerRadius={44} outerRadius={62} paddingAngle={2} stroke="none">
              {slices.map((s) => <Cell key={s.label} fill={s.color} />)}
            </Pie>
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0];
                return (
                  <div className="cmnd-tooltip">
                    <span className="cmnd-tooltip-swatch" style={{ background: p.payload.color }} />
                    {p.name}: <strong>{p.value}</strong>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="cmnd-project-donut-center">
          <span className="cmnd-project-donut-total">{total}</span>
          {caption && <span className="cmnd-project-donut-caption">{caption}</span>}
        </div>
      </div>

      <div className="cmnd-project-legend">
        {slices.map((s) => (
          <div className="cmnd-project-legend-row" key={s.label}>
            <span className="cmnd-project-legend-swatch" style={{ background: s.color }} />
            <span className="cmnd-project-legend-name">{s.label}</span>
            <span className="cmnd-project-legend-val">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Shared landing page for every role except System Administrator (which
// gets its own KPI/charts dashboard) — built from things true for any
// login: what you can actually do here (permissions), where to go next
// (quick links to whatever this user can access), and what's happened
// for you lately (your own notifications, no module filter).
function CommonDashboard({ user }) {
  const [activity, setActivity] = useState(null);
  const [projects, setProjects] = useState(null);
  const [attendance, setAttendance] = useState(null);

  useEffect(() => {
    client.get("/api/identity/my-activity/").then(({ data }) => setActivity(data)).catch(() => setActivity([]));
    // Read-only — module_05_clients_projects' own existing endpoint
    // (the same one Sidebar.jsx already calls to decide project nav
    // visibility), not a new endpoint of ours.
    client.get("/api/projects/me/").then(({ data }) => setProjects(data)).catch(() => setProjects([]));
    // Same endpoint the "My Attendance" page (/my/attendance) already uses.
    if (user.employee_code) {
      client.get("/api/hr/attendance/me/").then(({ data }) => setAttendance(data)).catch(() => setAttendance(null));
    }
  }, [user.employee_code]);

  const roles = user.roles || [];
  const permissions = user.permissions || [];
  const hasProjects = (projects?.length ?? 0) > 0;
  const hasAttendance = (attendance?.history?.length ?? 0) > 0;

  const statusCounts = hasProjects
    ? Object.entries(
        projects.reduce((acc, p) => {
          acc[p.status] = (acc[p.status] || 0) + 1;
          return acc;
        }, {})
      ).map(([status, count]) => ({ status, label: status, count, ...(PROJECT_STATUS_META[status] || DEFAULT_STATUS_META) }))
    : [];

  const attendanceCounts = hasAttendance
    ? Object.entries(
        attendance.history.reduce((acc, day) => {
          acc[day.status] = (acc[day.status] || 0) + 1;
          return acc;
        }, {})
      )
        .filter(([status]) => ATTENDANCE_META[status])
        .map(([status, count]) => ({ status, count, ...ATTENDANCE_META[status] }))
    : [];
  const attendanceTotal = attendanceCounts.reduce((s, x) => s + x.count, 0);

  const quickLinks = [
    user.employee_code && { to: "/my/attendance", label: "My Attendance", icon: CalendarCheck, color: "#14486e", bg: "#e7f0f7" },
    user.employee_code && { to: "/my/leave", label: "My Leave", icon: Palmtree, color: "#16a34a", bg: "#dcfce7" },
    roles.includes("HR Administrator") && { to: "/hr", label: "HR", icon: Briefcase, color: "#b45309", bg: "#ffedd5" },
    permissions.includes("DOCUMENT_VIEW") && { to: "/documents", label: "Document Generator", icon: FileText, color: "#2a6fd6", bg: "#e8f1fc" },
    { to: "/email", label: "Email", icon: Mail, color: "#be5985", bg: "#fbe9f0" },
    hasProjects && { to: "/project/dashboard", label: "Project Management", icon: FolderKanban, color: "#7c3aed", bg: "#ece9f7" },
  ].filter(Boolean);

  return (
    <div className="cmnd-body">
      <div className="cmnd-page-head">
        <h1>Welcome, {user.full_name}</h1>
        <p>
          {user.designation ? `${user.designation} · ` : ""}
          {roles.join(", ") || "No role assigned yet"}
        </p>
      </div>

      {quickLinks.length > 0 && (
        <div className="cmnd-quicklinks">
          {quickLinks.map((q) => (
            <Link to={q.to} className="cmnd-quicklink" key={q.to}>
              <span className="cmnd-quicklink-icon" style={{ background: q.bg, color: q.color }}>
                <q.icon size={18} />
              </span>
              <span className="cmnd-quicklink-label">{q.label}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="cmnd-top-row">
        <div className="cmnd-top-graphs">
          {hasAttendance && (
            <div className="cmnd-card">
              <div className="cmnd-card-head">
                <span className="cmnd-card-title">My Attendance</span>
                <span className="cmnd-card-sub">last {attendance.history.length} days</span>
              </div>
              <MiniDonut slices={attendanceCounts} total={attendanceTotal} caption="days" />
            </div>
          )}

          {hasProjects && (
            <div className="cmnd-card">
              <div className="cmnd-card-head">
                <span className="cmnd-card-title">My Projects</span>
                <span className="cmnd-card-sub">{projects.length} assigned</span>
              </div>

              <MiniDonut slices={statusCounts} total={projects.length} />

              {projects.map((p) => {
                const meta = PROJECT_STATUS_META[p.status] || DEFAULT_STATUS_META;
                return (
                  <Link to="/project/dashboard" className="cmnd-project-row" key={p.project_id}>
                    <span className="cmnd-project-icon"><FolderKanban size={15} /></span>
                    <div className="cmnd-activity-text">
                      <div className="cmnd-activity-title">{p.project_name}</div>
                      <div className="cmnd-activity-sub">{p.client_name} · {p.my_role}</div>
                    </div>
                    <span className="cmnd-project-status" style={{ background: meta.bg, color: meta.color }}>{p.status}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <PermissionsPanel permissions={permissions} />
      </div>

      <div className="cmnd-card">
        <div className="cmnd-card-head">
          <span className="cmnd-card-title">Recent Activity</span>
          <span className="cmnd-card-sub">your notifications</span>
        </div>
        {activity === null ? (
          <p className="cmnd-loading">Loading…</p>
        ) : activity.length === 0 ? (
          <p className="cmnd-loading">Nothing yet.</p>
        ) : (
          activity.map((a, i) => (
            <div className="cmnd-activity-row" key={i}>
              <span className="cmnd-activity-icon"><TrendingUp size={15} /></span>
              <div className="cmnd-activity-text">
                <div className="cmnd-activity-title">{a.title}</div>
                {a.message && <div className="cmnd-activity-sub">{a.message}</div>}
              </div>
              <span className="cmnd-activity-time">{formatTime(a.created_at)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default CommonDashboard;
