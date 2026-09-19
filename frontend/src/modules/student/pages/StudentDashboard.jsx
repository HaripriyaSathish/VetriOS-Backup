import { useEffect, useState } from "react";
import client from "../../../api/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const ATTENDANCE_COLOR = { PRESENT: "#16A34A", ABSENT: "#DC2626" };

function AttendanceRing({ percent }) {
  const size = 110, stroke = 10, radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = percent == null ? circumference : circumference - (percent / 100) * circumference;
  const color = percent >= 85 ? "#16A34A" : percent >= 60 ? "#D97706" : "#DC2626";
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="#EEF2F0" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} fill="none"
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset 1s ease" }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize="20" fontWeight="600" fill="#1E1B4B">
        {percent != null ? `${percent}%` : "—"}
      </text>
    </svg>
  );
}

function StatCard({ label, value, tone }) {
  const tones = { green: "text-green-600", red: "text-red-600", gray: "text-gray-900" };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className={`text-2xl font-bold ${tones[tone] || "text-gray-900"}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function Dashboard() {
  const [dash, setDash] = useState(null);
  const [attendance, setAttendance] = useState([]);

  useEffect(() => {
    Promise.all([
      client.get("/api/student/dashboard/"),
      client.get("/api/student/attendance/"),
    ]).then(([d, a]) => { setDash(d.data); setAttendance(a.data); }).catch(() => {});
  }, []);

  if (!dash) return <p className="p-6 text-gray-400">Loading your dashboard…</p>;

  const chartData = [...attendance].slice(0, 10).reverse().map((r) => ({
    date: r.attendance_date?.slice(5), value: 1, status: r.attendance_status,
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6">
      <div className="bg-green-50 rounded-xl px-5 py-4">
        <p className="text-sm text-green-800">
          Welcome back! You're enrolled in {dash.batch_name}, trained by {dash.trainer_name || "an unassigned trainer"}.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-center">
          <AttendanceRing percent={dash.attendance_percent} />
        </div>
        <StatCard label="Pending Tasks" value={dash.pending_tasks_count} tone="gray" />
        <StatCard label="Overdue" value={dash.overdue_tasks_count} tone={dash.overdue_tasks_count > 0 ? "red" : "gray"} />
        <StatCard label="Unread Messages" value={dash.unread_messages} tone="gray" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="font-semibold text-gray-900 mb-3">Attendance — Last 10 Days</p>
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-400">No attendance data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF2F0" />
              <XAxis dataKey="date" tick={{ fontSize: 12.5, fill: "#76777D" }} axisLine={false} tickLine={false} />
              <YAxis hide domain={[0, 1]} />
              <Tooltip formatter={(_, __, props) => [props.payload.status, "Status"]} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={28}>
                {chartData.map((d, i) => <Cell key={i} fill={ATTENDANCE_COLOR[d.status] || "#94A3B8"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default Dashboard;