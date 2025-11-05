// src/ui/Ruler.tsx
import React, { useEffect, useRef } from 'react'
import { snapToNearestQuarterOrEighth } from '../util/time'

type Props = {
  width: number
  zoom: number
  scrollX: number
  playhead: number
  onSeek: (sec:number)=>void

  // nieuw:
  setPlayhead: (sec:number)=>void
  playheadSnap: boolean

  bpm: number
  ts: [number,number]
}

export const Ruler: React.FC<Props> = ({
  width,
  zoom,
  scrollX,
  playhead,
  onSeek,
  setPlayhead,
  playheadSnap,
  bpm,
  ts,
}) => {
  const ref = useRef<HTMLCanvasElement>(null)
  const H = 22

  useEffect(()=>{
    const c = ref.current
    if(!c) return
    const g = c.getContext('2d')!
    c.width = width
    c.height = H

    g.fillStyle = '#141a29'
    g.fillRect(0,0,width,H)

    g.strokeStyle = '#2a3550'
    g.beginPath()
    g.moveTo(0,H-0.5)
    g.lineTo(width,H-0.5)
    g.stroke()

    // bar ticks / second ticks (simple for now)
    g.fillStyle = '#9fb0cc'
    g.font = '10px system-ui'
    g.textBaseline = 'top'
    g.textAlign = 'center'

    // we gaan elke "hele seconde" even neerzetten
    const pxPerSec = zoom
    const startSec = Math.max(0, scrollX/pxPerSec)
    const endSec = startSec + width/pxPerSec
    for(let s=Math.floor(startSec); s<endSec; s++){
      const x = (s*pxPerSec) - scrollX
      // tick
      g.strokeStyle = '#4a567a'
      g.beginPath()
      g.moveTo(x+0.5,0)
      g.lineTo(x+0.5,H-2)
      g.stroke()

      // tekst
      g.fillStyle = '#9fb0cc'
      g.fillText(`${s.toFixed(0)}s`, x, 2)
    }

    // playhead marker
    const phx = playhead*pxPerSec - scrollX
    g.strokeStyle = '#ffd36b'
    g.beginPath()
    g.moveTo(phx+0.5,0)
    g.lineTo(phx+0.5,H)
    g.stroke()
  },[width,zoom,scrollX,playhead])

  function handleClick(e:React.MouseEvent){
    const rect = ref.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
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
      style={{ display:'block', cursor:'default', background:'#141a29' }}
      onMouseDown={handleClick}
    />
  )
}
