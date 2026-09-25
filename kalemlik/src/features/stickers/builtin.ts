// Uygulamayla gelen hazır, sevimli stickerlar. Hepsi bu dosyada çizilmiş SVG'lerdir (Kalemlik'e özgü,
// lisans gerektirmez, internetsiz çalışır). Kapak desenleri de aynı çizimleri kullanır.

const O = '#4b3a3a'; // yumuşak kahverengi dış çizgi
/** Dış çizgi öznitelikleri (kalınlık tek yerde: aynı etikette iki kez stroke-width olursa SVG geçersiz olur). */
const ln = (w: number | string = 3.2) => `stroke="${O}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const BLUSH = '#ff9fb4';

/** Sevimli yüz: parlak gözler, pembe yanaklar, "w" ağız. */
function face(cx: number, cy: number, s = 1, opts: {sleepy?: boolean; open?: boolean; gap?: number; noMouth?: boolean} = {}) {
  const g = (opts.gap ?? 13) * s;
  const eyes = opts.sleepy
    ? `<path d="M${cx - g - 4 * s} ${cy} q${4 * s} ${4 * s} ${8 * s} 0 M${cx + g - 4 * s} ${cy} q${4 * s} ${4 * s} ${8 * s} 0" fill="none" ${ln(2.6 * s)}/>`
    : `<ellipse cx="${cx - g}" cy="${cy}" rx="${3.6 * s}" ry="${4.4 * s}" fill="${O}"/><ellipse cx="${cx + g}" cy="${cy}" rx="${3.6 * s}" ry="${4.4 * s}" fill="${O}"/>` +
      `<circle cx="${cx - g + 1.2 * s}" cy="${cy - 1.6 * s}" r="${1.3 * s}" fill="#fff"/><circle cx="${cx + g + 1.2 * s}" cy="${cy - 1.6 * s}" r="${1.3 * s}" fill="#fff"/>`;
  const blush = `<ellipse cx="${cx - g - 6 * s}" cy="${cy + 7 * s}" rx="${5 * s}" ry="${3 * s}" fill="${BLUSH}" opacity=".85"/><ellipse cx="${cx + g + 6 * s}" cy="${cy + 7 * s}" rx="${5 * s}" ry="${3 * s}" fill="${BLUSH}" opacity=".85"/>`;
  const mouth = opts.open
    ? `<path d="M${cx - 4 * s} ${cy + 5 * s} q${4 * s} ${7 * s} ${8 * s} 0 z" fill="#e8667d" ${ln(2.2 * s)}/>`
    : `<path d="M${cx - 5 * s} ${cy + 5 * s} q${2.5 * s} ${3.2 * s} ${5 * s} 0 q${2.5 * s} ${3.2 * s} ${5 * s} 0" fill="none" ${ln(2.3 * s)}/>`;
  return eyes + blush + (opts.noMouth ? '' : mouth);
}

const star5 = (cx: number, cy: number, r: number, inner = 0.45) =>
  Array.from({length: 10}, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * inner : r; return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`; }).join(' ');

export interface BuiltinSticker {id: string; name: string; category: string; body: string; w?: number; h?: number}

const label = (text: string, bg: string, fg = '#fff', accent = '#fff') =>
  `<rect x="6" y="34" width="108" height="52" rx="22" fill="${bg}" ${ln()}/><rect x="12" y="40" width="96" height="40" rx="17" fill="none" stroke="${accent}" stroke-opacity=".55" stroke-width="2" stroke-dasharray="4 5"/>` +
  `<text x="60" y="68" text-anchor="middle" font-family="Nunito, 'Arial Rounded MT Bold', Arial, sans-serif" font-weight="800" font-size="${text.length > 9 ? 15 : 19}" fill="${fg}">${text}</text>`;

const tape = (bg: string, deco: string) =>
  `<g transform="rotate(-8 60 60)"><path d="M4 44 l4 -3 l-3 -4 l4 -3 H112 l-3 4 l4 3 l-4 3 l4 3 l-4 3 l4 4 l-4 3 l4 3 l-4 3 l3 4 l-4 3 H8 l3 -4 l-4 -3 l4 -3 l-4 -3 l4 -3 l-4 -4 l4 -3 l-4 -3 z" fill="${bg}" opacity=".88"/>${deco}</g>`;

export const BUILTIN_STICKERS: BuiltinSticker[] = [
  // ---------------------------------------------------------------- hayvanlar
  {id: 'kedi', name: 'Kedi', category: 'Hayvanlar', body:
    `<path d="M22 50 L26 16 L50 36 Z M98 50 L94 16 L70 36 Z" fill="#ffc98b" ${ln()}/><path d="M29 40 L30 25 L42 35 Z M91 40 L90 25 L78 35 Z" fill="#ffb3c1"/>` +
    `<ellipse cx="60" cy="68" rx="44" ry="36" fill="#ffd9a8" ${ln()}/><path d="M38 38 q6 6 0 12 M60 34 v10 M82 38 q-6 6 0 12" stroke="#f0a060" stroke-width="3" fill="none" stroke-linecap="round"/>` +
    face(60, 68) + `<path d="M8 70 h16 M9 78 h15 M112 70 h-16 M111 78 h-15" stroke="${O}" stroke-width="2" stroke-linecap="round"/>`},
  {id: 'ayi', name: 'Ayıcık', category: 'Hayvanlar', body:
    `<circle cx="26" cy="32" r="15" fill="#c98f5f" ${ln()}/><circle cx="94" cy="32" r="15" fill="#c98f5f" ${ln()}/><circle cx="26" cy="32" r="7" fill="#f1c49b"/><circle cx="94" cy="32" r="7" fill="#f1c49b"/>` +
    `<ellipse cx="60" cy="66" rx="44" ry="40" fill="#d9a06c" ${ln()}/><ellipse cx="60" cy="80" rx="17" ry="12" fill="#f5d3ac"/><ellipse cx="60" cy="74" rx="5" ry="3.5" fill="${O}"/>` +
    face(60, 60, 1, {gap: 16})},
  {id: 'tavsan', name: 'Tavşan', category: 'Hayvanlar', body:
    `<ellipse cx="42" cy="28" rx="11" ry="27" fill="#fffafa" ${ln()} transform="rotate(-10 42 28)"/><ellipse cx="78" cy="28" rx="11" ry="27" fill="#fffafa" ${ln()} transform="rotate(10 78 28)"/>` +
    `<ellipse cx="42" cy="30" rx="5" ry="18" fill="#ffc2d1" transform="rotate(-10 42 30)"/><ellipse cx="78" cy="30" rx="5" ry="18" fill="#ffc2d1" transform="rotate(10 78 30)"/>` +
    `<ellipse cx="60" cy="76" rx="42" ry="34" fill="#fffafa" ${ln()}/>` + face(60, 76)},
  {id: 'panda', name: 'Panda', category: 'Hayvanlar', body:
    `<circle cx="24" cy="34" r="15" fill="#3d3a44" ${ln()}/><circle cx="96" cy="34" r="15" fill="#3d3a44" ${ln()}/>` +
    `<ellipse cx="60" cy="68" rx="46" ry="40" fill="#fff" ${ln()}/>` +
    `<ellipse cx="42" cy="64" rx="11" ry="14" fill="#3d3a44" transform="rotate(25 42 64)"/><ellipse cx="78" cy="64" rx="11" ry="14" fill="#3d3a44" transform="rotate(-25 78 64)"/>` +
    `<circle cx="43" cy="63" r="4" fill="#fff"/><circle cx="77" cy="63" r="4" fill="#fff"/><ellipse cx="60" cy="78" rx="5" ry="3.5" fill="${O}"/>` +
    `<path d="M55 84 q2.5 3 5 0 q2.5 3 5 0" fill="none" ${ln(2.3)}/><ellipse cx="30" cy="82" rx="6" ry="3.4" fill="${BLUSH}"/><ellipse cx="90" cy="82" rx="6" ry="3.4" fill="${BLUSH}"/>`},
  {id: 'kurbaga', name: 'Kurbağa', category: 'Hayvanlar', body:
    `<circle cx="36" cy="38" r="17" fill="#9ad576" ${ln()}/><circle cx="84" cy="38" r="17" fill="#9ad576" ${ln()}/>` +
    `<ellipse cx="60" cy="74" rx="48" ry="34" fill="#9ad576" ${ln()}/><circle cx="36" cy="38" r="9" fill="#fff"/><circle cx="84" cy="38" r="9" fill="#fff"/>` +
    `<circle cx="37" cy="39" r="5" fill="${O}"/><circle cx="85" cy="39" r="5" fill="${O}"/><circle cx="38.5" cy="37" r="1.6" fill="#fff"/><circle cx="86.5" cy="37" r="1.6" fill="#fff"/>` +
    `<path d="M40 76 q20 16 40 0" fill="none" ${ln()}/><ellipse cx="28" cy="76" rx="7" ry="4" fill="${BLUSH}"/><ellipse cx="92" cy="76" rx="7" ry="4" fill="${BLUSH}"/>`},
  {id: 'civciv', name: 'Civciv', category: 'Hayvanlar', body:
    `<path d="M56 20 q2 -12 8 -4 q4 -10 8 2" fill="none" ${ln()}/><circle cx="60" cy="66" r="44" fill="#ffe36e" ${ln()}/>` +
    `<path d="M18 74 q-10 -4 -6 10 q4 8 14 2" fill="#ffd23f" ${ln()}/><path d="M102 74 q10 -4 6 10 q-4 8 -14 2" fill="#ffd23f" ${ln()}/>` +
    face(60, 60, 1, {gap: 15, noMouth: true}) + `<path d="M53 69 L67 69 L60 78 Z" fill="#ff9f43" ${ln(2.4)}/>`},
  {id: 'penguen', name: 'Penguen', category: 'Hayvanlar', body:
    `<ellipse cx="60" cy="64" rx="42" ry="48" fill="#3f4d6b" ${ln()}/><ellipse cx="60" cy="72" rx="30" ry="36" fill="#fff"/><path d="M40 40 q20 -14 40 0 q-6 14 -20 14 q-14 0 -20 -14z" fill="#fff"/>` +
    face(60, 52, 0.9, {gap: 13, noMouth: true}) + `<path d="M54 60 L66 60 L60 68 Z" fill="#ffa53b" ${ln(2.2)}/>` +
    `<ellipse cx="46" cy="112" rx="10" ry="4" fill="#ffa53b"/><ellipse cx="74" cy="112" rx="10" ry="4" fill="#ffa53b"/>`},
  {id: 'kopek', name: 'Köpek', category: 'Hayvanlar', body:
    `<ellipse cx="60" cy="64" rx="40" ry="38" fill="#f6e1c3" ${ln()}/>` +
    `<ellipse cx="22" cy="60" rx="12" ry="26" fill="#b98553" ${ln()} transform="rotate(18 22 60)"/><ellipse cx="98" cy="60" rx="12" ry="26" fill="#b98553" ${ln()} transform="rotate(-18 98 60)"/>` +
    `<ellipse cx="78" cy="52" rx="12" ry="10" fill="#e5c49a"/><ellipse cx="60" cy="76" rx="6" ry="4.4" fill="${O}"/>` + face(60, 62, 1, {gap: 15}) +
    `<path d="M56 86 q4 8 8 0" fill="#ff8aa0" ${ln(2)}/>`},
  {id: 'hamster', name: 'Hamster', category: 'Hayvanlar', body:
    `<circle cx="30" cy="36" r="11" fill="#f4c27a" ${ln()}/><circle cx="90" cy="36" r="11" fill="#f4c27a" ${ln()}/>` +
    `<ellipse cx="60" cy="70" rx="48" ry="40" fill="#f4c27a" ${ln()}/><ellipse cx="60" cy="84" rx="36" ry="24" fill="#fff4e3"/>` + face(60, 66, 1, {gap: 16}) +
    `<path d="M60 22 v10" stroke="#d99b4a" stroke-width="4" stroke-linecap="round"/>`},
  {id: 'pati', name: 'Pati', category: 'Hayvanlar', body:
    `<ellipse cx="60" cy="78" rx="28" ry="24" fill="#ffb3c1" ${ln()}/><ellipse cx="30" cy="48" rx="11" ry="14" fill="#ffb3c1" ${ln()} transform="rotate(-20 30 48)"/>` +
    `<ellipse cx="50" cy="32" rx="11" ry="14" fill="#ffb3c1" ${ln()}/><ellipse cx="72" cy="32" rx="11" ry="14" fill="#ffb3c1" ${ln()}/><ellipse cx="91" cy="48" rx="11" ry="14" fill="#ffb3c1" ${ln()} transform="rotate(20 91 48)"/>`},
  // ---------------------------------------------------------------- böcekler
  {id: 'ari', name: 'Arı', category: 'Böcekler', body:
    `<ellipse cx="44" cy="30" rx="16" ry="12" fill="#dff3ff" ${ln()} transform="rotate(-25 44 30)"/><ellipse cx="76" cy="30" rx="16" ry="12" fill="#dff3ff" ${ln()} transform="rotate(25 76 30)"/>` +
    `<clipPath id="ari-g"><ellipse cx="60" cy="70" rx="44" ry="36"/></clipPath><ellipse cx="60" cy="70" rx="44" ry="36" fill="#ffd43b"/>` +
    `<g clip-path="url(#ari-g)" fill="#4b3a3a" opacity=".85"><rect x="0" y="84" width="120" height="8"/><rect x="0" y="98" width="120" height="8"/></g>` +
    `<ellipse cx="60" cy="70" rx="44" ry="36" fill="none" ${ln()}/>` + face(60, 62, 0.95, {gap: 13}) +
    `<path d="M50 38 q-6 -16 -12 -18 M70 38 q6 -16 12 -18" fill="none" ${ln(2.5)}/><circle cx="37" cy="19" r="3.5" fill="${O}"/><circle cx="83" cy="19" r="3.5" fill="${O}"/>`},
  {id: 'ugurbocegi', name: 'Uğur böceği', category: 'Böcekler', body:
    `<circle cx="60" cy="30" r="16" fill="#3d3a44" ${ln()}/><ellipse cx="60" cy="72" rx="44" ry="40" fill="#ff5a5f" ${ln()}/><path d="M60 34 V110" stroke="${O}" stroke-width="3"/>` +
    `<circle cx="38" cy="62" r="8" fill="#3d3a44"/><circle cx="82" cy="62" r="8" fill="#3d3a44"/><circle cx="42" cy="90" r="6.5" fill="#3d3a44"/><circle cx="78" cy="90" r="6.5" fill="#3d3a44"/>` +
    `<circle cx="54" cy="28" r="3" fill="#fff"/><circle cx="66" cy="28" r="3" fill="#fff"/><path d="M52 18 q-6 -10 -12 -8 M68 18 q6 -10 12 -8" fill="none" ${ln(2.5)}/>`},
  {id: 'kelebek', name: 'Kelebek', category: 'Böcekler', body:
    `<path d="M58 58 C30 10 4 30 16 58 C4 86 36 102 58 66 Z" fill="#c9a7ff" ${ln()}/><path d="M62 58 C90 10 116 30 104 58 C116 86 84 102 62 66 Z" fill="#ffb3d9" ${ln()}/>` +
    `<circle cx="32" cy="46" r="7" fill="#fff" opacity=".7"/><circle cx="88" cy="46" r="7" fill="#fff" opacity=".7"/><circle cx="34" cy="76" r="5" fill="#fff" opacity=".7"/><circle cx="86" cy="76" r="5" fill="#fff" opacity=".7"/>` +
    `<rect x="53" y="36" width="14" height="56" rx="7" fill="#6b5b7b" ${ln()}/><path d="M56 38 q-8 -16 -14 -18 M64 38 q8 -16 14 -18" fill="none" ${ln(2.5)}/>`},
  // ---------------------------------------------------------------- yiyecek
  {id: 'cilek', name: 'Çilek', category: 'Yiyecek', body:
    `<path d="M60 112 C22 96 12 58 26 42 C38 30 50 36 60 36 C70 36 82 30 94 42 C108 58 98 96 60 112 Z" fill="#ff6b7a" ${ln()}/>` +
    `<path d="M40 38 L48 22 L56 32 L60 16 L64 32 L72 22 L80 38 Q60 46 40 38 Z" fill="#7bc96f" ${ln()}/>` +
    [[34, 58], [86, 58], [44, 92], [76, 92], [30, 76], [90, 76], [60, 100]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2" ry="3" fill="#ffe08a"/>`).join('') + face(60, 66, 0.95)},
  {id: 'boba', name: 'Boba çay', category: 'Yiyecek', body:
    `<path d="M70 4 L62 34" stroke="#ff8fab" stroke-width="7" stroke-linecap="round"/><path d="M30 30 H90 L82 110 Q60 116 38 110 Z" fill="#f7d9c4" ${ln()}/>` +
    `<path d="M26 26 H94 V36 H26 Z" fill="#ffffff" ${ln()}/>` + [[44, 98], [56, 102], [68, 100], [78, 94], [50, 90], [64, 92]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#5b4038"/>`).join('') + face(60, 62, 0.95)},
  {id: 'donut', name: 'Donut', category: 'Yiyecek', body:
    `<circle cx="60" cy="62" r="46" fill="#e8b27a" ${ln()}/><path d="M18 58 C18 30 40 18 60 18 C86 18 104 34 102 58 C100 74 90 70 84 78 C74 90 64 76 56 84 C44 94 36 80 28 78 C20 76 18 68 18 58Z" fill="#ff9ec5" ${ln()}/>` +
    `<circle cx="60" cy="58" r="13" fill="#fff" ${ln()}/>` + [['#7bd3f7', 34, 40, 20], ['#ffe066', 82, 38, -30], ['#a3e635', 40, 70, 60], ['#fff', 88, 62, 10], ['#c084fc', 62, 30, -60]].map(([c, x, y, r]) => `<rect x="${x}" y="${y}" width="10" height="4" rx="2" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`).join('')},
  {id: 'kek', name: 'Cupcake', category: 'Yiyecek', body:
    `<path d="M26 64 H94 L84 112 H36 Z" fill="#8ecae6" ${ln()}/><path d="M42 64 L46 112 M58 64 V112 M74 64 L72 112" stroke="#fff" stroke-width="3" opacity=".6"/>` +
    `<path d="M20 66 C14 50 30 40 38 44 C38 26 58 22 62 34 C68 20 90 26 86 42 C100 40 106 58 98 66 Z" fill="#ffc6d9" ${ln()}/><circle cx="62" cy="20" r="9" fill="#ff4d6d" ${ln()}/>` + face(60, 86, 0.85)},
  {id: 'avokado', name: 'Avokado', category: 'Yiyecek', body:
    `<path d="M60 8 C34 8 30 40 22 64 C12 96 34 114 60 114 C86 114 108 96 98 64 C90 40 86 8 60 8 Z" fill="#6aa84f" ${ln()}/><path d="M60 18 C40 18 38 44 32 66 C24 92 42 104 60 104 C78 104 96 92 88 66 C82 44 80 18 60 18 Z" fill="#d8f0a8"/>` +
    `<circle cx="60" cy="76" r="18" fill="#a0673d" ${ln()}/>` + face(60, 48, 0.8)},
  {id: 'elma', name: 'Elma', category: 'Yiyecek', body:
    `<path d="M60 30 C40 16 12 26 14 60 C16 94 40 114 60 104 C80 114 104 94 106 60 C108 26 80 16 60 30Z" fill="#ff6b6b" ${ln()}/><path d="M60 30 q2 -14 8 -20" fill="none" ${ln()}/><path d="M66 20 q16 -12 26 0 q-12 12 -26 0z" fill="#7bc96f" ${ln()}/>` + face(60, 66)},
  // ---------------------------------------------------------------- doğa
  {id: 'papatya', name: 'Papatya', category: 'Doğa', body:
    Array.from({length: 8}, (_, i) => `<ellipse cx="60" cy="30" rx="13" ry="22" fill="#fff" ${ln()} transform="rotate(${i * 45} 60 60)"/>`).join('') + `<circle cx="60" cy="60" r="22" fill="#ffd43b" ${ln()}/>` + face(60, 58, 0.8, {gap: 9})},
  {id: 'lale', name: 'Lale', category: 'Doğa', body:
    `<path d="M60 64 V114" stroke="#5aa34b" stroke-width="5"/><path d="M60 100 q-24 -4 -30 -26 q22 2 30 26z M60 92 q22 -6 28 -24 q-22 2 -28 24z" fill="#7bc96f" ${ln()}/>` +
    `<path d="M34 24 L46 36 L60 16 L74 36 L86 24 L86 50 C86 66 74 74 60 74 C46 74 34 66 34 50 Z" fill="#ff7aa2" ${ln()}/>` + face(60, 50, 0.75, {gap: 10})},
  {id: 'bulut', name: 'Bulut', category: 'Doğa', body:
    `<path d="M30 92 C12 92 8 70 24 64 C20 44 44 36 52 48 C58 28 88 28 92 52 C110 50 116 74 102 84 C104 90 98 92 94 92 Z" fill="#fff" ${ln()}/>` + face(60, 70, 0.95)},
  {id: 'gunes', name: 'Güneş', category: 'Doğa', body:
    Array.from({length: 12}, (_, i) => `<path d="M60 4 L66 20 L54 20 Z" fill="#ffb703" transform="rotate(${i * 30} 60 60)"/>`).join('') + `<circle cx="60" cy="60" r="36" fill="#ffd43b" ${ln()}/>` + face(60, 60)},
  {id: 'ay', name: 'Uykucu ay', category: 'Doğa', body:
    `<path d="M76 10 C44 10 20 34 20 64 C20 94 44 114 72 114 C90 114 104 106 112 92 C62 100 40 50 76 10 Z" fill="#ffe8a3" ${ln()}/>` + face(52, 70, 0.9, {sleepy: true, gap: 11}) +
    `<text x="92" y="36" font-family="Nunito, Arial, sans-serif" font-weight="800" font-size="16" fill="#8b9dc3">z</text><text x="102" y="22" font-family="Nunito, Arial, sans-serif" font-weight="800" font-size="12" fill="#8b9dc3">z</text>`},
  {id: 'yildiz', name: 'Yıldız', category: 'Doğa', body:
    `<polygon points="${star5(60, 64, 54, 0.5)}" fill="#ffd43b" ${ln()}/>` + face(60, 66, 0.9)},
  {id: 'kalp', name: 'Kalp', category: 'Doğa', body:
    `<path d="M60 108 C20 80 6 58 14 38 C22 18 48 16 60 36 C72 16 98 18 106 38 C114 58 100 80 60 108 Z" fill="#ff8fab" ${ln()}/>` + face(60, 58)},
  {id: 'gokkusagi', name: 'Gökkuşağı', category: 'Doğa', body:
    [['#ff8fab', 50], ['#ffc078', 42], ['#ffe066', 34], ['#8ce99a', 26], ['#74c0fc', 18]].map(([c, r]) => `<path d="M${60 - Number(r)} 84 A${r} ${r} 0 0 1 ${60 + Number(r)} 84" fill="none" stroke="${c}" stroke-width="8"/>`).join('') +
    `<path d="M4 94 C4 80 18 76 24 82 C28 72 44 74 44 86 C52 86 52 96 46 98 H10 C6 98 4 96 4 94Z M116 94 C116 80 102 76 96 82 C92 72 76 74 76 86 C68 86 68 96 74 98 H110 C114 98 116 96 116 94Z" fill="#fff" ${ln()}/>`},
  {id: 'mantar', name: 'Mantar', category: 'Doğa', body:
    `<path d="M40 64 H80 V100 Q60 112 40 100 Z" fill="#fff4e3" ${ln()}/><path d="M10 66 C10 30 34 12 60 12 C86 12 110 30 110 66 Z" fill="#ff6b6b" ${ln()}/>` +
    `<circle cx="36" cy="40" r="8" fill="#fff"/><circle cx="72" cy="30" r="9" fill="#fff"/><circle cx="92" cy="52" r="6" fill="#fff"/><circle cx="54" cy="54" r="5" fill="#fff"/>` + face(60, 84, 0.7, {gap: 9})},
  {id: 'kaktus', name: 'Kaktüs', category: 'Doğa', body:
    `<path d="M34 86 H86 L80 116 H40 Z" fill="#e07a5f" ${ln()}/><rect x="30" y="80" width="60" height="10" rx="4" fill="#e9967a" ${ln()}/>` +
    `<path d="M44 80 V34 C44 16 76 16 76 34 V80 Z" fill="#8ccf7e" ${ln()}/><path d="M44 58 H34 C26 58 26 42 30 36 C32 34 36 34 36 40 V50 H44 M76 50 H84 V36 C84 30 90 30 92 34 C94 44 92 60 84 60 H76" fill="#8ccf7e" ${ln()}/>` +
    `<circle cx="60" cy="16" r="6" fill="#ff8fab" ${ln(2)}/>` + face(60, 48, 0.75, {gap: 9})},
  // ---------------------------------------------------------------- okul
  {id: 'kalem', name: 'Kalem', category: 'Okul', body:
    `<g transform="rotate(-30 60 60)"><rect x="10" y="44" width="72" height="32" rx="4" fill="#ffd43b" ${ln()}/><rect x="4" y="44" width="16" height="32" rx="5" fill="#ff8fab" ${ln()}/>` +
    `<path d="M82 44 L112 60 L82 76 Z" fill="#f5d3ac" ${ln()}/><path d="M104 56 L112 60 L104 64 Z" fill="${O}"/>${face(50, 58, 0.75, {gap: 9})}</g>`},
  {id: 'kitap', name: 'Kitap', category: 'Okul', body:
    `<rect x="22" y="14" width="76" height="94" rx="8" fill="#74c0fc" ${ln()}/><rect x="30" y="22" width="60" height="18" rx="5" fill="#fff" opacity=".75"/><path d="M22 96 H98" stroke="#fff" stroke-width="5"/>` +
    `<path d="M22 100 q4 10 14 10 H98" fill="#fff" ${ln()}/>` + face(60, 66, 0.95)},
  {id: 'kahve', name: 'Kahve', category: 'Okul', body:
    `<path d="M44 14 q-8 8 0 16 q8 8 0 16 M62 10 q-8 8 0 16 q8 8 0 16" fill="none" stroke="#c8b6a6" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M92 62 C112 58 112 92 88 90" fill="none" ${ln(7)}/><path d="M92 62 C108 60 108 88 88 88" fill="none" stroke="#f8f0e3" stroke-width="3"/>` +
    `<path d="M20 50 H96 V88 C96 104 84 112 70 112 H46 C32 112 20 104 20 88 Z" fill="#f8f0e3" ${ln()}/><ellipse cx="58" cy="52" rx="36" ry="6" fill="#8b5e3c"/>` + face(58, 82, 0.95)},
  {id: 'a-arti', name: 'A+', category: 'Okul', body:
    `<polygon points="${Array.from({length: 24}, (_, i) => { const a = (i * Math.PI) / 12, r = i % 2 ? 44 : 52; return `${(60 + Math.cos(a) * r).toFixed(1)},${(60 + Math.sin(a) * r).toFixed(1)}`; }).join(' ')}" fill="#ffd43b" ${ln()}/>` +
    `<circle cx="60" cy="60" r="36" fill="#fff3bf"/><text x="60" y="75" text-anchor="middle" font-family="Nunito, 'Arial Rounded MT Bold', Arial, sans-serif" font-weight="900" font-size="40" fill="#e8590c">A+</text>`},
  // ---------------------------------------------------------------- etiketler
  {id: 'harika', name: 'Harika!', category: 'Etiketler', body: label('Harika!', '#ff8fab') + `<polygon points="${star5(106, 32, 10)}" fill="#ffd43b" ${ln(2)}/>`},
  {id: 'sinav-gunu', name: 'Sınav günü', category: 'Etiketler', body: label('Sınav günü', '#845ef7')},
  {id: 'tekrar-et', name: 'Tekrar et', category: 'Etiketler', body: label('Tekrar et!', '#20c997')},
  {id: 'onemli', name: 'Önemli', category: 'Etiketler', body: label('ÖNEMLİ', '#ff6b6b')},
  {id: 'bitti', name: 'Bitti', category: 'Etiketler', body: label('Bitti ✓', '#51cf66')},
  {id: 'odaklan', name: 'Odaklan', category: 'Etiketler', body: label('Odaklan', '#339af0')},
  {id: 'yapabilirsin', name: 'Yapabilirsin', category: 'Etiketler', body: label('Yapabilirsin!', '#ffa94d')},
  {id: 'not', name: 'Not', category: 'Etiketler', body:
    `<path d="M16 14 H104 V88 L80 110 H16 Z" fill="#fff3a8" ${ln()}/><path d="M80 110 V88 H104" fill="#f5e37a" ${ln()}/><path d="M28 38 H90 M28 54 H90 M28 70 H70" stroke="#e0c95a" stroke-width="3" stroke-linecap="round"/>` +
    `<circle cx="60" cy="12" r="7" fill="#ff6b6b" ${ln(2.4)}/>`},
  // ---------------------------------------------------------------- washi bantlar
  {id: 'bant-kalp', name: 'Kalpli bant', category: 'Bantlar', body: tape('#ffc9d9', Array.from({length: 6}, (_, i) => `<path d="M${18 + i * 16} 50 c-4 -5 -10 0 -5 5 l5 5 l5 -5 c5 -5 -1 -10 -5 -5z" fill="#ff7aa2" opacity=".75"/>`).join(''))},
  {id: 'bant-nokta', name: 'Puantiyeli bant', category: 'Bantlar', body: tape('#bde0fe', Array.from({length: 14}, (_, i) => `<circle cx="${14 + i * 7}" cy="${i % 2 ? 46 : 60}" r="3" fill="#fff"/>`).join(''))},
  {id: 'bant-cizgi', name: 'Çizgili bant', category: 'Bantlar', body: tape('#c3fae8', Array.from({length: 9}, (_, i) => `<path d="M${16 + i * 11} 40 l-8 28" stroke="#63e6be" stroke-width="4"/>`).join(''))},
];

export const BUILTIN_CATEGORIES = [...new Set(BUILTIN_STICKERS.map(s => s.category))];
const byId = new Map(BUILTIN_STICKERS.map(s => [s.id, s]));
export const findBuiltin = (id: string) => byId.get(id);

/** Tam SVG belgesi (yüksek çözünürlüklü çizim için 240 px). */
export function builtinSvg(id: string) {
  const s = byId.get(id);
  if (!s) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="240" height="240">${s.body}</svg>`;
}
const urlCache = new Map<string, string>();
export function builtinUrl(id: string) {
  let u = urlCache.get(id);
  if (!u) { u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(builtinSvg(id)); urlCache.set(id, u); }
  return u;
}
