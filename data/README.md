# Base de données GeoJSON — Carto'Eau

Un fichier FeatureCollection par thème (RFC 7946, coordonnées lon,lat WGS84).

| Fichier | Géométrie | Contenu |
|---|---|---|
| `secteurs.geojson` | Polygon | Secteurs de distribution |
| `reservoirs.geojson` | Point | Réservoirs |
| `stations.geojson` | Point | Stations de traitement/pompage |
| `compteurs.geojson` | Point | Compteurs de sectorisation |
| `canalisations.geojson` | LineString | Canalisations |
| `defauts.geojson` | Point | Défauts signalés manuellement |
| `journal.geojson` | sans géométrie | Historique des évènements |

**Éditer ces fichiers** : soit directement (QGIS, VS Code, n'importe quel éditeur),
soit via l'API REST du serveur : `GET/POST/PUT/PATCH/DELETE /api/geojson/<collection>[/<id>]`,
soit sans coder depuis l'interface d'administration (`admin.html`).

⚠ Toutes les données sont **fictives**, générées pour la démonstration.
