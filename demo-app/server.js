/**
 * demo-app — mini e-commerce API instrumentée avec Prometheus.
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
