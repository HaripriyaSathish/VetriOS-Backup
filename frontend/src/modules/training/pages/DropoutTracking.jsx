import { useEffect, useState } from "react";
import client from "../../../api/client";

function DropoutTracking() {
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  const [actionStudent, setActionStudent] = useState(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    client.get("/api/training/dashboard/").then(({ data }) => {
      const b = data.batches || [];
      setBatches(b);
      if (b.length > 0) setSelectedBatchId(b[0].batch_id);
    });
  }, []);

  useEffect(() => {
    if (selectedBatchId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId]);

  const load = () => {
    setLoading(true);
    client.get(`/api/admissions/batches/${selectedBatchId}/enrollment-status/`)
      .then(({ data }) => setStudents(data))
      .finally(() => setLoading(false));
  };

  const openDiscontinue = (s) => {
    setActionStudent(s);
    setReason("");
  };

  const confirmDiscontinue = async () => {
    setSaving(true);
    try {
      await client.post("/api/admissions/mark-discontinued/", {
        enrollment_id: actionStudent.enrollment_id,
        discontinued_date: new Date().toISOString().slice(0, 10),
        reason,
      });
      setActionStudent(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const reactivate = async (enrollmentId) => {
    await client.post("/api/admissions/reactivate-student/", { enrollment_id: enrollmentId });
    load();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto vet-page-enter">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dropout Tracking</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 max-w-sm">
        <label className="block text-xs font-semibold text-gray-500 mb-1">Batch</label>
        <select value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full">
          {batches.map((b) => <option key={b.batch_id} value={b.batch_id}>{b.batch_name}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : students.length === 0 ? (
        <p className="text-gray-400">No students enrolled in this batch yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Student</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Current Streak</th>
                <th className="px-4 py-2 text-left">Total Absent Days</th>
                <th className="px-4 py-2 text-left">Discontinued Date</th>
                <th className="px-4 py-2 text-left">Reason</th>
                <th className="px-4 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.enrollment_id} className={`border-t border-gray-100 ${s.is_candidate ? "bg-amber-50" : ""}`}>
                  <td className="px-4 py-3 text-gray-900">
                    {s.name}
                    {s.is_candidate && <span className="ml-2 text-xs font-semibold text-amber-700">⚠ Candidate</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${s.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{s.current_absence_streak} day(s)</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${s.total_absent_days > 0 ? "text-red-600" : "text-gray-500"}`}>{s.total_absent_days} day(s)</span>
                  </td>
                  <td className="px-4 py-3">{s.discontinued_date || "—"}</td>
                  <td className="px-4 py-3">{s.discontinued_reason || "—"}</td>
                  <td className="px-4 py-3">
                    {s.status === "ACTIVE" ? (
                      <button onClick={() => openDiscontinue(s)} className="text-red-600 text-xs font-semibold">
                        Mark Discontinued
                      </button>
                    ) : (
                      <button onClick={() => reactivate(s.enrollment_id)} className="text-green-600 text-xs font-semibold">
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {actionStudent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-5">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Mark {actionStudent.name} as Discontinued</h3>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Reason (optional)</label>
            <textarea
              value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              placeholder="e.g. Stopped attending, no response to outreach"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setActionStudent(null)} className="flex-1 bg-gray-50 text-gray-700 border border-gray-200 rounded-md py-2 text-sm font-semibold">
                Cancel
              </button>
              <button onClick={confirmDiscontinue} disabled={saving} className="flex-1 bg-red-600 text-white rounded-md py-2 text-sm font-semibold disabled:opacity-60">
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DropoutTracking;