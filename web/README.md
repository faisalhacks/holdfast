# Holdfast web

The redesigned Holdfast accounts-payable review workstation. It is a separate
Next.js application from the frozen backend at the repository root.

The frontend contains the Holdfast landing page, the run overview, the
three-pane exception workstation, and the append-only audit view. Live mode
uses the root application's frozen routes and domain model; it does not fall
back to mock data when a request fails.

## Local development

Mock frontend only:

```powershell
cd C:\Projects\holdfast\web
npm install
npm run dev
```

Live frontend plus the root API, in two terminals:

```powershell
cd C:\Projects\holdfast
pnpm dev -- -p 3001
```

```powershell
cd C:\Projects\holdfast\web
$env:NEXT_PUBLIC_HOLDFAST_API_MODE = "live"
$env:NEXT_PUBLIC_HOLDFAST_RUN_ID = "run_engine_a"
$env:NEXT_PUBLIC_HOLDFAST_REVIEWER_ID = "rev_console"
$env:HOLDFAST_BACKEND_ORIGIN = "http://localhost:3001"
npm run dev
```

Open `http://localhost:3000`. The server-side rewrite proxies `/api/*` to the
root application, so the browser remains same-origin with the web frontend.

## Verification

```powershell
cd C:\Projects\holdfast\web
npm run check:boundaries
npm run typecheck
npm run build
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_HOLDFAST_API_MODE` | `mock` | Selects the mock or live adapter |
| `NEXT_PUBLIC_HOLDFAST_RUN_ID` | `run_engine_a` | Run used by queue and overview reads |
| `NEXT_PUBLIC_HOLDFAST_REVIEWER_ID` | `rev_console` | Named reviewer used by decision forms |
| `NEXT_PUBLIC_HOLDFAST_MOCK_LATENCY_MS` | `220` | Artificial mock latency |
| `NEXT_PUBLIC_HOLDFAST_API_BASE_URL` | empty | Optional browser-visible API origin |
| `HOLDFAST_BACKEND_ORIGIN` | empty | Server-side target for the local `/api` rewrite |

The repository has both a root `pnpm-lock.yaml` and a web
`package-lock.json` because these are independent applications. The web
configuration pins `turbopack.root` to this directory so Next does not infer
the repository root from the other lockfile.
