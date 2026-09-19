import { useEffect, useMemo, useState } from "react";
import client from "../../../api/client";
import "../styles/UserPermissions.css";

function groupOf(code) {
  return code.split("_")[0];
}

// Individual per-user permission overrides — a user's effective
// permissions are normally just whatever their role(s) grant. This
// screen lets a System Administrator layer an exception on top of one
// specific person: ALLOW grants something their role doesn't, DENY
// removes something their role does grant. DENY always wins.
//
// State model per (user, permission) cell:
//   viaRole  — does any of the user's active roles grant this already?
//   override — null | "ALLOW" | "DENY", from user_permission
//   effective — (viaRole || override === "ALLOW") && override !== "DENY"
function UserPermissions() {
  const [users, setUsers] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [userRoles, setUserRoles] = useState([]); // [{user_id, role_id}]
  const [rolePermissions, setRolePermissions] = useState([]); // [{role_id, permission_id}]
  const [overrides, setOverrides] = useState([]); // [{user_id, permission_id, effect}]
  const [activeUserId, setActiveUserId] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [usersRes, permsRes, userRolesRes, rolePermsRes, overridesRes] = await Promise.all([
        client.get("/api/identity/users/"),
        client.get("/api/identity/permissions/"),
        client.get("/api/identity/user-roles/"),
        client.get("/api/identity/role-permissions/"),
        client.get("/api/identity/user-permissions/"),
      ]);
      setUsers(usersRes.data);
      setPermissions(permsRes.data);
      setUserRoles(userRolesRes.data);
      setRolePermissions(rolePermsRes.data);
      setOverrides(overridesRes.data);
      setActiveUserId((current) => current ?? usersRes.data[0]?.user_id ?? null);
    } catch (err) {
      setError("Couldn't load user permissions.");
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

  // Which permission_ids the active user gets via their role(s), before overrides.
  const viaRoleSet = useMemo(() => {
    const roleIds = new Set(userRoles.filter((ur) => ur.user_id === activeUserId).map((ur) => ur.role_id));
    return new Set(
      rolePermissions.filter((rp) => roleIds.has(rp.role_id)).map((rp) => rp.permission_id)
    );
  }, [userRoles, rolePermissions, activeUserId]);

  const overrideMap = useMemo(() => {
    const m = new Map();
    overrides.forEach((o) => {
      if (o.user_id === activeUserId) m.set(o.permission_id, o.effect);
    });
    return m;
  }, [overrides, activeUserId]);

  const effectiveCountForUser = (userId) => {
    const roleIds = new Set(userRoles.filter((ur) => ur.user_id === userId).map((ur) => ur.role_id));
    const viaRole = new Set(
      rolePermissions.filter((rp) => roleIds.has(rp.role_id)).map((rp) => rp.permission_id)
    );
    const userOverrides = overrides.filter((o) => o.user_id === userId);
    const allowed = new Set(userOverrides.filter((o) => o.effect === "ALLOW").map((o) => o.permission_id));
    const denied = new Set(userOverrides.filter((o) => o.effect === "DENY").map((o) => o.permission_id));
    let count = 0;
    permissions.forEach((p) => {
      const effective = (viaRole.has(p.permission_id) || allowed.has(p.permission_id)) && !denied.has(p.permission_id);
      if (effective) count += 1;
    });
    return count;
  };

  const selectUser = (userId) => setActiveUserId(userId);

  // Cycle: no override -> ALLOW -> DENY -> no override.
  const cyclePermission = async (permissionId) => {
    const key = `${activeUserId}:${permissionId}`;
    const current = overrideMap.get(permissionId) || null;
    const next = current === null ? "ALLOW" : current === "ALLOW" ? "DENY" : null;
    setPendingKey(key);

    setOverrides((prev) => {
      const withoutThis = prev.filter((o) => !(o.user_id === activeUserId && o.permission_id === permissionId));
      return next ? [...withoutThis, { user_id: activeUserId, permission_id: permissionId, effect: next }] : withoutThis;
    });

    try {
      if (next === null) {
        await client.delete(`/api/identity/users/${activeUserId}/permissions/${permissionId}/`);
      } else {
        await client.put(`/api/identity/users/${activeUserId}/permissions/${permissionId}/`, { effect: next });
      }
    } catch (err) {
      // Roll back on failure by reloading the matrix — simplest correct fix.
      setError("Couldn't update that override.");
      await loadData();
    } finally {
      setPendingKey(null);
    }
  };

  const activeUser = users.find((u) => u.user_id === activeUserId);
  const activeGroupPerms = groups.find(([name]) => name === activeGroup)?.[1] || [];

  return (
    <div className="uperm-screen vet-page-enter">
      <div className="uperm-head">
        <h1>User Permissions</h1>
        <p>
          Individual overrides on top of role-based access — {permissions.length} permissions, {users.length} users
        </p>
      </div>

      {error && <p className="uperm-error">{error}</p>}

      {loading ? (
        <p className="uperm-empty">Loading…</p>
      ) : (
        <>
          <div className="uperm-user-tabs">
            {users.map((u) => (
              <button
                key={u.user_id}
                className={"uperm-user-card" + (u.user_id === activeUserId ? " active" : "")}
                onClick={() => selectUser(u.user_id)}
              >
                <span className="uperm-user-name">{u.full_name}</span>
                <span className="uperm-user-sub">{u.username}</span>
                <span className="uperm-user-count">
                  {effectiveCountForUser(u.user_id)} / {permissions.length}
                </span>
              </button>
            ))}
          </div>

          <div className="uperm-groups-head">
            <h3>{activeUser ? `${activeUser.full_name}'s permissions` : "Permissions"}</h3>
            <span className="uperm-hint">Click a row to cycle: no override → Allow → Deny</span>
          </div>

          <div className="uperm-module-tabs">
            {groups.map(([name]) => (
              <button
                key={name}
                className={"uperm-module-tab" + (name === activeGroup ? " active" : "")}
                onClick={() => setActiveGroup(name)}
              >
                {name}
              </button>
            ))}
          </div>

          <div className="uperm-panel">
            <div className="uperm-table-scroll">
              <table className="uperm-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Via role</th>
                    <th>Override</th>
                    <th>Effective</th>
                  </tr>
                </thead>
                <tbody>
                  {activeGroupPerms.map((perm) => {
                    const viaRole = viaRoleSet.has(perm.permission_id);
                    const override = overrideMap.get(perm.permission_id) || null;
                    const effective = (viaRole || override === "ALLOW") && override !== "DENY";
                    const key = `${activeUserId}:${perm.permission_id}`;
                    const busy = pendingKey === key;
                    return (
                      <tr key={perm.permission_id}>
                        <td className="uperm-code">{perm.permission_code}</td>
                        <td className="uperm-name">{perm.permission_name}</td>
                        <td>
                          <span className={"uperm-pill " + (viaRole ? "on" : "off")}>
                            {viaRole ? "✓ role" : "—"}
                          </span>
                        </td>
                        <td>
                          <button
                            className={
                              "uperm-toggle" +
                              (override === "ALLOW" ? " allow" : override === "DENY" ? " deny" : " none")
                            }
                            onClick={() => cyclePermission(perm.permission_id)}
                            disabled={busy}
                            title="Click to cycle: no override → Allow → Deny"
                          >
                            {busy ? "…" : override === "ALLOW" ? "Allow" : override === "DENY" ? "Deny" : "—"}
                          </button>
                        </td>
                        <td>
                          <span className={"uperm-pill " + (effective ? "on" : "off")}>
                            {effective ? "✓ granted" : "✗ restricted"}
                          </span>
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

export default UserPermissions;
