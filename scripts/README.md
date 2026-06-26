# Pipeline avitaillement — `fuel.json` auto-généré depuis les cartes VAC (SIA)

Régénère automatiquement `fuel.json` (carburants par aérodrome) à partir des
fiches **AD-2** du SIA, rubrique **10-AVT**, une fois par semaine, sans aucune
intervention. Le runtime de l'app n'est pas touché : la PWA lit `fuel.json`
comme avant.

## Fichiers

| Fichier | Rôle |
|---|---|
| `scripts/parse_fuel.py` | Télécharge les PDF AD-2, parse le bloc 10-AVT, écrit `fuel.json`. |
| `.github/workflows/fuel-update.yml` | GitHub Action : cron hebdo + bouton manuel. |

À committer **à la racine du repo**, en conservant l'arborescence
(`scripts/…` et `.github/workflows/…`).

## Activation (une seule fois)

1. Committer les deux fichiers ci-dessus.
2. Repo GitHub → onglet **Actions** → si demandé, cliquer **« I understand my workflows, enable them »**.
3. Sélectionner **« MAJ avitaillement (fuel.json) »** → bouton **« Run workflow »**
   pour un premier lancement immédiat (le cron prendra le relais ensuite).
4. Lire les logs : ils affichent les stats (`confirme / absent / inconnu / 404`)
   et le nombre d'AD écrits. C'est ce premier run qui mesure la **couverture réelle**
   et confirme que le SIA répond bien aux requêtes du runner.

## Modèle 3 états (sécurité avant tout)

On n'affirme **jamais** un carburant qu'on n'a pas lu noir sur blanc :

- grade **détecté** dans le 10-AVT → `true` (confirmé) → écrit dans `fuel.json` ;
- grade **non listé** → `null` (à confirmer) — **jamais** `false` en automatique ;
- bloc AVT = **NIL** ou **PDF absent/illisible** → l'AD n'est **pas écrit** →
  l'app affiche « non renseigné — vérifier la rubrique 10-AVT de la VAC ».

Conséquence : seuls les AD à **carburant confirmé** entrent dans `fuel.json`.
Le pire cas reste « à vérifier sur la VAC », jamais un faux oui/non.

Le fichier manuel **`fuel_extra.json` reste prioritaire** (fusionné côté app au
runtime) : tes saisies vérifiées écrasent toujours l'auto-généré.

## Garde-fou

Si la couverture (nb d'AD confirmés) tombe **sous 80 %** du `fuel.json` précédent
— typiquement si le SIA change la mise en page des fiches, ou bloque le runner —
le script **échoue** (exit 2) : `fuel.json` n'est **pas** modifié, et une **issue**
est ouverte automatiquement. Aucune donnée dégradée n'est livrée silencieusement.

## ⚠️ À faire pour que les MAJ atteignent les utilisateurs (lot app séparé)

Le pipeline commit `fuel.json`, mais le **Service Worker** doit servir les `.json`
en **network-first** (ou *stale-while-revalidate*), sinon les utilisateurs gardent
l'ancien `fuel.json` en cache jusqu'au prochain bump de version. C'est un petit lot
applicatif dédié (sw.js) — voir la note de session. Sans ça, le pipeline tourne
mais ses commits ne se voient qu'après un changement de version de l'app.

## Maintenance

Aucune. Le cycle AIRAC est calculé automatiquement (même algorithme que les liens
VAC de l'app). En cas d'échec, l'issue ouverte par l'Action sert d'alerte.

## Source & licence

SIA eAIP, fiches AD-2 (Atlas-VAC). Données sous Licence Ouverte / licence SIA :
extraction, transformation et usage autorisés, avec attribution **SIA + date du
cycle AIRAC** et sans dénaturation. La responsabilité de la sécurité du vol
incombe à l'utilisateur final (cohérent avec le positionnement « planification
sol » de l'app).
