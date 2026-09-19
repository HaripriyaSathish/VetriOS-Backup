import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, X } from "lucide-react";
import client from "../../../api/client";
import RichTextEditor from "../components/RichTextEditor";
import "../styles/Email.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Compose() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const [users, setUsers] = useState([]);
  const [recipients, setRecipients] = useState([]); // [{ email, label }]
  const [recipientQuery, setRecipientQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [ccEmails, setCcEmails] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachmentFile, setAttachmentFile] = useState(null);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sentMessage, setSentMessage] = useState("");

  useEffect(() => {
    client.get("/api/email/recipients/").then(({ data }) => setUsers(data)).catch(() => {});
  }, []);

  const addRecipient = (email, label) => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || recipients.some((r) => r.email.toLowerCase() === normalized)) return;
    setRecipients((prev) => [...prev, { email: email.trim(), label: label || email.trim() }]);
    setRecipientQuery("");
  };

  const removeRecipient = (email) => {
    setRecipients((prev) => prev.filter((r) => r.email !== email));
  };

  const suggestions = recipientQuery.trim()
    ? users
        .filter((u) => !recipients.some((r) => r.email.toLowerCase() === (u.email || "").toLowerCase()))
        .filter(
          (u) =>
            u.email &&
            (u.full_name.toLowerCase().includes(recipientQuery.toLowerCase()) ||
              u.email.toLowerCase().includes(recipientQuery.toLowerCase()))
        )
        .slice(0, 8)
    : [];

  const handleRecipientKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      const value = recipientQuery.replace(/,$/, "").trim();
      if (value) {
        e.preventDefault();
        if (!EMAIL_RE.test(value)) {
          setError(`"${value}" doesn't look like a valid email address.`);
          return;
        }
        setError("");
        addRecipient(value);
      }
    } else if (e.key === "Backspace" && !recipientQuery && recipients.length > 0) {
      removeRecipient(recipients[recipients.length - 1].email);
    }
  };

  const resetForm = () => {
    setRecipients([]);
    setRecipientQuery("");
    setCcEmails("");
    setSubject("");
    setBody("");
    setAttachmentFile(null);
  };

  const handleCancel = () => {
    resetForm();
    navigate("/email");
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (recipients.length === 0 || !subject.trim() || !body.trim()) {
      setError("At least one recipient, plus subject and body, are required.");
      return;
    }
    if (recipients.length > 1 && !window.confirm(`Send this email to ${recipients.length} recipients? This can't be undone.`)) {
      return;
    }
    setError("");
    setSentMessage("");
    setSending(true);
    try {
      const recipientEmail = recipients.map((r) => r.email).join(", ");
      const { data } = await client.post("/api/email/emails/compose/", {
        recipient_email: recipientEmail,
        cc_emails: ccEmails,
        subject,
        body,
      });
      const attachment = attachmentFile
        ? {
            attachment_filename: attachmentFile.name,
            attachment_mime_type: attachmentFile.type || "application/octet-stream",
            attachment_content_base64: await fileToBase64(attachmentFile),
          }
        : {};
      await client.post(`/api/email/emails/${data.ai_email_id}/send/`, attachment);
      setSentMessage(`Sent to ${recipientEmail} (via the console email backend in this environment).`);
      resetForm();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't send that email.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mail-screen">
      <div className="mail-head">
        <div>
          <span className="mail-eyebrow">Email</span>
          <h1>Compose</h1>
          <p>Write an email and send it.</p>
        </div>
        <span className="mail-provider-badge">Gmail only</span>
      </div>

      {error && <div className="mail-error">{error}</div>}
      {sentMessage && (
        <p style={{ fontSize: 14, color: "#16a34a", fontWeight: 600, marginBottom: 16 }}>{sentMessage}</p>
      )}

      <div className="mail-panel">
        <div className="mail-panel-body">
          <form className="mail-form" onSubmit={handleSend}>
            <label>Recipients</label>
            <div className="mail-recipient-box" onClick={() => inputRef.current?.focus()}>
              {recipients.map((r) => (
                <span className="mail-recipient-chip" key={r.email}>
                  {r.label}
                  <X size={12} onClick={() => removeRecipient(r.email)} style={{ cursor: "pointer" }} />
                </span>
              ))}
              <input
                ref={inputRef}
                type="text"
                value={recipientQuery}
                onChange={(e) => { setRecipientQuery(e.target.value); setShowSuggestions(true); }}
                onKeyDown={handleRecipientKeyDown}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder={recipients.length === 0 ? "Type an email or search a name…" : "Add another…"}
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="mail-recipient-suggestions">
                  {suggestions.map((u) => (
                    <div
                      key={u.user_id}
                      className="mail-recipient-suggestion"
                      onMouseDown={() => addRecipient(u.email, `${u.full_name} <${u.email}>`)}
                    >
                      <span className="name">{u.full_name}</span>
                      <span className="email">{u.email}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label>CC (optional)</label>
            <input value={ccEmails} onChange={(e) => setCcEmails(e.target.value)} placeholder="cc1@example.com, cc2@example.com" />

            <label>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Your interview is confirmed" required />

            <label>Attachment (optional)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button type="button" className="mail-btn-sm" onClick={() => fileInputRef.current?.click()}>
                Choose File
              </button>
              <span>
                : {attachmentFile ? attachmentFile.name : "No file chosen"}
              </span>
              {attachmentFile && (
                <X
                  size={12}
                  onClick={() => setAttachmentFile(null)}
                  style={{ cursor: "pointer" }}
                />
              )}
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
              />
            </div>

            <label>Body</label>
            <RichTextEditor content={body} onChange={setBody} />

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="submit" className="mail-btn-accent" disabled={sending}>
                <Send size={14} />
                {sending ? "Sending…" : "Send"}
              </button>
              <button type="button" className="mail-btn-sm" onClick={handleCancel} disabled={sending}>
                <X size={14} />
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Compose;
