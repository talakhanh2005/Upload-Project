'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const api = process.env.NEXT_PUBLIC_API_URL ?? '/api';
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.pdf', '.txt', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx'];
type Course = { _id: string; code: string; name: string; description?: string; status: 'DRAFT' | 'ACTIVE' | 'ENDED' };
type Assignment = { _id: string; title: string; instructions?: string; deadlineAt: string; closesAt?: string; isManuallyLocked: boolean };
type SubmissionFile = { filename: string; sizeBytes: number };
type Submission = { _id: string; submittedAt: string; status: 'SUBMITTED' | 'LATE'; files: SubmissionFile[]; feedbackText?: string; feedbackStatus: 'NONE' | 'DRAFT' | 'PUBLISHED' };
type StudentSession = { token: string; studentName: string };

function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)); }

export default function StudentPage() {
  const [studentId, setStudentId] = useState('');
  const [session, setSession] = useState<StudentSession | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, Submission | null>>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [currentTime, setCurrentTime] = useState(0);

  const logout = useCallback(() => {
    sessionStorage.removeItem('studentSession');
    setSession(null); setCourses([]); setCourse(null); setAssignments([]); setSubmissions({}); setStudentId(''); setMessage('');
  }, []);
  const request = useCallback(async (path: string, token: string) => {
    const response = await fetch(`${api}${path}`, { headers: { authorization: `Bearer ${token}` } });
    if (response.status === 401) { logout(); throw new Error('Your session expired. Enter your student ID again.'); }
    if (!response.ok) throw new Error('We could not load this page. Please try again.');
    const body = await response.text(); return body ? JSON.parse(body) : null;
  }, [logout]);
  const loadCourses = useCallback(async (active: StudentSession) => {
    setLoading(true); setMessage('');
    try { setCourses(await request('/courses', active.token) as Course[]); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load courses.'); }
    finally { setLoading(false); }
  }, [request]);

  useEffect(() => {
    const saved = sessionStorage.getItem('studentSession'); if (!saved) return;
    let timer: number | undefined;
    try {
      const active = JSON.parse(saved) as StudentSession;
      timer = window.setTimeout(() => { setSession(active); void loadCourses(active); }, 0);
    }
    catch { sessionStorage.removeItem('studentSession'); }
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, [loadCourses]);

  useEffect(() => {
    const update = () => setCurrentTime(Date.now());
    const initial = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 30_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage('');
    try {
      const response = await fetch(`${api}/auth/student/access`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studentCode: studentId.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message ?? 'Student ID not found');
      const active = { token: data.accessToken, studentName: data.student.name };
      sessionStorage.setItem('studentSession', JSON.stringify(active)); setSession(active); await loadCourses(active);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not sign in.'); }
    finally { setLoading(false); }
  }
  async function openCourse(selected: Course) {
    if (!session) return; setCourse(selected); setLoading(true); setMessage('');
    try {
      const loaded = await request(`/courses/${selected._id}/assignments`, session.token) as Assignment[]; setAssignments(loaded);
      const entries = await Promise.all(loaded.map(async (item) => [item._id, await request(`/assignments/${item._id}/my-submission`, session.token)] as const));
      setSubmissions(Object.fromEntries(entries));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load assignments.'); }
    finally { setLoading(false); }
  }
  function chooseFiles(assignmentId: string, event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []); const total = files.reduce((sum, file) => sum + file.size, 0);
    if (files.length > 25 || files.some((file) => file.size > 25 * 1024 * 1024) || total > 100 * 1024 * 1024) { setMessage('Choose up to 25 files, 25 MB each and 100 MB total.'); return; }
    setMessage(''); setSelectedFiles((current) => ({ ...current, [assignmentId]: files })); event.target.value = '';
  }
  function upload(item: Assignment) {
    if (!session) return; const files = selectedFiles[item._id] ?? []; if (!files.length) return;
    const form = new FormData(); files.forEach((file) => form.append('files', file));
    setUploading((current) => ({ ...current, [item._id]: true })); setProgress((current) => ({ ...current, [item._id]: 0 }));
    const xhr = new XMLHttpRequest(); xhr.open('POST', `${api}/assignments/${item._id}/submissions`); xhr.setRequestHeader('Authorization', `Bearer ${session.token}`);
    xhr.upload.onprogress = (event) => event.lengthComputable && setProgress((current) => ({ ...current, [item._id]: Math.round(event.loaded / event.total * 100) }));
    xhr.onload = () => { setUploading((current) => ({ ...current, [item._id]: false })); if (xhr.status < 200 || xhr.status >= 300) { setMessage('Upload failed. Your previous submission is still safe.'); return; } setSubmissions((current) => ({ ...current, [item._id]: JSON.parse(xhr.responseText) })); setSelectedFiles((current) => ({ ...current, [item._id]: [] })); setExpanded(null); };
    xhr.onerror = () => { setUploading((current) => ({ ...current, [item._id]: false })); setMessage('Network error. Please try the upload again.'); }; xhr.send(form);
  }
  const dueCount = useMemo(() => assignments.filter((item) => !submissions[item._id]).length, [assignments, submissions]);

  if (!session) return <main className="access-page">
    <nav className="public-nav"><Link className="brand" href="/"><span>F</span>Folio</Link><Link className="teacher-link" href="/teacher">Teacher portal <b>↗</b></Link></nav>
    <section className="access-shell"><div className="access-copy"><div className="display-mark">F</div><p className="kicker">Student submission portal</p><h1>One ID.<br/>Every class.</h1><p className="lead">Enter the student ID your teacher gave you. Then choose a course, open an assignment, and upload your work.</p><div className="steps"><span><b>01</b> Enter your ID</span><span><b>02</b> Pick a course</span><span><b>03</b> Submit work</span></div></div>
      <form className="access-card" onSubmit={login}><div className="card-number">01</div><p className="kicker">Welcome back</p><h2>Find your workspace</h2><p>Your ID is unique to you and may contain letters or numbers.</p><label>Student ID<input autoFocus value={studentId} onChange={(event) => setStudentId(event.target.value.toUpperCase())} placeholder="e.g. STU-2048" minLength={3} required /></label><button disabled={loading}>{loading ? 'Checking ID…' : 'Continue'} <span>→</span></button>{message && <div className="form-error" role="alert">{message}</div>}<small>Can’t find your ID? Ask your teacher to check your student profile.</small></form></section>
    <footer><span>Folio</span><span>Private by design · Built for classrooms</span></footer>
  </main>;

  if (!course) return <main className="student-app"><nav className="app-nav"><Link className="brand" href="/"><span>F</span>Folio</Link><div className="account"><div className="avatar">{session.studentName.slice(0, 1)}</div><div><strong>{session.studentName}</strong><small>Student</small></div><button onClick={logout}>Sign out</button></div></nav>
    <section className="student-shell"><div className="welcome-row"><div><p className="kicker">Your learning space</p><h1>Choose a course</h1><p>Good to see you, {session.studentName.split(' ')[0]}. Pick where you want to submit work today.</p></div><div className="big-index">01</div></div>{message && <div className="notice error">{message}</div>}
      {loading ? <div className="loading-block">Loading your courses…</div> : courses.length === 0 ? <div className="empty-panel"><span>○</span><h2>No courses yet</h2><p>Your teacher has created your profile but has not added you to a course.</p></div> : <div className="course-grid">{courses.map((item, index) => <button className="course-card" key={item._id} onClick={() => void openCourse(item)}><div><span className="course-index">{String(index + 1).padStart(2, '0')}</span><span className={`state ${item.status.toLowerCase()}`}>{item.status}</span></div><h2>{item.name}</h2><p>{item.description || 'Open this course to see your assignments.'}</p><footer><span>{item.code}</span><b>Open course →</b></footer></button>)}</div>}
    </section></main>;

  return <main className="student-app"><nav className="app-nav"><Link className="brand" href="/"><span>F</span>Folio</Link><div className="account"><div className="avatar">{session.studentName.slice(0, 1)}</div><div><strong>{session.studentName}</strong><small>Student</small></div><button onClick={logout}>Sign out</button></div></nav>
    <section className="student-shell"><button className="back-link" onClick={() => { setCourse(null); setAssignments([]); }}>← All courses</button><div className="course-title"><div><p className="kicker">{course.code}</p><h1>{course.name}</h1><p>{course.description || 'Course assignments'}</p></div><div className="due-stat"><strong>{dueCount}</strong><span>To submit</span></div></div>{message && <div className="notice error">{message}</div>}
      {loading ? <div className="loading-block">Loading assignments…</div> : assignments.length === 0 ? <div className="empty-panel"><span>✓</span><h2>You’re all caught up</h2><p>There are no assignments in this course yet.</p></div> : <div className="assignment-stack">{assignments.map((item, index) => { const submission = submissions[item._id]; const files = selectedFiles[item._id] ?? []; const isOpen = course.status === 'ACTIVE' && !item.isManuallyLocked && (!item.closesAt || currentTime <= +new Date(item.closesAt)); return <article className="student-assignment" key={item._id}><div className="assignment-number">{String(index + 1).padStart(2, '0')}</div><div className="assignment-main"><div className="assignment-heading"><div><div className="mini-status"><span className={submission ? 'complete' : 'pending'}>{submission ? 'Submitted' : 'To submit'}</span><span>Due {formatDate(item.deadlineAt)}</span></div><h2>{item.title}</h2><p>{item.instructions || 'No additional instructions.'}</p></div>{submission && <div className="checkmark">✓</div>}</div>
        {submission && <div className="submitted-strip"><div><strong>{submission.files.length} file{submission.files.length === 1 ? '' : 's'} submitted</strong><span>{formatDate(submission.submittedAt)} · {submission.status}</span></div><div>{submission.files.map((file) => <span key={file.filename}>{file.filename}</span>)}</div></div>}{submission?.feedbackStatus === 'PUBLISHED' && submission.feedbackText && <div className="feedback-note"><b>Teacher note</b><p>{submission.feedbackText}</p></div>}
        {!isOpen ? <div className="closed-banner">Submissions are closed for this assignment.</div> : expanded !== item._id ? <button className="upload-trigger" onClick={() => setExpanded(item._id)}>{submission ? 'Replace submission' : 'Upload your work'} <span>＋</span></button> : <div className="upload-workspace"><label className="drop-area"><input type="file" multiple accept={ACCEPTED_EXTENSIONS.join(',')} onChange={(event) => chooseFiles(item._id, event)} /><span>↑</span><strong>Choose files</strong><small>PDF, Office, text or images · up to 100 MB total</small></label>{files.length > 0 && <div className="file-queue">{files.map((file) => <div key={`${file.name}-${file.lastModified}`}><span>{file.name}</span><small>{formatBytes(file.size)}</small></div>)}</div>}<div className="upload-actions"><button onClick={() => setExpanded(null)} className="quiet-button">Cancel</button><button onClick={() => upload(item)} disabled={!files.length || uploading[item._id]} className="action-button">{uploading[item._id] ? `Uploading ${progress[item._id] ?? 0}%` : 'Submit files →'}</button></div></div>}
      </div></article>; })}</div>}
    </section></main>;
}
