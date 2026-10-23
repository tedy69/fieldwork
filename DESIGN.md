# Fieldwork design direction

Direction chosen by Tedy: **Industrial field notebook: charcoal, amber, dense operational screens.**

Reading this as an operations notebook for dispatch managers and field workers, in a practical industrial style. ENERGY 2 / RHYTHM 2 / MOTION 1.

- Charcoal surfaces reduce glare and give the notebook a consistent identity across web and native screens.
- Amber marks the primary action, urgent work, and review states so attention follows the operational task.
- Light text and clearly separated muted text keep dense records readable.
- Lists carry the workload: references, sites, people, dates, and status should be easy to scan.
- A wider dispatch layout supports comparison; the field layout stacks the same information for one-handed use.
- The weekly planner compares seven days in columns on desktop and uses daily ledger rows on phones. Its amber selection rule echoes the notebook's margin motif and identifies the active day.
- Small corners and flat surfaces keep forms and records distinct. Shadows are reserved for the modal dialog.
- A narrow rule beside the active navigation item carries the notebook's margin motif. Status shapes communicate state rather than decoration.
- System fonts work offline. Monospace is limited to record references and code.
- Motion is limited to short interaction feedback and respects reduced-motion settings.
- Kokonut UI and its shared shadcn foundation are used across the web workspace. Buttons, fields, cards, notices, status badges, selection strips, the finder, and photo attachment share the existing charcoal/amber palette. Outlined cards group actual workload counts, catalog editing, and reports; the work list remains the main content. Small corners distinguish controls without adding pill shapes or broad shadows.
- The finder keeps visible shortcut keycaps. Selection strips show the active filter with the existing amber rule, and photo attachment names its local-draft destination. Demo charts, sample navigation/accounts, artificial progress, and motion effects are excluded from the product.
- Phosphor regular icons provide consistent action and state symbols on the web. Compact 16px icons inherit the text color, retain visible labels, and identify search, nested navigation, links, or progress rather than adding decoration.
- Clipboard, tray, and buildings identify work orders, the report outbox, and workspace resources. The upload glyph identifies photo attachment to a local draft. Labels remain visible; navigation glyphs are omitted at the narrowest phone width to keep the destinations readable.
- Rescheduling expands beside the order metadata so managers can compare the current and proposed dates. The amber margin rule identifies the active edit; existing date inputs, buttons, and typography keep the operation part of the notebook rather than a separate calendar screen.
- Worker reassignment uses the same inline edit beside the current assignee, with a native worker selector and a handover note explaining where reports and device drafts stay. Shared Kokonut controls keep the charcoal/amber palette, 44px targets, system type, and compact spacing; the amber rule marks the active edit without extra decoration or animation.

Use explicit labels, 44px targets where practical on mobile, visible focus, semantic headings, and useful loading/error/empty states. Never fabricate customer logos, usage numbers, testimonials, or reports. Documentation screenshots use seeded demo data and say so.
