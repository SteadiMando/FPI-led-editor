// src/ui/Editor.tsx
import React, { useEffect, useRef, useState } from 'react'
import type { Project, Note } from '../core/model'
import { colorFromHueIndex } from '../util/colors'
import { secPerBeat, snapToNearestQuarterOrEighth, quarterLength } from '../util/time'

/*
Props:
- proj / setProj          project state
- hueIndex, velocity      defaults for new notes
- effectType              default FX for new LED notes
- bpm, ts, tempos, timeSigs      timing info (BPM/TS arrays not yet deeply used here)
- playing, playhead
- onSeek                  from App
- zoomX, zoomY, scrollX, setScrollX
- rightLabels
- markers, setMarkers     for marker editing
*/

type EditorProps = {
  proj: Project
  setProj: (mut: (p: Project) => Project) => void
  hueIndex: number
  velocity: number
  effectType: number
  bpm: number
  ts: [number, number]
  tempos: { t:number; bpm:number }[]
  timeSigs: { t:number; num:number; den:number }[]
  playing: boolean
  playhead: number
  onSeek: (sec: number) => void
  zoomX: number
  zoomY: number
  scrollX: number
  setScrollX: (n: number) => void
  rightLabels: boolean
  markers: { t:number; label:string; color?:string }[]
  setMarkers: (m:{ t:number; label:string; color?:string }[])=>void
}

const LED_LANES = 10
const PUMP_LANES = 10
const GAP = 4
const LABEL_W = 130
const SEP_COLOR = '#2a3550'
const RESIZE_ZONE_PX = 6

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// small helper so we don't explode if markers missing
function safeMarkers(arr:any): {t:number;label:string;color?:string}[] {
  if (!Array.isArray(arr)) return []
  return arr
}

export const Editor: React.FC<EditorProps> = (p) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rightRef  = useRef<HTMLCanvasElement>(null)

  // selection of notes: pump idx are stored raw, led idx stored as 10000+idx
  const [selection, setSelection] = useState<number[]>([])
  const [lastPointerTime, setLastPointerTime] = useState<number>(0)

  // drag state for move / marquee / resize / maybePlace
  const dragState = useRef<
    | null
    | {
        mode: 'maybePlace' | 'marquee' | 'move' | 'resize'
        startX: number
        startY: number

        // shared
        noteKind?: 'pump' | 'led'
        noteIdx?: number

        // move-specific
        origT0?: number
        origLane?: number
        group?: {
          anchorKind: 'pump' | 'led'
          anchorIdx: number
          anchorOrigT0: number
          anchorOrigLane: number
          pumpIdxs: number[]
          ledIdxs: number[]
          origT0Pump: number[]
          origT0Led: number[]
          origLanePump: number[]
          origLaneLed: number[]
        }

        // placement-specific
        laneAtDown?: number
        tSnapAtDown?: number
        kindAtDown?: 'pump' | 'led'

        // resize-specific
        origT1?: number
      }
  >(null)

  const [marquee, setMarquee] = useState<null | { x0: number; y0: number; x1: number; y1: number }>(null)

  // RMB context menu state
  const [ctxOpen, setCtxOpen] = useState(false)
  const [ctxPos, setCtxPos] = useState<{x:number;y:number}>({x:0,y:0})

  // FX draft state in the RMB menu so user can tweak before applying:
  const [ctxFxType, setCtxFxType] = useState<number>(0)      // 0 Static,1 Strobe,2 Fade,3 Chase,4 Rainbow
  const [ctxBrightness, setCtxBrightness] = useState<number>(96) // velocity 1..127
  const [ctxSpeed, setCtxSpeed] = useState<number>(32)       // used for strobe/chase/rainbow speed etc.
  const [ctxFadeMode, setCtxFadeMode] = useState<'in'|'out'|'inout'>('in')
  const [ctxFadeLen, setCtxFadeLen] = useState<number>(20)   // 0..63
  // chase colors = up to 4 hue indices
  const [ctxChaseHues, setCtxChaseHues] = useState<number[]>([0,1])
  // which chase color index is currently "editing a palette popup"
  const [chaseHuePopupIdx, setChaseHuePopupIdx] = useState<number|null>(null)

  // local helper because palette changes should NOT auto-apply on selection anymore
  const paletteColors = Array.from({ length: 12 }, (_, i) => i)

  // we draw lanes
  const lanesCount = (p.proj.showPumps ? PUMP_LANES : 0) + (p.proj.showLED ? LED_LANES : 0)
  const laneH = p.zoomY
  const height = lanesCount * (laneH + GAP) + 30
  const width = 6000

  // convenience "transaction"
  function projectMut(mut: (q: Project) => void) {
    p.setProj((pp) => {
      const clone: Project = JSON.parse(JSON.stringify(pp))
      mut(clone)
      return clone
    })
  }

  // ---------------------------------
  // Canvas drawing helpers
  // ---------------------------------
  function draw() {
    const c = canvasRef.current
    if (!c) return
    const g = c.getContext('2d')!
    c.width = width + LABEL_W + (p.rightLabels ? LABEL_W : 0)
    c.height = height

    // bg
    g.fillStyle = '#0b0f16'
    g.fillRect(0, 0, c.width, c.height)

    // left labels + lanes
    g.font = '12px system-ui'
    g.textBaseline = 'middle'
    let y = 30

    // pumps
    if (p.proj.showPumps) {
      for (let i = 0; i < PUMP_LANES; i++) {
        g.fillStyle = '#0b1018'
        g.fillRect(LABEL_W, y, width, laneH)
        g.fillStyle = '#0e1624'
        g.fillRect(LABEL_W, y + laneH, width, GAP)

        g.fillStyle = '#9fb0cc'
        g.textAlign = 'right'
        g.fillText(`Pump ${i + 1}`, LABEL_W - 10, y + laneH / 2)
        y += laneH + GAP
      }
      if (p.proj.showLED) {
        g.strokeStyle = SEP_COLOR
        g.beginPath()
        g.moveTo(0, y - 2)
        g.lineTo(c.width, y - 2)
        g.stroke()
      }
    }

    // leds
    const ledYStart = y
    if (p.proj.showLED) {
      for (let i = 0; i < LED_LANES; i++) {
        g.fillStyle = '#0b1018'
        g.fillRect(LABEL_W, y, width, laneH)
        g.fillStyle = '#0e1624'
        g.fillRect(LABEL_W, y + laneH, width, GAP)

        g.fillStyle = '#9fb0cc'
        g.textAlign = 'right'
        g.fillText(`LED ${i + 1}`, LABEL_W - 10, y + laneH / 2)
        y += laneH + GAP
      }
    }

    // vertical beat/grid lines
    const pxPerSec = p.zoomX
    const spb = secPerBeat(p.bpm)
    const [num, den] = p.ts
    const bpb = num * (4 / den)   // beats per bar
    const pxPerBeat = spb * pxPerSec
    const pxPerBar = bpb * pxPerBeat

    // Visual offset - purely drawing (for aligning midi ruler)
    const offsetPx = p.proj.applyVisualOffset
      ? ((p.proj.midiOffsetMs ?? 0) / 1000) * p.zoomX
      : 0

    // beat lines
    for (
      let x = LABEL_W - ((p.scrollX - offsetPx) % pxPerBeat);
      x < c.width - (p.rightLabels ? LABEL_W : 0);
      x += pxPerBeat
    ) {
      g.strokeStyle = '#1a2132'
      g.beginPath()
      g.moveTo(x + 0.5, 22)
      g.lineTo(x + 0.5, height)
      g.stroke()
    }

    // bar lines
    for (
      let x = LABEL_W - ((p.scrollX - offsetPx) % pxPerBar);
      x < c.width - (p.rightLabels ? LABEL_W : 0);
      x += pxPerBar
    ) {
      g.strokeStyle = '#283148'
      g.beginPath()
      g.moveTo(x + 0.5, 22)
      g.lineTo(x + 0.5, height)
      g.stroke()
    }

    // Markers (vertical colored guide lines through timeline)
    const mk = safeMarkers(p.markers)
    mk.forEach(m => {
      const x = LABEL_W + m.t * p.zoomX - p.scrollX
      g.strokeStyle = m.color || '#ffd36b'
      g.beginPath()
      g.moveTo(x + 0.5, 0)
      g.lineTo(x + 0.5, height)
      g.stroke()
    })

    // visualize effect notes helper
    function drawLedNoteBody(
      ctx:CanvasRenderingContext2D,
      note:Note & any,
      x:number,
      y:number,
      w:number,
      h:number
    ){
      const et = note.effectType ?? 0
      const vel = note.velocity ?? 100
      const pct = Math.round((vel/127)*100)

      // We'll pick base hue color for backgrounds
      const baseHueIdx = note.hueIndex ?? 0
      // fallback saturation full – your Saturation CC2 is 127 in export
      // we just colorFromHueIndex(...) for UI
      const baseCol = colorFromHueIndex(baseHueIdx, p.proj.paletteMode)

      if (et === 0 /* STATIC */){
        ctx.fillStyle = baseCol
        ctx.fillRect(x,y,w,h)
        labelNote(ctx, x,y,w,h, `STATIC ${pct}%`)
        return
      }

      if (et === 1 /* STROBE */){
        ctx.fillStyle = baseCol
        ctx.fillRect(x,y,w,h)

        // strobe pattern overlay
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        for(let xx=x; xx<x+w; xx+=6){
          ctx.fillRect(xx,y,3,h)
        }
        const spd = note.fxSpeed ?? 0
        labelNote(ctx, x,y,w,h, `STROBE spd${spd} ${pct}%`)
        return
      }

      if (et === 2 /* FADE */){
        // Build gradient depending on fadeMode
        const mode = note.fadeMode || 'in'
        const grad = ctx.createLinearGradient(x, y, x+w, y)
        if (mode==='in'){
          grad.addColorStop(0,'#000')
          grad.addColorStop(1, baseCol)
        } else if (mode==='out'){
          grad.addColorStop(0, baseCol)
          grad.addColorStop(1, '#000')
        } else {
          // inout => dark -> color -> dark
          grad.addColorStop(0,'#000')
          grad.addColorStop(0.5, baseCol)
          grad.addColorStop(1,'#000')
        }
        ctx.fillStyle = grad
        ctx.fillRect(x,y,w,h)

        const len = note.fadeLen ?? 0
        const modeLabel = mode==='in'?'in':'out' && mode==='inout'?'in↔out':mode
        labelNote(ctx, x,y,w,h, `FADE ${modeLabel} len${len} ${pct}%`)
        return
      }

      if (et === 3 /* CHASE */){
        const hues: number[] = Array.isArray(note.chaseHues)&&note.chaseHues.length>0
          ? note.chaseHues
          : [baseHueIdx]
        const segW = w / hues.length
        for (let i=0;i<hues.length;i++){
          ctx.fillStyle = colorFromHueIndex(hues[i], p.proj.paletteMode)
          ctx.fillRect(x + i*segW, y, segW, h)
        }
        const spd = note.fxSpeed ?? 0
        labelNote(ctx, x,y,w,h, `CHASE spd${spd} ${pct}%`)
        return
      }

      if (et === 4 /* RAINBOW */){
        const grad = ctx.createLinearGradient(x,y,x+w,y)
        grad.addColorStop(0,   'red')
        grad.addColorStop(0.2, 'orange')
        grad.addColorStop(0.4, 'yellow')
        grad.addColorStop(0.6, 'green')
        grad.addColorStop(0.8, 'blue')
        grad.addColorStop(1.0, 'purple')
        ctx.fillStyle = grad
        ctx.fillRect(x,y,w,h)

        const spd = note.fxSpeed ?? 0
        labelNote(ctx, x,y,w,h, `RAINBOW spd${spd} ${pct}%`)
        return
      }

      // fallback
      ctx.fillStyle = baseCol
      ctx.fillRect(x,y,w,h)
      labelNote(ctx, x,y,w,h, `${pct}%`)
    }

    function labelNote(
      ctx:CanvasRenderingContext2D,
      x:number,y:number,w:number,h:number,
      text:string
    ){
      ctx.font = '10px system-ui'
      ctx.fillStyle = '#fff'
      ctx.textBaseline='top'
      ctx.shadowColor='rgba(0,0,0,.8)'
      ctx.shadowBlur=4
      ctx.fillText(text, x+4, y+2)
      ctx.shadowBlur=0
    }

    // Draw LED + pump notes
    const pumpBaseY = 30
    const ledBaseY  = p.proj.showPumps ? 30 + PUMP_LANES*(laneH+GAP) : 30

    const visualOffsetSec = p.proj.applyVisualOffset
      ? (p.proj.midiOffsetMs ?? 0)/1000
      : 0

    // draw pump notes
    if (p.proj.showPumps) {
      p.proj.pumpNotes.forEach((n, idx) => {
        const x0 = LABEL_W + (n.t0 + visualOffsetSec)*p.zoomX - p.scrollX
        const w0 = Math.max(2, (n.t1 - n.t0)*p.zoomX)
        const y0 = pumpBaseY + n.lane*(laneH+GAP)

        const sel = selection.includes(idx) // pump keys are raw idx
        // pumps = cyan block + brightness shading
        const vel = n.velocity ?? 100
        const pct = Math.round((vel/127)*100)

        g.fillStyle = 'rgb(123 220 255)'
        g.fillRect(x0,y0,w0,laneH)

        // dark overlay to indicate velocity
        g.globalAlpha = 0.35
        g.fillStyle = '#000'
        const dark = (1 - vel/127)*w0
        g.fillRect(x0 + w0 - dark, y0, dark, laneH)
        g.globalAlpha = 1

        // small label
        labelNote(g,x0,y0,w0,laneH,`PUMP ${pct}%`)

        if (sel){
          g.strokeStyle = '#7bdcff'
          g.lineWidth = 2
          g.strokeRect(x0+0.5,y0+0.5,w0-1,laneH-1)
          g.lineWidth = 1
        }
      })
    }

    // draw LED notes w/ FX visual
    if (p.proj.showLED) {
      p.proj.ledNotes.forEach((n, idx) => {
        const x0 = LABEL_W + (n.t0 + visualOffsetSec)*p.zoomX - p.scrollX
        const w0 = Math.max(2, (n.t1 - n.t0)*p.zoomX)
        const y0 = ledBaseY + n.lane*(laneH+GAP)

        drawLedNoteBody(g, n as any, x0,y0,w0,laneH)

        // selection stroke
        const key = 10000+idx
        const sel = selection.includes(key)
        if (sel){
          g.strokeStyle='#7bdcff'
          g.lineWidth=2
          g.strokeRect(x0+0.5,y0+0.5,w0-1,laneH-1)
          g.lineWidth=1
        }
      })
    }

    // playhead line
    const phx = LABEL_W + p.playhead * p.zoomX - p.scrollX
    g.strokeStyle = '#ffd36b'
    g.beginPath()
    g.moveTo(phx + 0.5, 0)
    g.lineTo(phx + 0.5, height)
    g.stroke()

    // right-side labels overlay if enabled
    if (p.rightLabels) {
      const rc = rightRef.current!
      const rg = rc.getContext('2d')!
      rc.width = LABEL_W
      rc.height = height
      rg.clearRect(0,0,rc.width,rc.height)

      rg.fillStyle = '#0e131f'
      rg.fillRect(0,0,rc.width,rc.height)
      rg.font = '12px system-ui'
      rg.textBaseline='middle'
      rg.fillStyle = '#9fb0cc'
      rg.textAlign='left'

      let yy = 30
      if (p.proj.showPumps){
        for (let i=0;i<PUMP_LANES;i++){
          rg.fillText(`Pump ${i+1}`,10,yy+laneH/2)
          yy += laneH+GAP
        }
      }
      if (p.proj.showLED){
        for (let i=0;i<LED_LANES;i++){
          rg.fillText(`LED ${i+1}`,10,yy+laneH/2)
          yy += laneH+GAP
        }
      }
      rc.style.pointerEvents='none'
    }
  }

  useEffect(() => {
    draw()
  }, [
    p.proj,
    p.zoomX,
    p.zoomY,
    p.scrollX,
    p.playhead,
    p.rightLabels,
    p.bpm,
    p.ts,
    selection,
    p.proj.paletteMode,
    p.proj.applyVisualOffset,
    p.proj.midiOffsetMs,
    p.markers
  ])

  // -------------------------------------------------------
  // helpers for coordinate -> time/lane
  // -------------------------------------------------------
  function xyToTimeLane(clientX:number, clientY:number){
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const t = Math.max(0, (x - LABEL_W + p.scrollX)/p.zoomX)

    const laneAbs = Math.floor((y - 30)/(p.zoomY + GAP))
    let kind:'pump'|'led'='pump'
    let lane = laneAbs
    if (!p.proj.showPumps) {
      kind='led'
      lane=laneAbs
    } else if (p.proj.showPumps && p.proj.showLED && laneAbs >= PUMP_LANES){
      kind='led'
      lane=laneAbs-PUMP_LANES
    }
    return { t, lane, kind, xCanvas:x, yCanvas:y }
  }

  function laneFromYInDomain(yCanvas:number, domain:'pump'|'led'){
    const laneAbs = Math.floor((yCanvas - 30)/(p.zoomY+GAP))
    if (domain==='pump'){
      if (!p.proj.showPumps) return 0
      return clamp(laneAbs,0,PUMP_LANES-1)
    } else {
      const ledTop = p.proj.showPumps
        ? 30 + PUMP_LANES*(p.zoomY+GAP)
        : 30
      const ledAbs = Math.floor((yCanvas - ledTop)/(p.zoomY+GAP))
      return clamp(ledAbs,0,LED_LANES-1)
    }
  }

  // hit test of a note, and whether near right edge
  function hitTestNote(tSnap:number, lane:number, kind:'pump'|'led', xCanvas:number){
    const list = kind==='pump' ? p.proj.pumpNotes : p.proj.ledNotes
    // find note with lane match and cursor time inside [t0..t1]
    let foundIdx=-1
    for (let i=0;i<list.length;i++){
      const n = list[i]
      if (n.lane!==lane) continue
      if (tSnap>=n.t0 && tSnap<=n.t1){
        foundIdx=i
        break
      }
    }
    if (foundIdx<0) return {hitIdx:-1, edge:false}

    const n = list[foundIdx]
    const x0 = LABEL_W + n.t0*p.zoomX - p.scrollX
    const x1 = LABEL_W + n.t1*p.zoomX - p.scrollX
    const edgeZone = (x1 - RESIZE_ZONE_PX)
    const edge = xCanvas>=edgeZone && xCanvas<=x1
    return {hitIdx:foundIdx, edge}
  }

  // -------------------------------------------------------
  // mouse handlers
  // -------------------------------------------------------
  function onMouseDown(e:React.MouseEvent){
    // left click = selection/place/drag
    // right click = custom context menu
    if (e.button===2){
      // context menu open at cursor for current selection
      e.preventDefault()
      e.stopPropagation()

      // open only if we HAVE selection of at least 1 LED note
      const anyLedSelected = selection.some(key => key>=10000)
      if (anyLedSelected){
        setCtxOpen(true)
        setCtxPos({x:e.clientX,y:e.clientY})

        // initialize RMB draft state from first selected LED note
        let firstLedIdx = selection.find(k=>k>=10000)
        if (firstLedIdx!=null){
          const idx = firstLedIdx-10000
          const n:any = p.proj.ledNotes[idx]
          if (n){
            setCtxFxType(n.effectType ?? 0)
            setCtxBrightness(n.velocity ?? 96)
            setCtxSpeed(n.fxSpeed ?? 32)
            setCtxFadeMode(n.fadeMode || 'in')
            setCtxFadeLen(n.fadeLen ?? 20)
            setCtxChaseHues(
              Array.isArray(n.chaseHues)&&n.chaseHues.length>0
              ? n.chaseHues.slice(0,4)
              : [ n.hueIndex ?? 0 ]
            )
          }
        }
      } else {
        // if no LED note selected, don't open
        setCtxOpen(false)
      }
      return
    }

    // left click / normal
    const {t,lane,kind,xCanvas,yCanvas} = xyToTimeLane(e.clientX,e.clientY)
    if (yCanvas<30) return

    const tSnap = snapToNearestQuarterOrEighth(
      t,
      p.bpm,
      p.ts
    )

    setLastPointerTime(t)

    const {hitIdx,edge} = hitTestNote(tSnap,lane,kind,xCanvas)

    // Cmd/Ctrl+click => erase
    if ((e.metaKey || e.ctrlKey) && hitIdx>=0){
      projectMut(pr=>{
        const arr = kind==='pump'?pr.pumpNotes:pr.ledNotes
        arr.splice(hitIdx,1)
      })
      return
    }

    // Shift+click => toggle selection (without recoloring anything)
    if (e.shiftKey && hitIdx>=0){
      const key=(kind==='pump'?0:10000)+hitIdx
      setSelection(sel=>(
        sel.includes(key)
          ? sel.filter(k=>k!==key)
          : [...sel,key]
      ))
      return
    }

    // If click hits note:
    if (hitIdx>=0){
      const key=(kind==='pump'?0:10000)+hitIdx
      const clickedIsSelected = selection.includes(key)

      // check if we are in resize zone:
      if (edge){
        // start RESIZE of single note even if multiple are selected
        const list = (kind==='pump'?p.proj.pumpNotes:p.proj.ledNotes)
        const n = list[hitIdx]
        dragState.current = {
          mode:'resize',
          startX:xCanvas,
          startY:yCanvas,
          noteKind:kind,
          noteIdx:hitIdx,
          origT0:n.t0,
          origT1:n.t1,
        }
        // ensure selection is that single note (makes sense in many DAWs)
        setSelection([key])
        return
      }

      // else: MOVE
      if (clickedIsSelected && selection.length>1){
        // group move
        const pumpIdxs:number[]=[]
        const ledIdxs:number[]=[]
        selection.forEach(k=>{
          if (k>=10000) ledIdxs.push(k-10000)
          else pumpIdxs.push(k)
        })

        const anchorOrigT0 = (
          kind==='pump'
            ? p.proj.pumpNotes[hitIdx]?.t0
            : p.proj.ledNotes[hitIdx]?.t0
        ) ?? tSnap

        const anchorOrigLane = (
          kind==='pump'
            ? p.proj.pumpNotes[hitIdx]?.lane
            : p.proj.ledNotes[hitIdx]?.lane
        ) ?? lane

        const origT0Pump = pumpIdxs.map(i=>p.proj.pumpNotes[i].t0)
        const origT0Led  = ledIdxs.map(i=>p.proj.ledNotes[i].t0)
        const origLanePump = pumpIdxs.map(i=>p.proj.pumpNotes[i].lane)
        const origLaneLed  = ledIdxs.map(i=>p.proj.ledNotes[i].lane)

        dragState.current={
          mode:'move',
          startX:xCanvas,
          startY:yCanvas,
          group:{
            anchorKind:kind,
            anchorIdx:hitIdx,
            anchorOrigT0,
            anchorOrigLane,
            pumpIdxs,
            ledIdxs,
            origT0Pump,
            origT0Led,
            origLanePump,
            origLaneLed,
          }
        }
        return
      }

      // single-note move
      setSelection([key])
      const list = kind==='pump'?p.proj.pumpNotes:p.proj.ledNotes
      const n = list[hitIdx]
      dragState.current = {
        mode:'move',
        startX:xCanvas,
        startY:yCanvas,
        noteKind:kind,
        noteIdx:hitIdx,
        origT0:n.t0,
        origLane:n.lane,
      }
      return
    }

    // empty space => maybePlace (click) or marquee (drag)
    dragState.current={
      mode:'maybePlace',
      startX:xCanvas,
      startY:yCanvas,
      laneAtDown:lane,
      tSnapAtDown:tSnap,
      kindAtDown:kind,
    }
    // if tool is select, clear selection now
    if ((p.proj as any).tool==='select'){
      setSelection([])
    }
  }

  function onMouseMove(e:React.MouseEvent){
    const ds=dragState.current
    if(!ds) return

    const {t,lane,kind,xCanvas,yCanvas} = xyToTimeLane(e.clientX,e.clientY)
    setLastPointerTime(t)

    // "maybePlace" can become marquee
    if(ds.mode==='maybePlace'){
      const dx=Math.abs(xCanvas-ds.startX)
      const dy=Math.abs(yCanvas-ds.startY)
      const THRESH=4
      if(dx>=THRESH || dy>=THRESH){
        dragState.current={
          mode:'marquee',
          startX:ds.startX,
          startY:ds.startY,
        }
        setMarquee({
          x0:ds.startX,
          y0:ds.startY,
          x1:xCanvas,
          y1:yCanvas
        })
      }
      return
    }

    // marquee update => update selection box + what's inside
    if(ds.mode==='marquee'){
      setMarquee(m=>(m?{...m,x1:xCanvas,y1:yCanvas}:null))

      const visualOffsetSec = p.proj.applyVisualOffset
        ? (p.proj.midiOffsetMs ?? 0)/1000
        : 0

      const x0px=Math.min(ds.startX,xCanvas)
      const x1px=Math.max(ds.startX,xCanvas)
      const y0px=Math.min(ds.startY,yCanvas)
      const y1px=Math.max(ds.startY,yCanvas)

      const tSel0=Math.max(0,(x0px - LABEL_W + p.scrollX)/p.zoomX - visualOffsetSec)
      const tSel1=Math.max(0,(x1px - LABEL_W + p.scrollX)/p.zoomX - visualOffsetSec)

      const pumpTop=30
      const ledTop = p.proj.showPumps
        ? 30+PUMP_LANES*(p.zoomY+GAP)
        : 30

      const inLaneBand=(yy0:number,yy1:number,laneIndex:number,topStart:number)=>{
        const top=topStart+laneIndex*(p.zoomY+GAP)
        const bottom=top+p.zoomY
        return !(yy1<top || yy0>bottom)
      }

      const pumpLaneSet=new Set<number>()
      const ledLaneSet=new Set<number>()
      if(p.proj.showPumps){
        for(let L=0;L<PUMP_LANES;L++){
          if(inLaneBand(y0px,y1px,L,pumpTop)) pumpLaneSet.add(L)
        }
      }
      if(p.proj.showLED){
        for(let L=0;L<LED_LANES;L++){
          if(inLaneBand(y0px,y1px,L,ledTop)) ledLaneSet.add(L)
        }
      }

      const sel:number[]=[]
      function scan(arr:Note[],base:number,laneSet:Set<number>){
        for(let idx=0;idx<arr.length;idx++){
          const n=arr[idx]
          if(!laneSet.has(n.lane)) continue
          if(n.t1>tSel0 && n.t0<tSel1){
            sel.push(base+idx)
          }
        }
      }
      if(p.proj.showPumps) scan(p.proj.pumpNotes,0,pumpLaneSet)
      if(p.proj.showLED) scan(p.proj.ledNotes,10000,ledLaneSet)

      setSelection(sel)
      return
    }

    // group MOVE (multiple selection)
    if(ds.mode==='move' && ds.group){
      const g=ds.group
      const snapped = p.proj.snapWhileDrag
        ? snapToNearestQuarterOrEighth(t,p.bpm,p.ts)
        : t
      const dt = Math.max(-g.anchorOrigT0, snapped - g.anchorOrigT0)

      const anchorLaneNow = laneFromYInDomain(yCanvas,g.anchorKind)
      const vShift = anchorLaneNow - g.anchorOrigLane

      projectMut(pr=>{
        // pumps
        g.pumpIdxs.forEach((idx,i)=>{
          const n=pr.pumpNotes[idx]
          const len=n.t1-n.t0
          const newT0=Math.max(0,g.origT0Pump[i]+dt)
          const newLane=clamp(g.origLanePump[i]+vShift,0,PUMP_LANES-1)
          n.t0=newT0
          n.t1=newT0+len
          n.lane=newLane
        })
        // leds
        g.ledIdxs.forEach((idx,i)=>{
          const n=pr.ledNotes[idx]
          const len=n.t1-n.t0
          const newT0=Math.max(0,g.origT0Led[i]+dt)
          const newLane=clamp(g.origLaneLed[i]+vShift,0,LED_LANES-1)
          n.t0=newT0
          n.t1=newT0+len
          n.lane=newLane
        })
      })
      return
    }

    // single note MOVE
    if(ds.mode==='move' && ds.noteKind && typeof ds.noteIdx==='number'){
      const arr = ds.noteKind==='pump' ? p.proj.pumpNotes : p.proj.ledNotes
      const orig = arr[ds.noteIdx]
      if(!orig) return
      const snapped = p.proj.snapWhileDrag
        ? snapToNearestQuarterOrEighth(t,p.bpm,p.ts)
        : t
      const dt = snapped - (ds.origT0 ?? orig.t0)
      const newT0 = Math.max(0,(ds.origT0 ?? orig.t0)+dt)
      const len = orig.t1-orig.t0
      const newLane = ds.noteKind==='pump'
        ? clamp(lane,0,PUMP_LANES-1)
        : clamp(lane,0,LED_LANES-1)

      projectMut(pr=>{
        const a = ds.noteKind==='pump'?pr.pumpNotes:pr.ledNotes
        // basic collision check: not overlapping same-lane?
        if(a.some((n,i)=>i!==ds.noteIdx &&
          n.lane===newLane &&
          !(newT0+len<=n.t0 || newT0>=n.t1)
        )){
          return
        }
        a[ds.noteIdx] = {
          ...a[ds.noteIdx]!,
          t0:newT0,
          t1:newT0+len,
          lane:newLane
        }
      })
      return
    }

    // RESIZE tail drag
    if(ds.mode==='resize' && ds.noteKind && typeof ds.noteIdx==='number'){
      const arr = ds.noteKind==='pump' ? p.proj.pumpNotes : p.proj.ledNotes
      const orig = arr[ds.noteIdx]
      if(!orig) return
      const snapped = p.proj.snapWhileDrag
        ? snapToNearestQuarterOrEighth(t,p.bpm,p.ts)
        : t

      // keep start same; only move end, but never before t0 + tiny min
      const minLen = 0.05 // ~50ms
      const newT1 = Math.max(
        (ds.origT0 ?? orig.t0)+minLen,
        snapped
      )
      projectMut(pr=>{
        const a = ds.noteKind==='pump'?pr.pumpNotes:pr.ledNotes
        const nn = a[ds.noteIdx]!
        a[ds.noteIdx] = {
          ...nn,
          t0: (ds.origT0 ?? nn.t0),
          t1: newT1
        }
      })
      return
    }
  }

  function onMouseUp(){
    const ds=dragState.current
    if(ds && ds.mode==='maybePlace'){
      // we treat that as click, so if tool==='draw' -> place note
      const kindAtDown=ds.kindAtDown
      const laneDown=ds.laneAtDown
      const tSnapDown=ds.tSnapAtDown
      if((p.proj as any).tool==='draw' && kindAtDown!=null && laneDown!=null && tSnapDown!=null){
        const list = kindAtDown==='pump' ? p.proj.pumpNotes : p.proj.ledNotes
        const len = quarterLength(p.bpm) // default length = quarter note
        const t1 = tSnapDown+len

        const overlap = list.some((n)=>(
          n.lane===laneDown && !(t1<=n.t0 || tSnapDown>=n.t1)
        ))
        if(!overlap){
          const newNote: any = {
            lane:laneDown,
            t0:tSnapDown,
            t1,
            velocity:p.velocity
          }
          if(kindAtDown==='led'){
            newNote.hueIndex  = p.hueIndex
            newNote.effectType= p.effectType ?? 0
          }

          projectMut(pr=>{
            const arr = kindAtDown==='pump'?pr.pumpNotes:pr.ledNotes
            arr.push(newNote)
          })
        }
      }
    }
    dragState.current=null
    setMarquee(null)
  }

  // prevent default browser menu so ours shows
  function onContextMenu(e:React.MouseEvent){
    e.preventDefault()
  }

  // -------------------------------------------------------
  // RMB MENU LOGIC
  // -------------------------------------------------------
  // apply entire ctx state to all selected LED notes
  function applyCtxToSelection(){
    if(selection.length===0) return
    projectMut(pr=>{
      selection.forEach(key=>{
        if(key<10000) return // pumps skip
        const idx=key-10000
        const n:any = pr.ledNotes[idx]
        if(!n) return
        n.effectType = ctxFxType
        n.velocity   = ctxBrightness
        // speed-like param
        n.fxSpeed    = ctxSpeed

        if(ctxFxType===2 /* Fade */){
          n.fadeMode = ctxFadeMode
          n.fadeLen  = ctxFadeLen
        }
        if(ctxFxType===3 /* Chase */){
          n.chaseHues = ctxChaseHues.slice(0,4)
        }
        // rainbow uses fxSpeed only
      })
    })
    setCtxOpen(false)
  }

  // instant color apply on swatch click
  function applyColorToSelection(hIdx:number){
    projectMut(pr=>{
      selection.forEach(key=>{
        if(key<10000) return
        const idx=key-10000
        const n:any=pr.ledNotes[idx]
        if(!n)return
        n.hueIndex=hIdx
        // if chase is active, maybe update chase color that's currently being edited:
        if(ctxFxType===3 /* chase */ && chaseHuePopupIdx!=null){
          const arr = Array.isArray(n.chaseHues)?n.chaseHues.slice():[]
          while(arr.length<=chaseHuePopupIdx) arr.push(hIdx)
          arr[chaseHuePopupIdx]=hIdx
          n.chaseHues=arr
        }
      })
    })
    // after color pick we can close the mini popup for chase
    setChaseHuePopupIdx(null)
  }

  // global listener to close context menu if you click elsewhere
  useEffect(()=>{
    const onWinClick=()=>{
      setCtxOpen(false)
      setChaseHuePopupIdx(null)
    }
    const onEsc=(ev:KeyboardEvent)=>{
      if(ev.key==='Escape'){
        setCtxOpen(false)
        setChaseHuePopupIdx(null)
      }
    }
    window.addEventListener('click',onWinClick)
    window.addEventListener('keydown',onEsc)
    return()=>{
      window.removeEventListener('click',onWinClick)
      window.removeEventListener('keydown',onEsc)
    }
  },[])

  // pretty label for fade mode in menu
  function fadeModeLabel(m:'in'|'out'|'inout'){
    if(m==='in') return 'Fade In'
    if(m==='out') return 'Fade Out'
    return 'In-Out'
  }

  const brightnessPct = Math.round((ctxBrightness/127)*100)

  // RMB sub-UI for chase hues
  function renderChaseHueEditor(){
    return (
      <div className="ctxRow" style={{position:'relative'}}>
        <div className="ctxLabel">Chase Colors</div>
        <div style={{display:'flex',gap:'.4rem',flexWrap:'wrap'}}>
          {ctxChaseHues.map((h,idx)=>(
            <div key={idx} style={{position:'relative'}}>
              <div
                className="ctxSwatch"
                style={{
                  width:24,height:24,
                  borderRadius:6,
                  background: colorFromHueIndex(h, p.proj.paletteMode),
                  cursor:'pointer',
                  border:'1px solid #2b3042'
                }}
                onClick={(ev)=>{
                  ev.stopPropagation()
                  // open mini palette popup for this index
                  setChaseHuePopupIdx(idx)
                }}
                title={`Chase col ${idx+1}`}
              />
              {chaseHuePopupIdx===idx && (
                <div
                  style={{
                    position:'absolute',
                    top:'28px',
                    left:0,
                    background:'#1a1f2e',
                    border:'1px solid #2b3042',
                    borderRadius:'8px',
                    padding:'.4rem',
                    display:'flex',
                    flexWrap:'wrap',
                    gap:'.4rem',
                    zIndex:99999
                  }}
                  onClick={ev=>ev.stopPropagation()}
                >
                  {paletteColors.map(hh=>(
                    <div
                      key={hh}
                      className="ctxSwatch"
                      style={{
                        width:20,height:20,
                        background:colorFromHueIndex(hh,p.proj.paletteMode),
                        border:'1px solid #2b3042',
                        borderRadius:'4px',
                        cursor:'pointer'
                      }}
                      onClick={(ev)=>{
                        ev.stopPropagation()
                        // set that color in local draft immediately
                        setCtxChaseHues(old=>{
                          const cp=old.slice()
                          while(cp.length<=idx) cp.push(hh)
                          cp[idx]=hh
                          return cp
                        })
                        // also apply instantly to selection
                        applyColorToSelection(hh)
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          {/* add extra color slot button if <4 colors */}
          {ctxChaseHues.length<4 && (
            <button
              className="btn"
              style={{fontSize:'.7rem',padding:'.3rem .5rem'}}
              onClick={(ev)=>{
                ev.stopPropagation()
                setCtxChaseHues(old=>[...old,0])
                setChaseHuePopupIdx(ctxChaseHues.length) // open palette for new slot
              }}
            >
              + Color
            </button>
          )}
        </div>
      </div>
    )
  }

  // Context menu JSX
  const ctxMenu = !ctxOpen ? null : (
    <div
      className="ctxMenu"
      style={{
        position:'fixed',
        left:ctxPos.x,
        top:ctxPos.y,
      }}
      onClick={ev=>ev.stopPropagation()} // don't bubble to window click-closer
    >
      {/* Color row */}
      <div className="ctxRow">
        <div className="ctxLabel">Set Color</div>
        <div className="ctxSwatchWrap">
          {paletteColors.map(h=>(
            <div
              key={h}
              className="ctxSwatch"
              style={{
                background:colorFromHueIndex(h,p.proj.paletteMode),
                width:20,
                height:20,
                borderRadius:'6px',
                border:'1px solid #2b3042',
                cursor:'pointer'
              }}
              onClick={ev=>{
                ev.stopPropagation()
                applyColorToSelection(h)
              }}
            />
          ))}
        </div>
      </div>

      {/* FX type selector */}
      <div className="ctxRow">
        <div className="ctxLabel">FX Type</div>
        <div className="ctxFxList">
          {[0,1,2,3,4].map(ft=>(
            <div
              key={ft}
              className="ctxFxBtn"
              style={{
                background: ft===ctxFxType?'#2a354f':'#0f1422',
                borderColor: ft===ctxFxType?'#46527a':'#2b3042'
              }}
              onClick={ev=>{
                ev.stopPropagation()
                setCtxFxType(ft)
              }}
            >
              {ft===0?'Static':
               ft===1?'Strobe':
               ft===2?'Fade':
               ft===3?'Chase':
               ft===4?'Rainbow':'?'}
            </div>
          ))}
        </div>
      </div>

      {/* Brightness */}
      <div className="ctxRow">
        <div className="ctxLabel">Brightness</div>
        <div className="ctxSliderRow">
          <input
            type="range"
            min={1}
            max={127}
            value={ctxBrightness}
            onChange={e=>setCtxBrightness(+e.target.value)}
          />
          <div className="valBubble">{brightnessPct}%</div>
        </div>
      </div>

      {/* FX-specific params */}
      {ctxFxType===1 && (
        <div className="ctxRow">
          <div className="ctxLabel">Strobe Speed</div>
          <div className="ctxSliderRow">
            <input
              type="range"
              min={0}
              max={127}
              value={ctxSpeed}
              onChange={e=>setCtxSpeed(+e.target.value)}
            />
            <div className="valBubble">{ctxSpeed}</div>
          </div>
          <div className="muted" style={{fontSize:'.7rem'}}>Higher = faster flash</div>
        </div>
      )}

      {ctxFxType===2 && (
        <div className="ctxRow">
          <div className="ctxLabel">Fade Mode</div>
          <select
            className="btn"
            style={{fontSize:'.7rem',padding:'.3rem .4rem'}}
            value={ctxFadeMode}
            onChange={e=>setCtxFadeMode(e.target.value as any)}
          >
            <option value="in">Fade In</option>
            <option value="out">Fade Out</option>
            <option value="inout">In-Out</option>
          </select>

          <div className="ctxLabel" style={{marginTop:'.5rem'}}>Fade Length</div>
          <div className="ctxSliderRow">
            <input
              type="range"
              min={0}
              max={63}
              value={ctxFadeLen}
              onChange={e=>setCtxFadeLen(+e.target.value)}
            />
            <div className="valBubble">{ctxFadeLen}</div>
          </div>
          <div className="muted" style={{fontSize:'.7rem'}}>Bigger = slower/longer fade</div>
        </div>
      )}

      {ctxFxType===3 && (
        <>
          {renderChaseHueEditor()}

          <div className="ctxRow">
            <div className="ctxLabel">Chase Speed</div>
            <div className="ctxSliderRow">
              <input
                type="range"
                min={0}
                max={127}
                value={ctxSpeed}
                onChange={e=>setCtxSpeed(+e.target.value)}
              />
              <div className="valBubble">{ctxSpeed}</div>
            </div>
            <div className="muted" style={{fontSize:'.7rem'}}>Higher = faster rotation</div>
          </div>
        </>
      )}

      {ctxFxType===4 && (
        <div className="ctxRow">
          <div className="ctxLabel">Rainbow Speed</div>
          <div className="ctxSliderRow">
            <input
              type="range"
              min={0}
              max={127}
              value={ctxSpeed}
              onChange={e=>setCtxSpeed(+e.target.value)}
            />
            <div className="valBubble">{ctxSpeed}</div>
          </div>
          <div className="muted" style={{fontSize:'.7rem'}}>Higher = faster swirl</div>
        </div>
      )}

      <div className="ctxRow">
        <div
          className="ctxApplyBtn"
          onClick={ev=>{
            ev.stopPropagation()
            applyCtxToSelection()
          }}
        >
          Apply to Selection
        </div>
      </div>
    </div>
  )

  return (
    <div
      style={{ position:'relative' }}
      onContextMenu={onContextMenu}
    >
      <canvas
        ref={canvasRef}
        width={width + LABEL_W + (p.rightLabels ? LABEL_W : 0)}
        height={height}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{cursor: (p.proj as any).tool==='erase'?'crosshair':'default'}}
      />
      {p.rightLabels && (
        <canvas
          ref={rightRef}
          className="rightLabelsOverlay"
          width={LABEL_W}
          height={height}
          style={{ pointerEvents:'none' }}
        />
      )}
      {marquee && (
        <div
          style={{
            position:'absolute',
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
            border:'1px dashed #7bdcff',
            background:'rgba(123,220,255,0.1)',
            pointerEvents:'none'
          }}
        />
      )}
      {ctxMenu}
    </div>
  )
}
