/**
 * demo-app — Application Node.js/Express instrumentée avec Prometheus
 * Formation Prometheus de A à Z
 *
 * Métriques exposées :
 *   - http_requests_total        (Counter)   : total requêtes par method/route/status_code
 *   - http_request_duration_seconds (Histogram): durée des requêtes
 *   - app_started               (Gauge)     : vaut 1 si l'app est démarrée
 *
 * Endpoints :
 *   GET /         -> réponse "OK"
 *   GET /health   -> {"status":"OK"}
 *   GET /slow     -> attend 500ms-2000ms aléatoirement
 *   GET /error    -> renvoie 500 dans ~50% des cas
 *   GET /metrics  -> métriques Prometheus (scraped par Prometheus)
 */

const express = require('express');
const client = require('prom-client');

const app = express();
const PORT = 3001;

// ─── Registre Prometheus ────────────────────────────────────────────────────
// Le registre contient toutes les métriques déclarées par l'application.
const register = new client.Registry();

// Métriques système par défaut : memory heap, event loop lag, etc.
client.collectDefaultMetrics({ register });

// ─── Métriques métier ───────────────────────────────────────────────────────

// COUNTER — s'incrémente, ne diminue jamais
// Bonne pratique : éviter les labels à haute cardinalité (user_id, request_id...)
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requêtes HTTP reçues',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// HISTOGRAM — distribue les observations dans des buckets
// Permet de calculer des percentiles (p50, p95, p99) avec histogram_quantile()
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes HTTP en secondes',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0],
  registers: [register],
});

// GAUGE — peut monter et descendre
// Ici utilisé comme flag booléen : 1 = app démarrée
const appStarted = new client.Gauge({
  name: 'app_started',
  help: 'Vaut 1 si l\'application est démarrée et fonctionnelle',
  registers: [register],
});
appStarted.set(1);

// ─── Middleware de tracking ─────────────────────────────────────────────────
// Mesure chaque requête : durée + incrément du counter.
// Placé AVANT les routes pour intercepter toutes les requêtes.
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    // req.route.path donne la route paramétrée (/user/:id) et non l'URL réelle
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

// ─── Routes ─────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.send('OK');
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Simule une opération lente — utile pour observer la latence p95
app.get('/slow', async (req, res) => {
  const delay = 500 + Math.floor(Math.random() * 1500); // 500ms à 2000ms
  await new Promise(resolve => setTimeout(resolve, delay));
  res.json({ message: 'réponse lente', delay_ms: delay });
});

// Retourne une erreur 500 dans ~50% des cas — utile pour observer le taux d'erreurs
app.get('/error', (req, res) => {
  if (Math.random() < 0.5) {
    res.status(500).json({ error: 'Internal Server Error' });
  } else {
    res.json({ message: 'OK cette fois' });
  }
});

// Endpoint scraped par Prometheus — NE PAS sécuriser en prod sans auth
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

// ─── Démarrage ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Demo app démarrée sur le port ${PORT}`);
  console.log(`  http://localhost:${PORT}/`);
  console.log(`  http://localhost:${PORT}/metrics`);
});
