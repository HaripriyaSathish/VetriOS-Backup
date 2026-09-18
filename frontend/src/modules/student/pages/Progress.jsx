import { useEffect, useState } from "react";
import client from "../../../api/client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = { PRESENT: "#16A34A", ABSENT: "#DC2626" };

function Progress() {
  const [assignments, setAssignments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      client.get("/api/student/assignments/"),
      client.get("/api/student/attendance/"),
    ]).then(([a, att]) => { setAssignments(a.data); setAttendance(att.data); }).finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <p className="p-6 text-gray-400">Loading…</p>;

  const scoreData = assignments
    .filter((a) => a.score != null)
    .sort((a, b) => new Date(a.submission_date) - new Date(b.submission_date))
    .map((a) => ({ label: a.title.length > 12 ? a.title.slice(0, 12) + "…" : a.title, score: a.score }));

  const present = attendance.filter((r) => r.attendance_status === "PRESENT").length;
  const absent = attendance.filter((r) => r.attendance_status === "ABSENT").length;
  const pieData = [
    { name: "Present", value: present, key: "PRESENT" },
    { name: "Absent", value: absent, key: "ABSENT" },
  ].filter((d) => d.value > 0);

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900">My Progress</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="font-semibold text-gray-900 mb-3">Score Trend</p>
          {scoreData.length === 0 ? (
            <p className="text-sm text-gray-400">No graded tasks yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={scoreData} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF2F0" />
                <XAxis dataKey="label" tick={{ fontSize: 12.5, fill: "#76777D" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12.5, fill: "#76777D" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [`${v} / 100`, "Score"]} />
                <Line type="monotone" dataKey="score" stroke="#16A34A" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="font-semibold text-gray-900 mb-3">Attendance Breakdown</p>
          {pieData.length === 0 ? (
            <p className="text-sm text-gray-400">No attendance data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {pieData.map((d) => <Cell key={d.key} fill={COLORS[d.key]} />)}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={28} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

export default Progress;