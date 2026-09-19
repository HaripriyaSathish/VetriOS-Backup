import { useEffect, useState } from "react";
import client from "../../../api/client";

function AbsenteesRecordings() {
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");

  // Absentees
  const [absentDate, setAbsentDate] = useState("");
  const [absentees, setAbsentees] = useState([]);
  const [absentSelected, setAbsentSelected] = useState(new Set());
  const [showAbsentModal, setShowAbsentModal] = useState(false);
  const [absentSubject, setAbsentSubject] = useState("");
  const [absentBody, setAbsentBody] = useState("");
  const [absentCc, setAbsentCc] = useState("");
  const [absentSending, setAbsentSending] = useState(false);
  const [absentStatus, setAbsentStatus] = useState("");

  // Recordings
  const [recordings, setRecordings] = useState([]);
  const [recDate, setRecDate] = useState("");
  const [recTitle, setRecTitle] = useState("");
  const [recLink, setRecLink] = useState("");
  const [recNotes, setRecNotes] = useState("");
  const [recSaving, setRecSaving] = useState(false);

  const [shareModal, setShareModal] = useState(null);
  const [roster, setRoster] = useState([]);
  const [shareSelected, setShareSelected] = useState(new Set());
  const [shareSubject, setShareSubject] = useState("");
  const [shareBody, setShareBody] = useState("");
  const [shareCc, setShareCc] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState("");

  const [statsModal, setStatsModal] = useState(null);

  useEffect(() => {
    client.get("/api/training/dashboard/").then(({ data }) => {
      const b = data.batches || [];
      setBatches(b);
      if (b.length > 0) setSelectedBatchId(b[0].batch_id);
    });
  }, []);

  useEffect(() => {
    if (selectedBatchId) loadRecordings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId]);

  const loadRecordings = async () => {
    const { data } = await client.get(`/api/admissions/batches/${selectedBatchId}/recordings/`);
    setRecordings(data);
  };

  const loadAbsentees = async () => {
    if (!absentDate) {
      setAbsentStatus("Pick a date first.");
      return;
    }
    const { data } = await client.get(`/api/admissions/batches/${selectedBatchId}/absent-students/`, {
      params: { date: absentDate },
    });
    setAbsentees(data);
    setAbsentSelected(new Set(data.filter((s) => !s.already_notified).map((s) => s.enrollment_id)));
    setAbsentStatus("");
  };

  const openAbsentModal = () => {
    if (absentees.length === 0) {
      setAbsentStatus("No absent students loaded for this date.");
      return;
    }
    setAbsentSubject("Missed Class Today");
    setAbsentBody(`<p>Hi {{full_name}},</p><p>You were marked absent for class on <strong>${absentDate}</strong>. Please catch up on today's topics and reach out if you need the recording or notes.</p>`);
    setAbsentCc("");
    setShowAbsentModal(true);
  };

  const toggleAbsent = (id) => {
    const next = new Set(absentSelected);
    next.has(id) ? next.delete(id) : next.add(id);
    setAbsentSelected(next);
  };

  const sendAbsentNotice = async () => {
    setAbsentSending(true);
    try {
      const { data } = await client.post("/api/admissions/notify-absent-students/", {
        batch_id: selectedBatchId, date: absentDate,
        enrollment_ids: Array.from(absentSelected),
        subject: absentSubject, body: absentBody, cc: absentCc,
      });
      setAbsentStatus(`Sent to ${data.sent_count} student(s).${data.skipped.length ? ` ${data.skipped.length} skipped.` : ""}`);
      setShowAbsentModal(false);
      loadAbsentees();
    } catch {
      setAbsentStatus("Failed to send.");
    } finally {
      setAbsentSending(false);
    }
  };

  const createRecording = async () => {
    if (!recDate || !recTitle || !recLink) return;
    setRecSaving(true);
    try {
      await client.post(`/api/admissions/batches/${selectedBatchId}/recordings/`, {
        date: recDate, title: recTitle, link: recLink, notes: recNotes,
      });
      setRecDate(""); setRecTitle(""); setRecLink(""); setRecNotes("");
      loadRecordings();
    } finally {
      setRecSaving(false);
    }
  };

  const openShareModal = async (recording) => {
    const { data } = await client.get(`/api/training/batches/${selectedBatchId}/roster/`);
    setRoster(data);
    setShareSelected(new Set(data.map((s) => s.enrollment_id)));
    setShareSubject(`Class Recording: ${recording.title}`);
    setShareBody(`<p>Hi {{full_name}},</p><p>Here's the recording for <strong>${recording.title}</strong> (${recording.date}).</p><p>{{recording_link}}</p>`);
    setShareCc("");
    setShareStatus("");
    setShareModal(recording);
  };

  const toggleShare = (id) => {
    const next = new Set(shareSelected);
    next.has(id) ? next.delete(id) : next.add(id);
    setShareSelected(next);
  };

  const sendShare = async () => {
    setSharing(true);
    try {
      const { data } = await client.post(`/api/admissions/recordings/${shareModal.recording_id}/share/`, {
        enrollment_ids: Array.from(shareSelected), subject: shareSubject, body: shareBody, cc: shareCc,
      });
      setShareStatus(`Sent to ${data.sent_count} student(s).${data.skipped.length ? ` ${data.skipped.length} skipped.` : ""}`);
      loadRecordings();
    } catch {
      setShareStatus("Failed to send.");
    } finally {
      setSharing(false);
    }
  };

  const openStats = async (recordingId) => {
    const { data } = await client.get(`/api/admissions/recordings/${recordingId}/stats/`);
    setStatsModal(data);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto vet-page-enter">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Absentees & Recordings</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 max-w-sm">
        <label className="block text-xs font-semibold text-gray-500 mb-1">Batch</label>
        <select value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full">
          {batches.map((b) => <option key={b.batch_id} value={b.batch_id}>{b.batch_name}</option>)}
        </select>
      </div>

      {/* Absentees */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Absent Students</h3>
        <div className="flex gap-3 items-end mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
            <input type="date" value={absentDate} onChange={(e) => setAbsentDate(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <button onClick={loadAbsentees} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold">Load Absentees</button>
        </div>

        {absentStatus && <p className={`text-sm mb-3 ${absentStatus.includes("Failed") || absentStatus.includes("No absent") ? "text-red-600" : "text-green-600"}`}>{absentStatus}</p>}

        {absentees.length > 0 && (
          <div>
            <div className="flex flex-col gap-2 mb-4 max-h-52 overflow-y-auto">
              {absentees.map((s) => (
                s.already_notified ? (
                  <div key={s.enrollment_id} className="flex items-center gap-3 bg-green-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-900">{s.name}</span>
                    <span className="text-xs text-green-700 font-semibold ml-auto">Already Notified</span>
                  </div>
                ) : (
                  <label key={s.enrollment_id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 cursor-pointer">
                    <input type="checkbox" checked={absentSelected.has(s.enrollment_id)} onChange={() => toggleAbsent(s.enrollment_id)} />
                    <span className="text-sm text-gray-900">{s.name}</span>
                    <span className="text-xs text-gray-500 ml-auto">{s.email || "—"}</span>
                  </label>
                )
              ))}
            </div>
            {absentSelected.size > 0 && (
              <button onClick={openAbsentModal} className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-semibold">
                Notify {absentSelected.size} Selected
              </button>
            )}
          </div>
        )}
      </div>

      {/* Recordings */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Class Recordings</h3>
        <div className="flex flex-wrap gap-3 items-end bg-gray-50 rounded-lg p-4 mb-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
            <input type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Title</label>
            <input value={recTitle} onChange={(e) => setRecTitle(e.target.value)} placeholder="e.g. Session 5" className="border border-gray-300 rounded-md px-3 py-2 text-sm w-56" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Recording Link</label>
            <input value={recLink} onChange={(e) => setRecLink(e.target.value)} placeholder="https://drive.google.com/..." className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full" />
          </div>
          <button onClick={createRecording} disabled={recSaving} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60">
            {recSaving ? "Saving…" : "Add Recording"}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {recordings.length === 0 ? (
            <p className="text-gray-400 text-sm">No recordings shared yet for this batch.</p>
          ) : (
            recordings.map((r) => (
              <div key={r.recording_id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex-wrap gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{r.title}</p>
                  <p className="text-xs text-gray-500">{r.date} · Sent to {r.sent_count} · Watched by {r.watched_count}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openStats(r.recording_id)} className="bg-white text-blue-600 border border-blue-600 rounded-md px-3 py-1 text-xs font-semibold">View Stats</button>
                  <button onClick={() => openShareModal(r)} className="bg-blue-600 text-white rounded-md px-3 py-1 text-xs font-semibold">Share</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Notify absent modal */}
      {showAbsentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-5">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-900">Notify Absent Students</h3>
              <button onClick={() => setShowAbsentModal(false)} className="text-gray-400">✕</button>
            </div>
            <p className="text-xs text-gray-500 mb-4">Use {"{{full_name}}"} for personalization.</p>
            <label className="block text-xs font-semibold text-gray-500 mb-1">CC (optional)</label>
            <input value={absentCc} onChange={(e) => setAbsentCc(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-3" />
            <label className="block text-xs font-semibold text-gray-500 mb-1">Subject</label>
            <input value={absentSubject} onChange={(e) => setAbsentSubject(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-3" />
            <label className="block text-xs font-semibold text-gray-500 mb-1">Content (HTML)</label>
            <textarea value={absentBody} onChange={(e) => setAbsentBody(e.target.value)} rows={7} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4 font-mono" />
            <button onClick={sendAbsentNotice} disabled={absentSending} className="w-full bg-red-600 text-white py-3 rounded-md font-semibold disabled:opacity-60">
              {absentSending ? "Sending…" : `Send to ${absentSelected.size} Student(s)`}
            </button>
            {absentStatus && <p className="text-sm text-gray-700 mt-3">{absentStatus}</p>}
          </div>
        </div>
      )}

      {/* Share recording modal */}
      {shareModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-5">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[88vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-900">Share: {shareModal.title}</h3>
              <button onClick={() => setShareModal(null)} className="text-gray-400">✕</button>
            </div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Students</label>
            <div className="flex flex-col gap-2 mb-4 max-h-36 overflow-y-auto border border-gray-200 rounded-md p-2">
              {roster.map((s) => (
                <label key={s.enrollment_id} className="flex items-center gap-2 text-xs text-gray-900">
                  <input type="checkbox" checked={shareSelected.has(s.enrollment_id)} onChange={() => toggleShare(s.enrollment_id)} />
                  <span className="font-semibold">{s.student_name}</span>
                  <span className="text-gray-500">{s.email}</span>
                </label>
              ))}
            </div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">CC (optional)</label>
            <input value={shareCc} onChange={(e) => setShareCc(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-3" />
            <label className="block text-xs font-semibold text-gray-500 mb-1">Subject</label>
            <input value={shareSubject} onChange={(e) => setShareSubject(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-3" />
            <label className="block text-xs font-semibold text-gray-500 mb-1">Content (HTML)</label>
            <textarea value={shareBody} onChange={(e) => setShareBody(e.target.value)} rows={7} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4 font-mono" />
            <button onClick={sendShare} disabled={sharing} className="w-full bg-blue-600 text-white py-3 rounded-md font-semibold disabled:opacity-60">
              {sharing ? "Sending…" : `Share with ${shareSelected.size} Student(s)`}
            </button>
            {shareStatus && <p className="text-sm text-gray-700 mt-3">{shareStatus}</p>}
          </div>
        </div>
      )}

      {/* Stats modal */}
      {statsModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-5">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-1">
              <h3 className="font-semibold text-gray-900">{statsModal.recording_title}</h3>
              <button onClick={() => setStatsModal(null)} className="text-gray-400">✕</button>
            </div>
            <p className="text-xs text-gray-500 mb-4">Class date: {statsModal.recording_date}</p>

            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-blue-600">{statsModal.attended_live_count}</p>
                <p className="text-xs text-gray-600">Attended Live</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-green-600">{statsModal.watched_count}</p>
                <p className="text-xs text-gray-600">Watched Recording</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-amber-600">{statsModal.watched_without_attending_count}</p>
                <p className="text-xs text-gray-600">Watched Only</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {statsModal.students.map((s) => (
                <div key={s.enrollment_id} className={`flex items-center justify-between rounded-md px-3 py-2 gap-3 ${s.watched_without_attending ? "bg-amber-50" : "bg-gray-50"}`}>
                  <span className="text-sm text-gray-900">{s.name}</span>
                  <div className="flex gap-2">
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${s.attended_live ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {s.attended_live ? "Attended Live" : s.attendance_status}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${s.watched_recording ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {s.watched_recording ? "Watched" : (s.sent_recording ? "Not Watched" : "Not Sent")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AbsenteesRecordings;