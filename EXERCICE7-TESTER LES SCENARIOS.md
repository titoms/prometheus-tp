# Exercice final - Valider votre supervision

Votre stack de monitoring est maintenant complète.

Choisissez au minimum **3 scénarios** parmi ceux disponibles et testez votre supervision.

Pour chaque scénario :

1. activez le scénario ;
2. observez Grafana ;
3. vérifiez les alertes Prometheus ;
4. vérifiez Alertmanager et MailHog ;
5. identifiez les métriques qui permettent de comprendre l'incident ;
6. vérifiez si vos panels et alertes sont réellement adaptés ;
7. modifiez votre configuration si nécessaire.

Pour chaque incident, notez rapidement :

```text
Scénario :

Symptôme observé :

Métriques utiles :

Panel Grafana utile :

Alerte déclenchée :

Severity :

Notification reçue :

Amélioration éventuelle :
```

## Objectif

À la fin, votre supervision doit permettre de détecter au minimum :

- une indisponibilité ;
- un problème HTTP ;
- un problème de latence ;
- un problème métier ;
- un problème de ressources ou de conteneur.

L'objectif n'est pas d'avoir le plus d'alertes possible, mais d'avoir des alertes et panels réellement utiles pour comprendre ce qui se passe.

----

# Répertoire des scénarios - Demo App

## Vérifier le scénario actif

```powershell
curl.exe http://localhost:3001/admin/status
```

---

## Retour à l'état normal

```powershell
curl.exe -X POST http://localhost:3001/admin/scenario/reset
```

ou :

```powershell
curl.exe -X POST http://localhost:3001/admin/scenario/normal
```

---

## 1. Erreurs HTTP élevées

```powershell
curl.exe -X POST http://localhost:3001/admin/scenario/high-error
```

À observer :

- taux d'erreur HTTP
- réponses `5xx`
- routes concernées
- alerte `DemoAppHighErrorRate`
- dashboard Grafana
- notification Alertmanager / MailHog

---

## 2. Latence élevée

```powershell
curl.exe -X POST http://localhost:3001/admin/scenario/high-latency
```

À observer :

- p95
- routes les plus lentes
- application toujours `UP`
- alerte `DemoAppHighLatency`

---

## 3. Échecs de paiement

```powershell
curl.exe -X POST http://localhost:3001/admin/scenario/high-payment-failure
```

À observer :

- `payments_total`
- paiements `success` / `failed`
- taux d'échec
- alerte métier éventuelle

---

## 4. Checkout dégradé

```powershell
curl.exe -X POST http://localhost:3001/admin/scenario/checkout-degraded
```

À observer :

- route `/checkout`
- latence
- erreurs éventuelles
- impact sur les commandes
- pertinence des alertes actuelles

---

## 5. Recommandations dégradées

```powershell
curl.exe -X POST http://localhost:3001/admin/scenario/recommendation-degraded
```

À observer :

- `recommendation_requests_total`
- `dependency_status`
- éventuelle alerte de dépendance
- métriques HTTP associées

---

## 6. Pic de trafic

```powershell
curl.exe -X POST http://localhost:3001/admin/scenario/traffic-spike
```

À observer :

- trafic HTTP
- CPU de la Demo App
- CPU machine
- CPU containers
- mémoire
- latence éventuelle

---

## Rappel

Après chaque test :

```powershell
curl.exe -X POST http://localhost:3001/admin/scenario/reset
```

Attendez ensuite suffisamment longtemps pour que les fenêtres PromQL comme `[1m]` reviennent progressivement à la normale.