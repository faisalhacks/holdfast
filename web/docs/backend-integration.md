# Backend integration contract

UI code depends only on `SyndicateApi` in `src/lib/api/types.ts`. The live adapter
owns HTTP transport and maps backend payloads into these stable domain shapes.

## Frozen routes

- `GET /api/runs/:runId/summary`
- `GET /api/runs/:runId/exceptions?sort=amount_desc`
- `GET /api/exceptions/:id`
- `GET /api/exceptions/:id/timeline`
- `POST /api/exceptions/:id/decision`
- `POST /api/holds/:id/release`
- `POST /api/tolerances/changes`

The decision body is `{ resolution_path, owner_next, reason }`; resolution path
is `re_application`, `customer_outreach`, or `internal_correction`. Hold release
accepts `{ reason }`. Tolerance change accepts integer `{ from, to, scope,
reason }` and returns `{ affected_hold_ids: string[] }`. No other endpoint is
used by the frontend.

## Required backend fields

Run summary supplies `runId`, `open`, `inReview`, `routed`, `held`,
`money_at_risk_paise`, and `currency`. Queue rows supply identity and labels,
status/severity/category, agent/workflow/run provenance, entity reference,
integer `exposure_paise` or `null`, currency, timestamps, and optional assignee.
The queue response must supply `items`, `total`, `page`, and `pageSize`.

Exception detail adds optional policy, typed field comparisons, evidence
references, optional routing decision, optional hold state, and optional
tolerance context. Timeline is fetched separately. A comparison value is typed
as text, date, integer, or money; money contains integer `amount_paise` and a
currency code. Backend responses must not contain formatted currency strings or
floating monetary values. Missing reference evidence is `null`.

The UI requires the exception read after a mutation to reflect its new state.
The live adapter performs that refresh through the frozen exception and timeline
read routes. It does not infer hold release from a tolerance response.

## Remaining response-shape dependencies

The frozen update defines route and request shapes but does not define response
bodies for the three mutations, error payloads, or whether enum and timestamp
names already match the domain types. The adapter currently ignores mutation
response bodies, refreshes the exception, and treats unsuccessful HTTP status as
a generic error. Backend-specific aliases and not-found/conflict mapping belong
only in `src/lib/api/adapters/live` when those shapes are supplied.
