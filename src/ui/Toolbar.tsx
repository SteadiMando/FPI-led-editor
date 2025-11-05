// src/ui/Toolbar.tsx
import React from 'react'
import { colorFromHueIndex } from '../util/colors'
import { NumberField } from '../util/helpers'
import type { SnapSetting } from '../core/model'

type Props = {
  hue: number; setHue: (n: number) => void
  paletteMode: 0|1|2; setPaletteMode: (p: 0|1|2) => void

  velocity: number; setVelocity: (v: number) => void  // brightness internally 1..127
  effectType: number; setEffectType: (fx: number) => void

  tool: 'draw'|'select'|'erase'; setTool: (t: 'draw'|'select'|'erase') => void

  bpm: number; setBpm: (b: number) => void
  addTempo: () => void
  addTS: () => void

  exportMID: () => void
  exportZIP: () => void
  saveProject: () => void
  openProject: () => void
  saveBundle: () => void
  loadJSON: (f: File) => void
  loadAudio: (f: File) => void

  playing: boolean
  togglePlay: () => void
  stopPlay: () => void

  showLED: boolean; setShowLED: (v: boolean) => void
  showPumps: boolean; setShowPumps: (v: boolean) => void

  snapWhileDrag: boolean; setSnapWhileDrag: (b: boolean) => void
  perf: boolean; setPerf: (b: boolean) => void

  zoomX: number; setZoomX: (n: number) => void
  zoomY: number; setZoomY: (n: number) => void

  midiOffsetMs: number|undefined; setMidiOffsetMs: (n: number) => void
  applyVisualOffset: boolean; setApplyVisualOffset: (b: boolean) => void

  addMarker: () => void

  rightLabels: boolean; setRightLabels: (b: boolean) => void
  showMidiRuler: boolean; setShowMidiRuler: (b: boolean) => void

  playheadSnap: boolean; setPlayheadSnap: (b: boolean) => void

  // current code in App still passes this, keep optional to avoid crash
  applyFXToSelection?: (fx:any)=>void
}

export const Toolbar: React.FC<Props> = (p) => {
  const brightnessPct = Math.round((p.velocity/127)*100)

  return (
    <div className="group" style={{flexWrap:'wrap', rowGap:'.5rem', alignItems:'flex-start'}}>
      {/* File / Project */}
      <div className="group">
        <button className="btn" title="Open Project (⌘/Ctrl+O)" onClick={p.openProject}>Open</button>
        <button className="btn" title="Save Project (⌘/Ctrl+S)" onClick={p.saveProject}>Save</button>
        <div className="btn" title="Meer opties">
          <details>
            <summary>More</summary>
            <button className="btn" onClick={p.saveBundle} style={{ marginTop: 6 }}>Save Bundle (.zip)</button>
            <button className="btn" onClick={p.exportZIP} style={{ marginTop: 6 }}>Export Show (.zip)</button>
            <button className="btn" onClick={p.exportMID} style={{ marginTop: 6 }}>Export MIDI (.mid)</button>
          </details>
        </div>
      </div>

      {/* Transport */}
      <div className="group">
        <button className="btn" title="Play/Pause (Space)" onClick={p.togglePlay}>
          {p.playing ? 'Pause' : 'Play'}
        </button>
        <button className="btn" title="Stop" onClick={p.stopPlay}>
          Stop
        </button>
        <button className="btn" title="Add marker at playhead" onClick={p.addMarker}>+ Marker</button>
      </div>

      {/* Tools / snapping */}
      <div className="group">
        <label className="muted">Tool</label>
        <button className="btn" title="Draw (click=quantized note)"
          onClick={() => p.setTool('draw')} disabled={p.tool === 'draw'}>Draw</button>
        <button className="btn" title="Select / Marquee / Move / Resize"
          onClick={() => p.setTool('select')} disabled={p.tool === 'select'}>Select</button>
        <button className="btn" title="Erase (Cmd/Ctrl+Click)"
          onClick={() => p.setTool('erase')} disabled={p.tool === 'erase'}>Erase</button>

        <span className="chk">
          <input
            type="checkbox"
            checked={p.snapWhileDrag}
            onChange={e => p.setSnapWhileDrag(e.target.checked)}
          />
          <span>Snap while drag</span>
        </span>

        <span className="chk">
          <input
            type="checkbox"
            checked={p.playheadSnap}
            onChange={e => p.setPlayheadSnap(e.target.checked)}
          />
          <span>Playhead Snap</span>
        </span>
      </div>

      {/* Visibility / perf */}
      <div className="group">
        <span className="chk">
          <input type="checkbox" checked={p.showLED}
            onChange={e => p.setShowLED(e.target.checked)} />
          <span>LED</span>
        </span>
        <span className="chk">
          <input type="checkbox" checked={p.showPumps}
            onChange={e => p.setShowPumps(e.target.checked)} />
          <span>Pumps</span>
        </span>
        <span className="chk">
          <input type="checkbox" checked={p.rightLabels}
            onChange={e => p.setRightLabels(e.target.checked)} />
          <span>Right labels</span>
        </span>
        <span className="chk">
          <input type="checkbox" checked={p.applyVisualOffset}
            onChange={e => p.setApplyVisualOffset(e.target.checked)} />
          <span>Visual offset</span>
        </span>
        <span className="chk">
          <input type="checkbox" checked={p.showMidiRuler}
            onChange={e => p.setShowMidiRuler(e.target.checked)} />
          <span>Show MIDI ruler</span>
        </span>
        <span className="chk">
          <input type="checkbox" checked={p.perf}
            onChange={e => p.setPerf(e.target.checked)} />
          <span>Perf</span>
        </span>
      </div>

      {/* Tempo / Palette / Offset */}
      <div className="group" style={{rowGap:'.4rem', flexDirection:'column', alignItems:'flex-start'}}>
        <div style={{display:'flex',flexWrap:'wrap',gap:'.5rem',alignItems:'center'}}>
          <label className="muted">BPM</label>
          <NumberField value={p.bpm} onCommit={v=>p.setBpm(v)} min={20} max={300} />
          <button className="btn" title="Add tempo change at playhead" onClick={p.addTempo}>+ Tempo</button>
          <button className="btn" title="Add time signature at playhead" onClick={p.addTS}>+ Time Sig</button>
        </div>

        <div style={{display:'flex',flexWrap:'wrap',gap:'.5rem',alignItems:'center'}}>
          <label className="muted">Palette</label>
          <select
            className="btn"
            value={p.paletteMode}
            onChange={(e)=>p.setPaletteMode(+e.target.value as any)}
          >
            <option value={0}>Vivid</option>
            <option value={1}>Pastel</option>
            <option value={2}>White</option>
          </select>

          <label className="muted">MIDI offset (ms)</label>
          <NumberField
            value={p.midiOffsetMs ?? 0}
            onCommit={v=>p.setMidiOffsetMs(Math.round(v))}
          />
        </div>
      </div>

      {/* Color / Brightness / Upload / Zoom */}
      <div className="group" style={{rowGap:'.5rem', flexDirection:'column', alignItems:'flex-start'}}>
        {/* palette swatches for hueIndex 0..11 */}
        <div style={{display:'flex',flexWrap:'wrap',gap:'.4rem',alignItems:'center'}}>
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              className={'sw' + (p.hue === i ? ' sel' : '')}
              title={`Hue ${i}`}
              onClick={() => p.setHue(i)}
              style={{ background: colorFromHueIndex(i, p.paletteMode) }}
            />
          ))}

          <div style={{display:'flex',alignItems:'center',gap:'.5rem'}}>
            <div className="muted">Brightness</div>
            <input
              className="slider"
              type="range"
              min={1}
              max={127}
              value={p.velocity}
              onChange={e => p.setVelocity(+e.target.value)}
            />
            <div className="valBubble">{brightnessPct}%</div>
          </div>
        </div>

        {/* audio load */}
        <div style={{display:'flex',flexWrap:'wrap',gap:'.5rem',alignItems:'center'}}>
          <input
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav"
            style={{ display: 'none' }}
            id="audiofile"
            onChange={e => {
              const f = (e.target as HTMLInputElement).files?.[0]
              if (f) p.loadAudio(f)
              (e.target as HTMLInputElement).value = ''
            }}
          />
          <label htmlFor="audiofile" className="btn" title="Load audio (MP3/WAV)">Load Audio</label>

          <div style={{display:'flex',alignItems:'center',gap:'.5rem'}}>
            <label className="muted">Zoom H</label>
            <input
              type="range"
              min={40}
              max={800}
              value={p.zoomX}
              onChange={e => p.setZoomX(+e.target.value)}
            />
            <div className="valBubble">{p.zoomX}</div>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:'.5rem'}}>
            <label className="muted">Zoom V</label>
            <input
              type="range"
              min={18}
              max={48}
              value={p.zoomY}
              onChange={e => p.setZoomY(+e.target.value)}
            />
            <div className="valBubble">{p.zoomY}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
