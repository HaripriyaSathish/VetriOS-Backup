import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../../../api/client";

function AllStudentsList() {
  const [students, setStudents] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await client.get("/api/documents/students/");
        setStudents(data);
      } catch (err) {
        setError(err.response?.data?.detail || "Couldn't load students.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = students.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.student_code.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <p className="p-6 text-gray-500">Loading…</p>;

  return (
    <div className="p-6 vet-page-enter">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">All Students</h1>
          <p className="text-sm text-gray-500">{students.length} total</p>
        </div>
        <input
          type="text"
          placeholder="Search by name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Student Code</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  No students found.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.person_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.student_code}</td>
                  <td className="px-4 py-3 text-gray-600">{s.email || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{s.phone || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "px-2 py-1 rounded-full text-xs font-medium " +
                        (s.status === "ACTIVE"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600")
                      }
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                       <Link
     to={`/training/students/${s.person_id}`}
     className="text-blue-600 hover:underline text-sm"
   >
                      View details →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AllStudentsList;