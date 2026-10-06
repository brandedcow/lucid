# Icon source

Master vectors (1024 x 1024 viewBox):

- `icon.svg`: full-bleed navy (#0D1017, the theme `background`) with the cream (#FFF6E8) crescent and dot. Rendered to `assets/icon.png` (no alpha) and `assets/favicon.png` (48x48).
- `foreground.svg`: artwork only, scaled to sit inside the Android adaptive safe zone (circle of diameter 66%). Rendered to `assets/android-icon-foreground.png`.
- `monochrome.svg`: same in white, for Android 13 themed icons. Rendered to `assets/android-icon-monochrome.png`.

`assets/android-icon-background.png` is a solid #0D1017 square.

The crescent is a ring (outer circle minus an offset inner circle) with a circular gap cut near the upper right; the dot sits in the gap.

Regenerate: `generate.cjs` was run one-off outside the project with `sharp` installed in a temp folder (`npm install sharp`, then `node generate.cjs`); the project does not depend on sharp. Its OUT path is absolute, so edit it before reuse.
