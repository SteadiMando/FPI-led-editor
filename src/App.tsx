// src/App.tsx
import React, { useEffect, useRef, useState } from 'react'
import { emptyProject, type Project, migrateProject } from './core/model'
import { Toolbar } from './ui/Toolbar'
import { MarkerLane } from './ui/MarkerLane'
import { Waveform } from './ui/Waveform'
import { Ruler } from './ui/Ruler'
import { MidiRuler } from './ui/MidiRuler'
import { Editor } from './ui/Editor'
import { exportShow } from './core/export'
import JSZip from 'jszip'
import { set as idbSet, get as idbGet } from 'idb-keyval'

const WF_H = 90
const MARKER_H = 28
const RULER_H = 22
const CONTENT_WIDTH = 6000

export const App: React.FC = () => {
  const [proj, setProj] = useState<Project>({ ...emptyProject() })

  // UI/editor state
  const [hue, setHue] = useState(0)            // huidige kleurkeuze voor nieuwe noten
  const [vel, setVel] = useState(96)           // brightness (intern velocity 1..127)
  const [effectType, setEffectType] = useState<number>(0) // default FX voor nieuwe LED-noten

  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)

  const [zoomX, setZoomX]   = useState(proj.zoomX ?? 160)
  const [zoomY, setZoomY]   = useState(proj.zoomY ?? 26)
  const [scrollX, setScrollX] = useState(proj.scrollX ?? 0)

  const [rightLabels, setRightLabels] = useState(false)
  const [showMidiRuler, setShowMidiRuler] = useState(true)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  // hoogte editor-pane
  const [editorH, setEditorH] = useState(() => {
    const base = window.innerHeight - (MARKER_H + WF_H + RULER_H + RULER_H + 140)
    return Math.max(260, base)
  })
  useEffect(() => {
    const onRes = () => {
      const base = window.innerHeight - (MARKER_H + WF_H + RULER_H + RULER_H + 140)
      setEditorH(Math.max(260, base))
    }
    window.addEventListener('resize', onRes)
    return () => window.removeEventListener('resize', onRes)
  }, [])

  // autosave restore on first load
  useEffect(() => {
    ;(async () => {
      const saved = await idbGet('fp_autosave')
      if (saved) {
        try {
          const data = JSON.parse(saved as string)
          const migrated = migrateProject({ ...emptyProject(), ...data })
          setProj(migrated)
          setZoomX(migrated.zoomX ?? 160)
          setZoomY(migrated.zoomY ?? 26)
          setScrollX(migrated.scrollX ?? 0)
        } catch {}
      }
    })()
  }, [])

  // audio element koppelen
  useEffect(() => {
    audioRef.current = document.getElementById('audio') as HTMLAudioElement | null
    if (audioRef.current) {
      audioRef.current.addEventListener('ended', () => setPlaying(false))
    }
  }, [])

  // playhead volgen tijdens afspelen
  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (playing) {
        const a = audioRef.current
        const t = a ? a.currentTime : playhead + 0.016
        setPlayhead(t)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  // autosave debounce
  useEffect(() => {
    const t = setTimeout(() => {
      const snapshot = JSON.stringify({ ...proj, zoomX, zoomY, scrollX })
      idbSet('fp_autosave', snapshot).catch(() => {})
    }, 3000)
    return () => clearTimeout(t)
  }, [proj, zoomX, zoomY, scrollX])

  // Undo/Redo stack
  const [undo, setUndo] = useState<Project[]>([])
  const [redo, setRedo] = useState<Project[]>([])
  function commit(mut: (p: Project) => Project) {
    setUndo((u) => [...u.slice(-9), proj])
    setRedo([])
    setProj((p) => mut(p))
  }
  function doUndo() {
    const last = undo[undo.length - 1]
    if (!last) return
    setUndo((u) => u.slice(0, -1))
    setRedo((r) => [proj, ...r].slice(0, 10))
    setProj(last)
  }
  function doRedo() {
    const first = redo[0]
    if (!first) return
    setRedo((r) => r.slice(1))
    setUndo((u) => [...u.slice(-9), proj])
    setProj(first)
  }

  // keybinds
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        onTogglePlay()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) doRedo()
        else doUndo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        doRedo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // EXPORT ZIP (mid+manifest)
  async function doExportZip() {
    try {
      const { midi, manifest } = exportShow(proj, { endHintSec: audioBuffer?.duration })
      const zip = new JSZip()
      zip.file('fountainpi.mid', midi)
      const manifestArrayBuf = await manifest.arrayBuffer()
      zip.file('show_manifest.json', manifestArrayBuf)
      const blob = await zip.generateAsync({ type: 'blob' })

      // moderne picker als beschikbaar
      // @ts-ignore
      if (window.showSaveFilePicker) {
        try {
          // @ts-ignore
          const handle = await window.showSaveFilePicker({
            suggestedName: 'fountainpi_show_export.zip',
            types: [{ description: 'Zip', accept: { 'application/zip': ['.zip'] } }],
          })
          const w = await handle.createWritable()
          await w.write(blob)
          await w.close()
          alert('Export opgeslagen ✅ (MIDI + manifest)')
          return
        } catch (e: any) {
          if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return
        }
      }
      // fallback
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'fountainpi_show_export.zip'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert('Export mislukt. Zie console.')
    }
  }

  // EXPORT alleen .mid
  async function doExportMID() {
    try {
      const { midi } = exportShow(proj, { endHintSec: audioBuffer?.duration })
      const blob = new Blob([midi], { type: 'audio/midi' })

      // @ts-ignore
      if (window.showSaveFilePicker) {
        try {
          // @ts-ignore
          const handle = await window.showSaveFilePicker({
            suggestedName: 'fountainpi.mid',
            types: [{ description: 'MIDI', accept: { 'audio/midi': ['.mid'] } }],
          })
          const w = await handle.createWritable()
          await w.write(blob)
          await w.close()
          alert('MIDI opgeslagen ✅')
          return
        } catch (e: any) {
          if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return
        }
      }
      // fallback
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'fountainpi.mid'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert('MIDI export mislukt.')
    }
  }

  async function saveProject() {
    const state = { ...proj, zoomX, zoomY, scrollX }
    const projectBlob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })

    // @ts-ignore
    if (window.showSaveFilePicker) {
      try {
        // @ts-ignore
        const handle = await window.showSaveFilePicker({
          suggestedName: 'fountainpi.fpj',
          types: [{
            description: 'FountainPi Project',
            accept: { 'application/json': ['.fpj'] },
          }],
        })
        const w = await handle.createWritable()
        await w.write(projectBlob)
        await w.close()
        alert('Project opgeslagen ✅')
        return
      } catch (e: any) {
        if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return
      }
    }

    const url = URL.createObjectURL(projectBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fountainpi.fpj'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function openProject() {
    // @ts-ignore
    if (window.showOpenFilePicker) {
      try {
        // @ts-ignore
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'FountainPi Project',
            accept: { 'application/json': ['.fpj', '.json'] },
          }],
          multiple: false,
        })
        const file = await handle.getFile()
        const txt = await file.text()
        const data = JSON.parse(txt)
        const migrated = migrateProject({ ...emptyProject(), ...data })
        setProj(migrated)
        setZoomX(migrated.zoomX ?? 160)
        setZoomY(migrated.zoomY ?? 26)
        setScrollX(migrated.scrollX ?? 0)
        return
      } catch {
        return
      }
    }

    // fallback input[type=file]
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.fpj,application/json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      const txt = await f.text()
      const data = JSON.parse(txt)
      const migrated = migrateProject({ ...emptyProject(), ...data })
      setProj(migrated)
      setZoomX(migrated.zoomX ?? 160)
      setZoomY(migrated.zoomY ?? 26)
      setScrollX(migrated.scrollX ?? 0)
    }
    input.click()
  }

  async function saveBundle() {
    const zip = new JSZip()
    const state = { ...proj, zoomX, zoomY, scrollX }
    zip.file('project.fpj', JSON.stringify(state, null, 2))
    const blob = await zip.generateAsync({ type:'blob' })

    // @ts-ignore
    if (window.showSaveFilePicker) {
      try {
        // @ts-ignore
        const handle = await window.showSaveFilePicker({
          suggestedName:'fountainpi_bundle.zip',
          types:[{ description:'Zip', accept:{'application/zip':['.zip']} }],
        })
        const w = await handle.createWritable()
        await w.write(blob)
        await w.close()
        alert('Bundle opgeslagen ✅')
        return
      }catch(e:any){
        if(e && (e.name==='AbortError' || e.name==='NotAllowedError')) return
      }
    }

    const url=URL.createObjectURL(blob)
    const link=document.createElement('a')
    link.href=url
    link.download='fountainpi_bundle.zip'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function onLoadJSON(file:File){
    const txt=await file.text()
    const data=JSON.parse(txt)
    const migrated = migrateProject({ ...emptyProject(), ...data })
    setProj(migrated)
  }

  async function onLoadAudio(f:File){
    const url = URL.createObjectURL(f)
    const a = audioRef.current
    if(a){
      a.src = url
      a.currentTime = 0
    }
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)()
    const arr = await f.arrayBuffer()
    const buf = await ac.decodeAudioData(arr)
    setAudioBuffer(buf)
    setPlayhead(0)
  }

  function onTogglePlay(){
    const a=audioRef.current
    if(a){
      if(playing){ a.pause() }
      else { a.currentTime=playhead; a.play() }
    }
    setPlaying(!playing)
  }
  function onStop(){
    const a=audioRef.current
    if(a){
      a.pause()
      a.currentTime=0
    }
    setPlaying(false)
    setPlayhead(0)
  }

  function onSeek(sec:number){
    const a=audioRef.current
    if(a) a.currentTime=sec
    setPlayhead(sec)
  }

  // tempo-change marker on playhead (we're not yet doing per-section snapping logic here)
  function addTempoAtPlayhead(){
    const nowBpm = proj.bpm ?? 120
    commit(p=>({
      ...p,
      tempos:[...p.tempos,{t:playhead,bpm:nowBpm}],
      markers:[...p.markers,{t:playhead,label:`Tempo ${nowBpm}bpm`,color:'#00ff88'}],
    }))
  }

  // time signature change marker on playhead
  function addTimeSignatureAtPlayhead(){
    const current = proj.timeSig ?? [4,4]
    const raw = prompt('Time Signature (bijv. 4/4, 3/4, 6/8):', `${current[0]}/${current[1]}`)
    if(!raw) return
    const m = raw.trim().match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/)
    if(!m){ alert('Ongeldige invoer. Gebruik n/d, bijv. 6/8.'); return }
    const num = Math.max(1, parseInt(m[1],10))
    const allowed=[1,2,4,8,16,32]
    const denIn=parseInt(m[2],10)
    const den = allowed.includes(denIn)?denIn:4

    commit(p=>({
      ...p,
      timeSig:[num,den],
      timeSigs:[...p.timeSigs,{t:playhead,num,den}],
      markers:[...p.markers,{t:playhead,label:`${num}/${den}`,color:'#ff00ff'}],
    }))
  }

  function addMarker(){
    commit(p=>({
      ...p,
      markers:[...p.markers,{t:playhead,label:'Marker',color:'#ffd36b'}],
    }))
  }

  function updateMarkers(newMarkers: Project['markers']){
    setProj(old=>({...old,markers:newMarkers}))
  }

  const midiOffsetSec = (proj.midiOffsetMs ?? 0)/1000

  return (
    <div>
      <div className="topbar">
        <Toolbar
          hue={hue} setHue={setHue}
          paletteMode={proj.paletteMode} setPaletteMode={pm=>setProj(p=>({...p,paletteMode:pm}))}

          velocity={vel} setVelocity={setVel}
          effectType={effectType} setEffectType={setEffectType}

          tool={(proj as any).tool ?? 'draw'}
          setTool={(t)=>setProj((pp:any)=>({...pp,tool:t}))}

          bpm={proj.bpm??120} setBpm={b=>setProj(p=>({...p,bpm:b}))}
          addTempo={addTempoAtPlayhead} addTS={addTimeSignatureAtPlayhead}

          exportMID={doExportMID}
          exportZIP={doExportZip}
          saveProject={saveProject}
          openProject={openProject}
          saveBundle={saveBundle}
          loadJSON={onLoadJSON}
          loadAudio={onLoadAudio}

          playing={playing}
          togglePlay={onTogglePlay}
          stopPlay={onStop}

          showLED={proj.showLED} setShowLED={v=>setProj(p=>({...p,showLED:v}))}
          showPumps={proj.showPumps} setShowPumps={v=>setProj(p=>({...p,showPumps:v}))}
          snapWhileDrag={proj.snapWhileDrag} setSnapWhileDrag={b=>setProj(p=>({...p,snapWhileDrag:b}))}
          perf={proj.perfMeter} setPerf={b=>setProj(p=>({...p,perfMeter:b}))}

          zoomX={zoomX} setZoomX={setZoomX}
          zoomY={zoomY} setZoomY={setZoomY}

          midiOffsetMs={proj.midiOffsetMs} setMidiOffsetMs={n=>setProj(p=>({...p,midiOffsetMs:n}))}
          applyVisualOffset={proj.applyVisualOffset} setApplyVisualOffset={b=>setProj(p=>({...p,applyVisualOffset:b}))}

          addMarker={addMarker}

          rightLabels={rightLabels} setRightLabels={setRightLabels}
          showMidiRuler={showMidiRuler} setShowMidiRuler={setShowMidiRuler}

          playheadSnap={proj.playheadSnap ?? false}
          setPlayheadSnap={b=>setProj(p=>({...p,playheadSnap:b}))}

          // applyFXToSelection is now handled directly in Editor RMB menu;
          // we accept it optional to not break older App->Toolbar calls
          applyFXToSelection={undefined}
        />

        <div className="group">
          <button className="btn" title="Undo (Ctrl/Cmd+Z)" onClick={()=>doUndo()}>Undo</button>
          <button className="btn" title="Redo (Ctrl/Cmd+Y or Shift+Z)" onClick={()=>doRedo()}>Redo</button>
        </div>
      </div>

      <div className="stack">
        <MarkerLane
          markers={proj.markers}
          setMarkers={(m)=>setProj(p=>({...p,markers:m}))}
          width={CONTENT_WIDTH}
          zoom={zoomX}
          scrollX={scrollX}
          playhead={playhead}
          onSeek={onSeek}
        />

        <Waveform
          audioBuffer={audioBuffer}
          zoom={zoomX}
          scrollX={scrollX}
          width={CONTENT_WIDTH}
          playhead={playhead}
          onSeek={onSeek}
          showZeroPin
        />

        {/* Ruler = tijd/bars lane. Hier mag je klikken voor playhead (met snap via playheadSnap in je Ruler code). */}
        <Ruler
          width={CONTENT_WIDTH}
          zoom={zoomX}
          scrollX={scrollX}
          playhead={playhead}
          onSeek={onSeek}
          playheadSnap={proj.playheadSnap ?? false}
          bpm={proj.bpm ?? 120}
          ts={proj.timeSig ?? [4,4]}
          tempos={proj.tempos}
          timeSigs={proj.timeSigs}
        />

        {showMidiRuler && (
          <MidiRuler
            width={CONTENT_WIDTH}
            zoom={zoomX}
            scrollX={scrollX}
            bpm={proj.bpm ?? 120}
            ts={proj.timeSig ?? [4,4]}
            playhead={playhead}
            midiOffsetSec={proj.applyVisualOffset?midiOffsetSec:0}
            onSeek={onSeek}
          />
        )}

        <div className="editorWrap" style={{height: editorH}}>
          <div className="editorScroll">
            <Editor
              proj={proj}
              setProj={(mut)=>commit(mut)}
              hueIndex={hue}
              velocity={vel}
              effectType={effectType}
              bpm={proj.bpm ?? 120}
              ts={proj.timeSig ?? [4,4]}
              tempos={proj.tempos}
              timeSigs={proj.timeSigs}
              playing={playing}
              playhead={playhead}
              onSeek={onSeek}
              zoomX={zoomX}
              zoomY={zoomY}
              scrollX={scrollX}
              setScrollX={setScrollX}
              rightLabels={rightLabels}
              markers={proj.markers}
              setMarkers={updateMarkers}
            />
          </div>
          <div
            className="resizeHandle"
            onMouseDown={(e)=>{
              const startY = e.clientY
              const startH = editorH
              const onMove=(ev:MouseEvent)=>{
                setEditorH(Math.max(200, startH + (ev.clientY-startY)))
              }
              const onUp=()=>{
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
              }
              window.addEventListener('mousemove', onMove)
              window.addEventListener('mouseup', onUp)
            }}
          />
        </div>
      </div>

      <audio id="audio" />
    </div>
  )
}
