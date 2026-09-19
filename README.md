# GALANACCI THE CREATOR — Desktop

Recommended new GitHub repository name:

`GALANACCI-THE-CREATOR`

This is a clean repository package for the personal GALANACCI THE CREATOR landing page.

It is **not connected to BY-GALANACCI** and contains **no CNAME / old domain binding**.

## Concept

GALANACCI THE CREATOR is the root desktop / operating environment.

Projects, brands, archives and experiments can live as applications on this desktop.

Current application:

- `PoG.EXE` → `https://pioneersofgreatness.com/?launch=pog`

Future examples:

- `XY+T.EXE`
- `GTHEFIGHTER`
- `ARCHIVE`
- `WORK`
- `NOTES.TXT`

## Structure

```text
/
├─ index.html
├─ style.css
├─ README.md
├─ .gitignore
├─ .nojekyll
├─ assets/
│  └─ icons/
│     └─ PoG.EXE.svg
└─ js/
   ├─ apps.js
   └─ desktop.js
```

## Adding applications

Edit `js/apps.js`.

Each app only needs:

- `id`
- `label`
- `icon`
- `url`
- `enabled`

The desktop system automatically provides:

- random initial grid position
- drag / reposition
- 16px grid snapping
- saved positions in localStorage
- desktop double-click launch
- mobile tap launch
- keyboard Enter / Space launch
- selection state
- launch transition

## PoG integration still required

For the intended journey:

`GALANACCI DESKTOP → PoG.EXE → PoG LOADING SEQUENCE → PoG MAIN MENU`

the PoG site needs one small change:

When the URL contains:

`?launch=pog`

PoG should bypass its own desktop launcher and immediately run the existing PoG boot/loading sequence.

## GitHub Pages

After creating the new repository:

1. Upload these files to the root.
2. Commit to `main`.
3. In GitHub: Settings → Pages.
4. Deploy from `main` / root.
5. Add a custom domain later only when the new domain is decided.

There is deliberately no `CNAME` file in this starter repo.
