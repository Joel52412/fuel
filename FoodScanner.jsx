import { useState, useEffect, useRef } from "react";

const MEALS = ['Breakfast','Pre-Workout','Lunch','Post-Workout','Dinner','Snacks'];
const MC = { cal:'#FF3D5A', pro:'#00C97A', carb:'#FFB700', fat:'#A78BFA' };
const ML = { cal:'KCAL', pro:'PROTEIN', carb:'CARBS', fat:'FAT' };

function todayKey() { return new Date().toISOString().split('T')[0]; }
function getMeal() {
  const h = new Date().getHours();
  if (h<10) return 'Breakfast'; if (h<12) return 'Pre-Workout';
  if (h<14) return 'Lunch'; if (h<17) return 'Post-Workout';
  if (h<20) return 'Dinner'; return 'Snacks';
}

function Ring({ pct, color, size=120 }) {
  const r=(size-10)/2, circ=2*Math.PI*r;
  const [anim,setAnim]=useState(false);
  useEffect(()=>{ const t=setTimeout(()=>setAnim(true),300); return()=>clearTimeout(t);},[pct]);
  return (
    <svg width={size} height={size} style={{transform:'rotate(-90deg)',display:'block'}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={circ} strokeDashoffset={circ*(1-(anim?Math.min(pct,1):0))} strokeLinecap="round"
        style={{transition:'stroke-dashoffset 1.3s cubic-bezier(.4,0,.2,1)'}}/>
    </svg>
  );
}

function SmallRing({ pct, color, size=72 }) {
  const r=(size-8)/2, circ=2*Math.PI*r;
  const [anim,setAnim]=useState(false);
  useEffect(()=>{ const t=setTimeout(()=>setAnim(true),400); return()=>clearTimeout(t);},[pct]);
  return (
    <svg width={size} height={size} style={{transform:'rotate(-90deg)',display:'block'}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={circ*(1-(anim?Math.min(pct,1):0))} strokeLinecap="round"
        style={{transition:'stroke-dashoffset 1.3s cubic-bezier(.4,0,.2,1)'}}/>
    </svg>
  );
}

export default function App() {
  const [screen,setScreen]=useState('home');
  const [product,setProduct]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [servings,setServings]=useState(1);
  const [meal,setMeal]=useState(getMeal());
  const [todayLog,setTodayLog]=useState([]);
  const [sheetsUrl,setSheetsUrl]=useState('');
  const [targets,setTargets]=useState({cal:3200,pro:165,carb:445,fat:85});
  const [logStatus,setLogStatus]=useState('');
  const [manualCode,setManualCode]=useState('');
  const [cameraErr,setCameraErr]=useState('');
  const [scanning,setScanning]=useState(false);
  const [urlInput,setUrlInput]=useState('');
  const [tgEdit,setTgEdit]=useState({cal:3200,pro:165,carb:445,fat:85});
  const [scanFlash,setScanFlash]=useState(false);

  const videoRef=useRef(null);
  const streamRef=useRef(null);
  const detectorRef=useRef(null);
  const rafRef=useRef(null);

  useEffect(()=>{
    (async()=>{
      try {
        const r1=await window.storage.get('ft_url'); if(r1){setSheetsUrl(r1.value);setUrlInput(r1.value);}
        const r2=await window.storage.get('ft_targets'); if(r2){const t=JSON.parse(r2.value);setTargets(t);setTgEdit(t);}
        const r3=await window.storage.get('ft_log_'+todayKey()); if(r3)setTodayLog(JSON.parse(r3.value));
      } catch(e){}
    })();
  },[]);

  const totals=todayLog.reduce((a,e)=>({cal:a.cal+(e.calories||0),pro:a.pro+(e.protein||0),carb:a.carb+(e.carbs||0),fat:a.fat+(e.fat||0)}),{cal:0,pro:0,carb:0,fat:0});

  async function startCamera(){
    setCameraErr('');setScanning(false);
    try {
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1920}}});
      streamRef.current=stream;
      if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();}
      if('BarcodeDetector' in window){
        detectorRef.current=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128','qr_code','itf']});
        setScanning(true);scanLoop();
      } else { setCameraErr('Live scanning unavailable in this browser. Enter barcode manually below.'); }
    } catch(e){ setCameraErr('Camera not accessible. Enter barcode manually below.'); }
  }

  function stopCamera(){
    setScanning(false);
    if(rafRef.current)cancelAnimationFrame(rafRef.current);
    if(streamRef.current){streamRef.current.getTracks().forEach(t=>t.stop());streamRef.current=null;}
  }

  async function scanLoop(){
    if(!videoRef.current||!detectorRef.current)return;
    try {
      const codes=await detectorRef.current.detect(videoRef.current);
      if(codes.length>0){
        stopCamera();setScanFlash(true);setTimeout(()=>setScanFlash(false),300);
        if(navigator.vibrate)navigator.vibrate([40,20,40]);
        await fetchProduct(codes[0].rawValue);return;
      }
    } catch(e){}
    rafRef.current=requestAnimationFrame(scanLoop);
  }

  async function fetchProduct(barcode){
    setLoading(true);setError('');setScreen('result');setProduct(null);
    try {
      const r=await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=product_name,product_name_en,brands,serving_size,serving_quantity,nutriments,image_small_url,nutrition_data_per`);
      const data=await r.json();
      if(data.status===1&&data.product){
        const p=data.product,n=p.nutriments||{};
        setProduct({
          barcode,name:p.product_name||p.product_name_en||'Unknown Product',brand:p.brands||'',
          image:p.image_small_url||'',serving:p.serving_size||'1 serving',
          calories:Math.round(n['energy-kcal_serving']??n['energy-kcal_100g']??0),
          protein:+((n['proteins_serving']??n['proteins_100g']??0).toFixed(1)),
          carbs:+((n['carbohydrates_serving']??n['carbohydrates_100g']??0).toFixed(1)),
          fat:+((n['fat_serving']??n['fat_100g']??0).toFixed(1)),
          fiber:+((n['fiber_serving']??n['fiber_100g']??0).toFixed(1)),
          sugar:+((n['sugars_serving']??n['sugars_100g']??0).toFixed(1)),
        });
        setServings(1);setMeal(getMeal());
      } else { setError(`No product found for "${barcode}". Check the barcode and try again.`); }
    } catch(e){ setError('Network error — check your connection and try again.'); }
    setLoading(false);
  }

  async function logFood(){
    if(!product||logStatus==='logging')return;
    setLogStatus('logging');
    const now=new Date();
    const entry={
      id:Date.now(),
      date:now.toLocaleDateString('en-GB'),
      time:now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),
      meal,food:`${product.name}${product.brand?` (${product.brand})`:''}`,
      servings,
      calories:Math.round(product.calories*servings),
      protein:Math.round(product.protein*servings*10)/10,
      carbs:Math.round(product.carbs*servings*10)/10,
      fat:Math.round(product.fat*servings*10)/10,
    };
    const newLog=[...todayLog,entry];setTodayLog(newLog);
    try{await window.storage.set('ft_log_'+todayKey(),JSON.stringify(newLog));}catch(e){}
    if(sheetsUrl){
      try{await fetch(sheetsUrl,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)});}catch(e){}
    }
    if(navigator.vibrate)navigator.vibrate([40,20,40]);
    setLogStatus('success');
    setTimeout(()=>{setLogStatus('');setScreen('home');setProduct(null);setError('');},1400);
  }

  async function saveSettings(){
    setTargets(tgEdit);setSheetsUrl(urlInput);
    try{await window.storage.set('ft_url',urlInput);await window.storage.set('ft_targets',JSON.stringify(tgEdit));}catch(e){}
    setScreen('home');
  }

  function goHome(){stopCamera();setScreen('home');setProduct(null);setError('');setLoading(false);}

  // ── STYLES ──────────────────────────────────────────────────
  const S={
    page:{background:'#080810',minHeight:'100vh',fontFamily:'"DM Sans",system-ui,sans-serif',color:'#fff',maxWidth:430,margin:'0 auto',padding:'0 16px'},
    card:{background:'#111120',borderRadius:16,border:'1px solid rgba(255,255,255,0.06)',padding:'16px 18px',marginBottom:12},
    header:{display:'flex',alignItems:'center',gap:12,padding:'16px 0 12px'},
    backBtn:{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.5)',fontSize:14,padding:0},
    title:{fontSize:17,fontWeight:600,color:'#fff'},
    label:{fontSize:11,color:'rgba(255,255,255,0.4)',letterSpacing:1.2,fontWeight:600,marginBottom:10},
    input:{width:'100%',padding:'11px 14px',borderRadius:10,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.04)',color:'#fff',fontSize:14,boxSizing:'border-box',outline:'none'},
    primaryBtn:{width:'100%',padding:'15px',background:'#FF3D5A',color:'#fff',border:'none',borderRadius:14,fontSize:15,fontWeight:600,cursor:'pointer',letterSpacing:0.3},
    pill:{padding:'7px 14px',borderRadius:20,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'rgba(255,255,255,0.6)',cursor:'pointer',fontSize:13},
    pillActive:{padding:'7px 14px',borderRadius:20,border:'1px solid #FF3D5A',background:'rgba(255,61,90,0.15)',color:'#FF3D5A',cursor:'pointer',fontSize:13,fontWeight:600},
    numBtn:{width:44,height:44,borderRadius:'50%',border:'1px solid rgba(255,255,255,0.12)',background:'rgba(255,255,255,0.04)',cursor:'pointer',fontSize:22,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center'},
    macroBox:{background:'rgba(255,255,255,0.03)',borderRadius:12,padding:'12px 8px',border:'1px solid rgba(255,255,255,0.05)',textAlign:'center'},
  };

  // ── HOME ────────────────────────────────────────────────────
  if(screen==='home') return (
    <div style={{...S.page,paddingBottom:32}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');`}</style>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'20px 0 8px'}}>
        <div>
          <div style={{fontSize:22,fontWeight:600,color:'#fff',lineHeight:1.2}}>Today</div>
          <div style={{fontSize:13,color:'rgba(255,255,255,0.4)',marginTop:2}}>{new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</div>
        </div>
        <button onClick={()=>setScreen('settings')} style={{...S.pill,fontSize:13}}>⚙ Settings</button>
      </div>

      {/* Main calorie ring */}
      <div style={{...S.card,display:'flex',alignItems:'center',gap:20,padding:'20px 22px'}}>
        <div style={{position:'relative',flexShrink:0}}>
          <Ring pct={totals.cal/targets.cal} color={MC.cal} size={120}/>
          <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center',lineHeight:1}}>
            <div style={{fontSize:24,fontWeight:600,color:'#fff'}}>{Math.round(totals.cal)}</div>
            <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',marginTop:2,letterSpacing:1}}>KCAL</div>
          </div>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,color:'rgba(255,255,255,0.5)',marginBottom:6}}>Calories today</div>
          <div style={{fontSize:28,fontWeight:600,color:MC.cal,lineHeight:1}}>{Math.round(totals.cal)}</div>
          <div style={{fontSize:13,color:'rgba(255,255,255,0.3)',marginTop:4}}>of {targets.cal} kcal target</div>
          <div style={{marginTop:10,height:4,background:'rgba(255,255,255,0.06)',borderRadius:4,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${Math.min(totals.cal/targets.cal*100,100)}%`,background:MC.cal,borderRadius:4,transition:'width 1s ease'}}/>
          </div>
          <div style={{fontSize:12,color:'rgba(255,255,255,0.3)',marginTop:6}}>{Math.max(0,Math.round(targets.cal-totals.cal))} kcal remaining</div>
        </div>
      </div>

      {/* Macro rings */}
      <div style={{...S.card,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,padding:'16px 12px'}}>
        {(['pro','carb','fat']).map(k=>(
          <div key={k} style={{textAlign:'center'}}>
            <div style={{position:'relative',display:'inline-block'}}>
              <SmallRing pct={totals[k]/targets[k]} color={MC[k]} size={72}/>
              <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center',lineHeight:1}}>
                <div style={{fontSize:15,fontWeight:600,color:'#fff'}}>{Math.round(totals[k])}</div>
              </div>
            </div>
            <div style={{fontSize:10,color:'rgba(255,255,255,0.35)',letterSpacing:1,marginTop:4}}>{ML[k]}</div>
            <div style={{fontSize:11,color:MC[k],marginTop:2}}>{Math.round(totals[k])}<span style={{color:'rgba(255,255,255,0.25)'}}>/{targets[k]}g</span></div>
          </div>
        ))}
      </div>

      {/* Scan button */}
      <button onClick={()=>{setScreen('scan');setTimeout(startCamera,150);}}
        style={{...S.primaryBtn,marginBottom:12,display:'flex',alignItems:'center',justifyContent:'center',gap:10,padding:'18px'}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>
        Scan Barcode
      </button>

      {/* Today's log */}
      {todayLog.length>0&&(
        <div style={S.card}>
          <div style={S.label}>TODAY'S LOG — {todayLog.length} item{todayLog.length!==1?'s':''}</div>
          {todayLog.slice().reverse().map(e=>(
            <div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              <div style={{flex:1,minWidth:0,marginRight:12}}>
                <div style={{fontSize:13,color:'#fff',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.food}</div>
                <div style={{fontSize:11,color:'rgba(255,255,255,0.35)',marginTop:2}}>{e.meal} · {e.time}{e.servings!==1?` · ${e.servings}×`:''}</div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                <div style={{fontSize:14,fontWeight:600,color:MC.cal}}>{e.calories}<span style={{fontSize:10,fontWeight:400,marginLeft:2}}>kcal</span></div>
                <div style={{fontSize:10,color:'rgba(255,255,255,0.35)'}}>P {e.protein}g · C {e.carbs}g · F {e.fat}g</div>
              </div>
            </div>
          ))}
          {sheetsUrl&&<div style={{fontSize:11,color:'rgba(255,255,255,0.25)',marginTop:10,textAlign:'center'}}>✓ Syncing to Google Sheets</div>}
        </div>
      )}
      {todayLog.length===0&&(
        <div style={{...S.card,textAlign:'center',padding:'32px',color:'rgba(255,255,255,0.3)',fontSize:14}}>
          No food logged yet. Scan a barcode to start.
        </div>
      )}
    </div>
  );

  // ── SCAN ────────────────────────────────────────────────────
  if(screen==='scan') return (
    <div style={{...S.page,paddingBottom:32}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');`}
        {`@keyframes scanline{0%{top:10%}50%{top:80%}100%{top:10%}}`}
      </style>
      <div style={S.header}>
        <button onClick={goHome} style={S.backBtn}>← Back</button>
        <span style={S.title}>Scan Food</span>
      </div>

      {/* Camera viewport */}
      <div style={{borderRadius:18,overflow:'hidden',background:'#000',aspectRatio:'4/3',position:'relative',marginBottom:14,border:'1px solid rgba(255,255,255,0.08)'}}>
        <video ref={videoRef} playsInline muted style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
        {scanFlash&&<div style={{position:'absolute',inset:0,background:'rgba(255,255,255,0.3)',zIndex:10}}/>}

        {scanning&&(
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
            {/* Corner brackets */}
            <div style={{width:200,height:110,position:'relative'}}>
              {[{top:-2,left:-2,borderTop:'3px solid #FF3D5A',borderLeft:'3px solid #FF3D5A',borderRadius:'6px 0 0 0'},
                {top:-2,right:-2,borderTop:'3px solid #FF3D5A',borderRight:'3px solid #FF3D5A',borderRadius:'0 6px 0 0'},
                {bottom:-2,left:-2,borderBottom:'3px solid #FF3D5A',borderLeft:'3px solid #FF3D5A',borderRadius:'0 0 0 6px'},
                {bottom:-2,right:-2,borderBottom:'3px solid #FF3D5A',borderRight:'3px solid #FF3D5A',borderRadius:'0 0 6px 0'},
              ].map((s,i)=><div key={i} style={{position:'absolute',width:22,height:22,...s}}/>)}
              {/* Scan line */}
              <div style={{position:'absolute',left:0,right:0,height:1.5,background:'rgba(255,61,90,0.7)',animation:'scanline 2s ease-in-out infinite',boxShadow:'0 0 6px rgba(255,61,90,0.5)'}}/>
            </div>
          </div>
        )}

        {!scanning&&!cameraErr&&(
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:8,color:'rgba(255,255,255,0.4)',fontSize:13}}>
            <div style={{width:32,height:32,border:'2px solid rgba(255,255,255,0.2)',borderTopColor:'#FF3D5A',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            Starting camera...
          </div>
        )}
      </div>

      {scanning&&<div style={{textAlign:'center',fontSize:13,color:'rgba(255,255,255,0.4)',marginBottom:16}}>Point camera at any barcode</div>}

      {cameraErr&&(
        <div style={{...S.card,background:'rgba(255,61,90,0.08)',border:'1px solid rgba(255,61,90,0.2)',marginBottom:14}}>
          <div style={{fontSize:13,color:'#FF3D5A'}}>{cameraErr}</div>
        </div>
      )}

      {/* Manual entry */}
      <div style={S.card}>
        <div style={S.label}>MANUAL ENTRY</div>
        <div style={{display:'flex',gap:8}}>
          <input value={manualCode} onChange={e=>setManualCode(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&manualCode.trim()){stopCamera();fetchProduct(manualCode.trim());}}}
            placeholder="Enter barcode number..." type="tel"
            style={{...S.input,flex:1}}/>
          <button onClick={()=>{if(manualCode.trim()){stopCamera();fetchProduct(manualCode.trim());}}}
            style={{padding:'11px 18px',background:'#FF3D5A',color:'#fff',border:'none',borderRadius:10,cursor:'pointer',fontSize:14,fontWeight:600,whiteSpace:'nowrap'}}>
            Go
          </button>
        </div>
        <div style={{fontSize:11,color:'rgba(255,255,255,0.25)',marginTop:8}}>Find the barcode number printed under the lines on any product</div>
      </div>
    </div>
  );

  // ── RESULT ──────────────────────────────────────────────────
  if(screen==='result') return (
    <div style={{...S.page,paddingBottom:32}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');`}</style>
      <div style={S.header}>
        <button onClick={()=>{setScreen('scan');setProduct(null);setError('');setTimeout(startCamera,150);}} style={S.backBtn}>← Scan again</button>
        <span style={S.title}>Product</span>
      </div>

      {loading&&(
        <div style={{...S.card,textAlign:'center',padding:'48px 24px'}}>
          <div style={{width:40,height:40,border:'3px solid rgba(255,255,255,0.1)',borderTopColor:'#FF3D5A',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 16px'}}/> 
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{color:'rgba(255,255,255,0.4)',fontSize:14}}>Looking up product...</div>
        </div>
      )}

      {error&&!loading&&(
        <div style={{...S.card,background:'rgba(255,61,90,0.06)',border:'1px solid rgba(255,61,90,0.15)'}}>
          <div style={{color:'#FF3D5A',fontSize:14,marginBottom:14}}>{error}</div>
          <button onClick={goHome} style={{...S.pill,color:'rgba(255,255,255,0.6)'}}>← Back to home</button>
        </div>
      )}

      {product&&!loading&&(
        <>
          {/* Product info */}
          <div style={S.card}>
            <div style={{display:'flex',gap:14,alignItems:'flex-start'}}>
              {product.image&&(
                <img src={product.image} alt={product.name} style={{width:64,height:64,objectFit:'contain',borderRadius:10,background:'rgba(255,255,255,0.04)',flexShrink:0}}/>
              )}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:600,color:'#fff',lineHeight:1.3}}>{product.name}</div>
                {product.brand&&<div style={{fontSize:12,color:'rgba(255,255,255,0.4)',marginTop:4}}>{product.brand}</div>}
                <div style={{fontSize:11,color:'rgba(255,255,255,0.25)',marginTop:6}}>Per serving: {product.serving}</div>
              </div>
            </div>
          </div>

          {/* Macros grid */}
          <div style={{...S.card,display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,padding:'14px 12px'}}>
            {[['cal','KCAL',product.calories*servings,''],['pro','PRO',product.protein*servings,'g'],['carb','CARB',product.carbs*servings,'g'],['fat','FAT',product.fat*servings,'g']].map(([k,label,val,unit])=>(
              <div key={k} style={{...S.macroBox}}>
                <div style={{fontSize:18,fontWeight:600,color:MC[k],lineHeight:1}}>{k==='cal'?Math.round(val):(Math.round(val*10)/10)}{unit}</div>
                <div style={{fontSize:9,color:'rgba(255,255,255,0.35)',marginTop:4,letterSpacing:0.8}}>{label}</div>
              </div>
            ))}
          </div>

          {/* Extra info */}
          {(product.fiber>0||product.sugar>0)&&(
            <div style={{...S.card,display:'flex',gap:20,padding:'12px 18px'}}>
              {product.fiber>0&&<div style={{fontSize:12,color:'rgba(255,255,255,0.4)'}}>Fibre: <span style={{color:'rgba(255,255,255,0.7)',fontWeight:500}}>{(product.fiber*servings).toFixed(1)}g</span></div>}
              {product.sugar>0&&<div style={{fontSize:12,color:'rgba(255,255,255,0.4)'}}>Sugar: <span style={{color:'rgba(255,255,255,0.7)',fontWeight:500}}>{(product.sugar*servings).toFixed(1)}g</span></div>}
            </div>
          )}

          {/* Servings */}
          <div style={S.card}>
            <div style={S.label}>SERVINGS</div>
            <div style={{display:'flex',alignItems:'center',gap:0}}>
              <button onClick={()=>setServings(s=>Math.max(0.5,+(s-0.5).toFixed(1)))} style={S.numBtn}>−</button>
              <div style={{flex:1,textAlign:'center'}}>
                <div style={{fontSize:32,fontWeight:600,color:'#fff',lineHeight:1}}>{servings}</div>
                <div style={{fontSize:11,color:'rgba(255,255,255,0.35)',marginTop:4}}>{product.serving}</div>
              </div>
              <button onClick={()=>setServings(s=>+(s+0.5).toFixed(1))} style={S.numBtn}>+</button>
            </div>
          </div>

          {/* Meal selector */}
          <div style={S.card}>
            <div style={S.label}>MEAL</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
              {MEALS.map(m=>(
                <button key={m} onClick={()=>setMeal(m)} style={meal===m?S.pillActive:S.pill}>{m}</button>
              ))}
            </div>
          </div>

          {/* Impact on targets */}
          <div style={{...S.card,padding:'12px 18px'}}>
            <div style={S.label}>IMPACT ON TODAY'S TARGETS</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {[['cal',Math.round(product.calories*servings),'kcal'],['pro',+(product.protein*servings).toFixed(1),'g'],['carb',+(product.carbs*servings).toFixed(1),'g'],['fat',+(product.fat*servings).toFixed(1),'g']].map(([k,val,u])=>{
                const afterPct=Math.min((totals[k]+val)/targets[k],1.3);
                const nowPct=Math.min(totals[k]/targets[k],1.3);
                return(
                  <div key={k} style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',width:38,letterSpacing:0.8}}>{ML[k]}</div>
                    <div style={{flex:1,height:6,background:'rgba(255,255,255,0.06)',borderRadius:4,position:'relative',overflow:'hidden'}}>
                      <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${Math.min(nowPct*100,100)}%`,background:MC[k],opacity:0.4,borderRadius:4}}/>
                      <div style={{position:'absolute',left:`${Math.min(nowPct*100,100)}%`,top:0,height:'100%',width:`${Math.min((afterPct-nowPct)*100,100-nowPct*100)}%`,background:MC[k],borderRadius:4}}/>
                    </div>
                    <div style={{fontSize:11,color:MC[k],fontWeight:600,width:52,textAlign:'right'}}>+{val}{u}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Log button */}
          <button onClick={logFood} disabled={logStatus==='logging'}
            style={{...S.primaryBtn,background:logStatus==='success'?'#00C97A':'#FF3D5A',transition:'background 0.3s',marginTop:4}}>
            {logStatus==='logging'?'Logging...' : logStatus==='success'?'✓  Logged successfully!' : `Log to ${meal}`}
          </button>
          <div style={{fontSize:11,color:'rgba(255,255,255,0.25)',textAlign:'center',marginTop:8}}>
            {sheetsUrl?'✓ Will sync to your Google Sheet':'Configure Google Sheets in Settings to sync'}
          </div>
        </>
      )}
    </div>
  );

  // ── SETTINGS ────────────────────────────────────────────────
  if(screen==='settings') return (
    <div style={{...S.page,paddingBottom:32}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');`}</style>
      <div style={S.header}>
        <button onClick={goHome} style={S.backBtn}>← Back</button>
        <span style={S.title}>Settings</span>
      </div>

      {/* Sheets URL */}
      <div style={S.card}>
        <div style={S.label}>GOOGLE SHEETS — WEB APP URL</div>
        <input value={urlInput} onChange={e=>setUrlInput(e.target.value)}
          placeholder="https://script.google.com/macros/s/..."
          style={{...S.input,marginBottom:8}}/>
        {urlInput?<div style={{fontSize:11,color:'#00C97A'}}>✓ URL configured — food will sync automatically when logged</div>
          :<div style={{fontSize:11,color:'rgba(255,255,255,0.3)'}}>Paste your Apps Script Web App URL to enable Google Sheets sync</div>}
      </div>

      {/* Targets */}
      <div style={S.card}>
        <div style={S.label}>DAILY TARGETS</div>
        {[['cal','Calories','kcal'],['pro','Protein','g'],['carb','Carbs','g'],['fat','Fat','g']].map(([k,label,u])=>(
          <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <div>
              <div style={{fontSize:14,color:'#fff',fontWeight:500}}>{label}</div>
              <div style={{fontSize:11,color:'rgba(255,255,255,0.35)'}}>{u} per day</div>
            </div>
            <input type="number" value={tgEdit[k]} onChange={e=>setTgEdit(t=>({...t,[k]:+e.target.value}))}
              style={{width:90,padding:'9px 10px',borderRadius:10,border:`1px solid ${MC[k]}40`,background:'rgba(255,255,255,0.04)',color:MC[k],fontSize:15,textAlign:'center',fontWeight:600,outline:'none'}}/>
          </div>
        ))}
      </div>

      {/* Setup guide */}
      <div style={{...S.card,background:'rgba(0,201,122,0.04)',border:'1px solid rgba(0,201,122,0.15)'}}>
        <div style={{fontSize:13,fontWeight:600,color:'#00C97A',marginBottom:10}}>Google Sheets setup guide</div>
        {[
          'Create a new Google Sheet',
          'Extensions → Apps Script',
          'Paste contents of FoodTracker_Setup.gs',
          'Run setupTracker() to build all sheets',
          'Deploy → New Deployment → Web App',
          'Set "Who has access" to Anyone',
          'Copy URL → paste above',
        ].map((step,i)=>(
          <div key={i} style={{display:'flex',gap:10,alignItems:'flex-start',marginBottom:8}}>
            <div style={{width:20,height:20,borderRadius:'50%',background:'rgba(0,201,122,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#00C97A',fontWeight:600,flexShrink:0,marginTop:1}}>{i+1}</div>
            <div style={{fontSize:13,color:'rgba(255,255,255,0.55)',lineHeight:1.5}}>{step}</div>
          </div>
        ))}
      </div>

      {/* Clear today */}
      {todayLog.length>0&&(
        <div style={S.card}>
          <div style={S.label}>DATA</div>
          <button onClick={async()=>{
            setTodayLog([]);
            try{await window.storage.delete('ft_log_'+todayKey());}catch(e){}
          }} style={{...S.pill,color:'#FF3D5A',border:'1px solid rgba(255,61,90,0.3)',width:'100%',textAlign:'center'}}>
            Clear today's log ({todayLog.length} item{todayLog.length!==1?'s':''})
          </button>
        </div>
      )}

      <button onClick={saveSettings} style={S.primaryBtn}>Save Settings</button>
    </div>
  );

  return null;
}
