import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import client from "../../../api/client";
import "../styles/Email.css";

function Approvals() {
  const [approvals, setApprovals] = useState([]);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState(null);

  const loadApprovals = () => {
    client.get("/api/email/approvals/").then(({ data }) => setApprovals(data)).catch(() => setError("Couldn't load approvals."));
  };

  useEffect(() => {
    loadApprovals();
  }, []);

  const handleAction = async (approvalId, action) => {
    setActingId(approvalId);
    setError("");
    try {
      await client.post(`/api/email/approvals/${approvalId}/action/`, { action });
      loadApprovals();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't record that decision.");
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="mail-screen">
      <div className="mail-head">
        <div>
          <span className="mail-eyebrow">Email</span>
          <h1>Approvals</h1>
          <p>Emails that need sign-off before they can send.</p>
        </div>
      </div>

      {error && <div className="mail-error">{error}</div>}

      <div className="mail-panel">
        <div className="mail-panel-body" style={{ padding: 0 }}>
          {approvals.length === 0 ? (
            <p className="mail-empty">Nothing waiting on approval.</p>
          ) : (
            <div className="mail-table-wrap">
              <table className="mail-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Recipient</th>
                    <th>Approver</th>
                    <th>Level</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map((a) => (
                    <tr key={a.email_approval_id}>
                      <td>{a.ai_email_subject}</td>
                      <td>{a.ai_email_recipient}</td>
                      <td>{a.approver_name}</td>
                      <td>{a.approval_level}</td>
                      <td><span className={`mail-badge ${a.approval_status.toLowerCase()}`}>{a.approval_status}</span></td>
                      <td>
                        {a.approval_status === "PENDING" ? (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              type="button"
                              className="mail-btn-sm"
                              onClick={() => handleAction(a.email_approval_id, "approve")}
                              disabled={actingId === a.email_approval_id}
                            >
                              <Check size={13} /> Approve
                            </button>
                            <button
                              type="button"
                              className="mail-btn-sm"
                              onClick={() => handleAction(a.email_approval_id, "reject")}
                              disabled={actingId === a.email_approval_id}
                            >
                              <X size={13} /> Reject
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: "#8a93a6", fontSize: 14 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Approvals;
