const fs = require('fs'),
  sharp = require('sharp');
const OUT = 'C:/Users/Chris/Documents/03_Projects/Lucid/assets';
const SRC = OUT + '/icon-source';
const NAVY = '#0D1017',
  CREAM = '#FFF6E8';
function art(fill, dot = true) {
  return `<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="1254" height="1254"><rect width="1254" height="1254" fill="#fff"/><circle cx="877" cy="394" r="83" fill="#000"/></mask></defs>
<path mask="url(#m)" fill="${fill}" stroke="${fill}" stroke-width="6" stroke-linejoin="round" fill-rule="evenodd" d="M 275 619 a 352 352 0 1 0 705 0 a 352 352 0 1 0 -705 0 Z M 422 569 a 256 256 0 1 0 512 0 a 256 256 0 1 0 -512 0 Z"/>
<circle cx="877" cy="394" r="54" fill="${fill}"/>`;
}
const svg = (bg, fill, scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}<g transform="translate(512 512) scale(${scale}) translate(-627 -619)">${art(fill)}</g></svg>`;
const sIcon = (0.56 * 1024) / 705,
  sFg = 330 / 393;
const files = {
  'icon.svg': svg(NAVY, CREAM, sIcon),
  'foreground.svg': svg(null, CREAM, sFg),
  'monochrome.svg': svg(null, '#FFFFFF', sFg),
};
(async () => {
  for (const [k, v] of Object.entries(files)) fs.writeFileSync(`${SRC}/${k}`, v);
  const r = (f, o) =>
    sharp(Buffer.from(files[f])).resize(1024, 1024).removeAlpha().png().toFile(`${OUT}/${o}`);
  await r('icon.svg', 'icon.png');
  await sharp(Buffer.from(files['foreground.svg']))
    .resize(1024, 1024)
    .png()
    .toFile(OUT + '/android-icon-foreground.png');
  await sharp(Buffer.from(files['monochrome.svg']))
    .resize(1024, 1024)
    .png()
    .toFile(OUT + '/android-icon-monochrome.png');
  await sharp({ create: { width: 1024, height: 1024, channels: 3, background: NAVY } })
    .png()
    .toFile(`${OUT}/android-icon-background.png`);
  await sharp(Buffer.from(files['icon.svg']))
    .resize(48, 48)
    .removeAlpha()
    .png()
    .toFile(`${OUT}/favicon.png`);
  // verify
  for (const f of [
    'icon.png',
    'android-icon-foreground.png',
    'android-icon-monochrome.png',
    'android-icon-background.png',
    'favicon.png',
  ]) {
    const { data, info } = await sharp(`${OUT}/${f}`).raw().toBuffer({ resolveWithObject: true });
    let maxR = 0,
      n = 0;
    const c = info.channels;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        const a = c == 4 ? data[(y * info.width + x) * 4 + 3] : 255;
        if (a > 8) {
          n++;
          maxR = Math.max(
            maxR,
            Math.hypot(
              ((x + 0.5) * 1024) / info.width - 512,
              ((y + 0.5) * 1024) / info.height - 512,
            ),
          );
        }
      }
    console.log(
      f,
      info.width + 'x' + info.height,
      'channels',
      c,
      'hasAlphaCh',
      info.channels == 4,
      'opaque px',
      n,
      'maxRadiusFromCenter(1024 scale)',
      maxR.toFixed(1),
      'safe 338',
    );
  }
})();
