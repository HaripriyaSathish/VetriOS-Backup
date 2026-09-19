import { useEffect, useState } from "react";
import client from "../../../api/client";

function CompletionExtensionApprovals() {
  const [completions, setCompletions] = useState([]);
  const [extensions, setExtensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [processing, setProcessing] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [compRes, extRes] = await Promise.all([
        client.get("/api/interns/completions/pending/"),
        client.get("/api/interns/extensions/pending/"),
      ]);
      setCompletions(compRes.data);
      setExtensions(extRes.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't load pending items.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const approveCompletion = async (completionId) => {
    setProcessing(`completion-${completionId}`);
    setError("");
    try {
      const { data } = await client.patch(`/api/interns/completions/${completionId}/approve/`);
      setMessage(`Completion approved — outcome: ${data.outcome}.`);
      setCompletions((prev) => prev.filter((c) => c.completion_id !== completionId));
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't approve completion.");
    } finally {
      setProcessing(null);
    }
  };

  const actOnExtension = async (extensionId, decision) => {
    setProcessing(`extension-${extensionId}`);
    setError("");
    try {
      await client.patch(`/api/interns/extensions/${extensionId}/act/`, { decision });
      setMessage(`Extension ${decision.toLowerCase()}.`);
      setExtensions((prev) => prev.filter((e) => e.extension_id !== extensionId));
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't update extension.");
    } finally {
      setProcessing(null);
    }
  };

  if (loading) return <p className="p-6 text-gray-400">Loading…</p>;

  return (
    <div className="p-6 max-w-4xl mx-auto vet-page-enter">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Completion & Extension Approvals</h1>
      <p className="text-gray-500 mb-6">Review project lead recommendations for internship completion and extension.</p>

      {error && <p className="text-red-600 mb-4">{error}</p>}
      {message && <p className="text-green-600 mb-4">{message}</p>}

      <h2 className="font-semibold text-gray-900 mb-3">Pending Completions</h2>
      {completions.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-gray-400 mb-8">
          No pending completions.
        </div>
      ) : (
        <div className="flex flex-col gap-4 mb-8">
          {completions.map((c) => (
            <div key={c.completion_id} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold text-gray-900">{c.intern_name}</p>
                  <p className="text-xs text-gray-500">
                    Outcome: <span className="font-medium">{c.outcome}</span>
                    {c.completion_date && ` · ${new Date(c.completion_date).toLocaleDateString()}`}
                  </p>
                </div>
                <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                  Pending
                </span>
              </div>

              {c.remarks && (
                <p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 mb-4">
                  {c.remarks}
                </p>
              )}

              <button
                onClick={() => approveCompletion(c.completion_id)}
                disabled={processing === `completion-${c.completion_id}`}
                className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
              >
                {processing === `completion-${c.completion_id}` ? "Approving…" : "Approve"}
              </button>
            </div>
          ))}
        </div>
      )}

      <h2 className="font-semibold text-gray-900 mb-3">Pending Extensions</h2>
      {extensions.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-gray-400">
          No pending extensions.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {extensions.map((e) => (
            <div key={e.extension_id} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold text-gray-900">{e.intern_name}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(e.original_end_date).toLocaleDateString()} → {new Date(e.new_end_date).toLocaleDateString()}
                  </p>
                </div>
                <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                  Pending
                </span>
              </div>

              {e.extension_reason && (
                <p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 mb-4">
                  {e.extension_reason}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => actOnExtension(e.extension_id, "APPROVED")}
                  disabled={processing === `extension-${e.extension_id}`}
                  className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
                >
                  {processing === `extension-${e.extension_id}` ? "Processing…" : "Approve"}
                </button>
                <button
                  onClick={() => actOnExtension(e.extension_id, "REJECTED")}
                  disabled={processing === `extension-${e.extension_id}`}
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

export default CompletionExtensionApprovals;