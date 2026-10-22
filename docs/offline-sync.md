# Offline submission protocol

The worker device stores a draft containing checklist answers, a summary, and photo bytes. Saving a report writes an outbox item **before** attempting a network request. The item contains a random `mutationId`, the target order ID, and `baseVersion`. Its ID and payload stay unchanged across automatic retries.

## Server transaction

1. Authenticate the session and scope the idempotency record to that user.
2. Look up `(userId, mutationId)` in the transaction. If present, compare its payload hash and replay the saved response. A different payload gets `422 IDEMPOTENCY_MISMATCH`.
3. For a new mutation, verify assignment, worker role, editable status, and exact base version.
4. Validate checklist coverage and photo limits, store attachments, update the order, append an action event, and persist the idempotency response in the same transaction.
5. Commit and return the confirmed order. The client can now remove its outbox item and draft.

The SQLite transaction and unique key provide the atomic boundary. The idempotency table currently has no automatic expiry; pruning it requires a policy that accounts for long-lived offline devices. A network timeout is an unknown outcome and must not create a new mutation ID.

## Client outcomes

| Outcome                        | Behavior                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| Success or replayed success    | Remove the acknowledged item and draft, cache the returned order, then refresh server state |
| Network error, timeout, or 5xx | Keep the item pending and stop this sync attempt                                            |
| 401                            | Keep pending; ask the worker to sign in again                                               |
| 429                            | Keep pending for a later attempt                                                            |
| 409                            | Mark blocked, keep the draft and photos, and show the server's conflict message             |
| Other 4xx                      | Mark blocked for the worker to inspect; do not retry invalid data forever                   |

The outbox continues with unrelated orders after a blocked item. Only one flush runs per repository instance. Concurrently queued work is retained when a response arrives. One order cannot hold two independent queued reports in the same local repository.

## Resolving a conflict

Open the outbox, keep the draft, and fetch the latest order. Review it before submitting again with a **new intent ID and the latest version**. This is an explicit user action, not an automatic rebase. If the server's state no longer permits editing, the draft remains stored; there is no silent overwrite. A draft export tool is a planned contributor task.

## Storage failures

An unsuccessful local write is an error, not a saved report. Keep the editor open and resolve device storage problems. A server acknowledgement followed by a local write failure is safe to retry because the original idempotency key is retained. Application storage is not encrypted; see SECURITY.md.

## Tests to preserve

Check restarts, photos, lost responses, payload mismatch, concurrent flush calls, a new queue item during an in-flight request, expired sessions, conflicting versions, and persistence failures. Test the server and local queue independently, then exercise the browser workflow with the network disabled and a real reload.
