# Demo-app Observability Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the demo repo into a realistic, self-contained mini e-commerce API (demo-app + traffic-generator) and a complete Prometheus/Alertmanager/Grafana stack, usable as the hands-on target for a 2-day Prometheus training.

**Architecture:** An Express app (`demo-app`) exposes business + admin endpoints and a `/metrics` endpoint via `prom-client`. All simulated behavior (latency, failure rates, degraded dependencies) is driven by a single in-memory "active scenario" that admin endpoints switch. `traffic-generator` is a dependency-free Node script that continuously drives realistic user journeys against `demo-app` and, optionally, randomly triggers/reverts scenarios. Prometheus scrapes `demo-app`, `node-exporter`, and `cadvisor`; Alertmanager receives alerts (no external notification channel); Grafana is provisioned with the Prometheus datasource and one starter dashboard.

**Tech Stack:** Node.js 18 (built-in `fetch`, no new npm dependencies), Express 4, prom-client 15, Docker Compose, Prometheus, Alertmanager, Grafana, node-exporter, cAdvisor.

**Spec:** `docs/superpowers/specs/2026-09-16-demo-app-observability-design.md`

## Global Constraints

- No database, no authentication anywhere (including `/admin/*`).
- Don't add architectural complexity beyond what's in the spec — no new services, no new npm dependencies beyond what's already in `package.json`.
- No test framework is introduced; verification is manual (`curl`, `docker compose`, Prometheus/Grafana UIs), per spec §9.
- Every Prometheus label set must stay low-cardinality: only `method`, `route` (Express route pattern, never resolved URL/id), `status_code`, `status`, `action`, `result`, `dependency`, `incident`. Never `user_id`, `order_id`, `email`, `request_id`, or a raw URL.
- The whole stack must come up with `docker compose up -d --build` on a plain Debian VM — no host-OS-specific assumptions beyond what's already in `docker-compose.yml` (node-exporter/cadvisor mounts already handle Linux hosts).
- Only one `incident_active{incident=...}` series may be `1` at any time; all others `0`.
- French for all student-facing documentation (README, docs/*) and for in-app log lines, matching the existing repo's language. Code identifiers and comments in English are fine (matches current `metrics.js`-style existing code), but keep existing French comment style in `server.js`/`index.js` since that's the established pattern.

---

### Task 1: demo-app metrics registry and product catalog

**Files:**
- Create: `demo-app/metrics.js`
- Create: `demo-app/products.js`

**Interfaces:**
- Consumes: `prom-client` (already a dependency in `demo-app/package.json`).
- Produces:
  - `metrics.js` exports `{ register, httpRequestsTotal, httpRequestDuration, ordersTotal, paymentsTotal, cartActionsTotal, recommendationRequestsTotal, activeUsers, dependencyStatus, incidentActive }`.
  - `products.js` exports `{ getAllProducts, getProductById }` where `getProductById(id)` accepts a string or number and returns `undefined` if not found.

- [ ] **Step 1: Create `demo-app/metrics.js`**

```js
/**
 * metrics.js — Prometheus registry and metric declarations for demo-app.
 * Routes never create metrics ad hoc; they import the instances below.
 */

const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests received',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5],
  registers: [register],
});

const ordersTotal = new client.Counter({
  name: 'orders_total',
  help: 'Total number of orders, by outcome',
  labelNames: ['status'],
  registers: [register],
});

const paymentsTotal = new client.Counter({
  name: 'payments_total',
  help: 'Total number of payment attempts, by outcome',
  labelNames: ['status'],
  registers: [register],
});

const cartActionsTotal = new client.Counter({
  name: 'cart_actions_total',
  help: 'Total number of cart actions, by type',
  labelNames: ['action'],
  registers: [register],
});

const recommendationRequestsTotal = new client.Counter({
  name: 'recommendation_requests_total',
  help: 'Total number of recommendation requests, by result',
  labelNames: ['result'],
  registers: [register],
});

const activeUsers = new client.Gauge({
  name: 'active_users',
  help: 'Simulated number of currently active users',
  registers: [register],
});

const dependencyStatus = new client.Gauge({
  name: 'dependency_status',
  help: 'Simulated dependency health: 1 = OK, 0 = degraded',
  labelNames: ['dependency'],
  registers: [register],
});

const incidentActive = new client.Gauge({
  name: 'incident_active',
  help: 'Which simulated incident scenario is currently active (1) vs inactive (0)',
  labelNames: ['incident'],
  registers: [register],
});

module.exports = {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  ordersTotal,
  paymentsTotal,
  cartActionsTotal,
  recommendationRequestsTotal,
  activeUsers,
  dependencyStatus,
  incidentActive,
};
```

- [ ] **Step 2: Create `demo-app/products.js`**

```js
/**
 * products.js — static in-memory product catalog. No database.
 */

const PRODUCTS = [
  { id: 1, name: 'Casque audio sans fil', price: 79.99, category: 'audio' },
  { id: 2, name: 'Clavier mécanique', price: 129.0, category: 'informatique' },
  { id: 3, name: 'Souris ergonomique', price: 39.5, category: 'informatique' },
  { id: 4, name: 'Enceinte Bluetooth', price: 59.99, category: 'audio' },
  { id: 5, name: 'Webcam HD', price: 45.0, category: 'informatique' },
  { id: 6, name: 'Support pour ordinateur portable', price: 25.0, category: 'accessoire' },
  { id: 7, name: 'Chargeur USB-C rapide', price: 19.99, category: 'accessoire' },
  { id: 8, name: 'Écouteurs intra-auriculaires', price: 34.99, category: 'audio' },
];

function getAllProducts() {
  return PRODUCTS;
}

function getProductById(id) {
  return PRODUCTS.find((p) => p.id === Number(id));
}

module.exports = { getAllProducts, getProductById };
```

- [ ] **Step 3: Sanity-check both modules load**

Run: `node -e "require('./demo-app/metrics.js'); const p = require('./demo-app/products.js'); console.log(p.getAllProducts().length, p.getProductById(1), p.getProductById(999));"`
Expected: prints `8 { id: 1, name: 'Casque audio sans fil', price: 79.99, category: 'audio' } undefined` — no thrown errors. (Run from the repo root; `demo-app/node_modules` must exist — run `npm install --prefix demo-app` first if it doesn't.)

- [ ] **Step 4: Commit**

```bash
git add demo-app/metrics.js demo-app/products.js
git commit -m "feat(demo-app): add metrics registry and product catalog modules"
```

---

### Task 2: demo-app scenario engine

**Files:**
- Create: `demo-app/scenarios.js`

**Interfaces:**
- Consumes: `demo-app/metrics.js` → `{ dependencyStatus, incidentActive }` (Task 1).
- Produces: `scenarios.js` exports `{ SCENARIO_NAMES, getActiveScenario, getStatus, setActiveScenario, initMetrics, applyLatency, shouldFail, shouldFallback }`.
  - `setActiveScenario(name)` throws `Error` on an unknown name; otherwise updates state + the `incident_active`/`dependency_status` gauges and returns the new active name.
  - `getStatus()` returns `{ scenario, since (ISO string), dependencies: { 'payment-gateway': 0|1, 'recommendation-engine': 0|1, inventory: 0|1 } }`.
  - `applyLatency(routeKey)` returns a `Promise<void>` that resolves after the scenario's configured delay for `'checkout' | 'payment' | 'recommendations'`.
  - `shouldFail(routeKey)` returns `boolean` for `'checkout' | 'payment'`.
  - `shouldFallback()` returns `boolean` for the recommendations route.
  - `initMetrics()` must be called once at app startup to seed all 7 `incident_active` series and all 3 `dependency_status` series.

- [ ] **Step 1: Create `demo-app/scenarios.js`**

```js
/**
 * scenarios.js — in-memory scenario engine.
 *
 * The "active scenario" is the single source of truth for how demo-app
 * behaves. Routes never branch on process.env or ad-hoc flags — they
 * call applyLatency()/shouldFail()/shouldFallback(), which read the
 * active scenario's config below. This keeps behavior tuning in one
 * place instead of scattered across route handlers.
 */

const { dependencyStatus, incidentActive } = require('./metrics');

const DEPENDENCIES = ['payment-gateway', 'recommendation-engine', 'inventory'];

const SCENARIOS = {
  normal: {
    latency: { checkout: [50, 150], payment: [50, 150], recommendations: [50, 150] },
    failureRate: { checkout: 0.03, payment: 0.05 },
    fallbackRate: { recommendations: 0.05 },
    degradedDependencies: [],
  },
  'high-error': {
    latency: { checkout: [50, 150], payment: [50, 150], recommendations: [50, 150] },
    failureRate: { checkout: 0.4, payment: 0.4 },
    fallbackRate: { recommendations: 0.05 },
    degradedDependencies: [],
  },
  'high-latency': {
    latency: { checkout: [1500, 3000], payment: [50, 150], recommendations: [1500, 3000] },
    failureRate: { checkout: 0.03, payment: 0.05 },
    fallbackRate: { recommendations: 0.05 },
    degradedDependencies: [],
  },
  'high-payment-failure': {
    latency: { checkout: [50, 150], payment: [50, 150], recommendations: [50, 150] },
    failureRate: { checkout: 0.03, payment: 0.7 },
    fallbackRate: { recommendations: 0.05 },
    degradedDependencies: ['payment-gateway'],
  },
  'checkout-degraded': {
    latency: { checkout: [2000, 4000], payment: [50, 150], recommendations: [50, 150] },
    failureRate: { checkout: 0.3, payment: 0.05 },
    fallbackRate: { recommendations: 0.05 },
    degradedDependencies: [],
  },
  'recommendation-degraded': {
    latency: { checkout: [50, 150], payment: [50, 150], recommendations: [1500, 3000] },
    failureRate: { checkout: 0.03, payment: 0.05 },
    fallbackRate: { recommendations: 0.6 },
    degradedDependencies: ['recommendation-engine'],
  },
  'traffic-spike': {
    latency: { checkout: [50, 150], payment: [50, 150], recommendations: [50, 150] },
    failureRate: { checkout: 0.03, payment: 0.05 },
    fallbackRate: { recommendations: 0.05 },
    degradedDependencies: [],
  },
};

const SCENARIO_NAMES = Object.keys(SCENARIOS);

let active = 'normal';
let since = new Date();

function getActiveScenario() {
  return active;
}

function getStatus() {
  const dependencies = {};
  for (const dep of DEPENDENCIES) {
    dependencies[dep] = SCENARIOS[active].degradedDependencies.includes(dep) ? 0 : 1;
  }
  return { scenario: active, since: since.toISOString(), dependencies };
}

function setActiveScenario(name) {
  if (!SCENARIO_NAMES.includes(name)) {
    throw new Error(`Unknown scenario: ${name}`);
  }
  active = name;
  since = new Date();

  for (const scenarioName of SCENARIO_NAMES) {
    incidentActive.labels({ incident: scenarioName }).set(scenarioName === active ? 1 : 0);
  }

  const degraded = SCENARIOS[active].degradedDependencies;
  for (const dep of DEPENDENCIES) {
    dependencyStatus.labels({ dependency: dep }).set(degraded.includes(dep) ? 0 : 1);
  }

  return active;
}

function initMetrics() {
  setActiveScenario('normal');
}

function applyLatency(routeKey) {
  const [min, max] = SCENARIOS[active].latency[routeKey];
  const delay = min + Math.floor(Math.random() * (max - min + 1));
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function shouldFail(routeKey) {
  const rate = SCENARIOS[active].failureRate[routeKey] || 0;
  return Math.random() < rate;
}

function shouldFallback() {
  const rate = SCENARIOS[active].fallbackRate.recommendations || 0;
  return Math.random() < rate;
}

module.exports = {
  SCENARIO_NAMES,
  getActiveScenario,
  getStatus,
  setActiveScenario,
  initMetrics,
  applyLatency,
  shouldFail,
  shouldFallback,
};
```

- [ ] **Step 2: Sanity-check the module**

Run:
```bash
node -e "
const s = require('./demo-app/scenarios.js');
s.initMetrics();
console.log(s.SCENARIO_NAMES);
console.log(s.getStatus());
s.setActiveScenario('high-payment-failure');
console.log(s.getStatus());
try { s.setActiveScenario('bogus'); } catch (e) { console.log('threw as expected:', e.message); }
"
```
Expected: prints the 7 scenario names, a status object with `scenario: 'normal'` and all dependencies `1`, then a status object with `scenario: 'high-payment-failure'` and `payment-gateway: 0`, then `threw as expected: Unknown scenario: bogus`.

- [ ] **Step 3: Commit**

```bash
git add demo-app/scenarios.js
git commit -m "feat(demo-app): add in-memory scenario engine"
```

---

### Task 3: demo-app server — routes, admin API, wiring

**Files:**
- Modify: `demo-app/server.js` (full rewrite)

**Interfaces:**
- Consumes: `metrics.js` (Task 1), `products.js` (Task 1), `scenarios.js` (Task 2) — all exports listed above.
- Produces: a running HTTP server on port 3001 exposing every endpoint listed in the spec §3.5/§3.6.

- [ ] **Step 1: Replace `demo-app/server.js` with the full rewrite**

```js
/**
 * demo-app — mini e-commerce API instrumented with Prometheus.
 * Formation Prometheus de A à Z
 *
 * Le comportement (latence, erreurs, dépendances dégradées) est piloté
 * par un "scénario" actif en mémoire (voir scenarios.js), modifiable via
 * les routes /admin/scenario/* — utile pour simuler des incidents en
 * formation, sans authentification ni base de données.
 */

const express = require('express');
const {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  ordersTotal,
  paymentsTotal,
  cartActionsTotal,
  recommendationRequestsTotal,
  activeUsers,
} = require('./metrics');
const {
  SCENARIO_NAMES,
  getStatus,
  setActiveScenario,
  initMetrics,
  applyLatency,
  shouldFail,
  shouldFallback,
} = require('./scenarios');
const { getAllProducts, getProductById } = require('./products');

const app = express();
app.use(express.json());
const PORT = 3001;

initMetrics();

// ─── Utilisateurs actifs simulés ────────────────────────────────────────────
// Marche aléatoire bornée, indépendante du scénario — juste pour avoir une
// Gauge qui bouge naturellement dans les dashboards.
let simulatedActiveUsers = 20;
activeUsers.set(simulatedActiveUsers);
setInterval(() => {
  const delta = Math.floor(Math.random() * 11) - 5; // -5..+5
  simulatedActiveUsers = Math.max(5, Math.min(80, simulatedActiveUsers + delta));
  activeUsers.set(simulatedActiveUsers);
}, 5000);

// ─── Middleware de tracking ─────────────────────────────────────────────────
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    // req.route.path donne la route paramétrée (/products/:id), pas l'URL réelle
    const route = req.route ? req.route.path : req.path;
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    httpRequestsTotal.labels(labels).inc();
    end(labels);
  });
  next();
});

// ─── Routes applicatives ────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.send('OK');
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

app.get('/products', (req, res) => {
  res.json(getAllProducts());
});

app.get('/products/:id', (req, res) => {
  const product = getProductById(req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json(product);
});

app.post('/cart', (req, res) => {
  const action = req.body && req.body.action === 'remove' ? 'remove' : 'add';
  cartActionsTotal.labels({ action }).inc();
  res.json({ action, productId: req.body ? req.body.productId : undefined });
});

// Échec = 500 (compte dans le taux d'erreur HTTP global)
app.post('/checkout', async (req, res) => {
  await applyLatency('checkout');
  if (shouldFail('checkout')) {
    ordersTotal.labels({ status: 'failed' }).inc();
    return res.status(500).json({ error: 'checkout failed' });
  }
  ordersTotal.labels({ status: 'success' }).inc();
  res.json({ status: 'order created' });
});

// Échec = 402 (échec métier, ne pollue pas le taux d'erreur HTTP 5xx) —
// mais fait quand même échouer la commande associée (cascade).
app.post('/payment', async (req, res) => {
  await applyLatency('payment');
  if (shouldFail('payment')) {
    paymentsTotal.labels({ status: 'failed' }).inc();
    ordersTotal.labels({ status: 'failed' }).inc();
    return res.status(402).json({ error: 'payment failed' });
  }
  paymentsTotal.labels({ status: 'success' }).inc();
  res.json({ status: 'payment accepted' });
});

app.get('/recommendations', async (req, res) => {
  await applyLatency('recommendations');
  if (shouldFallback()) {
    recommendationRequestsTotal.labels({ result: 'fallback' }).inc();
    return res.json({ result: 'fallback', items: ['Casque audio sans fil'] });
  }
  recommendationRequestsTotal.labels({ result: 'success' }).inc();
  res.json({ result: 'success', items: getAllProducts().slice(0, 3).map((p) => p.name) });
});

// Endpoint scrapé par Prometheus — NE PAS sécuriser en prod sans auth
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

// ─── Routes admin (mémoire uniquement, pas d'auth — outil de formation) ────

app.get('/admin/status', (req, res) => {
  res.json(getStatus());
});

// Doit être déclarée AVANT /admin/scenario/:name pour matcher en premier.
app.post('/admin/scenario/reset', (req, res) => {
  setActiveScenario('normal');
  res.json({ scenario: 'normal' });
});

app.post('/admin/scenario/:name', (req, res) => {
  const { name } = req.params;
  if (!SCENARIO_NAMES.includes(name)) {
    return res.status(404).json({ error: `unknown scenario: ${name}` });
  }
  setActiveScenario(name);
  res.json({ scenario: name });
});

// ─── Démarrage ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Demo app démarrée sur le port ${PORT}`);
  console.log(`  http://localhost:${PORT}/`);
  console.log(`  http://localhost:${PORT}/metrics`);
});
```

- [ ] **Step 2: Build and start just demo-app**

Run: `docker compose up -d --build demo-app`
Expected: image builds successfully, container `demo-app` is `running`.

- [ ] **Step 3: Verify the business endpoints**

Run these and check the responses:
```bash
curl -s localhost:3001/ 
curl -s localhost:3001/health
curl -s localhost:3001/products
curl -s localhost:3001/products/1
curl -s localhost:3001/products/999
curl -s -X POST localhost:3001/cart -H 'Content-Type: application/json' -d '{"productId":1,"action":"add"}'
curl -s -X POST localhost:3001/checkout
curl -s -X POST localhost:3001/payment
curl -s localhost:3001/recommendations
```
Expected: `OK`, `{"status":"OK"}`, an 8-item array, product id 1, `{"error":"not found"}` (404), a cart confirmation, an order/payment/recommendation JSON response each (status varies with randomness, that's expected).

- [ ] **Step 4: Verify the admin endpoints and scenario effects**

```bash
curl -s localhost:3001/admin/status
curl -s -X POST localhost:3001/admin/scenario/high-payment-failure
curl -s localhost:3001/admin/status
for i in $(seq 1 20); do curl -s -o /dev/null -X POST localhost:3001/payment; done
curl -s localhost:3001/metrics | grep -E 'payments_total|orders_total|dependency_status|incident_active'
curl -s -X POST localhost:3001/admin/scenario/reset
curl -s localhost:3001/admin/status
```
Expected: first status shows `scenario: "normal"`; after switching, status shows `scenario: "high-payment-failure"` and `dependencies["payment-gateway"]: 0`; after 20 payment calls, `payments_total{status="failed"}` is clearly non-zero (~14/20) and `dependency_status{dependency="payment-gateway"} 0` and `incident_active{incident="high-payment-failure"} 1` with all other `incident_active` series at `0`; after reset, status returns to `normal` and dependency back to `1`.

- [ ] **Step 5: Commit**

```bash
git add demo-app/server.js
git commit -m "feat(demo-app): rewrite server around scenario engine, add business+admin endpoints"
```

---

### Task 4: docker-compose traffic-generator environment variables

**Files:**
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: nothing new.
- Produces: the 9 env vars from spec §4.4 available inside the `traffic-generator` container.

- [ ] **Step 1: Edit the `traffic-generator` service block**

Replace:
```yaml
  traffic-generator:
    build: ./traffic-generator
    container_name: traffic-generator
    environment:
      - TARGET_URL=http://demo-app:3001
      - INTERVAL_MS=2000          # une requête toutes les 2 secondes
    depends_on:
      - demo-app
    restart: unless-stopped
```
With:
```yaml
  traffic-generator:
    build: ./traffic-generator
    container_name: traffic-generator
    environment:
      - TARGET_URL=http://demo-app:3001
      - INTERVAL_MS=1000
      - CONCURRENCY=2
      - ENABLE_RANDOM_INCIDENTS=false
      - RANDOM_INCIDENT_MIN_INTERVAL_MS=360000
      - RANDOM_INCIDENT_MAX_INTERVAL_MS=720000
      - RANDOM_INCIDENT_MIN_DURATION_MS=120000
      - RANDOM_INCIDENT_MAX_DURATION_MS=300000
      - TRAFFIC_SPIKE_MULTIPLIER=4
    depends_on:
      - demo-app
    restart: unless-stopped
```

- [ ] **Step 2: Validate compose file syntax**

Run: `docker compose config --quiet`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore(compose): wire traffic-generator scenario/incident env vars"
```

---

### Task 5: traffic-generator rewrite

**Files:**
- Modify: `traffic-generator/index.js` (full rewrite)

**Interfaces:**
- Consumes: `demo-app` HTTP surface — `GET /`, `GET /products`, `GET /products/:id`, `POST /cart`, `POST /checkout`, `POST /payment`, `GET /recommendations`, `POST /admin/scenario/:name`, `POST /admin/scenario/reset` (Task 3).
- Produces: continuous log output; no files consumed by later tasks.

- [ ] **Step 1: Replace `traffic-generator/index.js` with the full rewrite**

```js
/**
 * traffic-generator — Formation Prometheus de A à Z
 *
 * Simule des parcours utilisateurs normaux contre demo-app, et,
 * optionnellement, déclenche/annule des incidents aléatoires via
 * l'API admin de demo-app pour rendre les métriques vivantes.
 *
 * Variables d'environnement : voir README.md.
 */

const TARGET_URL = process.env.TARGET_URL || 'http://demo-app:3001';
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '1000', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '2', 10);
const ENABLE_RANDOM_INCIDENTS = process.env.ENABLE_RANDOM_INCIDENTS === 'true';
const RANDOM_INCIDENT_MIN_INTERVAL_MS = parseInt(process.env.RANDOM_INCIDENT_MIN_INTERVAL_MS || '360000', 10);
const RANDOM_INCIDENT_MAX_INTERVAL_MS = parseInt(process.env.RANDOM_INCIDENT_MAX_INTERVAL_MS || '720000', 10);
const RANDOM_INCIDENT_MIN_DURATION_MS = parseInt(process.env.RANDOM_INCIDENT_MIN_DURATION_MS || '120000', 10);
const RANDOM_INCIDENT_MAX_DURATION_MS = parseInt(process.env.RANDOM_INCIDENT_MAX_DURATION_MS || '300000', 10);
const TRAFFIC_SPIKE_MULTIPLIER = parseInt(process.env.TRAFFIC_SPIKE_MULTIPLIER || '4', 10);

const RANDOM_INCIDENTS = [
  'high-error',
  'high-latency',
  'high-payment-failure',
  'checkout-degraded',
  'recommendation-degraded',
  'traffic-spike',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function call(method, path, body) {
  const url = `${TARGET_URL}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    log(`${method} ${path} -> ${res.status}`);
    return res;
  } catch (err) {
    log(`${method} ${path} -> ERREUR réseau: ${err.message}`);
    return null;
  }
}

// ─── Parcours utilisateur normal ────────────────────────────────────────────

async function runJourney() {
  await call('GET', '/');
  await sleep(INTERVAL_MS);

  const productsRes = await call('GET', '/products');
  await sleep(INTERVAL_MS);

  let productId = 1;
  if (productsRes && productsRes.ok) {
    try {
      const products = await productsRes.json();
      if (Array.isArray(products) && products.length > 0) {
        productId = products[randomBetween(0, products.length - 1)].id;
      }
    } catch (err) {
      log(`parsing /products échoué: ${err.message}`);
    }
  }

  await call('GET', `/products/${productId}`);
  await sleep(INTERVAL_MS);

  await call('POST', '/cart', { productId, action: 'add' });
  await sleep(INTERVAL_MS);

  await call('POST', '/checkout');
  await sleep(INTERVAL_MS);

  await call('POST', '/payment');
  await sleep(INTERVAL_MS);

  await call('GET', '/recommendations');
  await sleep(INTERVAL_MS);
}

async function journeyWorker(id) {
  log(`[worker ${id}] démarré`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runJourney();
    } catch (err) {
      log(`[worker ${id}] erreur inattendue: ${err.message}`);
    }
  }
}

// ─── Pic de trafic temporaire (scénario traffic-spike) ─────────────────────

let extraWorkerStop = false;

async function extraWorker(id) {
  while (!extraWorkerStop) {
    try {
      await runJourney();
    } catch (err) {
      log(`[extra worker ${id}] erreur inattendue: ${err.message}`);
    }
  }
}

function startTrafficSpikeWorkers() {
  extraWorkerStop = false;
  const count = CONCURRENCY * (TRAFFIC_SPIKE_MULTIPLIER - 1);
  log(`[incident] démarrage de ${count} workers supplémentaires (pic de trafic)`);
  for (let i = 0; i < count; i++) {
    extraWorker(`spike-${i}`);
  }
}

function stopTrafficSpikeWorkers() {
  extraWorkerStop = true;
}

// ─── Driver d'incidents aléatoires ──────────────────────────────────────────

async function randomIncidentDriver() {
  log('=== Mode incidents aléatoires activé ===');
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const waitBeforeIncident = randomBetween(RANDOM_INCIDENT_MIN_INTERVAL_MS, RANDOM_INCIDENT_MAX_INTERVAL_MS);
    log(`[incident] prochain incident dans ${Math.round(waitBeforeIncident / 1000)}s`);
    await sleep(waitBeforeIncident);

    const incident = RANDOM_INCIDENTS[randomBetween(0, RANDOM_INCIDENTS.length - 1)];
    log(`[incident] déclenchement: ${incident}`);
    await call('POST', `/admin/scenario/${incident}`);

    if (incident === 'traffic-spike') {
      startTrafficSpikeWorkers();
    }

    const duration = randomBetween(RANDOM_INCIDENT_MIN_DURATION_MS, RANDOM_INCIDENT_MAX_DURATION_MS);
    log(`[incident] durée: ${Math.round(duration / 1000)}s`);
    await sleep(duration);

    if (incident === 'traffic-spike') {
      stopTrafficSpikeWorkers();
    }

    log('[incident] retour au scénario normal');
    await call('POST', '/admin/scenario/reset');
  }
}

// ─── Démarrage ──────────────────────────────────────────────────────────────

log('=== Générateur de trafic démarré ===');
log(`Cible: ${TARGET_URL}`);
log(`Intervalle par étape: ${INTERVAL_MS}ms`);
log(`Workers: ${CONCURRENCY}`);
log(`Incidents aléatoires: ${ENABLE_RANDOM_INCIDENTS}`);

for (let i = 0; i < CONCURRENCY; i++) {
  journeyWorker(i);
}

if (ENABLE_RANDOM_INCIDENTS) {
  randomIncidentDriver();
}
```

- [ ] **Step 2: Build and start traffic-generator against the running demo-app**

Run: `docker compose up -d --build traffic-generator`
Expected: container `running`.

- [ ] **Step 3: Verify journey logs**

Run: `docker compose logs -f traffic-generator --tail 40` (Ctrl+C after ~15s)
Expected: repeating lines like `GET / -> 200`, `GET /products -> 200`, `GET /products/3 -> 200`, `POST /cart -> 200`, `POST /checkout -> 200`, `POST /payment -> 200` or `402`, `GET /recommendations -> 200`, no stack traces, no process exit.

- [ ] **Step 4: Verify it survives demo-app being unavailable**

Run: `docker compose stop demo-app && sleep 5 && docker compose logs --tail 20 traffic-generator && docker compose start demo-app`
Expected: log lines show `ERREUR réseau: ...` instead of a crash; `docker compose ps traffic-generator` still shows it `running` throughout.

- [ ] **Step 5: Verify the random-incident driver end-to-end (temporary short intervals)**

Run: `docker compose run --rm -e ENABLE_RANDOM_INCIDENTS=true -e RANDOM_INCIDENT_MIN_INTERVAL_MS=2000 -e RANDOM_INCIDENT_MAX_INTERVAL_MS=3000 -e RANDOM_INCIDENT_MIN_DURATION_MS=3000 -e RANDOM_INCIDENT_MAX_DURATION_MS=4000 traffic-generator` (Ctrl+C after ~15s once you see one full cycle)
Expected: logs show `[incident] déclenchement: <name>`, a `POST /admin/scenario/<name> -> 200`, then `[incident] retour au scénario normal` and `POST /admin/scenario/reset -> 200` within the shortened window — confirms the driver's full cycle works before shipping with the real (multi-minute) defaults.

- [ ] **Step 6: Commit**

```bash
git add traffic-generator/index.js
git commit -m "feat(traffic-generator): user-journey workers and random incident driver"
```

---

### Task 6: Prometheus configuration

**Files:**
- Create: `prometheus/prometheus.yml`
- Create: `prometheus/rules.yml`

**Interfaces:**
- Consumes: `demo-app:3001/metrics` (Task 3), `node-exporter:9100`, `cadvisor:8080` (already running per existing `docker-compose.yml`), `alertmanager:9093` (Task 7, not yet built but the static target name is fixed regardless of build order).
- Produces: a running Prometheus with 4 scrape targets and 3 loaded alert rules.

- [ ] **Step 1: Create `prometheus/prometheus.yml`**

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - /etc/prometheus/rules.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ['localhost:9090']

  - job_name: demo-app
    metrics_path: /metrics
    static_configs:
      - targets: ['demo-app:3001']

  - job_name: node-exporter
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: cadvisor
    static_configs:
      - targets: ['cadvisor:8080']
```

- [ ] **Step 2: Create `prometheus/rules.yml`**

```yaml
groups:
  - name: demo-app.rules
    rules:
      - alert: DemoAppDown
        expr: up{job="demo-app"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "demo-app is down"
          description: "Prometheus can't scrape demo-app for 1 minute."

      - alert: DemoAppHighErrorRate
        expr: |
          sum(rate(http_requests_total{job="demo-app",status_code=~"5.."}[5m]))
          /
          sum(rate(http_requests_total{job="demo-app"}[5m])) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "demo-app error rate above 10%"
          description: "More than 10% of requests returned 5xx over the last 5 minutes."

      - alert: DemoAppHighLatencyP95
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket{job="demo-app"}[5m])) by (le)
          ) > 1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "demo-app p95 latency above 1s"
          description: "95th percentile request latency exceeded 1 second for 2 minutes."
```

- [ ] **Step 3: Start Prometheus and verify config + targets**

Run: `docker compose up -d --build prometheus`
Run: `docker compose logs prometheus --tail 30`
Expected: no `error` lines about parsing config or rules (a `msg="Loading configuration file"` / `msg="Completed loading of configuration file"` pair, and similarly for the rule file).

Run: `curl -s localhost:9090/-/ready` → expects `Prometheus Server is Ready.`
Open (or curl) `localhost:9090/api/v1/targets` and check all 4 jobs report `"health":"up"` (allow ~15-30s after startup).

- [ ] **Step 4: Verify the rules loaded**

Run: `curl -s localhost:9090/api/v1/rules | grep -o '"name":"[A-Za-z]*"'`
Expected: includes `"name":"DemoAppDown"`, `"name":"DemoAppHighErrorRate"`, `"name":"DemoAppHighLatencyP95"`.

- [ ] **Step 5: Commit**

```bash
git add prometheus/prometheus.yml prometheus/rules.yml
git commit -m "feat(prometheus): scrape all 4 jobs, add the 3 mandatory alert rules"
```

---

### Task 7: Alertmanager configuration

**Files:**
- Create: `alertmanager/alertmanager.yml`

**Interfaces:**
- Consumes: alerts forwarded by Prometheus (Task 6).
- Produces: a running Alertmanager reachable at `:9093`, receiving alerts into a no-op receiver.

- [ ] **Step 1: Create `alertmanager/alertmanager.yml`**

```yaml
route:
  receiver: default
  group_by: ['alertname']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 10m

receivers:
  - name: default
```

- [ ] **Step 2: Start Alertmanager and verify**

Run: `docker compose up -d --build alertmanager`
Run: `curl -s localhost:9093/-/ready` → expects `OK`.
Run: `docker compose logs alertmanager --tail 20` → no config parse errors.

- [ ] **Step 3: Commit**

```bash
git add alertmanager/alertmanager.yml
git commit -m "feat(alertmanager): minimal default route, no external notification channel"
```

---

### Task 8: Grafana provisioning (datasource, dashboard provider, starter dashboard)

**Files:**
- Create: `grafana/provisioning/datasources/prometheus.yml`
- Create: `grafana/provisioning/dashboards/dashboards.yml`
- Create: `grafana/dashboards/starter.json`

**Interfaces:**
- Consumes: `prometheus:9090` (Task 6).
- Produces: Grafana at `:3000` with the Prometheus datasource pre-configured and one dashboard visible under Dashboards on first boot.

- [ ] **Step 1: Create `grafana/provisioning/datasources/prometheus.yml`**

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
```

- [ ] **Step 2: Create `grafana/provisioning/dashboards/dashboards.yml`**

```yaml
apiVersion: 1

providers:
  - name: 'Demo App Dashboards'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    allowUiUpdates: true
    updateIntervalSeconds: 30
    options:
      path: /var/lib/grafana/dashboards
```

- [ ] **Step 3: Create `grafana/dashboards/starter.json`**

```json
{
  "title": "Demo App - Starter",
  "uid": "demo-app-starter",
  "timezone": "browser",
  "schemaVersion": 39,
  "version": 1,
  "refresh": "10s",
  "time": { "from": "now-15m", "to": "now" },
  "panels": [
    {
      "id": 1,
      "title": "Targets UP",
      "type": "stat",
      "gridPos": { "h": 6, "w": 6, "x": 0, "y": 0 },
      "targets": [{ "expr": "count(up == 1)", "refId": "A" }]
    },
    {
      "id": 2,
      "title": "Targets DOWN",
      "type": "stat",
      "gridPos": { "h": 6, "w": 6, "x": 6, "y": 0 },
      "targets": [{ "expr": "count(up == 0) OR vector(0)", "refId": "A" }]
    },
    {
      "id": 3,
      "title": "Trafic HTTP par route",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 6 },
      "targets": [
        {
          "expr": "sum(rate(http_requests_total{job=\"demo-app\"}[5m])) by (route)",
          "legendFormat": "{{route}}",
          "refId": "A"
        }
      ]
    }
  ]
}
```

- [ ] **Step 4: Start Grafana and verify provisioning**

Run: `docker compose up -d --build grafana`
Run: `docker compose logs grafana --tail 40 | grep -i error` → expect no output.
Open `http://localhost:3000` (login `admin`/`admin`), go to Connections → Data sources → confirm `Prometheus` exists and "Save & test" succeeds. Go to Dashboards → confirm "Demo App - Starter" is listed and its 3 panels render data (traffic panel will be flat/empty until Task 5's traffic-generator has run for a few minutes — that's expected at this point in the plan).

- [ ] **Step 5: Commit**

```bash
git add grafana/provisioning/datasources/prometheus.yml grafana/provisioning/dashboards/dashboards.yml grafana/dashboards/starter.json
git commit -m "feat(grafana): provision Prometheus datasource and starter dashboard"
```

---

### Task 9: Full-stack verification against spec §9 acceptance criteria

**Files:** none (verification only).

**Interfaces:**
- Consumes: the entire stack (Tasks 1-8).
- Produces: a pass/fail confirmation of every item in spec §9 — no code changes.

- [ ] **Step 1: Full clean rebuild**

Run: `docker compose down && docker compose up -d --build`
Expected: all 7 containers (`prometheus`, `grafana`, `alertmanager`, `node-exporter`, `cadvisor`, `demo-app`, `traffic-generator`) reach `running` (`docker compose ps`).

- [ ] **Step 2: Confirm all 4 Prometheus targets are up**

Run: `curl -s localhost:9090/api/v1/targets | grep -o '"health":"[a-z]*"' | sort | uniq -c`
Expected: 4 targets, all `"health":"up"`.

- [ ] **Step 3: Trigger `DemoAppDown`**

Run: `docker compose stop demo-app`
Wait ~70s, then check `localhost:9090/alerts` (or `curl -s localhost:9090/api/v1/alerts`) for `DemoAppDown` in state `firing`, and confirm it also shows up at `localhost:9093` (Alertmanager UI).
Run: `docker compose start demo-app`

- [ ] **Step 4: Trigger `DemoAppHighErrorRate`**

Run:
```bash
curl -s -X POST localhost:3001/admin/scenario/high-error
for i in $(seq 1 60); do curl -s -o /dev/null -X POST localhost:3001/checkout; curl -s -o /dev/null -X POST localhost:3001/payment; done
```
Wait ~2-3 minutes (evaluation window + `for: 2m`), then check `localhost:9090/alerts` for `DemoAppHighErrorRate` firing.
Run: `curl -s -X POST localhost:3001/admin/scenario/reset`

- [ ] **Step 5: Trigger `DemoAppHighLatencyP95`**

Run:
```bash
curl -s -X POST localhost:3001/admin/scenario/high-latency
for i in $(seq 1 30); do curl -s -o /dev/null -X POST localhost:3001/checkout & curl -s -o /dev/null localhost:3001/recommendations & done; wait
```
Wait ~2-3 minutes, then check `localhost:9090/alerts` for `DemoAppHighLatencyP95` firing.
Run: `curl -s -X POST localhost:3001/admin/scenario/reset`

- [ ] **Step 6: Confirm `incident_active` exclusivity across all 7 scenarios**

Run, for each of the 7 scenario names in turn:
```bash
curl -s -X POST localhost:3001/admin/scenario/<name>
curl -s localhost:3001/metrics | grep incident_active
```
Expected each time: exactly one `incident_active{incident="<name>"} 1` line, the other 6 at `0`.
Finish with: `curl -s -X POST localhost:3001/admin/scenario/reset`

- [ ] **Step 7: Record the result**

No file changes — this task is a checkpoint. If any check fails, stop and fix the relevant earlier task before continuing to the documentation tasks below (they describe this exact behavior to students, so it must be correct first).

---

### Task 10: `docs/ALERTES_BONUS.md`

**Files:**
- Create: `docs/ALERTES_BONUS.md`

**Interfaces:**
- Consumes: metric names from Task 1 and node-exporter/cadvisor metric names (standard, unchanged).
- Produces: a copy-paste reference doc; not loaded by Prometheus.

- [ ] **Step 1: Create `docs/ALERTES_BONUS.md`**

```markdown
# Alertes bonus — prêtes à copier-coller

Ces alertes ne sont **pas** chargées par défaut (elles ne sont pas dans
`prometheus/rules.yml`). C'est un exercice du Jour 2 : copiez celles qui
vous intéressent dans `prometheus/rules.yml` (dans le groupe `demo-app.rules`
ou dans un nouveau groupe), puis rechargez Prometheus :

```bash
curl -X POST localhost:9090/-/reload
```

## HighPaymentFailureRate

Se déclenche avec le scénario `high-payment-failure`.

```yaml
- alert: HighPaymentFailureRate
  expr: |
    sum(rate(payments_total{status="failed"}[5m]))
    /
    sum(rate(payments_total[5m])) > 0.3
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: "Taux d'échec de paiement élevé"
    description: "Plus de 30% des paiements échouent depuis 2 minutes."
```

## HighCheckoutLatencyP95

Se déclenche avec le scénario `checkout-degraded` (ou `high-latency`).

```yaml
- alert: HighCheckoutLatencyP95
  expr: |
    histogram_quantile(0.95,
      sum(rate(http_request_duration_seconds_bucket{route="/checkout"}[5m])) by (le)
    ) > 1.5
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: "Latence p95 de /checkout élevée"
    description: "Le p95 de /checkout dépasse 1.5s depuis 2 minutes."
```

## RecommendationServiceDegraded

Se déclenche avec le scénario `recommendation-degraded`.

```yaml
- alert: RecommendationServiceDegraded
  expr: dependency_status{dependency="recommendation-engine"} == 0
  for: 1m
  labels:
    severity: warning
  annotations:
    summary: "Moteur de recommandations dégradé"
    description: "dependency_status indique le moteur de recommandations comme dégradé depuis 1 minute."
```

## NoSuccessfulOrders

Se déclenche si `/checkout` ne produit plus aucune commande réussie
(ex: `high-error` prolongé, ou l'app plantée sans que `up` s'en aperçoive).

```yaml
- alert: NoSuccessfulOrders
  expr: sum(rate(orders_total{status="success"}[10m])) == 0
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Aucune commande réussie"
    description: "Aucune commande réussie sur les 10 dernières minutes."
```

## ExporterDown

Se déclenche si node-exporter ou cAdvisor devient injoignable.

```yaml
- alert: ExporterDown
  expr: up{job=~"node-exporter|cadvisor"} == 0
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Un exporter est down"
    description: "{{ $labels.job }} n'est plus scrapé depuis 2 minutes."
```

## HighCPUUsage

CPU machine (via node-exporter). Difficile à déclencher via les scénarios
applicatifs — utile pour un test manuel (`stress-ng` sur la VM, par exemple).

```yaml
- alert: HighCPUUsage
  expr: |
    100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "CPU machine élevé"
    description: "Utilisation CPU au-dessus de 85% depuis 5 minutes sur {{ $labels.instance }}."
```

## HighMemoryUsage

```yaml
- alert: HighMemoryUsage
  expr: |
    (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 85
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Mémoire machine élevée"
    description: "Utilisation mémoire au-dessus de 85% depuis 5 minutes."
```

## LowDiskSpace

```yaml
- alert: LowDiskSpace
  expr: |
    (1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100 > 85
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Espace disque faible"
    description: "Plus de 85% du disque `/` est utilisé depuis 5 minutes."
```

## ContainerHighCPU

CPU par container (via cAdvisor).

```yaml
- alert: ContainerHighCPU
  expr: sum by (name) (rate(container_cpu_usage_seconds_total{name!=""}[5m])) > 0.8
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Container très consommateur de CPU"
    description: "Le container {{ $labels.name }} consomme plus de 0.8 CPU depuis 5 minutes."
```
```

- [ ] **Step 2: Verify it's valid markdown and the YAML blocks parse**

Run (from repo root, requires `python3` with `pyyaml`, or use any local YAML linter you have — this only validates syntax, these blocks are never loaded automatically):
```bash
python3 - <<'EOF'
import re, yaml
text = open('docs/ALERTES_BONUS.md', encoding='utf-8').read()
blocks = re.findall(r'```yaml\n(.*?)```', text, re.S)
print(f'{len(blocks)} yaml blocks found')
for b in blocks:
    yaml.safe_load(b)
print('all parsed OK')
EOF
```
Expected: `9 yaml blocks found` then `all parsed OK`. If `pyyaml`/`python3` isn't available, visually confirm each block's indentation instead.

- [ ] **Step 3: Commit**

```bash
git add docs/ALERTES_BONUS.md
git commit -m "docs: add copy-paste bonus alert rules"
```

---

### Task 11: `docs/INCIDENTS.md`

**Files:**
- Create: `docs/INCIDENTS.md`

**Interfaces:**
- Consumes: scenario behavior from Task 2/3, alert names from Task 6 and Task 10.
- Produces: reference doc, no runtime effect.

- [ ] **Step 1: Create `docs/INCIDENTS.md`**

```markdown
# Guide des incidents simulés

Chaque scénario est activé via `POST /admin/scenario/<nom>` et désactivé
via `POST /admin/scenario/reset`. Ce document décrit, pour chacun, ce qui
change, où le voir, et quelles alertes devraient se déclencher.

## normal

**Effet :** comportement de référence — erreurs rares (~3-5%), latence
50-150ms, paiements très majoritairement réussis.
**Métriques :** tout reste stable/bas.
**Panels utiles :** tous — c'est la ligne de base à comparer aux incidents.
**Alertes :** aucune.

## high-error

**Effet :** `/checkout` et `/payment` renvoient un 500 dans ~40% des cas.
**Métriques :** `http_requests_total{status_code="500"}` grimpe fortement
sur les routes `/checkout` et `/payment`.
**Panels utiles :** "Erreurs 5xx par route", "Taux d'erreur global".
**Alertes :** `DemoAppHighErrorRate` (core) après ~2 minutes soutenues.

## high-latency

**Effet :** `/checkout` et `/recommendations` répondent en 1.5-3s au lieu
de 50-150ms.
**Métriques :** le p95 de `http_request_duration_seconds` grimpe nettement
sur ces deux routes.
**Panels utiles :** "Latence p95 par route".
**Alertes :** `DemoAppHighLatencyP95` (core).

## high-payment-failure

**Effet :** `/payment` échoue ~70% du temps ; `payment-gateway` passe à 0.
**Métriques :** `payments_total{status="failed"}` grimpe ;
`orders_total{status="failed"}` grimpe aussi (cascade : un paiement raté
invalide la commande) ; `dependency_status{dependency="payment-gateway"}`
passe à 0.
**Panels utiles :** "Paiements success/failed", "Taux d'échec paiement",
"Dépendances simulées".
**Alertes :** `HighPaymentFailureRate` (bonus).

## checkout-degraded

**Effet :** `/checkout` devient lent (2-4s) **et** échoue ~30% du temps —
combinaison volontaire pour tester une alerte de latence spécifique à une
route.
**Métriques :** p95 de `/checkout` élevé, `orders_total{status="failed"}`
en hausse.
**Panels utiles :** "Latence p95 par route", "Commandes success/failed".
**Alertes :** `HighCheckoutLatencyP95` (bonus) ; peut aussi contribuer à
`DemoAppHighLatencyP95` (core) si le volume sur `/checkout` est
suffisant par rapport aux autres routes.

## recommendation-degraded

**Effet :** `/recommendations` devient lente (1.5-3s) et renvoie un
fallback ~60% du temps ; `recommendation-engine` passe à 0.
**Métriques :** `recommendation_requests_total{result="fallback"}` grimpe ;
`dependency_status{dependency="recommendation-engine"}` passe à 0.
**Panels utiles :** "Recommandations success/fallback/error",
"Dépendances simulées".
**Alertes :** `RecommendationServiceDegraded` (bonus).

## traffic-spike

**Effet :** le générateur de trafic augmente temporairement son débit
(×`TRAFFIC_SPIKE_MULTIPLIER`) ; l'application elle-même ne change pas de
comportement (pas plus d'erreurs, pas plus de latence).
**Métriques :** "Trafic HTTP par route" augmente nettement, mais le taux
d'erreur et la latence p95 restent stables.
**Panels utiles :** "Trafic HTTP par route", "Incident actif".
**Alertes :** aucune, volontairement — l'objectif pédagogique est de
montrer qu'un pic de trafic n'est pas automatiquement un incident.
```

- [ ] **Step 2: Commit**

```bash
git add docs/INCIDENTS.md
git commit -m "docs: describe each simulated incident scenario"
```

---

### Task 12: `docs/PROMQL_CHEATSHEET.md`

**Files:**
- Create: `docs/PROMQL_CHEATSHEET.md`

**Interfaces:**
- Consumes: metric names from Tasks 1, 6.
- Produces: reference doc.

- [ ] **Step 1: Create `docs/PROMQL_CHEATSHEET.md`**

```markdown
# Antisèche PromQL

Requêtes utiles à tester dans Prometheus (`localhost:9090/graph`) ou dans
un panel Grafana. `job="demo-app"` filtre sur l'application; les requêtes
sans ce filtre concernent la machine ou les containers.

## Trafic HTTP

```promql
# Requêtes par seconde, toutes routes confondues
sum(rate(http_requests_total{job="demo-app"}[5m]))

# Requêtes par seconde, par route
sum(rate(http_requests_total{job="demo-app"}[5m])) by (route)

# Requêtes par seconde, par code de statut
sum(rate(http_requests_total{job="demo-app"}[5m])) by (status_code)
```

## Erreurs

```promql
# Erreurs 5xx par seconde, par route
sum(rate(http_requests_total{job="demo-app",status_code=~"5.."}[5m])) by (route)

# Taux d'erreur global (0 à 1)
sum(rate(http_requests_total{job="demo-app",status_code=~"5.."}[5m]))
/
sum(rate(http_requests_total{job="demo-app"}[5m]))
```

## Latence

```promql
# p95 par route (nécessite les buckets du histogram)
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket{job="demo-app"}[5m])) by (le, route)
)

# p50 (médiane) global
histogram_quantile(0.50,
  sum(rate(http_request_duration_seconds_bucket{job="demo-app"}[5m])) by (le)
)

# Durée moyenne (sum/count — attention, une moyenne masque les outliers)
rate(http_request_duration_seconds_sum{job="demo-app"}[5m])
/
rate(http_request_duration_seconds_count{job="demo-app"}[5m])
```

## Métier

```promql
# Commandes réussies vs échouées, par seconde
sum(rate(orders_total[5m])) by (status)

# Taux d'échec paiement
sum(rate(payments_total{status="failed"}[5m]))
/
sum(rate(payments_total[5m]))

# Recommandations : part de fallback
sum(rate(recommendation_requests_total{result="fallback"}[5m]))
/
sum(rate(recommendation_requests_total[5m]))

# Utilisateurs actifs simulés (Gauge, pas de rate())
active_users

# État des dépendances simulées (1 = OK, 0 = dégradé)
dependency_status

# Incident actuellement actif
incident_active == 1
```

## Système (node-exporter)

```promql
# CPU utilisé (%) par instance
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# RAM utilisée (%)
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100

# Disque utilisé (%) sur /
(1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100
```

## Containers (cAdvisor)

```promql
# CPU par container
sum(rate(container_cpu_usage_seconds_total{name!=""}[5m])) by (name)

# Mémoire par container
sum(container_memory_usage_bytes{name!=""}) by (name)
```

## Cibles Prometheus

```promql
# Nombre de cibles UP
count(up == 1)

# Nombre de cibles DOWN
count(up == 0)
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/PROMQL_CHEATSHEET.md
git commit -m "docs: add PromQL cheatsheet"
```

---

### Task 13: `docs/JOUR_1.md`

**Files:**
- Create: `docs/JOUR_1.md`

**Interfaces:**
- Consumes: README quickstart (Task 15) for install steps reference; PromQL cheatsheet (Task 12).
- Produces: guided Day 1 doc.

- [ ] **Step 1: Create `docs/JOUR_1.md`**

```markdown
# Jour 1 — Découverte

## 1. Installation

```bash
git clone <ce-dépôt>
cd prometheus-tp
docker compose up -d --build
docker compose ps
```
Tous les services (`prometheus`, `grafana`, `alertmanager`, `node-exporter`,
`cadvisor`, `demo-app`, `traffic-generator`) doivent être `running`.

Vérifiez :
- Prometheus : http://localhost:9090
- Grafana : http://localhost:3000 (admin/admin)
- Alertmanager : http://localhost:9093
- demo-app : http://localhost:3001

## 2. Découverte des métriques

Ouvrez http://localhost:3001/metrics dans un navigateur. Repérez :
- des `# HELP` / `# TYPE` (ce sont des Counters, Gauges, Histograms)
- `http_requests_total` : un Counter avec des labels `method`, `route`, `status_code`
- `http_request_duration_seconds_bucket` : les buckets d'un Histogram
- `active_users` : une Gauge qui varie

Question : pourquoi `route` vaut `/products/:id` et pas `/products/42` ?
(Réponse : cardinalité — un label par id explosion le nombre de séries.)

## 3. Premières requêtes PromQL

Dans http://localhost:9090/graph, testez (voir aussi
`docs/PROMQL_CHEATSHEET.md`) :

```promql
up
sum(rate(http_requests_total[5m])) by (route)
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

Laissez tourner le trafic quelques minutes (le `traffic-generator` tourne
en continu par défaut) et observez ces graphes évoluer.

## 4. Mini alerte

Ouvrez `prometheus/rules.yml` et repérez `DemoAppDown`. Puis :

```bash
docker compose stop demo-app
```
Attendez ~1 minute, rafraîchissez http://localhost:9090/alerts : l'alerte
passe de `Pending` à `Firing`. Vérifiez qu'elle apparaît aussi dans
Alertmanager (http://localhost:9093). Relancez ensuite :
```bash
docker compose start demo-app
```

## 5. Mini dashboard Grafana

Dans Grafana, ouvrez le dashboard "Demo App - Starter" (déjà provisionné).
Puis créez votre propre panel :
1. Dashboards → New → New Panel
2. Datasource : Prometheus (déjà sélectionnée par défaut)
3. Requête : `sum(rate(http_requests_total[5m])) by (route)`
4. Type de panel : Time series
5. Enregistrez le panel

Vous avez maintenant vu toute la chaîne : métrique → scrape → requête →
alerte → dashboard. Le Jour 2 approfondit chaque étape sur un scénario
d'incident complet.
```

- [ ] **Step 2: Commit**

```bash
git add docs/JOUR_1.md
git commit -m "docs: add Day 1 guided walkthrough"
```

---

### Task 14: `docs/JOUR_2_TP.md`

**Files:**
- Create: `docs/JOUR_2_TP.md`

**Interfaces:**
- Consumes: panel list from spec §7, scenario list from Task 11, alert lists from Task 6/10.
- Produces: the graded/self-directed Day 2 exercise doc.

- [ ] **Step 1: Create `docs/JOUR_2_TP.md`**

```markdown
# Jour 2 — TP noté

## Contexte

Vous administrez l'observabilité d'une mini API e-commerce (`demo-app`).
Votre mission : construire un dashboard Grafana complet, écrire des
alertes Prometheus, puis détecter et diagnostiquer des incidents simulés
— comme vous le feriez en astreinte.

## Objectifs

1. Construire un dashboard Grafana avec les 17 panels listés ci-dessous.
2. Ajouter au moins 4 alertes bonus (`docs/ALERTES_BONUS.md`) à
   `prometheus/rules.yml`, en plus des 3 déjà présentes.
3. Activer le mode incidents aléatoires et détecter, sans aide, au moins
   3 incidents différents en observant uniquement Grafana/Prometheus/Alertmanager.
4. Exporter votre dashboard en JSON.

## Livrables

- `mon-dashboard.json` (export Grafana)
- Une liste des incidents détectés, avec pour chacun : l'heure
  approximative, le panel qui l'a révélé en premier, l'alerte qui s'est
  déclenchée (si applicable)
- Votre `prometheus/rules.yml` avec les alertes bonus ajoutées

## Dashboard attendu (17 panels)

| # | Panel | Requête de départ |
|---|---|---|
| 1 | Targets UP | `count(up == 1)` |
| 2 | Targets DOWN | `count(up == 0) OR vector(0)` |
| 3 | Trafic HTTP par route | `sum(rate(http_requests_total[5m])) by (route)` |
| 4 | Erreurs 5xx par route | `sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (route)` |
| 5 | Taux d'erreur global | voir `docs/PROMQL_CHEATSHEET.md` §Erreurs |
| 6 | Latence p95 par route | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))` |
| 7 | CPU machine | `100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)` |
| 8 | RAM machine | `(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100` |
| 9 | Disque utilisé | `(1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100` |
| 10 | CPU par container | `sum(rate(container_cpu_usage_seconds_total{name!=""}[5m])) by (name)` |
| 11 | Mémoire par container | `sum(container_memory_usage_bytes{name!=""}) by (name)` |
| 12 | Commandes success/failed | `sum(rate(orders_total[5m])) by (status)` |
| 13 | Paiements success/failed | `sum(rate(payments_total[5m])) by (status)` |
| 14 | Taux d'échec paiement | `sum(rate(payments_total{status="failed"}[5m])) / sum(rate(payments_total[5m]))` |
| 15 | Recommandations success/fallback/error | `sum(rate(recommendation_requests_total[5m])) by (result)` |
| 16 | Dépendances simulées | `dependency_status` |
| 17 | Incident actif | `incident_active == 1` |

Astuce : groupez les panels par thème (HTTP, système, containers, métier)
avec des `Row` Grafana pour un dashboard lisible.

## Alertes attendues

Les 3 déjà présentes (`DemoAppDown`, `DemoAppHighErrorRate`,
`DemoAppHighLatencyP95`) plus, au minimum, ces 4 bonus (voir
`docs/ALERTES_BONUS.md` pour le YAML complet) :
- `HighPaymentFailureRate`
- `HighCheckoutLatencyP95`
- `RecommendationServiceDegraded`
- `NoSuccessfulOrders`

Après les avoir ajoutées à `prometheus/rules.yml`, rechargez sans
redémarrer le container :
```bash
curl -X POST localhost:9090/-/reload
```

## Incidents à détecter

Activez le mode incidents aléatoires :
```bash
docker compose up -d -e ENABLE_RANDOM_INCIDENTS=true traffic-generator
```
(ou éditez `docker-compose.yml` puis `docker compose up -d --build traffic-generator`)

Laissez tourner et surveillez votre dashboard. Chaque incident dure entre
2 et 5 minutes, avec 6 à 12 minutes de calme entre deux. Pour chaque
incident détecté, notez-le dans vos livrables (voir `docs/INCIDENTS.md`
pour la liste complète des scénarios possibles et leurs symptômes — à
consulter *après* avoir essayé de détecter par vous-même).

Vous pouvez aussi déclencher un incident manuellement pour vous entraîner
avant le mode aléatoire :
```bash
curl -X POST localhost:3001/admin/scenario/checkout-degraded
# ... observez ...
curl -X POST localhost:3001/admin/scenario/reset
```

## Export JSON du dashboard

Dans Grafana : ouvrez votre dashboard → icône de partage → Export →
"Export as JSON" → décochez "Export the dashboard to use in another
instance" si présent → téléchargez le fichier sous `mon-dashboard.json`.

## Restitution finale

Présentez en quelques minutes : votre dashboard (tour des 17 panels),
un incident que vous avez détecté et diagnostiqué de bout en bout
(panel → cause probable → alerte associée), et une alerte bonus de votre
choix avec le raisonnement derrière son seuil.
```

- [ ] **Step 2: Commit**

```bash
git add docs/JOUR_2_TP.md
git commit -m "docs: add Day 2 graded TP"
```

---

### Task 15: `README.md`

**Files:**
- Modify: `README.md` (create if absent — check first with `test -f README.md`)

**Interfaces:**
- Consumes: everything built in Tasks 1-11 (service ports, admin endpoints, env vars).
- Produces: the repo's entry-point doc.

- [ ] **Step 1: Check whether `README.md` already exists**

Run: `test -f README.md && echo exists || echo missing`

- [ ] **Step 2: Write `README.md`**

```markdown
# Prometheus TP — mini e-commerce observable

Stack de démonstration pour une formation Prometheus de 2 jours : une
mini API e-commerce (`demo-app`) instrumentée avec `prom-client`, un
générateur de trafic, et une stack Prometheus/Alertmanager/Grafana
complète.

## Démarrage

```bash
docker compose up -d --build
docker compose ps
```

Tous les services doivent passer à `running` en quelques secondes
(sauf Grafana, qui peut prendre 10-20s de plus au premier démarrage).

## URLs utiles

| Service | URL | Identifiants |
|---|---|---|
| demo-app | http://localhost:3001 | — |
| Prometheus | http://localhost:9090 | — |
| Alertmanager | http://localhost:9093 | — |
| Grafana | http://localhost:3000 | admin / admin |
| node-exporter | http://localhost:9100/metrics | — |
| cAdvisor | http://localhost:8080 | — |

## Commandes de test

```bash
curl localhost:3001/
curl localhost:3001/health
curl localhost:3001/products
curl localhost:3001/products/1
curl -X POST localhost:3001/cart -H 'Content-Type: application/json' -d '{"productId":1,"action":"add"}'
curl -X POST localhost:3001/checkout
curl -X POST localhost:3001/payment
curl localhost:3001/recommendations
curl localhost:3001/metrics
curl localhost:3001/admin/status
```

## Activer un scénario d'incident

```bash
curl -X POST localhost:3001/admin/scenario/normal
curl -X POST localhost:3001/admin/scenario/high-error
curl -X POST localhost:3001/admin/scenario/high-latency
curl -X POST localhost:3001/admin/scenario/high-payment-failure
curl -X POST localhost:3001/admin/scenario/checkout-degraded
curl -X POST localhost:3001/admin/scenario/recommendation-degraded
curl -X POST localhost:3001/admin/scenario/traffic-spike
curl -X POST localhost:3001/admin/scenario/reset
```

Voir `docs/INCIDENTS.md` pour ce que chaque scénario change et comment
le repérer dans Prometheus/Grafana.

## Activer le mode incidents aléatoires

Par défaut, `traffic-generator` génère un trafic stable et prévisible
(`ENABLE_RANDOM_INCIDENTS=false`). Pour activer des incidents
aléatoires et espacés (utile pour le TP du Jour 2) :

```yaml
# docker-compose.yml, service traffic-generator
environment:
  - ENABLE_RANDOM_INCIDENTS=true
```
puis :
```bash
docker compose up -d --build traffic-generator
```

Variables disponibles (valeurs par défaut) :

| Variable | Défaut | Rôle |
|---|---|---|
| `TARGET_URL` | `http://demo-app:3001` | URL de demo-app |
| `INTERVAL_MS` | `1000` | Délai entre deux étapes d'un parcours utilisateur |
| `CONCURRENCY` | `2` | Nombre de parcours utilisateurs en parallèle |
| `ENABLE_RANDOM_INCIDENTS` | `false` | Active les incidents aléatoires |
| `RANDOM_INCIDENT_MIN_INTERVAL_MS` | `360000` (6min) | Délai min. avant le prochain incident |
| `RANDOM_INCIDENT_MAX_INTERVAL_MS` | `720000` (12min) | Délai max. avant le prochain incident |
| `RANDOM_INCIDENT_MIN_DURATION_MS` | `120000` (2min) | Durée min. d'un incident |
| `RANDOM_INCIDENT_MAX_DURATION_MS` | `300000` (5min) | Durée max. d'un incident |
| `TRAFFIC_SPIKE_MULTIPLIER` | `4` | Multiplicateur de workers pendant un pic de trafic |

## Documentation

- `docs/JOUR_1.md` — installation et découverte guidée
- `docs/JOUR_2_TP.md` — TP du Jour 2 (dashboard, alertes, incidents)
- `docs/PROMQL_CHEATSHEET.md` — requêtes PromQL commentées
- `docs/ALERTES_BONUS.md` — alertes supplémentaires prêtes à coller
- `docs/INCIDENTS.md` — détail de chaque scénario simulé

## Contraintes de conception

Pas de base de données, pas d'authentification, pas de labels Prometheus
à forte cardinalité (pas de `user_id`/`order_id`/`email`/`request_id`/URL
brute). Tout l'état applicatif (scénario actif, dépendances simulées) vit
en mémoire dans `demo-app` et repart à zéro à chaque redémarrage.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with quickstart, URLs, and scenario commands"
```

---

### Task 16: Final full-stack re-verification

**Files:** none.

**Interfaces:**
- Consumes: everything (Tasks 1-15).
- Produces: final confirmation the whole repo works from a clean checkout.

- [ ] **Step 1: Clean rebuild from scratch**

```bash
docker compose down -v
docker compose up -d --build
docker compose ps
```
Expected: all 7 services `running`; no `restarting` loops after 1 minute.

- [ ] **Step 2: Re-run the Task 9 acceptance checklist**

Repeat Task 9 Steps 2-6 (targets up, `DemoAppDown`, `DemoAppHighErrorRate`,
`DemoAppHighLatencyP95`, `incident_active` exclusivity across all 7
scenarios). All must still pass against the final state of the repo.

- [ ] **Step 3: Confirm Grafana dashboard renders live data**

After letting `traffic-generator` run for ~2 minutes, open the "Demo App -
Starter" dashboard and confirm the "Trafic HTTP par route" panel shows a
non-flat line.

- [ ] **Step 4: Leave the stack in the default (safe) state for the next user**

```bash
curl -s -X POST localhost:3001/admin/scenario/reset
```
Confirm `docker-compose.yml`'s `traffic-generator` still has
`ENABLE_RANDOM_INCIDENTS=false` (the shipped default) unless the user asked
to ship it enabled.

- [ ] **Step 5: Final commit (only if any of the above steps required a fix)**

```bash
git status
# if there are changes from a fix made during verification:
git add -A
git commit -m "fix: address issues found during full-stack verification"
```
