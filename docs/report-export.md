# Work order exports

Managers can download the latest reports in the web work-order list using **Reports CSV**. Search, the status/Overdue filter, and the [due-date range](work-order-filters.md) determine which orders are included. Orders without a submitted report are skipped. The button shows the number of reports to export and is disabled when there are none.

In the [weekly planner](week-planner.md), the displayed week or selected day determines the date window instead of the list's date-range inputs. Search and status still apply.

Choose **Schedule CSV** to export one row per visible work order, including assignments without a report. It includes the reference, title, site, assignee, due date, priority, and status.

Choose **Calendar** to download an iCalendar file with one all-day event per visible work order. Each event includes the reference, title, site name, and due date. The file follows the same filters and planner window as the schedule CSV. Import it into your calendar as a snapshot. Later assignment changes appear in a fresh export. [iCalendar specification](https://www.rfc-editor.org/rfc/rfc5545)

Workers can download **Calendar** from the web week and month planners. The file contains their own assignments in the selected window and follows the current search and status filter, including **To do**.

Exports use the records currently saved on the device and work offline. Sync first when you need the latest server changes. The report file uses the current snapshot for each order.

The CSV files use UTF-8, comma-separated cells, a byte-order mark, and CRLF record endings. The report file has one row per checklist answer, repeating the report's context so rows can be sorted or filtered in a spreadsheet.

Columns include the reference, title, site/address, assignee name, due date, workflow status, submission time and user ID, summary, review decision/details, checklist item/result/note, and photo count. Timestamps are UTC. Unreviewed reports have empty review fields. Photos, attachment URLs, credentials, and other local drafts are not exported.

Quotes, commas, and multiline text are escaped within quoted cells. Formula-like values receive a leading tab to reduce spreadsheet formula execution risk, following [OWASP's CSV guidance](https://community.owasp.org/attacks/CSV_Injection). The tab remains part of the cell value if you process the CSV programmatically; spreadsheet applications differ in how they interpret imported text.

Downloads contain operational report data and are separate from the application's local cache. Creating a CSV does not change a report, draft, or outbox entry. A download failure shows an error so you can narrow the list and retry.
