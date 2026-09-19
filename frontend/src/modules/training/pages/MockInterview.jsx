import { useEffect, useState } from "react";
import client from "../../../api/client";

function MockInterview() {
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [rounds, setRounds] = useState([]); // existing rounds for this batch, from BatchMockInterviewsView
  const [selectedRound, setSelectedRound] = useState(1);
  const [eligibility, setEligibility] = useState([]);
  const [internshipStatus, setInternshipStatus] = useState({}); // enrollment_id -> { is_intern, recommendation_status }
  const [selected, setSelected] = useState(new Set());
  const [selectedForNotify, setSelectedForNotify] = useState(new Set());
  const [interviewDate, setInterviewDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [recommending, setRecommending] = useState(null); // enrollment_id currently submitting

  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("intermediate");
  const [questionCount, setQuestionCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState("");

  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifySubject, setNotifySubject] = useState("Mock Interview Invitation");
  const [notifyBody, setNotifyBody] = useState(
    "Hi {{full_name}},\n\nYou've been selected for a mock interview round. Please be ready on the scheduled date.\n\nAll the best!"
  );
  const [notifyCc, setNotifyCc] = useState("");
  const [notifying, setNotifying] = useState(false);

  useEffect(() => {
    client.get("/api/training/dashboard/").then(({ data }) => {
      const b = data.batches || [];
      setBatches(b);
      if (b.length > 0) setSelectedBatchId(b[0].batch_id);
    });
  }, []);

  useEffect(() => {
    if (selectedBatchId) {
      loadRounds();
      setSelectedRound(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId]);

  useEffect(() => {
    if (selectedBatchId) loadEligibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId, selectedRound]);

  const loadRounds = async () => {
    try {
      const { data } = await client.get(`/api/training/batches/${selectedBatchId}/mock-interviews/`);
      setRounds(data);
    } catch (err) {
      setRounds([]);
    }
  };

  const loadEligibility = async () => {
    setLoading(true);
    setSelected(new Set());
    setSelectedForNotify(new Set());
    try {
      const { data } = await client.get(
        `/api/training/batches/${selectedBatchId}/mock-interview-eligibility/?round=${selectedRound}`
      );
      setEligibility(data);
      loadInternshipStatuses(data);
    } catch (err) {
      setEligibility([]);
      setError(err.response?.data?.detail || "Couldn't load eligibility for this round.");
    } finally {
      setLoading(false);
    }
  };

  const loadInternshipStatuses = async (rows) => {
    const passedRows = rows.filter((e) => e.invited && e.result_status === "PASS");
    if (passedRows.length === 0) return;

    const entries = await Promise.all(
      passedRows.map(async (e) => {
        try {
          const { data } = await client.get(`/api/interns/status/${e.enrollment_id}/`);
          return [e.enrollment_id, data];
        } catch (err) {
          return [e.enrollment_id, null];
        }
      })
    );
    setInternshipStatus((prev) => {
      const next = { ...prev };
      entries.forEach(([id, status]) => {
        if (status) next[id] = status;
      });
      return next;
    });
  };

  const recommendForInternship = async (enrollmentId) => {
    const note = window.prompt("Optional note for Business Team (leave blank to skip):", "");
    if (note === null) return; // cancelled

    setRecommending(enrollmentId);
    setError("");
    try {
      await client.post("/api/interns/recommend/", { enrollment_id: enrollmentId, note });
      setMessage("Recommended for internship — awaiting Business Team approval.");
      setInternshipStatus((prev) => ({
        ...prev,
        [enrollmentId]: { is_intern: false, recommendation_status: "PENDING_APPROVAL" },
      }));
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't submit recommendation.");
    } finally {
      setRecommending(null);
    }
  };

  const toggle = (enrollmentId) => {
    const next = new Set(selected);
    next.has(enrollmentId) ? next.delete(enrollmentId) : next.add(enrollmentId);
    setSelected(next);
  };

  const toggleNotify = (enrollmentId) => {
    const next = new Set(selectedForNotify);
    next.has(enrollmentId) ? next.delete(enrollmentId) : next.add(enrollmentId);
    setSelectedForNotify(next);
  };

  const generateQuestions = async () => {
    if (!topic.trim()) {
      setError("Enter a topic first.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const { data } = await client.post("/api/training/mock-interview-questions/generate/", {
        topic, count: questionCount, level,
      });
      setGeneratedQuestions(data.questions);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't generate questions.");
    } finally {
      setGenerating(false);
    }
  };

  const invite = async () => {
    if (!interviewDate || selected.size === 0) {
      setError("Pick a date and select at least one eligible student.");
      return;
    }
    setInviting(true);
    setError("");
    try {
      const { data } = await client.post(`/api/training/batches/${selectedBatchId}/mock-interview-eligibility/`, {
        interview_date: interviewDate,
        enrollment_ids: Array.from(selected),
        questions: generatedQuestions,
        round_number: selectedRound,
      });
      setMessage(`Invited ${data.invited_count} student(s) to Round ${selectedRound}. You can now notify them by email below.`);
      setSelected(new Set());
      loadRounds();
      loadEligibility();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't send invites.");
    } finally {
      setInviting(false);
    }
  };

  const updateResult = async (id, field, value) => {
    try {
      await client.patch(`/api/training/student-assessments/${id}/`, { [field]: value });
      loadEligibility();
    } catch (err) {
      setError("Couldn't update result.");
    }
  };

  const revokeInvite = async (id) => {
    if (!window.confirm("Revoke this invite? This can't be undone.")) return;
    try {
      await client.delete(`/api/training/student-assessments/${id}/revoke/`);
      setMessage("Invite revoked.");
      loadRounds();
      loadEligibility();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't revoke invite.");
    }
  };

  const sendNotifications = async () => {
    if (selectedForNotify.size === 0) {
      setError("Select at least one invited student to notify.");
      return;
    }
    if (!notifySubject.trim() || !notifyBody.trim()) {
      setError("Subject and body are required.");
      return;
    }
    setNotifying(true);
    setError("");
    try {
      const { data } = await client.post(`/api/training/batches/${selectedBatchId}/mock-interview/notify/`, {
        enrollment_ids: Array.from(selectedForNotify),
        subject: notifySubject,
        body: notifyBody,
        cc: notifyCc,
      });
      setMessage(`Notified ${data.sent_count} student(s).${data.skipped.length ? ` ${data.skipped.length} skipped.` : ""}`);
      setSelectedForNotify(new Set());
      setNotifyOpen(false);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't send notifications.");
    } finally {
      setNotifying(false);
    }
  };

  const invitedRows = eligibility.filter((e) => e.invited);
  const maxExistingRound = rounds.length > 0 ? Math.max(...rounds.map((r) => r.round_number)) : 0;
  const roundTabs = Array.from(new Set([...rounds.map((r) => r.round_number), 1, maxExistingRound + 1])).sort((a, b) => a - b);

  const roundSummary = (roundNumber) => rounds.find((r) => r.round_number === roundNumber);

  const renderInternshipCell = (e) => {
    if (e.result_status !== "PASS") return "—";

    const status = internshipStatus[e.enrollment_id];
    if (!status) return <span className="text-gray-400 text-xs">…</span>;

    if (status.is_intern) {
      return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">Intern</span>;
    }
    if (status.recommendation_status === "PENDING_APPROVAL") {
      return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Pending Approval</span>;
    }
    if (status.recommendation_status === "REJECTED") {
      return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">Rejected</span>;
    }
    if (status.recommendation_status === "APPROVED") {
      return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">Intern</span>;
    }

    return (
      <button
        onClick={() => recommendForInternship(e.enrollment_id)}
        disabled={recommending === e.enrollment_id}
        className="bg-indigo-600 text-white px-2 py-1 rounded-md text-xs font-semibold disabled:opacity-60"
      >
        {recommending === e.enrollment_id ? "Submitting…" : "Recommend for Internship"}
      </button>
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto vet-page-enter">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Mock Interview</h1>
      <p className="text-gray-500 mb-6">Invite eligible students and record outcomes, round by round.</p>

      {error && <p className="text-red-600 mb-4">{error}</p>}
      {message && <p className="text-green-600 mb-4">{message}</p>}

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Generate Interview Questions with AI</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Topic</label>
            <input
              value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. React Hooks, SQL Joins, System Design"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Level</label>
            <div className="flex gap-1">
              {[
                { value: "easy", label: "Easy", color: "bg-green-600" },
                { value: "intermediate", label: "Intermediate", color: "bg-amber-600" },
                { value: "advanced", label: "Advanced", color: "bg-red-600" },
              ].map((l) => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => setLevel(l.value)}
                  className={`px-3 py-2 rounded-md text-xs font-semibold border ${
                    level === l.value ? `${l.color} text-white border-transparent` : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Number of Questions</label>
            <select
              value={questionCount} onChange={(e) => setQuestionCount(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button onClick={generateQuestions} disabled={generating} className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60">
            {generating ? "Generating…" : "Generate Questions"}
          </button>
        </div>

        {generatedQuestions && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4 whitespace-pre-wrap text-sm text-gray-700 max-h-72 overflow-y-auto">
            {generatedQuestions}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <div className="flex flex-wrap gap-4 items-end mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Batch</label>
            <select value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm">
              {batches.map((b) => (
  <option key={b.batch_id} value={b.batch_id}>
    {b.batch_name}{b.trainer_name ? ` — ${b.trainer_name}` : " — Unassigned"}
  </option>
))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Interview Date</label>
            <input type="date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <button onClick={invite} disabled={inviting} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60">
            {inviting ? "Sending…" : `Invite ${selected.size} Selected`}
          </button>
          {invitedRows.length > 0 && (
            <button
              onClick={() => setNotifyOpen((prev) => !prev)}
              className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-semibold"
            >
              {notifyOpen ? "Close Notify Panel" : "Notify Students"}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          {roundTabs.map((r) => {
            const summary = roundSummary(r);
            const isNew = !summary;
            return (
              <button
                key={r}
                onClick={() => setSelectedRound(r)}
                className={`px-3 py-2 rounded-md text-xs font-semibold border ${
                  selectedRound === r
                    ? "bg-blue-600 text-white border-transparent"
                    : isNew
                    ? "bg-white text-blue-600 border-blue-300 border-dashed"
                    : "bg-white text-gray-600 border-gray-300"
                }`}
              >
                {isNew ? `+ Round ${r}` : `Round ${r} (${summary.passed_count}✓ / ${summary.failed_count}✗ / ${summary.pending_count}…)`}
              </button>
            );
          })}
        </div>

        {generatedQuestions && (
          <p className="text-xs text-gray-500 mt-3">The generated questions above will be attached to this interview when you invite students.</p>
        )}
      </div>

      {notifyOpen && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Compose Invite Email — Round {selectedRound}</h3>
          <p className="text-xs text-gray-500 mb-3">
            Check the invited students below to include them, edit the draft, then send.
            Use <code>{"{{full_name}}"}</code> in the body — it's replaced per student.
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            {invitedRows.map((e) => (
              <label key={e.enrollment_id} className="flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 rounded-md px-2 py-1">
                <input
                  type="checkbox"
                  checked={selectedForNotify.has(e.enrollment_id)}
                  onChange={() => toggleNotify(e.enrollment_id)}
                />
                {e.student_name}
              </label>
            ))}
          </div>

          <label className="block text-xs font-semibold text-gray-500 mb-1">Subject</label>
          <input
            value={notifySubject}
            onChange={(e) => setNotifySubject(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-3"
          />

          <label className="block text-xs font-semibold text-gray-500 mb-1">Body</label>
          <textarea
            value={notifyBody}
            onChange={(e) => setNotifyBody(e.target.value)}
            rows={6}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-3"
          />

          <label className="block text-xs font-semibold text-gray-500 mb-1">CC (comma-separated, optional)</label>
          <input
            value={notifyCc}
            onChange={(e) => setNotifyCc(e.target.value)}
            placeholder="trainer@example.com, manager@example.com"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4"
          />

          <button
            onClick={sendNotifications}
            disabled={notifying}
            className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
          >
            {notifying ? "Sending…" : `Send to ${selectedForNotify.size} Student(s)`}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600">
            Round {selectedRound} eligibility
            {selectedRound > 1 && <span className="font-normal text-gray-400"> — requires a PASS in Round {selectedRound - 1}</span>}
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2"></th>
                <th className="px-4 py-2 text-left">Student</th>
                <th className="px-4 py-2 text-left">Eligibility</th>
                <th className="px-4 py-2 text-left">Result</th>
                <th className="px-4 py-2 text-left">Score</th>
                <th className="px-4 py-2 text-left">Meeting Link</th>
                <th className="px-4 py-2 text-left">Feedback</th>
                <th className="px-4 py-2 text-left">Internship</th>
                <th className="px-4 py-2 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {eligibility.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-gray-400">No students found for this round.</td>
                </tr>
              ) : eligibility.map((e) => (
                <tr key={e.enrollment_id} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    {!e.invited && e.eligible && (
                      <input type="checkbox" checked={selected.has(e.enrollment_id)} onChange={() => toggle(e.enrollment_id)} />
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{e.student_name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${e.eligible ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {e.eligibility_note}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {e.invited ? (
                      <select
                        value={e.result_status || "PENDING"}
                        onChange={(ev) => updateResult(e.student_assessment_id, "result_status", ev.target.value)}
                        className="border border-gray-300 rounded-md px-2 py-1 text-xs"
                      >
                        <option value="PENDING">Pending</option>
                        <option value="PASS">Pass</option>
                        <option value="FAIL">Fail</option>
                        <option value="ABSENT">Absent</option>
                      </select>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {e.invited ? (
                      <input
                        type="number" min="0" max="100" defaultValue={e.score ?? ""}
                        onBlur={(ev) => updateResult(e.student_assessment_id, "score", ev.target.value)}
                        className="w-16 border border-gray-300 rounded-md px-2 py-1 text-xs"
                      />
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {e.invited ? (
                      <input
                        defaultValue={e.meeting_link || ""}
                        placeholder="https://meet.google.com/..."
                        onBlur={(ev) => updateResult(e.student_assessment_id, "meeting_link", ev.target.value)}
                        className="w-48 border border-gray-300 rounded-md px-2 py-1 text-xs"
                      />
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {e.invited ? (
                      <input
  defaultValue={e.feedback || ""}
  placeholder="Feedback for the student"
  onBlur={(ev) => updateResult(e.student_assessment_id, "feedback", ev.target.value)}
  className="w-56 border border-gray-300 rounded-md px-2 py-1 text-xs"
/>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{renderInternshipCell(e)}</td>
                  <td className="px-4 py-3">
                    {e.invited && (!e.result_status || e.result_status === "PENDING") && (
                      <button
                        onClick={() => revokeInvite(e.student_assessment_id)}
                        className="text-red-600 text-xs hover:underline"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default MockInterview;