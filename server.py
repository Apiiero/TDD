#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Carto'Eau — serveur de démonstration + API GeoJSON
====================================================
Sert les fichiers statiques de l'application ET expose une vraie base de
données géographique au format GeoJSON, stockée dans le répertoire « data/ » :

    GET    /api/geojson/<collection>          → FeatureCollection (RFC 7946)
    POST   /api/geojson/<collection>          → ajoute une entité
    PUT    /api/geojson/<collection>/<id>     → modifie une entité
    PATCH  /api/geojson/<collection>/<id>     → modifie un ou plusieurs champs
    DELETE /api/geojson/<collection>/<id>     → supprime une entité
    GET    /api/sante                         → état de la base (compteurs par fichier)

Collections disponibles : secteurs, reservoirs, stations, compteurs,
canalisations, defauts, journal.

Fonctionnement :
  - Au premier lancement, les fichiers GeoJSON sont créés dans « data/ » à
    partir du jeu de données fictif de référence (js/data.js et l'état de
    démonstration du registre des défauts).
  - Toute modification effectuée depuis l'interface d'administration est
    enregistrée sur le disque (persistance réelle, partageable en réseau).
  - Sans ce serveur, l'application reste utilisable : elle retombe
    automatiquement sur le stockage local du navigateur (mode dégradé).

Lancement :
    python3 server.py            # http://localhost:8090
    python3 server.py 8080       # autre port
"""

import datetime
import json
import os
import re
import sys
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
LOCK = threading.Lock()

COLLECTIONS = ("secteurs", "reservoirs", "stations", "compteurs",
               "canalisations", "defauts", "journal")

ID_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".geojson": "application/geo+json; charset=utf-8",
        ".json": "application/json; charset=utf-8",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # ------------------------------------------------------------------ #
    # Routing
    # ------------------------------------------------------------------ #
    def do_GET(self):
        path = urlparse(self.path).path
        m = re.match(r"^/api/sante/?$", path)
        if m:
            return self._send(200, sante())
        m = re.match(r"^/api/geojson/([a-z]+)(?:/([A-Za-z0-9_.-]+))?/?$", path)
        if m:
            col, ident = m.group(1), m.group(2)
            if col not in COLLECTIONS:
                return self._send(404, {"erreur": f"Collection inconnue : {col}"})
            try:
                fc = load_collection(col)
            except FileNotFoundError:
                return self._send(404, {"erreur": f"Fichier introuvable : data/{col}.geojson"})
            if ident is None:
                return self._send(200, fc)
            feat = find_feature(fc, ident)
            if feat is None:
                return self._send(404, {"erreur": f"Entité '{ident}' introuvable dans {col}"})
            return self._send(200, feat["properties"])

        return SimpleHTTPRequestHandler.do_GET(self)

    def _serve_file(self, path, ctype):
        fpath = os.path.normpath(os.path.join(ROOT, path.lstrip("/")))
        if not fpath.startswith(ROOT) or not os.path.isfile(fpath):
            return self._send(404, {"erreur": "Fichier introuvable"})
        with open(fpath, "rb") as fh:
            body = fh.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        m = re.match(r"^/api/geojson/([a-z]+)/?$", urlparse(self.path).path)
        if not m or m.group(1) not in COLLECTIONS:
            return self._send(404, {"erreur": "Endpoint invalide."})
        col = m.group(1)
        payload = self._read_json()
        if payload is None:
            return self._send(400, {"erreur": "Corps de requête JSON invalide."})
        try:
            feat = create_feature(col, payload)
        except ValueError as e:
            return self._send(409, {"erreur": str(e)})
        return self._send(201, feat)

    def do_PUT(self):
        m = re.match(r"^/api/geojson/([a-z]+)/([A-Za-z0-9_.-]+)/?$", urlparse(self.path).path)
        if not m or m.group(1) not in COLLECTIONS:
            return self._send(404, {"erreur": "Endpoint invalide."})
        col, ident = m.group(1), m.group(2)
        payload = self._read_json()
        if payload is None:
            return self._send(400, {"erreur": "Corps de requête JSON invalide."})
        ok = replace_feature(col, ident, payload)
        if not ok:
            return self._send(404, {"erreur": f"Entité '{ident}' introuvable dans {col}"})
        return self._send(200, {"ok": True, "id": ident})

    def do_PATCH(self):
        m = re.match(r"^/api/geojson/([a-z]+)/([A-Za-z0-9_.-]+)/?$", urlparse(self.path).path)
        if not m or m.group(1) not in COLLECTIONS:
            return self._send(404, {"erreur": "Endpoint invalide."})
        col, ident = m.group(1), m.group(2)
        payload = self._read_json()
        if payload is None:
            return self._send(400, {"erreur": "Corps de requête JSON invalide."})
        ok = patch_feature(col, ident, payload)
        if not ok:
            return self._send(404, {"erreur": f"Entité '{ident}' introuvable dans {col}"})
        return self._send(200, {"ok": True, "id": ident})

    def do_DELETE(self):
        m = re.match(r"^/api/geojson/([a-z]+)/([A-Za-z0-9_.-]+)/?$", urlparse(self.path).path)
        if not m or m.group(1) not in COLLECTIONS:
            return self._send(404, {"erreur": "Endpoint invalide."})
        col, ident = m.group(1), m.group(2)
        ok = delete_feature(col, ident)
        if not ok:
            return self._send(404, {"erreur": f"Entité '{ident}' introuvable dans {col}"})
        return self._send(200, {"ok": True, "supprime": ident})

    # ------------------------------------------------------------------ #
    # Helpers HTTP
    # ------------------------------------------------------------------ #
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/geo+json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return None

    def log_message(self, fmt, *args):
        # Journalise uniquement les appels API (le reste serait trop bavard)
        if "/api/" in (self.path or ""):
            sys.stderr.write("[API] %s %s\n" % (self.command, self.path))


# ---------------------------------------------------------------------- #
# Persistance GeoJSON (fichiers du répertoire data/)
# ---------------------------------------------------------------------- #
def file_of(col):
    return os.path.join(DATA_DIR, col + ".geojson")


def read_fc(col):
    with open(file_of(col), "r", encoding="utf-8") as fh:
        return json.load(fh)


def write_fc(col, fc):
    tmp = file_of(col) + ".tmp"
    with LOCK:
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(fc, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        os.replace(tmp, file_of(col))


def find_feature(fc, ident):
    for feat in fc["features"]:
        props = feat.get("properties") or {}
        if props.get("id") == ident or feat.get("id") == ident:
            return feat
    return None


def feature_to_props(col, feat):
    props = dict(feat.get("properties") or {})
    geom = feat.get("geometry") or {}
    coords = geom.get("coordinates")
    if col == "secteurs":
        if coords:
            props["poly"] = [[round(p[1], 6), round(p[0], 6)] for p in coords[0][:-1]]
    elif col == "canalisations":
        if coords:
            props["a"] = [round(coords[0][1], 6), round(coords[0][0], 6)]
            props["b"] = [round(coords[1][1], 6), round(coords[1][0], 6)]
    elif coords and len(coords) == 2:
        props["coord"] = [round(coords[1], 6), round(coords[0], 6)]
    return props


def props_to_feature(col, props):
    """Convertit un objet métier applicatif en Feature GeoJSON (RFC 7946).

    Accepte indifféremment un objet brut {id, nom, coord…} ou une Feature
    complète {type:"Feature", geometry, properties} envoyée par le client."""
    if isinstance(props, dict) and props.get("type") == "Feature":
        feat = dict(props)
        feat["properties"] = dict(feat.get("properties") or {})
        return feat
    p = dict(props)
    pid = p.pop("id", None)
    geom = None
    if col == "secteurs":
        poly = p.pop("poly", []) or []
        ring = [[round(c[1], 6), round(c[0], 6)] for c in poly]
        if len(ring) >= 3:
            ring.append(list(ring[0]))  # anneau fermé
            geom = {"type": "Polygon", "coordinates": [ring]}
    elif col == "canalisations":
        a = p.pop("a", None)
        b = p.pop("b", None)
        if a and b:
            geom = {"type": "LineString",
                    "coordinates": [[round(a[1], 6), round(a[0], 6)],
                                    [round(b[1], 6), round(b[0], 6)]]}
    else:
        coord = p.pop("coord", None)
        if coord and len(coord) == 2:
            geom = {"type": "Point", "coordinates": [round(coord[1], 6), round(coord[0], 6)]}
    feat = {"type": "Feature"}
    if pid:
        feat["id"] = pid
    feat["geometry"] = geom
    feat["properties"] = p
    return feat


def _stamp(fc):
    fc["modified"] = datetime.datetime.now().isoformat(timespec="seconds")
    return fc


def create_feature(col, payload):
    # Le client peut envoyer une Feature GeoJSON complète ou un objet métier brut
    feat = props_to_feature(col, payload)
    with LOCK:
        fc = read_fc(col)
        ident = str((feat.get("properties") or {}).get("id") or "").strip()
        if not ident:
            raise ValueError("Entité sans identifiant « id ».")
        feat["id"] = ident
        if find_feature(fc, ident):
            raise ValueError(f"Une entité '{ident}' existe déjà dans {col}.")
        fc["features"].append(feat)
        _stamp(fc)
    write_fc(col, fc)
    return feat


def replace_feature(col, ident, payload):
    feat = props_to_feature(col, payload)
    feat["id"] = ident
    feat.setdefault("properties", {})["id"] = ident
    with LOCK:
        fc = read_fc(col)
        old = find_feature(fc, ident)
        if old is None:
            return False
        fc["features"][fc["features"].index(old)] = feat
        _stamp(fc)
    write_fc(col, fc)
    return True


def patch_feature(col, ident, changes):
    with LOCK:
        fc = read_fc(col)
        feat = find_feature(fc, ident)
        if feat is None:
            return False
        merged = feature_to_props(col, feat)
        merged.update(changes)
        merged["id"] = ident
        fc["features"][fc["features"].index(feat)] = props_to_feature(col, merged)
        _stamp(fc)
    write_fc(col, fc)
    return True


def delete_feature(col, ident):
    with LOCK:
        fc = read_fc(col)
        feat = find_feature(fc, ident)
        if feat is None:
            return False
        fc["features"].remove(feat)
        _stamp(fc)
    write_fc(col, fc)
    return True


def load_collection(col):
    return read_fc(col)


def sante():
    infos = {}
    for col in COLLECTIONS:
        path = file_of(col)
        try:
            fc = read_fc(col)
            infos[col] = {"fichier": f"data/{col}.geojson",
                          "entites": len(fc.get("features", [])),
                          "modifie_le": fc.get("modified")}
        except Exception as e:
            infos[col] = {"fichier": f"data/{col}.geojson", "erreur": str(e)}
    return {"statut": "ok", "repertoire": "data/", "collections": infos}


# ---------------------------------------------------------------------- #
# Génération initiale des fichiers GeoJSON depuis le jeu fictif de référence
# ---------------------------------------------------------------------- #
def bootstrap_data():
    os.makedirs(DATA_DIR, exist_ok=True)
    seed_path = os.path.join(ROOT, "scripts", "seed_geojson.py")
    need_seed = any(not os.path.exists(file_of(c)) for c in COLLECTIONS)
    if need_seed:
        import subprocess
        print("→ Création des fichiers GeoJSON dans data/ (jeu fictif initial)…")
        subprocess.run([sys.executable, seed_path], check=True, cwd=ROOT)
    else:
        print("→ Base GeoJSON « data/ » déjà présente : réutilisation.")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    bootstrap_data()
    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"""
╔══════════════════════════════════════════════════════════╗
║  Carto'Eau — ECLA Lons Agglo                             ║
║  Carte publique   : http://localhost:{port}/              ║
║  Administration   : http://localhost:{port}/admin.html    ║
║  Défauts & anom.  : http://localhost:{port}/defauts.html  ║
║  API GeoJSON      : http://localhost:{port}/api/geojson/…  ║
║  Santé de la base : http://localhost:{port}/api/sante      ║
║  Données          : répertoire ./data/*.geojson           ║
╚══════════════════════════════════════════════════════════╝
""")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt du serveur.")


if __name__ == "__main__":
    main()
