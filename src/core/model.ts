// src/core/model.ts

// Een enkele noot op een lane
export type Note = {
  lane: number     // 0-based lane index
  t0: number       // starttijd in seconden
  t1: number       // eindtijd in seconden
  velocity: number // 1..127 = brightness (LED) / pomp intensiteit

  // Alleen relevant voor LED-notes:
  hueIndex?: number           // hoofd-kleurindex
  effectType?: number         // 0=Static,1=Strobe,2=Fade,3=Chase,4=Rainbow
  // Chase extra kleuren (Hue2/Hue3/Hue4):
  extraHues?: number[]        // [h2,h3,h4] optioneel
  // Effect parameters:
  strobeSpeed?: number        // CC11 meaning for Strobe (0..127)
  fadeRaw11?: number          // packed fade bits for Fade (0..127)
  chaseSpeed?: number         // CC11 meaning for Chase (0..127)
  rainbowSpeed?: number       // CC11 meaning for Rainbow (0..127)
}

// Marker in de timeline
export type Marker = {
  t: number        // positie in seconden
  label: string    // vrije tekst
  color?: string   // bijv. '#ff00ff'
}

// Time signature change
export type TimeSigChange = {
  t: number        // sec
  num: number      // teller (bv 4 in 4/4)
  den: number      // noemer (bv 4 in 4/4)
}

// Tempo change
export type TempoChange = {
  t: number        // sec
  bpm: number
}

// Hoofd-projectstructuur
export type Project = {
  pumpNotes: Note[]
  ledNotes: Note[]

  markers: Marker[]

  bpm: number                  // basis BPM
  timeSig: [number, number]    // basis maatsoort [num,den]
  tempos: TempoChange[]        // latere bpm changes
  timeSigs: TimeSigChange[]    // latere ts changes

  paletteMode: 0|1|2           // visuele preset naamgeving voor kleurenpalet UI; affects colorFromHueIndex display only

  midiOffsetMs: number
  applyVisualOffset: boolean

  showPumps: boolean
  showLED: boolean

  perfMeter: boolean
  snapWhileDrag: boolean

  zoomX: number
  zoomY: number
  scrollX: number

  // NIEUW: playhead snap toggle in toolbar
  playheadSnap?: boolean
}

// Een lege template voor een nieuw project
export function emptyProject(): Project {
  return {
    pumpNotes: [],
    ledNotes: [],
    markers: [],

    bpm: 120,
    timeSig: [4,4],
    tempos: [],
    timeSigs: [],

    paletteMode: 0,

    midiOffsetMs: 0,
    applyVisualOffset: false,

    showPumps: true,
    showLED: true,

    perfMeter: false,
    snapWhileDrag: true,

    zoomX: 160,
    zoomY: 26,
    scrollX: 0,

    playheadSnap: false,
  }
}

// Migreer oudere opgeslagen projecten naar de huidige structuur
export function migrateProject(src: any): Project {
  const base = emptyProject()
  return {
    ...base,
    ...src,
    pumpNotes: Array.isArray(src.pumpNotes) ? src.pumpNotes : [],
    ledNotes: Array.isArray(src.ledNotes) ? src.ledNotes : [],
    markers: Array.isArray(src.markers) ? src.markers : [],
    tempos: Array.isArray(src.tempos) ? src.tempos : [],
    timeSigs: Array.isArray(src.timeSigs) ? src.timeSigs : [],
    bpm: typeof src.bpm === 'number' ? src.bpm : base.bpm,
    timeSig: Array.isArray(src.timeSig) ? src.timeSig : base.timeSig,
    paletteMode: src.paletteMode ?? base.paletteMode,
    midiOffsetMs: src.midiOffsetMs ?? base.midiOffsetMs,
    applyVisualOffset: !!src.applyVisualOffset,
    showPumps: src.showPumps ?? base.showPumps,
    showLED: src.showLED ?? base.showLED,
    perfMeter: !!src.perfMeter,
    snapWhileDrag: src.snapWhileDrag ?? base.snapWhileDrag,
    zoomX: src.zoomX ?? base.zoomX,
    zoomY: src.zoomY ?? base.zoomY,
    scrollX: src.scrollX ?? base.scrollX,
    playheadSnap: src.playheadSnap ?? base.playheadSnap,
  }
}
