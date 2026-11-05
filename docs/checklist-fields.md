# Checklist response types

Managers can paste a list into **Add a checklist** in Sites & checklists and choose a common response type. Choose **Set types per item** to keep the pasted questions and set their types individually, or start with a blank item. Add or remove questions before saving. A failed save retains the form. The default remains Pass / issue / N/A. The API and SDK use the same mixed item format:

```ts
await client.createTemplate('Equipment visit', [
  'Access is clear',
  { label: 'Equipment serial number', responseType: 'text' },
  { label: 'Temperature', responseType: 'number', readingRule: { unit: '°C', min: -10, max: 40 } },
]);
```

An omitted `responseType` means `check`. Assigned orders embed the item types in their checklist snapshot; subsequent catalog changes do not rewrite assignments.

Workers enter text in a labeled field on web and Expo. Responses allow up to 1,000 characters and must contain non-whitespace text before submission. Line breaks and surrounding whitespace are preserved. Notes remain separate. Partial text stays in the local draft, including across offline reloads and native app restarts. The web draft JSON export includes that text and any queued report unchanged.

Submit text answers as `{ itemId, value: 'text', text: 'SERIAL-0042', note: '' }`. Check answers retain `pass`, `fail` or `na` with no `text` property. The API requires exactly one answer of the expected type for every snapshot item. A rejected response does not update the report or its retry receipt. The device keeps queued payloads unchanged until acknowledged; version conflicts require explicit recovery with the latest assignment.

Numeric questions keep their raw input as a string in the local draft, including incomplete input such as `-` and trailing zeros such as `-12.50`. Completion and submission accept digits, an optional leading sign and a decimal point; zero is a completed answer. Commas, exponent notation, hexadecimal, NaN and Infinity are rejected. Input is limited to 100 characters. Web and Expo show inline guidance for invalid input without discarding it.

In the individual item editor, numeric questions can have a unit (up to 24 characters), a minimum, a maximum, or any combination. Both endpoints are inclusive and zero is a valid limit. Limits must fit in a 100-character decimal entry. A unit labels the reading; it does not convert values. The assignment stores these settings with the question. Out-of-range values remain in the draft, do not count as complete, and cannot be queued. The server independently rejects them with `422 READING_RANGE` before recording the report.

The submission boundary converts a completed reading to a finite JavaScript number: `{ itemId, value: 'number', reading: -12.5, note: '' }`. Saved reports normalize `-12.50` to `-12.5`; they do not preserve display precision. Readings use standard double precision. Draft JSON exports preserve the raw string, the snapshotted unit and limits, and the exact numeric queued submission separately. Other answer types cannot carry a `reading` property or a `readingRule`.

Saved web/native reports, web revision history, print views and CSV exports show the response itself and append configured units to the question label. CSV keeps the reading in the result column. Text uses ordinary escaped rendering and CSV formula protection. Existing templates without a rule and stored receipts keep their prior shapes.

Update the API, web app and Expo client together before dispatching typed checklists. Older clients cannot interpret the new report answers, and older servers cannot accept the new template types. This also applies when upgrading from text-only support to numeric support. Do not roll back to an older client with typed drafts/reports on the device. No database migration is needed; item and answer metadata live in existing JSON snapshots. Per-item photos and optional questions remain future work.

Regression coverage is in `tests/typed-fields.test.ts`, `tests/numeric-fields.test.ts` and their browser workflows. Device evidence and platform limits are recorded in [verification](verification.md).
