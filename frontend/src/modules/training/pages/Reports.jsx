import { useEffect, useState } from "react";
import client from "../../../api/client";

function Reports() {
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [savedReports, setSavedReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    client.get("/api/training/dashboard/").then(({ data }) => {
      const b = data.batches || [];
      setBatches(b);
      if (b.length > 0) setSelectedBatchId(b[0].batch_id);
    });
  }, []);

  useEffect(() => {
    if (selectedBatchId) loadSavedReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId]);

  const loadSavedReports = async () => {
    setLoading(true);
    try {
      const { data } = await client.get(`/api/training/batches/${selectedBatchId}/saved-reports/`);
      setSavedReports(data);
    } finally {
      setLoading(false);
    }
  };

  const downloadBlob = (response, filename) => {
    const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  const generateZoneReport = async (period) => {
    setDownloading(true);
    setError("");
    try {
      let start, end;
      const today = new Date();
      if (period === "weekly") {
        const dayOfWeek = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        start = monday.toISOString().slice(0, 10);
        end = sunday.toISOString().slice(0, 10);
      } else {
        start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
      }

      const response = await client.get(`/api/training/batches/${selectedBatchId}/zone-report/`, {
        params: { start, end, period },
        responseType: "blob",
      });
      downloadBlob(response, `Zone_Report_${period}_${start}_to_${end}.xlsx`);
      loadSavedReports();
    } catch (err) {
      setError("Couldn't generate report — check there's enrollment/attendance data for this batch.");
    } finally {
      setDownloading(false);
    }
  };

  const downloadSaved = async (reportId, period, start, end) => {
    try {
      const response = await client.get(`/api/training/saved-reports/${reportId}/download/`, { responseType: "blob" });
      downloadBlob(response, `Zone_Report_${period}_${start}_to_${end}.xlsx`);
    } catch (err) {
      setError("Couldn't download this report.");
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto vet-page-enter">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Reports</h1>
      <p className="text-gray-500 mb-6">Weekly / monthly zone reports — attendance and task completion.</p>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <label className="block text-xs font-semibold text-gray-500 mb-1">Batch</label>
        <select
          value={selectedBatchId}
          onChange={(e) => setSelectedBatchId(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full max-w-sm mb-4"
        >
         {batches.map((b) => (
  <option key={b.batch_id} value={b.batch_id}>
    {b.batch_name}{b.trainer_name ? ` — ${b.trainer_name}` : " — Unassigned"}
  </option>
))}
        </select>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => generateZoneReport("weekly")}
            disabled={downloading || !selectedBatchId}
            className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
          >
            {downloading ? "Generating…" : "Download Weekly Zone Report"}
          </button>
          <button
            onClick={() => generateZoneReport("monthly")}
            disabled={downloading || !selectedBatchId}
            className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
          >
            {downloading ? "Generating…" : "Download Monthly Zone Report"}
          </button>
        </div>
      </div>

      <h3 className="font-semibold text-gray-900 mb-3">Previously Generated Reports</h3>
      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : savedReports.length === 0 ? (
        <p className="text-gray-400">No reports generated yet for this batch.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Period</th>
                <th className="px-4 py-2 text-left">Date Range</th>
                <th className="px-4 py-2 text-left">Generated</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {savedReports.map((r) => (
                <tr key={r.report_id} className="border-t border-gray-100">
                  <td className="px-4 py-3 capitalize">{r.period}</td>
                  <td className="px-4 py-3 font-mono">{r.start_date} → {r.end_date}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => downloadSaved(r.report_id, r.period, r.start_date, r.end_date)}
                      className="bg-gray-900 text-white px-3 py-1 rounded-md text-xs font-semibold"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Reports;