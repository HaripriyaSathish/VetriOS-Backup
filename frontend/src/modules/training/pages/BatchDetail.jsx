import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import client from "../../../api/client";

function BatchDetail() {
  const { batchId } = useParams();
  const navigate = useNavigate();

  const [batch, setBatch] = useState(null);
  const [roster, setRoster] = useState([]);
  const [topicLogs, setTopicLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logTopic, setLogTopic] = useState("");
  const [logging, setLogging] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [batchRes, rosterRes, logsRes] = await Promise.all([
        client.get(`/api/training/batches/${batchId}/detail/`),
        client.get(`/api/training/batches/${batchId}/roster/`),
        client.get(`/api/training/batches/${batchId}/topic-log/`),
      ]);
      setBatch(batchRes.data);
      setRoster(rosterRes.data);
      setTopicLogs(logsRes.data);
    } catch (err) {
      setError("Couldn't load this batch.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const addTopicLog = async (event) => {
    event.preventDefault();
    if (!logTopic.trim()) return;
    setLogging(true);
    setError("");
    try {
      await client.post(`/api/training/batches/${batchId}/topic-log/`, {
        date: logDate,
        topic: logTopic.trim(),
      });
      setLogTopic("");
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't log topic.");
    } finally {
      setLogging(false);
    }
  };

  const deleteLog = async (topicLogId) => {
    try {
      await client.delete(`/api/training/topic-log/${topicLogId}/`);
      await loadData();
    } catch (err) {
      setError("Couldn't delete entry.");
    }
  };

  if (loading) return <p className="p-6 text-gray-400">Loading…</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!batch) return null;

  return (
    <div className="p-6 max-w-6xl mx-auto vet-page-enter">
      <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:underline mb-4">
        ← Back
      </button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{batch.batch_name}</h1>
          <p className="text-gray-500">{batch.course_name} · {batch.batch_code}</p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${
            batch.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
          }`}
        >
          {batch.status}
        </span>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 flex gap-8 mb-6">
        <div>
          <p className="text-xs uppercase text-gray-400 mb-1">Trainer</p>
          <p className="font-semibold text-gray-900">{batch.trainer_name || "Unassigned"}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-400 mb-1">Start Date</p>
          <p className="font-semibold text-gray-900">{batch.start_date}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-400 mb-1">Students Enrolled</p>
          <p className="font-semibold text-gray-900">{batch.students_enrolled} / {batch.capacity ?? "—"}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl mb-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Topics Covered</h3>
        </div>

        <form onSubmit={addTopicLog} className="flex flex-wrap gap-3 items-end px-5 py-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Topic covered</label>
            <input
              value={logTopic}
              onChange={(e) => setLogTopic(e.target.value)}
              placeholder="e.g. React Hooks — useState, useEffect"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={logging}
            className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
          >
            {logging ? "Adding…" : "Add Entry"}
          </button>
        </form>

        {topicLogs.length === 0 ? (
          <p className="px-5 pb-5 text-gray-400 text-sm">No topics logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-5 py-2 text-left">Date</th>
                  <th className="px-5 py-2 text-left">Topic</th>
                  <th className="px-5 py-2 text-left">Logged By</th>
                  <th className="px-5 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {topicLogs.map((l) => (
                  <tr key={l.topic_log_id} className="border-t border-gray-100">
                    <td className="px-5 py-3 font-mono">{l.date}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{l.topic}</td>
                    <td className="px-5 py-3 text-gray-500">{l.logged_by || "—"}</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => deleteLog(l.topic_log_id)}
                        className="text-red-600 hover:underline text-xs font-semibold"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Enrolled Students</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-5 py-2 text-left">Student</th>
                <th className="px-5 py-2 text-left">Email</th>
                <th className="px-5 py-2 text-left">Status</th>
                <th className="px-5 py-2 text-left">Attendance %</th>
              </tr>
            </thead>
            <tbody>
              {roster.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-6 text-center text-gray-400">No students enrolled yet.</td></tr>
              ) : (
                roster.map((r) => (
                  <tr key={r.enrollment_id} className="border-t border-gray-100">
                    <td className="px-5 py-3 font-medium text-gray-900">{r.student_name}</td>
                    <td className="px-5 py-3 text-gray-500">{r.email}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${r.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono">
                      {r.attendance_percentage !== null ? `${r.attendance_percentage}%` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default BatchDetail;