import { useState, useEffect, useCallback } from 'react';
import {
  getOperarios, addOperario, updateOperario, deleteOperario,
  getMontajes, addMontaje, updateMontaje, deleteMontaje,
  getRegistros, addRegistro, updateRegistro, deleteRegistro
} from './db';
import { jsPDF } from 'jspdf';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const APP_VERSION = '1.0.0';
const APP_BUILD   = 1;
const GIST_URL    = 'https://gist.githubusercontent.com/Enwattao/03a1fdd890b99b87d36de3d7b7ffd3ba/raw/version.json';

// ─── PALETA ───────────────────────────────────────────────────────────────────
const PALETTE = [
  '#2563eb','#7c3aed','#db2777','#dc2626','#ea580c',
  '#d97706','#16a34a','#0891b2','#0284c7','#4f46e5',
  '#9333ea','#c026d3','#059669','#0d9488','#65a30d'
];
const DIAS   = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];
const MESES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MESES_C= ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const TIPOS  = [
  { id:'normal',  label:'Normal',  emoji:'🕐', color:'#2563eb', bg:'#dbeafe' },
  { id:'festiva', label:'Festiva', emoji:'🎉', color:'#dc2626', bg:'#fee2e2' },
  { id:'nocturna',label:'Nocturna',emoji:'🌙', color:'#7c3aed', bg:'#ede9fe' },
];

// ─── AUDIO ────────────────────────────────────────────────────────────────────
function beep(freqs, type='sine') {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    freqs.forEach(([f,t,d])=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g);g.connect(ctx.destination);
      o.type=type;o.frequency.value=f;
      g.gain.setValueAtTime(0.12,ctx.currentTime+t);
      g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+d);
      o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+d+0.01);
    });
  } catch{}
}
const sndOk  = ()=>beep([[523,0,.06],[659,.07,.06],[784,.14,.1],[1047,.25,.12]]);
const sndDel = ()=>beep([[440,0,.05],[320,.06,.15]]);
const sndErr = ()=>beep([[200,0,.1],[180,.1,.15]],'sawtooth');
const sndNav = ()=>beep([[659,0,.04],[784,.05,.06]]);

// ─── UTILS ────────────────────────────────────────────────────────────────────
const pad     = n => String(n).padStart(2,'0');
const HOY_STR = ()=>{ const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const fmt     = d => d?d.split('-').reverse().join('/'):'';
const hex2rgb = h =>{ const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16); return `${r},${g},${b}`; };
const tipoOf  = id => TIPOS.find(t=>t.id===id)||TIPOS[0];
const fmtH    = h => h%1===0?`${h}h`:`${h.toFixed(1)}h`;

function calcPeriodo(year, month, corte) {
  const desde = new Date(year, month-1, corte+1);
  const hasta  = new Date(year, month,   corte);
  const s = d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  return { desde:s(desde), hasta:s(hasta) };
}
function mesContableHoy(corte) {
  const h=new Date();
  if(h.getDate()>corte){
    const m=h.getMonth()+1;
    return m>11?{y:h.getFullYear()+1,m:0}:{y:h.getFullYear(),m};
  }
  return {y:h.getFullYear(),m:h.getMonth()};
}

// ─── COLORES ─────────────────────────────────────────────────────────────────
// ── FESTIVOS (nacionales + Andalucía + Huelva) ───────────────────────────────
function easterSunday(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,
        f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),
        h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,
        l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
        mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;
  return new Date(y,mo-1,da);
}
const FESTIVOS_FIJOS=['01-01','01-06','02-28','05-01','08-15','09-08','10-12','11-01','12-06','12-08','12-25'];
function esFestivo(dateStr){
  const[y,m,d]=dateStr.split('-');
  if(FESTIVOS_FIJOS.includes(`${m}-${d}`))return true;
  const easter=easterSunday(Number(y));
  const viernes=new Date(easter);viernes.setDate(easter.getDate()-2);
  const pv=n=>String(n).padStart(2,'0');
  return dateStr===`${viernes.getFullYear()}-${pv(viernes.getMonth()+1)}-${pv(viernes.getDate())}`;
}
const NOMBRES_FESTIVOS={
  '01-01':'Año Nuevo','01-06':'Reyes Magos','02-28':'Día de Andalucía',
  '05-01':'Día del Trabajo','08-15':'Asunción','09-08':'Día de la Merced',
  '10-12':'Hispanidad','11-01':'Todos los Santos','12-06':'Constitución',
  '12-08':'Inmaculada','12-25':'Navidad',
};
function getNombreFestivo(dateStr){
  const[y,m,d]=dateStr.split('-');
  if(NOMBRES_FESTIVOS[`${m}-${d}`])return NOMBRES_FESTIVOS[`${m}-${d}`];
  const easter=easterSunday(Number(y));
  const viernes=new Date(easter);viernes.setDate(easter.getDate()-2);
  const pv=n=>String(n).padStart(2,'0');
  if(dateStr===`${viernes.getFullYear()}-${pv(viernes.getMonth()+1)}-${pv(viernes.getDate())}`)return'Viernes Santo';
  return null;
}

const TEMAS = {
  azul:  { blue1:'#071e45',blue2:'#0e2f68',blue3:'#1a4099',blue4:'#2563eb',blue5:'#4f85f6', blueTint:'#dbeafe',surfaceVar:'#f3f7ff',surfaceDim:'#e2ebfb', onSurface:'#0c1929',onSurface2:'#374d72',onSurface3:'#7b95c2', border:'rgba(37,99,235,0.09)' },
  verde: { blue1:'#052e16',blue2:'#14532d',blue3:'#15803d',blue4:'#16a34a',blue5:'#22c55e', blueTint:'#dcfce7',surfaceVar:'#f0fdf4',surfaceDim:'#d1fae5', onSurface:'#0a1f10',onSurface2:'#2d4a36',onSurface3:'#6b9278', border:'rgba(22,163,74,0.09)' },
  indigo:{ blue1:'#1e0a47',blue2:'#3b1680',blue3:'#5b21b6',blue4:'#7c3aed',blue5:'#a78bfa', blueTint:'#ede9fe',surfaceVar:'#faf5ff',surfaceDim:'#ede9fe', onSurface:'#1a0640',onSurface2:'#4a2e87',onSurface3:'#9475c8', border:'rgba(124,58,237,0.09)' },
};

// ═════════════════════════════════════════════════════════════════════════════
export default function AppMovil() {
  const [tab,      setTab]      = useState('cal');
  const [ops,      setOps]      = useState([]);
  const [monts,    setMonts]    = useState([]);
  const [regs,     setRegs]     = useState([]);
  const [diaCorte, setDiaCorte] = useState(()=>JSON.parse(localStorage.getItem('he_corte')||'25'));
  const [vYear,    setVYear]    = useState(()=>mesContableHoy(JSON.parse(localStorage.getItem('he_corte')||'25')).y);
  const [vMonth,   setVMonth]   = useState(()=>mesContableHoy(JSON.parse(localStorage.getItem('he_corte')||'25')).m);
  const [modal,    setModal]    = useState(null);
  const [toast,    setToast]    = useState(null);
  const [updateInfo,setUpdateInfo]=useState(null); // {version,build,changelog,apk_url}
  const [grande,   setGrande]   = useState(()=>JSON.parse(localStorage.getItem('he_grande')||'false'));
  const [tema,     setTema]     = useState(()=>localStorage.getItem('he_tema')||'azul');
  const [diasNoLab,setDiasNoLab]= useState(()=>JSON.parse(localStorage.getItem('he_nolaborables')||'[]'));
  const [split2h,  setSplit2h]  = useState(()=>JSON.parse(localStorage.getItem('he_split2h')||'false'));

  const fs  = grande?16:14;
  const fsS = grande?13:11;
  const fsL = grande?20:17;
  const fsXL= grande?28:22;
  const C   = {...(TEMAS[tema]||TEMAS.azul),surface:'#ffffff',danger:'#dc2626',success:'#16a34a'};

  const reload = useCallback(async()=>{
    const [o,m,r]=await Promise.all([getOperarios(),getMontajes(),getRegistros()]);
    setOps(o);setMonts(m);setRegs(r);
  },[]);

  useEffect(()=>{reload();},[reload]);
  useEffect(()=>{localStorage.setItem('he_grande',JSON.stringify(grande));},[grande]);
  useEffect(()=>{localStorage.setItem('he_corte',JSON.stringify(diaCorte));},[diaCorte]);
  useEffect(()=>{localStorage.setItem('he_tema',tema);},[tema]);
  useEffect(()=>{localStorage.setItem('he_nolaborables',JSON.stringify(diasNoLab));},[diasNoLab]);
  useEffect(()=>{localStorage.setItem('he_split2h',JSON.stringify(split2h));},[split2h]);

  const showToast  = useCallback((msg,ok=true)=>{setToast({msg,ok});setTimeout(()=>setToast(null),2600);},[]);
  const openModal  = useCallback((type,data=null)=>{sndNav();setModal({type,data});},[]);
  const closeModal = ()=>setModal(null);
  const navTab     = t=>{sndNav();setTab(t);};

  const checkUpdate = useCallback(async(manual=false)=>{
    try{
      const r=await fetch(GIST_URL+'?t='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw new Error();
      const info=await r.json();
      if(info.build>APP_BUILD){
        setUpdateInfo(info);
        localStorage.setItem('he_update_last',Date.now().toString());
      }else if(manual){
        showToast('✅ Ya tienes la última versión');
      }
    }catch{
      if(manual)showToast('⚠️ No se pudo comprobar',false);
    }
  },[showToast]);

  // Auto-check cada 4 horas
  useEffect(()=>{
    const INTERVAL=4*60*60*1000;
    const last=Number(localStorage.getItem('he_update_last')||'0');
    if(Date.now()-last>INTERVAL)checkUpdate();
    const t=setInterval(()=>checkUpdate(),INTERVAL);
    return()=>clearInterval(t);
  },[checkUpdate]);

  const periodo    = calcPeriodo(vYear,vMonth,diaCorte);
  const regsDelMes = regs.filter(r=>r.fecha>=periodo.desde&&r.fecha<=periodo.hasta);
  const totalMes   = regsDelMes.reduce((s,r)=>s+r.horas,0);
  const diasConReg = new Set(regsDelMes.map(r=>r.fecha)).size;
  const regsPorFecha = regs.reduce((acc,r)=>{(acc[r.fecha]=acc[r.fecha]||[]).push(r);return acc;},{});

  const getDiaNL      = dateStr=>diasNoLab.find(d=>d.fecha===dateStr)||null;
  const esDiaEspecial = dateStr=>{
    const dow=new Date(dateStr+'T12:00:00').getDay();
    return dow===0||dow===6||esFestivo(dateStr)||!!getDiaNL(dateStr);
  };
  const fmtHorasSplit = (horas,dateStr)=>{
    if(!split2h||horas<=2)return`${horas}h`;
    const dow=new Date(dateStr+'T12:00:00').getDay();
    const esNormal=dow>=1&&dow<=5&&!esFestivo(dateStr)&&!getDiaNL(dateStr);
    if(!esNormal)return`${horas}h`;
    return`2h + ${parseFloat((horas-2).toFixed(1))}h`;
  };

  const changeMonth = dir=>{
    let m=vMonth+dir,y=vYear;
    if(m>11){m=0;y++;}if(m<0){m=11;y--;}
    setVMonth(m);setVYear(y);
  };

  const buildDays = ()=>{
    const first=new Date(vYear,vMonth,1);
    let sd=first.getDay();sd=(sd+6)%7;
    const dim=new Date(vYear,vMonth+1,0).getDate();
    const days=[];
    for(let i=0;i<sd;i++)days.push(null);
    for(let d=1;d<=dim;d++)days.push(d);
    while(days.length%7!==0)days.push(null);
    return days;
  };

  const inputStyle={width:'100%',background:C.surfaceVar,border:`1.5px solid ${C.border}`,borderRadius:14,padding:'13px 15px',fontSize:fs,color:C.onSurface,fontFamily:'inherit',outline:'none',boxSizing:'border-box',transition:'border-color .15s'};

  // ── COMPONENTES COMUNES ───────────────────────────────────────────────────
  function Field({label,children}){
    return(
      <div style={{marginBottom:14}}>
        <label style={{display:'block',fontSize:fsS,fontWeight:600,color:C.onSurface2,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>{label}</label>
        {children}
      </div>
    );
  }

  function BottomSheet({children,titulo,full=false}){
    return(
      <div style={{position:'fixed',inset:0,zIndex:500,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
        <div onClick={closeModal} style={{position:'absolute',inset:0,background:'rgba(7,30,69,0.58)',backdropFilter:'blur(3px)'}}/>
        <div style={{position:'relative',background:C.surface,borderRadius:'28px 28px 0 0',maxHeight:full?'95vh':'88vh',overflowY:'auto',boxShadow:'0 -16px 56px rgba(7,30,69,0.28)'}}>
          <div style={{width:48,height:5,borderRadius:3,background:'#c8d5ee',margin:'14px auto 0'}}/>
          <div style={{padding:'16px 20px 13px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:fsL,fontWeight:700,color:C.onSurface}}>{titulo}</span>
            <button onClick={closeModal} style={{width:32,height:32,borderRadius:'50%',background:C.surfaceVar,border:'none',color:C.onSurface2,fontSize:16,cursor:'pointer',fontFamily:'inherit',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
          </div>
          <div style={{padding:'18px 20px 40px'}}>{children}</div>
        </div>
      </div>
    );
  }

  function ColorPicker({value,onChange}){
    return(
      <div style={{display:'flex',flexWrap:'wrap',gap:10}}>
        {PALETTE.map(c=>(
          <div key={c} onClick={()=>onChange(c)} style={{width:36,height:36,borderRadius:'50%',background:c,cursor:'pointer',flexShrink:0,border:value===c?'3px solid #fff':'2px solid transparent',boxShadow:value===c?`0 0 0 3px ${c}`:'0 2px 6px rgba(0,0,0,.15)',transform:value===c?'scale(1.2)':'scale(1)',transition:'all .13s'}}/>
        ))}
      </div>
    );
  }

  function Toggle({value,onChange}){
    return(
      <div onClick={()=>onChange(!value)} style={{width:52,height:28,borderRadius:14,background:value?C.blue4:'#cbd5e1',cursor:'pointer',position:'relative',transition:'background .2s',flexShrink:0}}>
        <div style={{width:22,height:22,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:value?27:3,transition:'left .18s',boxShadow:'0 2px 6px rgba(0,0,0,.25)'}}/>
      </div>
    );
  }

  function Toast(){
    if(!toast)return null;
    return(
      <div style={{position:'fixed',bottom:100,left:'50%',transform:'translateX(-50%)',background:toast.ok?C.success:C.danger,color:'#fff',borderRadius:30,padding:'11px 22px',fontSize:fs,fontWeight:600,zIndex:9999,boxShadow:'0 6px 24px rgba(0,0,0,.25)',display:'flex',alignItems:'center',gap:8,whiteSpace:'nowrap'}}>
        {toast.ok?'✓':'✕'} {toast.msg}
      </div>
    );
  }

  function ModalUpdate(){
    if(!updateInfo)return null;
    return(
      <div style={{position:'fixed',inset:0,zIndex:9000,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
        <div style={{position:'absolute',inset:0,background:'rgba(7,30,69,0.7)',backdropFilter:'blur(4px)'}}/>
        <div style={{position:'relative',background:C.surface,borderRadius:24,padding:24,maxWidth:360,width:'100%',boxShadow:'0 24px 64px rgba(7,30,69,0.4)'}}>
          {/* Cabecera */}
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
            <div style={{width:48,height:48,borderRadius:16,background:`linear-gradient(135deg,${C.blue1},${C.blue4})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,flexShrink:0}}>🆕</div>
            <div>
              <div style={{fontWeight:800,fontSize:fsL,color:C.onSurface}}>Nueva versión</div>
              <div style={{fontSize:fsS,color:C.onSurface3}}>v{updateInfo.version} disponible</div>
            </div>
          </div>
          {/* Changelog */}
          {updateInfo.changelog?.length>0&&(
            <div style={{background:C.surfaceVar,borderRadius:14,padding:'12px 14px',marginBottom:16}}>
              <div style={{fontSize:fsS,fontWeight:700,color:C.onSurface2,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.05em'}}>Novedades</div>
              {updateInfo.changelog.map((c,i)=>(
                <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:i<updateInfo.changelog.length-1?6:0}}>
                  <span style={{color:C.success,fontWeight:700,flexShrink:0}}>✓</span>
                  <span style={{fontSize:fsS,color:C.onSurface,lineHeight:1.4}}>{c}</span>
                </div>
              ))}
            </div>
          )}
          {/* Botones */}
          <button onClick={()=>{window.open(updateInfo.apk_url,'_blank');}} style={{width:'100%',padding:'14px',background:C.blue4,border:'none',borderRadius:14,fontSize:fs,color:'#fff',fontWeight:700,cursor:'pointer',fontFamily:'inherit',marginBottom:10,boxShadow:`0 4px 16px rgba(${hex2rgb(C.blue4)},.4)`}}>
            ⬇ Descargar e instalar
          </button>
          <button onClick={()=>setUpdateInfo(null)} style={{width:'100%',padding:'12px',background:'transparent',border:`1.5px solid ${C.border}`,borderRadius:14,fontSize:fs,color:C.onSurface2,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
            Ahora no
          </button>
        </div>
      </div>
    );
  }

  function VisPicker({items,value,onChange,placeholder}){
    const [open,setOpen]=useState(false);
    const sel=items.find(i=>i.id===value);
    return(
      <>
        <div onClick={()=>setOpen(true)} style={{...inputStyle,cursor:'pointer',display:'flex',alignItems:'center',gap:10}}>
          {sel?<><div style={{width:12,height:12,borderRadius:'50%',background:sel.color,flexShrink:0}}/><span style={{flex:1}}>{sel.nombre}</span></>:<span style={{flex:1,color:C.onSurface3}}>{placeholder}</span>}
          <span style={{color:C.onSurface3,fontSize:11}}>▾</span>
        </div>
        {open&&(
          <div style={{position:'fixed',inset:0,zIndex:600,display:'flex',alignItems:'center',justifyContent:'center',padding:20,background:'rgba(0,0,0,0.5)'}}>
            <div style={{background:C.surface,borderRadius:20,width:'100%',maxWidth:420,maxHeight:'70vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
              <div style={{padding:'16px 20px 12px',fontWeight:700,fontSize:fsL,borderBottom:`1px solid ${C.border}`,color:C.onSurface}}>{placeholder}</div>
              {items.length===0&&<div style={{padding:'28px',textAlign:'center',color:C.onSurface3}}>Sin elementos — crea uno primero</div>}
              {items.map(it=>(
                <div key={it.id} onClick={()=>{onChange(it.id);setOpen(false);}} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 20px',borderBottom:`1px solid ${C.border}`,cursor:'pointer',background:value===it.id?C.blueTint:'transparent'}}>
                  <div style={{width:14,height:14,borderRadius:'50%',background:it.color,flexShrink:0}}/>
                  <span style={{flex:1,fontSize:fs+1,fontWeight:value===it.id?700:400,color:C.onSurface}}>{it.nombre}</span>
                  {value===it.id&&<span style={{color:C.blue4,fontSize:18}}>✓</span>}
                </div>
              ))}
              <div style={{padding:'12px 20px'}}>
                <button onClick={()=>setOpen(false)} style={{width:'100%',padding:'12px',background:C.surfaceVar,border:'none',borderRadius:12,fontSize:fs,color:C.onSurface2,cursor:'pointer',fontFamily:'inherit',fontWeight:500}}>Cancelar</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  function TipoPicker({value,onChange}){
    return(
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
        {TIPOS.map(t=>(
          <div key={t.id} onClick={()=>onChange(t.id)} style={{padding:'12px 6px',borderRadius:13,cursor:'pointer',textAlign:'center',background:value===t.id?t.bg:C.surfaceVar,border:`2px solid ${value===t.id?t.color:'transparent'}`,boxShadow:value===t.id?`0 4px 14px rgba(${hex2rgb(t.color)},.25)`:'none',transition:'all .13s'}}>
            <div style={{fontSize:24,marginBottom:5}}>{t.emoji}</div>
            <div style={{fontSize:fsS,fontWeight:700,color:value===t.id?t.color:C.onSurface3}}>{t.label}</div>
          </div>
        ))}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL: DETALLE DÍA (cuando el día ya tiene registros)
  // ═══════════════════════════════════════════════════════════════════════════
  function ModalDia({fecha,dayRegs}){
    const nlExist=getDiaNL(fecha);
    const [showNL,setShowNL]=useState(false);
    const [nlColor,setNLColor]=useState(nlExist?.color||'#f59e0b');
    const [nlMotivo,setNLMotivo]=useState(nlExist?.motivo||'');

    const guardarNL=()=>{
      if(!nlMotivo.trim()){sndErr();showToast('Escribe un motivo',false);return;}
      setDiasNoLab(prev=>[...prev.filter(d=>d.fecha!==fecha),{fecha,color:nlColor,motivo:nlMotivo.trim()}]);
      sndOk();showToast('Día marcado ✓');setShowNL(false);
    };
    const quitarNL=()=>{
      setDiasNoLab(prev=>prev.filter(d=>d.fecha!==fecha));
      sndDel();showToast('Marcado eliminado');setShowNL(false);
    };

    return(
      <BottomSheet titulo={`${fmt(fecha)}`}>
        {/* Badge día no laboral */}
        {nlExist&&!showNL&&(
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:12,marginBottom:12,background:nlExist.color+'22',border:`1.5px solid ${nlExist.color}`}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:nlExist.color,flexShrink:0}}/>
            <span style={{flex:1,fontSize:fsS,fontWeight:600,color:nlExist.color}}>{nlExist.motivo}</span>
            <button onClick={()=>{setNLColor(nlExist.color);setNLMotivo(nlExist.motivo);setShowNL(true);}} style={{background:'none',border:'none',fontSize:13,cursor:'pointer',color:nlExist.color,fontWeight:700,padding:'2px 6px'}}>✎</button>
          </div>
        )}

        {/* Panel no laboral */}
        {showNL&&(
          <div style={{background:C.surfaceVar,borderRadius:14,padding:'14px',marginBottom:14,border:`1.5px solid ${C.border}`}}>
            <div style={{fontWeight:700,fontSize:fs,color:C.onSurface,marginBottom:10}}>Día no laboral</div>
            <label style={{display:'block',fontSize:fsS,fontWeight:600,color:C.onSurface2,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Motivo</label>
            <input style={{...inputStyle,marginBottom:12}} type="text" placeholder="Ej: Día de convenio, Puente..." value={nlMotivo} onChange={e=>setNLMotivo(e.target.value)}/>
            <label style={{display:'block',fontSize:fsS,fontWeight:600,color:C.onSurface2,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Color</label>
            <ColorPicker value={nlColor} onChange={setNLColor}/>
            <div style={{display:'flex',gap:8,marginTop:14}}>
              {nlExist&&<button onClick={quitarNL} style={{flex:1,padding:'11px',background:'#fef2f2',border:'1.5px solid #fca5a5',borderRadius:11,fontSize:fsS,color:C.danger,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Quitar</button>}
              <button onClick={()=>setShowNL(false)} style={{flex:1,padding:'11px',background:C.surfaceDim,border:'none',borderRadius:11,fontSize:fsS,color:C.onSurface2,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Cancelar</button>
              <button onClick={guardarNL} style={{flex:1,padding:'11px',background:C.blue4,border:'none',borderRadius:11,fontSize:fsS,color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>Guardar</button>
            </div>
          </div>
        )}

        <div style={{marginBottom:14}}>
          {dayRegs.map(r=>{
            const op=ops.find(o=>o.id===r.operario_id);
            const mo=monts.find(m=>m.id===r.montaje_id);
            const opC=op?.color||r.operario_color||C.blue4;
            const moC=mo?.color||r.montaje_color||C.onSurface3;
            const ti=tipoOf(r.tipo||'normal');
            return(
              <div key={r.id} onClick={()=>openModal('horas',{fecha,regEdit:r})} style={{background:C.surfaceVar,borderRadius:14,padding:'13px 15px',marginBottom:8,display:'flex',alignItems:'center',gap:12,cursor:'pointer',borderLeft:`4px solid ${opC}`}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:fs,color:C.onSurface,marginBottom:4}}>{r.operario_nombre}</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                    <span style={{background:`rgba(${hex2rgb(moC)},.12)`,color:moC,borderRadius:6,padding:'2px 8px',fontSize:fsS,fontWeight:600}}>{r.montaje_nombre}</span>
                    <span style={{background:ti.bg,color:ti.color,borderRadius:6,padding:'2px 8px',fontSize:fsS,fontWeight:600}}>{ti.emoji} {ti.label}</span>
                    {r.nota&&<span style={{fontSize:fsS,color:C.onSurface3,fontStyle:'italic'}}>{r.nota}</span>}
                  </div>
                </div>
                {(()=>{
                  const dow=new Date(fecha+'T12:00:00').getDay();
                  const esNormal=split2h&&dow>=1&&dow<=5&&!esFestivo(fecha)&&!getDiaNL(fecha)&&r.horas>2;
                  if(esNormal) return(
                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:1,flexShrink:0}}>
                      <span style={{fontWeight:800,fontSize:fsL+2,color:opC,fontFamily:'monospace',lineHeight:1}}>{r.horas}h</span>
                      <span style={{fontSize:fsS-1,color:C.onSurface3,fontWeight:500}}>Prim. <span style={{color:opC,fontWeight:700}}>2h</span> · Rest. <span style={{color:opC,fontWeight:700}}>{parseFloat((r.horas-2).toFixed(1))}h</span></span>
                    </div>
                  );
                  return <div style={{fontWeight:800,fontSize:fsL+2,color:opC,fontFamily:'monospace',flexShrink:0}}>{r.horas}h</div>;
                })()}
                <span style={{color:C.onSurface3,fontSize:14}}>✎</span>
              </div>
            );
          })}
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:C.blueTint,borderRadius:12,marginBottom:12}}>
          <span style={{fontSize:fsS,color:C.blue3,fontWeight:600}}>Total del día</span>
          <span style={{fontFamily:'monospace',fontSize:fsL,fontWeight:800,color:C.blue4}}>{fmtH(dayRegs.reduce((s,r)=>s+r.horas,0))}</span>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setShowNL(v=>!v)} style={{padding:'12px 14px',background:nlExist?nlExist.color+'22':C.surfaceVar,border:`1.5px solid ${nlExist?nlExist.color:C.border}`,borderRadius:13,fontSize:fsS,color:nlExist?nlExist.color:C.onSurface2,cursor:'pointer',fontFamily:'inherit',fontWeight:600,flexShrink:0}}>
            ⊘ No laboral
          </button>
          <button onClick={()=>openModal('horas',{fecha})} style={{flex:1,padding:'14px',background:C.blue4,border:'none',borderRadius:14,fontSize:fs+1,color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:700,boxShadow:`0 4px 16px rgba(${hex2rgb(C.blue4)},.4)`}}>
            + Añadir horas
          </button>
        </div>
      </BottomSheet>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL: AÑADIR / EDITAR HORAS
  // ═══════════════════════════════════════════════════════════════════════════
  function ModalHoras({fecha,regEdit}){
    const ultimo=[...regs].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')).slice(0,1)[0];
    const [opId, setOpId]  =useState(regEdit?.operario_id||ultimo?.operario_id||'');
    const [montId,setMontId]=useState(regEdit?.montaje_id||ultimo?.montaje_id||'');
    const [horas, setHoras] =useState(regEdit?String(regEdit.horas):'');
    const [tipo,  setTipo]  =useState(regEdit?.tipo||(esDiaEspecial(fecha)?'festiva':'normal'));
    const [nota,  setNota]  =useState(regEdit?.nota||'');
    const ti=tipoOf(tipo);

    const guardar=async()=>{
      if(!opId||!montId||!horas){sndErr();showToast('Rellena todos los campos',false);return;}
      const h=parseFloat(horas);
      if(isNaN(h)||h<=0||h>24){sndErr();showToast('Horas inválidas',false);return;}
      const op=ops.find(o=>o.id===Number(opId));
      const mo=monts.find(m=>m.id===Number(montId));
      const reg={operario_id:op.id,operario_nombre:op.nombre,operario_color:op.color,montaje_id:mo.id,montaje_nombre:mo.nombre,montaje_color:mo.color,fecha,horas:h,tipo,nota};
      if(regEdit){await updateRegistro({...reg,id:regEdit.id,created_at:regEdit.created_at});showToast('Actualizado');}
      else{await addRegistro(reg);showToast('Horas guardadas ✓');}
      sndOk();await reload();closeModal();
    };

    const eliminar=async()=>{
      if(!confirm('¿Eliminar este registro?'))return;
      await deleteRegistro(regEdit.id);sndDel();await reload();closeModal();showToast('Eliminado');
    };

    return(
      <BottomSheet titulo={regEdit?'Editar registro':`Añadir horas — ${fmt(fecha)}`}>
        <Field label="Operario"><VisPicker items={ops} value={Number(opId)||''} onChange={setOpId} placeholder="Selecciona operario"/></Field>
        <Field label="Montaje / Proyecto"><VisPicker items={monts} value={Number(montId)||''} onChange={setMontId} placeholder="Selecciona montaje"/></Field>
        <Field label="Tipo de hora"><TipoPicker value={tipo} onChange={setTipo}/></Field>
        <Field label="Horas extras">
          <input style={{...inputStyle,fontSize:fs+8,fontWeight:800,textAlign:'center',color:ti.color,background:ti.bg,border:`1.5px solid ${ti.color}44`,marginTop:4}}
            type="number" inputMode="decimal" min="0.5" max="24" step="0.5" placeholder="0.0"
            value={horas} onChange={e=>setHoras(e.target.value)}/>
        </Field>
        <Field label="Nota (opcional)">
          <input style={inputStyle} type="text" placeholder="Observaciones…" value={nota} onChange={e=>setNota(e.target.value)}/>
        </Field>
        {regEdit&&<button onClick={eliminar} style={{width:'100%',padding:'13px',background:'#fef2f2',border:'1.5px solid #fca5a5',borderRadius:12,fontSize:fs,color:C.danger,cursor:'pointer',fontFamily:'inherit',fontWeight:600,marginBottom:10}}>🗑 Eliminar registro</button>}
        <button onClick={guardar} style={{width:'100%',padding:'15px',background:C.blue4,border:'none',borderRadius:14,fontSize:fs+1,color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:700,boxShadow:`0 4px 16px rgba(${hex2rgb(C.blue4)},.4)`}}>
          {regEdit?'Guardar cambios':'Guardar horas'}
        </button>
      </BottomSheet>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL: OPERARIOS
  // ═══════════════════════════════════════════════════════════════════════════
  function ModalOperarios(){
    const [editObj,setEditObj]=useState(null);
    const [nombre,setNombre]=useState('');
    const [color,setColor]=useState(PALETTE[0]);
    const [busca,setBusca]=useState('');
    const [sub,setSub]=useState(false);

    const abrir=(op=null)=>{setEditObj(op);setNombre(op?.nombre||'');setColor(op?.color||PALETTE[0]);setSub(true);};
    const guardar=async()=>{
      if(!nombre.trim()){sndErr();return;}
      if(editObj)await updateOperario({...editObj,nombre:nombre.trim(),color});
      else await addOperario({nombre:nombre.trim(),color});
      sndOk();await reload();setSub(false);showToast(editObj?'Actualizado':'Operario añadido ✓');
    };
    const eliminar=async id=>{
      if(!confirm('¿Eliminar operario?'))return;
      await deleteOperario(id);sndDel();await reload();showToast('Eliminado');
    };
    const lista=ops.filter(o=>o.nombre.toLowerCase().includes(busca.toLowerCase()));

    return(
      <BottomSheet titulo={sub?(editObj?'Editar operario':'Nuevo operario'):'Operarios'} full>
        {!sub?(
          <>
            <div style={{display:'flex',gap:10,marginBottom:14}}>
              <input style={{...inputStyle,flex:1}} type="text" placeholder="Buscar…" value={busca} onChange={e=>setBusca(e.target.value)}/>
              <button onClick={()=>abrir()} style={{padding:'12px 16px',background:C.blue4,border:'none',borderRadius:12,color:'#fff',fontSize:fs+2,cursor:'pointer',fontWeight:700}}>＋</button>
            </div>
            {lista.map(op=>{
              const total=regs.filter(r=>r.operario_id===op.id).reduce((s,r)=>s+r.horas,0);
              const per=regsDelMes.filter(r=>r.operario_id===op.id).reduce((s,r)=>s+r.horas,0);
              return(
                <div key={op.id} style={{display:'flex',alignItems:'center',gap:13,padding:'13px 16px',background:C.surfaceVar,borderRadius:14,marginBottom:8}}>
                  <div style={{width:44,height:44,borderRadius:12,background:op.color,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <span style={{color:'#fff',fontWeight:700,fontSize:fsL}}>{op.nombre[0]}</span>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:fs,color:C.onSurface,marginBottom:2}}>{op.nombre}</div>
                    <div style={{fontSize:fsS,color:C.onSurface3}}><span style={{color:op.color,fontWeight:600}}>{fmtH(per)}</span> periodo · {fmtH(total)} total</div>
                  </div>
                  <button onClick={()=>abrir(op)} style={{background:'none',border:'none',color:C.onSurface3,fontSize:18,cursor:'pointer',padding:'4px 6px'}}>✎</button>
                  <button onClick={()=>eliminar(op.id)} style={{background:'none',border:'none',color:'#f87171',fontSize:18,cursor:'pointer',padding:'4px 6px'}}>✕</button>
                </div>
              );
            })}
            {lista.length===0&&<div style={{textAlign:'center',color:C.onSurface3,padding:'32px 0'}}>Sin operarios — pulsa ＋</div>}
          </>
        ):(
          <>
            <Field label="Nombre"><input style={inputStyle} type="text" placeholder="Nombre del operario" value={nombre} onChange={e=>setNombre(e.target.value)} autoFocus/></Field>
            <Field label="Color">
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                <div style={{width:34,height:34,borderRadius:'50%',background:color,boxShadow:`0 3px 10px rgba(${hex2rgb(color)},.4)`}}/>
                <span style={{fontSize:fsS,color:C.onSurface3}}>Vista previa</span>
              </div>
              <ColorPicker value={color} onChange={setColor}/>
            </Field>
            <div style={{display:'flex',gap:10,marginTop:16}}>
              <button onClick={()=>setSub(false)} style={{flex:1,padding:'13px',background:C.surfaceVar,border:'none',borderRadius:12,fontSize:fs,color:C.onSurface2,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Volver</button>
              <button onClick={guardar} style={{flex:2,padding:'13px',background:C.blue4,border:'none',borderRadius:12,fontSize:fs,color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>Guardar</button>
            </div>
          </>
        )}
      </BottomSheet>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL: MONTAJES
  // ═══════════════════════════════════════════════════════════════════════════
  function ModalMontajes(){
    const [editObj,setEditObj]=useState(null);
    const [nombre,setNombre]=useState('');
    const [color,setColor]=useState(PALETTE[8]);
    const [busca,setBusca]=useState('');
    const [sub,setSub]=useState(false);

    const abrir=(m=null)=>{setEditObj(m);setNombre(m?.nombre||'');setColor(m?.color||PALETTE[8]);setSub(true);};
    const guardar=async()=>{
      if(!nombre.trim()){sndErr();return;}
      if(editObj)await updateMontaje({...editObj,nombre:nombre.trim(),color});
      else await addMontaje({nombre:nombre.trim(),color});
      sndOk();await reload();setSub(false);showToast(editObj?'Actualizado':'Montaje añadido ✓');
    };
    const eliminar=async id=>{
      if(!confirm('¿Eliminar montaje?'))return;
      await deleteMontaje(id);sndDel();await reload();showToast('Eliminado');
    };
    const lista=monts.filter(m=>m.nombre.toLowerCase().includes(busca.toLowerCase()));

    return(
      <BottomSheet titulo={sub?(editObj?'Editar montaje':'Nuevo montaje'):'Montajes'} full>
        {!sub?(
          <>
            <div style={{display:'flex',gap:10,marginBottom:14}}>
              <input style={{...inputStyle,flex:1}} type="text" placeholder="Buscar…" value={busca} onChange={e=>setBusca(e.target.value)}/>
              <button onClick={()=>abrir()} style={{padding:'12px 16px',background:C.blue4,border:'none',borderRadius:12,color:'#fff',fontSize:fs+2,cursor:'pointer',fontWeight:700}}>＋</button>
            </div>
            {lista.map(m=>{
              const total=regs.filter(r=>r.montaje_id===m.id).reduce((s,r)=>s+r.horas,0);
              return(
                <div key={m.id} style={{display:'flex',alignItems:'center',gap:13,padding:'13px 16px',background:C.surfaceVar,borderRadius:14,marginBottom:8}}>
                  <div style={{width:44,height:44,borderRadius:12,background:m.color,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:20}}>⚒</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:fs,color:C.onSurface,marginBottom:2}}>{m.nombre}</div>
                    <div style={{fontSize:fsS,color:C.onSurface3}}><span style={{color:m.color,fontWeight:600}}>{fmtH(total)}</span> registradas</div>
                  </div>
                  <button onClick={()=>abrir(m)} style={{background:'none',border:'none',color:C.onSurface3,fontSize:18,cursor:'pointer',padding:'4px 6px'}}>✎</button>
                  <button onClick={()=>eliminar(m.id)} style={{background:'none',border:'none',color:'#f87171',fontSize:18,cursor:'pointer',padding:'4px 6px'}}>✕</button>
                </div>
              );
            })}
            {lista.length===0&&<div style={{textAlign:'center',color:C.onSurface3,padding:'32px 0'}}>Sin montajes — pulsa ＋</div>}
          </>
        ):(
          <>
            <Field label="Nombre del montaje"><input style={inputStyle} type="text" placeholder="Nombre del montaje" value={nombre} onChange={e=>setNombre(e.target.value)} autoFocus/></Field>
            <Field label="Color">
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                <div style={{width:34,height:34,borderRadius:'50%',background:color,boxShadow:`0 3px 10px rgba(${hex2rgb(color)},.4)`}}/>
                <span style={{fontSize:fsS,color:C.onSurface3}}>Vista previa</span>
              </div>
              <ColorPicker value={color} onChange={setColor}/>
            </Field>
            <div style={{display:'flex',gap:10,marginTop:16}}>
              <button onClick={()=>setSub(false)} style={{flex:1,padding:'13px',background:C.surfaceVar,border:'none',borderRadius:12,fontSize:fs,color:C.onSurface2,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Volver</button>
              <button onClick={guardar} style={{flex:2,padding:'13px',background:C.blue4,border:'none',borderRadius:12,fontSize:fs,color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>Guardar</button>
            </div>
          </>
        )}
      </BottomSheet>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL: EXPORTAR PDF — ARREGLADO
  // ═══════════════════════════════════════════════════════════════════════════
  function ModalPDF(){
    const [modo,setModo]=useState('periodo');
    const [selOps,setSelOps]=useState(()=>ops.map(o=>o.id));
    const [filtMont,setFiltMont]=useState('');
    const [filtDia,setFiltDia]=useState(HOY_STR());
    const [filtMes,setFiltMes]=useState(`${vYear}-${pad(vMonth+1)}`);
    const [filtAnio,setFiltAnio]=useState(String(vYear));
    const [gen,setGen]=useState(false);

    const toggleOp=id=>setSelOps(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
    const todosSelec=selOps.length===ops.length;

    const getPeriodoFiltro=()=>{
      if(modo==='periodo')return{desde:periodo.desde,hasta:periodo.hasta};
      if(modo==='dia')return{desde:filtDia,hasta:filtDia};
      if(modo==='mes'){const[y,m]=filtMes.split('-');const p=calcPeriodo(Number(y),Number(m)-1,diaCorte);return p;}
      return{desde:`${filtAnio}-01-01`,hasta:`${filtAnio}-12-31`};
    };

    const getData=()=>{
      const{desde,hasta}=getPeriodoFiltro();
      return regs.filter(r=>{
        if(!r.fecha||r.fecha<desde||r.fecha>hasta)return false;
        if(!selOps.includes(r.operario_id))return false;
        if(filtMont&&r.montaje_id!==Number(filtMont))return false;
        return true;
      }).sort((a,b)=>a.fecha.localeCompare(b.fecha));
    };

    const data=getData();
    const totalH=data.reduce((s,r)=>s+r.horas,0);
    const byOp=data.reduce((a,r)=>{a[r.operario_nombre]=(a[r.operario_nombre]||0)+r.horas;return a;},{});

    const periodoStr=()=>{
      if(modo==='periodo')return`${fmt(periodo.desde)} – ${fmt(periodo.hasta)}`;
      if(modo==='dia')return fmt(filtDia);
      if(modo==='mes'){const[y,m]=filtMes.split('-');return`${MESES[Number(m)-1]} ${y}`;}
      return`Año ${filtAnio}`;
    };

    const exportar=async()=>{
      if(data.length===0){sndErr();showToast('Sin datos para exportar',false);return;}
      setGen(true);
      try{
        const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
        const W=210,M=14,CW=W-M*2;
        const multiCol=selOps.length>=2;
        const colW2=multiCol?Math.floor((CW-8)/2):CW;
        const colGap=CW-2*colW2;

        // ── Cabecera compacta ──
        doc.setFillColor(15,45,107);
        doc.rect(0,0,W,26,'F');
        doc.setFillColor(37,99,235);
        doc.rect(0,23,W,3,'F');

        doc.setTextColor(255,255,255);
        doc.setFont('helvetica','bold');
        doc.setFontSize(13);
        doc.text('HORAS EXTRAS',M,10);

        doc.setFont('helvetica','normal');
        doc.setFontSize(7.5);
        doc.setTextColor(147,197,253);
        doc.text(periodoStr(),M,17);
        const opLbl=todosSelec?'Todos':selOps.map(id=>ops.find(o=>o.id===id)?.nombre||'').filter(Boolean).join(', ');
        const moLbl=filtMont?monts.find(m=>m.id===Number(filtMont))?.nombre||'':'Todos';
        doc.text(`${opLbl}  ·  ${moLbl}`,M,22);
        doc.setTextColor(100,140,220);
        doc.setFontSize(7);
        doc.text('Watta',W-M,22,{align:'right'});

        // ── Agrupar por operario ──
        const grupos={};
        data.forEach(r=>{
          if(!grupos[r.operario_nombre])grupos[r.operario_nombre]={regs:[],total:0,color:r.operario_color||'#2563eb'};
          grupos[r.operario_nombre].regs.push(r);
          grupos[r.operario_nombre].total+=r.horas;
        });
        const gruposList=Object.entries(grupos);

        const renderOpSection=(opN,info,colX,colWid,startY)=>{
          let y=startY;
          let rgb=[37,99,235];
          try{rgb=info.color.slice(1).match(/.{2}/g).map(x=>parseInt(x,16));}catch{}
          doc.setFillColor(240,245,255);
          doc.rect(colX,y,colWid,7,'F');
          doc.setFillColor(rgb[0],rgb[1],rgb[2]);
          doc.rect(colX,y,4,7,'F');
          doc.setFont('helvetica','bold');
          doc.setFontSize(multiCol?8:9);
          doc.setTextColor(rgb[0],rgb[1],rgb[2]);
          doc.text(opN.slice(0,multiCol?14:30),colX+8,y+4.8);
          doc.setTextColor(15,45,107);
          doc.text(`${info.total.toFixed(1)} h`,colX+colWid-2,y+4.8,{align:'right'});
          y+=8;
          doc.setFillColor(229,236,255);
          doc.rect(colX,y,colWid,5.5,'F');
          doc.setFont('helvetica','bold');
          doc.setFontSize(6.5);
          doc.setTextColor(59,80,130);
          if(multiCol){
            doc.text('Fecha',colX+2,y+3.8);
            doc.text('Montaje',colX+19,y+3.8);
            doc.text('Tipo',colX+54,y+3.8);
            doc.text('H',colX+colWid-2,y+3.8,{align:'right'});
          }else{
            doc.text('Fecha',colX+3,y+3.8);
            doc.text('Montaje',colX+28,y+3.8);
            doc.text('Tipo',colX+90,y+3.8);
            doc.text('Nota',colX+112,y+3.8);
            doc.text('Horas',colX+colWid-2,y+3.8,{align:'right'});
          }
          y+=6;
          info.regs.forEach((r,i)=>{
            if(i%2===1){doc.setFillColor(247,250,255);doc.rect(colX,y,colWid,5.5,'F');}
            doc.setFont('helvetica','normal');
            doc.setFontSize(multiCol?6.5:7.5);
            doc.setTextColor(15,29,61);
            if(multiCol){
              doc.text(fmt(r.fecha),colX+2,y+3.8);
              doc.text((r.montaje_nombre||'').slice(0,12),colX+19,y+3.8);
              const ti2=tipoOf(r.tipo||'normal');
              let rgb2=[37,99,235];try{rgb2=ti2.color.slice(1).match(/.{2}/g).map(x=>parseInt(x,16));}catch{}
              doc.setTextColor(rgb2[0],rgb2[1],rgb2[2]);
              doc.text(ti2.label,colX+54,y+3.8);
              doc.setFont('helvetica','bold');
              doc.setTextColor(rgb[0],rgb[1],rgb[2]);
              doc.text(`${r.horas}h`,colX+colWid-2,y+3.8,{align:'right'});
            }else{
              doc.text(fmt(r.fecha),colX+3,y+3.8);
              doc.text((r.montaje_nombre||'').slice(0,22),colX+28,y+3.8);
              const ti2=tipoOf(r.tipo||'normal');
              let rgb2=[37,99,235];try{rgb2=ti2.color.slice(1).match(/.{2}/g).map(x=>parseInt(x,16));}catch{}
              doc.setTextColor(rgb2[0],rgb2[1],rgb2[2]);
              doc.text(ti2.label,colX+90,y+3.8);
              doc.setTextColor(15,29,61);
              doc.text((r.nota||'').slice(0,15),colX+112,y+3.8);
              doc.setFont('helvetica','bold');
              doc.setTextColor(rgb[0],rgb[1],rgb[2]);
              doc.text(`${r.horas}h`,colX+colWid-2,y+3.8,{align:'right'});
            }
            y+=5.5;
            if(!multiCol&&y>278){doc.addPage();y=14;}
          });
          return y+5;
        };

        const sectionH=info=>8+6+info.regs.length*5.5+5;

        let y=33;
        if(multiCol){
          for(let i=0;i<gruposList.length;i+=2){
            const[opL,infoL]=gruposList[i];
            const hasR=i+1<gruposList.length;
            const needed=Math.max(sectionH(infoL),hasR?sectionH(gruposList[i+1][1]):0);
            if(y+needed>278&&y>35){doc.addPage();y=14;}
            const yL=renderOpSection(opL,infoL,M,colW2,y);
            if(hasR){const[opR,infoR]=gruposList[i+1];renderOpSection(opR,infoR,M+colW2+colGap,colW2,y);}
            y=y+needed;
          }
        }else{
          for(const[opN,info]of gruposList){y=renderOpSection(opN,info,M,CW,y);}
        }

        // ── Footer ──
        if(y>268){doc.addPage();y=16;}
        doc.setDrawColor(37,99,235);
        doc.setLineWidth(0.4);
        doc.line(M,y,W-M,y);
        y+=5;
        doc.setFont('helvetica','normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148,163,184);
        doc.text(`Generado el ${new Date().toLocaleDateString('es-ES',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}`,M,y);
        doc.text(`${data.length} registros · ${totalH.toFixed(1)}h · Watta`,W-M,y,{align:'right'});

        // ── Guardar ──
        const nombre=`horas_${periodoStr().replace(/[\s/–→]+/g,'_')}.pdf`;
        const isNative=!!(window.Capacitor?.isNativePlatform?.()??window.Capacitor?.isNative);
        if(isNative){
          // Guardar en caché y compartir con diálogo nativo de Android
          const base64=doc.output('datauristring').split(',')[1];
          await Filesystem.writeFile({path:nombre,data:base64,directory:Directory.Cache,recursive:true});
          const {uri}=await Filesystem.getUri({path:nombre,directory:Directory.Cache});
          await Share.share({title:nombre,url:uri,dialogTitle:'Guardar o compartir PDF'});
          sndOk();showToast('PDF listo ✓');closeModal();
        }else{
          doc.save(nombre);
          sndOk();showToast('PDF generado ✓');closeModal();
        }
      }catch(e){
        console.error('PDF error:',e);
        sndErr();showToast(`Error: ${e.message||'revisa la consola'}`,false);
      }
      setGen(false);
    };

    return(
      <BottomSheet titulo="Exportar PDF" full>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6,marginBottom:14}}>
          {[['periodo','Periodo'],['dia','Día'],['mes','Mes'],['anio','Año']].map(([m,l])=>(
            <button key={m} onClick={()=>setModo(m)} style={{padding:'10px 4px',background:modo===m?C.blue4:C.surfaceVar,color:modo===m?'#fff':C.onSurface2,border:'none',borderRadius:11,fontSize:fsS,fontWeight:700,cursor:'pointer',fontFamily:'inherit',boxShadow:modo===m?`0 3px 12px rgba(${hex2rgb(C.blue4)},.35)`:'none'}}>{l}</button>
          ))}
        </div>
        {modo==='periodo'&&<div style={{background:C.blueTint,borderRadius:11,padding:'10px 14px',marginBottom:14,fontSize:fsS,color:C.blue3,fontWeight:600}}>📅 {fmt(periodo.desde)} → {fmt(periodo.hasta)}</div>}
        {modo==='dia'&&<Field label="Día"><input style={inputStyle} type="date" value={filtDia} onChange={e=>setFiltDia(e.target.value)}/></Field>}
        {modo==='mes'&&<Field label="Mes"><input style={inputStyle} type="month" value={filtMes} onChange={e=>setFiltMes(e.target.value)}/></Field>}
        {modo==='anio'&&<Field label="Año"><select style={inputStyle} value={filtAnio} onChange={e=>setFiltAnio(e.target.value)}>{[2022,2023,2024,2025,2026,2027].map(a=><option key={a} value={a}>{a}</option>)}</select></Field>}
        {/* Selección de operarios */}
        <Field label="Operarios">
          <div style={{display:'flex',flexWrap:'wrap',gap:7,marginBottom:4}}>
            <div onClick={()=>setSelOps(ops.map(o=>o.id))} style={{display:'flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:20,cursor:'pointer',background:todosSelec?C.blue4:C.surfaceVar,border:`2px solid ${todosSelec?C.blue4:C.border}`,transition:'all .15s'}}>
              <span style={{fontSize:fsS,fontWeight:700,color:todosSelec?'#fff':C.onSurface2}}>Todos</span>
            </div>
            {ops.map(op=>{
              const sel=selOps.includes(op.id)&&!todosSelec;
              const active=selOps.includes(op.id);
              return(
                <div key={op.id} onClick={()=>{if(todosSelec)setSelOps([op.id]);else toggleOp(op.id);}} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:20,cursor:'pointer',background:active&&!todosSelec?op.color:C.surfaceVar,border:`2px solid ${active&&!todosSelec?op.color:C.border}`,transition:'all .15s'}}>
                  <div style={{width:7,height:7,borderRadius:'50%',background:active&&!todosSelec?'rgba(255,255,255,0.7)':op.color,flexShrink:0}}/>
                  <span style={{fontSize:fsS,fontWeight:600,color:active&&!todosSelec?'#fff':C.onSurface2}}>{op.nombre}</span>
                </div>
              );
            })}
          </div>
        </Field>
        <Field label="Montaje"><VisPicker items={monts} value={Number(filtMont)||''} onChange={v=>setFiltMont(v===''?'':v)} placeholder="Todos"/></Field>
        {/* Preview por operario */}
        {Object.entries(byOp).sort((a,b)=>b[1]-a[1]).map(([nombre,h])=>{
          const op=ops.find(o=>o.nombre===nombre);
          return(
            <div key={nombre} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:C.surfaceVar,borderRadius:12,marginBottom:7}}>
              <div style={{width:10,height:10,borderRadius:'50%',background:op?.color||C.blue4,flexShrink:0}}/>
              <span style={{flex:1,fontSize:fs,fontWeight:500,color:C.onSurface}}>{nombre}</span>
              <span style={{fontWeight:700,color:op?.color||C.blue4,fontSize:fs,fontFamily:'monospace'}}>{fmtH(h)}</span>
            </div>
          );
        })}
        <button onClick={exportar} disabled={gen} style={{width:'100%',marginTop:14,padding:'16px',background:gen?'#94a3b8':C.blue4,border:'none',borderRadius:14,fontSize:fs+1,color:'#fff',cursor:gen?'not-allowed':'pointer',fontFamily:'inherit',fontWeight:700,boxShadow:gen?'none':`0 4px 18px rgba(${hex2rgb(C.blue4)},.4)`,transition:'all .2s'}}>
          {gen?'⏳ Generando PDF…':'↗ Exportar PDF'}
        </button>
      </BottomSheet>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL: AJUSTES
  // ═══════════════════════════════════════════════════════════════════════════
  function BtnActualizar(){
    const [buscando,setBuscando]=useState(false);
    const buscar=async()=>{
      setBuscando(true);
      await checkUpdate(true);
      setBuscando(false);
    };
    return(
      <div style={{background:C.surfaceVar,borderRadius:14,padding:'14px 16px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontWeight:700,fontSize:fs,color:C.onSurface}}>Actualización de la app</div>
          <div style={{fontSize:fsS,color:C.onSurface3,marginTop:2}}>Versión actual: {APP_VERSION} (build {APP_BUILD})</div>
        </div>
        <button onClick={buscar} disabled={buscando} style={{padding:'9px 14px',background:C.blue4,border:'none',borderRadius:10,color:'#fff',fontSize:fsS,fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',flexShrink:0,opacity:buscando?0.6:1}}>
          {buscando?'…':'🔄 Buscar'}
        </button>
      </div>
    );
  }

  function ModalAjustes(){
    const [corteLocal,setCorteLocal]=useState(diaCorte);
    const guardarCorte=()=>{
      const v=Number(corteLocal);
      if(isNaN(v)||v<1||v>28){sndErr();showToast('Día entre 1 y 28',false);return;}
      setDiaCorte(v);sndOk();showToast('Guardado ✓');
    };
    return(
      <BottomSheet titulo="Ajustes" full>
        {/* Periodo contable */}
        <div style={{background:C.surfaceVar,borderRadius:14,padding:'16px',marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:fs,color:C.onSurface,marginBottom:4}}>Periodo contable</div>
          <div style={{fontSize:fsS,color:C.onSurface3,marginBottom:12,lineHeight:1.6}}>
            Del día <strong style={{color:C.blue4}}>{diaCorte+1}</strong> al <strong style={{color:C.blue4}}>{diaCorte}</strong> del mes siguiente.<br/>
            Periodo actual: <strong style={{color:C.onSurface}}>{fmt(periodo.desde)} → {fmt(periodo.hasta)}</strong>
          </div>
          <label style={{display:'block',fontSize:fsS,fontWeight:600,color:C.onSurface2,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Día de corte</label>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <input style={{...inputStyle,fontSize:fs+6,fontWeight:800,textAlign:'center',color:C.blue4,flex:1}} type="number" min={1} max={28} value={corteLocal} onChange={e=>setCorteLocal(e.target.value)}/>
            <button onClick={guardarCorte} style={{padding:'12px 20px',background:C.blue4,border:'none',borderRadius:12,color:'#fff',fontSize:fs,fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>Guardar</button>
          </div>
        </div>

        {/* Letras grandes */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 16px',background:C.surfaceVar,borderRadius:14,marginBottom:14}}>
          <div>
            <div style={{fontWeight:600,fontSize:fs,color:C.onSurface,marginBottom:2}}>Letras grandes</div>
            <div style={{fontSize:fsS,color:C.onSurface3}}>Mayor tamaño para mejor lectura</div>
          </div>
          <Toggle value={grande} onChange={v=>setGrande(v)}/>
        </div>

        {/* Separar 2 primeras horas */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 16px',background:C.surfaceVar,borderRadius:14,marginBottom:14}}>
          <div style={{flex:1,paddingRight:12}}>
            <div style={{fontWeight:600,fontSize:fs,color:C.onSurface,marginBottom:2}}>Separar primeras 2 horas</div>
            <div style={{fontSize:fsS,color:C.onSurface3,lineHeight:1.5}}>En días laborables normales, muestra las 2 primeras horas separadas del resto (ej: 3h → 2h + 1h)</div>
          </div>
          <Toggle value={split2h} onChange={v=>setSplit2h(v)}/>
        </div>

        {/* Tema de color */}
        <div style={{background:C.surfaceVar,borderRadius:14,padding:'16px',marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:fs,color:C.onSurface,marginBottom:12}}>Tema de color</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            {[{id:'azul',label:'Azul',c1:'#071e45',c2:'#2563eb'},{id:'verde',label:'Verde',c1:'#052e16',c2:'#16a34a'},{id:'indigo',label:'Índigo',c1:'#1e0a47',c2:'#7c3aed'}].map(t=>{
              const active=tema===t.id;
              return(
                <div key={t.id} onClick={()=>{setTema(t.id);sndOk();showToast(`Tema ${t.label} ✓`);}} style={{borderRadius:13,overflow:'hidden',cursor:'pointer',border:`2px solid ${active?t.c2:C.border}`,boxShadow:active?`0 4px 14px rgba(${hex2rgb(t.c2)},.35)`:'none',transition:'all .15s'}}>
                  <div style={{height:28,background:`linear-gradient(135deg,${t.c1},${t.c2})`}}/>
                  <div style={{padding:'7px 8px',background:active?`rgba(${hex2rgb(t.c2)},.08)`:'#fff',display:'flex',alignItems:'center',gap:6}}>
                    {active&&<div style={{width:7,height:7,borderRadius:'50%',background:t.c2,flexShrink:0}}/>}
                    <span style={{fontSize:fsS,fontWeight:active?700:500,color:active?t.c2:C.onSurface2}}>{t.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tipos de hora */}
        <div style={{background:'#f0fdf4',border:'1.5px solid #bbf7d0',borderRadius:14,padding:'14px 16px',marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:fs,color:'#166534',marginBottom:10}}>Tipos de hora</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            {TIPOS.map(t=>(
              <div key={t.id} style={{background:t.bg,borderRadius:10,padding:'10px 8px',textAlign:'center'}}>
                <div style={{fontSize:20,marginBottom:3}}>{t.emoji}</div>
                <div style={{fontSize:fsS,fontWeight:700,color:t.color}}>{t.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:7,marginBottom:14}}>
          {[{lbl:'Operarios',val:ops.length,color:C.blue4},{lbl:'Montajes',val:monts.length,color:'#d97706'},{lbl:'Registros',val:regs.length,color:C.success}].map(s=>(
            <div key={s.lbl} style={{background:C.surfaceVar,borderRadius:12,padding:'12px 10px',textAlign:'center'}}>
              <div style={{fontFamily:'monospace',fontSize:fsXL,fontWeight:800,color:s.color}}>{s.val}</div>
              <div style={{fontSize:fsS,color:C.onSurface3,marginTop:2}}>{s.lbl}</div>
            </div>
          ))}
        </div>

        <button onClick={async()=>{
          if(!confirm('¿Borrar TODOS los registros?\nOperarios y montajes se conservan.'))return;
          for(const r of regs)await deleteRegistro(r.id);
          await reload();sndDel();showToast('Registros eliminados');closeModal();
        }} style={{width:'100%',padding:'13px',background:C.danger,border:'none',borderRadius:12,fontSize:fs,color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:700,marginBottom:14}}>
          🗑 Borrar todos los registros
        </button>

        {/* Actualización */}
        <BtnActualizar/>

        {/* Firma */}
        <div style={{textAlign:'center',padding:'12px 0'}}>
          <div style={{fontSize:fsS,color:C.onSurface3}}>Creado con ♥ por Watta · {APP_VERSION} · 100% offline</div>
        </div>
      </BottomSheet>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB: CALENDARIO
  // ═══════════════════════════════════════════════════════════════════════════
  function TabCalendario(){
    const todayStr=HOY_STR();
    const horasPorTipo=TIPOS.map(t=>({...t,total:regsDelMes.filter(r=>(r.tipo||'normal')===t.id).reduce((s,r)=>s+r.horas,0)})).filter(t=>t.total>0);

    const handleDayClick=(key,dayRegs)=>{
      openModal('dia',{fecha:key,dayRegs});
    };

    return(
      <div style={{flex:1,overflowY:'auto',background:C.surfaceVar}}>
        {/* Header */}
        <div style={{background:`linear-gradient(150deg,${C.blue1} 0%,${C.blue2} 50%,${C.blue3} 100%)`,padding:'22px 18px 18px',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',top:-50,right:-30,width:200,height:200,borderRadius:'50%',background:'rgba(79,133,246,0.18)',pointerEvents:'none'}}/>
          <div style={{position:'absolute',bottom:-70,left:-50,width:170,height:170,borderRadius:'50%',background:'rgba(14,47,104,0.5)',pointerEvents:'none'}}/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16,position:'relative'}}>
            <div>
              <div style={{fontSize:fsXL+4,fontWeight:800,color:'#fff',lineHeight:1.1}}>¡Hola! 👋</div>
              <div style={{fontSize:fs,color:'rgba(255,255,255,0.6)',marginTop:3}}>Control de Horas Extras</div>
              <div style={{marginTop:6}}>
                <span style={{fontSize:fsS-1,color:'rgba(255,255,255,0.45)',fontWeight:400}}>Creado con ♥ por Watta</span>
              </div>
            </div>
            {/* Tarjeta operarios del periodo */}
            <div style={{background:'rgba(255,255,255,0.15)',borderRadius:14,padding:'12px 16px',backdropFilter:'blur(10px)',border:'1px solid rgba(255,255,255,0.18)',minWidth:136}}>
              {ops.filter(op=>regsDelMes.some(r=>r.operario_id===op.id)).map(op=>{
                const h=regsDelMes.filter(r=>r.operario_id===op.id).reduce((s,r)=>s+r.horas,0);
                return(
                  <div key={op.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:5}}>
                    <div style={{display:'flex',alignItems:'center',gap:5}}>
                      <div style={{width:7,height:7,borderRadius:'50%',background:op.color,flexShrink:0}}/>
                      <span style={{fontSize:fsS-1,color:'rgba(255,255,255,0.85)',fontWeight:500}}>{op.nombre}</span>
                    </div>
                    <span style={{fontFamily:'monospace',fontWeight:800,color:'#fff',fontSize:fsS+1,flexShrink:0}}>{fmtH(h)}</span>
                  </div>
                );
              })}
              {!regsDelMes.length&&<div style={{fontSize:fsS-1,color:'rgba(255,255,255,0.45)'}}>Sin registros</div>}
              <div style={{fontSize:fsS-2,color:'rgba(255,255,255,0.38)',marginTop:4,borderTop:'1px solid rgba(255,255,255,0.1)',paddingTop:4}}>{fmt(periodo.desde)} → {fmt(periodo.hasta)}</div>
            </div>
          </div>

          {/* Accesos rápidos */}
          <div style={{display:'flex',gap:8}}>
            {[{label:'Operarios',icon:'👤',action:()=>openModal('ops')},{label:'Montajes',icon:'⚒',action:()=>openModal('monts')},{label:'PDF',icon:'↗',action:()=>openModal('pdf')},{label:'Ajustes',icon:'⚙',action:()=>openModal('aj')}].map(b=>(
              <button key={b.label} onClick={b.action} style={{flex:1,background:'rgba(255,255,255,0.13)',border:'1px solid rgba(255,255,255,0.18)',borderRadius:14,padding:'10px 4px',display:'flex',flexDirection:'column',alignItems:'center',gap:5,cursor:'pointer',backdropFilter:'blur(8px)'}}>
                <span style={{fontSize:19}}>{b.icon}</span>
                <span style={{fontSize:fsS-1,color:'rgba(255,255,255,0.9)',fontWeight:600,letterSpacing:'0.01em'}}>{b.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tarjeta calendario */}
        <div style={{margin:'8px 10px 8px',background:C.surface,borderRadius:20,boxShadow:'0 8px 32px rgba(15,45,107,0.14)',padding:'14px 6px 10px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 6px',marginBottom:10}}>
            <button onClick={()=>changeMonth(-1)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:C.onSurface2,padding:'4px 10px'}}>‹</button>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:fsL,fontWeight:700,color:C.onSurface}}>{MESES[vMonth]} {vYear}</div>
              <div style={{fontSize:fsS-1,color:C.blue4,fontWeight:600}}>{fmt(periodo.desde)} – {fmt(periodo.hasta)}</div>
            </div>
            <button onClick={()=>changeMonth(1)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:C.onSurface2,padding:'4px 10px'}}>›</button>
          </div>

          {/* Cabecera días */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:3}}>
            {DIAS.map((d,i)=><div key={d} style={{textAlign:'center',fontSize:fsS-2,fontWeight:700,color:i>=5?'#6d28d9':C.onSurface3,padding:'3px 0',letterSpacing:'0.04em'}}>{d}</div>)}
          </div>

          {/* Grid días */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3}}>
            {buildDays().map((d,i)=>{
              if(!d)return<div key={`e${i}`}/>;
              const key=`${vYear}-${pad(vMonth+1)}-${pad(d)}`;
              const dayRegs=regsPorFecha[key]||[];
              const dayH=dayRegs.reduce((s,r)=>s+r.horas,0);
              const isToday=key===todayStr;
              const inPeriod=key>=periodo.desde&&key<=periodo.hasta;
              const hasReg=dayRegs.length>0;
              const dow=new Date(key+'T12:00:00').getDay();
              const isWeekend=dow===0||dow===6;
              const isFestivo=esFestivo(key);
              const nlDay=getDiaNL(key);

              const cellBg=isToday?C.blue4
                :nlDay?nlDay.color+'28'
                :isFestivo?'#fef9c3'
                :isWeekend?'#e8e4ff'
                :hasReg?C.surfaceDim
                :inPeriod?C.surfaceVar:'#f8f9fc';
              const cellBorderTop=!isToday&&nlDay?`2px solid ${nlDay.color}`
                :!isToday&&isFestivo?'2px solid #fbbf24'
                :!isToday&&isWeekend?'2px solid #8b5cf6'
                :'none';

              return(
                <div key={key} onClick={()=>handleDayClick(key,dayRegs)}
                  style={{borderRadius:12,padding:'8px 2px 6px',display:'flex',flexDirection:'column',alignItems:'center',gap:3,cursor:'pointer',minHeight:hasReg?80:(nlDay||isFestivo)?72:58,minWidth:0,overflow:'hidden',background:cellBg,borderTop:cellBorderTop,boxShadow:isToday?`0 4px 12px rgba(${hex2rgb(C.blue4)},.4)`:'none',opacity:inPeriod?1:0.38,transition:'all .1s',position:'relative'}}>

                  {/* Número día */}
                  <span style={{fontSize:fs+1,fontWeight:isToday||hasReg?700:500,color:isToday?'#fff':C.onSurface,lineHeight:1}}>{d}</span>
                  {/* Indicador no laboral */}
                  {nlDay&&!isToday&&(
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2,width:'100%'}}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:nlDay.color,flexShrink:0}}/>
                      <span style={{fontSize:9,fontWeight:700,color:nlDay.color,textAlign:'center',lineHeight:1.3,width:'100%',wordBreak:'break-word',whiteSpace:'normal',padding:'0 3px'}}>{nlDay.motivo}</span>
                    </div>
                  )}
                  {/* Nombre festivo */}
                  {!nlDay&&!isToday&&isFestivo&&(()=>{
                    const nombre=getNombreFestivo(key);
                    return nombre?<span style={{fontSize:9,fontWeight:700,color:'#b45309',textAlign:'center',lineHeight:1.3,width:'100%',wordBreak:'break-word',whiteSpace:'normal',padding:'0 3px'}}>{nombre}</span>:null;
                  })()}

                  {hasReg?(
                    <>
                      {/* Chips operarios — máx 2 */}
                      {dayRegs.slice(0,2).map((r,ri)=>{
                        const op=ops.find(o=>o.id===r.operario_id);
                        const opC=op?.color||r.operario_color||C.blue4;
                        const shortName=r.operario_nombre?.split(' ')[0]?.slice(0,6)||'?';
                        return(
                          <div key={ri} style={{background:isToday?'rgba(255,255,255,0.25)':opC,borderRadius:4,padding:'1px 3px',display:'flex',alignItems:'center',gap:2,width:'96%',maxWidth:'96%',overflow:'hidden',boxSizing:'border-box'}}>
                            <div style={{width:4,height:4,borderRadius:'50%',background:isToday?'#fff':opC+'44',flexShrink:0,border:isToday?'1px solid rgba(255,255,255,0.5)':'1px solid rgba(255,255,255,0.4)'}}/>
                            <span style={{fontSize:7,fontWeight:700,color:'#fff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',lineHeight:1.2}}>{shortName} {r.horas}h</span>
                          </div>
                        );
                      })}
                      {dayRegs.length>2&&<span style={{fontSize:7,color:isToday?'rgba(255,255,255,0.7)':C.onSurface3,fontWeight:600}}>+{dayRegs.length-2} más</span>}
                    </>
                  ):(
                    !nlDay&&<span style={{fontSize:14,color:isToday?'rgba(255,255,255,0.6)':inPeriod?C.blue4:C.onSurface3,lineHeight:1}}>+</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>


        <div style={{height:82}}/>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB: HISTORIAL
  // ═══════════════════════════════════════════════════════════════════════════
  function TabHistorial(){
    const [filtOp,setFiltOp]=useState('');
    const [filtMont,setFiltMont]=useState('');
    const [filtTipo,setFiltTipo]=useState('');
    const [busca,setBusca]=useState('');

    const filtrados=regs.filter(r=>{
      if(filtOp&&r.operario_id!==Number(filtOp))return false;
      if(filtMont&&r.montaje_id!==Number(filtMont))return false;
      if(filtTipo&&(r.tipo||'normal')!==filtTipo)return false;
      if(busca&&!r.operario_nombre?.toLowerCase().includes(busca.toLowerCase())&&!r.montaje_nombre?.toLowerCase().includes(busca.toLowerCase()))return false;
      return true;
    }).sort((a,b)=>b.fecha.localeCompare(a.fecha));

    const total=filtrados.reduce((s,r)=>s+r.horas,0);
    const porFecha=filtrados.reduce((acc,r)=>{(acc[r.fecha]=acc[r.fecha]||[]).push(r);return acc;},{});
    const totalPrim=split2h?filtrados.reduce((s,r)=>{
      const dow=new Date(r.fecha+'T12:00:00').getDay();
      const esNorm=dow>=1&&dow<=5&&!esFestivo(r.fecha)&&!getDiaNL(r.fecha);
      return s+(esNorm?Math.min(r.horas,2):0);
    },0):0;
    const totalRest=split2h?filtrados.reduce((s,r)=>{
      const dow=new Date(r.fecha+'T12:00:00').getDay();
      const esNorm=dow>=1&&dow<=5&&!esFestivo(r.fecha)&&!getDiaNL(r.fecha);
      return s+(esNorm?Math.max(r.horas-2,0):0);
    },0):0;

    // Resumen operarios (del periodo actual)
    const resOps=ops.map(op=>({
      ...op,
      hPer:regsDelMes.filter(r=>r.operario_id===op.id).reduce((s,r)=>s+r.horas,0),
      hTot:regs.filter(r=>r.operario_id===op.id).reduce((s,r)=>s+r.horas,0),
    })).filter(op=>op.hTot>0).sort((a,b)=>b.hPer-a.hPer);
    const maxPer=resOps[0]?.hPer||1;

    return(
      <div style={{flex:1,overflowY:'auto',background:C.surfaceVar}}>
        {/* Header */}
        <div style={{background:`linear-gradient(150deg,${C.blue1} 0%,${C.blue2} 50%,${C.blue3} 100%)`,padding:'22px 16px 18px',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',top:-50,right:-30,width:180,height:180,borderRadius:'50%',background:'rgba(79,133,246,0.15)',pointerEvents:'none'}}/>
          <div style={{fontSize:fsXL,fontWeight:800,color:'#fff',marginBottom:10,position:'relative'}}>Historial</div>
          <input style={{width:'100%',background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.2)',borderRadius:12,padding:'11px 14px',fontSize:fs,color:'#fff',fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}
            placeholder="🔍 Buscar operario o montaje…" value={busca} onChange={e=>setBusca(e.target.value)}/>
        </div>

        <div style={{padding:'10px 10px 0'}}>

          {/* ── RESUMEN OPERARIOS ── */}
          {resOps.length>0&&!busca&&!filtOp&&!filtMont&&!filtTipo&&(
            <div style={{background:C.surface,borderRadius:16,padding:'14px 16px',marginBottom:10,boxShadow:'0 2px 10px rgba(15,45,107,0.07)'}}>
              <div style={{fontSize:fsS,fontWeight:700,color:C.onSurface2,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>Operarios · Periodo actual</div>
              {resOps.map(op=>{
                const regsOp=regsDelMes.filter(r=>r.operario_id===op.id);
                const oNorm=regsOp.filter(r=>(r.tipo||'normal')==='normal').reduce((s,r)=>s+r.horas,0);
                const oFest=regsOp.filter(r=>(r.tipo||'normal')==='festiva').reduce((s,r)=>s+r.horas,0);
                const oNoct=regsOp.filter(r=>(r.tipo||'normal')==='nocturna').reduce((s,r)=>s+r.horas,0);
                const oPrim=split2h?regsOp.filter(r=>(r.tipo||'normal')==='normal').reduce((s,r)=>{
                  const dow=new Date(r.fecha+'T12:00:00').getDay();
                  return s+(dow>=1&&dow<=5&&!esFestivo(r.fecha)&&!getDiaNL(r.fecha)?Math.min(r.horas,2):0);
                },0):0;
                const oRest=split2h?regsOp.filter(r=>(r.tipo||'normal')==='normal').reduce((s,r)=>{
                  const dow=new Date(r.fecha+'T12:00:00').getDay();
                  return s+(dow>=1&&dow<=5&&!esFestivo(r.fecha)&&!getDiaNL(r.fecha)?Math.max(r.horas-2,0):0);
                },0):0;
                return(
                  <div key={op.id} style={{marginBottom:14}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                      <div style={{display:'flex',alignItems:'center',gap:9}}>
                        <div style={{width:32,height:32,borderRadius:9,background:op.color,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          <span style={{color:'#fff',fontWeight:800,fontSize:fsS}}>{op.nombre[0]}</span>
                        </div>
                        <div>
                          <div style={{fontSize:fs,fontWeight:600,color:C.onSurface,lineHeight:1.2}}>{op.nombre}</div>
                          <div style={{fontSize:fsS-1,color:C.onSurface3,marginTop:1}}>{fmtH(op.hTot)} total</div>
                        </div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:fsL,fontWeight:800,color:op.color,fontFamily:'monospace',lineHeight:1}}>{fmtH(op.hPer)}</div>
                        <div style={{fontSize:fsS-1,color:C.onSurface3}}>este periodo</div>
                      </div>
                    </div>
                    <div style={{height:5,background:C.surfaceDim,borderRadius:3,overflow:'hidden',marginBottom:7}}>
                      <div style={{height:'100%',width:`${Math.round(op.hPer/maxPer*100)}%`,background:op.color,borderRadius:3,transition:'width .4s'}}/>
                    </div>
                    {/* Desglose individual */}
                    <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                      {oNorm>0&&!split2h&&<span style={{background:'#dbeafe',color:'#2563eb',borderRadius:7,padding:'2px 8px',fontSize:fsS-1,fontWeight:600}}>🕐 {fmtH(oNorm)}</span>}
                      {oNorm>0&&split2h&&<>
                        <span style={{background:'#dbeafe',color:'#2563eb',borderRadius:7,padding:'2px 8px',fontSize:fsS-1,fontWeight:600}}>Prim. {fmtH(oPrim)}</span>
                        <span style={{background:'#ede9fe',color:'#7c3aed',borderRadius:7,padding:'2px 8px',fontSize:fsS-1,fontWeight:600}}>Rest. {fmtH(oRest)}</span>
                      </>}
                      {oFest>0&&<span style={{background:'#fee2e2',color:'#dc2626',borderRadius:7,padding:'2px 8px',fontSize:fsS-1,fontWeight:600}}>🎉 {fmtH(oFest)}</span>}
                      {oNoct>0&&<span style={{background:'#ede9fe',color:'#7c3aed',borderRadius:7,padding:'2px 8px',fontSize:fsS-1,fontWeight:600}}>🌙 {fmtH(oNoct)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Filtros */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <VisPicker items={ops} value={Number(filtOp)||''} onChange={v=>setFiltOp(v===''?'':v)} placeholder="Operario"/>
            <VisPicker items={monts} value={Number(filtMont)||''} onChange={v=>setFiltMont(v===''?'':v)} placeholder="Montaje"/>
          </div>

          {/* Filtro tipo */}
          <div style={{display:'flex',gap:6,marginBottom:10}}>
            {[{id:'',label:'Todos',emoji:'',color:C.blue4,bg:C.blueTint},...TIPOS].map(t=>(
              <button key={t.id} onClick={()=>setFiltTipo(t.id)} style={{flex:1,padding:'8px 2px',background:filtTipo===t.id?(t.bg||C.blueTint):C.surfaceVar,color:filtTipo===t.id?(t.color||C.blue4):C.onSurface2,border:`1.5px solid ${filtTipo===t.id?(t.color||C.blue4):'transparent'}`,borderRadius:10,fontSize:fsS-1,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                {t.emoji&&`${t.emoji} `}{t.label}
              </button>
            ))}
          </div>

          {/* Total filtrado — solo cuando hay filtro activo */}
          {(filtOp||filtMont||filtTipo||busca)&&(
            <div style={{background:C.blue4,borderRadius:14,padding:'12px 16px',marginBottom:12,boxShadow:`0 4px 16px rgba(${hex2rgb(C.blue4)},.3)`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{color:'rgba(255,255,255,0.8)',fontSize:fsS}}>{filtrados.length} registros</span>
                <span style={{color:'#fff',fontWeight:800,fontSize:fsXL,fontFamily:'monospace'}}>{fmtH(total)}</span>
              </div>
              {split2h&&(totalPrim>0||totalRest>0)&&(
                <div style={{display:'flex',gap:10,marginTop:8,paddingTop:8,borderTop:'1px solid rgba(255,255,255,0.2)'}}>
                  <div style={{flex:1,background:'rgba(255,255,255,0.15)',borderRadius:10,padding:'8px 10px',textAlign:'center'}}>
                    <div style={{fontSize:fsS-1,color:'rgba(255,255,255,0.7)',marginBottom:2}}>Primeras</div>
                    <div style={{fontWeight:800,fontSize:fsL,color:'#fff',fontFamily:'monospace'}}>{fmtH(totalPrim)}</div>
                  </div>
                  <div style={{flex:1,background:'rgba(255,255,255,0.15)',borderRadius:10,padding:'8px 10px',textAlign:'center'}}>
                    <div style={{fontSize:fsS-1,color:'rgba(255,255,255,0.7)',marginBottom:2}}>Restantes</div>
                    <div style={{fontWeight:800,fontSize:fsL,color:'#fff',fontFamily:'monospace'}}>{fmtH(totalRest)}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Lista */}
          {Object.entries(porFecha).map(([fecha,rs])=>(
            <div key={fecha} style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6,padding:'0 3px'}}>
                <span style={{fontSize:fsS,fontWeight:700,color:C.onSurface2,textTransform:'uppercase',letterSpacing:'0.05em'}}>{fmt(fecha)}</span>
                <span style={{fontSize:fsS,fontWeight:700,color:C.blue4,fontFamily:'monospace'}}>{fmtH(rs.reduce((s,r)=>s+r.horas,0))}</span>
              </div>
              {rs.map(r=>{
                const op=ops.find(o=>o.id===r.operario_id);
                const mo=monts.find(m=>m.id===r.montaje_id);
                const opC=op?.color||r.operario_color||C.blue4;
                const moC=mo?.color||r.montaje_color||C.onSurface3;
                const ti=tipoOf(r.tipo||'normal');
                return(
                  <div key={r.id} onClick={()=>openModal('horas',{fecha:r.fecha,regEdit:r})} style={{background:C.surface,borderRadius:14,padding:'12px 14px',marginBottom:7,display:'flex',alignItems:'center',gap:12,boxShadow:'0 2px 10px rgba(15,45,107,0.07)',borderLeft:`4px solid ${opC}`,cursor:'pointer'}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:fs,color:C.onSurface,marginBottom:4}}>{r.operario_nombre}</div>
                      <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
                        <span style={{background:`rgba(${hex2rgb(moC)},.12)`,color:moC,borderRadius:6,padding:'2px 8px',fontSize:fsS,fontWeight:600}}>{r.montaje_nombre}</span>
                        <span style={{background:ti.bg,color:ti.color,borderRadius:6,padding:'2px 7px',fontSize:fsS,fontWeight:600}}>{ti.emoji} {ti.label}</span>
                        {r.nota&&<span style={{fontSize:fsS,color:C.onSurface3,fontStyle:'italic'}}>{r.nota}</span>}
                      </div>
                    </div>
                    {(()=>{
                      const dow=new Date(r.fecha+'T12:00:00').getDay();
                      const esNormal=split2h&&dow>=1&&dow<=5&&!esFestivo(r.fecha)&&!getDiaNL(r.fecha)&&r.horas>2;
                      if(esNormal) return(
                        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:1,flexShrink:0}}>
                          <span style={{fontWeight:800,fontSize:fsL+2,color:opC,fontFamily:'monospace',lineHeight:1}}>{r.horas}h</span>
                          <span style={{fontSize:fsS-1,color:C.onSurface3,fontWeight:500}}>Prim. <span style={{color:opC,fontWeight:700}}>2h</span> · Rest. <span style={{color:opC,fontWeight:700}}>{parseFloat((r.horas-2).toFixed(1))}h</span></span>
                        </div>
                      );
                      return <div style={{fontWeight:800,fontSize:fsL+2,color:opC,fontFamily:'monospace',flexShrink:0}}>{r.horas}h</div>;
                    })()}
                    <button onClick={async e=>{e.stopPropagation();if(!confirm('¿Eliminar?'))return;await deleteRegistro(r.id);sndDel();await reload();showToast('Eliminado');}} style={{background:'none',border:'none',color:'#fca5a5',fontSize:18,cursor:'pointer',padding:'4px',flexShrink:0}}>✕</button>
                  </div>
                );
              })}
            </div>
          ))}
          {filtrados.length===0&&<div style={{textAlign:'center',color:C.onSurface3,padding:'40px 0',fontSize:fsL}}>Sin registros</div>}
        </div>
        <div style={{height:80}}/>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB: ESTADÍSTICAS
  // ═══════════════════════════════════════════════════════════════════════════
  function TabStats(){
    const opsConRegs=ops.filter(op=>regs.some(r=>r.operario_id===op.id));

    return(
      <div style={{flex:1,overflowY:'auto',background:C.surfaceVar}}>
        <div style={{background:`linear-gradient(150deg,${C.blue1} 0%,${C.blue2} 50%,${C.blue3} 100%)`,padding:'22px 16px 18px',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',top:-50,right:-30,width:180,height:180,borderRadius:'50%',background:'rgba(79,133,246,0.15)',pointerEvents:'none'}}/>
          <div style={{fontSize:fsXL,fontWeight:800,color:'#fff',marginBottom:3,position:'relative'}}>Estadísticas</div>
          <div style={{fontSize:fsS,color:'rgba(255,255,255,0.55)'}}>{opsConRegs.length} operario{opsConRegs.length!==1?'s':''} · {regs.length} registros</div>
        </div>

        <div style={{padding:'12px 10px 0'}}>
          {opsConRegs.length===0&&(
            <div style={{textAlign:'center',padding:'60px 20px',color:C.onSurface3,fontSize:fsL}}>Sin registros todavía</div>
          )}

          {opsConRegs.map(op=>{
            const regsOp=regs.filter(r=>r.operario_id===op.id);
            const totalOp=regsOp.reduce((s,r)=>s+r.horas,0);
            const perOp=regsDelMes.filter(r=>r.operario_id===op.id).reduce((s,r)=>s+r.horas,0);
            const diasOp=new Set(regsOp.map(r=>r.fecha)).size;

            // Tipos
            const hNorm=regsOp.filter(r=>(r.tipo||'normal')==='normal').reduce((s,r)=>s+r.horas,0);
            const hFest=regsOp.filter(r=>(r.tipo||'normal')==='festiva').reduce((s,r)=>s+r.horas,0);
            const hNoct=regsOp.filter(r=>(r.tipo||'normal')==='nocturna').reduce((s,r)=>s+r.horas,0);

            // Split primeras/resto (solo normales en días laborables)
            const hPrim=split2h?regsOp.filter(r=>(r.tipo||'normal')==='normal').reduce((s,r)=>{
              const dow=new Date(r.fecha+'T12:00:00').getDay();
              return s+(dow>=1&&dow<=5&&!esFestivo(r.fecha)&&!getDiaNL(r.fecha)?Math.min(r.horas,2):0);
            },0):0;
            const hRest=split2h?regsOp.filter(r=>(r.tipo||'normal')==='normal').reduce((s,r)=>{
              const dow=new Date(r.fecha+'T12:00:00').getDay();
              return s+(dow>=1&&dow<=5&&!esFestivo(r.fecha)&&!getDiaNL(r.fecha)?Math.max(r.horas-2,0):0);
            },0):0;

            // Gráfico 6 periodos del operario
            const periodos6=Array.from({length:6},(_,i)=>{
              let m=vMonth-5+i,y=vYear;
              if(m<0){m+=12;y--;}if(m>11){m-=12;y++;}
              const p=calcPeriodo(y,m,diaCorte);
              const h=regsOp.filter(r=>r.fecha>=p.desde&&r.fecha<=p.hasta).reduce((s,r)=>s+r.horas,0);
              return{label:MESES_C[m],h,isCur:m===vMonth&&y===vYear};
            });
            const maxH=Math.max(...periodos6.map(p=>p.h),1);

            // Mejor periodo
            const mejorH=Math.max(...periodos6.map(p=>p.h));
            const mejorMes=periodos6.find(p=>p.h===mejorH&&mejorH>0);

            return(
              <div key={op.id} style={{background:C.surface,borderRadius:18,marginBottom:12,boxShadow:'0 2px 12px rgba(15,45,107,0.08)',overflow:'hidden'}}>
                {/* Cabecera operario */}
                <div style={{background:`linear-gradient(135deg,${op.color}22,${op.color}08)`,borderBottom:`2px solid ${op.color}33`,padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:38,height:38,borderRadius:11,background:op.color,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <span style={{color:'#fff',fontWeight:800,fontSize:fsL}}>{op.nombre[0]}</span>
                    </div>
                    <div>
                      <div style={{fontSize:fs+1,fontWeight:700,color:C.onSurface}}>{op.nombre}</div>
                      <div style={{fontSize:fsS-1,color:C.onSurface3}}>{diasOp} día{diasOp!==1?'s':''} trabajados</div>
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:fsXL,fontWeight:800,color:op.color,fontFamily:'monospace',lineHeight:1}}>{fmtH(totalOp)}</div>
                    <div style={{fontSize:fsS-1,color:C.onSurface3}}>total histórico</div>
                  </div>
                </div>

                <div style={{padding:'14px 16px'}}>
                  {/* Periodo actual + mejor */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
                    <div style={{background:C.surfaceVar,borderRadius:12,padding:'11px 12px'}}>
                      <div style={{fontSize:fsS-1,color:C.onSurface3,marginBottom:3}}>Periodo actual</div>
                      <div style={{fontSize:fsL+2,fontWeight:800,color:op.color,fontFamily:'monospace'}}>{fmtH(perOp)}</div>
                    </div>
                    <div style={{background:C.surfaceVar,borderRadius:12,padding:'11px 12px'}}>
                      <div style={{fontSize:fsS-1,color:C.onSurface3,marginBottom:3}}>Mejor periodo</div>
                      <div style={{fontSize:fsL+2,fontWeight:800,color:op.color,fontFamily:'monospace'}}>{mejorMes?fmtH(mejorH):'—'}</div>
                      {mejorMes&&<div style={{fontSize:fsS-2,color:C.onSurface3}}>{mejorMes.label}</div>}
                    </div>
                  </div>

                  {/* Desglose tipos */}
                  <div style={{marginBottom:14}}>
                    <div style={{fontSize:fsS,fontWeight:700,color:C.onSurface2,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>Desglose</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      {hNorm>0&&!split2h&&<div style={{background:'#dbeafe',borderRadius:10,padding:'8px 12px',textAlign:'center',minWidth:70}}>
                        <div style={{fontSize:11,color:'#2563eb',fontWeight:600,marginBottom:2}}>🕐 Normal</div>
                        <div style={{fontSize:fsL,fontWeight:800,color:'#2563eb',fontFamily:'monospace'}}>{fmtH(hNorm)}</div>
                      </div>}
                      {hNorm>0&&split2h&&<>
                        <div style={{background:'#dbeafe',borderRadius:10,padding:'8px 12px',textAlign:'center',minWidth:70}}>
                          <div style={{fontSize:11,color:'#2563eb',fontWeight:600,marginBottom:2}}>Primeras</div>
                          <div style={{fontSize:fsL,fontWeight:800,color:'#2563eb',fontFamily:'monospace'}}>{fmtH(hPrim)}</div>
                        </div>
                        <div style={{background:'#ede9fe',borderRadius:10,padding:'8px 12px',textAlign:'center',minWidth:70}}>
                          <div style={{fontSize:11,color:'#7c3aed',fontWeight:600,marginBottom:2}}>Restantes</div>
                          <div style={{fontSize:fsL,fontWeight:800,color:'#7c3aed',fontFamily:'monospace'}}>{fmtH(hRest)}</div>
                        </div>
                      </>}
                      {hFest>0&&<div style={{background:'#fee2e2',borderRadius:10,padding:'8px 12px',textAlign:'center',minWidth:70}}>
                        <div style={{fontSize:11,color:'#dc2626',fontWeight:600,marginBottom:2}}>🎉 Festiva</div>
                        <div style={{fontSize:fsL,fontWeight:800,color:'#dc2626',fontFamily:'monospace'}}>{fmtH(hFest)}</div>
                      </div>}
                      {hNoct>0&&<div style={{background:'#ede9fe',borderRadius:10,padding:'8px 12px',textAlign:'center',minWidth:70}}>
                        <div style={{fontSize:11,color:'#7c3aed',fontWeight:600,marginBottom:2}}>🌙 Nocturna</div>
                        <div style={{fontSize:fsL,fontWeight:800,color:'#7c3aed',fontFamily:'monospace'}}>{fmtH(hNoct)}</div>
                      </div>}
                    </div>
                  </div>

                  {/* Gráfico 6 periodos */}
                  <div>
                    <div style={{fontSize:fsS,fontWeight:700,color:C.onSurface2,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10}}>Últimos 6 periodos</div>
                    <div style={{display:'flex',alignItems:'flex-end',gap:5,height:90}}>
                      {periodos6.map((p,i)=>(
                        <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                          {p.h>0&&<span style={{fontSize:9,color:p.isCur?op.color:C.onSurface3,fontWeight:700,fontFamily:'monospace'}}>{p.h%1===0?p.h:p.h.toFixed(1)}</span>}
                          <div style={{width:'100%',height:Math.max(p.h/maxH*64,p.h>0?4:2),background:p.isCur?op.color:C.surfaceDim,borderRadius:'4px 4px 0 0',minHeight:2}}/>
                          <span style={{fontSize:9,color:p.isCur?op.color:C.onSurface3,fontWeight:p.isCur?700:400}}>{p.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div style={{textAlign:'center',padding:'16px 0 4px'}}>
            <div style={{fontSize:fsS,color:C.onSurface3}}>Creado con ♥ por Watta</div>
          </div>
        </div>
        <div style={{height:80}}/>
      </div>
    );
  }

  // ─── MODAL ACTIVO ─────────────────────────────────────────────────────────
  function ActiveModal(){
    if(!modal)return null;
    if(modal.type==='dia')   return<ModalDia fecha={modal.data.fecha} dayRegs={modal.data.dayRegs}/>;
    if(modal.type==='horas') return<ModalHoras fecha={modal.data?.fecha} regEdit={modal.data?.regEdit}/>;
    if(modal.type==='ops')   return<ModalOperarios/>;
    if(modal.type==='monts') return<ModalMontajes/>;
    if(modal.type==='pdf')   return<ModalPDF/>;
    if(modal.type==='aj')    return<ModalAjustes/>;
    return null;
  }

  // ─── LAYOUT ───────────────────────────────────────────────────────────────
  const NAV_ICONS={
    cal:c=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2.5"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    hist:c=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 6 12 12 16 14"/></svg>,
    stats:c=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  };
  const navItems=[{id:'cal',label:'Calendario'},{id:'hist',label:'Historial'},{id:'stats',label:'Stats'}];

  return(
    <div style={{height:'100vh',display:'flex',flexDirection:'column',background:C.surfaceVar,fontFamily:"'IBM Plex Sans',system-ui,sans-serif",fontSize:fs,color:C.onSurface,overflow:'hidden'}}>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflowY:'hidden',position:'relative'}}>
        {tab==='cal'  &&<TabCalendario/>}
        {tab==='hist' &&<TabHistorial/>}
        {tab==='stats'&&<TabStats/>}
        {tab==='cal'&&(
          <button onClick={()=>openModal('horas',{fecha:HOY_STR()})} style={{position:'fixed',bottom:82,right:18,width:58,height:58,borderRadius:'50%',background:C.blue4,border:'none',boxShadow:`0 8px 28px rgba(${hex2rgb(C.blue4)},.55),0 2px 8px rgba(0,0,0,.15)`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',zIndex:100,fontSize:28,color:'#fff',fontWeight:300,lineHeight:1}}>
            +
          </button>
        )}
      </div>
      <div style={{height:72,background:C.surface,borderTop:`1px solid ${C.border}`,display:'flex',alignItems:'center',paddingBottom:'env(safe-area-inset-bottom,4px)',boxShadow:'0 -4px 20px rgba(7,30,69,0.09)',flexShrink:0}}>
        {navItems.map(n=>{
          const active=tab===n.id;
          return(
            <button key={n.id} onClick={()=>navTab(n.id)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,background:'none',border:'none',cursor:'pointer',padding:'4px',fontFamily:'inherit'}}>
              <div style={{width:54,height:34,borderRadius:17,background:active?C.blueTint:'transparent',display:'flex',alignItems:'center',justifyContent:'center',transition:'background .2s'}}>
                {NAV_ICONS[n.id](active?C.blue4:C.onSurface3)}
              </div>
              <span style={{fontSize:fsS-1,fontWeight:active?700:500,color:active?C.blue4:C.onSurface3,transition:'color .2s'}}>{n.label}</span>
            </button>
          );
        })}
      </div>
      <ActiveModal/>
      <Toast/>
      <ModalUpdate/>
    </div>
  );
}
