#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
seed_geojson.py — Génère la base GeoJSON fictive de Carto'Eau dans ./data/

Convertit le jeu de données de référence (js/data.js, lu via Node) et l'état
de démonstration du registre des défauts (extrait de js/defauts.js) en
FeatureCollections conformes RFC 7946 :

    data/secteurs.geojson      → Polygones   (contours de sectorisation)
    data/reservoirs.geojson    → Points      (réservoirs)
    data/stations.geojson      → Points      (usines, pompages, surpressions)
    data/compteurs.geojson     → Points      (compteurs de sectorisation / FDI)
    data/canalisations.geojson → LineStrings (canalisations principales + antennes)
    data/defauts.geojson       → Points      (registre des défauts & anomalies)
    data/journal.geojson       → Points      (historique des évènements, journal immuable)

Usage :
    python3 scripts/seed_geojson.py            # crée les fichiers (sans écraser l'existant)
    python3 scripts/seed_geojson.py --force    # régénère depuis le jeu fictif d'origine
"""

import datetime
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
NOW = datetime.datetime.now().isoformat(timespec="seconds")


def now_str():
    d = datetime.datetime.now()
    return d.strftime("%d/%m/%Y %H:%M")


# ---------------------------------------------------------------------- #
# 1. Jeu de données réseau : exécuté dans Node pour évaluer js/data.js
# ---------------------------------------------------------------------- #
NODE_LOADER = ("global.window={}; const fs=require('fs');"
               " eval(fs.readFileSync(process.argv[1],'utf8')+';global.DATASET=DATASET;');"
               " console.log(JSON.stringify(global.DATASET));")


def node_eval(js_code, arg=None):
    cmd = ["node", "-e", js_code] + ([arg] if arg else [])
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError("Node a échoué :\n" + out.stderr)
    return json.loads(out.stdout)


def load_dataset():
    js_path = os.path.join(ROOT, "js", "data.js")
    return node_eval(NODE_LOADER, js_path)


# ---------------------------------------------------------------------- #
# 2. État de démonstration du registre des défauts : extrait de js/defauts.js
#    (fonctions DEMO_MANUELS / DEMO_SUIVI littérales dans le fichier)
# ---------------------------------------------------------------------- #
def load_demo_defauts():
    src = open(os.path.join(ROOT, "js", "defauts.js"), encoding="utf-8").read()

    def extract(fn_name):
        m = re.search(r"function %s\(\)\s*\{" % fn_name, src)
        if not m:
            raise RuntimeError(f"Fonction {fn_name} introuvable dans js/defauts.js")
        i, depth = m.end() - 1, 0
        while True:
            c = src[i]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        return src[m.start():i + 1]

    snippet = "%s\n%s\nconsole.log(JSON.stringify({ manuels: DEMO_MANUELS(), suivi: DEMO_SUIVI() }));" % (
        extract("DEMO_MANUELS"), extract("DEMO_SUIVI"))
    return node_eval(snippet)


# ---------------------------------------------------------------------- #
# Conversion applicatif → GeoJSON
# ---------------------------------------------------------------------- #
def feature(pid, geom, props):
    p = dict(props)
    p["id"] = pid
    return {"type": "Feature", "id": pid, "geometry": geom, "properties": p}


def point(coord):
    return {"type": "Point", "coordinates": [round(coord[1], 6), round(coord[0], 6)]}


def collection(kind, title, desc, feats):
    return {
        "type": "FeatureCollection",
        "name": kind,
        "title": title,
        "description": desc,
        "generated": NOW,
        "modified": NOW,
        "_cartoeau": {"note": "Données fictives de démonstration — ECLA Lons Agglo",
                      "projection": "WGS84 (EPSG:4326), longitude/latitude (RFC 7946)"},
        "features": feats,
    }


def build_secteurs(ds):
    feats = []
    for s in ds["secteurs"]:
        ring = [[round(c[1], 6), round(c[0], 6)] for c in s["poly"]]
        ring.append(list(ring[0]))
        props = {k: v for k, v in s.items() if k not in ("id", "poly")}
        feats.append(feature(s["id"], {"type": "Polygon", "coordinates": [ring]}, props))
    return collection("secteurs", "Secteurs de distribution",
                      "Polygones délimitant les secteurs de sectorisation du réseau d'eau potable.", feats)


def build_points(ds, key, name, desc):
    feats = []
    for it in ds[key]:
        props = {k: v for k, v in it.items() if k not in ("id", "coord")}
        feats.append(feature(it["id"], point(it["coord"]), props))
    return collection(key, name, desc, feats)


def build_canalisations(ds):
    feats = []
    for i, c in enumerate(ds["canalisations"], 1):
        cid = c.get("id") or "CAN-%02d" % i
        props = {k: v for k, v in c.items() if k not in ("id", "a", "b")}
        geom = {"type": "LineString",
                "coordinates": [[round(c["a"][1], 6), round(c["a"][0], 6)],
                                [round(c["b"][1], 6), round(c["b"][0], 6)]]}
        feats.append(feature(cid, geom, props))
    return collection("canalisations", "Canalisations principales",
                      "Colonnes d'alimentation, aménées et antennes de distribution.", feats)


def build_defauts(demo):
    feats = []
    for m in demo["manuels"]:
        props = {k: v for k, v in m.items() if k not in ("ref", "coord")}
        su = demo["suivi"].get(m["ref"], {})
        props["statut_suivi"] = su.get("statut", "ouvert")
        props["source_ref"] = m["ref"]
        props["actions"] = su.get("actions", [])
        props["acquitte_le"] = su.get("acquitte_le")
        feats.append(feature(m["ref"], point(m["coord"]) if m.get("coord") else None, props))
    return collection("defauts", "Registre des défauts & anomalies",
                      "Signalements manuels géolocalisés ; les défauts détectés automatiquement "
                      "sont recalculés en direct depuis les données réseau.", feats)


def build_journal(demo):
    events = []
    for ref, su in demo["suivi"].items():
        for a in su.get("actions", []):
            events.append({"date": a["date"], "defaut": ref, "type": "statut",
                           "message": f"{a['du']} → {a['vers']}" + (f" · « {a['commentaire']} »" if a.get("commentaire") else ""),
                           "acteur": a["acteur"]})
    events.sort(key=lambda e: e["date"], reverse=True)
    feats = []
    for i, e in enumerate(events):
        e["eid"] = "EVT-%04d" % (i + 1)
        feats.append(feature(e["eid"], None, e))
    return collection("journal", "Historique des évènements",
                      "Journal immuable de toutes les actions réalisées sur le registre "
                      "(créations, changements de statut, acquêtements).", feats)


# ---------------------------------------------------------------------- #
def main():
    force = "--force" in sys.argv
    os.makedirs(DATA_DIR, exist_ok=True)
    ds = load_dataset()
    demo = load_demo_defauts()

    collections = {
        "secteurs": build_secteurs(ds),
        "reservoirs": build_points(ds, "reservoirs", "Réservoirs d'eau potable",
                                   "Réservoirs de stockage et d'équilibrage du réseau."),
        "stations": build_points(ds, "stations", "Stations de traitement et de pompage",
                                 "Usines, stations de pompage et de surpression."),
        "compteurs": build_points(ds, "compteurs", "Compteurs de sectorisation (FDI)",
                                  "Points de comptage général de secteur, avec QMn et index."),
        "canalisations": build_canalisations(ds),
        "defauts": build_defauts(demo),
        "journal": build_journal(demo),
    }

    for name, fc in collections.items():
        path = os.path.join(DATA_DIR, name + ".geojson")
        if os.path.exists(path) and not force:
            print(f"↷ {name}.geojson existe déjà — ignoré (--force pour régénérer).")
            continue
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(fc, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        print(f"✔ data/{name}.geojson — {len(fc['features'])} entités")

    readme = os.path.join(DATA_DIR, "README.md")
    if not os.path.exists(readme):
        open(readme, "w", encoding="utf-8").write(
            "# Base de données GeoJSON — Carto'Eau\n\n"
            "Un fichier FeatureCollection par thème (RFC 7946, coordonnées lon,lat WGS84).\n\n"
            "| Fichier | Géométrie | Contenu |\n"
            "|---|---|---|\n"
            "| `secteurs.geojson` | Polygon | Secteurs de distribution |\n"
            "| `reservoirs.geojson` | Point | Réservoirs |\n"
            "| `stations.geojson` | Point | Stations de traitement/pompage |\n"
            "| `compteurs.geojson` | Point | Compteurs de sectorisation |\n"
            "| `canalisations.geojson` | LineString | Canalisations |\n"
            "| `defauts.geojson` | Point | Défauts signalés manuellement |\n"
            "| `journal.geojson` | sans géométrie | Historique des évènements |\n\n"
            "**Éditer ces fichiers** : soit directement (QGIS, VS Code, n'importe quel éditeur),\n"
            "soit via l'API REST du serveur : `GET/POST/PUT/PATCH/DELETE /api/geojson/<collection>[/<id>]`,\n"
            "soit sans coder depuis l'interface d'administration (`admin.html`).\n\n"
            "⚠ Toutes les données sont **fictives**, générées pour la démonstration.\n")
        print("✔ data/README.md")


if __name__ == "__main__":
    main()
