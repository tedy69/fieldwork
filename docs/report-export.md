# Work order CSV exports

Managers can download the latest reports in the web work-order list using **Reports**. Search, the status/Overdue filter, and the [due-date range](work-order-filters.md) determine which orders are included. Orders without a submitted report are skipped. The button shows the number of reports to export and is disabled when there are none.

In the [weekly planner](week-planner.md), the displayed week or selected day determines the date window instead of the list's date-range inputs. Search and status still apply.

Choose **Schedule** to export one row per visible work order, including assignments without a report. It includes the reference, title, site, assignee, due date, priority, and status. The schedule and report files use the same filters and work offline.

Exports use the records currently saved on the device and work offline. Sync first when you need the latest server changes. The report file uses the current snapshot for each order.

Both files use UTF-8, comma-separated cells, a byte-order mark, and CRLF record endings. The report file has one row per checklist answer, repeating the report's context so rows can be sorted or filtered in a spreadsheet.

Columns include the reference, title, site/address, assignee name, due date, workflow status, submission time and user ID, summary, review decision/details, checklist item/result/note, and photo count. Timestamps are UTC. Unreviewed reports have empty review fields. Photos, attachment URLs, credentials, and other local drafts are not exported.

Quotes, commas, and multiline text are escaped within quoted cells. Formula-like values receive a leading tab to reduce spreadsheet formula execution risk, following [OWASP's CSV guidance](https://community.owasp.org/attacks/CSV_Injection). The tab remains part of the cell value if you process the CSV programmatically; spreadsheet applications differ in how they interpret imported text.

Downloads contain operational report data and are separate from the application's local cache. Creating a CSV does not change a report, draft, or outbox entry. A download failure shows an error so you can narrow the list and retry.
