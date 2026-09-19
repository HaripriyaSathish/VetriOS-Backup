import { useEffect, useState } from "react";
import client from "../../../api/client";
import Pagination, { paginate } from "../../../components/Pagination";
import "../styles/UserAccounts.css";

// Exactly 8 characters: at least one capital letter, one digit, one
// special (non-alphanumeric) character.
const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8}$/;
const PASSWORD_HINT =
  "Exactly 8 characters, with at least one capital letter, one number, and one special character.";

// "Role: ... / Designation: ..." summary shown alongside a name in the
// Edit and Permissions popups — role is the RBAC grant, designation is
// HR's job title, and the two can share a name (e.g. both called
// "Manager") without being the same thing.
function IdentityLine({ user }) {
  return (
    <span className="ua-modal-identity-sub">
      <span className="ua-modal-identity-field">
        <IconUser />
        <strong>Role:</strong> {(user.roles || []).join(", ") || "No role assigned"}
      </span>
      {user.designation && (
        <span className="ua-modal-identity-field">
          <IconBriefcase />
          <strong>Designation:</strong> {user.designation}
        </span>
      )}
    </span>
  );
}

// Small line-style icons, inline so the popup doesn't need an icon
// library dependency for a handful of glyphs.
function svgProps(extra) {
  return { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", ...extra };
}

function IconShield() {
  return (
    <svg {...svgProps({ width: 20, height: 20 })}>
      <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg {...svgProps({ width: 14, height: 14 })}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    </svg>
  );
}

function IconBriefcase() {
  return (
    <svg {...svgProps({ width: 14, height: 14 })}>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg {...svgProps({ width: 18, height: 18 })}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="8" x2="12" y2="8.01" />
    </svg>
  );
}

function IconChevron({ collapsed }) {
  return (
    <svg {...svgProps({ width: 16, height: 16 })} style={{ transform: collapsed ? "rotate(180deg)" : "none" }}>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg {...svgProps({ width: 13, height: 13 })}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconCheckCircle() {
  return (
    <svg {...svgProps({ width: 18, height: 18, stroke: "none" })}>
      <circle cx="12" cy="12" r="10" fill="#1f6837" />
      <polyline points="7 12.5 10.5 16 17 9" fill="none" stroke="#fff" strokeWidth={2.4} />
    </svg>
  );
}

function IconRestrictedCircle() {
  return (
    <svg {...svgProps({ width: 18, height: 18, stroke: "none" })}>
      <circle cx="12" cy="12" r="10" fill="#c13b34" />
      <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
      <line x1="15.5" y1="8.5" x2="8.5" y2="15.5" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg {...svgProps({ width: 16, height: 16 })}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

function IconDocument() {
  return (
    <svg {...svgProps({ width: 16, height: 16 })}>
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg {...svgProps({ width: 16, height: 16 })}>
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3 3-5 7-5s7 2 7 5" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M16 12c2.8.4 5 2.2 5 5" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg {...svgProps({ width: 16, height: 16 })}>
      <line x1="5" y1="20" x2="5" y2="12" />
      <line x1="12" y1="20" x2="12" y2="7" />
      <line x1="19" y1="20" x2="19" y2="15" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg {...svgProps({ width: 16, height: 16 })}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.7a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.3a7 7 0 0 0-2 1.2l-2.4-.7-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-.7a7 7 0 0 0 2 1.2L10 21h4l.5-2.3a7 7 0 0 0 2-1.2l2.4.7 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" />
    </svg>
  );
}

function IconCap() {
  return (
    <svg {...svgProps({ width: 16, height: 16 })}>
      <path d="M2 9l10-5 10 5-10 5-10-5z" />
      <path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" />
    </svg>
  );
}

const GROUP_ICONS = {
  AUDIT: IconClipboardIcon,
  DOCUMENT: IconDocument,
  EMPLOYEE: IconPeople,
  PROJECT: IconFolder,
  REPORT: IconChart,
  SYSTEM: IconGear,
  TRAINING: IconCap,
  USER: IconUser,
};

function IconClipboardIcon() {
  return (
    <svg {...svgProps({ width: 16, height: 16 })}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <line x1="8" y1="15" x2="16" y2="15" />
    </svg>
  );
}

function groupIcon(name) {
  const Icon = GROUP_ICONS[name] || IconFolder;
  return <Icon />;
}

const EMPTY_FORM = {
  username: "",
  password: "",
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  is_active: true,
  person_id: "",
};

function groupOf(code) {
  return code.split("_")[0];
}

function initials(name) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// User & Accounts screen — lists every user_account row and lets a
// System Administrator create, edit, or deactivate one. Matches the
// Identity & Access mockup's user list/detail screens, wired to the
// real CRUD API instead of static sample data.
function UserAccounts() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const [editRoleIds, setEditRoleIds] = useState(new Set());
  const [roleToggleBusyId, setRoleToggleBusyId] = useState(null);
  const [createRoleIds, setCreateRoleIds] = useState(new Set());

  const [personMode, setPersonMode] = useState("new"); // "new" | "existing"
  const [unlinkedPersons, setUnlinkedPersons] = useState([]);
  const [unlinkedLoading, setUnlinkedLoading] = useState(false);
  const [personSearch, setPersonSearch] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // "idle" | "checking" | "available" | "taken" | "invalid" — driven by a
  // debounced call to the check-username endpoint as the field is typed.
  const [usernameStatus, setUsernameStatus] = useState("idle");
  const [usernameStatusMsg, setUsernameStatusMsg] = useState("");

  // "Login requests" — pending "Create login credentials for ..." requests
  // addressed to this admin (from HR's Employees page), surfaced right
  // here instead of making the admin go to Request Access for this one
  // specific kind of request. Read-only list for now — Approve/Reject
  // comes in a later step.
  const [loginRequests, setLoginRequests] = useState([]);
  const [loginRequestsLoading, setLoginRequestsLoading] = useState(false);
  const [loginRequestsPanelOpen, setLoginRequestsPanelOpen] = useState(false);

  const loadLoginRequests = async () => {
    setLoginRequestsLoading(true);
    try {
      const { data } = await client.get("/api/identity/permission-requests/", {
        params: { box: "received" },
      });
      setLoginRequests(
        data.filter(
          (r) => r.status === "PENDING" && r.permission_requested?.startsWith("Create login credentials for ")
        )
      );
    } catch {
      // Non-fatal — button just shows a 0 count if this fails.
    } finally {
      setLoginRequestsLoading(false);
    }
  };

  // Which login request Approve is currently mid-flow for — set when the
  // New Account form is opened from the Login requests panel, so that
  // once the account is actually created, that specific request (and
  // this employee's other pending copies, one per System Administrator)
  // gets marked Approved. Null for the normal "+ New account" flow.
  const [pendingApprovalRequest, setPendingApprovalRequest] = useState(null);
  const [loginRequestActionError, setLoginRequestActionError] = useState("");
  const [rejectingRequestId, setRejectingRequestId] = useState(null);

  // Approve — rather than just flip status, this opens the real "New
  // account" form pre-filled to the requested person, so creating the
  // account and approving the request happen as one action. The person
  // is matched by full name against /persons/unlinked/ (the request's
  // permission_requested text only carries free text, no structured
  // person_id link) — if no confident match is found, the admin still
  // gets the form, just without a pre-selection, and can pick manually.
  const handleApproveLoginRequest = async (request) => {
    setLoginRequestActionError("");
    setLoginRequestsPanelOpen(false);
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setPersonMode("existing");
    setPersonSearch("");
    setShowPassword(false);
    setCreateRoleIds(new Set());
    setUsernameStatus("idle");
    setUsernameStatusMsg("");
    setPendingApprovalRequest(request);
    setModalOpen(true);
    setUnlinkedLoading(true);
    try {
      const { data } = await client.get("/api/identity/persons/unlinked/");
      setUnlinkedPersons(data);
      const match = /^Create login credentials for (.+) \([^)]*\)$/.exec(request.permission_requested);
      const name = match ? match[1] : "";
      const found = data.find((p) => p.full_name === name);
      if (found) {
        setForm((f) => ({ ...f, person_id: String(found.person_id) }));
        setPersonSearch(found.full_name);
      }
    } catch {
      // Non-fatal — admin can still search/select the person manually.
    } finally {
      setUnlinkedLoading(false);
    }
  };

  // Every System Administrator got their own copy of this request (see
  // HRDashboard's requestLoginCredentials) — once one admin actually
  // creates the account, the other copies need resolving too, so a
  // second admin doesn't try to create a duplicate account for the same
  // person. Matched the same way (identical permission_requested text),
  // since that's the only link back to "which employee" that exists.
  const resolveDuplicateLoginRequests = async (approvedRequest) => {
    try {
      const { data: received } = await client.get("/api/identity/permission-requests/", {
        params: { box: "received" },
      });
      const duplicates = received.filter(
        (r) =>
          r.permission_request_id !== approvedRequest.permission_request_id &&
          r.status === "PENDING" &&
          r.permission_requested === approvedRequest.permission_requested
      );
      await Promise.all(
        duplicates.map((r) =>
          client.post(`/api/identity/permission-requests/${r.permission_request_id}/decide/`, {
            action: "approve",
            note: "Auto-resolved — handled by another admin.",
          })
        )
      );
    } catch {
      // Non-fatal — worst case a duplicate copy just stays visible to
      // whichever admin didn't handle it, harmless if actioned again.
    }
  };

  const handleRejectLoginRequest = async (request) => {
    setLoginRequestActionError("");
    setRejectingRequestId(request.permission_request_id);
    try {
      await client.post(`/api/identity/permission-requests/${request.permission_request_id}/decide/`, {
        action: "reject",
        note: "",
      });
      await loadLoginRequests();
    } catch {
      setLoginRequestActionError("Couldn't reject that request.");
    } finally {
      setRejectingRequestId(null);
    }
  };

  const [permUser, setPermUser] = useState(null);
  const [permRows, setPermRows] = useState([]); // [{permission_id, code, name, viaRole, override}]
  const [permLoading, setPermLoading] = useState(false);
  const [permError, setPermError] = useState("");
  const [permPendingId, setPermPendingId] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

  const toggleGroupCollapse = (name) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [usersRes, rolesRes] = await Promise.all([
        client.get("/api/identity/users/"),
        client.get("/api/identity/roles/"),
      ]);
      setUsers(usersRes.data);
      setRoles(rolesRes.data);
    } catch (err) {
      setError("Couldn't load user accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadLoginRequests();
  }, []);

  // Debounced live "is this username free" check as it's typed — same
  // rule the actual save enforces, just checked ahead of time. Skips the
  // call entirely while editing and the field still matches the user's
  // current username (nothing would change, no point checking).
  useEffect(() => {
    if (!modalOpen) return;
    const username = form.username.trim();
    if (!username || (editingUser && username === editingUser.username)) {
      setUsernameStatus("idle");
      setUsernameStatusMsg("");
      return;
    }
    setUsernameStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const params = { username };
        if (editingUser) params.exclude = editingUser.user_id;
        const { data } = await client.get("/api/identity/users/check-username/", { params });
        if (data.available) {
          setUsernameStatus("available");
          setUsernameStatusMsg("Username available");
        } else {
          setUsernameStatus(/^3-30 characters/.test(data.reason) ? "invalid" : "taken");
          setUsernameStatusMsg(data.reason);
        }
      } catch (err) {
        setUsernameStatus("idle");
        setUsernameStatusMsg("");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [form.username, modalOpen, editingUser]);

  const openCreate = async () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setPersonMode("new");
    setUnlinkedPersons([]);
    setPersonSearch("");
    setShowPassword(false);
    setCreateRoleIds(new Set());
    setUsernameStatus("idle");
    setUsernameStatusMsg("");
    setPendingApprovalRequest(null);
    setModalOpen(true);
    setUnlinkedLoading(true);
    try {
      const { data } = await client.get("/api/identity/persons/unlinked/");
      setUnlinkedPersons(data);
    } catch (err) {
      // Non-fatal — "link existing person" mode just won't have anyone
      // to pick from; "new person" mode still works fine.
    } finally {
      setUnlinkedLoading(false);
    }
  };

  const openEdit = async (user) => {
    const [first, ...rest] = (user.full_name || "").split(" ");
    setEditingUser(user);
    setForm({
      username: user.username,
      password: "",
      first_name: first || "",
      last_name: rest.join(" "),
      email: user.email || "",
      phone: "",
      is_active: user.is_active,
    });
    setFormError("");
    setEditRoleIds(new Set());
    setShowPassword(false);
    setUsernameStatus("idle");
    setUsernameStatusMsg("");
    setModalOpen(true);
    try {
      const { data } = await client.get("/api/identity/user-roles/");
      setEditRoleIds(
        new Set(data.filter((ur) => ur.user_id === user.user_id).map((ur) => ur.role_id))
      );
    } catch (err) {
      setFormError("Couldn't load this user's current roles.");
    }
  };

  const toggleEditRole = async (roleId) => {
    if (!editingUser) return;
    const has = editRoleIds.has(roleId);
    setRoleToggleBusyId(roleId);
    setEditRoleIds((prev) => {
      const next = new Set(prev);
      has ? next.delete(roleId) : next.add(roleId);
      return next;
    });
    try {
      if (has) {
        await client.delete(`/api/identity/users/${editingUser.user_id}/roles/${roleId}/`);
      } else {
        await client.put(`/api/identity/users/${editingUser.user_id}/roles/${roleId}/`);
      }
      await loadData();
    } catch (err) {
      setFormError("Couldn't update that role.");
      setEditRoleIds((prev) => {
        const next = new Set(prev);
        has ? next.add(roleId) : next.delete(roleId);
        return next;
      });
    } finally {
      setRoleToggleBusyId(null);
    }
  };

  const toggleCreateRole = (roleId) => {
    setCreateRoleIds((prev) => {
      const next = new Set(prev);
      next.has(roleId) ? next.delete(roleId) : next.add(roleId);
      return next;
    });
  };

  const closeModal = () => {
    setModalOpen(false);
    setPendingApprovalRequest(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");

    if (form.password && !PASSWORD_PATTERN.test(form.password)) {
      setFormError(PASSWORD_HINT);
      return;
    }

    // A brand-new account with no role at all can't do anything once
    // created — same requirement whether it's a plain "+ New account"
    // or one opened from the Login requests panel's Approve.
    if (!editingUser && createRoleIds.size === 0) {
      setFormError("Assign at least one role before creating this account.");
      return;
    }

    setSubmitting(true);

    const payload = { ...form };
    if (!payload.password) delete payload.password;
    if (!editingUser && personMode === "existing") {
      delete payload.first_name;
      delete payload.last_name;
      delete payload.email;
      delete payload.phone;
    } else {
      delete payload.person_id;
    }
    if (!payload.person_id) delete payload.person_id;

    try {
      let saved;
      if (editingUser) {
        ({ data: saved } = await client.patch(`/api/identity/users/${editingUser.user_id}/`, payload));
      } else {
        const { data: created } = await client.post("/api/identity/users/", payload);
        saved = created;
        // Roles are assigned as separate calls, same endpoint the Edit
        // modal's checkboxes use — a brand-new account can start with
        // more than one role, same as any existing one can hold.
        for (const roleId of createRoleIds) {
          await client.put(`/api/identity/users/${created.user_id}/roles/${roleId}/`);
        }
      }

      // The backend only attempts this send when a password was actually
      // set (always on create, only if "Reset password" was filled on
      // edit) — email_sent/email_reason are absent otherwise.
      if (payload.password) {
        if (saved.email_sent) {
          window.alert(`Login credentials sent to ${saved.email_reason}.`);
        } else if (saved.email_reason === "no_email_on_file") {
          window.alert("Account saved, but no email is on file for this person — share the credentials directly.");
        } else if (saved.email_reason === "send_failed") {
          window.alert("Account saved, but the credentials email failed to send — share the credentials directly.");
        }
      }
      // The account itself is the real "reply" here — the admin will
      // hand the credentials to the employee directly (call/in person),
      // never stored in this decision note. Only completes the loop for
      // the exact request this form was opened from — a plain
      // "+ New account" create leaves pendingApprovalRequest null.
      if (!editingUser && pendingApprovalRequest) {
        try {
          await client.post(
            `/api/identity/permission-requests/${pendingApprovalRequest.permission_request_id}/decide/`,
            { action: "approve", note: "Login created — credentials emailed to the employee." }
          );
          await resolveDuplicateLoginRequests(pendingApprovalRequest);
        } catch {
          // Account creation still succeeded — worst case the request
          // stays PENDING and needs manually approving from the panel.
        }
        setPendingApprovalRequest(null);
        await loadLoginRequests();
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && Object.values(data)[0];
      setFormError(Array.isArray(firstError) ? firstError[0] : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const requestToggleActive = (user) => setConfirmTarget(user);
  const cancelToggleActive = () => setConfirmTarget(null);

  const confirmToggleActive = async () => {
    const user = confirmTarget;
    setConfirming(true);
    try {
      if (user.is_active) {
        await client.delete(`/api/identity/users/${user.user_id}/`);
      } else {
        await client.patch(`/api/identity/users/${user.user_id}/`, { is_active: true });
      }
      setConfirmTarget(null);
      await loadData();
    } catch (err) {
      setError("Couldn't update that account.");
    } finally {
      setConfirming(false);
    }
  };

  const openPermissions = async (user) => {
    setPermUser(user);
    setPermLoading(true);
    setPermError("");
    try {
      const [permsRes, userRolesRes, rolePermsRes, overridesRes] = await Promise.all([
        client.get("/api/identity/permissions/"),
        client.get("/api/identity/user-roles/"),
        client.get("/api/identity/role-permissions/"),
        client.get("/api/identity/user-permissions/"),
      ]);
      const roleIds = new Set(
        userRolesRes.data.filter((ur) => ur.user_id === user.user_id).map((ur) => ur.role_id)
      );
      const viaRoleSet = new Set(
        rolePermsRes.data.filter((rp) => roleIds.has(rp.role_id)).map((rp) => rp.permission_id)
      );
      const overrideMap = new Map(
        overridesRes.data
          .filter((o) => o.user_id === user.user_id)
          .map((o) => [o.permission_id, o.effect])
      );
      setPermRows(
        permsRes.data.map((p) => ({
          permission_id: p.permission_id,
          code: p.permission_code,
          name: p.permission_name,
          viaRole: viaRoleSet.has(p.permission_id),
          override: overrideMap.get(p.permission_id) || null,
        }))
      );
    } catch (err) {
      setPermError("Couldn't load permissions for this user.");
    } finally {
      setPermLoading(false);
    }
  };

  const closePermissions = () => {
    setPermUser(null);
    setPermRows([]);
  };

  const cyclePermission = async (row) => {
    // Straight toggle, not a 3-way cycle: whatever the row currently
    // shows (Allowed/Restricted), clicking it flips to the other one —
    // always via an explicit override, so a role-granted "Allowed" row
    // actually turns into "Restricted" on click instead of silently
    // staying Allowed (ALLOW layered on an already-true role grant).
    const next = isEffective(row) ? "DENY" : "ALLOW";
    setPermPendingId(row.permission_id);
    setPermRows((prev) =>
      prev.map((r) => (r.permission_id === row.permission_id ? { ...r, override: next } : r))
    );
    try {
      await client.put(`/api/identity/users/${permUser.user_id}/permissions/${row.permission_id}/`, {
        effect: next,
      });
    } catch (err) {
      setPermError("Couldn't update that permission.");
      setPermRows((prev) =>
        prev.map((r) => (r.permission_id === row.permission_id ? { ...r, override: row.override } : r))
      );
    } finally {
      setPermPendingId(null);
    }
  };

  const isEffective = (row) => (row.viaRole || row.override === "ALLOW") && row.override !== "DENY";

  const permGroups = (() => {
    const byGroup = new Map();
    permRows.forEach((row) => {
      const name = groupOf(row.code);
      if (!byGroup.has(name)) byGroup.set(name, []);
      byGroup.get(name).push(row);
    });
    return [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b));
  })();

  const permEffectiveCount = permRows.filter(isEffective).length;

  const filteredUsers = users.filter((user) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      user.full_name.toLowerCase().includes(q) ||
      user.username.toLowerCase().includes(q) ||
      (user.email || "").toLowerCase().includes(q) ||
      (user.roles || []).some((r) => r.toLowerCase().includes(q)) ||
      (user.designation || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="ua-screen vet-page-enter">
      <div className="ua-head">
        <div>
          <h1>User accounts</h1>
          <p>{users.length} accounts · user_account, person</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="ua-btn-sm"
            onClick={() => setLoginRequestsPanelOpen(true)}
          >
            Login requests {loginRequests.length > 0 && `(${loginRequests.length})`}
          </button>
          <button className="ua-btn-accent" onClick={openCreate}>
            + New account
          </button>
        </div>
      </div>

      {error && <p className="ua-error">{error}</p>}

      <div className="ua-panel">
        <div className="ua-panel-head">
          <h3>All accounts</h3>
          <input
            className="ua-search"
            placeholder="Search by name, username, email, role, designation…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {loading ? (
          <p className="ua-empty">Loading…</p>
        ) : (
          <>
          <div className="ua-table-scroll">
            <table className="ua-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Roles</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginate(filteredUsers, page).map((user) => (
                  <tr key={user.user_id}>
                    <td>
                      <div className="ua-cell-user">
                        <div className="ua-avatar">{initials(user.full_name)}</div>
                        <div>
                          <div className="ua-name">{user.full_name}</div>
                          <div className="ua-sub">{user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {user.roles.length ? (
                        user.roles.map((role) => (
                          <span
                            className={"ua-role-pill" + (role === "System Administrator" ? " admin" : "")}
                            key={role}
                          >
                            {role}
                          </span>
                        ))
                      ) : (
                        <span className="ua-sub">No role assigned</span>
                      )}
                    </td>
                    <td>
                      <span className={"ua-pill " + (user.is_active ? "on" : "off")}>
                        {user.is_active ? "● Active" : "○ Inactive"}
                      </span>
                    </td>
                    <td className="ua-mono">{user.last_login ? new Date(user.last_login).toLocaleString() : "—"}</td>
                    <td className="ua-actions">
                      <button className="ua-btn-sm" onClick={() => openEdit(user)}>
                        Edit
                      </button>
                      <button className="ua-btn-sm" onClick={() => openPermissions(user)}>
                        Permissions
                      </button>
                      <button className="ua-btn-sm ua-btn-danger" onClick={() => requestToggleActive(user)}>
                        {user.is_active ? "Deactivate" : "Reactivate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalItems={filteredUsers.length} onPageChange={setPage} />
          </>
        )}
      </div>

      {modalOpen && (
        <div className="ua-modal-backdrop" onClick={closeModal}>
          <form className="ua-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <button type="button" className="ua-modal-x" onClick={closeModal} aria-label="Close">
              ✕
            </button>
            <h2>{editingUser ? "Edit account" : "New account"}</h2>
            {editingUser && (
              <p className="ua-modal-identity">
                <span className="ua-modal-identity-name">{editingUser.full_name}</span>
                <IdentityLine user={editingUser} />
              </p>
            )}

            {!editingUser && (
              <div className="ua-person-mode">
                <button
                  type="button"
                  className={"ua-mode-btn" + (personMode === "new" ? " active" : "")}
                  onClick={() => setPersonMode("new")}
                >
                  New person
                </button>
                <button
                  type="button"
                  className={"ua-mode-btn" + (personMode === "existing" ? " active" : "")}
                  onClick={() => {
                    setPersonMode("existing");
                    setPersonSearch("");
                  }}
                >
                  Existing person — no login yet
                </button>
              </div>
            )}

            {!editingUser && personMode === "existing" && (
              <>
                <div className="ua-person-label-row">
                  <label>Person</label>
                  {(personSearch || form.person_id) && (
                    <button
                      type="button"
                      className="ua-person-clear"
                      onClick={() => {
                        setPersonSearch("");
                        setForm((f) => ({ ...f, person_id: "" }));
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  className="ua-person-search"
                  placeholder="Search by name or email…"
                  value={personSearch}
                  onChange={(e) => setPersonSearch(e.target.value)}
                />
                <select
                  className="ua-person-select"
                  value={form.person_id}
                  onChange={(e) => setForm({ ...form, person_id: e.target.value })}
                  onDoubleClick={(e) => {
                    const person = unlinkedPersons.find(
                      (p) => String(p.person_id) === e.currentTarget.value
                    );
                    if (person) setPersonSearch(person.full_name);
                  }}
                  required
                  size={Math.min(6, Math.max(3, unlinkedPersons.length || 1))}
                >
                  {unlinkedLoading && <option value="">Loading…</option>}
                  {!unlinkedLoading &&
                    unlinkedPersons
                      .filter((p) => {
                        const q = personSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          p.full_name.toLowerCase().includes(q) ||
                          (p.email || "").toLowerCase().includes(q)
                        );
                      })
                      .map((p) => (
                        <option key={p.person_id} value={p.person_id}>
                          {p.full_name} {p.email ? `(${p.email})` : ""}
                        </option>
                      ))}
                </select>
                {!unlinkedLoading && unlinkedPersons.length === 0 && (
                  <p className="ua-perm-hint">
                    No person without a login was found — everyone in the system already has one.
                  </p>
                )}
              </>
            )}

            <label>Username</label>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
            {usernameStatus !== "idle" && (
              <p className={"ua-username-status ua-username-status-" + usernameStatus}>
                {usernameStatus === "available" && <IconCheck />}
                {usernameStatus === "checking" ? "Checking availability…" : usernameStatusMsg}
              </p>
            )}

            <label>{editingUser ? "Reset password (optional)" : "Password"}</label>
            <div className="ua-password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editingUser}
                pattern={form.password ? PASSWORD_PATTERN.source : undefined}
                title={PASSWORD_HINT}
                maxLength={8}
              />
              <button
                type="button"
                className="ua-password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                tabIndex={-1}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
            <p className="ua-perm-hint">{PASSWORD_HINT}</p>

            {(editingUser || personMode === "new") && (
              <>
                <div className="ua-form-row">
                  <div>
                    <label>First name</label>
                    <input
                      value={form.first_name}
                      onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label>Last name</label>
                    <input
                      value={form.last_name}
                      onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    />
                  </div>
                </div>

                <label>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />

                <label>Phone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </>
            )}

            <label>Roles</label>
            <div className="ua-role-checks">
              {roles.map((role) => {
                const checked = editingUser
                  ? editRoleIds.has(role.role_id)
                  : createRoleIds.has(role.role_id);
                const busy = editingUser && roleToggleBusyId === role.role_id;
                return (
                  <label className="ua-role-check" key={role.role_id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={() =>
                        editingUser ? toggleEditRole(role.role_id) : toggleCreateRole(role.role_id)
                      }
                    />
                    {role.role_name}
                    {busy && " …"}
                  </label>
                );
              })}
            </div>
            <p className="ua-perm-hint">
              A user can hold more than one role{editingUser ? " — changes apply immediately." : "."}
            </p>

            <label className="ua-checkbox">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Active
            </label>

            {formError && <p className="ua-error">{formError}</p>}

            <div className="ua-modal-actions">
              <button type="button" className="ua-btn-sm" onClick={closeModal}>
                Cancel
              </button>
              <button
                type="submit"
                className="ua-btn-accent"
                disabled={submitting || usernameStatus === "taken" || usernameStatus === "invalid"}
              >
                {submitting ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmTarget && (
        <div className="ua-modal-backdrop" onClick={cancelToggleActive}>
          <div className="ua-modal ua-confirm" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ua-modal-x" onClick={cancelToggleActive} aria-label="Close">
              ✕
            </button>
            <h2>{confirmTarget.is_active ? "Deactivate account?" : "Reactivate account?"}</h2>
            <p>
              {confirmTarget.is_active
                ? `${confirmTarget.full_name} won't be able to sign in until reactivated.`
                : `${confirmTarget.full_name} will be able to sign in again.`}
            </p>
            <div className="ua-modal-actions">
              <button type="button" className="ua-btn-sm" onClick={cancelToggleActive}>
                Cancel
              </button>
              <button
                type="button"
                className={confirmTarget.is_active ? "ua-btn-sm ua-btn-danger" : "ua-btn-accent"}
                onClick={confirmToggleActive}
                disabled={confirming}
              >
                {confirming ? "Working…" : confirmTarget.is_active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {permUser && (
        <div className="ua-modal-backdrop" onClick={closePermissions}>
          <div className="ua-modal ua-perm-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ua-modal-x" onClick={closePermissions} aria-label="Close">
              ✕
            </button>
            <div className="ua-perm-modal-head">
              <span className="ua-perm-modal-icon">
                <IconShield />
              </span>
              <h2>
                Permissions
                {!permLoading && (
                  <span className="ua-perm-total-count">
                    {" "}
                    ({permEffectiveCount}/{permRows.length})
                  </span>
                )}
              </h2>
            </div>

            <div className="ua-perm-identity">
              <div className="ua-perm-avatar">{initials(permUser.full_name)}</div>
              <div>
                <div className="ua-modal-identity-name">{permUser.full_name}</div>
                <IdentityLine user={permUser} />
              </div>
            </div>

            <div className="ua-perm-info-box">
              <IconInfo />
              <p>
                Green = Allowed, red = Restricted. Click a row to switch it between the two for
                this user.
              </p>
            </div>

            {permError && <p className="ua-error">{permError}</p>}

            {permLoading ? (
              <p className="ua-empty">Loading…</p>
            ) : (
              <div className="ua-perm-groups">
                {permGroups.map(([name, rows]) => {
                  const collapsed = collapsedGroups.has(name);
                  return (
                    <div className="ua-perm-group-card" key={name}>
                      <button
                        type="button"
                        className="ua-perm-group-header"
                        onClick={() => toggleGroupCollapse(name)}
                      >
                        <span className="ua-perm-group-icon">{groupIcon(name)}</span>
                        <span className="ua-perm-group-title">{name}</span>
                        <span className="ua-perm-group-badge">
                          {rows.filter(isEffective).length}/{rows.length}
                        </span>
                        <span className="ua-perm-group-chevron">
                          <IconChevron collapsed={collapsed} />
                        </span>
                      </button>
                      {!collapsed &&
                        rows.map((row) => {
                          const effective = isEffective(row);
                          const busy = permPendingId === row.permission_id;
                          const overridden = row.override === "ALLOW" || row.override === "DENY";
                          return (
                            <button
                              key={row.permission_id}
                              className={
                                "ua-perm-row" +
                                (effective ? " effective" : " restricted") +
                                (overridden ? " overridden" : "")
                              }
                              onClick={() => cyclePermission(row)}
                              disabled={busy}
                              title={
                                overridden
                                  ? `Individually ${row.override === "ALLOW" ? "allowed" : "restricted"} for this user`
                                  : row.viaRole
                                  ? "Allowed through this user's role"
                                  : "Not granted by any role"
                              }
                            >
                              <span className="ua-perm-row-icon">
                                {busy ? null : effective ? <IconCheckCircle /> : <IconRestrictedCircle />}
                              </span>
                              <span className="ua-perm-code">{row.code}</span>
                              <span className="ua-perm-state">
                                {busy ? "…" : effective ? "✓ Allowed" : "✕ Restricted"}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="ua-modal-actions">
              <button type="button" className="ua-btn-sm" onClick={closePermissions}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {loginRequestsPanelOpen && (
        <div className="ua-modal-backdrop" onClick={() => setLoginRequestsPanelOpen(false)}>
          <div className="ua-modal ua-modal-wide" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="ua-modal-x"
              onClick={() => setLoginRequestsPanelOpen(false)}
              aria-label="Close"
            >
              ✕
            </button>
            <h2>Login requests</h2>
            <p className="ua-hint">
              Requests from HR asking for login credentials to be created for an onboarded employee.
              Approving opens the New account form pre-filled to that person — creating the account
              completes the approval. The actual credentials are shared with the employee directly,
              never stored here.
            </p>

            {loginRequestActionError && <p className="ua-error">{loginRequestActionError}</p>}

            {loginRequestsLoading ? (
              <p className="ua-empty">Loading…</p>
            ) : loginRequests.length === 0 ? (
              <p className="ua-empty">No pending login requests.</p>
            ) : (
              <div className="ua-table-scroll">
                <table className="ua-table">
                  <thead>
                    <tr>
                      <th>Requested by</th>
                      <th>Requesting</th>
                      <th>Reason</th>
                      <th>Sent</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loginRequests.map((r) => (
                      <tr key={r.permission_request_id}>
                        <td>{r.requester_name}</td>
                        <td>{r.permission_requested}</td>
                        <td>{r.reason}</td>
                        <td className="ua-mono">
                          {new Date(r.created_at).toLocaleString(undefined, {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              type="button"
                              className="ua-btn-accent"
                              style={{ padding: "6px 12px", fontSize: 14 }}
                              onClick={() => handleApproveLoginRequest(r)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="ua-btn-sm ua-btn-danger"
                              style={{ padding: "6px 12px", fontSize: 14 }}
                              disabled={rejectingRequestId === r.permission_request_id}
                              onClick={() => handleRejectLoginRequest(r)}
                            >
                              {rejectingRequestId === r.permission_request_id ? "…" : "Reject"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="ua-modal-actions">
              <button type="button" className="ua-btn-sm" onClick={() => setLoginRequestsPanelOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserAccounts;
