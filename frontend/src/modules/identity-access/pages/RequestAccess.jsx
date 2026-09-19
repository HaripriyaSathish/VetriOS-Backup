import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck, Settings, Users, Briefcase, Check, FileText, ClipboardCheck,
  ArrowLeft, ArrowRight, Send, X, Plus, Search, Key, FileSearch,
} from "lucide-react";
import client from "../../../api/client";
import "../styles/RequestAccess.css";
import "../styles/PermissionRequests.css";

const CATEGORIES = [
  { value: "System Administrator", label: "System admin", icon: Settings },
  { value: "HR Administrator", label: "HR admin", icon: Users },
  { value: "Business Team", label: "Business team", icon: Briefcase },
];

const STEPS = [
  { label: "Who", icon: ShieldCheck },
  { label: "Admin", icon: Users },
  { label: "Details", icon: FileText },
  { label: "Review", icon: ClipboardCheck },
];

const STATUS_CLASS = { PENDING: "pending", APPROVED: "approved", REJECTED: "rejected", REVOKED: "revoked" };

// Login-credential requests are drafted through HR (Employees / Onboarding)
// and must be actioned from User & Accounts → Login requests, where
// Approve opens the New Account form and only marks the request approved
// once the login is actually created. Approving one here would mark it
// approved without ever creating an account, so callers get told nothing
// went wrong.
const isLoginRequest = (r) => r.permission_requested?.startsWith("Create login credentials for ");

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// Everything about "asking an admin for a permission" lives on this one
// page: send a new request (the step form below), and see both what
// you've asked for and what's been asked of you, with Approve/Reject
// right here — no separate inbox page to hunt for. Deciding a request
// is a decision + notification only, it doesn't grant the permission
// itself — that still happens separately via Roles/User Permissions.
function RequestAccess() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("new"); // "new" | "received" | "sent"

  // --- new request form ---
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState("");
  const [admins, setAdmins] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [adminId, setAdminId] = useState("");
  const [requestType, setRequestType] = useState("GENERAL"); // "GENERAL" | "DOCUMENT"
  const [permissionRequested, setPermissionRequested] = useState("");
  const [docQuery, setDocQuery] = useState("");
  const [docResults, setDocResults] = useState([]);
  const [docSearching, setDocSearching] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  // --- received / sent lists ---
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [confirmTarget, setConfirmTarget] = useState(null); // { req, action }
  const [note, setNote] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [actionError, setActionError] = useState("");

  const requests = tab === "received" ? receivedRequests : sentRequests;
  const receivedPendingCount = receivedRequests.filter((r) => r.status === "PENDING").length;
  const sentPendingCount = sentRequests.filter((r) => r.status === "PENDING").length;

  // Both lists load together (not just the active tab's) so the
  // Received/Sent tab buttons can always show a live pending count,
  // same idea as the sidebar's own badge.
  const refreshLists = async () => {
    setListLoading(true);
    setListError("");
    try {
      const [receivedRes, sentRes] = await Promise.all([
        client.get("/api/identity/permission-requests/", { params: { box: "received" } }),
        client.get("/api/identity/permission-requests/", { params: { box: "sent" } }),
      ]);
      setReceivedRequests(receivedRes.data);
      setSentRequests(sentRes.data);
    } catch {
      setListError("Couldn't load requests.");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    refreshLists();
  }, []);

  useEffect(() => {
    if (tab === "received" || tab === "sent") setListSearch("");
  }, [tab]);

  const filteredRequests = requests.filter((r) => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      tab === "received" ? r.requester_name : r.target_admin_name,
      r.admin_category,
      r.permission_requested,
      r.reason,
      r.status,
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  });

  const resetForm = () => {
    setStep(1);
    setCategory("");
    setAdmins([]);
    setAdminId("");
    setRequestType("GENERAL");
    setPermissionRequested("");
    setDocQuery("");
    setDocResults([]);
    setSelectedDoc(null);
    setReason("");
    setFieldError("");
    setSubmitError("");
    setDone(false);
  };

  // Debounced document search for the "specific document" request type.
  useEffect(() => {
    if (requestType !== "DOCUMENT") return;
    const q = docQuery.trim();
    setDocSearching(true);
    const timer = setTimeout(() => {
      client
        .get("/api/documents/library/search-for-access-request/", { params: q ? { search: q } : {} })
        .then(({ data }) => setDocResults(data))
        .catch(() => setDocResults([]))
        .finally(() => setDocSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [docQuery, requestType]);

  const startNewRequest = () => {
    resetForm();
    setTab("new");
  };

  const chooseCategory = async (cat) => {
    setCategory(cat);
    setAdminId("");
    setLoadingAdmins(true);
    try {
      const { data } = await client.get("/api/identity/admins/", { params: { category: cat } });
      setAdmins(data);
    } catch {
      setAdmins([]);
    } finally {
      setLoadingAdmins(false);
    }
    setStep(2);
  };

  const goReview = () => {
    if (requestType === "DOCUMENT") {
      if (!selectedDoc || !reason.trim()) {
        setFieldError("Pick a document and fill in the reason before continuing.");
        return;
      }
    } else if (!permissionRequested.trim() || !reason.trim()) {
      setFieldError("Fill in both fields before continuing.");
      return;
    }
    setFieldError("");
    setStep(4);
  };

  const selectedAdmin = admins.find((a) => String(a.user_id) === String(adminId));

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      await client.post("/api/identity/permission-requests/", {
        admin_category: category,
        target_admin_id: adminId,
        request_type: requestType,
        ...(requestType === "DOCUMENT"
          ? { document_id: selectedDoc.document_id }
          : { permission_requested: permissionRequested }),
        reason,
      });
      setDone(true);
      refreshLists();
    } catch (err) {
      setSubmitError(err.response?.data?.detail || "Couldn't send that request.");
    } finally {
      setSubmitting(false);
    }
  };

  const openConfirm = (req, action) => {
    setConfirmTarget({ req, action });
    setNote("");
    setActionError("");
  };

  const handleDecide = async () => {
    if (!confirmTarget) return;
    setDeciding(true);
    setActionError("");
    try {
      await client.post(`/api/identity/permission-requests/${confirmTarget.req.permission_request_id}/decide/`, {
        action: confirmTarget.action,
        note,
      });
      setConfirmTarget(null);
      await refreshLists();
    } catch (err) {
      setActionError(err.response?.data?.detail || "Couldn't record that decision.");
    } finally {
      setDeciding(false);
    }
  };

  return (
    <div className="reqa-screen vet-page-enter">
      <div className="reqa-head">
        <span className="reqa-eyebrow">Identity &amp; Access</span>
        <h1><span className="reqa-head-icon"><ShieldCheck size={19} /></span> Request access</h1>
        <p>Ask a specific admin for a permission — they'll review it and let you know.</p>
      </div>

      <div className="reqa-tabs">
        <button type="button" className={"reqa-tab" + (tab === "new" ? " active" : "")} onClick={startNewRequest}>
          <Plus size={14} /> New request
        </button>
        <button type="button" className={"reqa-tab" + (tab === "received" ? " active" : "")} onClick={() => setTab("received")}>
          Received
          {receivedPendingCount > 0 && <span className="reqa-tab-badge">{receivedPendingCount}</span>}
        </button>
        <button type="button" className={"reqa-tab" + (tab === "sent" ? " active" : "")} onClick={() => setTab("sent")}>
          Sent
          {sentPendingCount > 0 && <span className="reqa-tab-badge">{sentPendingCount}</span>}
        </button>
      </div>

      {tab === "new" && (
        <div className="reqa-panel">
          {!done && (
            <div className="reqa-steps">
              {STEPS.map((s, i) => {
                const n = i + 1;
                const state = n < step ? "done" : n === step ? "active" : "";
                return (
                  <div className="reqa-step" key={s.label}>
                    <div className={"reqa-step-dot " + state}>
                      {n < step ? <Check size={13} /> : <s.icon size={13} />}
                    </div>
                    <span className={"reqa-step-label " + state}>{s.label}</span>
                    {i < STEPS.length - 1 && <div className={"reqa-step-line " + (n < step ? "done" : "")} />}
                  </div>
                );
              })}
            </div>
          )}

          {!done ? (
            <>
              {step === 1 && (
                <div className="reqa-body">
                  <p className="reqa-hint">Who should review this request?</p>
                  <div className="reqa-cat-grid">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        className="reqa-cat-btn"
                        onClick={() => chooseCategory(c.value)}
                      >
                        <span className="reqa-cat-icon"><c.icon size={20} /></span>
                        <span>{c.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="reqa-actions">
                    <button type="button" onClick={() => navigate(-1)}>Cancel</button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="reqa-body">
                  <p className="reqa-hint">Which {category}?</p>
                  <select value={adminId} onChange={(e) => setAdminId(e.target.value)} disabled={loadingAdmins}>
                    <option value="">{loadingAdmins ? "Loading…" : "Select…"}</option>
                    {admins.map((a) => (
                      <option key={a.user_id} value={a.user_id}>{a.full_name}</option>
                    ))}
                  </select>
                  <div className="reqa-actions">
                    <button type="button" className="reqa-back" onClick={() => setStep(1)}>
                      <ArrowLeft size={14} /> Back
                    </button>
                    <button
                      type="button"
                      className="reqa-primary"
                      onClick={() => setStep(3)}
                      disabled={!adminId}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="reqa-body">
                  <p className="reqa-hint">What kind of access do you need?</p>
                  <div className="reqa-type-grid">
                    <button
                      type="button"
                      className={"reqa-type-btn" + (requestType === "GENERAL" ? " active" : "")}
                      onClick={() => setRequestType("GENERAL")}
                    >
                      <Key size={18} />
                      <span>General permission</span>
                    </button>
                    <button
                      type="button"
                      className={"reqa-type-btn" + (requestType === "DOCUMENT" ? " active" : "")}
                      onClick={() => setRequestType("DOCUMENT")}
                    >
                      <FileText size={18} />
                      <span>A specific document</span>
                    </button>
                  </div>

                  {requestType === "GENERAL" ? (
                    <>
                      <label>Permission needed</label>
                      <textarea
                        rows={3}
                        value={permissionRequested}
                        onChange={(e) => setPermissionRequested(e.target.value)}
                        placeholder="e.g. Access to the Payroll References page"
                      />
                    </>
                  ) : (
                    <>
                      <label>Find the document</label>
                      <div className="reqa-doc-search">
                        <FileSearch size={14} />
                        <input
                          value={docQuery}
                          onChange={(e) => { setDocQuery(e.target.value); setSelectedDoc(null); }}
                          placeholder="Search the Document Library…"
                        />
                      </div>
                      <div className="reqa-doc-results">
                        {docSearching ? (
                          <p className="reqa-doc-empty">Searching…</p>
                        ) : docResults.length === 0 ? (
                          <p className="reqa-doc-empty">No documents match.</p>
                        ) : (
                          docResults.map((d) => (
                            <button
                              type="button"
                              key={d.document_id}
                              className={"reqa-doc-row" + (selectedDoc?.document_id === d.document_id ? " selected" : "")}
                              onClick={() => setSelectedDoc(d)}
                            >
                              <FileText size={18} />
                              <div className="reqa-doc-row-text">
                                <div className="reqa-doc-title">{d.document_title}</div>
                                <div className="reqa-doc-meta">
                                  {d.confidentiality_level_name || "—"}
                                  {d.owner_name ? ` · Owned by ${d.owner_name}` : ""}
                                  {d.already_has_access ? " · You already have access" : ""}
                                </div>
                              </div>
                              {selectedDoc?.document_id === d.document_id && <Check size={16} />}
                            </button>
                          ))
                        )}
                      </div>
                      {selectedDoc?.already_has_access && (
                        <p className="reqa-already-has-access">
                          You already have access to this document — submitting this request isn't necessary.
                        </p>
                      )}
                    </>
                  )}

                  <label>Reason</label>
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why do you need this?"
                  />
                  {fieldError && <p className="reqa-error">{fieldError}</p>}
                  <div className="reqa-actions">
                    <button type="button" className="reqa-back" onClick={() => setStep(2)}>
                      <ArrowLeft size={14} /> Back
                    </button>
                    <button type="button" className="reqa-primary" onClick={goReview}>Review</button>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="reqa-body">
                  <div className="reqa-review">
                    <div className="reqa-review-row">
                      <span className="reqa-review-label">To</span>
                      <span className="reqa-review-value">{selectedAdmin?.full_name} <em>({category})</em></span>
                    </div>
                    <div className="reqa-review-row">
                      <span className="reqa-review-label">Requesting</span>
                      <span className="reqa-review-value">
                        {requestType === "DOCUMENT" ? `Access to document: ${selectedDoc?.document_title}` : permissionRequested}
                      </span>
                    </div>
                    <div className="reqa-review-row">
                      <span className="reqa-review-label">Reason</span>
                      <span className="reqa-review-value">{reason}</span>
                    </div>
                  </div>
                  {submitError && <p className="reqa-error">{submitError}</p>}
                  <div className="reqa-actions">
                    <button type="button" className="reqa-back" onClick={() => setStep(3)} disabled={submitting}>
                      <ArrowLeft size={14} /> Back
                    </button>
                    <button type="button" className="reqa-primary" onClick={handleSubmit} disabled={submitting}>
                      <Send size={14} /> {submitting ? "Sending…" : "Submit"}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="reqa-done">
              <div className="reqa-done-icon"><Check size={26} /></div>
              <p className="reqa-done-title">Request sent</p>
              <p className="reqa-done-sub">{selectedAdmin?.full_name} will review it and you'll be notified.</p>
              <span className="reqa-pending-badge">Pending</span>
              <div className="reqa-done-actions">
                <button type="button" className="reqa-primary reqa-done-btn" onClick={() => setTab("sent")}>
                  View sent requests <ArrowRight size={14} />
                </button>
                <button type="button" className="reqa-done-secondary" onClick={startNewRequest}>
                  <Plus size={14} /> Send another
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {(tab === "received" || tab === "sent") && (
        <>
          {listError && <p className="preq-error">{listError}</p>}
          {requests.length > 0 && (
            <div className="preq-search">
              <Search size={14} />
              <input
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder={tab === "received" ? "Search by name, permission, or reason…" : "Search by admin, permission, or reason…"}
              />
            </div>
          )}
          <div className="preq-panel">
            {listLoading ? (
              <p className="preq-empty">Loading…</p>
            ) : requests.length === 0 ? (
              <p className="preq-empty">{tab === "received" ? "Nothing waiting on you." : "You haven't requested anything yet."}</p>
            ) : filteredRequests.length === 0 ? (
              <p className="preq-empty">No requests match "{listSearch}".</p>
            ) : (
              <div className="preq-table-wrap">
                <table className="preq-table">
                  <thead>
                    <tr>
                      <th>{tab === "received" ? "From" : "To"}</th>
                      <th>Requesting</th>
                      <th>Reason</th>
                      <th>Status</th>
                      <th>Decision note</th>
                      <th>Sent</th>
                      {tab === "received" && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequests.map((r) => (
                      <tr key={r.permission_request_id}>
                        <td>{tab === "received" ? r.requester_name : `${r.target_admin_name} (${r.admin_category})`}</td>
                        <td>
                          {r.document_deleted ? (
                            <span className="preq-deleted-doc">Document deleted</span>
                          ) : (
                            r.permission_requested
                          )}
                        </td>
                        <td>{r.reason}</td>
                        <td><span className={`preq-badge ${STATUS_CLASS[r.status]}`}>{r.status}</span></td>
                        <td>{r.decision_note || "—"}</td>
                        <td className="preq-mono">{formatDate(r.created_at)}</td>
                        {tab === "received" && (
                          <td>
                            {r.status === "PENDING" ? (
                              <div className="preq-actions-col">
                                <div className="preq-row-actions">
                                  <button
                                    type="button"
                                    className="preq-action-btn preq-approve"
                                    onClick={() => openConfirm(r, "approve")}
                                    disabled={isLoginRequest(r)}
                                  >
                                    <Check size={14} /> Approve
                                  </button>
                                  <button type="button" className="preq-action-btn preq-reject" onClick={() => openConfirm(r, "reject")}>
                                    <X size={14} /> Reject
                                  </button>
                                </div>
                                {isLoginRequest(r) && (
                                  <p className="preq-inline-help">Auto-approves in User &amp; Accounts → Login requests</p>
                                )}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {confirmTarget && (
        <div className="preq-modal-backdrop" onClick={() => setConfirmTarget(null)}>
          <div className="preq-modal" onClick={(e) => e.stopPropagation()}>
            <h2>
              {confirmTarget.action === "approve" ? "Approve" : "Reject"} {confirmTarget.req.requester_name}'s request?
            </h2>
            <p className="preq-modal-summary">{confirmTarget.req.permission_requested}</p>

            <label>Note (optional)</label>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the requester should know?" />

            {actionError && <p className="preq-error">{actionError}</p>}

            <div className="preq-modal-actions">
              <button type="button" onClick={() => setConfirmTarget(null)} disabled={deciding}>Cancel</button>
              <button
                type="button"
                className={confirmTarget.action === "reject" ? "preq-danger" : "preq-primary"}
                onClick={handleDecide}
                disabled={deciding}
              >
                {deciding ? "Working…" : confirmTarget.action === "approve" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RequestAccess;
