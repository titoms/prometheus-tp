## TP PromQL - Demo App

À partir de Prometheus, construisez les requêtes permettant de répondre aux questions suivantes.

### 1. Vérifier l'état de l'application

- Afficher l'état de toutes les targets.
- Afficher uniquement l'état de `demo-app`.
- Tester ce qui se passe après :

```powershell
docker compose stop demo-app
```

Puis relancer :

```powershell
docker compose start demo-app
```

### 2. Observer le trafic HTTP

À partir de :

```promql
http_requests_total
```

Trouvez les requêtes permettant de :

- voir uniquement la route `/products`
- voir uniquement les erreurs `5xx`
- afficher le nombre de requêtes par seconde
- afficher le trafic par route

### 3. Identifier les erreurs

Construisez une requête permettant d'afficher :

- les erreurs `5xx` par seconde
- les erreurs regroupées par route
- le taux global d'erreur en %

### 4. Tester un incident

Activez :

```powershell
curl.exe -X POST http://localhost:3001/admin/scenario/high-error
```

Avec vos requêtes, déterminez :

- si l'application est toujours `UP`
- quelles routes produisent des erreurs
- si le taux d'erreur augmente

Puis :

```powershell
curl.exe -X POST http://localhost:3001/admin/scenario/reset
```

### 5. Observer la latence

Explorez :

```promql
http_request_duration_seconds_bucket
```

Puis testez :

```promql
histogram_quantile(
  0.95,
  sum by(route, le) (
    rate(http_request_duration_seconds_bucket[1m])
  )
)
```

Activez :

```powershell
curl.exe -X POST http://localhost:3001/admin/scenario/high-latency
```

Identifiez les routes dont le p95 augmente.

### Objectif final

Vous devez être capables de répondre avec PromQL à ces 4 questions :

- l'application répond-elle ?
- combien de trafic reçoit-elle ?
- produit-elle des erreurs ?
- est-elle lente ?