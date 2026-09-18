import { useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Paperclip, Sparkles, FileSignature, X, XCircle } from "lucide-react";
import client from "../../../api/client";
import "../styles/Documents.css";

const MAX_LEN = 500;

// A card with a `route` skips the general-purpose prompt entirely and
// opens its own dedicated page instead (real data auto-loaded there,
// not typed into the free-text box). Both of these are System
// Administrator/HR Administrator only (see App.jsx's route guards and
// IsSystemAdminOrHR on the backend) — Employee and Intern shouldn't
// even see the cards, let alone reach the pages.
const DOCUMENT_TYPES = [
  {
    label: "Course Integrated Internship Offer Letter",
    description: "students who are selected as interns, contains prefilled content",
    icon: FileSignature,
    route: "/documents/ai-generator/course-integrated-internship-offer",
    adminOrHrOnly: true,
  },
  {
    label: "Intern Onboarding Offer Letter",
    description: "students who completed their course and interview, contains prefilled content",
    icon: FileSignature,
    route: "/documents/ai-generator/intern-onboarding-offer",
    adminOrHrOnly: true,
  },
];

// AI Document Generator — a single free-text prompt, no template or
// employee picked first. Groq drafts straight from the description.
// The paperclip attaches a reference file (.txt/.pdf/.docx) whose text
// gets folded into the prompt as context.
function AIGenerator() {
  const { user } = useOutletContext();
  const roles = user?.roles || [];
  const isSystemAdminOrHR = roles.includes("System Administrator") || roles.includes("HR Administrator");
  const visibleDocumentTypes = DOCUMENT_TYPES.filter((type) => !type.adminOrHrOnly || isSystemAdminOrHR);

  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [description, setDescription] = useState("");
  const [attachedFile, setAttachedFile] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [draftText, setDraftText] = useState("");
  const abortControllerRef = useRef(null);

  const chooseType = (type) => {
    if (type.route) {
      navigate(type.route);
      return;
    }
    setDescription(`A professional ${type.label.toLowerCase()} for `);
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) setAttachedFile(file);
    event.target.value = "";
  };

  const handleGenerate = async () => {
    if (!description.trim()) {
      setError("Describe the document you want first.");
      return;
    }
    setError("");
    setGenerating(true);
    setDraftText("");
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const body = new FormData();
      body.append("description", description);
      if (attachedFile) body.append("file", attachedFile);
      const { data } = await client.post("/api/documents/generate/quick/", body, {
        headers: { "Content-Type": "multipart/form-data" },
        signal: controller.signal,
      });
      setDraftText(data.draft_text);
    } catch (err) {
      if (err.code !== "ERR_CANCELED") {
        setError(err.response?.data?.detail || "Generation failed.");
      }
    } finally {
      abortControllerRef.current = null;
      setGenerating(false);
    }
  };

  const handleCancel = () => {
    if (generating) {
      abortControllerRef.current?.abort();
      return;
    }
    setDescription("");
    setAttachedFile(null);
    setDraftText("");
    setError("");
  };

  return (
    <div className="doc-screen">
      <div className="doc-head">
        <div>
          <span className="doc-eyebrow">Document Generator</span>
          <h1>AI Document Generator</h1>
          <p>Create professional documents using AI. Just tell us what you need.</p>
        </div>
      </div>

      {error && <div className="doc-error">{error}</div>}

      {visibleDocumentTypes.length > 0 && (
        <>
      <p className="doc-type-label">Document Types</p>
      <div className="doc-type-grid">
        {visibleDocumentTypes.map((type) => (
          <button key={type.label} type="button" className="doc-type-card" onClick={() => chooseType(type)}>
            <span className="doc-type-card-icon">
              <type.icon size={20} />
            </span>
            <h4 className="doc-type-card-title">{type.label}</h4>
            <p className="doc-type-card-desc">{type.description}</p>
          </button>
        ))}
      </div>
        </>
      )}

      <p className="doc-type-label">General Prompt</p>
      <div className="doc-prompt-card">
        <textarea
          className="doc-prompt-textarea"
          value={description}
          maxLength={MAX_LEN}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the document you want to generate…"
        />

        {attachedFile && (
          <div className="doc-employee-chips" style={{ marginTop: 0 }}>
            <span className="doc-employee-chip">
              <Paperclip size={12} />
              {attachedFile.name}
              <X size={12} onClick={() => setAttachedFile(null)} style={{ cursor: "pointer" }} />
            </span>
          </div>
        )}

        <div className="doc-prompt-footer">
          <button
            type="button"
            onClick={handleAttachClick}
            title="Attach a reference file (.txt, .pdf, .docx)"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}
          >
            <Paperclip size={16} color={attachedFile ? "#14486e" : "#a7aebc"} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.pdf,.docx"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span className="doc-prompt-count">{description.length}/{MAX_LEN}</span>
            <button
              type="button"
              className="doc-btn-sm"
              onClick={handleCancel}
              disabled={!generating && !description && !attachedFile && !draftText}
            >
              <XCircle size={14} />
              Cancel
            </button>
            <button type="button" className="doc-btn-accent" onClick={handleGenerate} disabled={generating}>
              <Sparkles size={15} />
              {generating ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>
      </div>

      {(generating || draftText) && (
        <div className="doc-panel doc-quick-result">
          <div className="doc-panel-head">
            <h3>Draft</h3>
            <p>Generated from your description.</p>
          </div>
          <div className="doc-panel-body">
            {generating ? (
              <p className="doc-empty">Drafting…</p>
            ) : (
              <p style={{ whiteSpace: "pre-wrap", color: "#3a4152", fontSize: 15, lineHeight: 1.6 }}>{draftText}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AIGenerator;
