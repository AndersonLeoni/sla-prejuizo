/* ===================== shared helpers ===================== */
const nfInt=new Intl.NumberFormat('pt-BR');
const nf1=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
const nfBRL=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const nfBRL2=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const shortN=v=>v>=1e6?(v/1e6).toFixed(2).replace('.',',')+' mi':v>=1e3?Math.round(v/1e3)+' mil':nfInt.format(Math.round(v));
/* unico ponto de formatacao de moeda com simbolo: substitui a concatenacao
   manual 'R$ '+nfBRL2.format(...) que estava espalhada pelo arquivo. */
const fmtBRL=v=>'R$ '+nfBRL2.format(v);
const fmtBRLCompact=v=>'R$ '+shortN(v);
const MN=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const mLab=m=>{const[y,mm]=m.split('-');return MN[+mm-1]+'/'+y.slice(2);};
const mFull=m=>{const[y,mm]=m.split('-');return MN[+mm-1]+'/'+y;};
const SEQ=['--seq-100','--seq-200','--seq-300','--seq-400','--seq-500','--seq-600','--seq-700'];
const ORD=['--ord-1','--ord-2','--ord-3','--ord-4','--ord-5'];
const JIRA='https://cvccorp.atlassian.net/browse/';
const NS='http://www.w3.org/2000/svg';
const mk=(t,a)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);return e;};
/* largura real do recipiente: o grafico desenha em pixels reais, entao o texto dos
   eixos nao encolhe quando o cartao fica estreito (antes o SVG era esticado) */
const vw=el=>Math.max(320,el.clientWidth||1000);

const tip=document.getElementById('tip');
function showTip(e,html){
  tip.innerHTML=html; tip.style.opacity=1;
  const r=tip.getBoundingClientRect();
  let x=e.clientX+15,y=e.clientY+15;
  if(x+r.width>innerWidth-10) x=e.clientX-r.width-15;
  if(y+r.height>innerHeight-10) y=e.clientY-r.height-15;
  tip.style.left=x+'px'; tip.style.top=y+'px';
}
const hideTip=()=>tip.style.opacity=0;
function bindTip(el,html){
  el.addEventListener('mousemove',e=>showTip(e,html));
  el.addEventListener('mouseleave',hideTip);
}
function legendInto(id,defs,line){
  document.getElementById(id).innerHTML=defs.map(d=>
    `<span><i class="${line?'ln':''}" style="background:${d.color}"></i>${esc(d.label)}</span>`).join('');
}
function hbarsInto(mountId,rows,opt){
  opt=opt||{};
  const el=document.getElementById(mountId); el.innerHTML='';
  if(!rows.length){ el.innerHTML='<div class="empty">Sem dados no recorte atual.</div>'; return; }
  const max=opt.max||Math.max(...rows.map(r=>r.value),1);   /* opt.max: escala fixa (ex.: 100 para percentuais) */
  rows.forEach((r,i)=>{
    const row=document.createElement('div'); row.className='hrow';
    row.style.setProperty('--i',i);
    const color=r.color||(opt.ordinal?`var(${ORD[Math.min(i,4)]})`:'var(--series-1)');
    row.innerHTML=`<div class="hlab" title="${esc(r.name)}">${esc(r.name)}</div>`+
      `<div class="htrack"><div class="hfill" style="width:${(r.value/max*100).toFixed(2)}%;background:${color}"></div></div>`+
      `<div class="hval">${opt.fmt?opt.fmt(r):nfInt.format(r.value)}</div>`;
    bindTip(row,`<b>${esc(r.name)}</b>${r.tip||`<span>${nfInt.format(r.value)}</span>`}`);
    /* clicar na barra aplica o filtro correspondente; clicar de novo remove */
    if(opt.onClick&&!r.isOther&&!r.noClick){
      row.classList.add('click');
      if(opt.active&&opt.active(r.name)) row.classList.add('on');
      row.addEventListener('click',()=>{hideTip();opt.onClick(r);});
    }
    el.appendChild(row);
  });
}
/* grouped / single vertical bars */
function barsInto(mountId,cats,series,opt){
  opt=opt||{};
  const el=document.getElementById(mountId); el.innerHTML='';
  if(!cats.length||!series.length){ el.innerHTML='<div class="empty">Sem dados no recorte atual.</div>'; return; }
  const W=vw(el),H=opt.h||260,mL=48,mR=10,mT=22,mB=opt.mB||48;
  const pw=W-mL-mR, ph=H-mT-mB;
  let max=0; cats.forEach((c,i)=>series.forEach(s=>{if(s.values[i]>max)max=s.values[i];}));
  max=max||1;
  const step=pw/cats.length, n=series.length;
  /* folga de 8px entre grupos; com muitas barras (step pequeno) a folga vira 40% do passo, senao a barra some */
  const gw=Math.min(Math.max(step-8,step*0.6),n>1?150:88), bw=Math.max(2,(gw-2*(n-1))/n);
  const svg=mk('svg',{viewBox:`0 0 ${W} ${H}`,role:'img'});
  svg.style.height=H+'px';
  for(let t=0;t<=4;t++){
    const y=mT+ph-(ph*t/4);
    svg.appendChild(mk('line',{x1:mL,x2:mL+pw,y1:y,y2:y,class:'gl'}));
    const lb=mk('text',{x:mL-8,y:y+3.5,class:'tk','text-anchor':'end'});
    lb.textContent=opt.fmtY?opt.fmtY(max*t/4):nfInt.format(Math.round(max*t/4));
    svg.appendChild(lb);
  }
  svg.appendChild(mk('line',{x1:mL,x2:mL+pw,y1:mT+ph,y2:mT+ph,class:'axl'}));
  const every=opt.every||1;
  cats.forEach((c,i)=>{
    const gx=mL+i*step+(step-gw)/2;
    const g=mk('g',{});
    g.appendChild(mk('rect',{x:mL+i*step,y:mT,width:step,height:ph,fill:'transparent'}));
    bindTip(g,`<b>${esc(opt.catLabel?opt.catLabel(c):c)}</b>`+series.map(s=>
      `<span>${n>1?`<i style="background:${s.color}"></i>${esc(s.label)}: `:''}`+
      `${opt.fmtV?opt.fmtV(s.values[i]):nfInt.format(s.values[i])}</span>`).join(''));
    svg.appendChild(g);
    series.forEach((s,j)=>{
      const v=s.values[i]; if(!v) return;
      const h=Math.max(2,v/max*ph), x=gx+j*(bw+2), y=mT+ph-h;
      const rad=Math.min(4,h/2,bw/2);
      const color=s.color||(opt.ordinal?`var(${ORD[Math.min(i,4)]})`:'var(--series-1)');
      svg.appendChild(mk('path',{fill:color,class:'bar',style:`--i:${i}`,d:
        `M${x},${mT+ph} L${x},${y+rad} Q${x},${y} ${x+rad},${y} L${x+bw-rad},${y} Q${x+bw},${y} ${x+bw},${y+rad} L${x+bw},${mT+ph} Z`}));
      const peak = opt.labelMode==='global' ? (v===max) : (v===Math.max(...s.values));
      if(peak&&v>0){
        const dl=mk('text',{x:x+bw/2,y:y-6,class:'dlab','text-anchor':'middle'});
        dl.textContent=opt.fmtV?opt.fmtV(v):nfInt.format(v); svg.appendChild(dl);
      }
    });
    if(i%every===0||i===cats.length-1){
      const tx=mL+i*step+step/2;
      const lb=mk('text',{x:tx,y:mT+ph+16,class:'tk',
        'text-anchor':opt.rotate?'end':'middle'});
      lb.textContent=opt.catLabel?opt.catLabel(c):c;
      if(opt.rotate) lb.setAttribute('transform',`rotate(-38 ${tx} ${mT+ph+16})`);
      svg.appendChild(lb);
    }
  });
  el.appendChild(svg);
}

/* rosca com total no centro, legenda ao lado e destaque ao passar o mouse.
   rows: [{name,value,color,tip?,isOther?}]  opt: {fmt,label,onClick,active} */
function donutInto(mountId,rows,opt){
  opt=opt||{};
  const el=document.getElementById(mountId); el.innerHTML='';
  const tot=rows.reduce((s,r)=>s+r.value,0);
  if(!rows.length||!tot){ el.innerHTML='<div class="empty">Sem dados no recorte atual.</div>'; return; }
  const R=78,C=2*Math.PI*R,GAP=rows.length>1?3:0;
  const fmt=opt.fmt||(v=>nfInt.format(v));
  const pct=v=>(v/tot*100).toFixed(1).replace('.',',')+'%';
  const svg=mk('svg',{viewBox:'0 0 200 200',role:'img'});
  const g=mk('g',{transform:'rotate(-90 100 100)'}); svg.appendChild(g);
  const cTxt=mk('text',{x:100,y:100,class:'dv','text-anchor':'middle'});
  const cSub=mk('text',{x:100,y:121,class:'dk','text-anchor':'middle'});
  const short=s=>s.length>24?s.slice(0,23)+'…':s;
  const reset=()=>{cTxt.textContent=fmt(tot);cSub.textContent=opt.label||'total';};
  const slices=[],items=[]; let acc=0;
  const hl=i=>{
    slices.forEach((s,j)=>s.classList.toggle('dim',i>=0&&j!==i));
    items.forEach((s,j)=>s.classList.toggle('dim',i>=0&&j!==i));
    if(i>=0){cTxt.textContent=pct(rows[i].value);cSub.textContent=short(rows[i].name);} else reset();
  };
  const go=r=>{ if(opt.onClick&&!r.isOther&&!r.noClick){hideTip();opt.onClick(r);} };
  rows.forEach((r,i)=>{
    const len=Math.max(r.value/tot*C-GAP,0.5);
    const c=mk('circle',{cx:100,cy:100,r:R,class:'sl',stroke:r.color,
      style:`stroke-dasharray:${len} ${C-len};stroke-dashoffset:${-acc};--i:${i}`});
    acc+=r.value/tot*C;
    const html=`<b>${esc(r.name)}</b>`+(r.tip||`<span>${fmt(r.value)}</span>`)+`<span>${pct(r.value)} do total</span>`;
    c.addEventListener('mouseenter',()=>hl(i));
    c.addEventListener('mousemove',e=>showTip(e,html));
    c.addEventListener('mouseleave',()=>{hl(-1);hideTip();});
    c.addEventListener('click',()=>go(r));
    g.appendChild(c); slices.push(c);
  });
  svg.appendChild(cTxt); svg.appendChild(cSub); reset();
  const leg=document.createElement('div'); leg.className='dleg';
  rows.forEach((r,i)=>{
    const it=document.createElement('div'); it.className='dli';
    if(opt.onClick&&!r.isOther&&!r.noClick) it.classList.add('click');
    if(opt.active&&opt.active(r.name)) it.classList.add('on');
    it.innerHTML=`<i style="background:${r.color}"></i><span class="dn" title="${esc(r.name)}">${esc(r.name)}</span>`+
      `<b>${fmt(r.value)}</b><em>${pct(r.value)}</em>`;
    it.addEventListener('mouseenter',()=>hl(i));
    it.addEventListener('mouseleave',()=>hl(-1));
    it.addEventListener('click',()=>go(r));
    leg.appendChild(it); items.push(it);
  });
  el.appendChild(svg); el.appendChild(leg);
}

/* curva suave que nao passa dos pontos (cubica monotona): nao cria "morro" falso entre meses */
function smoothPath(pts){
  const n=pts.length;
  if(n<2) return `M${pts[0][0]},${pts[0][1]}`;
  const dx=[],m=[],t=[];
  for(let i=0;i<n-1;i++){dx[i]=pts[i+1][0]-pts[i][0]; m[i]=(pts[i+1][1]-pts[i][1])/dx[i];}
  t[0]=m[0]; t[n-1]=m[n-2];
  for(let i=1;i<n-1;i++) t[i]=m[i-1]*m[i]<=0?0:(m[i-1]+m[i])/2;
  for(let i=0;i<n-1;i++){
    if(m[i]===0){t[i]=0;t[i+1]=0;continue;}
    const a=t[i]/m[i],b=t[i+1]/m[i],s=a*a+b*b;
    if(s>9){const k=3/Math.sqrt(s);t[i]=k*a*m[i];t[i+1]=k*b*m[i];}
  }
  let d=`M${pts[0][0]},${pts[0][1]}`;
  for(let i=0;i<n-1;i++){
    const h=dx[i]/3;
    d+=` C${pts[i][0]+h},${pts[i][1]+t[i]*h} ${pts[i+1][0]-h},${pts[i+1][1]-t[i+1]*h} ${pts[i+1][0]},${pts[i+1][1]}`;
  }
  return d;
}

/* serie temporal em area suave, com linha-guia e dica ao passar o mouse */
function areaInto(mountId,cats,series,opt){
  opt=opt||{};
  const el=document.getElementById(mountId); el.innerHTML='';
  if(!cats.length||!series.length){ el.innerHTML='<div class="empty">Sem dados no recorte atual.</div>'; return; }
  const W=vw(el),H=opt.h||260,mL=52,mR=16,mT=26,mB=opt.mB||50;
  const pw=W-mL-mR, ph=H-mT-mB, n=cats.length;
  let max=0; series.forEach(s=>s.values.forEach(v=>{if(v>max)max=v;})); max=max||1;
  const X=i=>n===1?mL+pw/2:mL+pw*i/(n-1), Y=v=>mT+ph-(v/max*ph);
  const fmtV=opt.fmtV||(v=>nfInt.format(v));
  const svg=mk('svg',{viewBox:`0 0 ${W} ${H}`,role:'img'});
  svg.style.height=H+'px';
  const defs=mk('defs',{}); svg.appendChild(defs);
  for(let t=0;t<=4;t++){
    const y=mT+ph-(ph*t/4);
    svg.appendChild(mk('line',{x1:mL,x2:mL+pw,y1:y,y2:y,class:'gl'}));
    const lb=mk('text',{x:mL-8,y:y+3.5,class:'tk','text-anchor':'end'});
    lb.textContent=opt.fmtY?opt.fmtY(max*t/4):nfInt.format(Math.round(max*t/4));
    svg.appendChild(lb);
  }
  svg.appendChild(mk('line',{x1:mL,x2:mL+pw,y1:mT+ph,y2:mT+ph,class:'axl'}));
  const every=opt.every||Math.max(1,Math.ceil(n/12));
  let ultimo=-1e9;
  cats.forEach((c,i)=>{
    /* o ultimo rotulo so entra se nao colar no anterior (antes saia "mai/26nov/26") */
    if(i%every!==0&&!(i===n-1&&i-ultimo>=every*0.7)) return;
    ultimo=i;
    const tx=X(i);
    const lb=mk('text',{x:tx,y:mT+ph+16,class:'tk','text-anchor':opt.rotate?'end':'middle'});
    lb.textContent=opt.catLabel?opt.catLabel(c):c;
    if(opt.rotate) lb.setAttribute('transform',`rotate(-38 ${tx} ${mT+ph+16})`);
    svg.appendChild(lb);
  });
  const rotulos=[];
  series.forEach((s,j)=>{
    const color=s.color||'var(--series-1)', gid=`ag-${mountId}-${j}`;
    const lg=mk('linearGradient',{id:gid,x1:0,y1:0,x2:0,y2:1});
    lg.appendChild(mk('stop',{offset:'0%','stop-color':color,'stop-opacity':.36}));
    lg.appendChild(mk('stop',{offset:'100%','stop-color':color,'stop-opacity':0}));
    defs.appendChild(lg);
    const pts=s.values.map((v,i)=>[X(i),Y(v)]);
    if(n>1){
      const d=smoothPath(pts);
      svg.appendChild(mk('path',{d:`${d} L${X(n-1)},${mT+ph} L${X(0)},${mT+ph} Z`,fill:`url(#${gid})`,class:'area-fill'}));
      svg.appendChild(mk('path',{d,fill:'none',stroke:color,'stroke-width':2.6,'stroke-linecap':'round',
        'stroke-linejoin':'round',pathLength:1,class:'area-line'}));
    }
    const pk=s.values.indexOf(Math.max(...s.values));
    if(s.values[pk]>0){
      svg.appendChild(mk('circle',{cx:X(pk),cy:Y(s.values[pk]),r:5,fill:color,stroke:'var(--surface-1)','stroke-width':2.5,class:'pk'}));
      /* o rotulo do pico so entra se nao cair em cima de outro ja posto (series que picam juntas) */
      const px=X(pk), py=Y(s.values[pk])-11;
      if(!rotulos.some(r=>Math.abs(r.x-px)<70&&Math.abs(r.y-py)<14)){
        const dl=mk('text',{x:px,y:py,class:'dlab','text-anchor':'middle'});
        dl.textContent=fmtV(s.values[pk]);
        rotulos.push({x:px,y:py,el:dl});
      }
    }
  });
  /* rotulos por ultimo: assim nenhum ponto de outra serie fica por cima do texto */
  rotulos.forEach(r=>svg.appendChild(r.el));
  const cross=mk('line',{x1:0,x2:0,y1:mT,y2:mT+ph,class:'xh',opacity:0}); svg.appendChild(cross);
  const dots=series.map(s=>{
    const c=mk('circle',{r:5.5,fill:s.color||'var(--series-1)',stroke:'var(--surface-1)','stroke-width':2.5,opacity:0});
    svg.appendChild(c); return c;
  });
  const hit=mk('rect',{x:mL,y:mT,width:pw,height:ph,fill:'transparent'}); svg.appendChild(hit);
  hit.addEventListener('mousemove',e=>{
    const r=svg.getBoundingClientRect(), rel=(e.clientX-r.left)/r.width*W;
    let i=n===1?0:Math.round((rel-mL)/(pw/(n-1))); i=Math.max(0,Math.min(n-1,i));
    cross.setAttribute('x1',X(i)); cross.setAttribute('x2',X(i)); cross.setAttribute('opacity',1);
    dots.forEach((c,j)=>{c.setAttribute('cx',X(i));c.setAttribute('cy',Y(series[j].values[i]));c.setAttribute('opacity',1);});
    showTip(e,`<b>${esc(opt.catLabel?opt.catLabel(cats[i]):cats[i])}</b>`+series.map(s=>
      `<span>${series.length>1?`<i style="background:${s.color}"></i>${esc(s.label)}: `:''}${fmtV(s.values[i])}</span>`).join('')+
      (opt.extra?opt.extra(i):''));
  });
  hit.addEventListener('mouseleave',()=>{cross.setAttribute('opacity',0);dots.forEach(c=>c.setAttribute('opacity',0));hideTip();});
  el.appendChild(svg);
}

/* ===================== VIEW: TEMAS ===================== */
/* ===== inicializacao comum do "casco" (tema, KPIs, favicon, menu lateral) =====
   Compartilhada entre o painel SDPREJ e a tela de SLA: chamar UMA vez, depois que
   #chipGer ja tem o carimbo da extracao. */
function iniciarShell(){
  document.getElementById('themeBtn').addEventListener('click',()=>{
    const cur=document.documentElement.getAttribute('data-theme');
    const dark=cur?cur==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme',dark?'light':'dark');
  });

  /* ===== KPIs: destaque nos dois primeiros cartoes e contagem animada =====
     Observa o recipiente em vez de mexer em cada view: toda view que troca o
     innerHTML de um .kpis passa por aqui. So conta de novo quando o texto muda,
     para um filtro que nao altera o numero nao ficar "piscando". */
  (function(){
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const last=new Map();
    const ease=t=>1-Math.pow(1-t,3);
    function contar(v,chave){
      const tn=[...v.childNodes].find(n=>n.nodeType===3&&/\d/.test(n.textContent));
      if(!tn) return;
      const txt=tn.textContent, m=txt.match(/\d{1,3}(?:\.\d{3})+|\d+/);
      if(!m||last.get(chave)===txt) return;
      last.set(chave,txt);
      /* valor com casa decimal ("87,3%"): animar so a parte inteira mostraria "12,3%" no meio */
      if(reduce||txt.charAt(m.index+m[0].length)===',') return;
      const alvo=parseInt(m[0].replace(/\./g,''),10);
      if(!(alvo>0)) return;
      const t0=performance.now(), dur=750;
      (function passo(t){
        const k=Math.min(1,(t-t0)/dur);
        tn.textContent=k>=1?txt:txt.replace(m[0],nfInt.format(Math.round(alvo*ease(k))));
        if(k<1) requestAnimationFrame(passo);
      })(t0);
    }
    function decorar(c){
      const tiles=[...c.children].filter(e=>e.classList.contains('tile'));
      if(c.id!=='t-kpis-tipo') tiles.slice(0,2).forEach((t,i)=>t.classList.add(i?'f2':'f1'));
      /* anel de progresso nos cartoes cujo valor e um percentual ("87,3%"). Vem ANTES da contagem
         animada, que troca o texto por "0%" no primeiro quadro. */
      tiles.forEach(t=>{
        const v=t.querySelector('.v'), m=v&&v.textContent.trim().match(/^(\d+(?:,\d+)?)\s*%$/);
        const velho=t.querySelector(':scope>.rg');
        if(!m){ if(velho){velho.remove(); t.classList.remove('ring');} return; }
        const r=velho||document.createElement('i');
        r.className='rg'; r.setAttribute('aria-hidden','true');
        r.style.setProperty('--p',Math.min(100,parseFloat(m[1].replace(',','.')))+'%');
        if(!velho){ t.appendChild(r); t.classList.add('ring'); }
      });
      tiles.forEach((t,i)=>{const v=t.querySelector('.v'); if(v) contar(v,c.id+i);});
    }
    const obs=new MutationObserver(ms=>ms.forEach(m=>decorar(m.target)));
    document.querySelectorAll('.kpis').forEach(c=>{
      obs.observe(c,{childList:true});
      if(c.children.length) decorar(c);
    });
  })();

  /* icone da aba do navegador = o proprio logo embutido (sem arquivo extra) */
  (function(){
    const im=document.getElementById('logoCvc'); if(!im) return;
    const l=document.createElement('link'); l.rel='icon'; l.href=im.src; document.head.appendChild(l);
  })();

  /* ===== menu lateral recolhivel =====
     A escolha fica guardada no navegador. Ao trocar a largura, dispara um resize
     depois da animacao: os graficos medem o recipiente, entao se redesenham na
     largura nova em vez de ficarem esticados. */
  (function(){
    const app=document.querySelector('.app'), btn=document.getElementById('sideToggle');
    const clock=document.getElementById('sideClock'), chip=document.getElementById('chipGer');
    const navBtns=[...document.querySelectorAll('.side-nav button')];
    const CH='sdprej.menuRecolhido';
    let fim;
    function aplicar(col,animar){
      app.classList.toggle('collapsed',col);
      btn.setAttribute('aria-expanded',String(!col));
      const rot=col?'Expandir menu':'Recolher menu';
      btn.title=rot; btn.setAttribute('aria-label',rot);
      navBtns.forEach(b=>{ if(col) b.title=b.querySelector('span').textContent; else b.removeAttribute('title'); });
      clearTimeout(fim);
      fim=setTimeout(()=>dispatchEvent(new Event('resize')),animar?340:0);
    }
    /* o carimbo da extracao some junto com o chip; vira dica do relogio */
    const espelha=()=>{clock.title=chip.textContent;};
    new MutationObserver(espelha).observe(chip,{childList:true}); espelha();

    let ini=false; try{ ini=localStorage.getItem(CH)==='1'; }catch(e){}
    app.classList.add('nt'); aplicar(ini,false);
    requestAnimationFrame(()=>requestAnimationFrame(()=>app.classList.remove('nt')));

    btn.addEventListener('click',()=>{
      const col=!app.classList.contains('collapsed');
      aplicar(col,true);
      try{ localStorage.setItem(CH,col?'1':'0'); }catch(e){}
    });
  })();
}
