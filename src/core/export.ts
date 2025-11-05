// src/core/export.ts
// Export v1.0 — MIDI + JSON manifest volgens afgesproken mapping.
//
// Definitieve mapping:
// - Pompen    : MIDI kanaal 0, pitches 60..69 (Pump 1..10).
//               velocity = intensiteit.
// - LED-ringen: MIDI kanalen 1..10 (ring 1..10), pitch 60 (C4).
//               velocity = brightness.
// - Voor elke LED NoteOn sturen we eerst per-kanaal CC’s:
//     CC1  = Hue1 (0..127, uit hueIndex tabel)
//     CC2  = Saturation (hier altijd 127, want jij wil pure kleur, geen slider),
//     CC10 = EffectType (0 Static / 1 Strobe / 2 Fade / 3 Chase / 4 Rainbow)
//   (CC11/12/13/14 zijn gereserveerd voor speed/fade/chase-kleuren, komen later.)
// - Init snapshot: op tick 0 een default CC1/2/10 voor alle gebruikte LED-kanalen.
// - PPQN = 480.
//
// We bouwen één track met tempo/timeSig meta-events, dan alle CC/Note events.
// We leveren terug: { midi: Uint8Array, manifest: Blob }

import type { Project } from './model'

const PPQN = 480
const PITCH_LED = 60        // C4 voor LED
const CH_PUMPS = 0          // pompen altijd kanaal 0
const PUMP_BASE_PITCH = 60  // Pump1..10 -> MIDI note 60..69

type MidiBuilder = { data: number[]; push: (...bytes: number[]) => void }
function createBuilder(): MidiBuilder {
  const data: number[] = []
  return { data, push: (...b: number[]) => { data.push(...b) } }
}
function u16(n: number) { return [(n >> 8) & 0xff, n & 0xff] }
function u32(n: number) { return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff] }
function vlq(n: number) {
  let buffer = n & 0x7f
  const out: number[] = []
  while ((n >>= 7)) { buffer <<= 8; buffer |= ((n & 0x7f) | 0x80) }
  while (true) { out.push(buffer & 0xff); if (buffer & 0x80) buffer >>= 8; else break }
  return out
}

function secPerBeat(bpm: number) { return 60 / Math.max(1, bpm) }
function metaTempo(ms: MidiBuilder, bpm: number) {
  const usPerQN = Math.round(1e6 * secPerBeat(bpm))
  ms.push(0x00, 0xff, 0x51, 0x03,
    (usPerQN>>16)&0xff, (usPerQN>>8)&0xff, usPerQN&0xff)
}
function metaTimeSig(ms: MidiBuilder, num: number, den: number) {
  const exp = Math.round(Math.log2(den || 4))
  ms.push(0x00, 0xff, 0x58, 0x04, num & 0xff, exp & 0xff, 24, 8)
}

function buildTempoMap(bpm0: number, tempos: { t: number; bpm: number }[]) {
  const arr = [...tempos].sort((a,b)=>a.t-b.t)
  const out: { t0:number; bpm:number; tick0:number }[] = []
  let tick0 = 0, lastT = 0, lastBpm = bpm0
  for (const seg of arr) {
    if (seg.t > lastT) {
      const spb = secPerBeat(lastBpm)
      const dt = seg.t - lastT
      tick0 += (dt / spb) * PPQN
      out.push({ t0: seg.t, bpm: seg.bpm, tick0 })
      lastT = seg.t
      lastBpm = seg.bpm
    } else {
      lastBpm = seg.bpm
      out.push({ t0: seg.t, bpm: seg.bpm, tick0 })
    }
  }
  return { segments: out, bpm0 }
}
function secToTick(sec: number, tempoMap: ReturnType<typeof buildTempoMap>) {
  const { segments, bpm0 } = tempoMap
  if (segments.length === 0 || sec < segments[0].t0) {
    const spb = secPerBeat(bpm0)
    return Math.round((sec / spb) * PPQN)
  }
  let curr = { t0: 0, bpm: bpm0, tick0: 0 }
  for (const s of segments) { if (s.t0 <= sec) curr = s; else break }
  const spb = secPerBeat(curr.bpm)
  const dt = sec - curr.t0
  return Math.round(curr.tick0 + (dt / spb) * PPQN)
}

// hueIndex (0..11) → CC1 value (0..127 stepped)
function hueToCC(hueIndex?: number) {
  if (hueIndex == null) return 0
  const table = [0,11,22,33,44,55,66,77,88,99,110,121]
  return table[(hueIndex % 12 + 12) % 12]
}

type Ev = { tick:number; prio:number; bytes:number[] } // prio: 0=CC,1=NoteOn,2=NoteOff
function pushCC(ev: Ev[], tick:number, ch:number, num:number, val:number) {
  ev.push({ tick, prio:0, bytes:[0xb0 | ch, num & 0x7f, Math.max(0, Math.min(127, val|0))] })
}
function pushON(ev: Ev[], tick:number, ch:number, pitch:number, vel:number) {
  ev.push({ tick, prio:1, bytes:[0x90 | ch, pitch & 0x7f, Math.max(1, Math.min(127, vel|0))] })
}
function pushOFF(ev: Ev[], tick:number, ch:number, pitch:number) {
  ev.push({ tick, prio:2, bytes:[0x80 | ch, pitch & 0x7f, 0] })
}

export function exportShow(proj: Project, opts?: { endHintSec?: number }) {
  const bpm = proj.bpm ?? 120
  const ts = proj.timeSig ?? [4,4]
  const tempoMap = buildTempoMap(bpm, proj.tempos ?? [])
  const midiOffsetSec = (proj.midiOffsetMs ?? 0) / 1000

  // 1) meta track header stuff
  const meta = createBuilder()
  metaTempo(meta, bpm)
  metaTimeSig(meta, ts[0], ts[1])

  // 2) events array
  const events: Ev[] = []

  // init snapshot CC's op tick 0 voor alle gebruikte LED-kanalen
  const ledChUsed = new Set<number>() // midi-kanalen 1..10
  for (const n of proj.ledNotes) {
    ledChUsed.add(Math.min(10, Math.max(1, (n.lane|0)+1)))
  }
  for (const ch of ledChUsed) {
    pushCC(events, 0, ch, 1, hueToCC(0))   // Hue default
    pushCC(events, 0, ch, 2, 127)          // Saturation = 127 (vol)
    pushCC(events, 0, ch, 10, 0)           // EffectType default = Static
  }

  // LED notes → kanaal 1..10, pitch 60
  for (const n of proj.ledNotes) {
    const ch = Math.min(10, Math.max(1, (n.lane|0)+1))
    const t0 = Math.max(0, n.t0 + midiOffsetSec)
    const t1 = Math.max(t0, n.t1 + midiOffsetSec)
    const tick0 = secToTick(t0, tempoMap)
    const tick1 = secToTick(t1, tempoMap)

    // snapshot CC's precies vóór NoteOn
    pushCC(events, tick0, ch, 1, hueToCC(n.hueIndex))
    pushCC(events, tick0, ch, 2, 127)                     // Saturation vol
    pushCC(events, tick0, ch, 10, n.effectType ?? 0)      // EffectType

    // TODO (v2+):
    // pushCC(events, tick0, ch, 11, n.cc11 ?? 0)
    // pushCC(events, tick0, ch, 12, hueToCC(n.hue2))
    // pushCC(events, tick0, ch, 13, hueToCC(n.hue3))
    // pushCC(events, tick0, ch, 14, hueToCC(n.hue4))

    pushON(events, tick0, ch, PITCH_LED, n.velocity)
    pushOFF(events, tick1, ch, PITCH_LED)
  }

  // Pump notes → kanaal 0, pitch 60..69 per pomp (lane index)
  for (const n of proj.pumpNotes) {
    const pitch = PUMP_BASE_PITCH + Math.min(9, Math.max(0, n.lane|0))
    const t0 = Math.max(0, n.t0 + midiOffsetSec)
    const t1 = Math.max(t0, n.t1 + midiOffsetSec)
    const tick0 = secToTick(t0, tempoMap)
    const tick1 = secToTick(t1, tempoMap)
    pushON(events, tick0, CH_PUMPS, pitch, n.velocity)
    pushOFF(events, tick1, CH_PUMPS, pitch)
  }

  // 3) sorteer events op tick, dan prio
  events.sort((a,b)=> a.tick - b.tick || a.prio - b.prio)

  // 4) pack delta-times en bytes in één track
  const body: number[] = []
  let lastTick = 0
  for (const ev of events) {
    const d = ev.tick - lastTick
    body.push(...vlq(Math.max(0,d|0)))
    body.push(...ev.bytes)
    lastTick = ev.tick
  }
  // EOT
  body.push(0x00, 0xff, 0x2f, 0x00)

  // track chunk
  const trackChunk = [
    0x4d,0x54,0x72,0x6b, // "MTrk"
    ...u32(meta.data.length + body.length),
    ...meta.data,
    ...body
  ]

  // MIDI header chunk (format 1, 1 track)
  const header = [
    0x4d,0x54,0x68,0x64, // "MThd"
    ...u32(6),
    ...u16(1),           // format 1
    ...u16(1),           // nTracks
    ...u16(PPQN)         // ticks per quarter
  ]

  const midiBytes = new Uint8Array([...header, ...trackChunk])

  // manifest JSON naast de MIDI in de .zip
  const manifest = {
    version: "1.0",
    bpm,
    ppqn: PPQN,
    rings: 10,
    ledChannels: "MIDI channel 1..10 = LED ring 1..10, pitch=60, velocity=brightness",
    mapping: Object.fromEntries(
      Array.from({length:10}, (_,i)=>[(i+1).toString(), `Ring ${i+1}`])
    ),
    ccSemantics: {
      "1":  "Hue1",
      "2":  "Saturation (127=max)",
      "10": "EffectType (0 Static,1 Strobe,2 Fade,3 Chase,4 Rainbow)",
      "11": "Speed/FadeParam (per effect)",
      "12": "Hue2 (Chase)",
      "13": "Hue3 (Chase)",
      "14": "Hue4 (Chase)",
      "3":  "Level (legacy; niet gebruikt)"
    },
    pumps: {
      channel_zero_based: 0,
      notes: {
        "60":"Pump 1","61":"Pump 2","62":"Pump 3","63":"Pump 4","64":"Pump 5",
        "65":"Pump 6","66":"Pump 7","67":"Pump 8","68":"Pump 9","69":"Pump 10"
      }
    },
    timeSig: proj.timeSig ?? [4,4]
  }
  const manifestBlob = new Blob([JSON.stringify(manifest,null,2)], { type:'application/json' })

  return { midi: midiBytes, manifest: manifestBlob }
}
