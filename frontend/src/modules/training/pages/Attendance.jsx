import { useEffect, useState } from "react";
import client from "../../../api/client";

function Attendance() {
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [roster, setRoster] = useState([]);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [statusByEnrollment, setStatusByEnrollment] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    client.get("/api/training/dashboard/").then(({ data }) => {
      setBatches(data.batches || []);
      setLoading(false);
    }).catch((err) => {
      setError(err.response?.data?.detail || "Couldn't load your batches.");
      setLoading(false);
    });
  }, []);

  const loadRoster = async (batchId) => {
    if (!batchId) {
      setRoster([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await client.get(`/api/training/batches/${batchId}/roster/`);
      setRoster(data);
      const defaults = {};
      data.forEach((r) => { defaults[r.enrollment_id] = "PRESENT"; });
      setStatusByEnrollment(defaults);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't load roster.");
    } finally {
      setLoading(false);
    }
  };

  const handleBatchChange = (batchId) => {
    setSelectedBatchId(batchId);
    setSaveMessage("");
    loadRoster(batchId);
  };

  const toggleStatus = (enrollmentId) => {
    setStatusByEnrollment((prev) => ({
      ...prev,
      [enrollmentId]: prev[enrollmentId] === "PRESENT" ? "ABSENT" : "PRESENT",
    }));
  };

  const markAll = (status) => {
    const next = {};
    roster.forEach((r) => { next[r.enrollment_id] = status; });
    setStatusByEnrollment(next);
  };

  const saveAttendance = async () => {
    setSaving(true);
    setSaveMessage("");
    setError("");
    try {
      const records = roster.map((r) => ({
        enrollment_id: r.enrollment_id,
        attendance_status: statusByEnrollment[r.enrollment_id] || "PRESENT",
      }));
      const { data } = await client.post(
        `/api/training/batches/${selectedBatchId}/mark-attendance/`,
        { date: attendanceDate, records }
      );
      if (data.errors && data.errors.length > 0) {
        setSaveMessage(`Saved ${data.updated_count}, with ${data.errors.length} error(s).`);
      } else {
        setSaveMessage(`Attendance saved for ${data.updated_count} students on ${attendanceDate}.`);
      }
      loadRoster(selectedBatchId);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't save attendance.");
    } finally {
      setSaving(false);
    }
  };

  const downloadReport = async (start, end, label) => {
    setDownloading(true);
    setError("");
    try {
      const response = await client.get(
        `/api/training/batches/${selectedBatchId}/training-log-download/`,
        { params: { start, end }, responseType: "blob" }
      );
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `Training_Log_${label}_${start}_to_${end}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError("Couldn't generate report — check there's attendance data for this period.");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadWeekly = () => {
    const selected = new Date(attendanceDate);
    const dayOfWeek = selected.getDay();
    const monday = new Date(selected);
    monday.setDate(selected.getDate() - ((dayOfWeek + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    downloadReport(monday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10), "Weekly");
  };

  const handleDownloadMonthly = () => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const firstDay = `${selectedMonth}-01`;
    const lastDayNum = new Date(year, month, 0).getDate();
    const lastDay = `${selectedMonth}-${String(lastDayNum).padStart(2, "0")}`;
    downloadReport(firstDay, lastDay, "Monthly");
  };

  return (
    <div className="p-6 max-w-6xl mx-auto vet-page-enter">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Attendance</h1>
      <p className="text-gray-500 mb-6">Select a batch to mark attendance or download a report.</p>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <label className="block text-xs font-semibold text-gray-500 mb-1">Batch</label>
        <select
          value={selectedBatchId}
          onChange={(e) => handleBatchChange(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full max-w-sm"
        >
          <option value="">Select a batch</option>
          {batches.map((b) => (
  <option key={b.batch_id} value={b.batch_id}>
    {b.batch_name}{b.trainer_name ? ` — ${b.trainer_name}` : " — Unassigned"}
  </option>
))}
        </select>

        {selectedBatchId && (
          <div className="flex flex-wrap gap-3 items-end mt-4 pt-4 border-t border-gray-100">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Download Month</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={handleDownloadWeekly}
              disabled={downloading}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
            >
              {downloading ? "Generating…" : "Download Weekly Log"}
            </button>
            <button
              onClick={handleDownloadMonthly}
              disabled={downloading}
              className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
            >
              {downloading ? "Generating…" : "Download Monthly Log"}
            </button>
          </div>
        )}
      </div>

      {selectedBatchId && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex flex-wrap justify-between items-center gap-3 px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Mark Attendance</h3>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="date"
                value={attendanceDate}
                onChange={(e) => setAttendanceDate(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <button onClick={() => markAll("PRESENT")} className="border border-gray-300 px-3 py-2 rounded-md text-sm">
                Mark all Present
              </button>
              <button onClick={() => markAll("ABSENT")} className="border border-gray-300 px-3 py-2 rounded-md text-sm">
                Mark all Absent
              </button>
              <button
                onClick={saveAttendance}
                disabled={saving || loading}
                className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Attendance"}
              </button>
            </div>
          </div>
          {saveMessage && <p className="px-5 pt-3 text-sm text-gray-700">{saveMessage}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-5 py-2 text-left">Student</th>
                  <th className="px-5 py-2 text-left">Email</th>
                  <th className="px-5 py-2 text-left">Attendance %</th>
                  <th className="px-5 py-2 text-left">Today</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="px-5 py-6 text-center text-gray-400">Loading…</td></tr>
                ) : roster.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-6 text-center text-gray-400">No students enrolled yet.</td></tr>
                ) : (
                  roster.map((r) => (
                    <tr key={r.enrollment_id} className="border-t border-gray-100">
                      <td className="px-5 py-3 font-medium text-gray-900">{r.student_name}</td>
                      <td className="px-5 py-3 text-gray-500">{r.email}</td>
                      <td className="px-5 py-3 font-mono">
                        {r.attendance_percentage !== null ? `${r.attendance_percentage}%` : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => toggleStatus(r.enrollment_id)}
                          className={`px-3 py-1 rounded-md text-xs font-semibold ${
                            statusByEnrollment[r.enrollment_id] === "PRESENT"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {statusByEnrollment[r.enrollment_id] === "PRESENT" ? "Present" : "Absent"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Attendance;