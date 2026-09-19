# Experiments

Place future experimental apps in this folder.

## Entry points

- Live landing desktop: the repository root `index.html`.
- Folder navigation: open `EXPERIMENTS` from the landing desktop.
- Direct XY+T app testing: `experiments/2(XY-T)/index.html`.

There is no separate experiments launcher page. The landing desktop owns the
folder window so its app behavior stays consistent with the main desktop.

Each experiment can live in its own subfolder, for example:

```text
experiments/
  my-app/
    index.html
    style.css
    app.js
```

## Shared desktop palette

Future experiments should use the landing desktop palette:

- Background: `#000000`
- Foreground and accent: `#ead1b2`
- Faint grid or divider lines: `rgba(234, 209, 178, .08)`
- Muted text: `rgba(234, 209, 178, .62)`

Keep these values as CSS custom properties so each experiment remains consistent:

```css
:root {
  --bg: #000;
  --fg: #ead1b2;
  --accent: #ead1b2;
  --line: rgba(234, 209, 178, .22);
}
```
