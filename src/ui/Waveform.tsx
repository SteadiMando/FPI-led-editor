import React, { useEffect, useRef, useState } from 'react'
type Props = { audioBuffer: AudioBuffer|null, zoom:number, scrollX:number, width:number, height?:number, playhead:number, onSeek?:(t:number)=>void, showZeroPin?:boolean }
export const Waveform:React.FC<Props>=({audioBuffer, zoom, scrollX, width, height=90, playhead, onSeek, showZeroPin=true})=>{
  const ref=useRef<HTMLCanvasElement>(null); const [peaks,setPeaks]=useState<Float32Array|null>(null)
  const dragging = useRef(false)
  useEffect(()=>{ if(!audioBuffer){ setPeaks(null); return }
    const ch=audioBuffer.getChannelData(0); const totalSec=audioBuffer.duration
    const target=Math.max(1, Math.floor(totalSec*200)); const step=Math.max(1, Math.floor(ch.length/target))
    const out=new Float32Array(Math.ceil(ch.length/step)); let j=0; for(let i=0;i<ch.length;i+=step){ let m=0; for(let k=i;k<Math.min(i+step,ch.length);k++){const v=Math.abs(ch[k]); if(v>m)m=v } out[j++]=m } setPeaks(out.subarray(0,j))
  },[audioBuffer])
  useEffect(()=>{ const c=ref.current!, g=c.getContext('2d')!; c.width=width; c.height=height
    g.fillStyle='#0b121f'; g.fillRect(0,0,width,height)
    if(showZeroPin){ g.strokeStyle='#394a6a'; g.beginPath(); const zx = -scrollX; g.moveTo(zx+0.5,0); g.lineTo(zx+0.5,height); g.stroke() }
    if(audioBuffer&&peaks){ const sec=audioBuffer.duration; const totalPx=sec*zoom; const scale=peaks.length/totalPx
      g.strokeStyle='#264061'; g.beginPath()
      for(let x=0;x<width;x++){ const px=x+scrollX; const idx=Math.floor(px*scale); const amp=peaks[Math.min(peaks.length-1,Math.max(0,idx))]||0; const y=(height/2)*(1-amp), y2=height-y; g.moveTo(x+0.5,y); g.lineTo(x+0.5,y2) } g.stroke()
    }
    const phx = playhead*zoom - scrollX; g.strokeStyle='#ffd36b'; g.beginPath(); g.moveTo(phx+0.5,0); g.lineTo(phx+0.5,height); g.stroke()
  },[audioBuffer,peaks,zoom,scrollX,width,height,playhead,showZeroPin])
  function toTime(e:React.MouseEvent){ const rect=ref.current!.getBoundingClientRect(); const x=e.clientX-rect.left; return (x+scrollX)/zoom }
  function onDown(e:React.MouseEvent){ if(!onSeek) return; dragging.current=true; onSeek(Math.max(0,toTime(e))) }
  function onMove(e:React.MouseEvent){ if(!onSeek||!dragging.current) return; onSeek(Math.max(0,toTime(e))) }
  function onUp(){ dragging.current=false }
  return <canvas ref={ref} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} width={width} height={height} style={{display:'block', borderBottom:'1px solid #1b2131', cursor: 'ew-resize'}}/>
}
