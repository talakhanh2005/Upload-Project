# System Analysis — Course & Assignment Submission Platform

**Version:** 0.2 — Business Analysis Draft (November 4, 2026)  
**Source:** Project owner's responses to the 85-question requirements survey  
**Status:** Draft — Student access without a PIN, Google Drive as primary storage, and read-only Parent access have been confirmed. Remaining open decisions are listed in Section 18.

## 1. Project Summary

A web application that allows teachers to organize multiple courses and create assignments with submission deadlines and attached instructions. Students access the platform in a browser, select a course, identify themselves using a student code, and submit up to 25 files per assignment. Teachers can view submissions, mark them as reviewed, optionally provide feedback, and publish that feedback manually. Email notifications are supported. The initial deployment serves **one teacher and one student**, but data boundaries and authorization rules should allow future expansion to multiple teachers and organizations.

**Priorities:** Streamlined submissions, image optimization before upload, controlled access, and manageable storage costs. A full learning management system (LMS) and grading suite are out of scope for the MVP.

## 2. Scope

### 2.1 MVP (P0)
- Teacher/Admin login; teachers create, edit, end, and archive courses.
- Teacher/Admin create and manage student profiles, issue student codes, and enroll students in courses.
- Students select a course and enter a **unique student code, without a PIN, password, or account registration**; the backend issues a session scoped to that student's data in the selected course.
- Teachers create, edit, lock, and unlock assignments, define deadlines, and attach assignment documents.
- Students browse assignments, upload multiple files with progress indicators, submit work, make late submissions, undo/resubmit, and view their own submissions.
- Teachers see submitted/late/missing statuses, search submissions, preview images/PDF/TXT, download other formats, and mark work as reviewed.
- Teachers can write optional feedback, save drafts, and publish feedback for students to see.
- Email notifications to teachers for new submissions; notifications for new assignments only when a recipient email address exists.
- Private files, upload limits, file/content validation, malware scanning, and basic audit logs.
- Desktop-first interface, with enough mobile responsiveness for students to photograph and upload homework.

### 2.2 P1 (After MVP)
- Bulk ZIP downloads, more detailed admin dashboards, course-teacher assignment history, advanced notification retries/queues, multi-teacher support, and optional expanded Parent portal.
- Storage usage tracking, quotas, retention policies, and limited recovery mechanisms.

### 2.3 Out of Scope
- Numerical grading and rubrics; returning teacher-edited files; live streaming/chat; mandatory academic years or semesters; storage platforms other than Google Drive (except as a contingency option).

## 3. Actors and Access Model

| Actor | Purpose | Notes |
|---|---|---|
| Admin | Manage users, view audit logs, administer the system | **Scope remains unresolved:** system-wide management or only self-created content. |
| Teacher | Create courses and assignments, manage students, review submissions and feedback | Operates only on authorized courses; cannot edit another teacher's course. |
| Student | Select courses, view assignments, and submit personal work | Cannot see other students' submissions. The survey permits viewing a course roster. |
| Parent | View linked students' courses, assignments, and submissions | Read-only: cannot create, edit, delete, submit, or review. Requires separate authentication and a verified parent–student relationship. |

**MVP decision:** A student enters only a student code, with **no PIN, OTP, or password**, to minimize friction in one-on-one lessons. This is a convenience identifier, **not strong authentication**: anyone who knows or guesses the code may impersonate the student. Mitigations include randomly generated, hard-to-guess codes (not sequential IDs), attempt rate limiting, short-lived sessions, access logs, not exposing codes in public pages, no direct Google Drive links, and backend authorization scoped to the course and student ID. Parents, teachers, and admins use separate login methods. Student authentication must be strengthened before broader commercial deployment.

## 4. Business Model

- A Teacher manages 0..N Courses; each Course has one owner and 0..N enrolled Students.
- A Student belongs to 0..N Courses.
- A Course contains 0..N Assignments.
- An Assignment contains 0..N Submissions, with at most one current submission per student.
- A Submission contains 0..25 current Attachments; previous attachments are deleted after a successful resubmission.
- A Submission has 0..1 current feedback record; students see feedback only when `PUBLISHED`.
- File metadata lives in MongoDB; file content lives in the **system owner's Google Drive**, in private folders managed by the backend.

## 5. Course

**Proposed fields:** `id`, `code` (automatically generated and unique), `name`, `description`, `teacherId`, `classLabel?`, `subject?`, `year?`, `semester?`, `startsAt?`, `endsAt?`, `status`, `archivedAt?`, `createdAt`, `updatedAt`.

Although the survey does not require academic-year/semester organization, these fields can remain **optional** without adding dedicated academic-year workflows.

**Primary statuses:** `DRAFT`, `ACTIVE`, `ENDED`. `archivedAt` is independent of `status` to support archival. In `ENDED`, students have read-only access and cannot submit or modify work; teachers can still view/download submissions. Reopening a course remains an open decision.

## 6. Assignment

**Fields:** `id`, `courseId`, `title`, `description?`, `instructions?`, `opensAt?`, `deadlineAt`, `closesAt?`, `isManuallyLocked`, `allowedMimeTypes`, `maxFileCount=25`, `maxFileBytes=25MB`, `maxTotalBytes` (recommend explicitly choosing `<=100MB` instead of `<100MB`), `createdBy`, and timestamps.

- Submissions are accepted after the deadline and labeled **LATE** when their submission timestamp is after `deadlineAt`.
- `isManuallyLocked=true` always prevents creating, editing, or submitting work, even where late submissions would otherwise be allowed.
- When `opensAt` is set, early submissions are blocked. `closesAt` is a hard cutoff, separate from the deadline; whether this field is required is not yet decided.
- Teachers can attach assignment resources, viewable by authorized enrolled students.

## 7. Submission Lifecycle

```text
NOT_SUBMITTED
  -> UPLOADING (temporary frontend/server staging state)
  -> SUBMITTED (submittedAt <= deadlineAt)
  -> LATE (submittedAt > deadlineAt)
  -> REVIEWED (independent flag set by Teacher)
  -> FEEDBACK_DRAFT -> FEEDBACK_PUBLISHED (separate lifecycle)
```

**Separate state dimensions:** `submissionStatus` = `SUBMITTED|LATE`; `reviewedAt` is stored independently; `feedbackStatus` = `NONE|DRAFT|PUBLISHED`; `NOT_SUBMITTED` is derived from the absence of a submission.

**Resubmission:** Upload replacement files to staging. Only after every file passes validation and the student confirms submission should the current record be safely updated; then schedule old files for deletion. **Never delete the original submission before its replacement is confirmed**, to avoid data loss if uploads fail. A resubmission after the deadline is considered LATE based on its new `submittedAt`; this rule still requires confirmation.

**Late submissions:** Allowed after the deadline while the assignment is not manually locked and the course remains `ACTIVE`. Resubmission after the deadline is also allowed.

## 8. File Upload — Constraints

| Rule | Survey requirement / recommendation |
|---|---|
| Maximum files per submission | 25 |
| Maximum size per file | 25 MB |
| Total submission size | 100 MB limit (confirm `<` vs. `<=`) |
| Accepted formats | PNG/JPEG/WebP/HEIC (images), PDF, TXT, DOC/DOCX, PPT/PPTX, XLS/XLSX; finalize an explicit allowlist |
| Blocked formats | EXE, scripts, executables, mismatched MIME types, malicious files |
| In-browser preview | Images, PDF, TXT |
| DOC/XLS/PPT files | Download only |
| Privacy | Private Google Drive folders; the backend authorizes and proxies/streams files, without exposing public Drive sharing links |
| Resubmission | Replace current files; delete previous files after successful commit/confirmation |

**Image compression (recommended):** The browser processes the selected image, corrects EXIF orientation, resizes the long edge to roughly 1,600–2,200 pixels for photographed homework, and exports WebP or JPEG at quality 0.75–0.85. Provide a **keep original** option if small handwriting becomes hard to read. Allow preview and legibility checks before submission. Compress raster images only; do not arbitrarily recompress PDF/DOCX files. Never delete the student's original local file.

**Google Drive upload flow for MVP:**
1. The student selects a course and enters their student code; the backend validates enrollment and issues a short-lived scoped session.
2. The frontend compresses images (with preview and the option to keep the original), and validates file count and sizes.
3. The frontend sends multipart files to **NestJS**. The backend validates the session, course, assignment, filename, file type, and size, then stages the uploads safely.
4. The backend checks the actual file format and scans for malware (files cannot be accessed before scanning finishes), then uses the **Google Drive API resumable upload** to send files into private Course/Assignment folders.
5. The backend receives `driveFileId`, verifies that all files arrived, and commits the submission and metadata in MongoDB. Only after a successful commit does it schedule the previous files for deletion. For multi-file uploads, provide rollback/cleanup for partial failures.
6. Teachers, students, and parents view/download files through backend endpoints enforcing authorization; the backend may stream files from Drive without exposing OAuth tokens or granting users direct Drive permissions.

**Architecture note:** The Google Drive API **does not offer S3/R2-style presigned PUT URLs** for direct browser uploads. The MVP therefore uses browser → NestJS → Google Drive, with configurable concurrency limits to avoid API rate limits and excessive memory usage (stream files rather than buffering large payloads). Use OAuth 2.0 credentials belonging to the Drive owner, securely stored server-side. Verify current OAuth policies, API quotas, and permissions before deployment. Google Drive must not be treated as unlimited object storage; monitor storage consumption and quota. Rate limiting reduces abuse but does not replace load management and queueing.

## 9. Teacher Review and Feedback

Teachers see student name, submission status and timestamp, file count, and file sizes. Filters include `SUBMITTED/LATE/MISSING/REVIEWED`, with name search. The `Score` column is removed from the MVP UI because numerical grading is out of scope. Opening a submission allows image/PDF/TXT previews, other file downloads, and marking it `Reviewed`. Teachers may write feedback, save it as `DRAFT`, and choose **Publish** to make it visible to the student. Returning edited files is not supported.

## 10. Email Notifications

- On a new submission or resubmission, email the Teacher.
- For new assignments, the survey requests emailing Students, **but student records currently require only a code and no email address**. Send emails only if a student or parent email address has been collected with appropriate consent; otherwise show new assignments on the website rather than promising undeliverable email.
- Retry SMTP failures, track delivery status, and prevent duplicate emails on resubmission or worker retries.
- Never email private file contents or uncontrolled download URLs.

## 11. Permission Matrix (Draft)

| Action | Admin | Teacher (owner) | Enrolled Student | Parent |
|---|---|---|---|---|
| Manage users | Yes | Manage assigned students | No | No |
| Create/edit Course | Scope TBD | Yes | No | No |
| View active Course | Within granted scope | Yes | Yes | Linked student's courses only |
| Create Assignment | TBD | Yes | No | No |
| View assignment resources | Within granted scope | Yes | Yes | Linked student's courses only |
| Submit/resubmit | No | No | Own submissions only | No |
| View other users' submissions | Within granted scope | Owned courses only | No | Linked child's submissions only |
| Review/publish feedback | TBD | Yes | No | No |
| View audit logs | Yes | TBD | No | No |
| View published feedback | Within granted scope | Yes | Own feedback only | Linked child's feedback only |

**System requirement:** Enforce authorization on the backend at the object level (Course/Assignment/Submission); do not rely solely on frontend routes or guessable IDs.

## 12. Proposed Architecture and Technology Stack

```text
Next.js / React browser (student, teacher, parent)
          | HTTPS / multipart (compressed images)
          v
NestJS REST API -- server-side OAuth2 credentials --> Google Drive API
          |                                       \-- private folders and files
          +--> MongoDB (courses, students, parent links, assignments,
          |             submissions, driveFileIds, audit logs)
          +--> Email provider
          +--> Redis/BullMQ (optional: scanning, cleanup, email jobs)
          +--> Temporary/quarantine storage for file validation
```

**Recommendation:** Next.js + TypeScript + Tailwind; NestJS + Mongoose + MongoDB; **Google Drive as primary file storage**, as requested by the owner. Add Redis/BullMQ only when asynchronous scanning, cleanup, or email jobs justify it. A queue does not replace the transfer of file bytes to Drive. A NestJS monolith is sufficient for the one-teacher, one-student MVP. Google Drive is convenient for manual inspection, but avoid renaming, moving, or deleting app-managed files directly in Drive because the backend tracks them by Drive File ID.

**Drive integration:** Use OAuth 2.0 for the owner's Google account with access to the storage folders; encrypt and protect refresh tokens, and do not configure `anyone` link sharing. Organize private folders as Course → Assignment → Student for convenient inspection. Store `driveFileId` as a durable reference instead of relying on folder name paths. Account for quotas, OAuth consent, token lifecycle, folder access, and upload limits. A storage adapter can support later migration to R2/S3 if the product grows.

## 13. MongoDB Collections (Logical Schema)

- `users`: `_id`, `role`, `name`, `email?`, `credentialHash?`, `studentCode?`, `status`, timestamps. Consider a separate `students` collection if students are not conventional authenticated principals.
- `courses`: Fields described in Section 5.
- `enrollments`: `courseId`, `studentId`, `joinedAt`, `status`; unique compound key `(courseId,studentId)`.
- `assignments`: Fields described in Section 6.
- `assignment_files`: `assignmentId`, `driveFileId`, `filename`, `mime`, `sizeBytes`, `scanStatus`.
- `submissions`: `assignmentId`, `studentId`, `submittedAt`, `reviewedAt?`, `feedbackText?`, `feedbackStatus`, `feedbackPublishedAt?`, `status`, timestamps; unique `(assignmentId,studentId)`.
- `submission_files`: `submissionId`, `driveFileId`, `driveParentFolderId`, `filename`, `sizeBytes`, `mime`, `scanStatus`, timestamps.
- `upload_sessions`: `studentId`, `assignmentId`, `tempFileRefs`, `driveFileIdsUploaded`, `expiresAt`, `status`, with a TTL index.
- `notification_jobs` / `email_logs`: event ID, recipient, status, retry count.
- `audit_logs`: actor, action, target, metadata (excluding secrets), IP/correlation ID, `createdAt`.
- `parent_student_links`: `parentUserId`, `studentId`, `createdBy`, `status`; unique `(parentUserId,studentId)`. Parents can only access explicitly linked students.
- `course_teacher_history` (P1): `courseId`, `teacherId`, `fromAt`, `toAt`.

**Key indexes:** unique `course.code`; unique `users.studentCode` in the applicable namespace; `assignments(courseId,deadlineAt)`; unique `submissions(assignmentId,studentId)`; unique `enrollments(courseId,studentId)`; `audit_logs(createdAt)`.

## 14. Preliminary API Specification

| Method | Route | Purpose |
|---|---|---|
| POST | `/auth/teacher/login` | Teacher/Admin login |
| POST | `/auth/student/access` | Enter student code and course; issue a scoped session (no PIN) |
| POST | `/auth/parent/login` | Parent login, separate from student code access |
| GET | `/parent/students/:studentId/courses` | View courses of an explicitly linked student |
| GET | `/parent/students/:studentId/submissions` | View submissions of an explicitly linked student |
| GET/POST | `/courses` | List/create courses |
| GET/PATCH | `/courses/:courseId` | Retrieve/update a course |
| POST | `/courses/:courseId/enrollments` | Enroll a student |
| GET/POST | `/courses/:courseId/assignments` | List/create assignments |
| PATCH | `/assignments/:assignmentId` | Edit/lock/unlock an assignment |
| GET | `/assignments/:assignmentId/submissions` | Teacher's submission list |
| GET | `/assignments/:assignmentId/my-submission` | Student views their own work |
| POST | `/uploads` | Multipart upload, validation/scanning, and transfer to Google Drive |
| POST | `/assignments/:assignmentId/submissions/commit` | Confirm submission/resubmission |
| POST | `/submissions/:submissionId/review` | Mark as reviewed |
| PUT | `/submissions/:submissionId/feedback` | Save feedback draft |
| POST | `/submissions/:submissionId/feedback/publish` | Publish feedback |
| GET | `/files/:fileId/content` | Authorize and stream file content from Google Drive |
| GET | `/admin/audit-logs` | View audit logs |

Note: This API is a draft contract; DTOs, error formats, pagination, and detailed OpenAPI documentation are not yet defined.

## 15. Non-Functional Requirements

- **Performance:** Optimize for 1–50 concurrent users; use backend streaming and configurable upload concurrency; limit parallel multipart uploads.
- **Security:** HTTPS, RBAC/ownership enforcement, student-scoped access, private Drive folders, malware scanning before download, filename sanitization, content-based MIME validation, CSP, CORS allowlist, CSRF protection as appropriate for sessions, rate limiting, and audit logs.
- **Consistency:** Idempotent upload/commit operations, TTL for temporary objects, eventual cleanup of replaced files, and no submission-success response before database commit succeeds.
- **Availability/recovery:** Back up the database, test recovery procedures, do not physically delete files too early during updates, and define a backup policy within the budget.
- **Privacy:** Minimize children's personal data, manage parental consent when required, avoid publicly visible submissions, and do not expose student rosters publicly.
- **Accessibility:** Support mobile file pickers, legible image previews, and clear error messages.

## 16. Deployment Plan (Provider Selection Pending)

**Simple deployment option:** Next.js on Vercel; containerized NestJS on a VPS, Render, or Railway; MongoDB Atlas; **Google Drive API with server-side OAuth 2.0**; managed Redis if BullMQ is used; and a transactional SMTP provider. Use a custom domain, provider-managed environment secrets, narrowly scoped CORS settings, private Drive folders, and GitHub Actions CI/CD. This is a recommendation, not a finalized vendor decision or price quote.

**Local development:** Docker Compose with MongoDB, optional Redis, and Mailpit; use a dedicated Google Drive test folder or mocked Drive API to test uploads and retry behavior.

## 17. Sample Acceptance Criteria

- **AC-01:** A Teacher creates a Course; the system generates a unique code and stores the course as `DRAFT`.
- **AC-02:** A Student who is not enrolled in a Course cannot access its Assignment files or Submissions.
- **AC-03:** An eligible Student can upload 1–25 files, each up to 25 MB and within the total size limit; oversized files are rejected with clear errors.
- **AC-04:** A submission after the deadline, when not locked, displays `LATE` and an accurate timestamp using the application timezone.
- **AC-05:** After a successful replacement, Student and Teacher see only new files; old files are scheduled for deletion. If replacement fails, the original submission remains intact.
- **AC-06:** Teachers can view/download work only for their own courses; Students can view only their own work.
- **AC-07:** Files that are unscanned or marked unsafe cannot be downloaded.
- **AC-08:** Draft feedback is invisible to students until the Teacher publishes it.
- **AC-09:** An `ENDED` Course remains viewable to Students but accepts no further submissions.
- **AC-10:** An email delivery failure does not invalidate a successful submission; retry status and logs are available.

## 18. Decisions to Finalize Before Development

1. **Confirmed:** Students use only a student code, without a PIN. The one-on-one MVP accepts impersonation risk; enforce rate limits, sessions, and hard-to-guess codes, and strengthen authentication before scaling.
2. **Admin:** Is management system-wide, or restricted to content created by that admin? Survey response #10 is ambiguous.
3. **Parent:** Read-only access to a linked child's courses and submissions is confirmed. Still define parent account provisioning, linking, and whether published feedback is shown (recommended: yes).
4. **New-assignment emails:** With code-only student access, should notifications go to students, parents, or only teachers?
5. **Course attributes:** Survey response #6 rejects academic-year grouping, but #16 includes Year/Semester fields. Recommendation: make them optional.
6. **100 MB rule:** Choose `<100 MB` or `<=100 MB`; 25 × 25 MB is constrained by the overall limit.
7. **Late resubmission:** Use the original submission time or the replacement time to determine `LATE`? Recommendation: replacement time.
8. **Undo/resubmit:** Is confirmation required before deleting old files, and should a short recovery period be supported?
9. **Grading:** Numerical grading is excluded (#46), but a Score column (#39) and Graded dashboard item (#66) were requested. Recommendation: omit both from the MVP.
10. **Assignment `opensAt` / `closesAt`:** Are all three timestamps (opening, deadline, hard close) needed? Only the deadline is explicitly required.
11. **Malware scanning:** Decide between synchronous scanning and queued quarantine, including how suspicious files are handled.
12. **Confirmed for Google Drive:** Browser → NestJS streaming → Google Drive API; no S3-style presigned URL.
13. **Confirmed:** Google Drive is the primary MVP storage. Still verify owner Google account, available storage, OAuth permissions, and backup approach.
14. **Permanent Assignment deletion:** Is irreversible deletion acceptable? Recommendation: soft-delete and delayed file cleanup to mitigate accidental deletion.
15. **File types:** Are HEIC, ZIP, and legacy XLS allowed? Finalize the allowlist.
16. **Teacher accounts:** Does Admin create teachers or can they self-register? Can one person hold both Admin and Teacher privileges during MVP?

## 19. Recommended Development Sequence

1. Scaffold the project; implement Teacher/Admin/Parent login, code-only Student access with scoped sessions, and database schemas/indexes.
2. Implement Course, enrollment, Assignment, and assignment-resource management.
3. Implement multipart streaming via NestJS → Google Drive API, image compression, staging, commit, deletion, and scanning.
4. Implement Student submission views, Teacher review, filters, downloads, and feedback draft/publish.
5. Add email, audits, dashboards, backups, monitoring, security tests, and CI/CD deployment.

## 20. Priority Test Scenarios

- Invalid/repeated student codes; a student enrolled in Course A trying to access Course B; unauthorized object ID access; expired download links.
- 0, 1, 25, and 26 files; 25 MB versus 25 MB + 1 byte; 100 MB boundary; spoofed MIME types; long Unicode filenames; safe malware test fixtures.
- Network interruption; only 24/25 uploads succeeding; browser closed during upload; Google Drive errors, quota exhaustion, or expired tokens; retries and duplicate commits.
- Exact deadline boundary, `Asia/Ho_Chi_Minh` timezone, a Course switching to `ENDED`, or a Teacher locking an Assignment during upload.
- Failed malware scanning on replacement files must preserve the previous submission.
- An unauthorized Teacher, a Student trying to see another student's work, a Parent requesting an unlinked student's records, and access to a file pending scanning.

---

**Business Analysis Note:** This document is a preliminary analysis based on survey responses, not an approved implementation specification. Values labeled as *recommended* require project-owner approval before schemas/APIs are finalized.

## 21. Additional Confirmed Decisions (November 4, 2026)

- **D-01:** A Student opens the website, selects a Course, and enters a student code: no PIN, password, or registration. This favors convenience but carries an unauthorized-access risk if a code is exposed.
- **D-02:** Google Drive is the primary file repository, allowing manual inspection of organized folders. Files are not publicly shared; viewing and downloads go through the authorization-enforcing backend.
- **D-03:** Parent access is read-only and limited to linked students' Courses, Assignments, and Submissions. Parents cannot submit, edit, grade, review, or delete anything.
- **D-04:** The architecture should allow a move from one-on-one MVP use to multiple classes and teachers without a complete data-model rewrite.
