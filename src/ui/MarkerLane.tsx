import React, { useEffect, useRef } from 'react'
import type { Marker } from '../core/model'
type Props = { markers:Marker[], setMarkers:(m:Marker[])=>void, width:number, zoom:number, scrollX:number, playhead:number, onSeek?:(t:number)=>void }
export const MarkerLane:React.FC<Props>=({markers,width,zoom,scrollX,playhead,onSeek})=>{
  const ref=useRef<HTMLCanvasElement>(null)
  useEffect(()=>{const c=ref.current!,g=c.getContext('2d')!,h=28; c.width=width; c.height=h; g.fillStyle='#0d1422'; g.fillRect(0,0,width,h); g.strokeStyle='#1b2131'; g.strokeRect(0,0,width,h)
    for(const m of markers){const x=m.t*zoom - scrollX; const w=8; g.fillStyle=m.color||'#ffd36b'; g.fillRect(x-w/2, 2, w, h-4); g.fillStyle='#0b0f17'; g.fillRect(x-w/2+2, 2, w-4, h-10); g.fillStyle='#9fb0cc'; g.font='12px system-ui'; g.textBaseline='top'; g.fillText(m.label, Math.max(2,x+6), 6) }
    const phx = playhead*zoom - scrollX; g.strokeStyle='#7bdcff'; g.beginPath(); g.moveTo(phx+0.5,0); g.lineTo(phx+0.5,h); g.stroke()
  },[markers,width,zoom,scrollX,playhead])
  function onDown(e:React.MouseEvent){ if(!onSeek) return; const rect=ref.current!.getBoundingClientRect(); const x=e.clientX-rect.left; const t=(x+scrollX)/zoom; onSeek(Math.max(0,t)) }
  return <canvas onMouseDown={onDown} style={{display:'block', cursor:'ew-resize'}} ref={ref}/>
}
