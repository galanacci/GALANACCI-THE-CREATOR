# GALANACCI THE CREATOR

GALANACCI THE CREATOR is a desktop-style home for projects, experiments,
brands, and preserved work.

The live desktop currently contains:

- `PoG.EXE` - opens the GALANACCI entry point at
   `https://pioneersofgreatness.com/?entry=galanacci`
- `APPS` - opens the experiments folder
- `SS` - opens preserved GALANACCI work

## Structure

```text
/
|- index.html
|- style.css
|- styles/
|  `- app-folder-list.css
|- assets/
|  `- icons/
|- js/
|  |- apps.js
|  `- desktop.js
|- experiments/
|- SS/
|- CNAME
`- README.md
```

## Local preview

Open `index.html` in a browser for a simple local preview. The root page is also
the GitHub Pages entry point. Because the site uses JavaScript modules, a local
HTTP server is recommended when testing module or asset loading.

## Adding an application

Edit `js/apps.js` and add an entry to `APPS`:

```js
{
   id: "example-exe",
   label: "EXAMPLE.EXE",
   icon: new URL("../assets/icons/example.svg", import.meta.url).href,
   url: "./path/to/index.html",
   enabled: true
}
```

Folder entries use `type: "folder"` and a `folderTarget` value. The desktop
handles positioning, dragging, selection, keyboard activation, and launching.

## Preserved work

Older projects belong under `SS/`, with one self-contained folder per project.
See [SS/README.md](SS/README.md) for the archive convention.

## Deployment

The site is deployed from `main` with GitHub Pages. `CNAME` contains the active
custom-domain binding. Keep the repository root as the Pages source so
`index.html` remains the entry point.

### Syncing local changes

Double-click `SYNC-TO-MAIN.bat` from the repository root. It will:

1. Show every local change and ask for confirmation.
2. Create a commit using the message you enter.
3. Fetch and rebase onto the latest `origin/main` without force-pushing.
4. Push the updated `main` branch.
5. Wait for GitHub's automatic post-push commit and sync it back locally.
6. Confirm that the local and GitHub versions of `main` are identical.

If a conflict or unexpected divergence is detected, the script stops without
overwriting either version.
