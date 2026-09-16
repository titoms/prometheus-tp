# Prometheus TP — mini e-commerce observable

Support de formation Prometheus (2 jours) : une mini API e-commerce
(`demo-app`) instrumentée avec `prom-client`, et un générateur de
trafic (`traffic-generator`) qui la fait vivre en continu.

Ces deux services sont **déjà prêts**. Le reste de la stack
(Prometheus, node-exporter, cAdvisor, Alertmanager, Grafana) se
construit à la main pendant la formation — suivez
**[`docs/TUTORIEL.md`](docs/TUTORIEL.md)**, qui reprend tout pas à pas
jusqu'à un dashboard Grafana complet.

## Démarrage

```bash
docker compose up -d --build
docker compose ps
```

`demo-app` et `traffic-generator` doivent passer à `running`.

## URLs utiles

| Service | URL |
|---|---|
| demo-app | http://localhost:3001 |
| Métriques demo-app | http://localhost:3001/metrics |

(Les autres URLs — Prometheus, Grafana, Alertmanager, node-exporter,
cAdvisor — apparaissent au fil du tutoriel, au fur et à mesure que vous
ajoutez chaque service.)

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

Voir `docs/TUTORIEL.md` (Partie 6) pour ce que chaque scénario change
et comment le repérer dans Prometheus/Grafana.

## Mode incidents aléatoires

Par défaut, `traffic-generator` génère un trafic stable et prévisible
(`ENABLE_RANDOM_INCIDENTS=false`). Pour activer des incidents
aléatoires et espacés :

```yaml
# docker-compose.yml, service traffic-generator
environment:
  - ENABLE_RANDOM_INCIDENTS=true
```
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

## Contraintes de conception

Pas de base de données, pas d'authentification, pas de labels
Prometheus à forte cardinalité (pas de `user_id`/`order_id`/`email`/
`request_id`/URL brute). Tout l'état applicatif (scénario actif,
dépendances simulées) vit en mémoire dans `demo-app` et repart à zéro à
chaque redémarrage.
