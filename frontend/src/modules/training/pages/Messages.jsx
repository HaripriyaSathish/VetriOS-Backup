import { useEffect, useState } from "react";
import client from "../../../api/client";

function getUser() {
  return JSON.parse(localStorage.getItem("user") || "null");
}

function Messages() {
  const user = getUser();
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [thread, setThread] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);

  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");

  useEffect(() => {
    client.get("/api/training/dashboard/").then(({ data }) => {
      const b = data.batches || [];
      setBatches(b);
      if (b.length > 0) setSelectedBatchId(b[0].batch_id);
    });
  }, []);

  useEffect(() => {
    if (selectedBatchId) loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId]);

  useEffect(() => {
    if (selectedStudentId && !bulkMode) {
      loadThread();
      client.post("/api/admissions/mark-messages-read/", { student_id: selectedStudentId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId, bulkMode]);

  const loadStudents = async () => {
    const { data } = await client.get(`/api/admissions/batches/${selectedBatchId}/messaging-students/`);
    setStudents(data);
    if (data.length > 0) setSelectedStudentId(data[0].user_id);
  };

  const loadThread = async () => {
    const { data } = await client.get("/api/admissions/messages/", { params: { student_id: selectedStudentId } });
    setThread(data);
  };

  const send = async () => {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      await client.post("/api/admissions/messages/", {
        batch_id: selectedBatchId, recipient: selectedStudentId, content: newMessage,
      });
      setNewMessage("");
      loadThread();
    } finally {
      setSending(false);
    }
  };

  const toggleBulk = (id) => {
    const next = new Set(bulkSelected);
    next.has(id) ? next.delete(id) : next.add(id);
    setBulkSelected(next);
  };

  const sendBulk = async () => {
    if (!bulkMessage.trim() || bulkSelected.size === 0) {
      setBulkStatus("Select students and type a message first.");
      return;
    }
    setBulkSending(true);
    setBulkStatus("");
    try {
      const { data } = await client.post("/api/admissions/bulk-send-message/", {
        batch_id: selectedBatchId, recipient_ids: Array.from(bulkSelected), content: bulkMessage,
      });
      setBulkStatus(`Sent to ${data.sent_count} of ${data.total} student(s).`);
      setBulkMessage("");
    } finally {
      setBulkSending(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto vet-page-enter">
      <div className="flex justify-between items-center mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        </div>
        <div className="flex items-center gap-3">
          <select value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm">
            {batches.map((b) => <option key={b.batch_id} value={b.batch_id}>{b.batch_name}</option>)}
          </select>
          <button
            onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()); setBulkStatus(""); }}
            className={`px-3 py-2 rounded-md text-sm font-semibold border ${bulkMode ? "bg-blue-600 text-white border-transparent" : "bg-white text-blue-600 border-blue-600"}`}
          >
            {bulkMode ? "Exit Bulk Send" : "Select Multiple Students"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[260px_1fr] gap-5" style={{ height: "calc(100vh - 220px)" }}>
        <div className="bg-white border border-gray-200 rounded-xl p-4 overflow-y-auto">
          {students.map((s) => (
            bulkMode ? (
              <label key={s.user_id} className={`flex items-center gap-2 px-3 py-2 rounded-md mb-1 cursor-pointer ${bulkSelected.has(s.user_id) ? "bg-blue-50" : ""}`}>
                <input type="checkbox" checked={bulkSelected.has(s.user_id)} onChange={() => toggleBulk(s.user_id)} />
                <span className="text-sm text-gray-900">{s.name}</span>
              </label>
            ) : (
              <button
                key={s.user_id}
                onClick={() => setSelectedStudentId(s.user_id)}
                className={`w-full text-left px-3 py-2 rounded-md mb-1 text-sm ${selectedStudentId === s.user_id ? "bg-blue-50 text-gray-900" : "text-gray-700"}`}
              >
                {s.name}
              </button>
            )
          ))}
        </div>

        {bulkMode ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col">
            <h3 className="font-semibold text-gray-900 mb-1">Send to Selected Students</h3>
            <p className="text-sm text-gray-500 mb-4">Write your message once — it'll be sent individually to each selected student.</p>
            <textarea
              value={bulkMessage} onChange={(e) => setBulkMessage(e.target.value)}
              rows={8} className="border border-gray-300 rounded-md px-3 py-2 text-sm mb-4"
            />
            <button onClick={sendBulk} disabled={bulkSending} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold w-48 disabled:opacity-60">
              {bulkSending ? "Sending…" : `Send to ${bulkSelected.size} Student(s)`}
            </button>
            {bulkStatus && <p className="text-sm text-gray-700 mt-3">{bulkStatus}</p>}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl flex flex-col">
            <div className="flex-1 overflow-y-auto p-5">
              {thread.length === 0 ? (
                <p className="text-gray-400 text-sm">No messages yet.</p>
              ) : (
                thread.map((m) => {
                  const isMine = m.sender === user?.user_id;
                  return (
                    <div key={m.message_id} className={`flex mb-3 ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] px-4 py-2 rounded-xl text-sm ${isMine ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"}`}>
                        {m.content}
                        <p className="text-xs opacity-70 mt-1">{new Date(m.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex gap-3 p-4 border-t border-gray-100">
              <input
                value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Type a message…"
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <button onClick={send} disabled={sending} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60">
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Messages;