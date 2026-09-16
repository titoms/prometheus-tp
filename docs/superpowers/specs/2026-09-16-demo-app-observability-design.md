# Demo-app observability revamp — design spec

Date: 2026-09-16
Status: approved by user, ready for implementation planning

## 1. Goal

Turn the current minimal demo (Express app with `/slow`, `/error`, a
bare-bones traffic generator, and an incomplete docker-compose) into a
realistic, self-contained mini e-commerce API used as the practice
target for a 2-day Prometheus training. Students install the full
stack, explore application/system/container metrics, write PromQL,
build alerts, configure Alertmanager, build a Grafana dashboard, detect
simulated incidents, and export their dashboard as JSON.

Hard constraints carried over from the brief:
- No database, no auth, no architectural complexity beyond what's listed.
- Everything starts with `docker compose up -d --build` on a plain Debian VM.
- No high-cardinality Prometheus labels (no user_id/order_id/email/request_id/raw URL).
- Code must stay readable for sysadmin/DevOps students, not senior JS devs.

## 2. Architecture

Seven docker-compose services, all already stubbed in `docker-compose.yml`
(uncommitted) except for their config files, which don't exist yet:

```
prometheus   → scrapes prometheus, demo-app, node-exporter, cadvisor
grafana      → provisioned datasource (prometheus) + dashboards dir
alertmanager → single default route, "null" receiver (no real notification channel)
node-exporter
cadvisor
demo-app          (Express + prom-client, in-memory state only)
traffic-generator (Node script, no deps beyond built-in fetch)
```

No new services are introduced. `docker-compose.yml` itself needs no
further changes beyond what's already staged, except adding the new
traffic-generator env vars (section 5).

## 3. demo-app design

### 3.1 File layout

```
demo-app/
  server.js       — Express app, routes, metrics middleware, admin routes
  scenarios.js     — scenario config table + in-memory active-scenario state
  metrics.js        — prom-client registry + all custom metrics
  products.js        — static in-memory product catalog
  package.json / Dockerfile  — unchanged shape, same node:18-alpine base
```

Kept as four small focused files instead of one growing `server.js` so
each has one job: `metrics.js` declares *what* is measured, `scenarios.js`
declares *how behavior varies*, `products.js` is static data, `server.js`
wires HTTP routes to both.

### 3.2 State (in-memory only, reset on process restart)

`scenarios.js` exports:
- `SCENARIOS`: an object keyed by the 7 scenario names, each value a
  plain config object (see table below).
- `getActiveScenario()` / `setActiveScenario(name)`: the only mutation
  point. `setActiveScenario` validates `name` against `Object.keys(SCENARIOS)`,
  updates the `incident_active` gauge (current → 1, all others → 0),
  and updates the `dependency_status` gauge according to the scenario's
  `dependencies` overrides (anything not overridden returns to 1).
- `applyLatency(routeKey)`: returns a promise that resolves after a
  delay drawn from the active scenario's `latency[routeKey]` range
  (default `[50, 150]` ms when the scenario doesn't override that route).
- `shouldFail(routeKey)`: returns a boolean drawn against the active
  scenario's failure-rate table for that route key (default from the
  `normal` table when not overridden).

`server.js` never inspects `process.env` or scenario internals directly
for behavior — it only calls `applyLatency`/`shouldFail`/`setActiveScenario`.
This keeps the routes readable and the scenario tuning centralized.

### 3.3 Scenario parameter table

Route keys used by the config: `checkout`, `payment`, `recommendations`.

| Scenario | checkout latency (ms) | checkout fail rate | payment latency (ms) | payment fail rate | recommendations latency (ms) | recommendation fallback rate | dependencies forced to 0 |
|---|---|---|---|---|---|---|---|
| normal | 50-150 | 3% | 50-150 | 5% | 50-150 | 5% | none |
| high-error | 50-150 | 40% (→500) | 50-150 | 40% (→500) | 50-150 | 5% | none |
| high-latency | 1500-3000 | 3% | 50-150 | 5% | 1500-3000 | 5% | none |
| high-payment-failure | 50-150 | 3% | 50-150 | 70% | 50-150 | 5% | payment-gateway |
| checkout-degraded | 2000-4000 | 30% | 50-150 | 5% | 50-150 | 5% | none |
| recommendation-degraded | 50-150 | 3% | 50-150 | 5% | 1500-3000 | 60% (fallback, not error) | recommendation-engine |
| traffic-spike | 50-150 | 3% | 50-150 | 5% | 50-150 | 5% | none |

`traffic-spike` intentionally matches `normal` behavior — its only
effect is the `incident_active` label and the volume increase driven
externally by traffic-generator (section 4.2). This is deliberate: it
teaches students that a traffic spike alone isn't necessarily an
incident.

Failure semantics:
- `checkout` failure → respond 500, `orders_total{status="failed"}++`.
  Success → 200, `orders_total{status="success"}++`.
- `payment` failure → respond 402 (business-logic failure, not a
  server error, so it doesn't pollute `DemoAppHighErrorRate`),
  `payments_total{status="failed"}++` **and** `orders_total{status="failed"}++`
  (cascade: a failed payment means the order didn't go through, even
  though `/checkout` itself returned success earlier). Success → 200,
  `payments_total{status="success"}++`.
- `recommendations` never hard-fails in these scenarios; it returns
  200 with either a normal payload (`result="success"`) or a smaller
  static fallback payload (`result="fallback"`). `result="error"` is
  reserved on the metric for a genuine 500 (kept possible in code for
  completeness but no scenario currently drives it above ~1%).

`high-error` is the only scenario using real 500s (on `/checkout` and
`/payment`), which is what `DemoAppHighErrorRate` and the bonus
`HighPaymentFailureRate`/alerts key off.

### 3.4 Metrics (`metrics.js`)

All metrics registered on one `client.Registry()`, plus
`client.collectDefaultMetrics()` for Node process metrics (kept from
the current app — useful teaching material for "what does an exporter
give you for free").

```
http_requests_total                Counter  {method, route, status_code}
http_request_duration_seconds      Histogram {method, route, status_code}
  buckets: [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5]
orders_total                       Counter  {status}            # success|failed
payments_total                     Counter  {status}            # success|failed
cart_actions_total                 Counter  {action}             # add|remove
recommendation_requests_total      Counter  {result}       # success|fallback|error
active_users                       Gauge    (no labels)
dependency_status                  Gauge    {dependency}   # payment-gateway|recommendation-engine|inventory
incident_active                    Gauge    {incident}     # one of the 7 scenario names
```

`route` label always uses the Express route pattern (`req.route.path`,
e.g. `/products/:id`), never the resolved URL — this is already how
the current app avoids high cardinality and is kept as-is.

`active_users` is a simple bounded random walk updated every 5s by a
`setInterval` in `server.js` (e.g. wander between 5 and 80, independent
of scenario) — enough to give students a Gauge that moves without
needing real session tracking.

`dependency_status` starts all three dependencies at 1 and is only
ever changed by `setActiveScenario` per the table above.

`incident_active` is initialized with all 7 series present at process
start (loop over `SCENARIOS` keys and `.set(0)` each, then `.set(1)`
for `normal`) so Grafana/PromQL queries see all label values from the
first scrape instead of series appearing only once an incident fires.

### 3.5 Application endpoints

- `GET /` → plain `"OK"` text, no scenario effects.
- `GET /health` → `{status: "OK"}`.
- `GET /products` → static list from `products.js` (5–8 items:
  id, name, price, category).
- `GET /products/:id` → lookup by id; 404 JSON `{error: "not found"}`
  if missing.
- `POST /cart` → body `{productId, action}` (`action` ∈ `add|remove`,
  default `add` if omitted/invalid); always 200; increments
  `cart_actions_total{action}`. No real cart state is kept — this is a
  metrics-only stub, consistent with "no DB".
- `POST /checkout` → `applyLatency('checkout')` then `shouldFail('checkout')`
  decides success/failure per section 3.3.
- `POST /payment` → `applyLatency('payment')` then `shouldFail('payment')`
  decides success/failure per section 3.3 (with the orders cascade).
- `GET /recommendations` → `applyLatency('recommendations')` then a
  fallback roll decides `success` vs `fallback` payload.
- `GET /metrics` → unchanged, serves `register.metrics()`.

The old `/slow` and `/error` endpoints are removed — their teaching
purpose is now covered by the scenario system on real business routes,
which is more realistic.

### 3.6 Admin endpoints

- `GET /admin/status` → `{scenario, since, dependencies: {...}}` — lets
  the traffic-generator and students introspect current state without
  scraping `/metrics`.
- `POST /admin/scenario/normal|high-error|high-latency|high-payment-failure|checkout-degraded|recommendation-degraded|traffic-spike`
  → calls `setActiveScenario(name)`, returns `{scenario: name}`.
- `POST /admin/scenario/reset` → alias for `setActiveScenario('normal')`.

All admin routes are unauthenticated (constraint: no auth) and only
mutate the in-memory scenario state — no persistence, no side effects
outside the process, matching the brief exactly.

## 4. traffic-generator design

### 4.1 File layout

Single `index.js` stays a single file (it's intentionally small); split
into two logical loops inside it: `runUserJourneyWorker()` and
`runRandomIncidentDriver()`, started independently from the bottom of
the file.

### 4.2 Normal traffic: user journey workers

`CONCURRENCY` independent async workers loop forever, each iteration
running the 7-step journey from the brief (`GET /`, `GET /products`,
`GET /products/:id`, `POST /cart`, `POST /checkout`, `POST /payment`,
`GET /recommendations`), sleeping `INTERVAL_MS` between steps (not
between full journeys, so `INTERVAL_MS=1000` means "roughly a step a
second per worker"). Every HTTP call is wrapped in try/catch; a failed
call is logged (`[journey] STEP -> ERROR: message`) and the journey
continues to the next step rather than aborting — matches "ne pas
crasher si une requête échoue". Product id for `/products/:id` and
`/cart` is picked from the `/products` response so the journey stays
realistic without hardcoding ids.

For `traffic-spike`, the driver (4.3) temporarily raises the effective
worker count by `TRAFFIC_SPIKE_MULTIPLIER` (spawns extra short-lived
workers for the incident duration, then lets them finish) instead of
mutating `CONCURRENCY` globally.

### 4.3 Random incident driver (only when `ENABLE_RANDOM_INCIDENTS=true`)

Loop:
1. Sleep a random duration in
   `[RANDOM_INCIDENT_MIN_INTERVAL_MS, RANDOM_INCIDENT_MAX_INTERVAL_MS]`.
2. Pick one incident uniformly from: `high-error`, `high-latency`,
   `high-payment-failure`, `checkout-degraded`, `recommendation-degraded`,
   `traffic-spike`.
3. `POST {TARGET_URL}/admin/scenario/<incident>`; log it.
4. If the incident is `traffic-spike`, start `TRAFFIC_SPIKE_MULTIPLIER`
   extra journey workers for the duration of step 5.
5. Sleep a random duration in
   `[RANDOM_INCIDENT_MIN_DURATION_MS, RANDOM_INCIDENT_MAX_DURATION_MS]`.
6. `POST {TARGET_URL}/admin/scenario/reset`; stop any extra workers; log it.
7. Repeat from 1.

All admin calls go through the same try/catch-and-log pattern as
journey steps — a failed admin call must not crash the generator or
leave it stuck waiting on step 6 forever (use the same timeout-guarded
fetch helper as journeys).

### 4.4 Environment variables

All 9 from the brief, with defaults matching it:
`TARGET_URL`, `INTERVAL_MS`, `CONCURRENCY`, `ENABLE_RANDOM_INCIDENTS`,
`RANDOM_INCIDENT_MIN_INTERVAL_MS`, `RANDOM_INCIDENT_MAX_INTERVAL_MS`,
`RANDOM_INCIDENT_MIN_DURATION_MS`, `RANDOM_INCIDENT_MAX_DURATION_MS`,
`TRAFFIC_SPIKE_MULTIPLIER`. `docker-compose.yml`'s traffic-generator
service is updated to declare these (random incidents left `false` by
default so a fresh `docker compose up` gives students a stable,
predictable environment; the README explains how to flip it on).

## 5. Prometheus

### 5.1 `prometheus/prometheus.yml`

Global scrape interval 15s. Four jobs:
```
prometheus     → localhost:9090
demo-app       → demo-app:3001, metrics_path /metrics
node-exporter  → node-exporter:9100
cadvisor       → cadvisor:8080
```
Also references `rules.yml` via `rule_files`, and a placeholder
`alerting.alertmanagers` block pointing at `alertmanager:9093`.

### 5.2 `prometheus/rules.yml` — mandatory alerts

```yaml
- alert: DemoAppDown
  expr: up{job="demo-app"} == 0
  for: 1m
  labels: {severity: critical}
  annotations:
    summary: "demo-app is down"
    description: "Prometheus can't scrape demo-app for 1 minute."

- alert: DemoAppHighErrorRate
  expr: |
    sum(rate(http_requests_total{job="demo-app",status_code=~"5.."}[5m]))
    /
    sum(rate(http_requests_total{job="demo-app"}[5m])) > 0.1
  for: 2m
  labels: {severity: warning}
  annotations:
    summary: "demo-app error rate above 10%"
    description: "More than 10% of requests returned 5xx over the last 5 minutes."

- alert: DemoAppHighLatencyP95
  expr: |
    histogram_quantile(0.95,
      sum(rate(http_request_duration_seconds_bucket{job="demo-app"}[5m])) by (le)
    ) > 1
  for: 2m
  labels: {severity: warning}
  annotations:
    summary: "demo-app p95 latency above 1s"
    description: "95th percentile request latency exceeded 1 second for 2 minutes."
```

These three must be triggerable on demand: `DemoAppDown` by stopping
the container, `DemoAppHighErrorRate` by `high-error`, `DemoAppHighLatencyP95`
by `high-latency` or `checkout-degraded`.

### 5.3 `docs/ALERTES_BONUS.md` — copy-paste alerts (not loaded by default)

Nine ready-to-paste rules, one per bullet in the brief
(`HighPaymentFailureRate`, `HighCheckoutLatencyP95`,
`RecommendationServiceDegraded`, `NoSuccessfulOrders`, `ExporterDown`,
`HighCPUUsage`, `HighMemoryUsage`, `LowDiskSpace`, `ContainerHighCPU`),
each with the PromQL expression, a `for:`, and one sentence on what
scenario/condition triggers it. Students paste these into `rules.yml`
themselves as a Day-2 exercise — this is why they live in `docs/`
rather than being pre-loaded.

## 6. Alertmanager

`alertmanager/alertmanager.yml`: one route, one receiver named `default`
with no `*_configs` (a valid "black hole" receiver — Alertmanager
accepts and displays the alert in its UI at :9093 but sends no
notification anywhere). `group_by: [alertname]`, short `group_wait`/`repeat_interval`
tuned for a training (e.g. 30s / 10m) so students see alerts fire
quickly during the exercises. README/JOUR_2 documents how to swap in a
real Slack/webhook receiver as an optional stretch exercise — not
built, per the "no added complexity" constraint.

## 7. Grafana

- `grafana/provisioning/datasources/prometheus.yml`: one datasource,
  `Prometheus` @ `http://prometheus:9090`, default, proxy access.
- `grafana/provisioning/dashboards/dashboards.yml`: one provider
  pointing at `/var/lib/grafana/dashboards` (the mounted `grafana/dashboards/`
  host dir), `allowUiUpdates: true` so students can edit in the UI.
- `grafana/dashboards/starter.json`: a minimal 3-panel dashboard
  (Targets UP, Targets DOWN, HTTP traffic by route) that exists purely
  to prove provisioning works end to end on first boot. The full
  17-panel dashboard from the brief is a **documented exercise**
  (panel list + suggested PromQL per panel in `docs/JOUR_2_TP.md`), not
  a pre-built artifact — the brief's own success criteria list "export
  JSON du dashboard" as a student deliverable, so pre-building it would
  remove the exercise.

## 8. Documentation

Six files as specified, kept in `docs/` (`README.md` at repo root):
1. `README.md` — quickstart (`docker compose up -d --build`), service
   URLs/ports table, curl commands to hit every scenario endpoint, how
   to enable random incidents, link to the other docs.
2. `docs/JOUR_1.md` — install/verify stack, tour of `/metrics`, first
   PromQL queries, a first alert, a first Grafana panel. Guided,
   step-by-step.
3. `docs/JOUR_2_TP.md` — the graded/self-directed exercise: context,
   objectives, the full panel list to build, alerts to write, incidents
   to detect (using random-incident mode or manual scenario calls),
   dashboard JSON export steps, a restitution checklist.
4. `docs/PROMQL_CHEATSHEET.md` — ~15-20 annotated queries covering
   rate/increase, histogram_quantile, error ratios, resource usage,
   business metrics.
5. `docs/ALERTES_BONUS.md` — per section 5.3.
6. `docs/INCIDENTS.md` — one subsection per scenario: what it does,
   which metrics move, which Grafana panels show it, which alerts
   (core + bonus) should fire and roughly when.

## 9. Testing / acceptance

Manual verification only (no test framework introduced — consistent
with "keep it simple" and no existing test tooling in the repo):

1. `docker compose up -d --build` — all 7 containers reach `running`/`healthy`.
2. `curl localhost:3001/metrics` exposes all 9 custom metric families.
3. Prometheus targets page (`:9090/targets`) shows all 4 jobs `UP`.
4. Each `POST /admin/scenario/<name>` visibly moves the metrics
   described in section 3.3 within one scrape interval, and
   `incident_active` flips correctly (exactly one series at 1).
5. Stopping `demo-app` fires `DemoAppDown` in Prometheus alerts within
   ~1 minute; `high-error` fires `DemoAppHighErrorRate`; `high-latency`
   fires `DemoAppHighLatencyP95`. All three visible in Alertmanager
   (`:9093`).
6. Grafana loads with the Prometheus datasource already configured and
   the starter dashboard visible under Dashboards.
7. `traffic-generator` logs show journeys running continuously and
   surviving at least one forced `demo-app` restart without crashing.
8. With `ENABLE_RANDOM_INCIDENTS=true`, at least one incident cycle
   (start → duration → reset) is observed end-to-end in the logs
   within a shortened test window (e.g. temporarily lower the interval
   env vars for the test, not part of the shipped defaults).

## 10. File manifest

New:
- `demo-app/scenarios.js`, `demo-app/metrics.js`, `demo-app/products.js`
- `prometheus/prometheus.yml`, `prometheus/rules.yml`
- `alertmanager/alertmanager.yml`
- `grafana/provisioning/datasources/prometheus.yml`
- `grafana/provisioning/dashboards/dashboards.yml`
- `grafana/dashboards/starter.json`
- `README.md`
- `docs/JOUR_1.md`, `docs/JOUR_2_TP.md`, `docs/PROMQL_CHEATSHEET.md`,
  `docs/ALERTES_BONUS.md`, `docs/INCIDENTS.md`

Modified:
- `demo-app/server.js` (rewritten around the new modules)
- `traffic-generator/index.js` (rewritten per section 4)
- `traffic-generator/package.json` (no new deps expected — `fetch` is
  built into Node 18+)
- `docker-compose.yml` (add the new traffic-generator env vars; the
  service blocks for prometheus/grafana/alertmanager/node-exporter/cadvisor
  are already staged and don't need further changes)

No changes to `demo-app/Dockerfile` or `traffic-generator/Dockerfile`
(both already correct for this design — plain `node:18-alpine`, no new
system deps).
