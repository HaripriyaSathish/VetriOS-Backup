import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../../../api/client";
import "../styles/TrainingDashboard.css";

const DEFAULT_SUBJECT = "Welcome to VetriOS Training!";
const DEFAULT_BODY =
  "<p>Hi {{full_name}},</p><p>Welcome aboard! Your account has been created — we're excited to have you start your training journey with us.</p><p>Best,<br/>Vetri Technology Solutions</p>";

function WelcomeEmails() {
  const [enquiries, setEnquiries] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [cc, setCc] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await client.get("/api/admissions/enquiries/");
      setEnquiries(data.filter((e) => e.status === "converted"));
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't load enquiries.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalEnquired = enquiries.length;
  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    setSelected(selected.size === enquiries.length ? new Set() : new Set(enquiries.map((e) => e.enquiry_id)));
  };

  const send = async () => {
    if (selected.size === 0) {
      setError("Select at least one student.");
      return;
    }
    setSending(true);
    setError("");
    setResult(null);
    try {
      const { data } = await client.post("/api/admissions/send-welcome-email/", {
        enquiry_ids: Array.from(selected),
        subject,
        body,
        cc,
      });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't send emails.");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <p className="td-empty">Loading…</p>;

  return (
    <div className="td-screen">
      <Link to="/training" style={{ fontSize: "14.5px", color: "#5b6478" }}>
        ← Back to Training Management
      </Link>
      <h1>Welcome Emails</h1>
      <p>{totalEnquired} student account(s) created and eligible for a welcome email</p>

      {error && <p className="td-error">{error}</p>}
      {result && (
        <p className="td-sub">
          Sent to {result.sent_count} student(s).
          {result.skipped.length > 0 && ` ${result.skipped.length} skipped: ${result.skipped.map((s) => s.reason).join("; ")}`}
        </p>
      )}

      <div className="td-panel" style={{ marginBottom: 20 }}>
        <div className="td-panel-head">
          <h3>Select Students</h3>
          <button className="td-pill off" style={{ border: "none", cursor: "pointer" }} onClick={toggleAll}>
            {selected.size === enquiries.length ? "Deselect All" : "Select All"}
          </button>
        </div>
        <div className="td-table-scroll">
          <table className="td-table">
            <thead>
              <tr><th></th><th>Name</th><th>Personal Email</th><th>Official Email</th></tr>
            </thead>
            <tbody>
              {enquiries.length === 0 ? (
                <tr><td colSpan={4} className="td-empty">No converted students yet.</td></tr>
              ) : (
                enquiries.map((e) => (
                  <tr key={e.enquiry_id}>
                    <td>
                      <input type="checkbox" checked={selected.has(e.enquiry_id)} onChange={() => toggle(e.enquiry_id)} />
                    </td>
                    <td className="td-name">{e.name}</td>
                    <td className="td-sub">{e.personal_email || "—"}</td>
                    <td className="td-sub">{e.official_email || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="td-panel fc-form">
        <h3>Compose Email</h3>
        <div className="fc-field" style={{ marginBottom: 12 }}>
          <label>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div className="fc-field" style={{ marginBottom: 12 }}>
          <label>Body (HTML) — use {"{{full_name}}"} for personalization</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} style={{ width: "100%" }} />
        </div>
        <div className="fc-field" style={{ marginBottom: 12 }}>
          <label>CC (comma-separated, optional)</label>
          <input value={cc} onChange={(e) => setCc(e.target.value)} style={{ width: "100%" }} />
        </div>
        <button className="rp-btn-accent" onClick={send} disabled={sending}>
          {sending ? "Sending…" : `Send to ${selected.size} student(s)`}
        </button>
      </div>
    </div>
  );
}

export default WelcomeEmails;