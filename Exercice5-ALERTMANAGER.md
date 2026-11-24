## TP Alertmanager

À partir des métriques et requêtes PromQL déjà utilisées, ajoutez les alertes suivantes.

### Alerte 1 - Taux d'erreur HTTP élevé

Déclencher une alerte lorsque plus de 10 % des requêtes HTTP retournent une erreur `5xx` pendant au moins 30 secondes.

Nom conseillé :

```text
DemoAppHighErrorRate
```

Niveau :

```text
warning
```

---

### Alerte 2 - Latence élevée

Déclencher une alerte lorsque le p95 d'une route dépasse 1 seconde pendant au moins 30 secondes.

Nom conseillé :

```text
DemoAppHighLatency
```

Niveau :

```text
warning
```

---

### Alerte 3 - Mémoire machine élevée

Déclencher une alerte lorsque l'utilisation mémoire dépasse 80 % pendant au moins 1 minute.

Nom conseillé :

```text
HostHighMemoryUsage
```

Niveau :

```text
warning
```

---

Pour chaque alerte :

- écrire l'expression PromQL
- définir `for`
- définir un label `severity`
- ajouter `summary` et `description`
- recharger Prometheus
- vérifier que la règle apparaît dans Prometheus