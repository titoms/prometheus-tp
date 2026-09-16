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
