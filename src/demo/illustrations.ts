// Illustrazioni neutre per la demo: il frame dell'artifact non può caricare foto esterne.
// Toni presi dalla palette dell'app (#fafaf8, #f1f1ee, #e8e8e4, #171717).
const W = 1200, H = 900;
const wall = ['#ecebe6', '#e6e3dc', '#efede8'];
const floor = ['#d9d5cc', '#d2cdc2', '#ddd9d1'];

function scene(category: string, variant: number): string {
  const w = wall[variant % 3], f = floor[variant % 3];
  const base = `<rect width="${W}" height="${H}" fill="${w}"/><rect y="640" width="${W}" height="260" fill="${f}"/>`;
  const shadow = (x: number, wd: number) => `<ellipse cx="${x}" cy="652" rx="${wd}" ry="16" fill="#00000014"/>`;
  let obj = '';
  switch (category) {
    case 'Sedute': // divano basso a cuscini morbidi
      obj = shadow(600, 380) + `<rect x="230" y="470" width="740" height="180" rx="70" fill="#cdb79c"/>` +
        [0, 1, 2].map(i => `<rect x="${250 + i * 236}" y="380" width="228" height="140" rx="62" fill="#d8c4aa"/>`).join('') +
        `<rect x="${variant ? 830 : 120}" y="210" width="10" height="440" fill="#2b2a27"/><ellipse cx="${variant ? 835 : 125}" cy="200" rx="70" ry="34" fill="#f7f4ee"/>`;
      break;
    case 'Tavoli': // tavolo da pranzo con piano sottile
      obj = shadow(600, 420) + `<rect x="190" y="430" width="820" height="22" rx="4" fill="#8a6a4c"/>` +
        `<rect x="250" y="452" width="18" height="198" fill="#2b2a27"/><rect x="932" y="452" width="18" height="198" fill="#2b2a27"/>` +
        `<ellipse cx="600" cy="414" rx="70" ry="16" fill="#f7f4ee"/><rect x="590" y="360" width="20" height="56" rx="8" fill="#b9b3a6"/>`;
      break;
    case 'Contenitori': // madia con ante a doghe
      obj = shadow(600, 360) + `<rect x="260" y="300" width="680" height="330" rx="6" fill="#7b5c41"/>` +
        Array.from({ length: 14 }, (_, i) => `<rect x="${275 + i * 47}" y="316" width="36" height="298" fill="#8d6b4d"/>`).join('') +
        `<rect x="290" y="630" width="12" height="22" fill="#2b2a27"/><rect x="898" y="630" width="12" height="22" fill="#2b2a27"/>`;
      break;
    default: // tavolino in pietra
      obj = shadow(600, 300) + `<ellipse cx="600" cy="520" rx="300" ry="64" fill="#bfb8ab"/><rect x="300" y="520" width="600" height="40" fill="#bfb8ab"/>` +
        `<ellipse cx="600" cy="520" rx="300" ry="64" fill="#cdc7bb"/><rect x="520" y="560" width="160" height="90" fill="#a9a294"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${base}${obj}</svg>`;
}

export function illustration(category: string, variant: number): Uint8Array {
  return new TextEncoder().encode(scene(category, variant));
}
