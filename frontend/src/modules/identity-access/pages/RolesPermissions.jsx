import { useEffect, useState } from "react";
import client from "../../../api/client";
import Pagination, { paginate } from "../../../components/Pagination";
import "../styles/RolesPermissions.css";

const EMPTY_FORM = { role_name: "", description: "", is_active: true };

// Roles & Permissions screen — the role table's contents, with full CRUD:
// create, edit, view (its granted permissions), and delete (soft —
// is_active=False, same pattern as User & Accounts).
function RolesPermissions() {
  const [roles, setRoles] = useState([]);
  const [permissionCount, setPermissionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [viewRole, setViewRole] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [rolesRes, permsRes] = await Promise.all([
        client.get("/api/identity/roles/cards/"),
        client.get("/api/identity/permissions/"),
      ]);
      setRoles(rolesRes.data);
      setPermissionCount(permsRes.data.length);
    } catch (err) {
      setError("Couldn't load roles.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditingRole(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (role) => {
    setEditingRole(role);
    setForm({ role_name: role.role_name, description: role.description || "", is_active: role.is_active });
    setFormError("");
    setFormOpen(true);
  };

  const closeForm = () => setFormOpen(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");

    try {
      if (editingRole) {
        await client.patch(`/api/identity/roles/cards/${editingRole.role_id}/`, form);
      } else {
        await client.post("/api/identity/roles/cards/", form);
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && Object.values(data)[0];
      setFormError(Array.isArray(firstError) ? firstError[0] : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const openView = async (role) => {
    setViewRole({ ...role, permissions: null });
    setViewLoading(true);
    try {
      const { data } = await client.get(`/api/identity/roles/cards/${role.role_id}/`);
      setViewRole(data);
    } catch (err) {
      setViewRole(null);
      setError("Couldn't load that role's detail.");
    } finally {
      setViewLoading(false);
    }
  };

  const closeView = () => setViewRole(null);

  const requestToggleActive = (role) => setConfirmTarget(role);
  const cancelToggleActive = () => setConfirmTarget(null);

  const confirmToggleActive = async () => {
    const role = confirmTarget;
    setConfirming(true);
    try {
      if (role.is_active) {
        await client.delete(`/api/identity/roles/cards/${role.role_id}/`);
      } else {
        await client.patch(`/api/identity/roles/cards/${role.role_id}/`, { is_active: true });
      }
      setConfirmTarget(null);
      await loadData();
    } catch (err) {
      setError("Couldn't update that role.");
    } finally {
      setConfirming(false);
    }
  };

  const filteredRoles = roles.filter((role) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      role.role_name.toLowerCase().includes(q) ||
      (role.description || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="rp-screen vet-page-enter">
      <div className="rp-head">
        <div>
          <h1>Roles</h1>
          <p>{roles.length} roles · role table</p>
        </div>
        <button className="rp-btn-accent" onClick={openCreate}>
          + New role
        </button>
      </div>

      {error && <p className="rp-error">{error}</p>}

      {loading ? (
        <p className="rp-empty">Loading…</p>
      ) : (
        <div className="rp-panel rp-roles-panel">
          <div className="rp-panel-head">
            <h3>All roles</h3>
            <input
              className="rp-search"
              placeholder="Search roles by name or description…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <span className="rp-hint">role table, live</span>
          </div>
          <div className="rp-table-scroll">
            <table className="rp-role-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Permissions</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginate(filteredRoles, page).map((role) => (
                  <tr key={role.role_id}>
                    <td className="rp-role-name">{role.role_name}</td>
                    <td className="rp-sub">{role.description}</td>
                    <td>
                      <span className={"rp-pill " + (role.is_active ? "on" : "off")}>
                        {role.is_active ? "● Active" : "○ Inactive"}
                      </span>
                    </td>
                    <td className="rp-mono">
                      {role.permission_count} / {permissionCount}
                    </td>
                    <td className="rp-mono">
                      {role.created_at ? new Date(role.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="rp-actions">
                      <button className="rp-btn-sm" onClick={() => openView(role)}>
                        View
                      </button>
                      <button className="rp-btn-sm" onClick={() => openEdit(role)}>
                        Edit
                      </button>
                      <button className="rp-btn-sm rp-btn-danger" onClick={() => requestToggleActive(role)}>
                        {role.is_active ? "Deactivate" : "Reactivate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalItems={filteredRoles.length} onPageChange={setPage} />
        </div>
      )}

      {formOpen && (
        <div className="rp-modal-backdrop" onClick={closeForm}>
          <form className="rp-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <button type="button" className="rp-modal-x" onClick={closeForm} aria-label="Close">
              ✕
            </button>
            <h2>{editingRole ? "Edit role" : "New role"}</h2>
            {editingRole && (
              <p className="rp-hint">To manage this role's permissions, use the Permissions menu.</p>
            )}

            <label>Role name</label>
            <input
              value={form.role_name}
              onChange={(e) => setForm({ ...form, role_name: e.target.value })}
              required
            />

            <label>Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />

            <label className="rp-checkbox">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Active
            </label>

            {formError && <p className="rp-error">{formError}</p>}

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

      {viewRole && (
        <div className="rp-modal-backdrop" onClick={closeView}>
          <div className="rp-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="rp-modal-x" onClick={closeView} aria-label="Close">
              ✕
            </button>
            <h2>{viewRole.role_name}</h2>
            <p className="rp-view-desc">{viewRole.description}</p>
            <span className={"rp-pill " + (viewRole.is_active ? "on" : "off")}>
              {viewRole.is_active ? "● Active" : "○ Inactive"}
            </span>

            <h3 className="rp-view-subhead">Granted permissions</h3>
            {viewLoading ? (
              <p className="rp-empty">Loading…</p>
            ) : viewRole.permissions?.length ? (
              <div className="rp-view-perms">
                {viewRole.permissions.map((code) => (
                  <span className="rp-perm-pill" key={code}>
                    {code}
                  </span>
                ))}
              </div>
            ) : (
              <p className="rp-empty">No permissions granted.</p>
            )}

            <div className="rp-modal-actions">
              <button type="button" className="rp-btn-sm" onClick={closeView}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmTarget && (
        <div className="rp-modal-backdrop" onClick={cancelToggleActive}>
          <div className="rp-modal rp-confirm" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="rp-modal-x" onClick={cancelToggleActive} aria-label="Close">
              ✕
            </button>
            <h2>{confirmTarget.is_active ? "Deactivate role?" : "Reactivate role?"}</h2>
            <p>
              {confirmTarget.is_active
                ? `${confirmTarget.role_name} will no longer be assignable to users.`
                : `${confirmTarget.role_name} will be assignable to users again.`}
            </p>
            <div className="rp-modal-actions">
              <button type="button" className="rp-btn-sm" onClick={cancelToggleActive}>
                Cancel
              </button>
              <button
                type="button"
                className={confirmTarget.is_active ? "rp-btn-sm rp-btn-danger" : "rp-btn-accent"}
                onClick={confirmToggleActive}
                disabled={confirming}
              >
                {confirming ? "Working…" : confirmTarget.is_active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RolesPermissions;
