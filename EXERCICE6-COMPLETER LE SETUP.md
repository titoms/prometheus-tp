# TP final - Compléter et valider la supervision

## Contexte

La stack complète est opérationnelle :

- Demo App
- Traffic Generator
- Prometheus
- Node Exporter
- cAdvisor
- Grafana
- Alertmanager
- notifications email

Votre objectif est maintenant de transformer cette stack en véritable système de supervision cohérent.

---

# Partie 1 - Ajouter au moins 6 alertes

Vous devez disposer au minimum de **6 alertes pertinentes supplémentaires**, en plus des alertes déjà créées pendant le cours.

Vous pouvez notamment surveiller les situations suivantes.

## Infrastructure

Exemples :

```text
CPU machine trop élevé
RAM trop élevée
disque presque plein
Node Exporter indisponible
```

## Containers

Exemples :

```text
CPU d'un service très élevé
mémoire d'un service très élevée
cAdvisor indisponible
```

## Application

Exemples :

```text
Demo App indisponible
taux d'erreurs HTTP élevé
latence p95 élevée
```

## Métier

Exemples :

```text
taux d'échec des paiements élevé
aucune commande réussie
service de recommandation dégradé
dépendance indisponible
```

Pour chaque alerte :

```text
alert
expr
for
severity
summary
description
```

Choisissez :

```text
warning
```

ou :

```text
critical
```

et justifiez votre choix.

---

# Partie 2 - Ajouter au moins 6 panels Grafana

Ajoutez au minimum **6 nouveaux panels** utiles.

Le dashboard final doit couvrir :

## Santé

- disponibilité Demo App
- disponibilité des exporters

## HTTP

- trafic
- erreurs
- codes HTTP
- latence

## Machine

- CPU
- RAM
- disque

## Containers

- CPU
- mémoire

## Métier

Au minimum deux parmi :

```text
paiements
commandes
recommandations
utilisateurs actifs
dépendances
```

Utilisez plusieurs types de visualisation :

```text
Stat
Gauge
Time series
Bar gauge
Table
```

Chaque panel doit avoir :

- un titre explicite
- une unité adaptée
- une requête PromQL pertinente
- une représentation cohérente

---

# Partie 3 - Tester les scénarios

Testez successivement :

```powershell
curl.exe -X POST http://localhost:3001/admin/scenario/high-error
```

Puis :

```powershell
curl.exe -X POST http://localhost:3001/admin/scenario/reset
```

Testez ensuite :

```powershell
curl.exe -X POST http://localhost:3001/admin/scenario/high-latency
```

Puis reset.

Ensuite :

```powershell
curl.exe -X POST http://localhost:3001/admin/scenario/high-payment-failure
```

Puis reset.

Testez enfin au moins deux scénarios parmi :

```text
checkout-degraded
recommendation-degraded
traffic-spike
```

---

# Partie 4 - Vérification

Pour chaque scénario, indiquez :

```text
Symptôme :

Métrique permettant de le détecter :

Panel Grafana :

Alerte :

Severity :

Email reçu :

Impact probable :
```

---

# Partie 5 - Validation

Votre supervision doit permettre de répondre rapidement à :

1. L'application est-elle disponible ?
2. Est-elle lente ?
3. Produit-elle trop d'erreurs ?
4. La machine manque-t-elle de ressources ?
5. Un container consomme-t-il anormalement ?
6. Les paiements fonctionnent-ils ?
7. Les commandes fonctionnent-elles ?
8. Les dépendances fonctionnent-elles ?
9. Les alertes sont-elles correctement routées ?
10. Les alertes critiques provoquent-elles un email ?

---

# Bonus

Ajoutez une alerte ou un panel qui ne figurait pas dans l'énoncé mais que vous estimez pertinent pour une application e-commerce.