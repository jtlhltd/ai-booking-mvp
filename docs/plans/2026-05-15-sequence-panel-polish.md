# Sequence panel polish (stopped / abandoned UX)

## Context
- Stopped-operator detail panel was fixed; list rows, summary strip, and call history still have misleading copy or labels.
- Must not reintroduce dashboard boot/loading regressions (no init/boot changes).
- User asked to fix all identified misleading items in sequence window + related surfaces.

## Definition of done
- Stopped/abandoned rows in recent list show cohort-appropriate footer text (not generic "No future stage queued").
- Detail panel does not duplicate handoff summary in Sequence status + Lead context when terminal.
- Sequence summary strip adapts labels/hints when cohort filter is not `all` (or shows cohort-scoped note).
- List intro copy matches active filter (not "stop dials" when viewing stopped-only).
- Call history empty state is clearer; phone detail enriches `lastOutcome` from latest call by phone when `lastCallId` is null.
- `npm run check:policy` passes; inline dashboard script parses.

## Non-goals
- Dashboard boot/init/fallback changes.
- Playwright reintroduction.
- Changing CRM lead status on operator stop.

## Work breakdown
- [x] `renderOutboundSequenceRecentList`: cohort-aware `nextAction`, attempts hint, intro text
- [x] `renderOutboundSequenceSummary`: filter-aware labels / secondary note
- [x] `renderOutboundSequenceLeadDetail`: dedupe handoff; list row alignment
- [x] `followUpRenderCallHistoryInto`: better empty state when terminal/stopped context
- [x] `outbound-sequence-visibility-mount.js`: fallback lastOutcome by phone
- [x] Run policy check + script parse

## Risk & rollback
- Risk: copy-only + one additive SQL read on phone detail — low blast radius.
- Rollback: revert commit on `public/client-dashboard.html` and `routes/outbound-sequence-visibility-mount.js`.
