import React, { useEffect, useState } from 'react'
export const NumberField: React.FC<{ value: number, onCommit:(n:number)=>void, width?:number, min?:number, max?:number }> = ({ value, onCommit, width=70, min, max }) => {
  const [txt,setTxt] = useState(String(value))
  useEffect(()=>{ setTxt(String(value)) }, [value])
  function commit(){
    let v = parseFloat(txt)
    if (!Number.isFinite(v)) { setTxt(String(value)); return }
    if (min!=null) v = Math.max(min, v)
    if (max!=null) v = Math.min(max, v)
    onCommit(v)
  }
  return <input className="btn" style={{width}} type="text" value={txt}
    onChange={e=>setTxt(e.target.value)}
    onKeyDown={e=>{ if(e.key==='Enter') commit(); if(e.key==='Escape'){ (e.target as HTMLInputElement).blur(); setTxt(String(value)) } }}
    onBlur={commit}
  />
}
