// src/ui/MidiRuler.tsx
import React, { useEffect, useRef } from 'react'
import { snapToNearestQuarterOrEighth, secPerBeat } from '../util/time'

type Props = {
  width: number
  zoom: number
  scrollX: number
  bpm: number
  ts: [number,number]

  playhead: number
  midiOffsetSec: number
  onSeek: (sec:number)=>void

  // nieuw:
  setPlayhead: (sec:number)=>void
  playheadSnap: boolean
}

export const MidiRuler: React.FC<Props> = ({
  width,
  zoom,
  scrollX,
  bpm,
  ts,
  playhead,
  midiOffsetSec,
  onSeek,
  setPlayhead,
  playheadSnap
}) => {
  const ref = useRef<HTMLCanvasElement>(null)
  const H = 22

  useEffect(()=>{
    const c = ref.current
    if(!c) return
    const g = c.getContext('2d')!
    c.width = width
    c.height = H

    g.fillStyle='#0f1422'
    g.fillRect(0,0,width,H)

    // maat/beat marks
    const [num, den] = ts
    const beatsPerBar = num * (4/den)
    const spb = secPerBeat(bpm)          // sec per beat
    const secPerBar = spb * beatsPerBar  // sec per bar
    const pxPerBar = secPerBar * zoom
    const pxPerBeat = spb * zoom

    // offset ivm midiOffsetSec
    const offsetPx = midiOffsetSec * zoom

    // bar ticks
    g.font='10px system-ui'
    g.textAlign='left'
    g.textBaseline='top'

    // teken elk begin van een maat
    for(
      let x = -((scrollX - offsetPx) % pxPerBar);
      x < width;
      x += pxPerBar
    ){
      const barStartSec = ((x+scrollX-offsetPx)/zoom)
      if(barStartSec<0) continue

      // verticale streep
      g.strokeStyle='#283148'
      g.beginPath()
      g.moveTo(x+0.5,0)
      g.lineTo(x+0.5,H)
      g.stroke()

      // label maatnummer ruw (bar number = floor(barStartSec / secPerBar)+1)
      const barNum = Math.floor(barStartSec/secPerBar)+1
      g.fillStyle='#9fb0cc'
      g.fillText(`Bar ${barNum}`, x+2, 2)
    }

    // beat ticks
    for(
      let x = -((scrollX - offsetPx) % pxPerBeat);
      x < width;
      x += pxPerBeat
    ){
      const beatSec = ((x+scrollX-offsetPx)/zoom)
      if(beatSec<0) continue

      g.strokeStyle='#1a2132'
      g.beginPath()
      g.moveTo(x+0.5,H-8)
      g.lineTo(x+0.5,H)
      g.stroke()
    }

    // playhead
    const phx = playhead*zoom - scrollX
    g.strokeStyle='#ffd36b'
    g.beginPath()
    g.moveTo(phx+0.5,0)
    g.lineTo(phx+0.5,H)
    g.stroke()
  },[width,zoom,scrollX,bpm,ts,playhead,midiOffsetSec])

  function handleClick(e:React.MouseEvent){
    const rect = ref.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    // terugrekenen naar seconden absolute
    const rawSec = (x + scrollX)/zoom
    const finalSec = playheadSnap
      ? snapToNearestQuarterOrEighth(rawSec, bpm, ts)
      : rawSec

    setPlayhead(finalSec)
    onSeek(finalSec)
  }

  return (
    <canvas
      ref={ref}
      width={width}
      height={H}
      style={{ display:'block', cursor:'default', background:'#0f1422' }}
      onMouseDown={handleClick}
    />
  )
}
