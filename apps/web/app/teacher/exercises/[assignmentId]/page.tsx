"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChangeEvent, useCallback, useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "/api";
type QuestionType = "MULTIPLE_CHOICE" | "FILL_BLANK" | "IMAGE_MATCH" | "SENTENCE_ORDER" | "READ_ALOUD";
type Question = { id: string; sectionId?: string; type: QuestionType; order: number; points: number; prompt?: string; content: Record<string, unknown>; answerKey?: Record<string, unknown>; explanation?: string; grading?: Record<string, unknown> };
type Draft = { _id: string; assignmentId: string; versionNumber: number; revision: number; status: string; sections: Array<{ id: string; title: string; order: number }>; questions: Question[] };
type Session = { token: string };

const templates: Record<QuestionType, Pick<Question, "content" | "answerKey" | "grading">> = {
  MULTIPLE_CHOICE: { content: { options: [{ id: "a", text: "Option A" }, { id: "b", text: "Option B" }] }, answerKey: { correctOptionId: "a" } },
  FILL_BLANK: { content: { template: "Type a sentence with [[b1]]." }, answerKey: { blanks: [{ id: "b1", acceptedAnswers: ["answer"], trim: true, caseSensitive: false, collapseWhitespace: true }] } },
  IMAGE_MATCH: { content: { pairs: [{ id: "p1", imageKey: "first.png", label: "First", altText: "First image" }, { id: "p2", imageKey: "second.png", label: "Second", altText: "Second image" }] } },
  SENTENCE_ORDER: { content: { sentence: "She is reading.", blocks: [{ id: "t1", text: "She" }, { id: "t2", text: "is" }, { id: "t3", text: "reading." }] }, answerKey: { correctBlockIds: ["t1", "t2", "t3"] } },
  READ_ALOUD: { content: { passage: "Read this passage aloud.", maxDurationSeconds: 120 }, grading: { mode: "MANUAL", rubric: [{ key: "pronunciation", label: "Pronunciation", weight: 0.4 }, { key: "fluency", label: "Fluency", weight: 0.3 }, { key: "intonation", label: "Intonation", weight: 0.2 }, { key: "completeness", label: "Completeness", weight: 0.1 }] } },
};

export default function ExerciseEditorPage() {
  const assignmentId = useParams<{ assignmentId: string }>().assignmentId;
  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const request = useCallback(async (path: string, token: string, init?: RequestInit) => {
    const response = await fetch(`${api}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...init?.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(", ") : data.message ?? "Request failed");
    return data;
  }, []);
  const load = useCallback(async (active: Session) => {
    setBusy(true);
    try { setDraft(await request(`/assignments/${assignmentId}/exercise/draft`, active.token) as Draft); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not load exercise"); }
    finally { setBusy(false); }
  }, [assignmentId, request]);
  useEffect(() => {
    const raw = sessionStorage.getItem("teacherSession");
    const timer = window.setTimeout(() => {
      if (!raw) { setMessage("Sign in through the teacher portal first."); return; }
      const active = JSON.parse(raw) as Session; setSession(active); void load(active);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function updateQuestion(index: number, patch: Partial<Question>) {
    if (!draft) return;
    const questions = [...draft.questions]; questions[index] = { ...questions[index], ...patch }; setDraft({ ...draft, questions });
  }
  function updateJson(index: number, field: "content" | "answerKey" | "grading", value: string) {
    try { updateQuestion(index, { [field]: JSON.parse(value) }); setMessage(""); }
    catch { setMessage(`JSON ${field} is not valid yet.`); }
  }
  function add(type: QuestionType) {
    if (!draft) return;
    const id = `q-${crypto.randomUUID().slice(0, 8)}`;
    const base = templates[type];
    setDraft({ ...draft, questions: [...draft.questions, { id, sectionId: draft.sections[0]?.id, type, order: draft.questions.length, points: 1, prompt: "", ...structuredClone(base) }] });
  }
  async function save() {
    if (!draft || !session) return false; setBusy(true); setIssues([]);
    try {
      const saved = await request(`/assignments/${assignmentId}/exercise/draft`, session.token, { method: "PUT", body: JSON.stringify({ expectedRevision: draft.revision, sections: draft.sections.length ? draft.sections : [{ id: "section-1", title: "Exercises", order: 0 }], questions: draft.questions.map((question, order) => ({ ...question, order })) }) }) as Draft;
      setDraft(saved); setMessage("Draft saved."); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save"); return false; }
    finally { setBusy(false); }
  }
  async function validate() {
    if (!session) return;
    try { const report = await request(`/assignments/${assignmentId}/exercise/validate`, session.token, { method: "POST" }) as { valid: boolean; errors: Array<{ message: string }>; warnings: Array<{ message: string }>; totalPoints: number }; setIssues([...report.errors, ...report.warnings].map((item) => item.message)); setMessage(report.valid ? `Ready to publish · ${report.totalPoints} points.` : "Please fix the validation errors."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Validation failed"); }
  }
  async function publish() {
    if (!session || !window.confirm("Publish this immutable version for students?")) return;
    try { if (!await save()) return; const result = await request(`/assignments/${assignmentId}/exercise/publish`, session.token, { method: "POST" }) as { versionNumber: number }; setMessage(`Version ${result.versionNumber} published.`); await load(session); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Publish failed"); }
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file || !session) return;
    try { const source = await file.text(); const result = await request(`/courses/${draft?.assignmentId ?? "preview"}/exercises/import/preview`, session.token, { method: "POST", body: JSON.stringify({ source, sourceName: file.name }) }) as { valid: boolean; sections: Draft["sections"]; questions: Question[]; errors: Array<{ message: string }>; warnings: Array<{ message: string }> }; setIssues([...result.errors, ...result.warnings].map((item) => item.message)); if (result.valid && draft) { setDraft({ ...draft, sections: result.sections, questions: result.questions }); setMessage(`Imported ${result.questions.length} questions. Review and save the draft.`); } else setMessage("Import contains errors."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Import failed"); }
    event.target.value = "";
  }

  if (!draft) return <main className="exercise-shell"><Link href="/teacher">← Teacher portal</Link><p>{busy ? "Loading editor…" : message}</p></main>;
  return <main className="exercise-shell">
    <header className="exercise-toolbar"><div><Link href="/teacher">← Teacher portal</Link><p className="kicker">Interactive exercise · v{draft.versionNumber}</p><h1>Question builder</h1></div><div><label className="secondary exercise-import">Import MD/TXT<input type="file" accept=".md,.txt,text/plain,text/markdown" onChange={(event) => void importFile(event)} /></label><button className="secondary" onClick={() => void validate()}>Validate</button><button className="secondary" disabled={busy} onClick={() => void save()}>Save draft</button><button className="primary" disabled={busy || !draft.questions.length} onClick={() => void publish()}>Publish</button></div></header>
    {message && <div className="notice">{message}</div>}{issues.length > 0 && <div className="exercise-issues">{issues.map((item, index) => <p key={`${item}-${index}`}>• {item}</p>)}</div>}
    <div className="question-palette">{(Object.keys(templates) as QuestionType[]).map((type) => <button key={type} onClick={() => add(type)}>＋ {type.replaceAll("_", " ")}</button>)}</div>
    <section className="builder-list">{draft.questions.map((question, index) => <article className="builder-card" key={question.id}>
      <div className="builder-card-head"><span>{String(index + 1).padStart(2, "0")}</span><strong>{question.type.replaceAll("_", " ")}</strong><button aria-label="Move up" disabled={index === 0} onClick={() => { const next = [...draft.questions]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setDraft({ ...draft, questions: next }); }}>↑</button><button aria-label="Delete" onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, itemIndex) => itemIndex !== index) })}>Delete</button></div>
      <div className="builder-fields"><label>Prompt<input value={question.prompt ?? ""} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} /></label><label>Points<input type="number" min="0.5" max="100" step="0.5" value={question.points} onChange={(event) => updateQuestion(index, { points: Number(event.target.value) })} /></label></div>
      <label>Content JSON<textarea rows={7} defaultValue={JSON.stringify(question.content, null, 2)} onBlur={(event) => updateJson(index, "content", event.target.value)} /></label>
      {question.type !== "READ_ALOUD" && question.type !== "IMAGE_MATCH" && <label>Answer key JSON<textarea rows={5} defaultValue={JSON.stringify(question.answerKey ?? {}, null, 2)} onBlur={(event) => updateJson(index, "answerKey", event.target.value)} /></label>}
    </article>)}{!draft.questions.length && <div className="empty-panel"><h2>Add the first question</h2><p>Choose one of the five supported question types above, or import the provided MD template.</p></div>}</section>
  </main>;
}
