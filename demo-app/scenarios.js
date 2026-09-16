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
