"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type Session = { token: string };
type GradingStatus = "NEEDS_REVIEW" | "READY_TO_PUBLISH" | "PUBLISHED";
type Student = { id: string; name: string; studentCode?: string };
type Answer = { questionId: string; payload: Record<string, unknown> };
type Score = { questionId: string; points: number; maxPoints: number };
type Attempt = {
  _id: string;
  student: Student;
  attemptNumber: number;
  status: "IN_PROGRESS" | "SUBMITTED";
  gradingStatus?: GradingStatus;
  answers: Answer[];
  questionScores: Score[];
  autoPoints: number;
  manualPoints?: number;
  startedAt: string;
  submittedAt?: string;
};
type Question = {
  id: string;
  type:
    | "MULTIPLE_CHOICE"
    | "FILL_BLANK"
    | "IMAGE_MATCH"
    | "SENTENCE_ORDER"
    | "READ_ALOUD";
  points: number;
  prompt?: string;
  content: Record<string, unknown>;
  answerKey?: Record<string, unknown>;
  explanation?: string;
};
type AttemptList = {
  assignment: { id: string; title: string; deadlineAt: string };
  students: Student[];
  attempts: Attempt[];
};
type ReviewDetail = {
  attempt: Attempt;
  student: Student;
  assignment?: AttemptList["assignment"];
  version: { versionNumber: number; questions: Question[] };
};
type Filter =
  "ALL" | "NEEDS_REVIEW" | "READY_TO_PUBLISH" | "PUBLISHED" | "IN_PROGRESS";

const questionLabels: Record<Question["type"], string> = {
  MULTIPLE_CHOICE: "Multiple choice",
  FILL_BLANK: "Fill in the blank",
  IMAGE_MATCH: "Image matching",
  SENTENCE_ORDER: "Sentence order",
  READ_ALOUD: "Read aloud",
};

function formatDate(value?: string) {
  if (!value) return "Not submitted";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function objects(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function answerSummary(
  question: Question,
  payload: Record<string, unknown>,
): ReactNode {
  if (question.type === "MULTIPLE_CHOICE") {
    const selected = String(payload.selectedOptionId ?? "");
    const option = objects(question.content.options).find(
      (item) => String(item.id) === selected,
    );
    return String(option?.text ?? (selected || "No answer"));
  }
  if (question.type === "FILL_BLANK") {
    const blanks = record(payload.blanks);
    const entries = Object.entries(blanks);
    return entries.length
      ? entries.map(([key, value]) => `${key}: ${String(value)}`).join(" · ")
      : "No answer";
  }
  if (question.type === "IMAGE_MATCH") {
    const matches = record(payload.matches);
    const pairs = objects(question.content.pairs);
    return Object.entries(matches).length
      ? Object.entries(matches)
          .map(([imageId, labelId]) => {
            const image = pairs.find((pair) => String(pair.id) === imageId);
            const label = pairs.find(
              (pair) => String(pair.id) === String(labelId),
            );
            return `${String(image?.altText ?? image?.label ?? imageId)} → ${String(label?.label ?? labelId)}`;
          })
          .join(" · ")
      : "No answer";
  }
  if (question.type === "SENTENCE_ORDER") {
    const ids = Array.isArray(payload.selectedBlockIds)
      ? payload.selectedBlockIds.map(String)
      : [];
    const blocks = objects(question.content.blocks);
    return ids.length
      ? ids
          .map((id) =>
            String(blocks.find((block) => String(block.id) === id)?.text ?? id),
          )
          .join(" ")
      : "No answer";
  }
  return `Recording · ${Number(payload.durationSeconds ?? 0)} seconds`;
}

export default function ExerciseReviewPage() {
  const assignmentId = useParams<{ assignmentId: string }>().assignmentId;
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<AttemptList | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [manualPoints, setManualPoints] = useState("0");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const audioUrlsRef = useRef<Record<string, string>>({});

  const request = useCallback(
    async (path: string, token: string, init?: RequestInit) => {
      const response = await fetch(`${api}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          ...init?.headers,
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          Array.isArray(body.message)
            ? body.message.join(", ")
            : (body.message ?? "Request failed"),
        );
      return body;
    },
    [],
  );

  const openAttempt = useCallback(
    async (attemptId: string, active: Session) => {
      setBusy(true);
      setMessage("");
      try {
        const next = (await request(
          `/exercise-attempts/${attemptId}/review`,
          active.token,
        )) as ReviewDetail;
        setDetail(next);
        setManualPoints(String(next.attempt.manualPoints ?? 0));
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load this attempt",
        );
      } finally {
        setBusy(false);
      }
    },
    [request],
  );

  const load = useCallback(
    async (active: Session) => {
      setBusy(true);
      try {
        const next = (await request(
          `/assignments/${assignmentId}/exercise/attempts`,
          active.token,
        )) as AttemptList;
        setData(next);
        const first =
          next.attempts.find((attempt) => attempt.status === "SUBMITTED") ??
          next.attempts[0];
        if (first) await openAttempt(first._id, active);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load student attempts",
        );
      } finally {
        setBusy(false);
      }
    },
    [assignmentId, openAttempt, request],
  );

  useEffect(() => {
    const raw = sessionStorage.getItem("teacherSession");
    const timer = window.setTimeout(() => {
      if (!raw) {
        setMessage("Sign in through the teacher portal first.");
        return;
      }
      const active = JSON.parse(raw) as Session;
      setSession(active);
      void load(active);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    audioUrlsRef.current = audioUrls;
  }, [audioUrls]);

  useEffect(
    () => () => {
      Object.values(audioUrlsRef.current).forEach((url) =>
        URL.revokeObjectURL(url),
      );
    },
    [],
  );

  const filteredAttempts = useMemo(() => {
    if (!data) return [];
    if (filter === "ALL") return data.attempts;
    if (filter === "IN_PROGRESS")
      return data.attempts.filter(
        (attempt) => attempt.status === "IN_PROGRESS",
      );
    return data.attempts.filter((attempt) => attempt.gradingStatus === filter);
  }, [data, filter]);

  const missingStudents = useMemo(() => {
    if (!data) return [];
    const attempted = new Set(
      data.attempts.map((attempt) => attempt.student.id),
    );
    return data.students.filter((student) => !attempted.has(student.id));
  }, [data]);

  function updateAttempt(id: string, patch: Partial<Attempt>) {
    setData((current) =>
      current
        ? {
            ...current,
            attempts: current.attempts.map((attempt) =>
              attempt._id === id ? { ...attempt, ...patch } : attempt,
            ),
          }
        : current,
    );
    setDetail((current) =>
      current?.attempt._id === id
        ? { ...current, attempt: { ...current.attempt, ...patch } }
        : current,
    );
  }

  async function saveGrade() {
    if (!session || !detail) return;
    const points = Number(manualPoints);
    if (!Number.isFinite(points) || points < 0) {
      setMessage("Enter a valid manual score.");
      return;
    }
    setBusy(true);
    try {
      const updated = (await request(
        `/exercise-attempts/${detail.attempt._id}/grading`,
        session.token,
        {
          method: "PUT",
          body: JSON.stringify({ manualPoints: points }),
        },
      )) as Attempt;
      updateAttempt(detail.attempt._id, {
        manualPoints: updated.manualPoints,
        gradingStatus: updated.gradingStatus,
      });
      setMessage("Manual score saved. The result is ready to publish.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save the grade",
      );
    } finally {
      setBusy(false);
    }
  }

  async function publishResult() {
    if (
      !session ||
      !detail ||
      !window.confirm(`Publish this result to ${detail.student.name}?`)
    )
      return;
    setBusy(true);
    try {
      await request(
        `/exercise-attempts/${detail.attempt._id}/feedback/publish`,
        session.token,
        { method: "POST" },
      );
      updateAttempt(detail.attempt._id, { gradingStatus: "PUBLISHED" });
      setMessage("Result published to the student.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not publish the result",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadAudio(assetId: string) {
    if (!session || audioUrls[assetId]) return;
    setBusy(true);
    try {
      const response = await fetch(
        `${api}/exercise-assets/${assetId}/content`,
        {
          headers: { authorization: `Bearer ${session.token}` },
        },
      );
      if (!response.ok) throw new Error("Could not load the recording");
      const url = URL.createObjectURL(await response.blob());
      setAudioUrls((current) => ({ ...current, [assetId]: url }));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load the recording",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!data)
    return (
      <main className="exercise-review-shell">
        <Link href="/teacher">← Teacher portal</Link>
        <p>{busy ? "Loading submissions…" : message}</p>
      </main>
    );

  const submitted = data.attempts.filter(
    (attempt) => attempt.status === "SUBMITTED",
  ).length;
  const published = data.attempts.filter(
    (attempt) => attempt.gradingStatus === "PUBLISHED",
  ).length;
  const manualMaximum =
    detail?.version.questions
      .filter((question) => question.type === "READ_ALOUD")
      .reduce((sum, question) => sum + question.points, 0) ?? 0;
  const totalMaximum =
    detail?.version.questions.reduce(
      (sum, question) => sum + question.points,
      0,
    ) ?? 0;
  const totalScore =
    (detail?.attempt.autoPoints ?? 0) +
    Number(detail?.attempt.manualPoints ?? 0);

  return (
    <main className="exercise-review-shell">
      <header className="review-hero">
        <div>
          <Link href="/teacher">← Teacher portal</Link>
          <p className="kicker">Interactive assignment review</p>
          <h1>{data.assignment.title}</h1>
          <p>Due {formatDate(data.assignment.deadlineAt)}</p>
        </div>
        <div className="review-metrics">
          <span>
            <strong>{submitted}</strong>Submitted
          </span>
          <span>
            <strong>
              {
                data.attempts.filter(
                  (attempt) => attempt.gradingStatus === "NEEDS_REVIEW",
                ).length
              }
            </strong>
            Need grading
          </span>
          <span>
            <strong>{published}</strong>Published
          </span>
          <span>
            <strong>{missingStudents.length}</strong>Not started
          </span>
        </div>
      </header>
      {message ? <div className="notice">{message}</div> : null}
      <div className="review-workspace">
        <aside className="attempt-sidebar">
          <div className="attempt-filters">
            {(
              [
                "ALL",
                "NEEDS_REVIEW",
                "READY_TO_PUBLISH",
                "PUBLISHED",
                "IN_PROGRESS",
              ] as Filter[]
            ).map((item) => (
              <button
                className={filter === item ? "active" : ""}
                key={item}
                onClick={() => setFilter(item)}
              >
                {item.replaceAll("_", " ")}
              </button>
            ))}
          </div>
          <div className="attempt-list">
            {filteredAttempts.map((attempt) => (
              <button
                className={detail?.attempt._id === attempt._id ? "active" : ""}
                key={attempt._id}
                onClick={() =>
                  session && void openAttempt(attempt._id, session)
                }
              >
                <span className="student-avatar">
                  {attempt.student.name.slice(0, 1)}
                </span>
                <div>
                  <strong>{attempt.student.name}</strong>
                  <small>
                    {attempt.student.studentCode ??
                      `Attempt ${attempt.attemptNumber}`}{" "}
                    ·{" "}
                    {attempt.gradingStatus?.replaceAll("_", " ") ??
                      attempt.status.replaceAll("_", " ")}
                  </small>
                </div>
                <b>
                  {attempt.status === "SUBMITTED"
                    ? `${attempt.autoPoints + (attempt.manualPoints ?? 0)} pts`
                    : "Open"}
                </b>
              </button>
            ))}
          </div>
          {missingStudents.length > 0 ? (
            <details className="missing-students">
              <summary>
                {missingStudents.length} students have not started
              </summary>
              {missingStudents.map((student) => (
                <span key={student.id}>
                  {student.name}
                  <small>{student.studentCode}</small>
                </span>
              ))}
            </details>
          ) : null}
        </aside>
        <section className="attempt-detail">
          {!detail ? (
            <div className="empty-panel">
              <h2>No attempt selected</h2>
              <p>Select a student submission to review it.</p>
            </div>
          ) : (
            <>
              <div className="attempt-detail-head">
                <div>
                  <p className="kicker">
                    Attempt {detail.attempt.attemptNumber}
                  </p>
                  <h2>{detail.student.name}</h2>
                  <p>
                    {detail.student.studentCode} ·{" "}
                    {formatDate(detail.attempt.submittedAt)}
                  </p>
                </div>
                <div className="score-total">
                  <strong>{totalScore}</strong>
                  <span>/ {totalMaximum} points</span>
                </div>
              </div>
              {detail.attempt.status === "IN_PROGRESS" ? (
                <div className="notice">
                  This student is still working. Answers are visible, but
                  grading is locked until submission.
                </div>
              ) : null}
              <div className="answer-list">
                {detail.version.questions.map((question, index) => {
                  const answer =
                    detail.attempt.answers.find(
                      (item) => item.questionId === question.id,
                    )?.payload ?? {};
                  const score = detail.attempt.questionScores.find(
                    (item) => item.questionId === question.id,
                  );
                  const audioAssetId =
                    question.type === "READ_ALOUD"
                      ? String(answer.audioAssetId ?? "")
                      : "";
                  return (
                    <article key={question.id}>
                      <div className="answer-head">
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <small>{questionLabels[question.type]}</small>
                          <h3>{question.prompt || "Untitled question"}</h3>
                        </div>
                        <b>
                          {score
                            ? `${score.points}/${score.maxPoints}`
                            : `—/${question.points}`}
                        </b>
                      </div>
                      <div className="student-answer">
                        <small>Student answer</small>
                        <p>{answerSummary(question, answer)}</p>
                        {audioAssetId ? (
                          audioUrls[audioAssetId] ? (
                            <audio controls src={audioUrls[audioAssetId]} />
                          ) : (
                            <button
                              className="secondary"
                              onClick={() => void loadAudio(audioAssetId)}
                            >
                              Load recording
                            </button>
                          )
                        ) : null}
                      </div>
                      {question.answerKey && question.type !== "READ_ALOUD" ? (
                        <details>
                          <summary>Show answer key</summary>
                          <pre>
                            {JSON.stringify(question.answerKey, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                      {question.explanation ? (
                        <p className="answer-explanation">
                          {question.explanation}
                        </p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
              {detail.attempt.status === "SUBMITTED" ? (
                <div className="grading-panel">
                  <div>
                    <p className="kicker">Grade & publish</p>
                    <h3>
                      {manualMaximum
                        ? "Complete the manual score"
                        : "Automatic grading complete"}
                    </h3>
                    <p>
                      {manualMaximum
                        ? `Automatic questions: ${detail.attempt.autoPoints} points. Read-aloud maximum: ${manualMaximum} points.`
                        : `The system awarded ${detail.attempt.autoPoints} of ${totalMaximum} points.`}
                    </p>
                  </div>
                  {manualMaximum ? (
                    <label>
                      Manual points
                      <input
                        type="number"
                        min="0"
                        max={manualMaximum}
                        step="0.01"
                        value={manualPoints}
                        onChange={(event) =>
                          setManualPoints(event.target.value)
                        }
                      />
                      <span>/ {manualMaximum}</span>
                    </label>
                  ) : null}
                  <div>
                    {manualMaximum ? (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void saveGrade()}
                      >
                        Save grade
                      </button>
                    ) : null}
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        detail.attempt.gradingStatus === "NEEDS_REVIEW" ||
                        detail.attempt.gradingStatus === "PUBLISHED"
                      }
                      onClick={() => void publishResult()}
                    >
                      {detail.attempt.gradingStatus === "PUBLISHED"
                        ? "Published"
                        : "Publish result"}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
