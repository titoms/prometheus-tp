## TP Grafana - Compléter le dashboard

Vous disposez déjà d'un dashboard contenant :

- l'état `UP/DOWN` de la Demo App
- le trafic HTTP par route

Ajoutez **4 nouvelles visualisations** en réutilisant les métriques et requêtes PromQL vues précédemment.

### Visualisation 1 - Utilisation CPU de la machine

Créez un panel permettant d'afficher le pourcentage de CPU utilisé à partir des métriques Node Exporter.

Choisissez un type de visualisation adapté.

---

### Visualisation 2 - Utilisation mémoire de la machine

Affichez le pourcentage de RAM utilisée.

Le panel doit permettre de comprendre rapidement si la mémoire disponible devient faible.

---

### Visualisation 3 - CPU des conteneurs

À partir des métriques cAdvisor, affichez la consommation CPU des différents services Docker Compose.

Vous devez pouvoir comparer les différents services.

Exemples :

```text
demo-app
traffic-generator
prometheus
grafana
```

---

### Visualisation 4 - Mémoire des conteneurs

Affichez la mémoire consommée par chaque service Docker Compose.

Essayez une visualisation différente de celles déjà utilisées.

---

## Contraintes

Votre dashboard doit utiliser au moins **3 types de visualisations différents** parmi :

```text
Time series
Stat
Gauge
Bar gauge
Table
```

Pour chaque panel :

- donnez un titre clair
- utilisez une unité adaptée (`%`, bytes, MB...)
- vérifiez que la requête retourne bien les données attendues
- choisissez une visualisation adaptée à l'information

À la fin, le dashboard doit permettre de répondre rapidement à :

- l'application est-elle accessible ?
- reçoit-elle du trafic ?
- la machine consomme-t-elle beaucoup de CPU ou de RAM ?
- quel conteneur consomme le plus de ressources ?