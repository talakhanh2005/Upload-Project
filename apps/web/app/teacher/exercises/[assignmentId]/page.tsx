"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BlankRule, BuilderDraft as Draft, ImagePair, Option, Question, QuestionType, SentenceBlock, toBuilderDraft, toDraftPayload } from "../../../../lib/exercise-builder";

const api = process.env.NEXT_PUBLIC_API_URL ?? "/api";
type Session = { token: string };

const questionLabels: Record<QuestionType, { title: string; description: string }> = {
  MULTIPLE_CHOICE: { title: "Multiple choice", description: "One correct option" },
  FILL_BLANK: { title: "Fill in the blank", description: "Text answers with accepted variants" },
  IMAGE_MATCH: { title: "Image matching", description: "Upload pictures and match labels" },
  SENTENCE_ORDER: { title: "Sentence order", description: "Drag words into the correct order" },
  READ_ALOUD: { title: "Read aloud", description: "Student records a voice answer" },
};
const templates: Record<QuestionType, Pick<Question, "content" | "answerKey" | "grading">> = {
  MULTIPLE_CHOICE: { content: { options: [{ id: "a", text: "Option A" }, { id: "b", text: "Option B" }] }, answerKey: { correctOptionId: "a" } },
  FILL_BLANK: { content: { template: "I drink [[b1]] every morning." }, answerKey: { blanks: [{ id: "b1", acceptedAnswers: ["milk"], trim: true, caseSensitive: false, collapseWhitespace: true }] } },
  IMAGE_MATCH: { content: { pairs: [{ id: "p1", label: "Apple", altText: "A red apple" }, { id: "p2", label: "Milk", altText: "A glass of milk" }] } },
  SENTENCE_ORDER: { content: { sentence: "She is reading.", blocks: [{ id: "t1", text: "She" }, { id: "t2", text: "is" }, { id: "t3", text: "reading." }] }, answerKey: { correctBlockIds: ["t1", "t2", "t3"] } },
  READ_ALOUD: { content: { passage: "Read this passage aloud.", maxDurationSeconds: 120 }, grading: { mode: "MANUAL", rubric: [{ key: "pronunciation", label: "Pronunciation", weight: 0.4 }, { key: "fluency", label: "Fluency", weight: 0.3 }, { key: "intonation", label: "Intonation", weight: 0.2 }, { key: "completeness", label: "Completeness", weight: 0.1 }] } },
};

export default function ExerciseEditorPage() {
  const assignmentId = useParams<{ assignmentId: string }>().assignmentId;
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [draggedQuestion, setDraggedQuestion] = useState<number | null>(null);
  const [uploadingPair, setUploadingPair] = useState("");

  const request = useCallback(async (path: string, token: string, init?: RequestInit) => {
    const response = await fetch(`${api}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...init?.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(", ") : data.message ?? "Request failed");
    return data;
  }, []);
  const load = useCallback(async (active: Session) => {
    setBusy(true);
    try { setDraft(toBuilderDraft(await request(`/assignments/${assignmentId}/exercise/draft`, active.token) as Draft)); }
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

  function replaceQuestion(index: number, question: Question) {
    setDraft((current) => current ? { ...current, questions: current.questions.map((item, itemIndex) => itemIndex === index ? question : item) } : current);
  }
  function add(type: QuestionType) {
    if (!draft) return;
    const id = `q-${crypto.randomUUID().slice(0, 8)}`;
    const question: Question = { id, sectionId: draft.sections[0]?.id, type, order: draft.questions.length, points: type === "READ_ALOUD" ? 2 : 1, prompt: "", ...structuredClone(templates[type]) };
    setDraft({ ...draft, questions: [...draft.questions, question] });
    window.setTimeout(() => document.getElementById(`question-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }
  function dropQuestion(target: number) {
    if (!draft || draggedQuestion === null || draggedQuestion === target) return;
    const questions = [...draft.questions]; const [moved] = questions.splice(draggedQuestion, 1); questions.splice(target, 0, moved);
    setDraft({ ...draft, questions }); setDraggedQuestion(null);
  }
  async function save() {
    if (!draft || !session) return false; setBusy(true); setIssues([]);
    try {
      const saved = await request(`/assignments/${assignmentId}/exercise/draft`, session.token, { method: "PUT", body: JSON.stringify(toDraftPayload(draft)) }) as Draft;
      setDraft(toBuilderDraft(saved)); setMessage("Draft saved."); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save"); return false; }
    finally { setBusy(false); }
  }
  async function validate() {
    if (!session || !await save()) return;
    try { const report = await request(`/assignments/${assignmentId}/exercise/validate`, session.token, { method: "POST" }) as { valid: boolean; errors: Array<{ message: string }>; warnings: Array<{ message: string }>; totalPoints: number }; setIssues([...report.errors, ...report.warnings].map((item) => item.message)); setMessage(report.valid ? `Ready to publish · ${report.totalPoints} points.` : "Please fix the validation errors below."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Validation failed"); }
  }
  async function publish() {
    if (!session || !window.confirm("Publish this immutable version for students?")) return;
    try { if (!await save()) return; const result = await request(`/assignments/${assignmentId}/exercise/publish`, session.token, { method: "POST" }) as { versionNumber: number }; setMessage(`Version ${result.versionNumber} published.`); await load(session); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Publish failed"); }
  }
  async function deleteAssignment() {
    if (!session || !draft || !window.confirm(`Delete “${draft.assignmentTitle}”? Students will no longer see it, while existing history remains stored.`)) return;
    try { await request(`/assignments/${assignmentId}`, session.token, { method: "DELETE" }); router.push("/teacher"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete assignment"); }
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file || !session || !draft) return;
    try { const source = await file.text(); const result = await request(`/courses/${draft.courseId}/exercises/import/preview`, session.token, { method: "POST", body: JSON.stringify({ source, sourceName: file.name }) }) as { valid: boolean; sections: Draft["sections"]; questions: Question[]; errors: Array<{ message: string }>; warnings: Array<{ message: string }> }; setIssues([...result.errors, ...result.warnings].map((item) => item.message)); if (result.valid) { setDraft(toBuilderDraft({ ...draft, sections: result.sections, questions: result.questions })); setMessage(`Imported ${result.questions.length} questions. Review the images and save.`); } else setMessage("Import contains errors."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Import failed"); }
    event.target.value = "";
  }
  async function uploadImage(questionIndex: number, pairId: string, file: File) {
    if (!session || !draft) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024) { setMessage("Choose a JPEG, PNG or WebP image up to 15 MB."); return; }
    setUploadingPair(pairId); setMessage("Uploading image…");
    const form = new FormData(); form.append("file", file);
    try {
      const response = await fetch(`${api}/courses/${draft.courseId}/exercise-assets`, { method: "POST", headers: { authorization: `Bearer ${session.token}` }, body: form });
      const asset = await response.json(); if (!response.ok) throw new Error(Array.isArray(asset.message) ? asset.message.join(", ") : asset.message ?? "Image upload failed");
      const assetId = String(asset.id ?? asset._id); const question = draft.questions[questionIndex];
      const pairs = (question.content.pairs as ImagePair[]).map((pair) => pair.id === pairId ? { ...pair, imageAssetId: assetId, imageKey: undefined } : pair);
      replaceQuestion(questionIndex, { ...question, content: { ...question.content, pairs } }); setMessage("Image uploaded. Save the draft when ready.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Image upload failed"); }
    finally { setUploadingPair(""); }
  }

  if (!draft) return <main className="exercise-shell"><Link href="/teacher">← Teacher portal</Link><p>{busy ? "Loading editor…" : message}</p></main>;
  const totalPoints = draft.questions.reduce((sum, question) => sum + (Number.isFinite(question.points) ? question.points : 0), 0);
  return <main className="exercise-shell">
    <header className="exercise-toolbar"><div><Link href="/teacher">← Teacher portal</Link><p className="kicker">Interactive exercise · v{draft.versionNumber}</p><h1>{draft.assignmentTitle || "Question builder"}</h1><p className="builder-summary">{draft.questions.length} questions · {totalPoints} points · drag cards to reorder</p></div><div><label className="secondary exercise-import">Import MD/TXT<input type="file" accept=".md,.txt,text/plain,text/markdown" onChange={(event) => void importFile(event)} /></label><button className="secondary" onClick={() => void validate()}>Validate</button><button className="secondary" disabled={busy} onClick={() => void save()}>Save draft</button><button className="primary" disabled={busy || !draft.questions.length} onClick={() => void publish()}>Publish</button><button className="danger-button" onClick={() => void deleteAssignment()}>Delete</button></div></header>
    {message ? <div className="notice">{message}</div> : null}{issues.length > 0 ? <div className="exercise-issues">{issues.map((item, index) => <p key={`${item}-${index}`}>• {item}</p>)}</div> : null}
    <section className="builder-palette"><div><p className="kicker">Add activity</p><h2>Choose a question type</h2></div><div>{(Object.keys(questionLabels) as QuestionType[]).map((type) => <button key={type} onClick={() => add(type)}><strong>＋ {questionLabels[type].title}</strong><span>{questionLabels[type].description}</span></button>)}</div></section>
    <section className="builder-list">{draft.questions.map((question, index) => <article id={`question-${question.id}`} className={`builder-card ${draggedQuestion === index ? "dragging" : ""}`} key={question.id} onDragOver={(event) => event.preventDefault()} onDrop={() => dropQuestion(index)}>
      <div className="builder-card-head"><button className="drag-handle" draggable aria-label={`Drag question ${index + 1}`} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedQuestion(index); }} onDragEnd={() => setDraggedQuestion(null)}>⠿</button><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{questionLabels[question.type].title}</strong><small>{questionLabels[question.type].description}</small></div><button className="card-delete" aria-label={`Delete question ${index + 1}`} onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, itemIndex) => itemIndex !== index) })}>Delete</button></div>
      <QuestionEditor question={question} token={session?.token ?? ""} uploadingPair={uploadingPair} onChange={(next) => replaceQuestion(index, next)} onUploadImage={(pairId, file) => void uploadImage(index, pairId, file)} />
    </article>)}{!draft.questions.length ? <div className="empty-panel"><h2>Add the first question</h2><p>Choose a card above or import the provided MD template.</p></div> : null}</section>
  </main>;
}

function QuestionEditor({ question, token, uploadingPair, onChange, onUploadImage }: { question: Question; token: string; uploadingPair: string; onChange: (question: Question) => void; onUploadImage: (pairId: string, file: File) => void }) {
  const updateContent = (patch: Record<string, unknown>) => onChange({ ...question, content: { ...question.content, ...patch } });
  const updateKey = (patch: Record<string, unknown>) => onChange({ ...question, answerKey: { ...question.answerKey, ...patch } });
  return <div className="visual-question-editor"><div className="builder-fields"><label>Question / instruction<input value={question.prompt ?? ""} placeholder="What should the student do?" onChange={(event) => onChange({ ...question, prompt: event.target.value })} /></label><label>Points<input type="number" min="0.5" max="100" step="0.5" value={question.points} onChange={(event) => onChange({ ...question, points: Number(event.target.value) })} /></label></div>
    {question.type === "MULTIPLE_CHOICE" ? <MultipleChoiceEditor question={question} onContent={updateContent} onKey={updateKey} /> : null}
    {question.type === "FILL_BLANK" ? <FillBlankEditor question={question} onChange={onChange} /> : null}
    {question.type === "IMAGE_MATCH" ? <ImageMatchEditor question={question} token={token} uploadingPair={uploadingPair} onContent={updateContent} onUpload={onUploadImage} /> : null}
    {question.type === "SENTENCE_ORDER" ? <SentenceOrderEditor question={question} onChange={onChange} /> : null}
    {question.type === "READ_ALOUD" ? <ReadAloudEditor question={question} onContent={updateContent} /> : null}
    <label>Explanation shown after results<textarea rows={2} value={question.explanation ?? ""} placeholder="Optional explanation for the student" onChange={(event) => onChange({ ...question, explanation: event.target.value })} /></label></div>;
}

function MultipleChoiceEditor({ question, onContent, onKey }: { question: Question; onContent: (patch: Record<string, unknown>) => void; onKey: (patch: Record<string, unknown>) => void }) {
  const options = (question.content.options as Option[]) ?? []; const correct = String(question.answerKey?.correctOptionId ?? "");
  return <fieldset className="structured-fieldset"><legend>Answer options</legend>{options.map((option, index) => <div className="option-editor" key={option.id}><label className="correct-radio"><input type="radio" name={`correct-${question.id}`} checked={correct === option.id} onChange={() => onKey({ correctOptionId: option.id })} /><span>Correct</span></label><input aria-label={`Option ${index + 1}`} value={option.text} onChange={(event) => onContent({ options: options.map((item) => item.id === option.id ? { ...item, text: event.target.value } : item) })} /><button aria-label={`Delete option ${index + 1}`} disabled={options.length <= 2} onClick={() => onContent({ options: options.filter((item) => item.id !== option.id) })}>×</button></div>)}<button className="add-row" disabled={options.length >= 6} onClick={() => onContent({ options: [...options, { id: `o-${crypto.randomUUID().slice(0, 6)}`, text: `Option ${options.length + 1}` }] })}>＋ Add option</button></fieldset>;
}

function FillBlankEditor({ question, onChange }: { question: Question; onChange: (question: Question) => void }) {
  const template = String(question.content.template ?? ""); const markerIds = useMemo(() => [...new Set([...template.matchAll(/\[\[([A-Za-z0-9_-]+)\]\]/g)].map((match) => match[1]))], [template]); const rules = (question.answerKey?.blanks as BlankRule[]) ?? [];
  function changeTemplate(value: string) { const ids = [...new Set([...value.matchAll(/\[\[([A-Za-z0-9_-]+)\]\]/g)].map((match) => match[1]))]; const blanks = ids.map((id) => rules.find((rule) => rule.id === id) ?? { id, acceptedAnswers: [""], trim: true, caseSensitive: false, collapseWhitespace: true }); onChange({ ...question, content: { ...question.content, template: value }, answerKey: { ...question.answerKey, blanks } }); }
  return <div className="fill-editor"><label>Sentence template<textarea rows={3} value={template} onChange={(event) => changeTemplate(event.target.value)} /></label><p className="field-help">Mark blanks like <code>[[b1]]</code> or <code>[[animal]]</code>.</p>{markerIds.map((id) => { const rule = rules.find((item) => item.id === id) ?? { id, acceptedAnswers: [""], trim: true, caseSensitive: false, collapseWhitespace: true }; return <div className="blank-rule" key={id}><strong>[[{id}]]</strong><label>Accepted answers<input value={rule.acceptedAnswers.join(", ")} placeholder="milk, a glass of milk" onChange={(event) => { const next = { ...rule, acceptedAnswers: event.target.value.split(",").map((answer) => answer.trim()) }; onChange({ ...question, answerKey: { ...question.answerKey, blanks: rules.filter((item) => item.id !== id).concat(next) } }); }} /></label><label className="check-label"><input type="checkbox" checked={rule.caseSensitive} onChange={(event) => { const next = { ...rule, caseSensitive: event.target.checked }; onChange({ ...question, answerKey: { ...question.answerKey, blanks: rules.filter((item) => item.id !== id).concat(next) } }); }} /> Case sensitive</label></div>; })}</div>;
}

function ImageMatchEditor({ question, token, uploadingPair, onContent, onUpload }: { question: Question; token: string; uploadingPair: string; onContent: (patch: Record<string, unknown>) => void; onUpload: (pairId: string, file: File) => void }) {
  const pairs = (question.content.pairs as ImagePair[]) ?? []; const updatePair = (id: string, patch: Partial<ImagePair>) => onContent({ pairs: pairs.map((pair) => pair.id === id ? { ...pair, ...patch } : pair) });
  return <fieldset className="structured-fieldset"><legend>Image and label pairs</legend><div className="image-pair-grid">{pairs.map((pair, index) => <article className="image-pair-editor" key={pair.id}><div className="pair-number">Pair {index + 1}</div>{pair.imageAssetId ? <PrivateAssetImage assetId={pair.imageAssetId} token={token} alt={pair.altText || pair.label} /> : <label className={`image-drop-zone ${uploadingPair === pair.id ? "uploading" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) onUpload(pair.id, file); }}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(pair.id, file); event.target.value = ""; }} /><span>{uploadingPair === pair.id ? "Uploading…" : "Drop image here"}</span><small>or click · JPEG, PNG, WebP</small></label>}<label>Matching label<input value={pair.label} onChange={(event) => updatePair(pair.id, { label: event.target.value })} /></label><label>Image description<input value={pair.altText ?? ""} onChange={(event) => updatePair(pair.id, { altText: event.target.value })} /></label><div className="pair-actions">{pair.imageAssetId ? <label className="replace-image">Replace image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(pair.id, file); event.target.value = ""; }} /></label> : null}<button disabled={pairs.length <= 2} onClick={() => onContent({ pairs: pairs.filter((item) => item.id !== pair.id) })}>Delete pair</button></div></article>)}</div><button className="add-row" disabled={pairs.length >= 10} onClick={() => onContent({ pairs: [...pairs, { id: `p-${crypto.randomUUID().slice(0, 6)}`, label: "New label", altText: "" }] })}>＋ Add image pair</button></fieldset>;
}

function SentenceOrderEditor({ question, onChange }: { question: Question; onChange: (question: Question) => void }) {
  const blocks = (question.content.blocks as SentenceBlock[]) ?? []; const [dragged, setDragged] = useState<number | null>(null);
  function setBlocks(next: SentenceBlock[]) { onChange({ ...question, content: { ...question.content, blocks: next, sentence: next.map((block) => block.text).join(" ") }, answerKey: { ...question.answerKey, correctBlockIds: next.map((block) => block.id) } }); }
  function drop(target: number) { if (dragged === null || dragged === target) return; const next = [...blocks]; const [moved] = next.splice(dragged, 1); next.splice(target, 0, moved); setBlocks(next); setDragged(null); }
  return <fieldset className="structured-fieldset"><legend>Correct block order</legend><p className="field-help">Drag the handle to define the accepted sentence order.</p><div className="block-editor-list">{blocks.map((block, index) => <div key={block.id} className={dragged === index ? "dragging" : ""} onDragOver={(event) => event.preventDefault()} onDrop={() => drop(index)}><button className="mini-drag" draggable aria-label={`Drag block ${index + 1}`} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDragged(index); }} onDragEnd={() => setDragged(null)}>⠿</button><span>{index + 1}</span><input value={block.text} onChange={(event) => setBlocks(blocks.map((item) => item.id === block.id ? { ...item, text: event.target.value } : item))} /><button disabled={blocks.length <= 2} onClick={() => setBlocks(blocks.filter((item) => item.id !== block.id))}>×</button></div>)}</div><button className="add-row" onClick={() => setBlocks([...blocks, { id: `t-${crypto.randomUUID().slice(0, 6)}`, text: "new block" }])}>＋ Add block</button></fieldset>;
}

function ReadAloudEditor({ question, onContent }: { question: Question; onContent: (patch: Record<string, unknown>) => void }) {
  return <div className="read-aloud-editor"><label>Passage to read<textarea rows={5} value={String(question.content.passage ?? "")} onChange={(event) => onContent({ passage: event.target.value })} /></label><label>Maximum recording time (seconds)<input type="number" min="3" max="120" value={Number(question.content.maxDurationSeconds ?? 120)} onChange={(event) => onContent({ maxDurationSeconds: Number(event.target.value) })} /></label><div className="rubric-preview"><strong>Manual rubric</strong><span>Pronunciation 40%</span><span>Fluency 30%</span><span>Intonation 20%</span><span>Completeness 10%</span></div></div>;
}

function PrivateAssetImage({ assetId, token, alt }: { assetId: string; token: string; alt: string }) {
  const [source, setSource] = useState("");
  useEffect(() => { let objectUrl = ""; let active = true; void fetch(`${api}/exercise-assets/${assetId}/content`, { headers: { authorization: `Bearer ${token}` } }).then((response) => { if (!response.ok) throw new Error("Image unavailable"); return response.blob(); }).then((blob) => { if (active) { objectUrl = URL.createObjectURL(blob); setSource(objectUrl); } }).catch(() => undefined); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [assetId, token]);
  return source ? <Image unoptimized className="asset-preview" width={640} height={480} src={source} alt={alt} /> : <div className="image-drop-zone"><span>Loading image…</span></div>;
}
