/**
 * Original placeholder illustrations for the demonstration products.
 * They are deliberately schematic: real manufacturer photography must be
 * uploaded by authorised users (no third-party images are bundled).
 */

const W = 1200;
const H = 900;

function frame(body: string, bg = "#F6F5F2", label = "") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <ellipse cx="600" cy="760" rx="420" ry="26" fill="#000" opacity="0.06"/>
  ${body}
  ${label ? `<text x="40" y="${H - 36}" font-family="Helvetica, Arial, sans-serif" font-size="20" letter-spacing="4" fill="#9a9a94">${label}</text>` : ""}
</svg>`;
}

function room(inner: string) {
  // Simple architectural interior: floor, window grid, wall.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#E9E6E0"/>
  <rect y="600" width="${W}" height="300" fill="#B9A58C"/>
  <g stroke="#a4927a" stroke-width="2" opacity="0.5">${Array.from({ length: 14 }, (_, i) => `<line x1="${i * 100 - 200}" y1="900" x2="${i * 90 + 40}" y2="600"/>`).join("")}</g>
  <rect x="60" y="80" width="420" height="520" fill="#DDE3DF"/>
  <g stroke="#2b2b2b" stroke-width="6">${[60, 200, 340, 480].map((x) => `<line x1="${x}" y1="80" x2="${x}" y2="600"/>`).join("")}<line x1="60" y1="80" x2="480" y2="80"/><line x1="60" y1="340" x2="480" y2="340"/></g>
  <path d="M60 560 Q160 480 260 540 T480 520 L480 600 L60 600Z" fill="#9fae98" opacity="0.7"/>
  <g stroke="#7d6a55" stroke-width="5" opacity="0.6">${Array.from({ length: 18 }, (_, i) => `<line x1="${820 + i * 20}" y1="0" x2="${820 + i * 20}" y2="600"/>`).join("")}</g>
  <rect x="300" y="690" width="640" height="150" rx="6" fill="#D8D0C4" opacity="0.9"/>
  ${inner}
</svg>`;
}

// ── Le Bambole (armchair) ──────────────────────────────────
const bouclé = "#EFEBE3";
const bambole = (scale = 1, dx = 0, dy = 0, fill = bouclé) => `
<g transform="translate(${dx} ${dy}) scale(${scale})">
  <path d="M330 690 Q320 420 380 360 Q600 300 820 360 Q880 420 870 690 Q600 720 330 690Z" fill="${fill}" stroke="#d8d2c6" stroke-width="3"/>
  <path d="M300 700 Q270 520 330 430 Q400 420 430 470 Q450 600 440 720 Q360 730 300 700Z" fill="${fill}" stroke="#d3ccbf" stroke-width="3"/>
  <path d="M900 700 Q930 520 870 430 Q800 420 770 470 Q750 600 760 720 Q840 730 900 700Z" fill="${fill}" stroke="#d3ccbf" stroke-width="3"/>
  <path d="M430 560 Q600 520 770 560 L770 720 Q600 740 430 720Z" fill="#F4F1EA" stroke="#d9d3c7" stroke-width="3"/>
  <path d="M600 330 L600 520" stroke="#e0dbd0" stroke-width="2"/>
</g>`;

const bamboleSide = `
<path d="M420 700 Q400 430 470 380 Q560 350 640 380 Q760 460 790 560 Q800 650 780 705 Q600 730 420 700Z" fill="${bouclé}" stroke="#d6d0c4" stroke-width="3"/>
<path d="M520 560 Q650 540 780 580" stroke="#dad4c8" stroke-width="3" fill="none"/>`;

const texture = (color: string, line: string) => `
<rect x="150" y="100" width="900" height="650" rx="24" fill="${color}"/>
${Array.from({ length: 900 }, (_, i) => {
  const x = 170 + ((i * 97) % 860);
  const y = 120 + ((i * 53) % 610);
  return `<circle cx="${x}" cy="${y}" r="${4 + (i % 5)}" fill="none" stroke="${line}" stroke-width="2" opacity="0.55"/>`;
}).join("")}`;

// ── EM Table ───────────────────────────────────────────────
const emTable = (dx = 0, dy = 0, s = 1) => `
<g transform="translate(${dx} ${dy}) scale(${s})">
  <rect x="150" y="380" width="900" height="34" rx="3" fill="#C9A57A"/>
  <rect x="150" y="410" width="900" height="8" fill="#b18d64"/>
  <path d="M300 418 L250 740 L275 740 L330 418Z" fill="#ECE6D6"/>
  <path d="M330 418 L380 740 L355 740 L300 418Z" fill="#E2DBC9"/>
  <path d="M900 418 L850 740 L875 740 L930 418Z" fill="#ECE6D6"/>
  <path d="M930 418 L980 740 L955 740 L900 418Z" fill="#E2DBC9"/>
  <rect x="320" y="470" width="580" height="10" rx="5" fill="#E6DFCE"/>
</g>`;

const emSide = `
<rect x="380" y="380" width="440" height="34" rx="3" fill="#C9A57A"/>
<path d="M590 418 L480 740 L510 740 L610 418Z" fill="#ECE6D6"/>
<path d="M610 418 L720 740 L690 740 L590 418Z" fill="#E2DBC9"/>`;

const wood = `
<rect x="150" y="100" width="900" height="650" rx="24" fill="#C9A57A"/>
${Array.from({ length: 26 }, (_, i) => `<path d="M150 ${120 + i * 25} C 400 ${100 + i * 25}, 700 ${150 + i * 25}, 1050 ${115 + i * 25}" stroke="#b38f66" stroke-width="3" fill="none" opacity="0.6"/>`).join("")}`;

// ── Artemone (secretary cabinet) ───────────────────────────
const artemone = (c = "#4A4A4A", dx = 0, dy = 0, s = 1) => `
<g transform="translate(${dx} ${dy}) scale(${s})">
  <rect x="380" y="110" width="440" height="500" fill="${c}"/>
  <rect x="396" y="126" width="408" height="250" fill="none" stroke="#2c2c2c" stroke-width="4"/>
  <rect x="396" y="388" width="200" height="60" fill="none" stroke="#2c2c2c" stroke-width="4"/>
  <rect x="604" y="388" width="200" height="60" fill="none" stroke="#2c2c2c" stroke-width="4"/>
  <rect x="396" y="458" width="200" height="140" fill="none" stroke="#2c2c2c" stroke-width="4"/>
  <rect x="604" y="458" width="200" height="140" fill="none" stroke="#2c2c2c" stroke-width="4"/>
  ${[[585, 134], [482, 398], [690, 398], [482, 468], [690, 468]].map(([x, y]) => `<rect x="${x}" y="${y}" width="30" height="14" fill="#7a7a7a"/>`).join("")}
  <rect x="384" y="610" width="432" height="8" fill="#333"/>
  <rect x="392" y="618" width="6" height="140" fill="#3a3a3a"/>
  <rect x="802" y="618" width="6" height="140" fill="#3a3a3a"/>
</g>`;

const artemoneSide = `
<rect x="520" y="110" width="160" height="500" fill="#444"/>
<rect x="524" y="610" width="152" height="8" fill="#333"/>
<rect x="528" y="618" width="6" height="140" fill="#3a3a3a"/>
<rect x="666" y="618" width="6" height="140" fill="#3a3a3a"/>`;

const artemoneOpen = `
${artemone("#4A4A4A")}
<path d="M396 376 L360 470 L840 470 L804 376Z" fill="#5a5148"/>
<rect x="420" y="160" width="360" height="200" fill="#6b5e50"/>
${[0, 1, 2, 3].map((i) => `<rect x="${440 + i * 85}" y="190" width="70" height="150" fill="#5b4f43"/>`).join("")}`;

// ── Lithos (low table) ─────────────────────────────────────
const lithos = (dx = 0, dy = 0, s = 1) => `
<g transform="translate(${dx} ${dy}) scale(${s})">
  <ellipse cx="600" cy="470" rx="330" ry="70" fill="#CFC8BE"/>
  <ellipse cx="600" cy="462" rx="330" ry="70" fill="#E3DDD3"/>
  <path d="M520 520 L500 720 L700 720 L680 520Z" fill="#8C8279"/>
  <ellipse cx="600" cy="720" rx="100" ry="16" fill="#6f665d"/>
  <g opacity="0.25" stroke="#9c958c" stroke-width="2" fill="none">
    <path d="M330 450 C 420 430 520 500 640 460 S 820 430 900 470"/>
    <path d="M360 480 C 470 470 560 520 700 480"/>
  </g>
</g>`;

const marble = `
<rect x="150" y="100" width="900" height="650" rx="24" fill="#E7E2D9"/>
<g stroke="#b9b1a5" stroke-width="3" fill="none" opacity="0.7">
  <path d="M150 300 C 350 260 450 420 650 360 S 950 300 1050 380"/>
  <path d="M150 520 C 300 480 520 620 760 540 S 980 500 1050 560"/>
  <path d="M420 100 C 460 260 380 420 520 750"/>
</g>`;

export const DEMO_ART: Record<string, Record<string, string>> = {
  "le-bambole": {
    FRONTALE: frame(bambole()),
    LATERALE: frame(bamboleSide),
    DETTAGLIO: frame(texture("#EFEBE3", "#d4cdbf")),
    AMBIENTE: room(bambole(0.62, 430, 330)),
  },
  "em-table": {
    FRONTALE: frame(emTable(), "#F8F8F6"),
    LATERALE: frame(emSide, "#F8F8F6"),
    DETTAGLIO: frame(wood),
    AMBIENTE: room(emTable(330, 300, 0.62)),
  },
  artemone: {
    FRONTALE: frame(artemone(), "#FBFBFA"),
    LATERALE: frame(artemoneSide, "#FBFBFA"),
    DETTAGLIO: frame(artemoneOpen, "#FBFBFA"),
    AMBIENTE: room(artemone("#4A4A4A", 470, 200, 0.62)),
  },
  lithos: {
    FRONTALE: frame(lithos()),
    LATERALE: frame(lithos(0, 0, 1).replace('rx="330" ry="70"', 'rx="330" ry="18"')),
    DETTAGLIO: frame(marble),
    AMBIENTE: room(lithos(300, 300, 0.55)),
  },
};

export const HERO_ART = room(`${bambole(0.5, 180, 360)}${lithos(330, 360, 0.42)}${bambole(0.5, 620, 360)}`);
