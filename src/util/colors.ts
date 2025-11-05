// src/util/colors.ts
// Kleur utilities voor LED-noten / toolbar swatches.
//
// paletteMode:
//   0 = Vivid (felle kleuren)
//   1 = Pastel (zachter)
//   2 = White-ish / neutral (incl. wit, warmwit, koelwit tinten)
//
// Elke palette heeft 12 entries (index 0..11).
// colorFromHueIndex(h, paletteMode) geeft altijd een geldige HEX string terug.

export const PALETTES: string[][] = [
  // palette 0: Vivid
  [
    '#ff0000', // 0 rood
    '#ff7a00', // 1 oranje
    '#ffbf00', // 2 amber/gelig
    '#ffee00', // 3 geel fel
    '#8cff00', // 4 limoengroen
    '#00ff00', // 5 groen
    '#00ffd5', // 6 cyaan
    '#009dff', // 7 blauw
    '#0040ff', // 8 diep blauw
    '#7a00ff', // 9 paars
    '#ff00ff', //10 magenta
    '#ffffff'  //11 puur wit als snelle pick
  ],

  // palette 1: Pastel / soft
  [
    '#ff8a8a', // 0 pastel rood
    '#ffb37a', // 1 pastel oranje
    '#ffd27a', // 2 pastel amber
    '#fff48a', // 3 pastel geel
    '#d9ff8a', // 4 pastel limoen
    '#aaff9c', // 5 pastel groen
    '#aaffea', // 6 pastel aqua
    '#a8d4ff', // 7 pastel lichtblauw
    '#9ca4ff', // 8 pastel indigo
    '#c6a8ff', // 9 pastel paars
    '#ffa8ff', //10 pastel magenta
    '#ffffff'  //11 wit
  ],

  // palette 2: White-ish / neutral tones
  [
    '#ffffff', // 0 wit
    '#f8f4e8', // 1 warm white / halogeenachtig
    '#eef7ff', // 2 koel wit / lichtblauw
    '#ffdede', // 3 soft roze wit
    '#ffeccc', // 4 zacht warm geelwit
    '#e8ffe0', // 5 zacht groenwit
    '#e6fffa', // 6 aqua-ish wit
    '#e6f0ff', // 7 koel pastel blauwwit
    '#ece6ff', // 8 pastel lila wit
    '#fbe6ff', // 9 pastel roze/lila wit
    '#cccccc', //10 grijs 75%
    '#888888'  //11 grijs 50%
  ]
]

// safety clamp helper
function clampIndex(idx: number) {
  if (!Number.isFinite(idx)) return 0
  if (idx < 0) return 0
  if (idx > 11) return 11
  return Math.floor(idx)
}

function clampPalette(p: number) {
  if (p !== 0 && p !== 1 && p !== 2) return 0
  return p
}

/**
 * colorFromHueIndex(hueIndex, paletteMode)
 * - geeft de actuele kleur die we moeten tonen/aanbieden in de UI
 * - returnt een HEX string zoals "#rrggbb"
 *
 * hueIndex: 0..11 (als iets anders binnenkomt, clampen we)
 * paletteMode: 0/1/2 (andere waarden -> 0)
 */
export function colorFromHueIndex(hueIndex: number, paletteMode: number): string {
  const p = clampPalette(paletteMode)
  const i = clampIndex(hueIndex)
  return PALETTES[p][i]
}
