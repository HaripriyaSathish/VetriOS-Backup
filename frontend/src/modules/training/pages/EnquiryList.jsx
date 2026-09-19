import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../../../api/client";
import "../styles/TrainingDashboard.css";

const EMPTY_FORM = {
  course_id: "", name: "", date_of_birth: "", whatsapp_number: "",
  personal_email: "", education_summary: "", passed_out_year: "", source: "other", address: "",
};

function EnquiryList() {
  const [enquiries, setEnquiries] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await client.get("/api/admissions/enquiries/");
      setEnquiries(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't load enquiries.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError("");
    setFormOpen(true);
  };

  const closeForm = () => setFormOpen(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      await client.post("/api/admissions/enquiries/", form);
      setFormOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const markEligible = async (enquiryId) => {
    try {
      await client.post(`/api/admissions/enquiries/${enquiryId}/mark-eligible/`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't mark eligible.");
    }
  };

  if (loading) return <p className="td-empty">Loading…</p>;

  return (
    <div className="td-screen">
      <div className="td-head">
        <div>
          <Link to="/training" style={{ fontSize: "14.5px", color: "#5b6478" }}>
            ← Back to Training Management
          </Link>
          <h1>Enquiries</h1>
          <p>{enquiries.length} total</p>
        </div>
        <button className="td-pill on" style={{ border: "none", cursor: "pointer" }} onClick={openCreate}>
          + Log Enquiry
        </button>
      </div>

      {error && <p className="td-error">{error}</p>}

      <div className="td-panel">
        <div className="td-panel-head">
          <h3>All Enquiries</h3>
        </div>
        <div className="td-table-scroll">
          <table className="td-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Course</th>
                <th>WhatsApp</th>
                <th>Age</th>
                <th>Eligible</th>
                <th>Passed Out</th>
                <th>Source</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {enquiries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="td-empty">No enquiries logged yet.</td>
                </tr>
              ) : (
                enquiries.map((e) => (
                  <tr key={e.enquiry_id}>
                    <td className="td-name">{e.name}</td>
                    <td className="td-sub">{e.course_name}</td>
                    <td className="td-mono">{e.whatsapp_number}</td>
                    <td className="td-mono">{e.age ?? "—"}</td>
                    <td>
                      {e.is_eligible === null ? (
                        "—"
                      ) : (
                        <span className={"td-pill " + (e.is_eligible ? "on" : "off")}>
                          {e.is_eligible ? "Eligible" : "Not eligible"}
                        </span>
                      )}
                    </td>
                    <td className="td-mono">{e.passed_out_year || "—"}</td>
                    <td className="td-sub">{e.source}</td>
                    <td>
                      <span className={"td-pill " + (e.status === "new" ? "off" : "on")}>
                        {e.status}
                      </span>
                    </td>
                    <td>
                      {e.status === "new" && (
                        <button
                          className="td-pill on"
                          style={{ border: "none", cursor: "pointer" }}
                          onClick={() => markEligible(e.enquiry_id)}
                        >
                          Mark Eligible
                        </button>
                      )}
                      {e.status === "shortlisted" && (
                        <Link to={`/training/fee-conversion/${e.enquiry_id}`}>
                          {e.has_fee_plan ? "Manage Payment" : "Set Fee & Convert"}
                        </Link>
                      )}
                      {e.status === "converted" && (
                        <Link to={`/training/fee-conversion/${e.enquiry_id}`}>
                          Account created
                        </Link>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <div className="rp-modal-backdrop" onClick={closeForm}>
          <form className="rp-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h2>Log a new enquiry</h2>

            <label>Course ID</label>
            <input
              value={form.course_id}
              onChange={(e) => setForm({ ...form, course_id: e.target.value })}
              required
            />

            <label>Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />

            <label>Date of birth</label>
            <input
              type="date"
              value={form.date_of_birth}
              onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
              required
            />

            <label>WhatsApp number</label>
            <input
              value={form.whatsapp_number}
              onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
              required
            />

            <label>Personal email</label>
            <input
              value={form.personal_email}
              onChange={(e) => setForm({ ...form, personal_email: e.target.value })}
            />

            <label>Educational details</label>
            <input
              value={form.education_summary}
              onChange={(e) => setForm({ ...form, education_summary: e.target.value })}
            />

            <label>Passed out year</label>
            <input
              type="number"
              value={form.passed_out_year}
              onChange={(e) => setForm({ ...form, passed_out_year: e.target.value })}
            />

            <label>Source</label>
            <select
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            >
              <option value="instagram">Instagram</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="referral">Referral</option>
              <option value="walk_in">Walk-in</option>
              <option value="other">Other</option>
            </select>

            {formError && <p className="td-error">{formError}</p>}

            <div className="rp-modal-actions">
              <button type="button" className="rp-btn-sm" onClick={closeForm}>
                Cancel
              </button>
              <button type="submit" className="rp-btn-accent" disabled={submitting}>
                {submitting ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default EnquiryList;