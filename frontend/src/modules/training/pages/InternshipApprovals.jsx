import { useEffect, useState } from "react";
import client from "../../../api/client";

function InternshipApprovals() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [processing, setProcessing] = useState(null);
  const [startDates, setStartDates] = useState({});
  const [managerIds, setManagerIds] = useState({});
  const [users, setUsers] = useState([]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await client.get("/api/interns/pending/");
      setPending(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't load pending recommendations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    client
      .get("/api/projects/users-lookup/")
      .then(({ data }) => setUsers(data))
      .catch(() => {});
  }, []);

  const approve = async (recommendationId) => {
    const managerId = managerIds[recommendationId];
    if (!managerId) {
      setError("Please select a reporting manager before approving.");
      return;
    }

    setProcessing(recommendationId);
    setError("");
    try {
      const startDate = startDates[recommendationId] || new Date().toISOString().slice(0, 10);
      const { data } = await client.post(`/api/interns/${recommendationId}/approve/`, {
        internship_start_date: startDate,
        manager_user_id: managerId,
      });
      setMessage(`Approved — intern code ${data.intern_code} created.`);
      setPending((prev) => prev.filter((r) => r.recommendation_id !== recommendationId));
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't approve.");
    } finally {
      setProcessing(null);
    }
  };

  const reject = async (recommendationId) => {
    const reviewNote = window.prompt("Reason for rejection (optional):", "");
    if (reviewNote === null) return;

    setProcessing(recommendationId);
    setError("");
    try {
      await client.post(`/api/interns/${recommendationId}/reject/`, { review_note: reviewNote });
      setMessage("Recommendation rejected.");
      setPending((prev) => prev.filter((r) => r.recommendation_id !== recommendationId));
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't reject.");
    } finally {
      setProcessing(null);
    }
  };

  if (loading) return <p className="p-6 text-gray-400">Loading…</p>;

  return (
    <div className="p-6 max-w-4xl mx-auto vet-page-enter">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Internship Approvals</h1>
      <p className="text-gray-500 mb-6">Review trainer recommendations and approve or reject internship conversion.</p>

      {error && <p className="text-red-600 mb-4">{error}</p>}
      {message && <p className="text-green-600 mb-4">{message}</p>}

      {pending.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
          No pending recommendations right now.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {pending.map((r) => (
            <div key={r.recommendation_id} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold text-gray-900">{r.student_name}</p>
                  <p className="text-xs text-gray-500">
                    Recommended by {r.recommended_by || "Unknown"} on {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                  Pending Approval
                </span>
              </div>

              {r.recommendation_note && (
                <p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 mb-4">
                  {r.recommendation_note}
                </p>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Internship Start Date</label>
                  <input
                    type="date"
                    value={startDates[r.recommendation_id] || ""}
                    onChange={(e) =>
                      setStartDates((prev) => ({ ...prev, [r.recommendation_id]: e.target.value }))
                    }
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Reporting Manager</label>
                  <select
                    value={managerIds[r.recommendation_id] || ""}
                    onChange={(e) =>
                      setManagerIds((prev) => ({ ...prev, [r.recommendation_id]: e.target.value }))
                    }
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[180px]"
                  >
                    <option value="">Select manager…</option>
                    {users.map((u) => (
                      <option key={u.user_id} value={u.user_id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => approve(r.recommendation_id)}
                  disabled={processing === r.recommendation_id}
                  className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
                >
                  {processing === r.recommendation_id ? "Approving…" : "Approve"}
                </button>
                <button
                  onClick={() => reject(r.recommendation_id)}
                  disabled={processing === r.recommendation_id}
                  className="bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default InternshipApprovals;