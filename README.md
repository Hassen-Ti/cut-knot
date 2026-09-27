# Cut Knot

> **Status:** early prototype — unfinished. The shell works; real import, living joins, provenance, and acting AI are still ahead.

Day to day, people live in Excel, Word, and Miro — not in ten more apps.

**Cut. Knot. Done.** — 10% Excel + 10% board.

Cut Knot is that thin slice: **Source → Board** (sources, Golden, KPI cards) plus full-screen **Forge**, so you can cut to what matters and knot it into a draft.

## What’s in this repo today

| Area | State |
|------|--------|
| **Source** — Nouveau / Load | Mock drafts |
| **Board** — sources (chip ↔ preview), Golden, KPI cards, notes, arrows, zoom | UI prototype |
| **Forge** — filter, sort, formulas, selection | UI prototype |
| Real CSV import, live Golden, provenance graph, acting AI chat | **Not built yet** |

Stack: React 19 + TypeScript + Vite 8. Front-only for now (no backend).

## License

Copyright 2026 Hassen-Ti  
Licensed under the [Apache License, Version 2.0](LICENSE).

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```
