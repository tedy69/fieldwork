# Print an inspection report

Open a work order with a submitted report in the web app, then choose **Print report**. Your browser opens its print dialog, where you can choose a printer or Save as PDF when supported. Canceling the dialog does not change the report; the app does not claim that a file was saved or a page was printed.

Managers and the assigned worker can print reports they can already view. The action is unavailable before the first submitted report. It uses the latest snapshot saved for the account on this device, so it works offline. Sync first when you need recent server changes.

The paper layout includes the work-order reference/title, site and address, assignee, due date, priority, workflow status, report ID, work-order version, submission time and user ID, instructions, checklist results and notes, summary, and manager review. Timestamps are UTC. Unreviewed reports say so; photo files are represented only by a count.

Unsent corrections, queued replacement reports, editable review notes, credentials, and photo files are excluded. If changes were requested and you are editing a correction, printing still uses the previously submitted report. Printing does not submit a draft, flush the outbox, approve a report, or change local work.

The layout uses black text on white paper, repeating checklist column headings and allowing long reports to span pages. It uses the browser's [print styles and page settings](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Printing). Paper size, scaling, headers, and footers can be adjusted in the print dialog; results vary by browser and printer.

If the app cannot open the dialog, it shows an error suggesting a desktop browser. The button can be retried. Physical printers, mobile system print sheets, and every browser configuration have not been tested; the automated PDF and layout checks are recorded in [verification](verification.md#printable-reports).
