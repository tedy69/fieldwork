# Reassigning unfinished work

Managers can open an Assigned or Changes requested order in the web app and choose **Change worker**. Choose another field worker and **Save worker**. The action needs a connection. Submitted and Approved orders stay with their current worker while review is completed.

The site, checklist, due date, saved report, and review notes stay with the order. A replacement worker can read the saved report and feedback, then complete the correction under their own account. Unsent answers, notes, and photos belong to the original worker's device and are never transferred to the replacement worker. Coordinate the handover before reassigning work that may already be underway offline.

## Contract and concurrency

`PATCH /api/v1/work-orders/:id/assignee` accepts `ReassignOrderSchema`: `{ baseVersion, assigneeId }`. The SDK exposes `client.reassignOrder(id, input)`. An authenticated manager and an allowed cookie request origin are required. Only an existing worker account can be selected.

The server checks the current version and unfinished status inside one SQLite transaction, updates both the embedded assignee and indexed assignee ID, increments the version, and records the old and new worker names and IDs in action history. A current-version request for the same worker is a no-op. A stale request, including a repeated request after a lost response, returns a conflict. Reload before trying again; reassignment is never put into the report outbox or retried automatically. No schema migration is required.

The editor retains a failed selection and requires **Reload order** before another save. Reloading a newer version resets the editor so the manager can review the current worker and status. The shared Kokonut controls, native select, inline amber edit rule, system type, and existing spacing keep the handover beside the metadata it changes. ENERGY 2 / RHYTHM 2 / MOTION 1 remain unchanged.

## Worker access and offline work

After the change, the replacement worker can fetch and submit the order. The original worker can no longer fetch its order, events, or photos, or submit a new report. Their next successful full sync removes the assignment from the active list. Previously cached information can remain visible until sync; this is not remote device erasure.

A report queued before reassignment is rejected on sync and remains blocked on its originating device, including its mutation ID, answers, notes, and photos. The outbox keeps the queued report when **Keep draft and open latest order** cannot fetch an authorized current order. Contact the manager to resolve the handover. If the manager assigns the order back, the original worker can open the latest version, keep their draft, review it, and explicitly submit again. A draft that was never queued also stays locally stored and becomes available if that account receives the order again. Do not clear site storage to resolve a reassignment.

An already acknowledged submission still replays its original response for the same mutation ID. This confirms work that the server accepted earlier; it does not grant access to later revisions or permit a second submission.

Native workers receive the same access restrictions and shared outbox behavior. The manager editor is web-only. Physical-device acceptance is recorded separately in verification notes.
