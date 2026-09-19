import { useEffect, useMemo, useState } from "react";
import client from "../../../api/client";
import "../styles/Permissions.css";

// The permission table has no category/module column — VetriOSDB's
// handover materials don't define "relevant" permissions per role
// either (confirmed: Student's own role is still an open question
// there). So "module" here is just the naming convention already in
// the data — the prefix before the first underscore — used to split
// the list into tabs, not a real DB-backed category.
// Hidden for now per request — flip back on when it's wanted again.
const SHOW_PERM_SEARCH = false;

function groupOf(code) {
  return code.split("_")[0];
}

// Permissions screen — two tab levels. Role tabs (top) pick whose grants
// you're editing; module tabs (below) pick which slice of the 20
// permissions to look at. Only the selected role+module's permissions
// are shown, each with a tick/restricted toggle that applies or removes
// it on role_permission immediately.
function Permissions() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [grants, setGrants] = useState(new Set());
  const [activeRoleId, setActiveRoleId] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState(null);
  const [search, setSearch] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [rolesRes, permsRes, matrixRes] = await Promise.all([
        client.get("/api/identity/roles/cards/"),
        client.get("/api/identity/permissions/"),
        client.get("/api/identity/role-permissions/"),
      ]);
      setRoles(rolesRes.data);
      setPermissions(permsRes.data);
      setGrants(new Set(matrixRes.data.map((g) => `${g.role_id}:${g.permission_id}`)));
      setActiveRoleId((current) => current ?? rolesRes.data[0]?.role_id ?? null);
    } catch (err) {
      setError("Couldn't load permissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const groups = useMemo(() => {
    const byGroup = new Map();
    permissions.forEach((perm) => {
      const name = groupOf(perm.permission_code);
      if (!byGroup.has(name)) byGroup.set(name, []);
      byGroup.get(name).push(perm);
    });
    return [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  useEffect(() => {
    if (!activeGroup && groups.length) {
      setActiveGroup(groups[0][0]);
    }
  }, [groups, activeGroup]);

  const grantedCountByRole = useMemo(() => {
    const counts = new Map();
    grants.forEach((key) => {
      const roleId = key.split(":")[0];
      counts.set(roleId, (counts.get(roleId) || 0) + 1);
    });
    return counts;
  }, [grants]);

  const cellKey = (roleId, permissionId) => `${roleId}:${permissionId}`;

  const selectRole = (roleId) => setActiveRoleId(roleId);

  const togglePermission = async (permissionId) => {
    const key = cellKey(activeRoleId, permissionId);
    const granted = grants.has(key);
    setPendingKey(key);

    // Optimistic flip, rolled back on failure.
    setGrants((prev) => {
      const next = new Set(prev);
      granted ? next.delete(key) : next.add(key);
      return next;
    });

    try {
      if (granted) {
        await client.delete(`/api/identity/roles/${activeRoleId}/permissions/${permissionId}/`);
      } else {
        await client.put(`/api/identity/roles/${activeRoleId}/permissions/${permissionId}/`);
      }
    } catch (err) {
      setGrants((prev) => {
        const next = new Set(prev);
        granted ? next.add(key) : next.delete(key);
        return next;
      });
      setError("Couldn't update that permission.");
    } finally {
      setPendingKey(null);
    }
  };

  const activeRole = roles.find((r) => r.role_id === activeRoleId);
  const activeGroupPerms = groups.find(([name]) => name === activeGroup)?.[1] || [];

  const groupGrantedCount = (perms) =>
    perms.filter((p) => grants.has(cellKey(activeRoleId, p.permission_id))).length;

  const searching = search.trim().length > 0;
  const visiblePerms = searching
    ? permissions.filter((p) => {
        const q = search.trim().toLowerCase();
        return (
          p.permission_code.toLowerCase().includes(q) ||
          p.permission_name.toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q)
        );
      })
    : activeGroupPerms;

  return (
    <div className="perm-screen vet-page-enter">
      <div className="perm-head">
        <h1>Permissions</h1>
        <p>
          {permissions.length} permissions · {roles.length} roles · grouped by module prefix
        </p>
      </div>

      {error && <p className="perm-error">{error}</p>}

      {loading ? (
        <p className="perm-empty">Loading…</p>
      ) : (
        <>
          <div className="perm-role-tabs">
            {roles.map((role) => (
              <button
                key={role.role_id}
                className={"perm-role-card" + (role.role_id === activeRoleId ? " active" : "")}
                onClick={() => selectRole(role.role_id)}
              >
                <span className="perm-role-name">{role.role_name}</span>
                <span className="perm-role-count">
                  {grantedCountByRole.get(String(role.role_id)) || 0} / {permissions.length}
                </span>
              </button>
            ))}
          </div>

          <div className="perm-groups-head">
            <h3>{activeRole ? `${activeRole.role_name}'s permissions` : "Permissions"}</h3>
            {SHOW_PERM_SEARCH && (
              <input
                className="perm-search"
                placeholder="Search permissions by code, name, description…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
            <span className="perm-hint">Click a row to apply or remove</span>
          </div>

          {!searching && (
            <div className="perm-module-tabs">
              {groups.map(([name, perms]) => (
                <button
                  key={name}
                  className={"perm-module-tab" + (name === activeGroup ? " active" : "")}
                  onClick={() => setActiveGroup(name)}
                >
                  {name}
                  <span className="perm-module-count">
                    {groupGrantedCount(perms)}/{perms.length}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="perm-panel">
            <div className="perm-table-scroll">
              <table className="perm-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Applied</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePerms.length === 0 && (
                    <tr>
                      <td colSpan={4} className="perm-empty-row">
                        No permissions match "{search}".
                      </td>
                    </tr>
                  )}
                  {visiblePerms.map((perm) => {
                    const key = cellKey(activeRoleId, perm.permission_id);
                    const has = grants.has(key);
                    const busy = pendingKey === key;
                    return (
                      <tr key={perm.permission_id}>
                        <td className="perm-code">{perm.permission_code}</td>
                        <td className="perm-name">{perm.permission_name}</td>
                        <td className="perm-sub">{perm.description || "—"}</td>
                        <td>
                          <button
                            className={"perm-toggle" + (has ? " on" : " off")}
                            onClick={() => togglePermission(perm.permission_id)}
                            disabled={busy}
                            title={has ? "Applied — click to remove" : "Restricted — click to apply"}
                          >
                            {busy ? "…" : has ? "✓ Applied" : "✕ Restricted"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Permissions;
