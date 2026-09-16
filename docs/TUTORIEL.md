# Tutoriel — Construire la stack Prometheus/Grafana pas à pas

Ce document est LE fil conducteur de la formation. `demo-app` et
`traffic-generator` sont déjà prêts et tournent. Tout le reste
(Prometheus, node-exporter, cAdvisor, Alertmanager, Grafana) se
construit ici, étape par étape, à la main.

Chaque partie ajoute un morceau au `docker-compose.yml` et se termine
par une vérification concrète avant de passer à la suite. Ne sautez pas
les vérifications : c'est ce qui rend les incidents détectables plus
tard.

---

## 0. Pré-requis

```bash
docker compose up -d --build
docker compose ps
```

Attendu : deux containers `running`, `demo-app` et `traffic-generator`.

```bash
curl localhost:3001/
curl localhost:3001/metrics | head -20
docker compose logs traffic-generator --tail 10
```

Attendu : `OK`, un flux de métriques Prometheus (`# HELP` / `# TYPE`...),
et des lignes de log montrant des requêtes régulières
(`GET / -> 200`, `POST /checkout -> 200`, ...).

Si ce n'est pas le cas, arrêtez-vous ici et corrigez avant de continuer
— tout ce qui suit dépend de `demo-app` qui tourne et qui reçoit du
trafic.

---

## Partie 1 — Prometheus scrape demo-app

### 1.1 Ajouter le service dans `docker-compose.yml`

Ajoutez ce bloc dans `services:` :

```yaml
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.enable-lifecycle'   # permet de recharger la config sans redémarrer le container
    depends_on:
      - demo-app
    restart: unless-stopped
```

Et à la fin du fichier (même niveau que `services:`) :

```yaml
volumes:
  prometheus_data:
```

### 1.2 Écrire `prometheus/prometheus.yml`

```bash
mkdir -p prometheus
```

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ['localhost:9090']

  - job_name: demo-app
    metrics_path: /metrics
    static_configs:
      - targets: ['demo-app:3001']
```

### 1.3 Démarrer et vérifier

```bash
docker compose up -d --build prometheus
```

Ouvrez http://localhost:9090/targets : les deux jobs (`prometheus`,
`demo-app`) doivent être `UP` (vert) en quelques secondes.

### 1.4 Premières requêtes PromQL

Dans http://localhost:9090/graph :

```promql
up
sum(rate(http_requests_total[5m])) by (route)
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

Laissez tourner une minute et rafraîchissez : les courbes bougent grâce
au `traffic-generator`. Plus de requêtes commentées dans l'annexe
"Antisèche PromQL" en bas de ce document.

---

## Partie 2 — Métriques système et containers

### 2.1 Ajouter node-exporter et cAdvisor

Dans `docker-compose.yml` :

```yaml
  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter
    ports:
      - "9100:9100"
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.rootfs=/rootfs'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    restart: unless-stopped

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    container_name: cadvisor
    ports:
      - "8080:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
    privileged: true
    devices:
      - /dev/kmsg
    restart: unless-stopped
```

> Ces deux services lisent l'hôte Linux (`/proc`, `/sys`, `/var/run/docker.sock`
> via `/var/run`) — c'est pourquoi ils ont besoin de ces volumes et, pour
> cAdvisor, du mode `privileged`. Sur une VM Debian classique, ça
> fonctionne tel quel.

### 2.2 Ajouter les scrape jobs

Dans `prometheus/prometheus.yml`, ajoutez sous `scrape_configs:` :

```yaml
  - job_name: node-exporter
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: cadvisor
    static_configs:
      - targets: ['cadvisor:8080']
```

### 2.3 Démarrer et recharger

```bash
docker compose up -d --build node-exporter cadvisor
curl -X POST localhost:9090/-/reload
```

Vérifiez sur http://localhost:9090/targets que les 4 jobs sont `UP`.

### 2.4 Requêtes PromQL système/containers

```promql
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100
(1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100
sum(rate(container_cpu_usage_seconds_total{name!=""}[5m])) by (name)
sum(container_memory_usage_bytes{name!=""}) by (name)
```

---

## Partie 3 — Alertes Prometheus

### 3.1 Écrire `prometheus/rules.yml`

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

### 3.2 Charger les règles

Dans `prometheus/prometheus.yml`, ajoutez (au même niveau que
`scrape_configs:`) :

```yaml
rule_files:
  - /etc/prometheus/rules.yml
```

Et montez le fichier dans le service `prometheus` du `docker-compose.yml` :

```yaml
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./prometheus/rules.yml:/etc/prometheus/rules.yml:ro
      - prometheus_data:/prometheus
```

```bash
docker compose up -d prometheus   # recrée le container pour prendre en compte le nouveau volume
```

Vérifiez sur http://localhost:9090/rules que les 3 règles apparaissent.

### 3.3 Déclencher chaque alerte

```bash
# DemoAppDown
docker compose stop demo-app
# ... attendre ~1 min, observer localhost:9090/alerts ...
docker compose start demo-app

# DemoAppHighErrorRate
curl -X POST localhost:3001/admin/scenario/high-error
# ... attendre ~2-3 min (le traffic-generator suffit à alimenter le trafic) ...
curl -X POST localhost:3001/admin/scenario/reset

# DemoAppHighLatencyP95
curl -X POST localhost:3001/admin/scenario/high-latency
# ... attendre ~2-3 min ...
curl -X POST localhost:3001/admin/scenario/reset
```

Chaque alerte doit passer par les états `Inactive → Pending → Firing`
sur http://localhost:9090/alerts.

### 3.4 Alertes bonus (à ajouter vous-même)

Copiez celles qui vous intéressent dans `prometheus/rules.yml` (dans le
groupe `demo-app.rules`), puis rechargez : `curl -X POST localhost:9090/-/reload`.

**HighPaymentFailureRate** — se déclenche avec le scénario `high-payment-failure`.
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

**HighCheckoutLatencyP95** — se déclenche avec `checkout-degraded`.
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

**RecommendationServiceDegraded** — se déclenche avec `recommendation-degraded`.
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

**NoSuccessfulOrders** — plus aucune commande ne passe.
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

**ExporterDown** — node-exporter ou cAdvisor injoignable.
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

**HighCPUUsage** — CPU machine (déclenchement manuel, ex. `stress-ng`).
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

**HighMemoryUsage**
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

**LowDiskSpace**
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

**ContainerHighCPU**
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

---

## Partie 4 — Alertmanager

### 4.1 Ajouter le service

```yaml
  alertmanager:
    image: prom/alertmanager:latest
    container_name: alertmanager
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
    restart: unless-stopped
```

### 4.2 Écrire `alertmanager/alertmanager.yml`

```bash
mkdir -p alertmanager
```

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

Ce receiver `default` n'a aucune configuration de notification (pas de
Slack/email) — Alertmanager affiche simplement les alertes dans son UI
(http://localhost:9093). Pour aller plus loin (optionnel), on peut
brancher un vrai receiver Slack/email en ajoutant `slack_configs:` ou
`email_configs:` sous `receivers:`.

### 4.3 Relier Prometheus à Alertmanager

Dans `prometheus/prometheus.yml`, ajoutez (au même niveau que
`scrape_configs:` et `rule_files:`) :

```yaml
alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093
```

```bash
docker compose up -d --build alertmanager
docker compose up -d prometheus   # recrée pour appliquer alerting.alertmanagers
```

### 4.4 Vérifier

```bash
docker compose stop demo-app
# ... attendre ~1 min ...
```
Ouvrez http://localhost:9093 : l'alerte `DemoAppDown` doit apparaître.
```bash
docker compose start demo-app
```

---

## Partie 5 — Grafana

### 5.1 Ajouter le service

```yaml
  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
    depends_on:
      - prometheus
    restart: unless-stopped
```

Et dans `volumes:` en bas du fichier :

```yaml
  grafana_data:
```

```bash
docker compose up -d --build grafana
```

Ouvrez http://localhost:3000, connectez-vous avec `admin` / `admin`
(Grafana demande de changer le mot de passe — vous pouvez passer avec
"Skip" pour ce TP).

### 5.2 Connecter la datasource Prometheus

Dans Grafana : **Connections → Data sources → Add data source → Prometheus**.
- URL : `http://prometheus:9090`
- Cliquez **Save & test** → doit afficher "Successfully queried the Prometheus API".

### 5.3 Construire le dashboard, panel par panel

**Dashboards → New → New Dashboard → Add visualization → sélectionnez
votre datasource Prometheus.**

Pour chaque ligne du tableau : collez la requête dans le champ de
requête du panel, choisissez le type indiqué, donnez-lui le titre de la
colonne "Panel", puis **Apply**. Regroupez les panels par thème avec des
**Rows** (bouton "Add → Row").

| # | Row | Panel | Type | Requête PromQL |
|---|---|---|---|---|
| 1 | Cibles | Targets UP | Stat | `count(up == 1)` |
| 2 | Cibles | Targets DOWN | Stat | `count(up == 0) OR vector(0)` |
| 3 | HTTP | Trafic HTTP par route | Time series | `sum(rate(http_requests_total[5m])) by (route)` |
| 4 | HTTP | Erreurs 5xx par route | Time series | `sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (route)` |
| 5 | HTTP | Taux d'erreur global | Stat/Gauge | `sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))` |
| 6 | HTTP | Latence p95 par route | Time series | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))` |
| 7 | Système | CPU machine | Time series/Gauge | `100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)` |
| 8 | Système | RAM machine | Time series/Gauge | `(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100` |
| 9 | Système | Disque utilisé | Gauge | `(1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100` |
| 10 | Containers | CPU par container | Time series | `sum(rate(container_cpu_usage_seconds_total{name!=""}[5m])) by (name)` |
| 11 | Containers | Mémoire par container | Time series | `sum(container_memory_usage_bytes{name!=""}) by (name)` |
| 12 | Métier | Commandes success/failed | Time series | `sum(rate(orders_total[5m])) by (status)` |
| 13 | Métier | Paiements success/failed | Time series | `sum(rate(payments_total[5m])) by (status)` |
| 14 | Métier | Taux d'échec paiement | Stat/Gauge | `sum(rate(payments_total{status="failed"}[5m])) / sum(rate(payments_total[5m]))` |
| 15 | Métier | Recommandations success/fallback/error | Time series | `sum(rate(recommendation_requests_total[5m])) by (result)` |
| 16 | État | Dépendances simulées | Time series/Table | `dependency_status` |
| 17 | État | Incident actif | Time series/Table | `incident_active == 1` |

Astuces :
- Pour les panels "Time series" avec plusieurs séries (`by (route)`,
  `by (status)`, etc.), utilisez `{{route}}` / `{{status}}` comme
  "Legend" pour un affichage lisible.
- Pour les panels 5 et 14 (des ratios entre 0 et 1), configurez l'unité
  du panel sur "Percent (0.0-1.0)" dans les options du panel.
- Enregistrez régulièrement le dashboard (icône disquette en haut).

---

## Partie 6 — Détecter des incidents

### 6.1 Déclenchement manuel

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

Après chaque déclenchement, observez votre dashboard et les alertes.
Le tableau ci-dessous décrit ce qui doit bouger pour chacun :

| Scénario | Ce qui change | Panels concernés | Alerte attendue |
|---|---|---|---|
| `normal` | Ligne de base : erreurs rares, latence basse, paiements OK | — | aucune |
| `high-error` | `/checkout` et `/payment` renvoient 500 dans ~40% des cas | Erreurs 5xx par route, Taux d'erreur global | `DemoAppHighErrorRate` |
| `high-latency` | `/checkout` et `/recommendations` passent à 1.5-3s | Latence p95 par route | `DemoAppHighLatencyP95` |
| `high-payment-failure` | Paiements échouent ~70%, `payment-gateway` → 0, cascade sur les commandes | Paiements success/failed, Taux d'échec paiement, Dépendances simulées | `HighPaymentFailureRate` (bonus) |
| `checkout-degraded` | `/checkout` lent (2-4s) **et** ~30% d'échecs | Latence p95 par route, Commandes success/failed | `HighCheckoutLatencyP95` (bonus) |
| `recommendation-degraded` | `/recommendations` lente, 60% de fallback, `recommendation-engine` → 0 | Recommandations success/fallback/error, Dépendances simulées | `RecommendationServiceDegraded` (bonus) |
| `traffic-spike` | Le débit de trafic augmente, mais pas plus d'erreurs ni de latence | Trafic HTTP par route, Incident actif | aucune — volontairement, pour montrer qu'un pic de trafic n'est pas toujours un incident |

### 6.2 Mode incidents aléatoires

Pour laisser la stack générer des incidents toute seule (utile pour
s'entraîner à détecter sans savoir à l'avance ce qui va se passer) :

```yaml
# docker-compose.yml, service traffic-generator
environment:
  - ENABLE_RANDOM_INCIDENTS=true
```
```bash
docker compose up -d --build traffic-generator
```

Un incident se déclenche toutes les 6 à 12 minutes et dure de 2 à 5
minutes (valeurs par défaut, réglables via
`RANDOM_INCIDENT_MIN/MAX_INTERVAL_MS` et
`RANDOM_INCIDENT_MIN/MAX_DURATION_MS`). Surveillez votre dashboard sans
regarder les logs du traffic-generator pour vous entraîner à détecter
"à l'aveugle", comme en astreinte.

---

## Partie 7 — Export du dashboard JSON

Dans Grafana, ouvrez votre dashboard → icône de partage (en haut) →
**Export** → **Export as JSON** → téléchargez le fichier. C'est le
livrable final du TP : un dashboard complet, versionnable, réimportable
sur n'importe quelle autre instance Grafana.

---

## Annexe — Antisèche PromQL

```promql
# --- Trafic HTTP ---
sum(rate(http_requests_total{job="demo-app"}[5m]))                 # requêtes/s, toutes routes
sum(rate(http_requests_total{job="demo-app"}[5m])) by (route)      # par route
sum(rate(http_requests_total{job="demo-app"}[5m])) by (status_code) # par code de statut

# --- Erreurs ---
sum(rate(http_requests_total{job="demo-app",status_code=~"5.."}[5m])) by (route)
sum(rate(http_requests_total{job="demo-app",status_code=~"5.."}[5m]))
/
sum(rate(http_requests_total{job="demo-app"}[5m]))                 # taux d'erreur global (0 à 1)

# --- Latence ---
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket{job="demo-app"}[5m])) by (le, route)
)                                                                    # p95 par route
histogram_quantile(0.50,
  sum(rate(http_request_duration_seconds_bucket{job="demo-app"}[5m])) by (le)
)                                                                    # médiane globale
rate(http_request_duration_seconds_sum{job="demo-app"}[5m])
/
rate(http_request_duration_seconds_count{job="demo-app"}[5m])       # durée moyenne (attention aux outliers)

# --- Métier ---
sum(rate(orders_total[5m])) by (status)
sum(rate(payments_total{status="failed"}[5m])) / sum(rate(payments_total[5m]))
sum(rate(recommendation_requests_total{result="fallback"}[5m])) / sum(rate(recommendation_requests_total[5m]))
active_users                                                         # Gauge, pas de rate()
dependency_status                                                    # 1 = OK, 0 = dégradé
incident_active == 1                                                 # scénario actuellement actif

# --- Système (node-exporter) ---
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100
(1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100

# --- Containers (cAdvisor) ---
sum(rate(container_cpu_usage_seconds_total{name!=""}[5m])) by (name)
sum(container_memory_usage_bytes{name!=""}) by (name)

# --- Cibles Prometheus ---
count(up == 1)
count(up == 0)
```
