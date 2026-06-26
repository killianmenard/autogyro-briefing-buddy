#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AutogyroDash - Generateur fuel.json depuis les fiches AD-2 du SIA (rubrique 10-AVT).

Source : SIA eAIP, PDF AD-2 par aerodrome, sous Licence Ouverte / licence SIA.
URL deterministe par cycle AIRAC (identique a getCurrentAiracCycle() de l'app).

Modele 3 etats (securite : on n'affirme JAMAIS un carburant qu'on n'a pas lu) :
  - grade detecte dans le bloc 10-AVT  -> true  (confirme)  -> ecrit dans fuel.json
  - grade non liste                    -> null  (a confirmer) [JAMAIS false en auto]
  - bloc AVT = NIL                     -> 'absent' (pas ecrit -> l'app pointe la VAC)
  - PDF absent / illisible             -> 'inconnu' (pas ecrit -> l'app pointe la VAC)

=> On n'ecrit QUE les AD a carburant confirme. Tout le reste retombe sur le
   message "non renseigne - verifier la rubrique 10-AVT de la VAC" cote app.
   Le fichier manuel fuel_extra.json reste prioritaire (gere cote app au runtime).

Usage :
  python3 parse_fuel.py                    # mode live : fetch + ecrit fuel.json
  python3 parse_fuel.py --test-local DIR   # mode test : parse les PDF AD-2*.pdf d'un dossier
  python3 parse_fuel.py --list-icaos       # affiche la liste ICAO extraite d'index.html
"""

import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # racine du repo
INDEX_HTML = os.path.join(ROOT, "index.html")
FUEL_JSON = os.path.join(ROOT, "fuel.json")

MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG",
          "SEP", "OCT", "NOV", "DEC"]

USER_AGENT = "AutogyroDash-fuel-bot/1.0 (+https://app.monplandevol.fr)"
THROTTLE_S = 0.4        # ~3 min pour 450 AD : doux pour le serveur SIA
SAFETY_RATIO = 0.8      # garde-fou : refus d'ecrire si couverture < 80% du precedent


# --------------------------------------------------------------------------- #
# Cycle AIRAC + URL (replique de getCurrentAiracCycle / getVacPdfUrl de l'app)
# --------------------------------------------------------------------------- #
def current_airac():
    ref = datetime.datetime(2025, 12, 25, tzinfo=datetime.timezone.utc)
    now = datetime.datetime.now(datetime.timezone.utc)
    cycles = (now - ref).days // 28
    cur = ref + datetime.timedelta(days=cycles * 28)
    eaip = "eAIP_%02d_%s_%d" % (cur.day, MONTHS[cur.month - 1], cur.year)
    label = "AIRAC %02d/%02d" % (cur.month, cur.year % 100)
    return eaip, label, cur


def vac_pdf_url(icao, eaip):
    return ("https://www.sia.aviation-civile.gouv.fr/media/dvd/%s"
            "/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2.%s.pdf" % (eaip, icao))


def list_icaos():
    """Liste ICAO depuis AERODROMES_ALL d'index.html (reste synchro avec l'app)."""
    html = open(INDEX_HTML, encoding="utf-8").read()
    seen, out = set(), []
    for code in re.findall(r'"icao":"([A-Z0-9]{2,5})"', html):
        if code not in seen:
            seen.add(code)
            out.append(code)
    return out


# --------------------------------------------------------------------------- #
# Parsing du bloc 10-AVT
# --------------------------------------------------------------------------- #
GRADE_PATTERNS = {
    "fuel_100ll": r"100\s?LL",
    "fuel_ul91": r"\bUL\s?91\b|\b91\s?UL\b|AVGAS\s?UL\s?91",
    "fuel_sp98": r"\bSP\s?9[58]\b|MOGAS|SANS\s?PLOMB",
    "fuel_jet_a1": r"JET\s?A\s?-?\s?1|JETA1|\bF-?34\b|\bTR0\b",
}
_GRADE_LABEL = {"fuel_100ll": "100LL", "fuel_ul91": "UL91",
                "fuel_sp98": "SP98", "fuel_jet_a1": "JET A1"}

AVT_RE = re.compile(r"^\s*\u2190?\s*10\s*[-\u2013]\s*AVT\s*:?(.*)$", re.M)
NEXT_RE = re.compile(r"^\s*\u2190?\s*(1[1-9]|2\d)\s*[-\u2013]")
NIL_RE = re.compile(r"^(CARBURANT\s*/\s*FUEL\s*:?\s*)?NIL\.?$")


def pdftotext(path):
    return subprocess.run(["pdftotext", "-layout", path, "-"],
                          capture_output=True, text=True).stdout


def parse_avt(text):
    """(grades_dict|None, state) depuis le texte d'une fiche AD-2."""
    lines = text.splitlines()
    start = next((i for i, l in enumerate(lines) if AVT_RE.match(l)), None)
    if start is None:
        return None, "inconnu"
    block = [AVT_RE.match(lines[start]).group(1).strip()]
    for l in lines[start + 1:]:
        if NEXT_RE.match(l):
            break
        block.append(l.strip())
    blk = " ".join(x for x in block if x).strip()
    up = blk.upper()
    grades = {k: (True if re.search(p, up) else None)
              for k, p in GRADE_PATTERNS.items()}
    if any(grades.values()):
        return grades, "confirme"
    if NIL_RE.match(up):
        return {k: None for k in GRADE_PATTERNS}, "absent"
    return grades, "inconnu"


def grades_to_list(grades):
    return [_GRADE_LABEL[k] for k, v in grades.items() if v]


def icao_from_text(text, fallback):
    m = re.search(r"AD\s*2\s*(L[A-Z0-9]{3})", text)
    return m.group(1) if m else fallback


# --------------------------------------------------------------------------- #
# Modes
# --------------------------------------------------------------------------- #
def run_test(folder):
    pdfs = sorted(f for f in os.listdir(folder)
                  if re.search(r"AD-?2.*\.pdf$", f, re.I))
    if not pdfs:
        print("Aucun PDF 'AD-2*.pdf' dans %s" % folder)
        return
    print("Test local sur %d PDF :" % len(pdfs))
    for f in pdfs:
        txt = pdftotext(os.path.join(folder, f))
        grades, state = parse_avt(txt)
        glist = grades_to_list(grades) if grades else []
        print("  %-6s | etat=%-9s | grades=%s"
              % (icao_from_text(txt, f), state, glist))


def fetch(url, tries=3):
    for i in range(tries):
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(req, timeout=30) as r:
                return r.read()
        except HTTPError as e:
            if e.code == 404:
                return None          # fiche absente = normal pour certains AD
            time.sleep(2 * (i + 1))
        except (URLError, TimeoutError):
            time.sleep(2 * (i + 1))
    return None


def run_live():
    eaip, label, _ = current_airac()
    icaos = list_icaos()
    print("Cycle %s (%s) - %d AD a traiter" % (label, eaip, len(icaos)))
    ad = {}
    stats = {"confirme": 0, "absent": 0, "inconnu": 0, "404": 0, "erreur": 0}
    tmp = "/tmp/_avt.pdf"
    for n, icao in enumerate(icaos, 1):
        data = fetch(vac_pdf_url(icao, eaip))
        if data is None:
            stats["404"] += 1
        else:
            with open(tmp, "wb") as fh:
                fh.write(data)
            try:
                grades, state = parse_avt(pdftotext(tmp))
            except Exception:
                grades, state = None, "inconnu"
                stats["erreur"] += 1
            stats[state] = stats.get(state, 0) + 1
            if state == "confirme":
                ad[icao] = {"grades": grades_to_list(grades),
                            "horaires": "Voir carte VAC (rubrique 10-AVT)"}
        time.sleep(THROTTLE_S)
        if n % 50 == 0:
            print("  ... %d/%d (confirmes: %d)" % (n, len(icaos), len(ad)))
    print("Stats :", stats, "| AD ecrits (confirmes) :", len(ad))

    # --- Garde-fou : ne pas ecraser si effondrement de couverture ---
    prev = 0
    if os.path.exists(FUEL_JSON):
        try:
            old = json.load(open(FUEL_JSON, encoding="utf-8"))
            prev = len([v for v in old.get("ad", {}).values()
                        if v.get("grades")])
        except Exception:
            prev = 0
    print("Couverture : %d confirmes (precedent : %d)" % (len(ad), prev))
    if prev and len(ad) < SAFETY_RATIO * prev:
        sys.stderr.write(
            "GARDE-FOU : %d < %d%% de %d. fuel.json NON modifie.\n"
            % (len(ad), int(SAFETY_RATIO * 100), prev))
        sys.exit(2)

    out = {
        "type": "FUEL",
        "version": "%s (AD2)" % label,
        "source": "SIA eAIP AD-2, rubrique 10-AVT (Licence Ouverte / SIA)",
        "generated": datetime.date.today().isoformat(),
        "count": len(ad),
        "ad": dict(sorted(ad.items())),
    }
    with open(FUEL_JSON, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print("fuel.json ecrit (%d AD)." % len(ad))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--test-local", metavar="DIR")
    ap.add_argument("--list-icaos", action="store_true")
    a = ap.parse_args()
    if a.list_icaos:
        ic = list_icaos()
        print("%d ICAO extraits. Exemple :" % len(ic), ic[:8], "...", ic[-3:])
    elif a.test_local:
        run_test(a.test_local)
    else:
        run_live()
