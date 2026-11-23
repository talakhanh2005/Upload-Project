"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "/api";
type Question = { id: string; type: "MULTIPLE_CHOICE" | "FILL_BLANK" | "IMAGE_MATCH" | "SENTENCE_ORDER" | "READ_ALOUD"; order: number; points: number; prompt?: string; content: Record<string, unknown> };
type AttemptPayload = { version: { id: string; sections: Array<{ id: string; title: string }>; questions: Question[] }; attempt: { id: string; status: string; answers: Array<{ questionId: string; payload: Record<string, unknown> }>; presentation: Record<string, Record<string, string[]>>; revision: number; attemptNumber: number } };
type StudentSession = { token: string; studentName: string };

export default function ExercisePlayerPage() {
  const assignmentId = useParams<{ assignmentId: string }>().assignmentId;
  const [session, setSession] = useState<StudentSession | null>(null);
  const [data, setData] = useState<AttemptPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>({});
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [saveNonce, setSaveNonce] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const dirty = useRef(false);
  const saving = useRef(false);
  const answersRef = useRef(answers);
  const revisionRef = useRef(revision);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { revisionRef.current = revision; }, [revision]);

  const jsonRequest = useCallback(async (path: string, token: string, init?: RequestInit) => {
    const response = await fetch(`${api}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...init?.headers } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(", ") : body.message ?? "Request failed");
    return body;
  }, []);
  useEffect(() => {
    const raw = sessionStorage.getItem("studentSession");
    const timer = window.setTimeout(() => {
      if (!raw) { setMessage("Your student session has expired. Sign in again."); return; }
      const active = JSON.parse(raw) as StudentSession; setSession(active);
      void jsonRequest(`/assignments/${assignmentId}/exercise/attempts`, active.token, { method: "POST" }).then((payload: AttemptPayload) => {
        setData(payload); setRevision(payload.attempt.revision); setAnswers(Object.fromEntries(payload.attempt.answers.map((answer) => [answer.questionId, answer.payload]))); setSubmitted(payload.attempt.status === "SUBMITTED");
      }).catch((error) => setMessage(error instanceof Error ? error.message : "Could not open exercise"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [assignmentId, jsonRequest]);

  const save = useCallback(async () => {
    if (!session || !data || !dirty.current || submitted || saving.current) return;
    saving.current = true;
    const snapshot = JSON.stringify(answersRef.current);
    let retry = false;
    setSaveState("saving");
    try {
      const result = await jsonRequest(`/exercise-attempts/${data.attempt.id}/answers`, session.token, { method: "PATCH", body: JSON.stringify({ expectedRevision: revisionRef.current, answers: Object.entries(answersRef.current).map(([questionId, payload]) => ({ questionId, payload })) }) }) as { revision: number };
      setRevision(result.revision); revisionRef.current = result.revision;
      const unchanged = snapshot === JSON.stringify(answersRef.current); dirty.current = !unchanged; retry = !unchanged; setSaveState(unchanged ? "saved" : "unsaved");
    } catch (error) { setSaveState("unsaved"); setMessage(error instanceof Error ? error.message : "Autosave failed"); }
    finally { saving.current = false; if (retry) setSaveNonce((value) => value + 1); }
  }, [data, jsonRequest, session, submitted]);
  useEffect(() => { if (!dirty.current) return; const timer = window.setTimeout(() => void save(), 1000); return () => window.clearTimeout(timer); }, [answers, save, saveNonce]);

  function answer(questionId: string, payload: Record<string, unknown>) { dirty.current = true; setSaveState("unsaved"); setAnswers((current) => ({ ...current, [questionId]: payload })); }
  async function submit() {
    if (!session || !data || !window.confirm("Submit this attempt? You cannot change it afterwards.")) return;
    await save();
    try { const result = await jsonRequest(`/exercise-attempts/${data.attempt.id}/submit`, session.token, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } }) as { gradingStatus: string }; setSubmitted(true); setMessage(result.gradingStatus === "NEEDS_REVIEW" ? "Submitted. Your teacher will review the voice question." : "Submitted. Your result will appear after your teacher publishes it."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Submit failed"); }
  }
  async function uploadAudio(questionId: string, blob: Blob, durationSeconds: number) {
    if (!session || !data) return;
    await save();
    const form = new FormData(); form.append("questionId", questionId); form.append("durationSeconds", String(durationSeconds)); form.append("file", blob, blob.type.includes("mp4") ? "recording.m4a" : "recording.webm");
    const response = await fetch(`${api}/exercise-attempts/${data.attempt.id}/audio`, { method: "POST", headers: { authorization: `Bearer ${session.token}` }, body: form });
    const result = await response.json(); if (!response.ok) throw new Error(result.message ?? "Audio upload failed");
    const payload = { audioAssetId: result.assetId, durationSeconds }; setAnswers((current) => ({ ...current, [questionId]: payload })); answersRef.current = { ...answersRef.current, [questionId]: payload }; dirty.current = false; setRevision(result.revision); revisionRef.current = result.revision; setSaveState("saved");
  }

  if (!data) return <main className="exercise-player"><Link href="/">← Courses</Link><div className="loading-block">{message || "Opening exercise…"}</div></main>;
  const completed = data.version.questions.filter((question) => answers[question.id] && Object.keys(answers[question.id]).length).length;
  return <main className="exercise-player">
    <header className="player-header"><div><Link href="/">← Courses</Link><p className="kicker">Interactive exercise · attempt {data.attempt.attemptNumber}</p><h1>Complete each activity</h1></div><div className={`save-state ${saveState}`}>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : "Not saved"}</div></header>
    <div className="progress-line"><span style={{ width: `${data.version.questions.length ? completed / data.version.questions.length * 100 : 0}%` }} /></div>
    {message && <div className="notice">{message}</div>}
    <section className="player-questions">{data.version.questions.sort((a, b) => a.order - b.order).map((question, index) => <QuestionCard key={question.id} token={session?.token ?? ""} question={question} number={index + 1} answer={answers[question.id] ?? {}} presentation={data.attempt.presentation[question.id] ?? {}} disabled={submitted} onAnswer={(payload) => answer(question.id, payload)} onAudio={(blob, duration) => uploadAudio(question.id, blob, duration)} />)}</section>
    <footer className="submit-bar"><div><strong>{completed}/{data.version.questions.length} answered</strong><span>{completed < data.version.questions.length ? "You may submit with unanswered questions." : "Ready to submit."}</span></div><button className="primary" disabled={submitted || saveState === "saving"} onClick={() => void submit()}>{submitted ? "Submitted" : "Submit exercise →"}</button></footer>
  </main>;
}

function QuestionCard({ question, number, token, answer, presentation, disabled, onAnswer, onAudio }: { question: Question; number: number; token: string; answer: Record<string, unknown>; presentation: Record<string, string[]>; disabled: boolean; onAnswer: (payload: Record<string, unknown>) => void; onAudio: (blob: Blob, duration: number) => Promise<void> }) {
  const content = question.content;
  return <article className="player-card"><header><span>{String(number).padStart(2, "0")}</span><div><small>{question.type.replaceAll("_", " ")} · {question.points} point{question.points === 1 ? "" : "s"}</small><h2>{question.prompt || "Complete this activity"}</h2></div></header>
    {question.type === "MULTIPLE_CHOICE" && <div className="choice-list">{ordered(content.options as Array<{ id: string; text: string }>, presentation.optionIds).map((option) => <label key={option.id} className={answer.selectedOptionId === option.id ? "selected" : ""}><input disabled={disabled} type="radio" checked={answer.selectedOptionId === option.id} onChange={() => onAnswer({ selectedOptionId: option.id })} />{option.text}</label>)}</div>}
    {question.type === "FILL_BLANK" && <FillBlank template={String(content.template ?? "")} values={(answer.blanks as Record<string, string>) ?? {}} disabled={disabled} onChange={(blanks) => onAnswer({ blanks })} />}
    {question.type === "IMAGE_MATCH" && <div className="match-grid">{ordered(content.images as Array<{ id: string; imageAssetId?: string; imageKey?: string; altText?: string }>, presentation.imageIds).map((image) => <div key={image.id} className="match-item">{image.imageAssetId ? <PrivateImage assetId={image.imageAssetId} alt={image.altText || image.imageKey || image.id} token={token} /> : <div className="image-placeholder"><span>IMAGE</span><small>{image.altText || image.imageKey || image.id}</small></div>}<select disabled={disabled} value={((answer.matches as Record<string, string>) ?? {})[image.id] ?? ""} onChange={(event) => onAnswer({ matches: { ...((answer.matches as Record<string, string>) ?? {}), [image.id]: event.target.value } })}><option value="">Choose a label…</option>{ordered(content.labels as Array<{ id: string; text: string }>, presentation.labelIds).map((label) => <option key={label.id} value={label.id}>{label.text}</option>)}</select></div>)}</div>}
    {question.type === "SENTENCE_ORDER" && <OrderBlocks blocks={content.blocks as Array<{ id: string; text: string }>} order={presentation.blockIds ?? []} selected={(answer.selectedBlockIds as string[]) ?? []} disabled={disabled} onChange={(selectedBlockIds) => onAnswer({ selectedBlockIds })} />}
    {question.type === "READ_ALOUD" && <VoiceRecorder passage={String(content.passage ?? "")} maxSeconds={Number(content.maxDurationSeconds ?? 120)} uploaded={Boolean(answer.audioAssetId)} disabled={disabled} onUpload={onAudio} />}
  </article>;
}
function ordered<T extends { id: string }>(items: T[] = [], ids: string[] = []) { const map = new Map(items.map((item) => [item.id, item])); return ids.map((id) => map.get(id)).filter((item): item is T => Boolean(item)).concat(items.filter((item) => !ids.includes(item.id))); }
function PrivateImage({ assetId, alt, token }: { assetId: string; alt: string; token: string }) { const [source, setSource] = useState(""); useEffect(() => { let objectUrl = ""; let active = true; void fetch(`${api}/exercise-assets/${assetId}/content`, { headers: { authorization: `Bearer ${token}` } }).then((response) => { if (!response.ok) throw new Error(); return response.blob(); }).then((blob) => { if (active) { objectUrl = URL.createObjectURL(blob); setSource(objectUrl); } }).catch(() => undefined); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [assetId, token]); return source ? <Image unoptimized width={640} height={480} className="private-exercise-image" src={source} alt={alt} /> : <div className="image-placeholder"><span>LOADING IMAGE</span><small>{alt}</small></div>; }
function FillBlank({ template, values, disabled, onChange }: { template: string; values: Record<string, string>; disabled: boolean; onChange: (values: Record<string, string>) => void }) { return <div className="fill-sentence">{template.split(/(\[\[[A-Za-z0-9_-]+\]\])/g).map((part, index) => { const match = part.match(/^\[\[([A-Za-z0-9_-]+)\]\]$/); return match ? <input key={`${match[1]}-${index}`} disabled={disabled} aria-label={`Blank ${match[1]}`} value={values[match[1]] ?? ""} onChange={(event) => onChange({ ...values, [match[1]]: event.target.value })} /> : <span key={index}>{part}</span>; })}</div>; }
function OrderBlocks({ blocks, order, selected, disabled, onChange }: { blocks: Array<{ id: string; text: string }>; order: string[]; selected: string[]; disabled: boolean; onChange: (ids: string[]) => void }) { const byId = new Map(blocks.map((block) => [block.id, block])); const available = order.filter((id) => !selected.includes(id)); return <div className="order-area"><div className="sentence-tray">{selected.map((id) => <button disabled={disabled} key={id} onClick={() => onChange(selected.filter((item) => item !== id))}>{byId.get(id)?.text}</button>)}</div><div className="block-bank">{available.map((id) => <button disabled={disabled} key={id} onClick={() => onChange([...selected, id])}>{byId.get(id)?.text}</button>)}<button disabled={disabled || !selected.length} className="quiet-button" onClick={() => onChange([])}>Reset</button></div></div>; }

function VoiceRecorder({ passage, maxSeconds, uploaded, disabled, onUpload }: { passage: string; maxSeconds: number; uploaded: boolean; disabled: boolean; onUpload: (blob: Blob, duration: number) => Promise<void> }) {
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null); const [blob, setBlob] = useState<Blob | null>(null); const [url, setUrl] = useState(""); const [duration, setDuration] = useState(0); const [message, setMessage] = useState(""); const [uploading, setUploading] = useState(false);
  async function start() { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((value) => MediaRecorder.isTypeSupported(value)); const next = new MediaRecorder(stream, type ? { mimeType: type } : undefined); const chunks: BlobPart[] = []; const started = Date.now(); next.ondataavailable = (event) => event.data.size && chunks.push(event.data); next.onstop = () => { const seconds = (Date.now() - started) / 1000; const recorded = new Blob(chunks, { type: next.mimeType }); setBlob(recorded); setDuration(seconds); setUrl(URL.createObjectURL(recorded)); stream.getTracks().forEach((track) => track.stop()); }; setRecorder(next); setBlob(null); setMessage(""); next.start(); window.setTimeout(() => { if (next.state === "recording") next.stop(); }, maxSeconds * 1000); } catch { setMessage("Microphone permission is required. Check browser settings and try again."); } }
  function stop() { if (recorder?.state === "recording") recorder.stop(); setRecorder(null); }
  async function confirm() { if (!blob) return; if (duration < 3) { setMessage("Please record at least 3 seconds."); return; } setUploading(true); try { await onUpload(blob, duration); setMessage("Recording uploaded securely."); } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed"); } finally { setUploading(false); } }
  return <div className="voice-box"><blockquote>{passage}</blockquote>{url && <audio controls src={url} />}{message && <p>{message}</p>}<div>{recorder ? <button disabled={disabled} onClick={stop}>■ Stop</button> : <button disabled={disabled} onClick={() => void start()}>● {blob ? "Record again" : "Record"}</button>}{blob && <button disabled={disabled || uploading} onClick={() => void confirm()}>{uploading ? "Uploading…" : uploaded ? "Replace recording" : "Confirm recording"}</button>}</div></div>;
}
