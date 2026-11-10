# ForenSys Review Hub

Private employee review workspace for the planning, performance check-in, and annual evaluation cycle.

## Included

- ForenSys logo and charcoal/red brand palette
- ChatGPT sign-in supplied by the Sites platform
- HR administrator, manager, and employee roles with server-side access checks
- Employee profiles, manager reporting lines, active review cycles, and review scheduling
- Employee self-reflections, manager feedback, shared summaries, and employee acknowledgment
- Goal tracking with a success measure, due date, and progress status
- Completion-order checks for planning → check-in → evaluation
- HR user invitations, role changes, deactivation, and audit history
- CSV export of cycle status (without review notes)
- Clearly labeled fictional sample workspace

## Identity and workspace access

Users sign in with the account supported by the private Site. HR pre-registers a work email and assigns a role. The account is linked the first time the person signs in using that email. The first authenticated visitor initializes the empty workspace as its HR administrator; keep the Site owner-only until that first sign-in is complete.

The app role list is separate from the Site access policy. Adding a person here does not grant access to the private Site; Site access must also be granted to each intended user.

## Storage

The app uses the Sites D1 binding named `DB`. Drizzle schema lives in `db/schema.ts`, and generated migrations are stored in `drizzle/`. Local preview and hosted D1 databases are separate.

## Review content

The starter prompts are intentionally neutral and the rating field is not in use. ForenSys should agree on final review questions, rating policy, reminders, and record-retention period before entering real employee reviews.
