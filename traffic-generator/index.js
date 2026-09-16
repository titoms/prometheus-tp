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
