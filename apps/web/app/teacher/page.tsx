"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const api = process.env.NEXT_PUBLIC_API_URL ?? "/api";
type TeacherSession = {
  token: string;
  user: { id: string; name: string; role: string };
};
type Course = {
  _id: string;
  code: string;
  name: string;
  description?: string;
  status: "DRAFT" | "ACTIVE" | "ENDED";
};
type Student = {
  id: string;
  studentId: string;
  name: string;
  description: string;
  active: boolean;
  deletedAt?: string | null;
  canManage: boolean;
};
type EnrolledStudent = {
  id: string;
  studentCode: string;
  name: string;
  description?: string;
};
type Assignment = {
  _id: string;
  title: string;
  instructions?: string;
  deadlineAt: string;
  isManuallyLocked: boolean;
  kind: "FILE_UPLOAD" | "INTERACTIVE";
  editorStatus?: "DRAFT" | "PUBLISHED";
};
type Submission = {
  _id: string;
  submittedAt: string;
  status: "SUBMITTED" | "LATE";
  files: { filename: string; sizeBytes: number }[];
  feedbackText?: string;
  feedbackStatus: string;
  reviewedAt?: string;
};
type SubmissionRow = {
  student: { id: string; name: string };
  status: "SUBMITTED" | "LATE" | "MISSING";
  submission: Submission | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function TeacherPage() {
  const router = useRouter();
  const [email, setEmail] = useState("teacher@example.com");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<TeacherSession | null>(null);
  const [view, setView] = useState<"home" | "students" | "course">("home");
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [enrolled, setEnrolled] = useState<EnrolledStudent[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [reviewing, setReviewing] = useState<Assignment | null>(null);
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [showEditCourse, setShowEditCourse] = useState(false);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [studentForm, setStudentForm] = useState({
    studentId: "",
    name: "",
    description: "",
    courseIds: [] as string[],
  });
  const [courseForm, setCourseForm] = useState({
    name: "",
    description: "",
    studentIds: [] as string[],
  });
  const [editCourseForm, setEditCourseForm] = useState({
    name: "",
    description: "",
  });
  const [assignmentForm, setAssignmentForm] = useState({
    title: "",
    instructions: "",
    deadlineAt: "",
    kind: "FILE_UPLOAD" as "FILE_UPLOAD" | "INTERACTIVE",
  });
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [search, setSearch] = useState("");

  const logout = useCallback(() => {
    sessionStorage.removeItem("teacherSession");
    setSession(null);
    setCourses([]);
    setStudents([]);
    setCourse(null);
    setView("home");
    setShowPasswordForm(false);
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
        throw new Error("Your session expired. Please sign in again.");
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(", ")
            : (data.message ?? "Request failed"),
        );
      }
      const body = await response.text();
      return body ? JSON.parse(body) : null;
    },
    [logout],
  );
  const loadWorkspace = useCallback(
    async (active: TeacherSession) => {
      setLoading(true);
      setMessage("");
      try {
        const [courseData, studentData] = await Promise.all([
          request("/courses", active.token),
          request("/students", active.token),
        ]);
        setCourses(courseData as Course[]);
        setStudents(studentData as Student[]);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Could not load workspace.",
        );
      } finally {
        setLoading(false);
      }
    },
    [request],
  );

  useEffect(() => {
    const saved = sessionStorage.getItem("teacherSession");
    if (!saved) return;
    let timer: number | undefined;
    try {
      const active = JSON.parse(saved) as TeacherSession;
      timer = window.setTimeout(() => {
        setSession(active);
        void loadWorkspace(active);
      }, 0);
    } catch {
      sessionStorage.removeItem("teacherSession");
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [loadWorkspace]);

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
      const active = { token: data.accessToken, user: data.user };
      sessionStorage.setItem("teacherSession", JSON.stringify(active));
      setSession(active);
      await loadWorkspace(active);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }
  async function createStudent(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    try {
      const created = (await request("/students", session.token, {
        method: "POST",
        body: JSON.stringify(studentForm),
      })) as Student;
      setStudents((current) =>
        [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      const addedToOpenCourse =
        view === "course" &&
        course !== null &&
        studentForm.courseIds.includes(course._id);
      setStudentForm({
        studentId: "",
        name: "",
        description: "",
        courseIds: [],
      });
      setShowStudentForm(false);
      if (addedToOpenCourse && course) await openCourse(course);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create student.",
      );
    }
  }
  function openStudentForm(courseIds: string[] = []) {
    setMessage("");
    setStudentForm({ studentId: "", name: "", description: "", courseIds });
    setShowStudentForm(true);
  }
  async function softDeleteStudent(item: Student) {
    if (
      !session ||
      !window.confirm(
        `Deactivate “${item.name}”? They will lose access to their courses, but you can restore the profile later.`,
      )
    )
      return;
    try {
      const updated = (await request(`/students/${item.id}`, session.token, {
        method: "DELETE",
      })) as Student;
      setStudents((current) =>
        current.map((student) =>
          student.id === updated.id ? updated : student,
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not delete student.",
      );
    }
  }
  async function restoreStudent(item: Student) {
    if (!session) return;
    try {
      const updated = (await request(
        `/students/${item.id}/restore`,
        session.token,
        { method: "POST" },
      )) as Student;
      setStudents((current) =>
        current.map((student) =>
          student.id === updated.id ? updated : student,
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not restore student.",
      );
    }
  }
  async function permanentlyDeleteStudent(item: Student) {
    if (
      !session ||
      !window.confirm(
        `Permanently delete “${item.name}”? This will remove their profile, course enrollments, submissions and uploaded files. This action cannot be undone.`,
      )
    )
      return;
    try {
      await request(`/students/${item.id}/permanent`, session.token, {
        method: "DELETE",
      });
      setStudents((current) =>
        current.filter((student) => student.id !== item.id),
      );
      setEnrolled((current) =>
        current.filter((student) => student.id !== item.id),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not permanently delete student.",
      );
    }
  }
  async function createCourse(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    try {
      const created = (await request("/courses", session.token, {
        method: "POST",
        body: JSON.stringify({
          name: courseForm.name,
          description: courseForm.description,
          studentIds: courseForm.studentIds,
        }),
      })) as Course;
      setCourses((current) => [created, ...current]);
      setCourseForm({ name: "", description: "", studentIds: [] });
      setShowCourseForm(false);
      await openCourse(created);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create course.",
      );
    }
  }
  async function openCourse(selected: Course) {
    if (!session) return;
    setCourse(selected);
    setView("course");
    setReviewing(null);
    setLoading(true);
    try {
      const [assignmentData, studentData] = await Promise.all([
        request(`/courses/${selected._id}/assignments`, session.token),
        request(`/courses/${selected._id}/students`, session.token),
      ]);
      setAssignments(assignmentData as Assignment[]);
      setEnrolled(studentData as EnrolledStudent[]);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not open course.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function enrollStudent(studentId: string) {
    if (!session || !course) return;
    try {
      await request(`/courses/${course._id}/enrollments`, session.token, {
        method: "POST",
        body: JSON.stringify({ studentId }),
      });
      await openCourse(course);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not add student.",
      );
    }
  }
  async function removeStudent(studentId: string) {
    if (
      !session ||
      !course ||
      !window.confirm(
        "Remove this student from the course? Their profile and submissions will remain saved.",
      )
    )
      return;
    try {
      await request(
        `/courses/${course._id}/enrollments/${studentId}`,
        session.token,
        { method: "DELETE" },
      );
      await openCourse(course);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not remove student.",
      );
    }
  }
  async function createAssignment(event: FormEvent) {
    event.preventDefault();
    if (!session || !course) return;
    try {
      const created = (await request(
        `/courses/${course._id}/assignments`,
        session.token,
        {
          method: "POST",
          body: JSON.stringify({
            ...assignmentForm,
            deadlineAt: new Date(assignmentForm.deadlineAt).toISOString(),
          }),
        },
      )) as Assignment;
      setAssignments((current) => [...current, created]);
      const openBuilder = assignmentForm.kind === "INTERACTIVE";
      setAssignmentForm({ title: "", instructions: "", deadlineAt: "", kind: "FILE_UPLOAD" });
      setShowAssignmentForm(false);
      if (openBuilder) router.push(`/teacher/exercises/${created._id}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create assignment.",
      );
    }
  }
  async function openReview(item: Assignment) {
    if (!session) return;
    setReviewing(item);
    try {
      const data = (await request(
        `/assignments/${item._id}/submissions`,
        session.token,
      )) as SubmissionRow[];
      setRows(data);
      setFeedback(
        Object.fromEntries(
          data
            .filter((row) => row.submission)
            .map((row) => [
              row.submission!._id,
              row.submission?.feedbackText ?? "",
            ]),
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load submissions.",
      );
    }
  }
  async function publishFeedback(id: string) {
    if (!session || !reviewing) return;
    setPublishingId(id);
    setMessage("");
    setSuccessMessage("");
    try {
      const updated = (await request(
        `/submissions/${id}/feedback/publish`,
        session.token,
        {
          method: "POST",
          body: JSON.stringify({ text: feedback[id] ?? "" }),
        },
      )) as Submission;
      setRows((current) =>
        current.map((row) =>
          row.submission?._id === id ? { ...row, submission: updated } : row,
        ),
      );
      setSuccessMessage("Private note published to the student.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not publish feedback.",
      );
    } finally {
      setPublishingId(null);
    }
  }

  async function downloadSubmissionFile(
    submissionId: string,
    index: number,
    filename: string,
  ) {
    if (!session) return;
    const downloadKey = `${submissionId}:${index}`;
    setDownloadingFile(downloadKey);
    setMessage("");
    setSuccessMessage("");
    try {
      const response = await fetch(
        `${api}/files/${submissionId}/${index}/content`,
        { headers: { authorization: `Bearer ${session.token}` } },
      );
      if (response.status === 401) {
        logout();
        throw new Error("Your session expired. Please sign in again.");
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message ?? "Could not download file.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not download file.",
      );
    } finally {
      setDownloadingFile(null);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setMessage("");
    setSuccessMessage("");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage("New password and confirmation do not match.");
      return;
    }
    setChangingPassword(true);
    try {
      await request("/auth/change-password", session.token, {
        method: "POST",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setShowPasswordForm(false);
      setSuccessMessage("Password changed successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not change password.",
      );
    } finally {
      setChangingPassword(false);
    }
  }
  async function activateCourse() {
    if (!session || !course) return;
    try {
      const updated = (await request(`/courses/${course._id}`, session.token, {
        method: "PATCH",
        body: JSON.stringify({
          status: course.status === "ACTIVE" ? "ENDED" : "ACTIVE",
        }),
      })) as Course;
      setCourse(updated);
      setCourses((current) =>
        current.map((item) => (item._id === updated._id ? updated : item)),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not change course status.",
      );
    }
  }
  function beginEditCourse() {
    if (!course) return;
    setEditCourseForm({
      name: course.name,
      description: course.description ?? "",
    });
    setShowEditCourse(true);
  }
  async function editCourse(event: FormEvent) {
    event.preventDefault();
    if (!session || !course) return;
    try {
      const updated = (await request(`/courses/${course._id}`, session.token, {
        method: "PATCH",
        body: JSON.stringify(editCourseForm),
      })) as Course;
      setCourse(updated);
      setCourses((current) =>
        current.map((item) => (item._id === updated._id ? updated : item)),
      );
      setShowEditCourse(false);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update course.",
      );
    }
  }
  async function deleteCourse() {
    if (
      !session ||
      !course ||
      !window.confirm(
        `Delete “${course.name}”? Students will lose access, but assignments and submissions will remain archived.`,
      )
    )
      return;
    try {
      await request(`/courses/${course._id}`, session.token, {
        method: "DELETE",
      });
      setCourses((current) =>
        current.filter((item) => item._id !== course._id),
      );
      setCourse(null);
      setEnrolled([]);
      setAssignments([]);
      setView("home");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not delete course.",
      );
    }
  }

  const filteredStudents = useMemo(
    () =>
      students.filter((item) =>
        `${item.name} ${item.studentId} ${item.description}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [students, search],
  );
  const availableStudents = students.filter(
    (item) => item.active && !enrolled.some((entry) => entry.id === item.id),
  );

  if (!session)
    return (
      <main className="teacher-login-page">
        <nav className="public-nav">
          <Link className="brand" href="/">
            <span>F</span>Folio
          </Link>
          <Link className="teacher-link" href="/">
            Student portal <b>↗</b>
          </Link>
        </nav>
        <section>
          <div className="login-note">
            <p className="kicker">Teacher workspace</p>
            <h1>
              Build the class.
              <br />
              Keep work moving.
            </h1>
            <p>
              Create student profiles first, gather them into courses, then
              publish assignments and review every submission.
            </p>
          </div>
          <form className="access-card" onSubmit={login}>
            <div className="card-number">T</div>
            <p className="kicker">Secure access</p>
            <h2>Teacher sign in</h2>
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
                minLength={8}
                required
              />
            </label>
            <button disabled={loading}>
              {loading ? "Signing in…" : "Enter workspace"} <span>→</span>
            </button>
            {message && <div className="form-error">{message}</div>}
          </form>
        </section>
      </main>
    );

  return (
    <main className="teacher-app">
      <aside className="teacher-sidebar">
        <Link className="brand inverse" href="/">
          <span>F</span>Folio
        </Link>
        <div className="sidebar-nav">
          <p>Workspace</p>
          <button
            className={view === "home" ? "active" : ""}
            onClick={() => {
              setView("home");
              setCourse(null);
            }}
          >
            <span>⌂</span>Overview
          </button>
          <button
            className={view === "students" ? "active" : ""}
            onClick={() => {
              setView("students");
              setCourse(null);
            }}
          >
            <span>◎</span>Students <b>{students.length}</b>
          </button>
          <p>Courses</p>
          {courses.map((item) => (
            <button
              className={
                course?._id === item._id
                  ? "active course-nav-item"
                  : "course-nav-item"
              }
              key={item._id}
              onClick={() => void openCourse(item)}
            >
              <span>{item.name.slice(0, 1)}</span>
              {item.name}
            </button>
          ))}
        </div>
        <div className="sidebar-profile">
          <div className="avatar">{session.user.name.slice(0, 1)}</div>
          <div>
            <strong>{session.user.name}</strong>
            <small>Teacher</small>
          </div>
          <button onClick={logout}>↗</button>
        </div>
      </aside>
      <section className="teacher-main">
        <header className="topbar">
          <div>
            <span>Teacher portal</span>
            <b>/</b>
            <strong>
              {view === "students" ? "Students" : (course?.name ?? "Overview")}
            </strong>
          </div>
          <div className="topbar-actions">
            <button
              className="secondary"
              onClick={() => {
                setMessage("");
                setSuccessMessage("");
                setShowPasswordForm(true);
              }}
            >
              Change password
            </button>
            <button
              className="top-action"
              onClick={() => setShowCourseForm(true)}
            >
              ＋ New course
            </button>
          </div>
        </header>
        {message && <div className="notice error">{message}</div>}
        {successMessage && (
          <div className="notice success">{successMessage}</div>
        )}
        {view === "home" && (
          <div className="teacher-view">
            <div className="editorial-head">
              <div>
                <p className="kicker">
                  Good day, {session.user.name.split(" ")[0]}
                </p>
                <h1>
                  Your classroom,
                  <br />
                  <em>at a glance.</em>
                </h1>
              </div>
              <p>
                Create students before courses so the same student ID works
                everywhere. Your next step is always one click away.
              </p>
            </div>
            <div className="metric-grid">
              <article>
                <span>01</span>
                <strong>{students.length}</strong>
                <p>Student profiles</p>
                <button onClick={() => setView("students")}>
                  Manage directory →
                </button>
              </article>
              <article>
                <span>02</span>
                <strong>{courses.length}</strong>
                <p>Courses created</p>
                <button onClick={() => setShowCourseForm(true)}>
                  Create a course →
                </button>
              </article>
              <article className="accent">
                <span>Start here</span>
                <h2>Build your student directory first.</h2>
                <p>
                  Manually add each student’s ID, name and a short description.
                  You can then add them to any course.
                </p>
                <button
                  onClick={() => {
                    setView("students");
                    openStudentForm();
                  }}
                >
                  ＋ Add first student
                </button>
              </article>
            </div>
            <section className="recent-section">
              <div>
                <p className="kicker">Courses</p>
                <h2>Continue teaching</h2>
              </div>
              <div className="teacher-course-list">
                {courses.map((item) => (
                  <button key={item._id} onClick={() => void openCourse(item)}>
                    <span>{item.code}</span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.status}</small>
                    </div>
                    <b>→</b>
                  </button>
                ))}
                {courses.length === 0 && (
                  <p className="muted">
                    No courses yet. Add students, then create your first course.
                  </p>
                )}
              </div>
            </section>
          </div>
        )}

        {view === "students" && (
          <div className="teacher-view">
            <div className="view-heading">
              <div>
                <p className="kicker">Student directory</p>
                <h1>People before courses.</h1>
                <p>
                  Create a reusable student profile. The ID you enter is exactly
                  what the student will use to sign in.
                </p>
              </div>
              <button className="primary" onClick={() => openStudentForm()}>
                ＋ Add student
              </button>
            </div>
            <div className="directory-tools">
              <input
                placeholder="Search name, ID or description"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <span>{filteredStudents.length} students</span>
            </div>
            <div className="directory-table">
              <div className="directory-head">
                <span>Student</span>
                <span>Login ID</span>
                <span>Description</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {filteredStudents.map((item) => (
                <div
                  className={`directory-row${item.deletedAt ? " is-deleted" : ""}`}
                  key={item.id}
                >
                  <div>
                    <span className="student-avatar">
                      {item.name.slice(0, 1)}
                    </span>
                    <strong>{item.name}</strong>
                  </div>
                  <code>{item.studentId}</code>
                  <p>{item.description || "No description"}</p>
                  <span
                    className={
                      item.deletedAt ? "status-deleted" : "status-live"
                    }
                  >
                    {item.deletedAt
                      ? "● Deleted"
                      : item.active
                        ? "● Active"
                        : "● Inactive"}
                  </span>
                  <div className="student-actions">
                    {item.canManage && !item.deletedAt && item.active && (
                      <button
                        className="soft-delete"
                        onClick={() => void softDeleteStudent(item)}
                      >
                        Delete
                      </button>
                    )}
                    {item.canManage && item.deletedAt && (
                      <>
                        <button onClick={() => void restoreStudent(item)}>
                          Restore
                        </button>
                        <button
                          className="permanent-delete"
                          onClick={() => void permanentlyDeleteStudent(item)}
                        >
                          Delete forever
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {filteredStudents.length === 0 && (
                <div className="empty-line">No students found.</div>
              )}
            </div>
          </div>
        )}

        {view === "course" && course && (
          <div className="teacher-view">
            <div className="course-editorial">
              <div>
                <p className="kicker">{course.code}</p>
                <h1>{course.name}</h1>
                <p>{course.description || "No course description."}</p>
              </div>
              <div className="course-controls">
                <span className={`state ${course.status.toLowerCase()}`}>
                  {course.status}
                </span>
                <button className="secondary" onClick={beginEditCourse}>
                  Edit course
                </button>
                <button
                  className="secondary"
                  onClick={() => void activateCourse()}
                >
                  {course.status === "ACTIVE"
                    ? "End course"
                    : "Activate course"}
                </button>
                <button
                  className="danger-button"
                  onClick={() => void deleteCourse()}
                >
                  Delete
                </button>
              </div>
            </div>
            {reviewing ? (
              <section className="panel">
                <button
                  className="back-link"
                  onClick={() => setReviewing(null)}
                >
                  ← All assignments
                </button>
                <div className="panel-title">
                  <div>
                    <p className="kicker">Submission review</p>
                    <h2>{reviewing.title}</h2>
                  </div>
                  <span>
                    {rows.filter((row) => row.submission).length}/{rows.length}{" "}
                    submitted
                  </span>
                </div>
                <div className="review-list">
                  {rows.map((row) => (
                    <article key={row.student.id}>
                      <div className="review-student">
                        <span className="student-avatar">
                          {row.student.name.slice(0, 1)}
                        </span>
                        <div>
                          <strong>{row.student.name}</strong>
                          <small>{row.status}</small>
                        </div>
                      </div>
                      {row.submission ? (
                        <>
                          <div className="review-files">
                            {row.submission.files.map((file, index) => (
                              <button
                                key={`${file.filename}-${index}`}
                                disabled={
                                  downloadingFile ===
                                  `${row.submission!._id}:${index}`
                                }
                                onClick={() =>
                                  void downloadSubmissionFile(
                                    row.submission!._id,
                                    index,
                                    file.filename,
                                  )
                                }
                              >
                                <span>{file.filename}</span>
                                <small>
                                  {downloadingFile ===
                                  `${row.submission!._id}:${index}`
                                    ? "Downloading…"
                                    : `${formatFileSize(file.sizeBytes)} · Download`}
                                </small>
                              </button>
                            ))}
                          </div>
                          <div className="feedback-box">
                            <textarea
                              placeholder="Write private feedback…"
                              value={feedback[row.submission._id] ?? ""}
                              onChange={(event) =>
                                setFeedback((current) => ({
                                  ...current,
                                  [row.submission!._id]: event.target.value,
                                }))
                              }
                            />
                            <button
                              disabled={publishingId === row.submission._id}
                              onClick={() =>
                                void publishFeedback(row.submission!._id)
                              }
                            >
                              {publishingId === row.submission._id
                                ? "Publishing…"
                                : row.submission.feedbackStatus === "PUBLISHED"
                                  ? "Publish update"
                                  : "Publish note"}
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="muted">Waiting for submission</p>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ) : (
              <div className="course-columns">
                <section className="panel">
                  <div className="panel-title">
                    <div>
                      <p className="kicker">Assignments</p>
                      <h2>Course work</h2>
                    </div>
                    <button
                      className="primary"
                      onClick={() => setShowAssignmentForm((value) => !value)}
                    >
                      ＋ New
                    </button>
                  </div>
                  {showAssignmentForm && (
                    <form className="inline-editor" onSubmit={createAssignment}>
                      <input
                        placeholder="Assignment title"
                        value={assignmentForm.title}
                        onChange={(event) =>
                          setAssignmentForm({
                            ...assignmentForm,
                            title: event.target.value,
                          })
                        }
                        required
                      />
                      <select
                        aria-label="Assignment type"
                        value={assignmentForm.kind}
                        onChange={(event) => setAssignmentForm({ ...assignmentForm, kind: event.target.value as "FILE_UPLOAD" | "INTERACTIVE" })}
                      >
                        <option value="FILE_UPLOAD">File upload</option>
                        <option value="INTERACTIVE">Interactive exercise</option>
                      </select>
                      <input
                        type="datetime-local"
                        value={assignmentForm.deadlineAt}
                        onChange={(event) =>
                          setAssignmentForm({
                            ...assignmentForm,
                            deadlineAt: event.target.value,
                          })
                        }
                        required
                      />
                      <textarea
                        placeholder="Instructions"
                        value={assignmentForm.instructions}
                        onChange={(event) =>
                          setAssignmentForm({
                            ...assignmentForm,
                            instructions: event.target.value,
                          })
                        }
                      />
                      {assignmentForm.kind === "INTERACTIVE" && (
                        <div className="interactive-create-note">
                          <strong>Question builder opens after this step</strong>
                          <p>The assignment needs a title and deadline first. You will then choose and arrange:</p>
                          <div>
                            <span>Multiple choice</span>
                            <span>Fill blank</span>
                            <span>Image match</span>
                            <span>Sentence order</span>
                            <span>Read aloud</span>
                          </div>
                        </div>
                      )}
                      <button>{assignmentForm.kind === "INTERACTIVE" ? "Create & open question builder →" : "Create assignment"}</button>
                    </form>
                  )}
                  <div className="assignment-admin-list">
                    {assignments.map((item, index) => (
                      item.kind === "INTERACTIVE" ? <Link className="assignment-admin-link" key={item._id} href={`/teacher/exercises/${item._id}`}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <strong>{item.title}</strong>
                          <small>{item.editorStatus ?? "DRAFT"} · Due {formatDate(item.deadlineAt)}</small>
                        </div>
                        <b>Edit →</b>
                      </Link> : <button key={item._id} onClick={() => void openReview(item)}>
                        <span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong><small>Due {formatDate(item.deadlineAt)}</small></div><b>Review →</b>
                      </button>
                    ))}
                    {!assignments.length && (
                      <p className="muted">No assignments yet.</p>
                    )}
                  </div>
                </section>
                <section className="panel roster-panel">
                  <div className="panel-title">
                    <div>
                      <p className="kicker">Roster</p>
                      <h2>{enrolled.length} students</h2>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => openStudentForm([course._id])}
                    >
                      ＋ New student
                    </button>
                  </div>
                  <div className="roster-list">
                    {enrolled.map((item) => (
                      <div className="roster-row" key={item.id}>
                        <span className="student-avatar">
                          {item.name.slice(0, 1)}
                        </span>
                        <div>
                          <strong>{item.name}</strong>
                          <code>{item.studentCode}</code>
                        </div>
                        <button
                          aria-label={`Remove ${item.name} from course`}
                          onClick={() => void removeStudent(item.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  {availableStudents.length > 0 && (
                    <div className="add-roster">
                      <p>Add from directory</p>
                      {availableStudents.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => void enrollStudent(item.id)}
                        >
                          ＋ {item.name}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </section>
      {showStudentForm && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setShowStudentForm(false)}
        >
          <form
            className="modal course-modal"
            onSubmit={createStudent}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setShowStudentForm(false)}
            >
              ×
            </button>
            <p className="kicker">New profile</p>
            <h2>Add a student</h2>
            <p>
              Type the details manually. The student will use this ID to access
              every course you add them to.
            </p>
            <label>
              Student ID
              <input
                autoFocus
                placeholder="e.g. STU-2048"
                value={studentForm.studentId}
                onChange={(event) =>
                  setStudentForm({
                    ...studentForm,
                    studentId: event.target.value.toUpperCase(),
                  })
                }
                required
              />
            </label>
            <label>
              Full name
              <input
                placeholder="Student name"
                value={studentForm.name}
                onChange={(event) =>
                  setStudentForm({ ...studentForm, name: event.target.value })
                }
                required
              />
            </label>
            <label>
              Description
              <textarea
                placeholder="Class, notes, or context"
                value={studentForm.description}
                onChange={(event) =>
                  setStudentForm({
                    ...studentForm,
                    description: event.target.value,
                  })
                }
              />
            </label>
            <fieldset>
              <legend>
                Enroll in courses{" "}
                <span>{studentForm.courseIds.length} selected</span>
              </legend>
              <div className="student-picker course-picker">
                {courses.map((item) => (
                  <label key={item._id}>
                    <input
                      type="checkbox"
                      checked={studentForm.courseIds.includes(item._id)}
                      onChange={() =>
                        setStudentForm((current) => ({
                          ...current,
                          courseIds: current.courseIds.includes(item._id)
                            ? current.courseIds.filter((id) => id !== item._id)
                            : [...current.courseIds, item._id],
                        }))
                      }
                    />
                    <div>
                      <strong>{item.name}</strong>
                      <code>{item.code}</code>
                    </div>
                  </label>
                ))}
                {courses.length === 0 && (
                  <p className="muted">
                    You can create the profile now and enroll this student after
                    creating a course.
                  </p>
                )}
              </div>
            </fieldset>
            <button className="primary wide">Create student profile →</button>
          </form>
        </div>
      )}
      {showCourseForm && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setShowCourseForm(false)}
        >
          <form
            className="modal course-modal"
            onSubmit={createCourse}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setShowCourseForm(false)}
            >
              ×
            </button>
            <p className="kicker">New course</p>
            <h2>Create and build your roster</h2>
            <label>
              Course name
              <input
                autoFocus
                placeholder="e.g. Visual Communication"
                value={courseForm.name}
                onChange={(event) =>
                  setCourseForm({ ...courseForm, name: event.target.value })
                }
                required
              />
            </label>
            <label>
              Description
              <textarea
                placeholder="What is this course about?"
                value={courseForm.description}
                onChange={(event) =>
                  setCourseForm({
                    ...courseForm,
                    description: event.target.value,
                  })
                }
              />
            </label>
            <fieldset>
              <legend>
                Add students{" "}
                <span>{courseForm.studentIds.length} selected</span>
              </legend>
              <div className="student-picker">
                {students.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={courseForm.studentIds.includes(item.id)}
                      onChange={() =>
                        setCourseForm((current) => ({
                          ...current,
                          studentIds: current.studentIds.includes(item.id)
                            ? current.studentIds.filter((id) => id !== item.id)
                            : [...current.studentIds, item.id],
                        }))
                      }
                    />
                    <span className="student-avatar">
                      {item.name.slice(0, 1)}
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <code>{item.studentId}</code>
                    </div>
                  </label>
                ))}
                {students.length === 0 && (
                  <p className="muted">
                    Create a student profile first, or continue with an empty
                    roster.
                  </p>
                )}
              </div>
            </fieldset>
            <button className="primary wide">Create course →</button>
          </form>
        </div>
      )}
      {showEditCourse && course && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setShowEditCourse(false)}
        >
          <form
            className="modal"
            onSubmit={editCourse}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setShowEditCourse(false)}
            >
              ×
            </button>
            <p className="kicker">Course settings</p>
            <h2>Edit course</h2>
            <p>The course code stays the same for existing records.</p>
            <label>
              Course name
              <input
                autoFocus
                value={editCourseForm.name}
                onChange={(event) =>
                  setEditCourseForm({
                    ...editCourseForm,
                    name: event.target.value,
                  })
                }
                required
                minLength={2}
              />
            </label>
            <label>
              Description
              <textarea
                value={editCourseForm.description}
                onChange={(event) =>
                  setEditCourseForm({
                    ...editCourseForm,
                    description: event.target.value,
                  })
                }
              />
            </label>
            <button className="primary wide">Save changes →</button>
          </form>
        </div>
      )}
      {showPasswordForm && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setShowPasswordForm(false)}
        >
          <form
            className="modal"
            onSubmit={changePassword}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setShowPasswordForm(false)}
            >
              ×
            </button>
            <p className="kicker">Account security</p>
            <h2>Change password</h2>
            <p>Use at least 8 characters and choose a new password.</p>
            <label>
              Current password
              <input
                autoFocus
                type="password"
                autoComplete="current-password"
                value={passwordForm.currentPassword}
                onChange={(event) =>
                  setPasswordForm({
                    ...passwordForm,
                    currentPassword: event.target.value,
                  })
                }
                minLength={8}
                maxLength={128}
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={passwordForm.newPassword}
                onChange={(event) =>
                  setPasswordForm({
                    ...passwordForm,
                    newPassword: event.target.value,
                  })
                }
                minLength={8}
                maxLength={128}
                required
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                value={passwordForm.confirmPassword}
                onChange={(event) =>
                  setPasswordForm({
                    ...passwordForm,
                    confirmPassword: event.target.value,
                  })
                }
                minLength={8}
                maxLength={128}
                required
              />
            </label>
            <button className="primary wide" disabled={changingPassword}>
              {changingPassword ? "Changing password…" : "Change password →"}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
