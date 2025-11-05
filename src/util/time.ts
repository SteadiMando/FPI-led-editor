import type { TempoChange, TimeSigChange } from '../core/model'
export function secPerBeat(bpm:number){return 60/Math.max(1,bpm)}
export function barsToBeats(bars:number,[num,den]:[number,number]){return bars*(num*(4/den))}
export function beatsToSec(beats:number,bpm:number){return beats*secPerBeat(bpm)}
export function barsToSec(bars:number,bpm:number,ts:[number,number]){return beatsToSec(barsToBeats(bars,ts), bpm)}
export function formatBBT(sec:number,bpm:number,[num,den]:[number,number]){const spb=secPerBeat(bpm);const beats=sec/spb;const bpb=num*(4/den);const bar=Math.floor(beats/bpb)+1;const beat=Math.floor(beats%bpb)+1;const tick=Math.floor(((beats%1)*960));return `${bar}.${beat}.${tick}`}
export function localTempoAt(t:number, base:number, changes:TempoChange[]):number{const list=[{t:0,bpm:base}, ...changes].filter(x=>x.t<=t).sort((a,b)=>a.t-b.t);return list[list.length-1]?.bpm ?? base}
export function localTSAt(t:number, base:[number,number], changes:TimeSigChange[]):[number,number]{const list=[{t:0,num:base[0],den:base[1]}, ...changes].filter(x=>x.t<=t).sort((a,b)=>a.t-b.t);const last=list[list.length-1]; return [last.num,last.den]}
export function snapTime(sec:number,mode:'bar'|'1/2'|'1/4'|'1/8'|'1/16'|'smart',bpm:number,ts:[number,number],zoom:number){const spb=secPerBeat(bpm); const [num,den]=ts; const bpb=num*(4/den); let stepBeats=1; if(mode==='smart'){const pxPerBeat = spb*zoom; if(pxPerBeat>=80) stepBeats=1/16; else if(pxPerBeat>=48) stepBeats=1/8; else if(pxPerBeat>=30) stepBeats=1/4; else if(pxPerBeat>=18) stepBeats=1/2; else stepBeats=bpb} else {stepBeats = mode==='bar'?bpb: mode==='1/2'?0.5: mode==='1/4'?0.25: mode==='1/8'?0.125: 0.0625} const beats=sec/spb; const snappedBeats=Math.round(beats/stepBeats)*stepBeats; return snappedBeats*spb}
export function smartQuantizeLength(bpm:number, secPerPx:number){ const spb=secPerBeat(bpm); const q8=spb/2; return q8 }
export function snapToNearestQuarterOrEighth(sec:number, bpm:number, ts:[number,number]) {
  const spb = secPerBeat(bpm);           // 1 beat = 1/4 noot in 4/4
  const eighth = spb / 2;                // 1/8
  // dichtstbijzijnde veelvouden:
  const nQuarter = Math.round(sec / spb) * spb;
  const nEighth  = Math.round(sec / eighth) * eighth;
  // kies de dichtstbijzijnde:
  return (Math.abs(sec - nQuarter) <= Math.abs(sec - nEighth)) ? nQuarter : nEighth;
}

// vaste kwartnoot lengte
export function quarterLength(bpm:number){ return secPerBeat(bpm); }
