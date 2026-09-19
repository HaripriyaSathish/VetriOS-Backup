import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../../../api/client";
import "../styles/TrainingDashboard.css";

function FeeConvertDetail() {
  const { enquiryId } = useParams();

  const [enquiry, setEnquiry] = useState(null);
  const [plan, setPlan] = useState(null);
  const [planExists, setPlanExists] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState({ base_fee: "", gst_percentage: "18.00", plan_type: "full", installment_count: 1 });
  const [creating, setCreating] = useState(false);

  const [convertForm, setConvertForm] = useState({
    username: "", password: "", official_email: "", official_email_password: "",
  });
  const [converting, setConverting] = useState(false);
  const [credentialReveal, setCredentialReveal] = useState(null);
  const [resetting, setResetting] = useState(false);

  const [officialEmailInput, setOfficialEmailInput] = useState("");
  const [officialEmailPasswordInput, setOfficialEmailPasswordInput] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const enquiryRes = await client.get(`/api/admissions/enquiries/${enquiryId}/`);
      setEnquiry(enquiryRes.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't load enquiry.");
    }

    try {
      const { data } = await client.get(`/api/admissions/enquiries/${enquiryId}/fee-plan/`);
      setPlan(data);
      setPlanExists(true);
    } catch (err) {
      if (err.response?.status === 404) setPlanExists(false);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquiryId]);

  const createPlan = async (event) => {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      await client.post(`/api/admissions/enquiries/${enquiryId}/fee-plan/`, form);
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't create fee plan.");
    } finally {
      setCreating(false);
    }
  };

  const markPaid = async (installmentId) => {
    try {
      await client.post(`/api/admissions/installments/${installmentId}/mark-paid/`);
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't mark installment paid.");
    }
  };

  const convertToStudent = async (event) => {
    event.preventDefault();
    setConverting(true);
    setError("");
    try {
      const { data } = await client.post(
        `/api/admissions/enquiries/${enquiryId}/convert-to-student/`,
        {
          username: convertForm.username,
          password: convertForm.password,
          official_email: convertForm.official_email,
        }
      );
      setCredentialReveal({ ...data, official_email_password: convertForm.official_email_password });
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't convert to student.");
    } finally {
      setConverting(false);
    }
  };

  const resetPassword = async () => {
    setResetting(true);
    setError("");
    try {
      const { data } = await client.post(`/api/admissions/enquiries/${enquiryId}/reset-password/`);
      setCredentialReveal(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't reset password.");
    } finally {
      setResetting(false);
    }
  };

  const saveOfficialEmail = async () => {
    setSavingEmail(true);
    setError("");
    try {
      await client.post(`/api/admissions/enquiries/${enquiryId}/official-email/`, {
        official_email: officialEmailInput,
      });
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't save official email.");
    } finally {
      setSavingEmail(false);
    }
  };

  const whatsappShareUrl = (cred) => {
    let message = `Hi! Your VetriOS student login:\nUsername: ${cred.username}\nPassword: ${cred.password}`;
    if (cred.official_email) {
      message += `\n\nYour official email:\nAddress: ${cred.official_email}`;
      if (cred.official_email_password) {
        message += `\nPassword: ${cred.official_email_password}`;
      }
    }
    message += `\n\nPlease log in and change your passwords after first login.`;
    const number = (cred.whatsapp_number || "").replace(/\D/g, "");
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  };

  const whatsappShareUrlForExisting = (enquiry, officialEmail, officialEmailPassword) => {
    let message = `Hi! Your VetriOS account details:\nUsername: ${enquiry.username}`;
    message += `\n(If you've lost your login password, ask us to reset it.)`;
    if (officialEmail) {
      message += `\n\nYour official email:\nAddress: ${officialEmail}`;
      if (officialEmailPassword) {
        message += `\nPassword: ${officialEmailPassword}`;
      }
    }
    const number = (enquiry.whatsapp_number || "").replace(/\D/g, "");
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  };

  const downloadInvoice = async (installmentId, studentName) => {
    try {
      const response = await client.get(
        `/api/admissions/installments/${installmentId}/invoice/`,
        { responseType: "blob" }
      );
      const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `Invoice_${studentName.replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError("Couldn't download invoice.");
    }
  };

  const shareInvoiceViaWhatsApp = async (installmentId, studentName, whatsappNumber) => {
    try {
      const response = await client.get(
        `/api/admissions/installments/${installmentId}/invoice/`,
        { responseType: "blob" }
      );
      const file = new File([response.data], `Invoice_${studentName.replace(/\s+/g, "_")}.pdf`, {
        type: "application/pdf",
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Invoice",
          text: `Invoice for ${studentName}`,
        });
      } else {
        const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(blobUrl);

        const number = (whatsappNumber || "").replace(/\D/g, "");
        const message = `Hi ${studentName}, please find your invoice attached (downloaded to your device — please attach it here).`;
        window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank");
      }
    } catch (err) {
      setError("Couldn't share invoice.");
    }
  };

  if (loading) return <p className="td-empty">Loading…</p>;

  const hasAnyPaid = plan?.installments?.some((i) => i.paid);

  return (
    <div className="td-screen">
      <Link to="/training/fee-conversion" style={{ fontSize: "14.5px", color: "#5b6478" }}>
        ← Back to Fee & Conversion
      </Link>
      <h1>Set Fee & Convert{enquiry ? ` — ${enquiry.name}` : ""}</h1>

      {error && <p className="td-error">{error}</p>}

      {!planExists ? (
        <form className="td-panel fc-form" onSubmit={createPlan}>
          <h3>Set Fee Plan</h3>

          <div className="fc-field-grid">
            <div className="fc-field">
              <label>Base fee (before GST)</label>
              <input
                type="number" step="0.01" required
                value={form.base_fee}
                onChange={(e) => setForm({ ...form, base_fee: e.target.value })}
              />
            </div>

            <div className="fc-field">
              <label>GST %</label>
              <input
                type="number" step="0.01"
                value={form.gst_percentage}
                onChange={(e) => setForm({ ...form, gst_percentage: e.target.value })}
              />
            </div>

            <div className="fc-field">
              <label>Plan type</label>
              <select
                value={form.plan_type}
                onChange={(e) => setForm({ ...form, plan_type: e.target.value })}
              >
                <option value="full">Full payment</option>
                <option value="emi">Installments</option>
              </select>
            </div>

            {form.plan_type === "emi" && (
              <div className="fc-field">
                <label>Number of installments</label>
                <input
                  type="number" min="2"
                  value={form.installment_count}
                  onChange={(e) => setForm({ ...form, installment_count: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className="fc-submit-row">
            <button type="submit" className="rp-btn-accent" disabled={creating}>
              {creating ? "Saving…" : "Create Fee Plan"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="td-panel" style={{ padding: 20, marginBottom: 20 }}>
            <h3>Fee Plan</h3>
            <p>
              Base: ₹{plan.base_fee} + {plan.gst_percentage}% GST = <strong>₹{plan.total_with_gst}</strong>
              {" "}({plan.plan_type === "emi" ? `${plan.installment_count} installments` : "full payment"})
            </p>
          </div>

          <div className="td-panel">
            <div className="td-panel-head"><h3>Installments</h3></div>
            <div className="td-table-scroll">
              <table className="td-table">
                <thead>
                  <tr>
                    <th>#</th><th>Amount</th><th>Due Date</th><th>Status</th><th></th><th>Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.installments.map((i) => (
                    <tr key={i.student_fee_installment_id}>
                      <td className="td-mono">{i.installment_number}</td>
                      <td className="td-mono">₹{i.amount}</td>
                      <td className="td-mono">{i.due_date}</td>
                      <td>
                        <span className={"td-pill " + (i.paid ? "on" : "off")}>
                          {i.paid ? `Paid ${i.paid_on}` : "Unpaid"}
                        </span>
                      </td>
                      <td>
                        {!i.paid && (
                          <button
                            className="td-pill on" style={{ border: "none", cursor: "pointer" }}
                            onClick={() => markPaid(i.student_fee_installment_id)}
                          >
                            Mark Paid
                          </button>
                        )}
                      </td>
                      <td style={{ display: "flex", gap: 6 }}>
                        {i.paid && (
                          <>
                            <button
                              className="td-pill on" style={{ border: "none", cursor: "pointer" }}
                              onClick={() => downloadInvoice(i.student_fee_installment_id, enquiry.name)}
                            >
                              Download
                            </button>
                            <button
                              className="td-pill on" style={{ border: "none", cursor: "pointer" }}
                              onClick={() => shareInvoiceViaWhatsApp(i.student_fee_installment_id, enquiry.name, enquiry.whatsapp_number)}
                            >
                              Share on WhatsApp
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="td-panel" style={{ padding: 20, marginTop: 20 }}>
            <h3>Student Account</h3>

            {credentialReveal ? (
              <div>
                <p className="td-sub">
                  ⚠️ These are shown only once and cannot be retrieved again — share them now.
                </p>
                <p><strong>Username:</strong> {credentialReveal.username}</p>
                <p><strong>Login Password:</strong> {credentialReveal.password}</p>
                {credentialReveal.official_email && (
                  <p><strong>Official Email:</strong> {credentialReveal.official_email}</p>
                )}
                {credentialReveal.official_email_password && (
                  <p><strong>Official Email Password:</strong> {credentialReveal.official_email_password}</p>
                )}
                <a
                  href={whatsappShareUrl(credentialReveal)}
                  target="_blank" rel="noreferrer"
                  className="rp-btn-accent"
                  style={{ display: "inline-block", textDecoration: "none", marginTop: 8 }}
                >
                  Share via WhatsApp
                </a>
              </div>
            ) : enquiry?.account_created ? (
              <div>
                <p className="td-sub">
                  Account already exists — username: <strong>{enquiry.username}</strong>.
                  {enquiry.official_email && <> Official email: <strong>{enquiry.official_email}</strong>.</>}
                  {" "}Password isn't stored, so it can't be shown again. Reset it to generate a new one.
                </p>

                <div className="fc-account-form">
                  <div className="fc-field">
                    <label>{enquiry.official_email ? "Update Official Email" : "Set Official Email"} <span className="td-sub">(from Hostinger)</span></label>
                    <input
                      type="email"
                      value={officialEmailInput}
                      onChange={(e) => setOfficialEmailInput(e.target.value)}
                      placeholder={enquiry.official_email || "name@vetritech.in"}
                    />
                  </div>
                  <div className="fc-field">
                    <label>Official Email Password</label>
                    <input
                      type="text"
                      value={officialEmailPasswordInput}
                      onChange={(e) => setOfficialEmailPasswordInput(e.target.value)}
                      placeholder="not stored — used once, for sharing only"
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    className="td-pill on" style={{ border: "none", cursor: "pointer" }}
                    onClick={saveOfficialEmail} disabled={savingEmail}
                  >
                    {savingEmail ? "Saving…" : "Save Official Email"}
                  </button>

                  <a
                    href={whatsappShareUrlForExisting(
                      enquiry,
                      officialEmailInput || enquiry.official_email,
                      officialEmailPasswordInput
                    )}
                    target="_blank" rel="noreferrer"
                    className="td-pill on"
                    style={{ textDecoration: "none" }}
                  >
                    Share via WhatsApp
                  </a>
                </div>

                <div style={{ marginTop: 16 }}>
                  <button className="rp-btn-accent" onClick={resetPassword} disabled={resetting}>
                    {resetting ? "Resetting…" : "Reset Password"}
                  </button>
                </div>
              </div>
            ) : !hasAnyPaid ? (
              <p className="td-sub">At least one installment must be paid before creating the account.</p>
            ) : (
              <form onSubmit={convertToStudent}>
                <div className="fc-account-form">
                  <div className="fc-field">
                    <label>Username</label>
                    <input
                      required
                      value={convertForm.username}
                      onChange={(e) => setConvertForm({ ...convertForm, username: e.target.value })}
                    />
                  </div>
                  <div className="fc-field">
                    <label>Temporary password</label>
                    <input
                      type="text" required
                      value={convertForm.password}
                      onChange={(e) => setConvertForm({ ...convertForm, password: e.target.value })}
                    />
                  </div>
                  <div className="fc-field">
                    <label>Official Email Address <span className="td-sub">(from Hostinger)</span></label>
                    <input
                      type="email"
                      value={convertForm.official_email}
                      onChange={(e) => setConvertForm({ ...convertForm, official_email: e.target.value })}
                    />
                  </div>
                  <div className="fc-field">
                    <label>Official Email Password</label>
                    <input
                      type="text"
                      value={convertForm.official_email_password}
                      onChange={(e) => setConvertForm({ ...convertForm, official_email_password: e.target.value })}
                    />
                  </div>
                </div>
                <div className="fc-account-submit">
                  <button type="submit" className="rp-btn-accent" disabled={converting}>
                    {converting ? "Creating…" : "Create Student Account"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default FeeConvertDetail;