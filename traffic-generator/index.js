/**
 * Générateur de trafic — Formation Prometheus de A à Z
 *
 * Ce service envoie des requêtes HTTP aléatoires vers demo-app
 * pour que les métriques Prometheus soient visibles dans Grafana.
 *
 * Variables d'environnement :
 *   TARGET_URL   : URL de base de demo-app (défaut: http://demo-app:3001)
 *   INTERVAL_MS  : intervalle entre requêtes en ms (défaut: 2000)
 */

const TARGET_URL = process.env.TARGET_URL || 'http://demo-app:3001';
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '2000', 10);

// Distribution des endpoints — /slow et /error génèrent les métriques intéressantes
const endpoints = ['/', '/health', '/slow', '/error', '/slow', '/error'];

let requestCount = 0;
let errorCount = 0;

async function makeRequest(endpoint) {
  const url = `${TARGET_URL}${endpoint}`;
  try {
    const res = await fetch(url);
    console.log(`[${new Date().toISOString()}] GET ${endpoint} -> ${res.status}`);
    requestCount++;
    if (res.status >= 500) errorCount++;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] GET ${endpoint} -> ERREUR réseau: ${err.message}`);
    errorCount++;
  }
}

async function tick() {
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  await makeRequest(endpoint);
}

console.log('=== Générateur de trafic démarré ===');
console.log(`Cible    : ${TARGET_URL}`);
console.log(`Intervalle: ${INTERVAL_MS}ms`);
console.log(`Endpoints : ${[...new Set(endpoints)].join(', ')}`);
console.log('');

setInterval(tick, INTERVAL_MS);

// Résumé toutes les 30 secondes
setInterval(() => {
  console.log(`[STATS] Total: ${requestCount} requêtes | Erreurs: ${errorCount} (${requestCount > 0 ? ((errorCount / requestCount) * 100).toFixed(1) : 0}%)`);
}, 30000);
