# Logistics qualification schema (handoff contract)

Anchor use case: outbound voice qualifies **lanes, volumes, timelines, authority, pain, and callback preference** so human follow-up is short and high-close. This document is the stable contract for **what to capture** and **where it lives** in this codebase.

## Canonical field IDs

Stable snake_case keys (see `lib/logistics-qual-schema.js`):

| Field ID | Meaning |
| -------- | ------- |
| `lanes_or_routes` | Origin/destination lanes or route patterns the prospect cares about |
| `volume_or_frequency` | Shipment volume, frequency, or seasonal pattern |
| `equipment_or_vehicle_needs` | Vehicle types, capacity, special handling |
| `coverage_areas` | Geographic or service coverage expectations |
| `timeline_or_urgency` | When they need capacity or a decision |
| `authority_or_decision_process` | Who decides, procurement steps |
| `incumbent_or_current_carrier` | Existing relationships or constraints |
| `pain_or_constraints` | Operational pain, SLA, compliance |
| `callback_window` | Preferred callback times / timezone notes |
| `crm_next_step` | Agreed next action (e.g. quote, meeting, send lane list) |

## Storage layers

1. **Primary structured store (recommended):** `leads.metadata` JSON (Postgres `JSONB`), nested under `metadata.logisticsQual` using the field IDs above. Existing migrations already add `metadata` on several entities; new logistics-specific columns are optional if JSON is sufficient.

2. **Operational sheet:** logistics Google Sheet rows remain the operator-facing mirror for Tom-style workflows; sheet column headers should map 1:1 to the same semantic fields where possible.

3. **Exports / CRM:** CSV and webhook payloads should include explicit columns or JSON blobs keyed by these IDs so downstream tools do not parse free-form transcripts as the source of truth.

## Voice script alignment

Vapi prompts and tool schemas should **collect into** these IDs (or map utterances to them in webhook enrichment) so dashboard and exports stay consistent without embedding internal tenant keys in customer-visible payloads.
