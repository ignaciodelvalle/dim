/* ===== MiMAR · Panorama — núcleo compartido =====
   Motor de mapa (choropleth + puntos graduados + drill), datos por provincia,
   escalas de color reales (viz-scales.ts), y constructores de cromo (KPI, presets, layers, scrubber).
   Piel: operador (navy). es-AR. Light-only. */
(function () {
  const GEO = window.ARG_GEO;
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- helpers DOM ---------- */
  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(c => c && n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }
  function svg(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* ---------- color ---------- */
  function h2r(h){h=h.replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
  function r2h(a){return '#'+a.map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('');}
  function mix(a,b,t){const x=h2r(a),y=h2r(b);return r2h([x[0]+(y[0]-x[0])*t,x[1]+(y[1]-x[1])*t,x[2]+(y[2]-x[2])*t]);}
  function ramp(stops,t){t=Math.max(0,Math.min(1,t));const n=stops.length-1;const i=Math.min(Math.floor(t*n),n-1);return mix(stops[i],stops[i+1],t*n-i);}
  const SEQ=['#eff3ff','#c6dbef','#6baed6','#3182bd','#084594'];
  function seqColor(v,max){return ramp(SEQ, max?v/max:0);}
  function divColor(v,meta){return v<meta ? mix('#f59e0b','#f1f5f8',v/meta) : mix('#f1f5f8','#0d9488',(v-meta)/(100-meta));}
  const NO_DATA='#e5e7eb', SUPPRESSED='#d1d5db';

  /* ---------- RNG determinista ---------- */
  function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

  /* ---------- métricas ---------- */
  // type: 'div' (divergente vs meta) | 'seq' (secuencial azul, conteo)
  const METRICS = {
    cobertura:      {label:'Cobertura antirrábica', short:'Cobertura antirráb.', type:'div', meta:80, unit:'%', natl:'41,3%', delta:{d:'▲',t:'+3% vs período anterior'}, tone:'warn', sub:'perros · 12m · meta 80%'},
    esterilizacion: {label:'Cobertura de esterilización', short:'Esterilización', type:'div', meta:70, unit:'%', natl:'54,0%', delta:null, tone:'warn', sub:'meta 70%'},
    perdidas:       {label:'Pérdidas activas', short:'Pérdidas', type:'seq', unit:'', natl:'312', delta:null, tone:'warn', sub:'47 recuperadas (30d) · 9 d prom.'},
    mordeduras:     {label:'Mordeduras / 10k hab.', short:'Mordeduras', type:'seq', unit:'', natl:'2,4', delta:{d:'▼',t:'-8% vs período anterior'}, tone:'warn', sub:'186 reportes'},
    zoonosis:       {label:'Zoonosis activas', short:'Zoonosis', type:'seq', unit:'', natl:'23', delta:{d:'▲',t:'+15% vs período anterior'}, tone:'danger', sub:'6 rabia · 11 lepto · 6 hidat.'},
    denuncias:      {label:'Denuncias activas', short:'Denuncias', type:'seq', unit:'', natl:'89', delta:null, tone:'warn', sub:'denuncias de bienestar'},
    mascotas:       {label:'Mascotas en cobertura', short:'En cobertura', type:'seq', unit:'', natl:'28.940', delta:null, tone:'blue', sub:'activas o perdidas'},
  };
  const KPI_ORDER = ['cobertura','esterilizacion','perdidas','mordeduras','zoonosis','denuncias','mascotas'];
  const SEQ_CEIL = {perdidas:44, mordeduras:6, zoonosis:6, denuncias:15, mascotas:3400};

  /* per-province value (determinista, con leve sesgo latitudinal) */
  function valueFor(code, cy, metricId) {
    const m = METRICS[metricId];
    const r = rng(hash(code+':'+metricId));
    const south = cy/1000; // 0 norte → 1 sur
    if (m.type === 'div') {
      // norte peor cobertura; ruido; ancla ~ 40-58 nacional
      let v = 40 + (south-0.42)*34 + (r()-0.5)*40;
      return Math.max(22, Math.min(93, v));
    } else {
      const ceil = SEQ_CEIL[metricId] || 10;
      let bias = 1;
      if (metricId==='zoonosis' || metricId==='mordeduras') bias = 1.25 - south*0.5; // norte más señal
      if (metricId==='mascotas') bias = 0.5 + (1-Math.abs(south-0.48))*1.3; // centro/BA más mascotas
      let v = Math.pow(r(), 1.5) * ceil * bias;
      return Math.max(0, Math.round(v));
    }
  }

  // precompute values + seq max
  const PVAL = {}; // code -> {metric: value}
  const byCode = {};
  GEO.provinces.forEach(p => { byCode[p.code]=p; PVAL[p.code]={}; KPI_ORDER.forEach(mid=>{ PVAL[p.code][mid]=valueFor(p.code,p.cy,mid); }); });
  const SEQ_MAX = {};
  KPI_ORDER.forEach(mid=>{ if(METRICS[mid].type==='seq'){ SEQ_MAX[mid]=Math.max(...GEO.provinces.map(p=>PVAL[p.code][mid])); } });

  function fillFor(metricId, v) {
    const m = METRICS[metricId];
    if (v==null) return NO_DATA;
    return m.type==='div' ? divColor(v, m.meta) : seqColor(v, SEQ_MAX[metricId]);
  }
  function fmtVal(metricId, v){ const m=METRICS[metricId]; if(v==null) return 's/d'; return m.type==='div'? (Math.round(v*10)/10).toString().replace('.',',')+'%' : Math.round(v).toLocaleString('es-AR'); }

  /* ---------- presets (reales) ---------- */
  const PRESETS = [
    {id:'brotes', label:'Brotes activos', q:'¿Dónde hay brotes activos sobre huecos de vacunación?', base:'cobertura', signal:'zoonosis', chips:['base: cobertura','signal: zoonosis','provincia · 90d']},
    {id:'sintomas', label:'Síntomas / vigilancia sindrómica', q:'¿Dónde se concentran los síntomas reportados con alerta?', base:'zoonosis', signal:'zoonosis', chips:['base: sintomas','signal: zoonosis','localidad · 30d']},
    {id:'cumplimiento', label:'% de cumplimiento', q:'¿Qué jurisdicciones están por debajo de la meta de cobertura antirrábica?', base:'cobertura', signal:null, chips:['base: cobertura','provincia · 90d']},
    {id:'bienestar', label:'Bienestar y fiscalización', q:'¿Dónde se acumulan denuncias y decomisos por bienestar animal?', base:'denuncias', signal:'decomisos', chips:['base: denuncias','ref: decomisos','localidad · 90d'], default:true},
    {id:'control', label:'Control poblacional', q:'¿Estamos conteniendo la población? Cobertura de esterilización vs meta.', base:'esterilizacion', signal:null, chips:['base: esterilizacion','provincia · 90d']},
    {id:'perdidas', label:'Pérdidas y reunificación (D4)', q:'¿Cuántas mascotas perdidas se están reencontrando con su familia?', base:'perdidas', signal:'reunificacion', chips:['base: perdidas','signal: reunificacion','localidad · 90d']},
  ];
  /* capas de punto — ADITIVAS y compatibles entre sí (se suman, sin exclusión) */
  const POINT_LAYERS = {
    zoonosis:      {label:'Zoonosis / señales', color:'#9c755f', ceil:6,  count:'67'},
    mordeduras:    {label:'Mordeduras',         color:'#e15759', ceil:6,  count:'186'},
    decomisos:     {label:'Decomisos',          color:'#76b7b2', ceil:9,  count:'54'},
    refugios:      {label:'Refugios',           color:'#4e79a7', ceil:5,  count:'128'},
    reunificacion: {label:'Reunificación',      color:'#59a14f', ceil:12, count:'47'},
  };
  const POINT_ORDER = ['zoonosis','mordeduras','decomisos','refugios','reunificacion'];
  function pointVal(code, lid){ const L=POINT_LAYERS[lid]; if(!L) return 0; const r=rng(hash(code+'~'+lid)); return Math.round(Math.pow(r(),1.7)*L.ceil); }

  /* VISTAS — cada preset precarga un choropleth base + capas aditivas + sus métricas */
  const VISTAS = {
    brotes:       {base:'cobertura',      baseLabel:'Cobertura antirrábica', layers:['zoonosis'],      metrics:['cobertura','zoonosis','mordeduras']},
    sintomas:     {base:'zoonosis',       baseLabel:'Síntomas (densidad sindrómica)', layers:['zoonosis','mordeduras'], metrics:['zoonosis','mordeduras','denuncias']},
    cumplimiento: {base:'cobertura',      baseLabel:'Cobertura antirrábica', layers:[],                metrics:['cobertura','esterilizacion','mascotas']},
    bienestar:    {base:'denuncias',      baseLabel:'Denuncias de bienestar', layers:['decomisos','refugios'], metrics:['denuncias','mordeduras','mascotas']},
    control:      {base:'esterilizacion', baseLabel:'Cobertura de esterilización', layers:[],           metrics:['esterilizacion','mascotas','perdidas']},
    perdidas:     {base:'perdidas',       baseLabel:'Pérdidas activas', layers:['reunificacion','refugios'], metrics:['perdidas','mascotas','denuncias']},
  };

  /* ---------- constructores de cromo ---------- */
  function kpiTile(mid, opts){
    opts = opts||{};
    const m = METRICS[mid];
    const t = el('div', {class:'kpi tone-'+m.tone + (opts.active?' active':'') + (opts.compact?' compact':'')});
    t.appendChild(el('div',{class:'kpi-label'},[m.short + (m.unit&&m.type==='div'?'':'')]));
    t.appendChild(el('div',{class:'kpi-value'},[m.natl]));
    if(!opts.compact){
      if(m.sub) t.appendChild(el('div',{class:'kpi-sub'},[m.sub]));
      if(m.type==='div'){
        const track=el('div',{class:'kpi-bar'}); const fill=el('div',{class:'kpi-bar-fill'}); fill.style.width=parseFloat(m.natl)+'%'; track.appendChild(fill); t.appendChild(track);
      }
      if(m.delta) t.appendChild(el('div',{class:'kpi-delta'},[m.delta.d+' '+m.delta.t]));
    } else if(m.delta){ t.appendChild(el('div',{class:'kpi-delta'},[m.delta.d])); }
    if(opts.onClick){ t.classList.add('clickable'); t.addEventListener('click',()=>opts.onClick(mid)); }
    return t;
  }

  /* ---------- reproducibilidad temporal ---------- */
  const TEMPORAL_BASES = new Set(['zoonosis','denuncias','perdidas','mordeduras']);
  const TEMPORAL_OVERLAYS = new Set(['zoonosis','mordeduras','decomisos','reunificacion']);
  function isTemporal(base, layers){ return TEMPORAL_BASES.has(base) || (layers||[]).some(l=>TEMPORAL_OVERLAYS.has(l)); }

  /* toggle Simple / Detalle (progressive disclosure) */
  function densityToggle(detail, onToggle){
    const t=el('div',{class:'dens-toggle'});
    t.append(
      el('button',{class:'dens-btn'+(!detail?' active':''),type:'button',onclick:()=>{ if(detail) onToggle(); }},['Simple']),
      el('button',{class:'dens-btn'+(detail?' active':''),type:'button',onclick:()=>{ if(!detail) onToggle(); }},['Detalle'])
    );
    return t;
  }

  function scrubber(opts){
    opts=opts||{};
    const available = opts.available !== false;
    const detail = !!opts.detail;
    const wrap = el('div',{class:'scrubber'+(opts.compact?' compact':'')+(available?'':' unavailable')});
    const asof = el('span',{class:'scr-asof'},[available?'Ahora (en vivo)':'—']);
    const right = el('div',{class:'scr-right'},[asof]);
    if(available && opts.onToggleDetail) right.appendChild(densityToggle(detail, opts.onToggleDetail));
    wrap.appendChild(el('div',{class:'scr-top'},[ el('span',{class:'scr-lbl'},['Reproducción temporal']), right ]));
    if(!available){
      wrap.appendChild(el('div',{class:'scr-unavail'},[
        el('span',{class:'scr-unavail-ic'},['◷']),
        el('div',null,[
          el('p',{class:'scr-unavail-t'},['No disponible en esta vista']),
          el('p',{class:'scr-unavail-d'},['La vista muestra un valor de stock (cobertura / esterilización), sin línea de tiempo. Sumá una capa de eventos para reproducir la situación.'])
        ])
      ]));
      return wrap;
    }
    const win = el('div',{class:'scr-window'});
    const fill = el('div',{class:'scr-fill'});
    const thumb = el('div',{class:'scr-thumb'});
    const track = el('div',{class:'scr-track'},[win,fill,thumb]);
    [0,33.33,66.66,100].forEach(pos=>{ const t=el('span',{class:'scr-tick'}); t.style.left=pos+'%'; track.appendChild(t); });
    const play = el('button',{class:'scr-play','aria-label':'Reproducir la formación de la situación',type:'button'},['▶']);
    const now = el('button',{class:'scr-now',type:'button'},['Ahora']);
    const ctr = el('div',{class:'scr-ctr'},[play,track,now]);
    const ticks = el('div',{class:'scr-ticks'},[el('span',null,['8 abr']),el('span',null,['8 may']),el('span',null,['8 jun']),el('span',null,['hoy'])]);
    const loopBtns=[];
    const loops = el('div',{class:'scr-loops'}, [el('span',{class:'scr-loops-lbl'},['Bucle'])].concat(
      [{d:7,l:'7 días'},{d:30,l:'30 días'},{d:90,l:'90 días'}].map(def=>{
        const b=el('button',{class:'scr-loop',type:'button'},['↺ '+def.l]); b.dataset.start=String(1-def.d/90); loopBtns.push(b);
        b.addEventListener('click',()=>startLoop(parseFloat(b.dataset.start), b)); return b;
      })
    ));
    const basisWrap = el('div',{class:'scr-basis'},[
      el('span',{class:'scr-basis-lbl'},['Base']),
      el('button',{class:'scr-bbtn active',type:'button'},['Cuándo ocurrió']),
      el('button',{class:'scr-bbtn',type:'button'},['Según lo conocido al momento'])
    ]);
    const hint = el('p',{class:'scr-hint'},['Elegí un bucle para reproducir los últimos días en loop. Las capas sin dimensión temporal se atenúan durante la reproducción.']);
    basisWrap.querySelectorAll('.scr-bbtn').forEach(b=>b.addEventListener('click',()=>{
      basisWrap.querySelectorAll('.scr-bbtn').forEach(x=>x.classList.remove('active')); b.classList.add('active');
      hint.textContent = b.textContent.startsWith('Según') ?
        'Reproduciendo por fecha de registro (cuándo el Estado tomó conocimiento): la brecha con la ocurrencia revela demoras de reporte.' :
        'Elegí un bucle para reproducir los últimos días en loop. Las capas sin dimensión temporal se atenúan durante la reproducción.';
    }));
    let playing=false, raf, curStart=0, looping=false;
    function fmtDate(p){ const d=new Date(2026,3,8), end=new Date(2026,6,8); const t=new Date(d.getTime()+(end.getTime()-d.getTime())*p); return t.getDate()+' '+['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][t.getMonth()]; }
    function setPct(p){ p=Math.max(0,Math.min(1,p)); fill.style.left=(curStart*100)+'%'; fill.style.width=(Math.max(0,p-curStart)*100)+'%'; thumb.style.left=(p*100)+'%'; asof.textContent = p>0.985?'Ahora (en vivo)':fmtDate(p); }
    function setWindow(start){ curStart=start; win.style.left=(start*100)+'%'; win.style.width=((1-start)*100)+'%'; win.style.display= start>0?'block':'none'; }
    function stop(){ playing=false; play.textContent='▶'; cancelAnimationFrame(raf); wrap.classList.remove('playing'); }
    function run(start){ playing=true; play.textContent='❚❚'; wrap.classList.add('playing'); let p=start; setPct(p); const step=()=>{ if(!playing)return; p+=0.008; if(p>=1){ if(looping){ p=start; } else { stop(); setPct(1); return; } } setPct(p); raf=requestAnimationFrame(step); }; cancelAnimationFrame(raf); raf=requestAnimationFrame(step); }
    function startLoop(start,btn){ loopBtns.forEach(b=>b.classList.remove('active')); btn.classList.add('active'); looping=true; setWindow(start); run(start); }
    play.addEventListener('click',()=>{ if(playing){ stop(); } else { run(curStart); } });
    now.addEventListener('click',()=>{ stop(); looping=false; loopBtns.forEach(b=>b.classList.remove('active')); setWindow(0); setPct(1); });
    track.addEventListener('click',(e)=>{ if(e.target.classList&&e.target.classList.contains('scr-tick'))return; const r=track.getBoundingClientRect(); stop(); setPct((e.clientX-r.left)/r.width); });
    setWindow(0); setPct(1);
    wrap.append(ctr, loops);
    if(detail){ wrap.insertBefore(ticks, loops); wrap.append(basisWrap); if(!opts.compact) wrap.append(hint); }
    return wrap;
  }

  /* ---------- MAPA ---------- */
  function buildMap(host, opts) {
    opts = opts || {};
    let base = opts.base || 'denuncias';
    let activeLayers = (opts.layers || []).slice();
    let scope = null; // province code when drilled
    const s = svg('svg', {viewBox: GEO.viewBox, class:'pano-svg', preserveAspectRatio:'xMidYMid meet'});
    s.setAttribute('role','img'); s.setAttribute('aria-label','Mapa situacional de Argentina por provincia');
    // ocean bg
    const bg = svg('rect',{x:-40,y:-40,width:GEO.w+80,height:GEO.h+80,fill:opts.ocean||'#e9eef2'}); s.appendChild(bg);
    const gProv = svg('g',{class:'g-prov'}); s.appendChild(gProv);
    const gSig = svg('g',{class:'g-sig'}); s.appendChild(gSig);
    const gLoc = svg('g',{class:'g-loc'}); s.appendChild(gLoc);
    const gLbl = svg('g',{class:'g-lbl'}); s.appendChild(gLbl);
    host.appendChild(s);

    const tip = el('div',{class:'map-tip'}); host.appendChild(tip); host.style.position=host.style.position||'relative';

    const paths = {};
    GEO.provinces.forEach(p => {
      const path = svg('path',{d:p.d, class:'prov', 'data-code':p.code, stroke:'#ffffff','stroke-width':0.8,'stroke-linejoin':'round'});
      path.style.cursor='pointer';
      path.addEventListener('mousemove',(e)=>{ const v=PVAL[p.code][base]; const r=host.getBoundingClientRect(); tip.innerHTML='<b>'+p.name+'</b><span>'+METRICS[base].short+': '+fmtVal(base,v)+'</span>'; tip.style.opacity=1; tip.style.left=(e.clientX-r.left)+'px'; tip.style.top=(e.clientY-r.top)+'px'; });
      path.addEventListener('mouseleave',()=>{ tip.style.opacity=0; });
      path.addEventListener('click',()=>{ if(scope===p.code){ api.reset(); } else { api.drill(p.code); } });
      gProv.appendChild(path); paths[p.code]=path;
    });

    function paint(){
      GEO.provinces.forEach(p=>{
        const v=PVAL[p.code][base];
        paths[p.code].setAttribute('fill', fillFor(base,v));
        paths[p.code].style.opacity = (scope && scope!==p.code) ? 0.16 : 1;
      });
      // capas de punto ADITIVAS (national only) — cada capa un color, con leve abanico si hay varias
      gSig.innerHTML='';
      if(!scope){
        const n=activeLayers.length;
        activeLayers.forEach((lid,li)=>{
          const L=POINT_LAYERS[lid]; if(!L) return;
          const ang=li*2.39996, off = n>1 ? 6.5 : 0;
          const g=svg('g',{'data-layer':lid});
          GEO.provinces.forEach(p=>{
            const v=pointVal(p.code,lid); if(v<=0) return;
            const r=3+Math.sqrt(v)*3.2;
            const cx=p.cx+Math.cos(ang)*off, cy=p.cy+Math.sin(ang)*off;
            g.appendChild(svg('circle',{cx:cx,cy:cy,r:r,fill:L.color,'fill-opacity':0.42,stroke:L.color,'stroke-width':1}));
          });
          gSig.appendChild(g);
        });
      }
    }

    // viewBox tween
    let cur = GEO.viewBox.split(' ').map(Number);
    function setVB(v){ cur=v; s.setAttribute('viewBox', v.join(' ')); }
    function tween(to, dur){
      const from=cur.slice(); const t0=performance.now(); dur=dur||620;
      function fr(t){ let k=Math.min(1,(t-t0)/dur); k=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2; setVB(from.map((f,i)=>f+(to[i]-f)*k)); if(k<1) requestAnimationFrame(fr); }
      requestAnimationFrame(fr);
    }

    const api = {
      get base(){return base;}, get layers(){return activeLayers.slice();}, get scope(){return scope;},
      setBase(m){ if(m) base=m; paint(); },
      setLayers(arr){ activeLayers=(arr||[]).slice(); paint(); },
      repaint(){ paint(); },
      drill(code){
        scope=code; const p=byCode[code]; const b=p.bbox; const padX=(b[2]-b[0])*0.28+18, padY=(b[3]-b[1])*0.18+18;
        tween([b[0]-padX, b[1]-padY, (b[2]-b[0])+padX*2, (b[3]-b[1])+padY*2]);
        paint(); gLbl.innerHTML=''; gLoc.innerHTML='';
        // province label
        // localities
        const r=rng(hash(code+'#loc')); const n=6+Math.floor(r()*4);
        for(let i=0;i<n;i++){
          const lx=b[0]+ (b[2]-b[0])*(0.18+r()*0.64), ly=b[1]+(b[3]-b[1])*(0.16+r()*0.68);
          const val=Math.round(Math.pow(r(),1.3)*220); const supp = val<5;
          const rad = supp?5:(4+Math.sqrt(val)*1.5);
          const c=svg('circle',{cx:lx,cy:ly,r:rad, fill: supp?'#e15759':'#0e5a99','fill-opacity':supp?0.45:0.5, stroke: supp?'#e15759':'#0a4576','stroke-width':0.8});
          c.style.cursor='pointer';
          c.addEventListener('click',(e)=>{ e.stopPropagation(); if(opts.onFeature) opts.onFeature({prov:p, val:supp?null:val, supp}); });
          gLoc.appendChild(c);
        }
        if(opts.onScope) opts.onScope(code, p);
      },
      reset(){ scope=null; tween(GEO.viewBox.split(' ').map(Number)); paint(); gLoc.innerHTML=''; gLbl.innerHTML=''; if(opts.onScope) opts.onScope(null,null); },
      el:s
    };
    paint();
    return api;
  }

  /* ---------- export ---------- */
  window.PANO = {
    el, svg, GEO, METRICS, KPI_ORDER, PRESETS, PVAL, byCode, SEQ_MAX,
    fillFor, fmtVal, valueFor, kpiTile, scrubber, buildMap, isTemporal, densityToggle,
    POINT_LAYERS, POINT_ORDER, pointVal, VISTAS, seqColor, divColor,
    baseColor:{cobertura:'#59a14f', esterilizacion:'#af7aa1', denuncias:'#0e5a99', perdidas:'#0e5a99', zoonosis:'#9c755f', mordeduras:'#e15759', mascotas:'#0e5a99'}
  };
})();
