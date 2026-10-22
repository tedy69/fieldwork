# Work-order filters

Managers and workers can narrow the web work-order list with search, one status filter, and a due-date range. Each filter applies to the records currently saved for that account on this device. Sync first when you need recent server changes; saved records can be filtered offline.

Use **Due from** and **Due through** to choose a planning window. Both dates are included. Leave Due from blank to include all earlier dates, or leave Due through blank to include all later dates. **Clear dates** removes both dates while keeping search and the status filter.

Due dates are calendar dates, not timestamps: a work order due on 22 October matches that date in every time zone. Overdue still uses the device's local date and excludes approved work. Selecting Overdue together with a range shows only unfinished work that meets both conditions.

If Due through is before Due from, both fields are marked invalid and a message explains how to fix the range. No orders or reports are included until the dates are corrected or cleared. A valid range with no matching work shows a separate empty state.

The footer shows the filtered count. The In the field and Ready for review totals remain workspace summaries. Manager CSV exports include only reports in the filtered list, including its date range.

Filters stay in place when you open an order and return to the list. Reloading the app or signing out resets them. Filtering does not change due dates, assignments, reports, drafts, or the outbox. Calendar scheduling and native date-range controls remain roadmap work.
