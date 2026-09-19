import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../../../api/client";
import { hasAccess } from "../../../config/nav";

const SLOTS = [
  { key: "10TH", label: "10th Marksheet" },
  { key: "12TH", label: "12th Marksheet" },
  { key: "UG", label: "UG Certificate" },
  { key: "PG", label: "PG Certificate" },
  { key: "TC", label: "Terms & Conditions (Signed)" },
];

function StudentDetail() {
  const { personId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  const user = JSON.parse(localStorage.getItem("user") || "null");
  const canUpload = hasAccess({ type: "role", value: "Business Team" }, user);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await client.get(`/api/documents/students/${personId}/certificates/`);
      setData(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't load student details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [personId]);

  const handleFileChange = (slot, file) => {
    setFiles((prev) => ({ ...prev, [slot]: file }));
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    const selected = Object.entries(files).filter(([, f]) => f);
    if (selected.length === 0) {
      setUploadMsg("Choose at least one file to upload.");
      return;
    }

    const formData = new FormData();
    selected.forEach(([slot, file]) => formData.append(slot, file));

    setUploading(true);
    setUploadMsg("");
    try {
      await client.post(
        `/api/documents/students/${personId}/certificates/`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setUploadMsg("Uploaded successfully.");
      setFiles({});
      await load();
    } catch (err) {
      setUploadMsg(err.response?.data?.detail || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (documentId) => {
    try {
      const response = await client.get(`/api/documents/${documentId}/download/`, {
        responseType: "blob",
      });
      const contentType = response.headers["content-type"] || "application/octet-stream";
      const url = window.URL.createObjectURL(new Blob([response.data], { type: contentType }));
      window.open(url, "_blank");
    } catch (err) {
      setUploadMsg("Couldn't open the file.");
    }
  };

  if (loading) return <p className="p-6 text-gray-500">Loading…</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!data) return null;

  return (
    <div className="p-6 max-w-3xl vet-page-enter">
      <Link to="/training/students" className="text-sm text-blue-600 hover:underline">
        ← Back to All Students
      </Link>

      <div className="mt-3 mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">{data.name}</h1>
        <div className="text-sm text-gray-500 mt-1 space-y-0.5">
          <p>Email: {data.email || "—"}</p>
          <p>Phone: {data.phone || "—"}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h2 className="text-lg font-medium text-gray-800 mb-4">Certificates</h2>

        <div className="space-y-3 mb-5">
          {SLOTS.map(({ key, label }) => {
            const cert = data.certificates[key];
            return (
              <div
                key={key}
                className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3"
              >
                <div>
                  <p className="font-medium text-gray-700 text-sm">{label}</p>
                  {cert.uploaded ? (
                    <p className="text-xs text-gray-500 mt-0.5">{cert.file_name}</p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-0.5">Not uploaded</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {cert.uploaded && (
                    <button
                      onClick={() => handleDownload(cert.document_id)}
                      className="text-blue-600 text-sm hover:underline"
                    >
                      View
                    </button>
                  )}
                  <span
                    className={
                      "px-2 py-1 rounded-full text-xs font-medium " +
                      (cert.uploaded
                        ? "bg-gray-100 text-gray-500"
                        : "bg-amber-100 text-amber-700")
                    }
                  >
                    {cert.uploaded ? "Uploaded" : "Pending"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {canUpload && (
          <form onSubmit={handleUpload} className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">
              Upload / Replace certificates
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {SLOTS.map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input
                    type="file"
                    onChange={(e) => handleFileChange(key, e.target.files[0])}
                    className="text-sm w-full file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 file:text-xs hover:file:bg-blue-100"
                  />
                </div>
              ))}
            </div>

            {uploadMsg && (
              <p
                className={
                  "text-sm mb-3 " +
                  (uploadMsg.includes("success") ? "text-green-600" : "text-red-600")
                }
              >
                {uploadMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={uploading}
              className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload Selected"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default StudentDetail;