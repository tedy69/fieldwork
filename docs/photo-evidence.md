# Required photo evidence

Managers can require a site photo for a checklist. In **Sites & checklists**, choose **At least one photo required** under **Photo evidence** before adding the checklist. The default keeps photos optional. The catalog and assignment selector identify required-photo checklists, and new assignments store that requirement in their checklist snapshot.

This is a checklist-wide requirement of at least one attachment per submission. It does not assign evidence to individual items or verify what a photo depicts, when it was captured, or where it was taken. Existing image type, size, and three-photo limits still apply.

## Worker workflow

The web and Expo notebooks show the requirement beside Site photos. Complete the checklist and summary, then attach at least one site photo. Removing the last photo makes another attachment necessary. Trying to save without one shows **Attach at least one site photo before submitting this checklist.** The draft stays on the originating device and no new report enters the outbox.

The shared offline repository checks the cached assignment before enqueueing. A missing-photo draft can still be saved, reopened offline, and completed later. A valid report and its attachment follow the existing durable outbox and retry behavior. Server acknowledgment is still required before removing local work.

Every correction submission needs its own attachment. A previous saved report's photo does not satisfy a new report input. Saved report revisions retain their original checklist requirement and attachment references. Old assignments without a requirement remain optional, even if the catalog later contains a different policy.

## API and SDK

`POST /api/v1/templates` accepts an optional boolean `requiresPhoto` alongside the existing name and string items:

```json
{
  "name": "Access inspection",
  "items": ["Check access route", "Check equipment condition"],
  "requiresPhoto": true
}
```

The SDK extends the existing call with an optional third argument: `client.createTemplate(name, items, requiresPhoto?)`. Omitting it preserves the previous request shape. False explicitly keeps photos optional. Null, strings, numbers, and extra input fields are rejected. Current manager permissions and cookie-origin checks remain in effect.

`TemplateSchema` carries the optional flag through catalog, assignment, search, sync, receipt, report-history, and client cache contracts. `CreateTemplateSchema` owns creation input. No SQLite migration, order version change, historical rewrite, or new storage adapter is needed. This feature creates new checklist policies; editing an existing template's policy is not included.

`POST /api/v1/work-orders/:id/reports` returns 422 `PHOTO_REQUIRED` when the assigned snapshot requires evidence and the report input has no photos. Authorization, assignment version, state, and checklist-answer checks still apply. A rejected report leaves orders, photo rows, action history, revisions, and mutation receipts unchanged. A subsequent corrected request may reuse the rejected mutation ID; successful retries still require the original content and return its saved acknowledgment.

The API enforces the requirement independently of client checks and accepts only attachments that pass its existing image validation. The offline check uses cached assignment metadata and cannot replace server authorization or validation. An older client that stripped the new flag may queue a report without a photo; its 422 response leaves that queue blocked and preserves the local draft. Upgrade the client, open the latest assignment with the existing draft-recovery action, and add evidence before submitting again. Do not clear browser/app data to resolve it.

## Contributor entry points

- Contracts and message: `packages/contracts/src/index.ts`.
- Creation transport and validation: `packages/sdk/src/index.ts`, `apps/api/src/app.ts`.
- Shared queue validation: `packages/offline/src/index.ts`.
- Manager setup/assignment: `apps/web/src/Resources.tsx`, `AssignmentFields.tsx`.
- Worker guidance: `apps/web/src/OrderDetail.tsx`, `apps/mobile/App.tsx`.
- Permission, snapshot, correction, persistence, and retry coverage: `tests/photo-evidence.test.ts`, `tests/offline.test.ts`, `tests/sdk.test.ts`.
- Browser setup, offline drafts, keyboard upload, correction, and reload protection: `tests/e2e/photo-evidence.spec.ts`.

All fixtures are synthetic. Browser checks and native bundle exports do not replace camera permission, physical-device, or full screen-reader acceptance. Follow the [mobile checklist](mobile.md) before a device release.
