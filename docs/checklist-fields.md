# Checklist response types

Managers can choose **Text response** when adding a checklist in Sites & checklists. Each line becomes a required text question. The default remains Pass / issue / N/A. The web creation form applies one type to all lines; the API and SDK also support mixed check and text items:

```ts
await client.createTemplate('Equipment visit', [
  'Access is clear',
  { label: 'Equipment serial number', responseType: 'text' },
]);
```

An omitted `responseType` means `check`. Assigned orders embed the item types in their checklist snapshot; subsequent catalog changes do not rewrite assignments.

Workers enter text in a labeled field on web and Expo. Responses allow up to 1,000 characters and must contain non-whitespace text before submission. Line breaks and surrounding whitespace are preserved. Notes remain separate. Partial text stays in the local draft, including across offline reloads and native app restarts. The web draft JSON export includes that text and any queued report unchanged.

Submit text answers as `{ itemId, value: 'text', text: 'SERIAL-0042', note: '' }`. Check answers retain `pass`, `fail` or `na` with no `text` property. The API requires exactly one answer of the expected type for every snapshot item. A rejected response does not update the report or its retry receipt. The device keeps queued payloads unchanged until acknowledged; version conflicts require explicit recovery with the latest assignment.

Saved web/native reports, web revision history, print views and CSV exports show the response itself. Text uses ordinary escaped rendering and CSV formula protection. Existing check-only requests, receipts and stored records keep their prior shapes.

Update the API, web app and Expo client together before dispatching typed checklists. Older clients cannot interpret text report answers, and older servers cannot accept typed template creation. Do not roll back to an older client with typed drafts/reports on the device. No database migration is needed; item and answer metadata live in existing JSON snapshots. This slice does not add numeric readings, per-item photos, optional questions or a mixed-type web editor.

Regression coverage is in `tests/typed-fields.test.ts` and `tests/e2e/text-fields.spec.ts`. Device evidence and platform limits are recorded in [verification](verification.md).
