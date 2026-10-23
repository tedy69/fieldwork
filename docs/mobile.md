# Mobile development

`apps/mobile` is the Expo field-worker notebook. It signs in to the same API, caches assignments in SQLite, saves checklist drafts and base64 photos locally, and reuses the shared outbox. Native credentials are held in Expo SecureStore.

## Start

Run the API, then `npm run mobile`. Use a compatible Expo Go client for SDK 58 or create a development build. Enter a worker account and server URL on the sign-in screen.

- iOS simulator: `http://localhost:3001`.
- Android emulator: normally `http://10.0.2.2:3001`.
- Physical phone: bind the development API with `HOST=0.0.0.0`, use the computer's LAN address, and keep both devices on the same network.
- Deployed server: HTTPS URL.

Alternatively set `EXPO_PUBLIC_API_URL` when starting Metro. This is a public server address, not a secret. Never put credentials in `EXPO_PUBLIC_*` variables.

## Native acceptance checklist

1. Sign in online and load an assigned order.
2. Answer the checklist, type notes and summary, and attach a library photo.
3. Deny camera permission; verify the explanation and library alternative. Then test taking a real photo on a physical device.
4. Disable network access to the API; close and relaunch the app. The saved assignment and draft must remain.
5. Save the report offline, reconnect, and sync once. Repeated sync taps must not duplicate it.
6. Expire the session while a report is pending; sign in with the same account and recover the queue.
7. Have another device submit or change the order; confirm a conflict is shown and the local draft remains.
8. Check large text, screen reader labels, keyboard avoidance, and Android back behavior.
9. Assign a checklist that requires a photo. Confirm its guidance appears, saving without a photo keeps the draft and shows an actionable error, and attaching/removing/re-attaching evidence works offline through restart. Submit a correction with fresh evidence after a manager requests changes.

The iOS simulator does not emulate a real camera or cellular conditions. JavaScript export, simulator smoke tests, physical-device acceptance, and store release are separate checks; record them accurately in docs/verification.md.

## Storage and synchronization

Managers can issue [worker invitation links](worker-invitations.md) from the web workspace. Open the link in a browser to choose a password, then sign in through Expo with that email, password, and the same server URL. Native invitation deep-link handling is not included.

For a forgotten worker password, ask a manager for a [password recovery link](password-recovery.md), open it in a browser, and return to Expo's normal sign-in with the new password and the same account/server. Recovery ends old server sessions and preserves local drafts and queued reports. Native deep links and physical-device recovery acceptance remain separate checks.

Managers can also [disable or reactivate workers](worker-access.md) on the web. Disabled accounts cannot sign in or sync through Expo; disconnected devices may still display saved assignments. Local drafts and queued photos remain for the same account after access is restored and the worker signs in again. Physical-device acceptance of this recovery flow remains in the device checklist.

Reports and photos use `expo-sqlite/kv-store`, scoped by user ID. SecureStore contains the session and server address. Signing out removes that credential but preserves unsent local work for the same account. Report storage is not encrypted by the app.

Synchronization runs on demand and when the app comes to the foreground. Background tasks are not implemented. Keep native-only storage, permissions, and media APIs out of `packages/offline` so web tests can exercise the same submission logic.

Type-check with `npm run typecheck`; export a platform bundle with:

```sh
npm exec -w @fieldwork/mobile -- expo export --platform ios --output-dir dist
```

Contributors are welcome to add reproducible Android and iOS automation. Use dedicated demo accounts and never clear another project's simulator data.
