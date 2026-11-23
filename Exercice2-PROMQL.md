## TP PromQL - Exploration de la Demo App

À partir des métriques déjà collectées par Prometheus, trouvez les requêtes permettant de répondre aux questions suivantes.

### État général

- Afficher toutes les targets supervisées.
- Afficher uniquement `demo-app`.
- Afficher uniquement les targets qui sont `UP`.
- Afficher uniquement les targets qui sont `DOWN`.

### Exploration des requêtes HTTP

À partir de :

```promql
http_requests_total
```

Trouvez comment :

- afficher uniquement la route `/checkout`
- afficher uniquement les requêtes `GET`
- afficher uniquement les réponses `200`
- exclure une route précise

### Agrégations

Construisez des requêtes permettant de connaître :

- le nombre total de séries HTTP
- le trafic total par seconde
- le trafic par route
- le trafic par méthode HTTP
- le trafic par code HTTP
- le trafic par route et code HTTP

Utilisez notamment :

```text
count()
sum()
sum by(...)
rate()
```

### Identifier les routes les plus utilisées

À partir du trafic par route :

- trouvez les routes les plus actives
- essayez `sort_desc()`
- essayez `topk()`

Exemple d'objectif :

```text
Top 3 des routes les plus utilisées
```

### Observer les métriques métier

Explorez également :

```text
payments_total
orders_total
recommendation_requests_total
active_users
dependency_status
```

Essayez de construire :

- le nombre de paiements par statut
- le nombre de commandes par statut
- le débit de paiements par seconde
- le débit de commandes par seconde
- l'état des dépendances
- le nombre d'utilisateurs actifs

### Comparer valeur actuelle et historique

Comparez :

```promql
http_requests_total
```

et :

```promql
http_requests_total[1m]
```

Puis testez :

```promql
rate(http_requests_total[1m])
```

Expliquez la différence entre :

- valeur actuelle
- valeurs sur une période
- vitesse d'évolution