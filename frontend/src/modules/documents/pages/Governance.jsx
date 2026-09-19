import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ShieldAlert, Info, Plus, Trash2 } from "lucide-react";
import client from "../../../api/client";
import SearchSelect from "../components/SearchSelect";
import "../styles/Documents.css";

const EMPTY_RULE = { scope: "role", target_id: "", access_level_id: "", effective_from: "", is_allowed: true };
const EMPTY_RETENTION = {
  retention_start_date: "", retention_period_days: "", disposition_action: "REVIEW",
  legal_hold: false, status: "ACTIVE", remarks: "",
};

function Governance() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [documents, setDocuments] = useState([]);
  const [documentId, setDocumentId] = useState("");

  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [accessLevels, setAccessLevels] = useState([]);

  const [rules, setRules] = useState([]);
  const [retention, setRetention] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [ruleForm, setRuleForm] = useState(EMPTY_RULE);
  const [retentionForm, setRetentionForm] = useState(EMPTY_RETENTION);
  const [savingRetention, setSavingRetention] = useState(false);

  useEffect(() => {
    client.get("/api/documents/library/").then(({ data }) => setDocuments(data)).catch(() => {});
    client.get("/api/identity/roles/").then(({ data }) => setRoles(data)).catch(() => {});
    client.get("/api/hr/departments/").then(({ data }) => setDepartments(data.filter((d) => d.is_active))).catch(() => {});
    client.get("/api/identity/users/").then(({ data }) => setUsers(data)).catch(() => {});
    client.get("/api/documents/library/filters/").then(({ data }) => setAccessLevels(data.access_levels)).catch(() => {});
  }, []);

  const loadDocumentGovernance = async (id) => {
    setLoading(true);
    setError("");
    try {
      const [rulesRes, retentionRes] = await Promise.all([
        client.get(`/api/documents/library/${id}/access-rules/`),
        client.get(`/api/documents/library/${id}/retention/`),
      ]);
      setRules(rulesRes.data);
      setRetention(retentionRes.data);
      setRetentionForm(
        retentionRes.data
          ? {
              retention_start_date: retentionRes.data.retention_start_date,
              retention_period_days: retentionRes.data.retention_period_days || "",
              disposition_action: retentionRes.data.disposition_action,
              legal_hold: retentionRes.data.legal_hold,
              status: retentionRes.data.status,
              remarks: retentionRes.data.remarks || "",
            }
          : EMPTY_RETENTION
      );
    } catch (err) {
      setError("Couldn't load governance data for this document.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDocument = (id) => {
    setDocumentId(id);
    setRuleForm(EMPTY_RULE);
    if (id) loadDocumentGovernance(id);
    else {
      setRules([]);
      setRetention(null);
    }
  };

  // Arriving from Library's "Manage Access" link — pre-select that
  // document instead of making the user search for it again. Keyed off
  // the actual param STRING, not the searchParams object — react-router
  // hands back a new URLSearchParams instance on every render, so
  // depending on the object itself re-fires this on every state update
  // handleSelectDocument causes, looping forever.
  const documentIdParam = searchParams.get("documentId");
  useEffect(() => {
    if (documentIdParam) handleSelectDocument(Number(documentIdParam));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentIdParam]);

  const handleAddRule = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const payload = {
        access_level_id: Number(ruleForm.access_level_id),
        effective_from: ruleForm.effective_from,
        is_allowed: ruleForm.is_allowed,
        role_id: ruleForm.scope === "role" ? Number(ruleForm.target_id) : null,
        department_id: ruleForm.scope === "department" ? Number(ruleForm.target_id) : null,
        user_id: ruleForm.scope === "user" ? Number(ruleForm.target_id) : null,
      };
      await client.post(`/api/documents/library/${documentId}/access-rules/`, payload);
      setRuleForm(EMPTY_RULE);
      loadDocumentGovernance(documentId);
    } catch (err) {
      const data = err.response?.data;
      setError(data ? Object.values(data).flat().join(" ") : "Couldn't add that rule.");
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm("Remove this access rule? The role/department/user will lose this access immediately.")) {
      return;
    }
    try {
      await client.delete(`/api/documents/library/${documentId}/access-rules/${ruleId}/`);
      setRules((prev) => prev.filter((r) => r.document_access_rule_id !== ruleId));
    } catch (err) {
      setError("Couldn't remove that rule.");
    }
  };

  const handleSaveRetention = async (event) => {
    event.preventDefault();
    setSavingRetention(true);
    setError("");
    try {
      const { data } = await client.put(`/api/documents/library/${documentId}/retention/`, {
        ...retentionForm,
        retention_period_days: retentionForm.retention_period_days || null,
      });
      setRetention(data);
    } catch (err) {
      const data = err.response?.data;
      setError(data ? Object.values(data).flat().join(" ") : "Couldn't save retention settings.");
    } finally {
      setSavingRetention(false);
    }
  };

  const scopeOptions = ruleForm.scope === "role" ? roles.map((r) => ({ value: r.role_id, label: r.role_name }))
    : ruleForm.scope === "department" ? departments.map((d) => ({ value: d.department_id, label: d.department_name }))
    : users.map((u) => ({ value: u.user_id, label: u.full_name }));

  return (
    <div className="doc-screen gov-screen">
      <div className="doc-head">
        <div>
          <span className="doc-eyebrow">Document Generator</span>
          <h1>Access & Governance</h1>
          <p>Control who can see a document and how long it's retained.</p>
        </div>
        <button type="button" className="doc-btn-sm" onClick={() => navigate("/documents")}>
          <ArrowLeft size={14} />
          Back to Library
        </button>
      </div>

      <div className="doc-panel" style={{ marginBottom: 20 }}>
        <div className="doc-panel-body">
          <label style={{ fontSize: 14, fontWeight: 700, color: "#3a4152", display: "block", marginBottom: 6 }}>
            Pick a document
          </label>
          <SearchSelect
            placeholder="Search documents…"
            value={documentId}
            onChange={handleSelectDocument}
            options={documents.map((d) => ({ value: d.document_id, label: d.title }))}
          />
        </div>
      </div>

      {error && <div className="doc-error">{error}</div>}

      {!documentId ? (
        <div className="doc-panel">
          <p className="doc-empty">Pick a document above to manage its access rules and retention.</p>
        </div>
      ) : loading ? (
        <div className="doc-panel">
          <p className="doc-empty">Loading…</p>
        </div>
      ) : (
        <>
          <div className="doc-panel" style={{ marginBottom: 20 }}>
            <div className="doc-panel-head" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="doc-icon-tile blue">
                <ShieldAlert size={18} />
              </div>
              <h3>Who has access</h3>
            </div>
            <div className="doc-inherit-note">
              <Info size={13} />
              Everyone currently allowed or denied access to this document.
            </div>

            {rules.length === 0 ? (
              <p className="doc-empty">No access rules yet for this document.</p>
            ) : (
              <div className="doc-table-wrap">
                <table className="doc-table">
                  <thead>
                    <tr>
                      <th>Scope</th>
                      <th>Subject</th>
                      <th>Access level</th>
                      <th>Allowed</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.document_access_rule_id}>
                        <td>
                          <span className="doc-scope-pill">
                            {r.role_id ? "ROLE" : r.department_id ? "DEPARTMENT" : "USER"}
                          </span>
                        </td>
                        <td>{r.role_name || r.department_name || r.user_name}</td>
                        <td>{r.access_level_name}</td>
                        <td>
                          <span className={`doc-badge ${r.is_allowed ? "approved" : "rejected"}`}>
                            {r.is_allowed ? "Allowed" : "Denied"}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="doc-icon-btn danger"
                            onClick={() => handleDeleteRule(r.document_access_rule_id)}
                            data-tooltip="Revoke access"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="doc-panel" style={{ marginBottom: 20 }}>
            <div className="doc-panel-head" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="doc-icon-tile green">
                <Plus size={18} />
              </div>
              <h3>Add access rule</h3>
            </div>
            <form className="doc-form" onSubmit={handleAddRule} style={{ padding: "16px 18px" }}>
              <label>Scope</label>
              <select
                value={ruleForm.scope}
                onChange={(e) => setRuleForm({ ...EMPTY_RULE, scope: e.target.value })}
              >
                <option value="role">Role</option>
                <option value="department">Department</option>
                <option value="user">User</option>
              </select>

              <label>{ruleForm.scope === "role" ? "Role" : ruleForm.scope === "department" ? "Department" : "User"}</label>
              <SearchSelect
                placeholder={`Search ${ruleForm.scope}s…`}
                value={ruleForm.target_id}
                onChange={(v) => setRuleForm({ ...ruleForm, target_id: v })}
                options={scopeOptions}
              />

              <label>Access level</label>
              <select
                value={ruleForm.access_level_id}
                onChange={(e) => setRuleForm({ ...ruleForm, access_level_id: e.target.value })}
                required
              >
                <option value="">Select…</option>
                {accessLevels.map((a) => <option key={a.access_level_id} value={a.access_level_id}>{a.access_name}</option>)}
              </select>

              <label>Effective from</label>
              <input
                type="date"
                value={ruleForm.effective_from}
                onChange={(e) => setRuleForm({ ...ruleForm, effective_from: e.target.value })}
                required
              />

              <div style={{ marginTop: 16 }}>
                <button type="submit" className="doc-btn-accent">
                  <Plus size={14} />
                  Add rule
                </button>
              </div>
            </form>
          </div>

          <div className="doc-panel">
            <div className="doc-panel-head" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="doc-icon-tile rose">
                <Trash2 size={18} />
              </div>
              <h3>Retention policy</h3>
            </div>

            {retentionForm.legal_hold && (
              <div className="doc-banner-warning">
                <ShieldAlert size={14} />
                Protected — archiving/deletion is overridden while this is on.
              </div>
            )}

            <form className="doc-form" onSubmit={handleSaveRetention} style={{ padding: 18 }}>
              <div className="doc-field-row">
                <div>
                  <label>Retention start date</label>
                  <input
                    type="date"
                    value={retentionForm.retention_start_date}
                    onChange={(e) => setRetentionForm({ ...retentionForm, retention_start_date: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label>Retention period (days)</label>
                  <input
                    type="number"
                    min="1"
                    value={retentionForm.retention_period_days}
                    onChange={(e) => setRetentionForm({ ...retentionForm, retention_period_days: e.target.value })}
                  />
                </div>
              </div>

              <label>On expiry</label>
              <select
                value={retentionForm.disposition_action}
                onChange={(e) => setRetentionForm({ ...retentionForm, disposition_action: e.target.value })}
              >
                <option value="REVIEW">Review</option>
                <option value="ARCHIVE">Archive</option>
                <option value="DELETE">Delete</option>
                <option value="PERMANENT">Permanent</option>
              </select>

              <label>Status</label>
              <select
                value={retentionForm.status}
                onChange={(e) => setRetentionForm({ ...retentionForm, status: e.target.value })}
              >
                <option value="ACTIVE">Active</option>
                <option value="EXPIRED">Expired</option>
                <option value="ON_HOLD">On Hold</option>
                <option value="COMPLETED">Completed</option>
              </select>

              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="doc-toggle danger">
                  <input
                    type="checkbox"
                    checked={retentionForm.legal_hold}
                    onChange={(e) => setRetentionForm({ ...retentionForm, legal_hold: e.target.checked })}
                  />
                  <span className="doc-toggle-track" />
                </span>
                Protected
              </label>
              <p style={{ fontSize: 13.5, color: "#161a26", fontStyle: "italic", margin: "-8px 0 16px" }}>
                Turn this on to stop this document from being archived or deleted, even after its retention period ends — useful when it's needed for a legal case, audit, or other reason it must be kept untouched for now.
              </p>

              <label>Remarks (optional)</label>
              <textarea
                value={retentionForm.remarks}
                onChange={(e) => setRetentionForm({ ...retentionForm, remarks: e.target.value })}
              />

              <div style={{ marginTop: 16 }}>
                <button type="submit" className="doc-btn-accent" disabled={savingRetention}>
                  {savingRetention ? "Saving…" : retention ? "Update retention" : "Set retention"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

export default Governance;
