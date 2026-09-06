# Holdfast — web

The accounts-payable exception review workstation. Next.js 16 (App Router) +
React 19 + Tailwind CSS 4.

Three panes: the money-ordered intake queue on the left, the diagnostic ledger
in the centre, and the routing, hold, tolerance and audit console on the right.
Every screen is backed by a frozen API route — there are no placeholder
surfaces, because a workstation that advertises screens it cannot open is not
one.

```bash
npm install
npm run dev        # http://localhost:3000
npm run verify     # boundaries + typecheck + build
```

## Architecture

```
src/
├── app/                    routes — pages compose components and hooks only
│   ├── page.tsx                    Overview: run summary + composition
│   ├── exceptions/layout.tsx       three-pane frame; owns the queue pane
│   ├── exceptions/page.tsx         centre pane, nothing selected
│   └── exceptions/[exceptionId]/   ledger + action console
├── components/             presentation only, no data access
├── hooks/                  data access, via `@/lib/api`
├── lib/
│   ├── api/
│   │   ├── types.ts        the contract: domain types + `SyndicateApi`
│   │   ├── index.ts        adapter selection; exports the `api` singleton
│   │   └── adapters/
│   │       ├── mock/       in-memory demo adapter (the only fixture consumer)
│   │       └── live/       backend transport mapping
│   ├── config.ts           env-driven settings
│   ├── format.ts           money / time / SLA formatting, and field deltas
│   ├── keyboard.ts         shortcut guards
│   ├── labels.ts           display labels for domain enums
│   └── revalidate.ts       "a write happened" channel, so the queue re-reads
└── mocks/fixtures/         demo data only — never imported by UI code
```

### The adapter layer

Pages, components, and hooks import **only** from `@/lib/api`. They never touch
a concrete adapter or the fixtures. Two consequences:

- swapping in the real backend is a one-file change in `src/lib/api/index.ts`;
- deleting `src/mocks/` cannot break a component.

`npm run check:boundaries` enforces both rules and runs as part of
`npm run verify`.

The exact frontend data requirements and mutation semantics are documented in
[`docs/backend-integration.md`](docs/backend-integration.md). The document does
not prescribe endpoint URLs or transport payloads.

### Demo mutations

The three write paths — **route action**, **release hold**, and **change
tolerance** — are implemented in `src/lib/api/adapters/mock/index.ts`.
They mutate a module-level object seeded from fixtures:

- decisions survive client-side navigation, and reset on a full page reload;
- no request leaves the browser;
- each mutation returns an `AdapterNotice` with `level: "demo"`, which the UI
  renders verbatim above the exception, so a reviewer is never misled into
  thinking an action was recorded somewhere durable;
- a persistent banner in the app shell reports the active data source, driven by
  `api.info.isMock` rather than by an environment check in a component.

Tolerance changes expose the backend-returned affected hold IDs, including an
empty list, which is rendered as such. The UI does not infer hold releases.

## What the contract does not carry

The engine domain model in `lib/types.ts` is richer than the frontend contract.
These are deliberately absent rather than guessed at, and adding any of them is
a backend contract change:

- typed hold codes, `auto_releasable`, and `blocks_accounting`; a hold here has
  an amount, a reason, an id, and a status, and `hold` is singular;
- structured conflict codes — the conflict summary bar restates the failing
  fields and hold state already rendered above it, and emits no ERP tokens;
- any pre-flight tolerance simulation. The API cannot say what a proposed
  threshold would release until the change is made, so no capital-release or
  workload figure is shown;
- `owner_next` as a role enum. It is a free-text string on the wire, so it is a
  free-text field in the UI.

`low_confidence` remains the wire value for its category; the label a reviewer
reads is "Below threshold", because a model's opinion of itself is not evidence
and this console does not report one. The enum is a backend contract value and
is not renamed here; only the words on screen change.

## Keyboard

`j`/`k` move the queue highlight, `Enter` opens, `/` searches, `]` toggles the
action console, and `r`/`h`/`t`/`a` reveal a console section. **No shortcut
commits a mutation.** Routing, hold release, and tolerance change each require
an explicit form submit.

## Configuration

See `.env.example`. All variables are optional in mock mode.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SYNDICATE_API_MODE` | `mock` | `mock` or `live` |
| `NEXT_PUBLIC_SYNDICATE_RUN_ID` | `run_demo_7f31` | run used by queue and summary reads |
| `NEXT_PUBLIC_SYNDICATE_MOCK_LATENCY_MS` | `220` | artificial latency, so loading and pending states are exercised |

## Known gaps

- Authentication and reviewer attribution remain backend responsibilities: the
  UI states that a decision is recorded with your name, and the backend is what
  supplies the name.
- No tests and no linter yet — `verify` covers boundaries, types, and the build.
- The mock dataset is a module singleton. All mutations happen client-side, so
  this is per-tab in practice, but a future server-side mock would need
  per-request isolation.
- The live adapter fetches a run and filters and pages it in the browser. That
  is fine at review scale and wrong at ledger scale.
- Overview counts composition over the page it fetched and says so on the panel.
  There is no history endpoint, so there is no trend on that screen.
