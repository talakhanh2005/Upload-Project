# Course & Assignment Submission Platform

An MVP foundation based on `system-analysis-en.md`. It contains a Next.js student/teacher interface and a NestJS API backed by MongoDB. Local private storage is enabled for development. The production Google Drive adapter, real malware scanner, email worker, and complete Parent/Admin screens are intentionally left as deployment-phase integrations rather than being presented as production-ready placeholders.

## Run locally

1. Copy `.env.example` to `.env` and change `JWT_SECRET`.
2. Start MongoDB: `docker compose up -d mongo`.
3. Install dependencies: `npm install`.
4. Seed the demo: `npm run seed --workspace @upload/api`.
5. Start both apps: `npm run dev`.

Web: http://localhost:3000 · API docs: http://localhost:4000/docs

Demo teacher: `teacher@example.com` / `ChangeMe123!`  
Demo student code: printed by the seed command.

## MVP defaults chosen from unresolved analysis items

- Total upload size is `<= 100 MB`.
- Resubmission lateness uses the replacement timestamp.
- Year/semester and open/close times are optional.
- Assignment deletion is soft deletion.
- Feedback is visible to linked parents only after publication.
- Admin access is system-wide; teacher self-registration is disabled.
- Supported files: JPEG, PNG, WebP, HEIC, PDF, TXT, DOC/DOCX, PPT/PPTX, XLS/XLSX. ZIP is excluded.

See `docs/analysis-review.md` for specification issues and implementation boundaries.

The implemented route contract, authorization rules, and example payloads are documented in [`docs/api.md`](docs/api.md).

## Implemented now

- Teacher/parent credential login and code-only student course access.
- Role guards plus teacher ownership and student course scoping.
- Course, enrollment, assignment, submission/resubmission, review, and feedback endpoints.
- Upload count, per-file, total-size, MIME allowlist, course-state, open/close, and lock enforcement.
- MongoDB indexes for unique student codes, enrollments, courses, and current submissions.
- Responsive student entry and teacher login pages, Swagger docs, seed data, Docker development services, and policy tests.
- Interactive exercise MVP foundation: versioned teacher drafts, strict MD/TXT import preview, five question types, publish validation, student autosave with optimistic revision checks, frozen shuffle order, deterministic grading, private voice recording storage, and teacher result publication APIs.

Teachers can create an assignment with type **Interactive exercise** and open its question builder from the course page. Students open a published exercise from the normal assignment list. The import grammar and example payload are documented in `docs/api.md`.

## Required before deployment

Implement the Google Drive storage adapter and compensating cleanup workflow, content-signature detection, a production malware scanner/quarantine, file streaming authorization, rate limiting, audit logs, notification jobs, Parent linking endpoints, and full management dashboards. These are called out explicitly because the analysis requires them and a local-storage prototype must not be mistaken for the production security model.
