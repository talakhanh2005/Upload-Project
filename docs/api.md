# ClassDrop API Contract

Base URL: `http://localhost:4000/api`

All protected routes use:

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Error responses use NestJS's standard shape:

```json
{ "statusCode": 400, "message": "Description", "error": "Bad Request" }
```

## Authentication

| Method | Route                   | Access                                        | Definition                                                                                              |
| ------ | ----------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/login`           | Public                                        | Teacher/Admin/Parent email and password login. Returns a 30-minute bearer token and basic user profile. |
| POST   | `/auth/student/access`  | Public, rate limiting required for production | Validates a student code against a course enrollment. Returns a 20-minute course-scoped token.          |
| POST   | `/auth/change-password` | Teacher/Admin                                 | Verifies the current password and replaces it with a new password of at least 8 characters.             |

## Admin: Teacher Accounts

All routes below require an `ADMIN` bearer token.

| Method | Route                          | Definition                                                             |
| ------ | ------------------------------ | ---------------------------------------------------------------------- |
| GET    | `/teachers`                    | Lists teacher accounts with active and Google Drive connection status. |
| POST   | `/teachers`                    | Creates a teacher account with name, email, and temporary password.    |
| PATCH  | `/teachers/:id`                | Updates a teacher's name or email.                                     |
| DELETE | `/teachers/:id`                | Deactivates a teacher account without deleting course data.            |
| POST   | `/teachers/:id/restore`        | Restores a deactivated teacher.                                        |
| POST   | `/teachers/:id/reset-password` | Replaces the temporary password.                                       |
| GET    | `/teachers/drive-policy`       | Returns the centrally configured Drive authorization policy.           |

Create teacher body:

```json
{
  "name": "Teacher Name",
  "email": "teacher@school.edu",
  "temporaryPassword": "temporary-password"
}
```

Teacher login body:

```json
{ "email": "teacher@example.com", "password": "ChangeMe123!" }
```

Change password body:

```json
{ "currentPassword": "ChangeMe123!", "newPassword": "A-new-password-2026" }
```

## Teacher: Courses and Students

| Method | Route                            | Access                | Definition                                                                                          |
| ------ | -------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| GET    | `/courses`                       | Teacher/Admin/Student | Teachers receive owned courses; students receive only the course in their scoped token.             |
| POST   | `/courses`                       | Teacher/Admin         | Creates a `DRAFT` course and generates a unique course code.                                        |
| PATCH  | `/courses/:courseId`             | Owning Teacher/Admin  | Updates name, description, or `DRAFT\|ACTIVE\|ENDED` status.                                        |
| GET    | `/courses/:courseId/students`    | Owning Teacher/Admin  | Lists actively enrolled students, including the private code used to enter the course.              |
| POST   | `/courses/:courseId/students`    | Owning Teacher/Admin  | Creates a student profile with a random code and enrolls it atomically from the user's perspective. |
| POST   | `/courses/:courseId/enrollments` | Owning Teacher/Admin  | Enrolls an existing active student by ID. Idempotent through the unique enrollment index.           |

Create course:

```json
{ "name": "Mathematics 4", "description": "Tuesday evening class" }
```

Create and enroll student:

```json
{ "name": "Student Name", "email": "optional@example.com" }
```

Response includes `id`, `name`, optional `email`, and the generated `studentCode`. The code must be delivered privately.

## Teacher: Assignments

| Method | Route                            | Access                                 | Definition                                                       |
| ------ | -------------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| GET    | `/courses/:courseId/assignments` | Owning Teacher/Admin or scoped Student | Lists non-deleted assignments ordered by deadline.               |
| POST   | `/courses/:courseId/assignments` | Owning Teacher/Admin                   | Creates an assignment. Creation is rejected for an ended course. |
| PATCH  | `/assignments/:assignmentId`     | Owning Teacher/Admin                   | Updates title, instructions, deadline, or manual lock state.     |

Create assignment:

```json
{
  "title": "Fractions worksheet",
  "instructions": "Upload a PDF or clear photographs.",
  "deadlineAt": "2026-12-01T10:00:00.000Z",
  "opensAt": "2026-11-20T00:00:00.000Z",
  "closesAt": "2026-12-08T10:00:00.000Z"
}
```

Only `title` and `deadlineAt` are required. Set `{ "isManuallyLocked": true }` with `PATCH` to immediately stop submissions.

## Student Submissions

| Method | Route                                      | Access                               | Definition                                                                                           |
| ------ | ------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| GET    | `/assignments/:assignmentId/my-submission` | Scoped Student                       | Returns the student's current submission or an empty body when none exists.                          |
| POST   | `/assignments/:assignmentId/submissions`   | Scoped Student                       | Multipart upload with one or more `files` fields. Creates or safely replaces the current submission. |
| GET    | `/files/:submissionId/:fileIndex/content`  | Owner Student, owning Teacher, Admin | Streams a clean file through backend authorization without exposing its storage identifier.          |

Upload limits: 25 files, 25 MB per file, and 100 MB total. Supported extensions are JPEG, PNG, WebP, HEIC, PDF, TXT, DOC/DOCX, PPT/PPTX, and XLS/XLSX.

## Teacher: Review and Feedback

| Method | Route                                         | Access               | Definition                                                                                                                                |
| ------ | --------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/assignments/:assignmentId/submissions`      | Owning Teacher/Admin | Returns one row for every enrolled student. `status` is `SUBMITTED`, `LATE`, or derived `MISSING`; `submission` is null for missing work. |
| POST   | `/submissions/:submissionId/review`           | Owning Teacher/Admin | Sets `reviewedAt` to the current time.                                                                                                    |
| PUT    | `/submissions/:submissionId/feedback`         | Owning Teacher/Admin | Saves feedback as `DRAFT`, invisible to the student.                                                                                      |
| POST   | `/submissions/:submissionId/feedback/publish` | Owning Teacher/Admin | Saves and publishes feedback, making it visible to the student.                                                                           |

Feedback body:

```json
{ "text": "Good work. Please explain question 4 in more detail." }
```

## Storage

| Method | Route             | Access        | Definition                                                                         |
| ------ | ----------------- | ------------- | ---------------------------------------------------------------------------------- |
| GET    | `/storage/health` | Teacher/Admin | Reports the selected storage driver and whether it can access the configured root. |

The active driver is selected with `STORAGE_DRIVER=local` or `STORAGE_DRIVER=google-drive`. Database metadata stores opaque `local:` or `drive:` keys; clients never receive a public storage URL.

For Google Workspace deployments, set `GOOGLE_DRIVE_AUTH_MODE=workspace-delegation` and configure the service-account and Workspace domain variables. The service account impersonates the owning teacher when it creates files, so a Workspace super admin performs one domain-wide authorization instead of every teacher configuring OAuth credentials. Teachers outside the managed domain still require a user-consent OAuth flow.

Interactive OpenAPI documentation is available at `http://localhost:4000/docs`.

## Interactive Exercises

Interactive assignments are separate from file submissions. Existing assignments default to `FILE_UPLOAD`; create a new one with `"kind": "INTERACTIVE"` to use the exercise workflow. `MIXED` is reserved and rejected in this release.

### Teacher authoring

| Method | Route | Definition |
| ------ | ----- | ---------- |
| GET/POST | `/assignments/:id/exercise/draft` | Get or create the next editable version. |
| PUT | `/assignments/:id/exercise/draft` | Save `sections`, `questions`, and `expectedRevision`. |
| POST | `/assignments/:id/exercise/validate` | Validate all five question schemas without publishing. |
| POST | `/assignments/:id/exercise/publish` | Publish an immutable version and make it active. |
| POST | `/courses/:courseId/exercises/import/preview` | Parse strict MD/TXT source without committing it. |
| POST | `/courses/:courseId/exercises/import/commit` | Atomically create/update a draft from valid import source. |
| POST | `/courses/:courseId/exercise-assets` | Multipart image upload using field `file`. |

Import accepts optional YAML-style front matter followed by fenced `exercise` blocks containing strict JSON. It is limited to 1 MiB and 100 questions. Imports always remain drafts; unresolved `imageKey` values must be replaced with uploaded `imageAssetId` values before publish.

### Student attempts

| Method | Route | Definition |
| ------ | ----- | ---------- |
| GET | `/assignments/:id/exercise` | Read the sanitized published version; answer keys are omitted. |
| POST | `/assignments/:id/exercise/attempts` | Start or resume an in-progress attempt. |
| GET | `/exercise-attempts/:id` | Resume answers and frozen presentation order. |
| PATCH | `/exercise-attempts/:id/answers` | Autosave the full answer set with `expectedRevision`. |
| POST | `/exercise-attempts/:id/audio` | Multipart voice upload with `file`, `questionId`, and `durationSeconds`. |
| POST | `/exercise-attempts/:id/submit` | Idempotent submit and server-side grading. |
| GET | `/exercise-attempts/:id/result` | Read published results only. |
| GET | `/exercise-assets/:id/content` | Authorized private image/audio stream. |

`MULTIPLE_CHOICE`, `FILL_BLANK`, `IMAGE_MATCH`, and `SENTENCE_ORDER` are graded deterministically. `READ_ALOUD` changes the attempt to `NEEDS_REVIEW`; recordings accept supported browser audio MIME types, 3–120 seconds, and at most 15 MiB.

### Teacher review

| Method | Route | Definition |
| ------ | ----- | ---------- |
| GET | `/assignments/:id/exercise/attempts` | List attempts for an owned assignment. |
| GET | `/exercise-attempts/:id/review` | Read the attempt and server-only version for grading. |
| PUT | `/exercise-attempts/:id/grading` | Set manual points and mark the result ready. |
| POST | `/exercise-attempts/:id/feedback/publish` | Publish the result for the student. |
