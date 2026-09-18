import { useEffect, useState } from "react";
import {
  Search, Upload, Sparkles, FileText, X, Eye, Download, Archive,
  FolderOpen, CheckCircle2, Clock, Lock, ShieldAlert,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, CartesianGrid, Tooltip,
} from "recharts";
import client from "../../../api/client";
import "../styles/Documents.css";

// Fixed categorical order (same dataviz-validated set used across the
// other dashboards) — never cycled, never reassigned per data.
const TYPE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const OTHER_COLOR = "#161a26";
const UPLOAD_COLOR = "#2a78d6";

function formatDay(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function LibChartTooltip({ label, rows }) {
  return (
    <div className="libd-tooltip">
      {label && <div className="libd-tooltip-label">{label}</div>}
      {rows.map((r) => (
        <div className="libd-tooltip-row" key={r.name}>
          <span className="libd-tooltip-swatch" style={{ background: r.color }} />
          <span className="libd-tooltip-name">{r.name}</span>
          <span className="libd-tooltip-val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function LibraryDashboard({ stats }) {
  if (!stats) return null;

  const categorySlices = (() => {
    const top = stats.by_category.slice(0, 5).map((c, i) => ({ ...c, color: TYPE_COLORS[i] }));
    const otherCount = stats.by_category.slice(5).reduce((s, c) => s + c.count, 0);
    if (otherCount > 0) top.push({ category_name: "Other", count: otherCount, color: OTHER_COLOR });
    return top;
  })();
  const categoryTotal = categorySlices.reduce((s, c) => s + c.count, 0);

  return (
    <div className="libd-root">
      <div className="libd-kpi-row">
        <div className="libd-kpi-card">
          <div className="libd-kpi-top">
            <span className="libd-kpi-label">Total Documents</span>
            <span className="libd-kpi-icon" style={{ background: "#e7f0f7", color: "#14486e" }}><FolderOpen size={16} /></span>
          </div>
          <div className="libd-kpi-value">{stats.total}</div>
        </div>
        <div className="libd-kpi-card">
          <div className="libd-kpi-top">
            <span className="libd-kpi-label">Active</span>
            <span className="libd-kpi-icon" style={{ background: "#dcfce7", color: "#16a34a" }}><CheckCircle2 size={16} /></span>
          </div>
          <div className="libd-kpi-value">{stats.active}</div>
        </div>
        <div className="libd-kpi-card">
          <div className="libd-kpi-top">
            <span className="libd-kpi-label">Pending Review</span>
            <span className="libd-kpi-icon" style={{ background: "#ffedd5", color: "#b45309" }}><Clock size={16} /></span>
          </div>
          <div className="libd-kpi-value">{stats.pending_review}</div>
        </div>
        <div className="libd-kpi-card">
          <div className="libd-kpi-top">
            <span className="libd-kpi-label">Confidential</span>
            <span className="libd-kpi-icon" style={{ background: "#fbe7e5", color: "#96271f" }}><Lock size={16} /></span>
          </div>
          <div className="libd-kpi-value">{stats.confidential}</div>
        </div>
      </div>

      <div className="libd-charts-row">
        <div className="libd-card">
          <div className="libd-card-head">
            <span className="libd-card-title">Documents by Category</span>
            <span className="libd-card-sub">{categoryTotal} total</span>
          </div>
          {categoryTotal === 0 ? (
            <p className="libd-loading">No documents yet.</p>
          ) : (
            <div className="libd-donut-row">
              <div className="libd-donut-wrap">
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={categorySlices} dataKey="count" nameKey="category_name" innerRadius={44} outerRadius={62} paddingAngle={1.5} stroke="none">
                      {categorySlices.map((s) => <Cell key={s.category_name} fill={s.color} />)}
                    </Pie>
                    <Tooltip
                      cursor={false}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0];
                        const pct = categoryTotal > 0 ? Math.round((p.value / categoryTotal) * 100) : 0;
                        return <LibChartTooltip rows={[{ name: p.name, value: `${p.value} (${pct}%)`, color: p.payload.color }]} />;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="libd-donut-center">
                  <span className="libd-donut-total">{categoryTotal}</span>
                </div>
              </div>
              <div className="libd-legend">
                {categorySlices.map((s) => (
                  <div className="libd-legend-row" key={s.category_name}>
                    <span className="libd-legend-swatch" style={{ background: s.color }} />
                    <span className="libd-legend-name">{s.category_name}</span>
                    <span className="libd-legend-val">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="libd-card">
          <div className="libd-card-head">
            <span className="libd-card-title">Uploads</span>
            <span className="libd-card-sub">last 14 days</span>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={stats.uploads_trend} margin={{ top: 16, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="libUploadFade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={UPLOAD_COLOR} stopOpacity="0.16" />
                  <stop offset="100%" stopColor={UPLOAD_COLOR} stopOpacity="0" />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#eef0f3" />
              <XAxis
                dataKey="date" tickFormatter={formatDay} axisLine={{ stroke: "#c3c2b7" }} tickLine={false}
                tick={{ fontSize: 10, fill: "#161a26", fontFamily: "Manrope, sans-serif" }}
                interval="preserveStartEnd"
              />
              <Tooltip
                cursor={{ stroke: "#c3c2b7", strokeDasharray: "3 3" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return <LibChartTooltip label={formatDay(label)} rows={[{ name: "Uploads", value: payload[0].value, color: UPLOAD_COLOR }]} />;
                }}
              />
              <Area type="monotone" dataKey="count" stroke={UPLOAD_COLOR} strokeWidth={2.5} fill="url(#libUploadFade)" activeDot={{ r: 4, fill: UPLOAD_COLOR }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL = {
  DRAFT: "Draft", ACTIVE: "Active", UNDER_REVIEW: "Pending Review",
  APPROVED: "Approved", ARCHIVED: "Archived", RETIRED: "Retired", DELETED: "Deleted",
};
const STATUS_CLASS = {
  DRAFT: "draft", ACTIVE: "approved", UNDER_REVIEW: "pending",
  APPROVED: "approved", ARCHIVED: "draft", RETIRED: "rejected", DELETED: "rejected",
};
const CONF_CLASS = { PUBLIC: "public", INTERNAL: "internal", RESTRICTED: "restricted", CONFIDENTIAL: "confidential", HIGHLY_CONFIDENTIAL: "confidential" };

function initials(name) {
  return (name || "?").split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const EMPTY_UPLOAD = { title: "", document_type_id: "", document_category_id: "", confidentiality_level_id: "", access_level_id: "", file: null };

function Library() {
  const [documents, setDocuments] = useState([]);
  const [filterOptions, setFilterOptions] = useState({ types: [], categories: [], confidentiality_levels: [], access_levels: [], statuses: [], owners: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [confFilter, setConfFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");

  const [selected, setSelected] = useState(new Set());
  const [exporting, setExporting] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadDocuments = async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (search) params.search = search;
      if (typeFilter) params.type = typeFilter;
      if (categoryFilter) params.category = categoryFilter;
      if (confFilter) params.confidentiality = confFilter;
      if (statusFilter) params.status = statusFilter;
      if (ownerFilter) params.owner = ownerFilter;
      const { data } = await client.get("/api/documents/library/", { params });
      setDocuments(data);
      setSelected(new Set());
    } catch (err) {
      setError("Couldn't load the document library.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    client.get("/api/documents/library/filters/").then(({ data }) => setFilterOptions(data)).catch(() => {});
    client.get("/api/documents/library/stats/").then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(loadDocuments, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, categoryFilter, confFilter, statusFilter, ownerFilter]);

  const allSelected = documents.length > 0 && selected.size === documents.length;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(documents.map((d) => d.document_id)));
  };

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleView = async (doc) => {
    const viewerTab = window.open("", "_blank");
    try {
      const { data } = await client.get(`/api/documents/library/${doc.document_id}/file/`, {
        params: { inline: 1 }, responseType: "blob",
      });
      if (viewerTab) viewerTab.location.href = URL.createObjectURL(data);
    } catch (err) {
      if (viewerTab) viewerTab.close();
      setError("Couldn't open that file.");
    }
  };

  const handleDownload = async (doc) => {
    try {
      const { data } = await client.get(`/api/documents/library/${doc.document_id}/file/`, { responseType: "blob" });
      triggerBlobDownload(data, doc.title);
    } catch (err) {
      setError("Couldn't download that file.");
    }
  };

  const handleBulkExport = async () => {
    setExporting(true);
    setError("");
    try {
      const { data } = await client.post(
        "/api/documents/library/bulk-export/",
        { document_ids: [...selected] },
        { responseType: "blob" }
      );
      triggerBlobDownload(data, "documents.zip");
    } catch (err) {
      setError("Couldn't export the selected documents.");
    } finally {
      setExporting(false);
    }
  };

  const openUpload = () => {
    setUploadForm(EMPTY_UPLOAD);
    setUploadError("");
    setUploadOpen(true);
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!uploadForm.file) {
      setUploadError("Choose a file to upload.");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const body = new FormData();
      body.append("title", uploadForm.title);
      body.append("document_type_id", uploadForm.document_type_id);
      if (uploadForm.document_category_id) body.append("document_category_id", uploadForm.document_category_id);
      body.append("confidentiality_level_id", uploadForm.confidentiality_level_id);
      body.append("access_level_id", uploadForm.confidentiality_level_id);
      body.append("file", uploadForm.file);
      await client.post("/api/documents/library/upload/", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadOpen(false);
      loadDocuments();
    } catch (err) {
      const data = err.response?.data;
      setUploadError(
        data ? Object.values(data).flat().join(" ") : "Upload failed."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="doc-screen">
      <div className="doc-head">
        <div>
          <span className="doc-eyebrow">Document Generator</span>
          <h1>Document Library</h1>
          <p>Every generated and uploaded document lives here.</p>
        </div>
        <div className="doc-toolbar">
          <button type="button" className="doc-btn-sm" onClick={openUpload}>
            <Upload size={14} />
            Upload
          </button>
          <Link to="/documents/ai-generator" className="doc-btn-accent">
            <Sparkles size={14} />
            Generate Document
          </Link>
        </div>
      </div>

      {error && <div className="doc-error">{error}</div>}

      <LibraryDashboard stats={stats} />

      <div className="doc-panel">
        <div className="doc-filter-bar">
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#161a26" }} />
            <input
              type="text"
              placeholder="Search title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", paddingLeft: 30 }}
            />
          </div>
          <select className="doc-filter-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Type</option>
            {filterOptions.types.map((t) => <option key={t.document_type_id} value={t.document_type_id}>{t.type_name}</option>)}
          </select>
          <select className="doc-filter-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Category</option>
            {filterOptions.categories.map((c) => <option key={c.document_category_id} value={c.document_category_id}>{c.category_name}</option>)}
          </select>
          <select className="doc-filter-select" value={confFilter} onChange={(e) => setConfFilter(e.target.value)}>
            <option value="">Confidentiality</option>
            {filterOptions.confidentiality_levels.map((c) => <option key={c.confidentiality_level_id} value={c.confidentiality_level_id}>{c.level_name}</option>)}
          </select>
          <select className="doc-filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Status</option>
            {filterOptions.statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
          </select>
          <select className="doc-filter-select" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
            <option value="">Owner</option>
            {filterOptions.owners.map((o) => <option key={o.user_id} value={o.user_id}>{o.name}</option>)}
          </select>
        </div>

        {selected.size > 0 && (
          <div className="doc-bulk-bar">
            <span>{selected.size} selected</span>
            <button type="button" className="doc-btn-sm" onClick={handleBulkExport} disabled={exporting}>
              <Archive size={14} />
              {exporting ? "Exporting…" : "Export as ZIP"}
            </button>
          </div>
        )}

        {loading ? (
          <p className="doc-empty">Loading…</p>
        ) : documents.length === 0 ? (
          <p className="doc-empty">No documents match your filters.</p>
        ) : (
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Confidentiality</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.document_id}>
                    <td><input type="checkbox" checked={selected.has(d.document_id)} onChange={() => toggleOne(d.document_id)} /></td>
                    <td>
                      <div className="doc-table-title">
                        <FileText size={15} color="#161a26" />
                        {d.title}
                      </div>
                    </td>
                    <td>{d.type_name}</td>
                    <td>{d.category_name || "—"}</td>
                    <td><span className={`doc-badge ${CONF_CLASS[d.confidentiality_code] || "internal"}`}>{d.confidentiality_name}</span></td>
                    <td><span className={`doc-badge ${STATUS_CLASS[d.status] || "draft"}`}>{STATUS_LABEL[d.status] || d.status}</span></td>
                    <td>
                      <div className="doc-owner">
                        <span className="doc-avatar">{initials(d.owner_name)}</span>
                        {d.owner_name || "—"}
                      </div>
                    </td>
                    <td>{new Date(d.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td>
                      <div style={{ display: "flex", gap: 10 }}>
                        <Eye size={15} color="#14486e" style={{ cursor: "pointer" }} onClick={() => handleView(d)} title="View" />
                        <Download size={15} color="#16a34a" style={{ cursor: "pointer" }} onClick={() => handleDownload(d)} title="Download" />
                        <Link to={`/documents/governance?documentId=${d.document_id}`} title="Manage Access">
                          <ShieldAlert size={15} color="#7c3aed" style={{ cursor: "pointer" }} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {uploadOpen && (
        <div className="doc-modal-backdrop" onClick={() => setUploadOpen(false)}>
          <div className="doc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="doc-modal-head">
              <h3>Upload document</h3>
              <X size={16} onClick={() => setUploadOpen(false)} style={{ cursor: "pointer" }} />
            </div>
            {uploadError && <div className="doc-error">{uploadError}</div>}
            <form className="doc-form" onSubmit={handleUpload}>
              <label>Title</label>
              <input
                value={uploadForm.title}
                onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                required
              />

              <label>Type</label>
              <select
                value={uploadForm.document_type_id}
                onChange={(e) => setUploadForm({ ...uploadForm, document_type_id: e.target.value })}
                required
              >
                <option value="">Select a type…</option>
                {filterOptions.types.map((t) => <option key={t.document_type_id} value={t.document_type_id}>{t.type_name}</option>)}
              </select>

              <label>Category (optional)</label>
              <select
                value={uploadForm.document_category_id}
                onChange={(e) => setUploadForm({ ...uploadForm, document_category_id: e.target.value })}
              >
                <option value="">No category</option>
                {filterOptions.categories.map((c) => <option key={c.document_category_id} value={c.document_category_id}>{c.category_name}</option>)}
              </select>

              <label>Confidentiality</label>
              <select
                value={uploadForm.confidentiality_level_id}
                onChange={(e) => setUploadForm({ ...uploadForm, confidentiality_level_id: e.target.value })}
                required
              >
                <option value="">Select a level…</option>
                {filterOptions.confidentiality_levels.map((c) => <option key={c.confidentiality_level_id} value={c.confidentiality_level_id}>{c.level_name}</option>)}
              </select>

              <label>File</label>
              <input
                type="file"
                onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files[0] })}
                required
              />

              <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                <button type="submit" className="doc-btn-accent" disabled={uploading}>
                  {uploading ? "Uploading…" : "Upload"}
                </button>
                <button type="button" className="doc-btn-sm" onClick={() => setUploadOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Library;
