#!/usr/bin/env python3
"""Crée le Google Form « Où chercher notre habitat collectif ? ».

Compte : perso (projet hermes-perso-505309) — JAMAIS le compte asso Ar Vuhez.
Token : ~/AppData/Local/hermes/profiles/perso/google_token.json

Usage : python create_form.py   (réutilisable : relancer ne duplique pas, il
créée un nouveau formulaire à chaque run — le formId est affiché en sortie.)
"""
import json, os, sys
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

TOKEN = os.path.join(os.path.expanduser("~"), "AppData", "Local", "hermes",
                     "profiles", "perso", "google_token.json")

# Chaque famille : une case à cocher « quels critères comptent » + champ libre.
FAMILIES = [
    ("Climat & météo", [
        "Températures moyennes / maximales / minimales",
        "Jours de canicule (et projection 2050)",
        "Jours de gel",
        "Ensoleillement (heures/an)",
        "Précipitations (cumul annuel)",
        "Vent dominant",
    ]),
    ("Eau", [
        "Distance à un cours d'eau / lac",
        "Risque sécheresse / restrictions d'eau",
        "Retrait-gonflement des argiles (fissures du bâti)",
        "Niveau / tension des nappes phréatiques",
        "Qualité de l'eau potable (nitrates, pesticides, PFAS)",
    ]),
    ("Risques naturels & industriels", [
        "Risque sismique",
        "Risque inondation",
        "Risque incendie de forêt",
        "Radon (gaz naturel)",
        "Sites pollués / anciennes industries",
        "Sites Seveso / industriels dangereux",
        "Mouvement de terrain / cavités",
    ]),
    ("Économie & immobilier", [
        "Prix du foncier (€/m² réel)",
        "Évolution des prix sur 5-10 ans",
        "Prix des loyers",
        "Taxe foncière",
        "Revenu médian des habitants",
        "Taux de chômage / dynamisme de l'emploi",
        "Démographie (croissance / déclin de la commune)",
    ]),
    ("Santé & environnement", [
        "Qualité de l'air (PM2.5, NO2…)",
        "Nuisances sonores (routes, trains, avions)",
        "Pollution lumineuse",
        "Proximité lignes haute tension / antennes",
        "Proximité de la nature (forêts, parcs, Natura 2000)",
        "Densité de végétation dans la commune",
    ]),
    ("Transport & mobilité", [
        "Distance à la gare la plus proche",
        "Fréquence des trains (nombre de liaisons/jour)",
        "Temps de trajet réel vers les grandes villes",
        "Distance à l'aéroport",
        "Distance à l'autoroute",
        "Pistes cyclables / voies vertes",
        "Couverture fibre / 4G-5G",
        "Bornes de recharge voiture électrique",
    ]),
    ("Services & vie quotidienne", [
        "Écoles / collèges / lycées",
        "Médecins / hôpitaux (désert médical)",
        "Commerces / supermarchés",
        "Culture, sport, piscines, médiathèques",
        "Vie associative",
    ]),
    ("Cadre de vie & nature", [
        "Distance à la mer",
        "Distance à la montagne / stations",
        "Altitude / pente / exposition",
        "Paysage / vue",
        "Qualité des sols pour le jardin / potager",
    ]),
    ("Sécurité & société", [
        "Délinquance / insécurité",
        "Jeunesse / vieillissement de la population",
        "Part de résidences secondaires (tourisme)",
        "Zones aidées (ZRR, France Ruralités)",
    ]),
    ("Long terme & réglementaire", [
        "Zones constructibles du PLU (U/AU vs N)",
        "Servitudes / contraintes réglementaires",
        "Projections climat 2050/2100 (canicule, sécheresse, submersion)",
        "Desserte future (nouvelles lignes, projets)",
    ]),
]


def main():
    with open(TOKEN, encoding="utf-8") as f:
        tok = json.load(f)
    creds = Credentials.from_authorized_user_info(tok)
    svc = build("forms", "v1", credentials=creds)

    # 1) Créer le formulaire (seul le titre est accepté à la création)
    form = svc.forms().create(body={
        "info": {
            "title": "Où chercher notre habitat collectif ? — Priorisez les critères",
        }
    }).execute()
    form_id = form["formId"]
    print("Formulaire créé:", form_id)

    # 2) Ajouter les questions (ordre = index d'insertion)
    reqs = []
    idx = 0  # position de l'item dans le formulaire (CreateItemRequest.location est requis)

    def add(item):
        nonlocal idx
        reqs.append({"createItem": {"item": item, "location": {"index": idx}}})
        idx += 1

    # Description du formulaire (documentTitle est read-only après création)
    reqs.append({"updateFormInfo": {
        "info": {
            "description": (
                "On prépare la carte interactive pour trouver où s'installer en "
                "groupe. Coche les critères qui comptent pour toi (autant que tu "
                "veux) et ajoute tes propres idées dans les champs « autre idée » "
                "de chaque section. ~5 min, réponses anonymes (prénom optionnel)."
            ),
        },
        "updateMask": "description",
    }})

    # Question prénom (section initiale)
    add({
        "title": "Comment te prénommes-tu ? (optionnel)",
        "questionItem": {"question": {
            "textQuestion": {"paragraph": False},
        }},
    })

    for title, criteria in FAMILIES:
        # Nouvelle section (saut de page ; le titre de l'item = titre de section)
        add({"title": title, "pageBreakItem": {}})
        # Question cases à cocher : tous les critères de la famille
        add({
            "title": f"Quels critères de « {title} » comptent pour toi ?",
            "questionItem": {"question": {
                "choiceQuestion": {
                    "type": "CHECKBOX",
                    "options": [{"value": c} for c in criteria],
                    "shuffle": False,
                },
            }},
        })
        # Champ libre « autre idée »
        add({
            "title": "💡 Une autre idée dans cette famille ?",
            "questionItem": {"question": {
                "textQuestion": {"paragraph": True},
            }},
        })

    # Section finale : questions ouvertes
    add({"title": "Pour finir", "pageBreakItem": {}})
    add({
        "title": "Un critère qu'on a oublié ? Dis-nous tout !",
        "questionItem": {"question": {"textQuestion": {"paragraph": True}}},
    })
    add({
        "title": "Une contrainte forte pour toi ? (budget max, région, taille du lieu…)",
        "questionItem": {"question": {"textQuestion": {"paragraph": True}}},
    })

    resp = svc.forms().batchUpdate(formId=form_id, body={"requests": reqs}).execute()
    n = len(resp.get("replies", []))
    print(f"{n} items ajoutés")

    edit_url = f"https://docs.google.com/forms/d/{form_id}/edit"
    view_url = f"https://docs.google.com/forms/d/e/{form_id}/viewform"
    # Le lien viewform canonique utilise l'ID long ; celui-ci redirige correctement.
    print("EDIT:", edit_url)
    print("VIEW:", view_url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
