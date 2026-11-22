"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type AdminSession = {
  token: string;
  user: { id: string; name: string; role: string };
};
type DriveStatus = "MANAGED" | "SHARED" | "OAUTH_REQUIRED" | "NOT_CONFIGURED";
type Teacher = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  deletedAt?: string | null;
  driveStatus: DriveStatus;
};
type DrivePolicy = { mode: string; domain: string | null; description: string };

const driveLabels: Record<DriveStatus, string> = {
  MANAGED: "Workspace managed",
  SHARED: "Central Drive",
  OAUTH_REQUIRED: "OAuth required",
  NOT_CONFIGURED: "Not configured",
};

export default function AdminPage() {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<AdminSession | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [policy, setPolicy] = useState<DrivePolicy | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    temporaryPassword: "",
  });
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const logout = useCallback(() => {
    sessionStorage.removeItem("adminSession");
    setSession(null);
    setTeachers([]);
    setPolicy(null);
  }, []);

  const request = useCallback(
    async (path: string, token: string, init?: RequestInit) => {
      const response = await fetch(`${api}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...init?.headers,
          authorization: `Bearer ${token}`,
        },
      });
      if (response.status === 401) {
        logout();
        throw new Error("Your admin session expired. Please sign in again.");
      }
      const body = await response.text();
      const data = body ? JSON.parse(body) : null;
      if (!response.ok) {
        throw new Error(
          Array.isArray(data?.message)
            ? data.message.join(", ")
            : (data?.message ?? "Request failed"),
        );
      }
      return data;
    },
    [logout],
  );

  const load = useCallback(
    async (active: AdminSession) => {
      setLoading(true);
      setMessage("");
      try {
        const [teacherData, policyData] = await Promise.all([
          request("/teachers", active.token),
          request("/teachers/drive-policy", active.token),
        ]);
        setTeachers(teacherData as Teacher[]);
        setPolicy(policyData as DrivePolicy);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load admin workspace.",
        );
      } finally {
        setLoading(false);
      }
    },
    [request],
  );

  useEffect(() => {
    const saved = sessionStorage.getItem("adminSession");
    if (!saved) return;
    let timer: number | undefined;
    try {
      const active = JSON.parse(saved) as AdminSession;
      timer = window.setTimeout(() => {
        setSession(active);
        void load(active);
      }, 0);
    } catch {
      sessionStorage.removeItem("adminSession");
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [load]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`${api}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Sign in failed");
      if (data.user.role !== "ADMIN")
        throw new Error("This portal is restricted to administrators.");
      const active = {
        token: data.accessToken,
        user: data.user,
      } as AdminSession;
      sessionStorage.setItem("adminSession", JSON.stringify(active));
      setSession(active);
      await load(active);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function createTeacher(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setMessage("");
    setSuccess("");
    try {
      const created = (await request("/teachers", session.token, {
        method: "POST",
        body: JSON.stringify(form),
      })) as Teacher;
      setTeachers((current) =>
        [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setForm({ name: "", email: "", temporaryPassword: "" });
      setShowCreate(false);
      setSuccess(`Teacher account created for ${created.email}.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create teacher.",
      );
    }
  }

  async function changeState(teacher: Teacher) {
    if (!session) return;
    setMessage("");
    setSuccess("");
    try {
      const updated = (await request(
        teacher.active
          ? `/teachers/${teacher.id}`
          : `/teachers/${teacher.id}/restore`,
        session.token,
        { method: teacher.active ? "DELETE" : "POST" },
      )) as Teacher;
      setTeachers((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSuccess(
        `${updated.name} is now ${updated.active ? "active" : "deactivated"}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update teacher.",
      );
    }
  }

  async function resetPassword(teacher: Teacher) {
    if (!session) return;
    const temporaryPassword = window.prompt(
      `New temporary password for ${teacher.email} (minimum 8 characters):`,
    );
    if (!temporaryPassword) return;
    setMessage("");
    setSuccess("");
    try {
      await request(`/teachers/${teacher.id}/reset-password`, session.token, {
        method: "POST",
        body: JSON.stringify({ temporaryPassword }),
      });
      setSuccess(`Temporary password updated for ${teacher.email}.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not reset password.",
      );
    }
  }

  if (!session)
    return (
      <main className="admin-access">
        <nav className="public-nav">
          <Link className="brand" href="/">
            <span>F</span>Folio
          </Link>
          <Link className="teacher-link" href="/teacher">
            Teacher portal <b>↗</b>
          </Link>
        </nav>
        <section className="admin-login-shell">
          <div className="admin-login-copy">
            <p className="kicker">System administration</p>
            <h1>
              People first.
              <br />
              Access controlled.
            </h1>
            <p>
              Create teacher accounts, control access, and see how each account
              connects to Google Drive.
            </p>
          </div>
          <form className="access-card" onSubmit={login}>
            <div className="card-number">A</div>
            <p className="kicker">Restricted access</p>
            <h2>Administrator sign in</h2>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button disabled={loading}>
              {loading ? "Signing in…" : "Open admin →"}
            </button>
            {message && (
              <div className="form-error" role="alert">
                {message}
              </div>
            )}
          </form>
        </section>
      </main>
    );

  return (
    <main className="admin-app">
      <nav className="app-nav">
        <Link className="brand" href="/">
          <span>F</span>Folio Admin
        </Link>
        <div className="account">
          <div className="avatar">{session.user.name.slice(0, 1)}</div>
          <div>
            <strong>{session.user.name}</strong>
            <small>Administrator</small>
          </div>
          <button onClick={logout}>Sign out</button>
        </div>
      </nav>
      <section className="admin-shell">
        <header className="admin-heading">
          <div>
            <p className="kicker">Account directory</p>
            <h1>Teachers</h1>
            <p>
              Provision access once. Keep classroom ownership and storage policy
              visible.
            </p>
          </div>
          <button className="admin-primary" onClick={() => setShowCreate(true)}>
            ＋ New teacher
          </button>
        </header>
        {policy && (
          <section className={`drive-policy ${policy.mode.toLowerCase()}`}>
            <div>
              <span>Google Drive policy</span>
              <h2>
                {policy.mode === "WORKSPACE_DELEGATION"
                  ? "Workspace-managed access"
                  : policy.mode === "SHARED_DRIVE"
                    ? "Central Drive account"
                    : "Drive setup required"}
              </h2>
              <p>
                {policy.description}
                {policy.domain
                  ? ` Accounts in @${policy.domain} are linked automatically.`
                  : ""}
              </p>
            </div>
            <b>{policy.mode.replaceAll("_", " ")}</b>
          </section>
        )}
        {message && <div className="notice error">{message}</div>}
        {success && <div className="notice success">{success}</div>}
        {showCreate && (
          <form className="teacher-create" onSubmit={createTeacher}>
            <div>
              <p className="kicker">Provision account</p>
              <h2>Add a teacher</h2>
            </div>
            <label>
              Full name
              <input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                required
                minLength={2}
              />
            </label>
            <label>
              Google account email
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                placeholder="teacher@school.edu"
                required
              />
            </label>
            <label>
              Temporary password
              <input
                type="password"
                value={form.temporaryPassword}
                onChange={(event) =>
                  setForm({ ...form, temporaryPassword: event.target.value })
                }
                required
                minLength={8}
              />
            </label>
            <div>
              <button
                type="button"
                className="quiet-button"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button className="admin-primary">Create account</button>
            </div>
          </form>
        )}
        <div className="teacher-summary">
          <span>
            <b>{teachers.filter((item) => item.active).length}</b> active
          </span>
          <span>
            <b>{teachers.filter((item) => !item.active).length}</b> inactive
          </span>
          <span>
            <b>
              {
                teachers.filter(
                  (item) =>
                    item.driveStatus === "MANAGED" ||
                    item.driveStatus === "SHARED",
                ).length
              }
            </b>{" "}
            Drive ready
          </span>
        </div>
        {loading ? (
          <div className="loading-block">Loading teacher accounts…</div>
        ) : teachers.length === 0 ? (
          <div className="empty-panel">
            <span>○</span>
            <h2>No teachers yet</h2>
            <p>Create the first teacher account to get started.</p>
          </div>
        ) : (
          <div className="teacher-table">
            <div className="teacher-table-head">
              <span>Teacher</span>
              <span>Google Drive</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {teachers.map((teacher) => (
              <article
                key={teacher.id}
                className={!teacher.active ? "inactive" : ""}
              >
                <div>
                  <div className="teacher-avatar">
                    {teacher.name.slice(0, 1)}
                  </div>
                  <div>
                    <strong>{teacher.name}</strong>
                    <small>{teacher.email}</small>
                  </div>
                </div>
                <span
                  className={`drive-badge ${teacher.driveStatus.toLowerCase()}`}
                >
                  {driveLabels[teacher.driveStatus]}
                </span>
                <span
                  className={`account-state ${teacher.active ? "active" : "inactive"}`}
                >
                  {teacher.active ? "Active" : "Inactive"}
                </span>
                <div className="teacher-actions">
                  <button onClick={() => void resetPassword(teacher)}>
                    Reset password
                  </button>
                  <button onClick={() => void changeState(teacher)}>
                    {teacher.active ? "Deactivate" : "Restore"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
