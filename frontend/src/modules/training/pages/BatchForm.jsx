import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import client from "../../../api/client";
import "../styles/TrainingDashboard.css";

const DEFAULT_WELCOME_SUBJECT = "Welcome to VetriOS Training!";
const DEFAULT_WELCOME_BODY =
  "<p>Hi {{full_name}},</p><p>Welcome aboard! You've been placed in a new batch — we're excited to start your training journey with us.</p><p>Best,<br/>Vetri Technology Solutions</p>";

const DEFAULT_TRAINER_SUBJECT = "New Batch Assigned to You";
const ADD_NEW_COURSE_VALUE = "__ADD_NEW__";

function BatchForm() {
  const navigate = useNavigate();

  const [courses, setCourses] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState(new Set());

  const [form, setForm] = useState({
    course: "", trainer: "", batch_code: "", batch_name: "",
    start_date: "", end_date: "", capacity: "", status: "PLANNED",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createdBatch, setCreatedBatch] = useState(null); // { batch_id, roster, trainer }

  const [welcomeSubject, setWelcomeSubject] = useState(DEFAULT_WELCOME_SUBJECT);
  const [welcomeBody, setWelcomeBody] = useState(DEFAULT_WELCOME_BODY);
  const [welcomeCc, setWelcomeCc] = useState("");
  const [sendingWelcome, setSendingWelcome] = useState(false);
  const [welcomeResult, setWelcomeResult] = useState(null);

  const [trainerSubject, setTrainerSubject] = useState(DEFAULT_TRAINER_SUBJECT);
  const [trainerBody, setTrainerBody] = useState("");
  const [trainerCc, setTrainerCc] = useState("");
  const [sendingTrainerMail, setSendingTrainerMail] = useState(false);
  const [trainerMailResult, setTrainerMailResult] = useState(null);

  // New-course inline form state
  const [showNewCourseForm, setShowNewCourseForm] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseDescription, setNewCourseDescription] = useState("");
  const [newCourseDuration, setNewCourseDuration] = useState("");
  const [savingCourse, setSavingCourse] = useState(false);
  const [courseError, setCourseError] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [coursesRes, trainersRes, studentsRes] = await Promise.all([
        client.get("/api/training/courses/"),
        client.get("/api/training/trainers/"),
        client.get("/api/admissions/ungrouped-students/"),
      ]);
      setCourses(coursesRes.data);
      setTrainers(trainersRes.data);
      setStudents(studentsRes.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't load form data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Auto-build the trainer notification body from the actual roster the
  // moment the batch is created — still fully editable before sending.
  useEffect(() => {
    if (createdBatch) {
      const rosterRows = createdBatch.roster
        .map(
          (s) =>
            `<tr><td>${s.name}</td><td>${s.personal_email || "—"}</td><td>${s.official_email || "—"}</td></tr>`
        )
        .join("");

      const body =
        `<p>Hi,</p>` +
        `<p>A new batch has been created and assigned to you. Here are the students enrolled:</p>` +
        `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse;">` +
        `<tr><th>Name</th><th>Personal Email</th><th>Official Email</th></tr>` +
        rosterRows +
        `</table>` +
        `<p>Please check the Training dashboard for full details.</p>` +
        `<p>Best,<br/>Vetri Technology Solutions</p>`;

      setTrainerBody(body);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdBatch]);

  const updateField = (field, value) => setForm({ ...form, [field]: value });

  const toggleStudent = (id) => {
    const next = new Set(selectedStudents);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedStudents(next);
  };

  const handleCourseSelect = (value) => {
    if (value === ADD_NEW_COURSE_VALUE) {
      setShowNewCourseForm(true);
      setCourseError("");
      return;
    }
    updateField("course", value);
  };

  const cancelNewCourse = () => {
    setShowNewCourseForm(false);
    setNewCourseName("");
    setNewCourseDescription("");
    setNewCourseDuration("");
    setCourseError("");
  };

  const saveNewCourse = async () => {
    if (!newCourseName.trim()) {
      setCourseError("Course name is required.");
      return;
    }
    setSavingCourse(true);
    setCourseError("");
    try {
      const { data } = await client.post("/api/training/courses/create/", {
        course_name: newCourseName.trim(),
        description: newCourseDescription.trim(),
        duration_days: newCourseDuration ? parseInt(newCourseDuration, 10) : null,
      });

      // Refresh the course list, then select the newly created one.
      const { data: freshCourses } = await client.get("/api/training/courses/");
      setCourses(freshCourses);
      updateField("course", String(data.course_id));

      cancelNewCourse();
    } catch (err) {
      setCourseError(err.response?.data?.detail || "Couldn't create course.");
    } finally {
      setSavingCourse(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (selectedStudents.size === 0) {
      setError("Select at least one student for this batch.");
      return;
    }
    setSaving(true);
    setError("");

    const payload = {
      ...form,
      trainer: form.trainer || null,
      end_date: form.end_date || null,
      capacity: form.capacity ? parseInt(form.capacity, 10) : null,
      enquiry_ids: Array.from(selectedStudents),
    };

    try {
      const { data } = await client.post("/api/admissions/group-into-batch/", payload);
      setCreatedBatch(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't create batch.");
    } finally {
      setSaving(false);
    }
  };

  const sendWelcomeEmails = async () => {
    setSendingWelcome(true);
    setWelcomeResult(null);
    try {
      const { data } = await client.post("/api/admissions/send-welcome-email/", {
        enquiry_ids: createdBatch.roster.map((r) => r.enquiry_id),
        subject: welcomeSubject,
        body: welcomeBody,
        cc: welcomeCc,
      });
      setWelcomeResult(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't send welcome emails.");
    } finally {
      setSendingWelcome(false);
    }
  };

  const sendTrainerNotification = async () => {
    setSendingTrainerMail(true);
    setTrainerMailResult(null);
    try {
      await client.post("/api/admissions/notify-trainer/", {
        to: createdBatch.trainer.email,
        subject: trainerSubject,
        body: trainerBody,
        cc: trainerCc,
      });
      setTrainerMailResult("sent");
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't notify trainer.");
    } finally {
      setSendingTrainerMail(false);
    }
  };

  if (loading) return <p className="td-empty">Loading…</p>;

  // --- Post-creation view: batch is made, now show editable email panels ---
  if (createdBatch) {
    return (
      <div className="td-screen">
        <h1>Batch Created</h1>
        <p className="td-sub">{createdBatch.roster.length} student(s) enrolled in this batch.</p>

        {error && <p className="td-error">{error}</p>}

        <div className="td-panel fc-form" style={{ marginBottom: 20 }}>
          <h3>Welcome Email to Students</h3>
          {welcomeResult && (
            <p className="td-sub">
              Sent to {welcomeResult.sent_count} student(s).
              {welcomeResult.skipped.length > 0 && ` ${welcomeResult.skipped.length} skipped: ${welcomeResult.skipped.map((s) => s.reason).join("; ")}`}
            </p>
          )}
          <div className="fc-field" style={{ marginBottom: 12 }}>
            <label>Subject</label>
            <input value={welcomeSubject} onChange={(e) => setWelcomeSubject(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div className="fc-field" style={{ marginBottom: 12 }}>
            <label>Body (HTML) — use {"{{full_name}}"} for personalization</label>
            <textarea value={welcomeBody} onChange={(e) => setWelcomeBody(e.target.value)} rows={5} style={{ width: "100%" }} />
          </div>
          <div className="fc-field" style={{ marginBottom: 12 }}>
            <label>CC (comma-separated, optional)</label>
            <input value={welcomeCc} onChange={(e) => setWelcomeCc(e.target.value)} style={{ width: "100%" }} />
          </div>
          <button className="rp-btn-accent" onClick={sendWelcomeEmails} disabled={sendingWelcome}>
            {sendingWelcome ? "Sending…" : `Send to ${createdBatch.roster.length} student(s)`}
          </button>
        </div>

        {createdBatch.trainer && (
          <div className="td-panel fc-form">
            <h3>Notify Trainer</h3>
            <p className="td-sub">To: {createdBatch.trainer.name} — {createdBatch.trainer.email || "no email on file"}</p>
            {trainerMailResult === "sent" && <p className="td-sub">✅ Trainer notified.</p>}
            <div className="fc-field" style={{ marginBottom: 12 }}>
              <label>Subject</label>
              <input value={trainerSubject} onChange={(e) => setTrainerSubject(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div className="fc-field" style={{ marginBottom: 12 }}>
              <label>Body (HTML) — pre-filled with the student roster, editable</label>
              <textarea value={trainerBody} onChange={(e) => setTrainerBody(e.target.value)} rows={8} style={{ width: "100%" }} />
            </div>
            <div className="fc-field" style={{ marginBottom: 12 }}>
              <label>CC (comma-separated, optional)</label>
              <input value={trainerCc} onChange={(e) => setTrainerCc(e.target.value)} style={{ width: "100%" }} />
            </div>
            <button className="rp-btn-accent" onClick={sendTrainerNotification} disabled={sendingTrainerMail || !createdBatch.trainer.email}>
              {sendingTrainerMail ? "Sending…" : "Notify Trainer"}
            </button>
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <button className="td-pill off" style={{ border: "none", cursor: "pointer" }} onClick={() => navigate("/training")}>
            Done — Back to Training Management
          </button>
        </div>
      </div>
    );
  }

  // --- Pre-creation view: the actual batch + student-selection form ---
  return (
    <div className="td-screen">
      <Link to="/training" style={{ fontSize: "14.5px", color: "#5b6478" }}>
        ← Back to Training Management
      </Link>
      <h1>New Batch</h1>

      {error && <p className="td-error">{error}</p>}

      <form onSubmit={handleSubmit}>
        <div className="td-panel fc-form" style={{ marginBottom: 20 }}>
          <h3>Batch Details</h3>
          <div className="fc-field-grid">
            <div className="fc-field">
              <label>Course</label>
              <select
                required={!showNewCourseForm}
                value={form.course}
                onChange={(e) => handleCourseSelect(e.target.value)}
              >
                <option value="">Select a course</option>
                <option value={ADD_NEW_COURSE_VALUE}>+ Add New Course</option>
                {courses.map((c) => (
                  <option key={c.course_id} value={c.course_id}>{c.course_name}</option>
                ))}
              </select>

              {showNewCourseForm && (
                <div style={{
                  marginTop: 10, padding: 12, border: "1px solid #d1d5db",
                  borderRadius: 8, background: "#f9fafb",
                }}>
                  <p style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 8 }}>New Course</p>
                  {courseError && <p className="td-error" style={{ fontSize: 13.5, marginBottom: 8 }}>{courseError}</p>}
                  <input
                    placeholder="Course name"
                    value={newCourseName}
                    onChange={(e) => setNewCourseName(e.target.value)}
                    style={{ width: "100%", marginBottom: 8, padding: 6, fontSize: 14.5 }}
                  />
                  <textarea
                    placeholder="Description (optional)"
                    value={newCourseDescription}
                    onChange={(e) => setNewCourseDescription(e.target.value)}
                    rows={2}
                    style={{ width: "100%", marginBottom: 8, padding: 6, fontSize: 14.5 }}
                  />
                  <input
                    type="number"
                    placeholder="Duration in days (optional)"
                    value={newCourseDuration}
                    onChange={(e) => setNewCourseDuration(e.target.value)}
                    style={{ width: "100%", marginBottom: 8, padding: 6, fontSize: 14.5 }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={saveNewCourse}
                      disabled={savingCourse}
                      className="rp-btn-accent"
                      style={{ fontSize: 13.5, padding: "6px 12px" }}
                    >
                      {savingCourse ? "Saving…" : "Save Course"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelNewCourse}
                      style={{ fontSize: 13.5, padding: "6px 12px", border: "none", background: "none", color: "#6b7280", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="fc-field">
              <label>Trainer</label>
              <select value={form.trainer} onChange={(e) => updateField("trainer", e.target.value)}>
                <option value="">Unassigned</option>
                {trainers.map((t) => (
                  <option key={t.trainer_id} value={t.trainer_id}>{t.trainer_name}</option>
                ))}
              </select>
            </div>

            <div className="fc-field">
              <label>Batch Code</label>
              <input required value={form.batch_code} onChange={(e) => updateField("batch_code", e.target.value)} />
            </div>

            <div className="fc-field">
              <label>Batch Name</label>
              <input required value={form.batch_name} onChange={(e) => updateField("batch_name", e.target.value)} />
            </div>

            <div className="fc-field">
              <label>Start Date</label>
              <input type="date" required value={form.start_date} onChange={(e) => updateField("start_date", e.target.value)} />
            </div>

            <div className="fc-field">
              <label>End Date</label>
              <input type="date" value={form.end_date} onChange={(e) => updateField("end_date", e.target.value)} />
            </div>

            <div className="fc-field">
              <label>Capacity</label>
              <input type="number" min="1" value={form.capacity} onChange={(e) => updateField("capacity", e.target.value)} />
            </div>

            <div className="fc-field">
              <label>Status</label>
              <select value={form.status} onChange={(e) => updateField("status", e.target.value)}>
                <option value="PLANNED">Planned</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        <div className="td-panel" style={{ marginBottom: 20 }}>
          <div className="td-panel-head">
            <h3>Select Students ({selectedStudents.size} selected)</h3>
          </div>
          <div className="td-table-scroll">
            <table className="td-table">
              <thead>
                <tr><th></th><th>Name</th><th>Course</th><th>Personal Email</th><th>Official Email</th></tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr><td colSpan={5} className="td-empty">No converted students waiting to be grouped.</td></tr>
                ) : (
                  students.map((s) => (
                    <tr key={s.enquiry_id}>
                      <td>
                        <input type="checkbox" checked={selectedStudents.has(s.enquiry_id)} onChange={() => toggleStudent(s.enquiry_id)} />
                      </td>
                      <td className="td-name">{s.name}</td>
                      <td className="td-sub">{s.course_name}</td>
                      <td className="td-sub">{s.personal_email || "—"}</td>
                      <td className="td-sub">{s.official_email || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="fc-submit-row">
          <button type="submit" className="rp-btn-accent" disabled={saving || showNewCourseForm}>
            {saving ? "Creating…" : "Create Batch"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default BatchForm;