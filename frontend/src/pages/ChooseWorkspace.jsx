import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  GraduationCap, Briefcase, BookOpen, Building2, FolderKanban, ArrowRight,
} from "lucide-react";

const WORKSPACE_ICON = {
  student: GraduationCap,
  intern: Briefcase,
  training: BookOpen,
  hr: Building2,
  project: FolderKanban,
};

const WORKSPACE_GRADIENT = {
  student: "linear-gradient(135deg, #16A34A 0%, #0A4D26 100%)",
  intern: "linear-gradient(135deg, #0B0F2E 0%, #2D1B69 100%)",
  training: "linear-gradient(135deg, #0051D5 0%, #003DAA 100%)",
  hr: "linear-gradient(135deg, #D97706 0%, #92400E 100%)",
  project: "linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)",
};

const WORKSPACE_ACCENT = {
  student: "#16A34A",
  intern: "#2D1B69",
  training: "#0051D5",
  hr: "#D97706",
  project: "#7C3AED",
};

const WORKSPACE_SUBTEXT = {
  student: "Attendance, assignments, progress",
  intern: "Tasks, project chat, evaluations",
  training: "Batches, attendance, reports",
  hr: "Employees, attendance, leave",
  project: "Projects, tasks, team management",
};

function ChooseWorkspace() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [username, setUsername] = useState("");

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("available_workspaces") || "[]");
    if (stored.length === 0) {
      navigate("/dashboard");
      return;
    }
    setWorkspaces(stored);

    const user = JSON.parse(localStorage.getItem("user") || "null");
    setUsername(user?.full_name || user?.username || "");
  }, [navigate]);

  const selectWorkspace = (ws) => {
    localStorage.setItem("active_workspace", ws.key);
    navigate(ws.path);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0B0F2E 0%, #1E1B4B 100%)",
        padding: "24px",
      }}
    >
      <style>{`
        .workspace-card { transition: all 0.2s ease; cursor: pointer; }
        .workspace-card:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,0.12) !important; }
        .workspace-card:hover .workspace-arrow { opacity: 1; transform: translateX(0); }
        .workspace-arrow { opacity: 0; transform: translateX(-4px); transition: all 0.2s ease; }
      `}</style>

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E2E8F0",
          borderRadius: "16px",
          padding: "48px 40px",
          width: "100%",
          maxWidth: "460px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
          <div
            style={{
              background: "#0051D5",
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <h1
          style={{
            fontFamily: "Poppins, sans-serif",
            fontWeight: 700,
            fontSize: "27px",
            color: "#1E1B4B",
            textAlign: "center",
            marginBottom: "6px",
          }}
        >
          Welcome back{username ? `, ${username}` : ""}
        </h1>
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "15.5px",
            color: "#76777D",
            textAlign: "center",
            marginBottom: "32px",
          }}
        >
          Choose which workspace you'd like to continue to
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {workspaces.map((w) => {
            const Icon = WORKSPACE_ICON[w.key] || FolderKanban;
            const gradient = WORKSPACE_GRADIENT[w.key] || WORKSPACE_GRADIENT.project;
            const accent = WORKSPACE_ACCENT[w.key] || WORKSPACE_ACCENT.project;
            const subtext = WORKSPACE_SUBTEXT[w.key] || "";

            return (
              <div
                key={w.key}
                className="workspace-card"
                onClick={() => selectWorkspace(w)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  padding: "18px 20px",
                  borderRadius: "12px",
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                <div
                  style={{
                    width: "46px",
                    height: "46px",
                    borderRadius: "12px",
                    background: gradient,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={22} color="#FFFFFF" />
                </div>
                <div style={{ flex: 1 }}>
                  <p
                    style={{
                      fontFamily: "Poppins, sans-serif",
                      fontWeight: 600,
                      fontSize: "17px",
                      color: "#1E1B4B",
                      margin: 0,
                    }}
                  >
                    {w.label}
                  </p>
                  <p
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: "14px",
                      color: "#76777D",
                      margin: "2px 0 0",
                    }}
                  >
                    {subtext}
                  </p>
                </div>
                <ArrowRight size={18} color={accent} className="workspace-arrow" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ChooseWorkspace;