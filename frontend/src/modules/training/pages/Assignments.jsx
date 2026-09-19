import { useEffect, useState } from "react";
import client from "../../../api/client";

const CATEGORIES = [
  { value: "task", label: "Daily Task", color: "bg-green-600" },
  { value: "mini_project", label: "Mini Project", color: "bg-amber-600" },
  { value: "main_project", label: "Main Project", color: "bg-purple-600" },
  { value: "seminar", label: "Seminar", color: "bg-cyan-600" },
];

function getUser() {
  return JSON.parse(localStorage.getItem("user") || "null");
}

function Assignments() {
  const user = getUser();
  const canEdit = (user?.roles || []).includes("Employee");

  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [activeCategory, setActiveCategory] = useState("task");

  const [tasks, setTasks] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("beginner");
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showManual, setShowManual] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualDueDate, setManualDueDate] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editScore, setEditScore] = useState("");
  const [editFeedback, setEditFeedback] = useState("");
  const [editSubmissionDate, setEditSubmissionDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    client.get("/api/training/dashboard/").then(({ data }) => {
      const b = data.batches || [];
      setBatches(b);
      if (b.length > 0) setSelectedBatchId(b[0].batch_id);
    });
  }, []);

  useEffect(() => {
    if (selectedBatchId) {
      loadTasks();
      loadSubmissions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId, activeCategory]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const { data } = await client.get(`/api/training/batches/${selectedBatchId}/tasks/`, {
        params: { category: activeCategory },
      });
      setTasks(data);
    } finally {
      setLoading(false);
    }
  };

  const loadSubmissions = async () => {
    try {
      const { data } = await client.get(`/api/training/batches/${selectedBatchId}/student-tasks/`);
      setSubmissions(data.filter((s) => s.category === activeCategory));
    } catch {
      setSubmissions([]);
    }
  };

  const activeConfig = CATEGORIES.find((c) => c.value === activeCategory);

  const handleGenerate = async () => {
    setError(""); setSuccess(""); setGeneratedContent("");
    if (!topic) {
      setError("Enter a topic first.");
      return;
    }
    setGenerating(true);
    try {
      const { data } = await client.post("/api/training/tasks/generate-content/", {
        topic, level, category: activeCategory,
      });
      setGeneratedContent(data.generated_content);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to generate content.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveGenerated = async () => {
    if (!dueDate) {
      setError("Set a due date before saving.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data } = await client.post("/api/training/tasks/create/", {
        batch_id: selectedBatchId, category: activeCategory,
        title: topic, description: generatedContent, due_date: dueDate,
      });
      setSuccess(`Saved and assigned to ${data.assigned_count} student(s).`);
      setGeneratedContent(""); setTopic(""); setDueDate("");
      loadTasks();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleManualSave = async () => {
    if (!manualTitle.trim() || !manualDescription.trim() || !manualDueDate) {
      setError("Title, description, and due date are all required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data } = await client.post("/api/training/tasks/create/", {
        batch_id: selectedBatchId, category: activeCategory,
        title: manualTitle, description: manualDescription, due_date: manualDueDate,
      });
      setSuccess(`Saved and assigned to ${data.assigned_count} student(s).`);
      setManualTitle(""); setManualDescription(""); setManualDueDate("");
      loadTasks();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (s) => {
    setEditingId(s.student_task_id);
    setEditScore(s.score ?? "");
    setEditFeedback(s.feedback || "");
    setEditSubmissionDate(s.submission_date ? s.submission_date.slice(0, 10) : "");
  };

  const saveEdit = async (id) => {
    setEditSaving(true);
    try {
      await client.patch(`/api/training/student-tasks/${id}/`, {
        score: editScore === "" ? null : editScore,
        feedback: editFeedback,
        submission_date: editSubmissionDate || null,
      });
      setEditingId(null);
      loadSubmissions();
    } catch (err) {
      setError("Failed to save changes.");
    } finally {
      setEditSaving(false);
    }
  };

  const toggleVerified = async (id, currentValue) => {
    try {
      await client.patch(`/api/training/student-tasks/${id}/`, { verified: !currentValue });
      loadSubmissions();
    } catch (err) {
      setError("Failed to update verification.");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto vet-page-enter">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Assignments</h1>
      <p className="text-gray-500 mb-6">AI-generated tasks and projects, tracked per student.</p>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5 max-w-sm">
        <label className="block text-xs font-semibold text-gray-500 mb-1">Batch</label>
        <select
          value={selectedBatchId}
          onChange={(e) => setSelectedBatchId(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full"
        >
          {batches.map((b) => (
  <option key={b.batch_id} value={b.batch_id}>
    {b.batch_name}{b.trainer_name ? ` — ${b.trainer_name}` : " — Unassigned"}
  </option>
))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => { setActiveCategory(c.value); setGeneratedContent(""); setTopic(""); setError(""); setSuccess(""); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
              activeCategory === c.value ? `${c.color} text-white border-transparent` : "bg-white text-gray-700 border-gray-300"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {success && <p className="text-green-600 text-sm mb-3">{success}</p>}

      {canEdit && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <h3 className="font-semibold text-gray-900 mb-4">Generate {activeConfig.label} with AI</h3>
          <div className="flex flex-wrap gap-3 items-end mb-4">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Topic</label>
              <input
                value={topic} onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. REST APIs"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Level</label>
              <select value={level} onChange={(e) => setLevel(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm">
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className={`${activeConfig.color} text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60`}
            >
              {generating ? "Generating…" : "Generate"}
            </button>
          </div>

          {generatedContent && (
            <div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-gray-700">
                {generatedContent}
              </div>
              <div className="flex gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Due Date</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
                </div>
                <button
                  onClick={handleSaveGenerated}
                  disabled={saving}
                  className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
                >
                  {saving ? "Saving…" : `Save as ${activeConfig.label}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <button onClick={() => setShowManual(!showManual)} className="text-sm font-semibold text-blue-600">
            {showManual ? "Hide manual entry" : `Or type a ${activeConfig.label} manually`}
          </button>
          {showManual && (
            <div className="mt-4">
              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Title</label>
                <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
                <textarea value={manualDescription} onChange={(e) => setManualDescription(e.target.value)} rows={4} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Due Date</label>
                  <input type="date" value={manualDueDate} onChange={(e) => setManualDueDate(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
                </div>
                <button onClick={handleManualSave} disabled={saving} className={`${activeConfig.color} text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60`}>
                  {saving ? "Saving…" : `Save as ${activeConfig.label}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <h3 className="font-semibold text-gray-900 mb-3">Saved {activeConfig.label}s</h3>
      {loading ? (
        <p className="text-gray-400 mb-6">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="text-gray-400 mb-6">No {activeConfig.label.toLowerCase()}s saved yet.</p>
      ) : (
        <div className="flex flex-col gap-2 mb-8">
          {tasks.map((t) => {
            const isExpanded = expandedId === t.task_id;
            return (
              <div key={t.task_id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : t.task_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="font-semibold text-gray-900 text-sm">{t.title}</span>
                  <span className="text-xs text-gray-500 ml-auto">Due: {t.due_date}</span>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-gray-100 text-sm text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {t.description}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <h3 className="font-semibold text-gray-900 mb-3">Student Submissions</h3>
      {submissions.length === 0 ? (
        <p className="text-gray-400">No submissions yet for this category.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Student</th>
                <th className="px-4 py-2 text-left">Task</th>
                <th className="px-4 py-2 text-left">Submitted</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Score</th>
                <th className="px-4 py-2 text-left">Verified</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <>
                  <tr key={s.student_task_id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.student_name}</td>
                    <td className="px-4 py-3 text-gray-500">{s.task_title}</td>
                    <td className="px-4 py-3">{s.submission_date ? s.submission_date.slice(0, 10) : "—"}</td>
                    <td className="px-4 py-3">
                      {s.on_time === null ? (
                        <span className="text-gray-400">Not submitted</span>
                      ) : (
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${s.on_time ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {s.on_time ? "On Time" : "Late"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">{s.score ?? "—"}</td>
                    <td className="px-4 py-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!s.verified}
                          disabled={!s.submission_date}
                          onChange={() => toggleVerified(s.student_task_id, s.verified)}
                        />
                        {s.verified ? (
                          <span className="text-xs font-semibold text-green-700">Verified</span>
                        ) : (
                          <span className="text-xs text-gray-400">Not yet</span>
                        )}
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      {canEdit && (
                        <button
                          onClick={() => editingId === s.student_task_id ? setEditingId(null) : startEdit(s)}
                          className="text-blue-600 text-xs font-semibold border border-gray-300 rounded-md px-2 py-1"
                        >
                          {editingId === s.student_task_id ? "Close" : "Edit"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {editingId === s.student_task_id && (
                    <tr className="border-t border-gray-100 bg-gray-50">
                      <td colSpan={7} className="px-4 py-4">
                        {s.student_note && <p className="text-xs text-gray-600 mb-2"><strong>Note:</strong> {s.student_note}</p>}
                        {s.links && (
                          <div className="mb-3 flex flex-col gap-1">
                            {s.links.split("\n").filter(Boolean).map((l, i) => (
                              <a key={i} href={l.trim()} target="_blank" rel="noreferrer" className="text-blue-600 text-xs underline">{l.trim()}</a>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-3 items-end">
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Submission Date</label>
                            <input type="date" value={editSubmissionDate} onChange={(e) => setEditSubmissionDate(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Score</label>
                            <input type="number" min="0" max="100" value={editScore} onChange={(e) => setEditScore(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm w-24" />
                          </div>
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Feedback</label>
                            <input value={editFeedback} onChange={(e) => setEditFeedback(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                          </div>
                          <button onClick={() => saveEdit(s.student_task_id)} disabled={editSaving} className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60">
                            {editSaving ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Assignments;