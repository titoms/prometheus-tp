TP PromQL - Métriques système et conteneurs

Objectif
Vous disposez maintenant de :

    Prometheus
    Node Exporter
    cAdvisor
    Demo App
    Traffic Generator

Votre objectif est d'utiliser PromQL pour observer :

    l'état de la machine
    l'utilisation CPU
    la mémoire
    le disque
    l'activité des conteneurs Docker

1. Vérifier les nouvelles targets
Trouvez les requêtes permettant de :

    afficher toutes les targets
    afficher uniquement Node Exporter
    afficher uniquement cAdvisor
    vérifier qu'elles sont UP

2. Explorer les métriques système
Explorez les métriques suivantes :

    node_cpu_seconds_total
    node_memory_MemTotal_bytes
    node_memory_MemAvailable_bytes
    node_filesystem_size_bytes
    node_filesystem_avail_bytes

Essayez d'identifier les labels disponibles.

3. CPU de la machine
À partir de :

    node_cpu_seconds_total

Trouvez comment :

    afficher uniquement le temps CPU passé en mode idle
    calculer son évolution par seconde
    obtenir le pourcentage moyen de CPU utilisé

4. Mémoire de la machine
Construisez une requête permettant de connaître :

    la mémoire totale
    la mémoire disponible
    la mémoire utilisée en %
    éventuellement la mémoire utilisée en Go

5. Espace disque
Construisez une requête permettant de connaître :

    la taille totale du système de fichiers
    l'espace disponible
    le pourcentage d'espace disque utilisé

Essayez d'éviter les systèmes de fichiers temporaires ou internes à Docker.

6. Explorer les métriques conteneurs
Avec cAdvisor, explorez :

    container_cpu_usage_seconds_total
    container_memory_usage_bytes

Identifiez les labels permettant de distinguer les conteneurs ou services Docker Compose.

7. CPU des conteneurs
Construisez une requête permettant d'afficher :

    la consommation CPU de chaque conteneur/service
    uniquement les conteneurs réellement liés au projet

Essayez ensuite de trier les résultats du plus gros consommateur au plus petit.

8. Mémoire des conteneurs
Construisez une requête permettant d'afficher :

    la mémoire utilisée par chaque service Docker Compose
    les services triés du plus gros consommateur au plus petit

9. Top consommateurs
Construisez :

    le top 3 des services utilisant le plus de CPU
    le top 3 des services utilisant le plus de mémoire

10. Diagnostic rapide
À partir de vos requêtes, soyez capables de répondre à :

    la machine manque-t-elle de CPU ?
    la machine manque-t-elle de mémoire ?
    le disque est-il presque plein ?
    quel conteneur consomme le plus de CPU ?
    quel conteneur consomme le plus de mémoire ?