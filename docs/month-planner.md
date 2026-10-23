# Monthly planner

Choose **Month planner** in the web work-order screen to compare daily workloads across a calendar month. The desktop calendar starts on Monday. Phone layouts use a chronological two-column ledger with full day labels so each date remains a readable touch target.

Counts use saved orders that match the current search and status filter. Managers see workspace orders; workers see their own assignments. Counts are not a live server feed. Sync when you need recent changes; a failed sync retains saved work and shows the existing error notice.

Choose a day to narrow the list, or **Whole month** to restore the month's records. The list sorts by due date, then reference. Manager CSV exports use that same month/day window, search, and status filter. Empty months and days have separate messages.

**Previous month** and **Next month** move one month at a time, including across short months, leap years, and year boundaries. **This month** returns to the device's current local month and clears the selected day. The Today marker updates across local midnight while the displayed month stays where you left it. The supported navigation range is January 0001 through December 9999.

Tab enters the days at the last focused date, selected date, Today, or first day, in that order. Arrow keys move focus by day or visible row; Home and End reach the first and last dates. Focus movement does not filter the list until Enter or Space selects the day. Tab then leaves the day group. Today and the selected day have separate labels and states.

Managers can select a day and choose **Assign for selected day**. The existing assignment dialog opens with that date; the manager can still change it. A failed assignment preserves the form for retry. Creating work requires a connection and available catalog records. Workers do not receive manager actions.

List, Week planner, and Month planner share search/status filters. Switching views clears the selected day and uses it as the next planner's date context when present. List keeps its custom date range while calendars apply their own period. Opening an order and returning preserves the view/day. Reloading or signing out resets the view and filters.

The planner works with saved records offline. Browsing does not submit reports, replace drafts, or flush the outbox. Worker text and photo drafts survive navigation and reload. Calendar arithmetic uses date-only values so time-zone offsets and daylight-saving transitions cannot shift a due date into another day. The calendar displays local Today independently from those dates.

This feature changes only web presentation. There is no new API contract, database migration, dependency, recurring scheduler, drag-and-drop, or native calendar screen. Contributors can start in `MonthPlanner.tsx`, `calendar.ts`, and `Workspace.tsx`; regression coverage lives in `tests/calendar.test.ts` and `tests/e2e/month-planner.spec.ts`.
