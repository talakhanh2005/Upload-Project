# Review of `system-analysis-en.md`

The document is coherent enough to start an MVP, but it is a business-analysis draft rather than a signed-off specification.

## Issues that affect implementation

1. **Authentication risk:** a student code is both identifier and credential. Random high-entropy codes, throttling, short sessions, and audit logs reduce but do not remove impersonation risk.
2. **Open authorization decisions:** Admin scope, teacher provisioning, and parent feedback visibility are unresolved. This codebase chooses documented defaults and keeps guards role/ownership based.
3. **Upload atomicity:** MongoDB and Google Drive cannot share a transaction. Upload staging plus idempotent commit and compensating cleanup are required; a database transaction alone is insufficient.
4. **Malware scanning is unspecified:** production cannot safely expose uploads until a scanner is selected. The API models scan states and denies non-clean files; development uses a placeholder scanner.
5. **Google OAuth ownership risk:** a single owner's refresh token is an operational dependency. Token revocation, quota exhaustion, account suspension, and disaster recovery need runbooks.
6. **Email contradictions:** assignment notifications cannot be guaranteed when students have no email. Notifications are conditional on a stored, consented recipient.
7. **Ambiguous time semantics:** timestamps should be stored in UTC; the configured application timezone is for input/display and deadline interpretation.
8. **Course roster privacy:** allowing students to view a roster conflicts with data minimization and is excluded from this MVP.
9. **Undo is underspecified:** “undo/resubmit” may mean edit-before-submit, replacement, or recovery. This MVP supports safe replacement, not restoration of deleted versions.
10. **Acceptance gaps:** pagination, error shape, idempotency-key behavior, session revocation, retention, backups, and accessibility targets need explicit acceptance criteria.

## Before production

Replace the development scanner, configure Google Drive and email, add Redis-backed distributed throttling/jobs, define retention and backups, obtain privacy/consent review for children’s data, and run authorization, upload-abuse, and recovery tests.
