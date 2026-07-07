# ⚔ Grind Quest

An idle/incremental fantasy RPG about the purest part of the MMO: the grind.

Pure HTML5 canvas + vanilla JavaScript. **No build step, no dependencies, no external
assets** — every visual is drawn procedurally and every sound is synthesized in WebAudio.

## Play

Open `index.html` in a browser, or serve the folder with any static file server:

```
python -m http.server 8080
```

## Features (v0.7 · The Beyond)

- 17 hunting zones (levels 1–100) across two regions, all open from level 1 — most will kill you
- 14 zone bosses with enrage DPS checks, permanent conquest bonuses, and a true final boss
- Gear chase: 6 rarities + 17 named uniques + 5 three-piece set bonuses, enhancing, tempering
- Active combat layer: 3 class abilities + an ultimate at level 40 (hotkeys 1–4)
- Talents, rotating quests, world events, roaming anomaly dungeons, bestiary, achievements
- The Proving Grounds (timed kill trials + boss rush) and the infinite Depths
- Ascension prestige with a 12-upgrade permanent shop, plus Griselda's gold shop
- Offline progress (8–16h), autosave, save export/import

## Deploy on Render

This is a static site. Either:

1. **Blueprint**: point Render at this repo — `render.yaml` configures everything, or
2. **Manual**: New → Static Site → connect this repo → Build Command: *(leave empty)* →
   Publish Directory: `.`

Save data lives in the player's browser (localStorage).
