# Syndicate — web

Operations console for reviewing what the agent fleet could not decide on its
own. Next.js 16 (App Router) + React 19 + Tailwind CSS 4.

This is the **foundation build**. The exception queue and exception detail are
real; Overview, Run replay, and Audit log are deliberate placeholders.

```bash
npm install
npm run dev        # http://localhost:3000
npm run verify     # boundaries + typecheck + build
```

## Architecture

```
src/
├── app/                    routes — pages compose components and hooks only
│   ├── page.tsx                    Overview            (placeholder)
│   ├── exceptions/page.tsx         Exception queue     ← built
│   ├── exceptions/[exceptionId]/   Exception detail    ← built
│   ├── runs/page.tsx               Run replay          (placeholder)
│   └── audit/page.tsx              Audit log           (placeholder)
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
│   ├── format.ts           money / time / SLA formatting
│   └── labels.ts           display labels for domain enums
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

Tolerance changes expose the backend-returned affected hold IDs. The UI does
not infer hold releases.

## Configuration

See `.env.example`. All variables are optional in mock mode.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SYNDICATE_API_MODE` | `mock` | `mock` or `live` |
| `NEXT_PUBLIC_SYNDICATE_RUN_ID` | `run_demo_7f31` | run used by queue and summary reads |
| `NEXT_PUBLIC_SYNDICATE_MOCK_LATENCY_MS` | `220` | artificial latency, so loading and pending states are exercised |

## Known gaps

- Queue filters live in component state, not the URL, so a filtered queue is not
  shareable or restorable on reload.
- Authentication and reviewer attribution remain backend responsibilities.
- No tests and no linter yet — `verify` covers boundaries, types, and the build.
- The mock store is a module singleton. All mutations happen client-side, so this
  is per-tab in practice, but a future server-side mock would need per-request
  isolation.
- Overview, Run replay, and Audit log render planned scope, not real data.
