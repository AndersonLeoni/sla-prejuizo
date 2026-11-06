/* ===================== SLA do ciclo =====================
   Tela separada. Tudo e calculado aqui, no navegador, a partir de SL (data/sla.json):
   a meta e editavel, entao o payload nao traz nenhum resultado pre-calculado.
   Os componentes de grafico/menu vem de shared.js (os mesmos do painel de prejuizo). */

const DIA=864e5;
const dn=s=>Date.UTC(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10))/DIA;
const HOJE=dn(SL.hoje);
const R=SL.rows;
R.forEach(r=>{
  r.tema=SL.temas[r.t]; r.produto=SL.produtos[r.p]; r.nat=SL.naturezas[r.n];
  r.area=SL.areas[r.a]; r.status=SL.status[r.s];
  r.ano=r.c.slice(0,4); r.mesEnc=r.r?r.r.slice(0,7):'';
  /* encerrado: ate a resolucao; em aberto: ate a data da extracao (nao ate "agora",
     para o numero nao mudar sozinho entre uma abertura da tela e outra) */
  r.ciclo=Math.max(0,(r.d?dn(r.r):HOJE)-dn(r.c));
});

/* ordem = da melhor para a pior situacao; as cores seguem a paleta de status */
const CLS=[
  {c:'ok',  lbl:'Encerrado no prazo',       color:'var(--good)'},
  {c:'fora',lbl:'Encerrado fora do prazo',  color:'var(--warning)'},
  {c:'cur', lbl:'Em curso, dentro da meta', color:'var(--series-1)'},
  {c:'ven', lbl:'Em curso, vencido',        color:'var(--critical)'}
];
const CK=Object.fromEntries(CLS.map(c=>[c.c,c]));
const CORD=Object.fromEntries(CLS.map((c,i)=>[c.c,i]));
const BINS=[{l:'0-30',max:30},{l:'31-60',max:60},{l:'61-90',max:90},{l:'91-180',max:180},
            {l:'181-365',max:365},{l:'366-540',max:540},{l:'541+',max:Infinity}];

const ViewSla=(function(){
  let sortKey='ciclo', sortDir=-1, shown=100, quem='';
  const $=id=>document.getElementById(id);
  const META_PADRAO=90;
  const meta=()=>Math.max(1,parseInt($('sMeta').value,10)||META_PADRAO);

  const uniq=k=>[...new Set(R.map(r=>r[k]))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  function fill(id,vals){
    const s=$(id);
    vals.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;s.appendChild(o);});
  }
  fill('sTema',uniq('tema')); fill('sProduto',uniq('produto')); fill('sNat',uniq('nat'));
  fill('sArea',uniq('area')); fill('sAno',[...new Set(R.map(r=>r.ano))].sort().reverse());
  fill('sRes',CLS.map(c=>c.lbl));

  /* clicar numa barra/fatia aplica o filtro; clicar de novo remove */
  const pick=id=>({
    onClick:r=>{const s=$(id);s.value=(s.value===r.name)?'':r.name;shown=100;render();},
    active:n=>$(id).value===n});

  const sum=(rs,f)=>rs.reduce((a,r)=>a+f(r),0);
  const pct=(a,b)=>b?a/b*100:0;
  const sortedD=rs=>rs.map(r=>r.ciclo).sort((x,y)=>x-y);
  const med=v=>v.length?v[v.length>>1]:0;                         /* central superior, como no painel de prejuizo */
  const p90=v=>v.length?v[Math.min(v.length-1,Math.ceil(v.length*.9)-1)]:0;
  const avg=v=>v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):0;
  const f1=v=>nf1.format(v);

  function current(){
    const m=meta(), t=$('sTema').value, p=$('sProduto').value, n=$('sNat').value, a=$('sArea').value,
          y=$('sAno').value, res=$('sRes').value, q=$('sBusca').value.trim().toLowerCase();
    const out=[];
    for(const r of R){
      r.cls=r.d?(r.ciclo<=m?'ok':'fora'):(r.ciclo<=m?'cur':'ven');   /* a meta muda a classe de TODOS, filtrados ou nao */
      if(t&&r.tema!==t) continue;
      if(p&&r.produto!==p) continue;
      if(n&&r.nat!==n) continue;
      if(a&&r.area!==a) continue;
      if(y&&r.ano!==y) continue;
      if(res&&CK[r.cls].lbl!==res) continue;
      if(q&&!(r.k+' '+r.m+' '+r.tema+' '+r.status).toLowerCase().includes(q)) continue;
      out.push(r);
    }
    return out;
  }

  function kpis(rows,enc,abr,m){
    const ok=enc.filter(r=>r.cls==='ok'), fora=enc.filter(r=>r.cls==='fora'), ven=abr.filter(r=>r.cls==='ven');
    const d=sortedD(enc), val=x=>sum(x,r=>r.v);
    const velho=abr.length?Math.max(...abr.map(r=>r.ciclo)):0;
    $('s-kpis').innerHTML=`
      <div class="tile"><div class="k">Chamados no recorte</div><div class="v">${nfInt.format(rows.length)}</div>
        <div class="n">${nfInt.format(enc.length)} encerrados · ${nfInt.format(abr.length)} em aberto</div></div>
      <div class="tile"><div class="k">Cumprimento do SLA</div><div class="v">${enc.length?f1(pct(ok.length,enc.length))+'%':'—'}</div>
        <div class="n">${nfInt.format(ok.length)} de ${nfInt.format(enc.length)} encerrados em até ${nfInt.format(m)} dias</div></div>
      <div class="tile"><div class="k">Tempo mediano do ciclo</div><div class="v">${nfInt.format(med(d))}<small> dias</small></div>
        <div class="n">P90: ${nfInt.format(p90(d))} dias · média ${nfInt.format(avg(d))} dias</div></div>
      <div class="tile"><div class="k">Encerrados fora do prazo</div><div class="v">${nfInt.format(fora.length)}</div>
        <div class="n">${f1(pct(fora.length,enc.length))}% dos encerrados · ${fmtBRL(val(fora))}</div></div>
      <div class="tile alert"><div class="k">Em aberto, vencidos</div><div class="v">${nfInt.format(ven.length)}</div>
        <div class="n">${f1(pct(ven.length,abr.length))}% do backlog · mais antigo ${nfInt.format(velho)} dias</div></div>
      <div class="tile"><div class="k">Prejuízo fora do SLA</div><div class="v">${nfBRL.format(val(fora)+val(ven))}</div>
        <div class="n">${nfInt.format(fora.length+ven.length)} chamados: encerrados fora + em aberto vencidos</div></div>`;
  }

  function resultado(rows){
    const rs=CLS.map(c=>({name:c.lbl,value:rows.filter(r=>r.cls===c.c).length,color:c.color}))
      .filter(r=>r.value>0);
    donutInto('s-ch-res',rs,{label:'chamados',...pick('sRes')});
  }

  function distribuicao(enc,m){
    const vals=BINS.map(()=>0);
    enc.forEach(r=>{vals[BINS.findIndex(b=>r.ciclo<=b.max)]++;});
    const d=sortedD(enc);
    $('s-cs-dist').innerHTML=enc.length
      ? `Faixas de dias entre a abertura e o encerramento. Mediana <b>${nfInt.format(med(d))}</b> dias, P90 <b>${nfInt.format(p90(d))}</b> dias; `+
        `<b>${f1(pct(enc.filter(r=>r.ciclo<=m).length,enc.length))}%</b> fecham em até ${nfInt.format(m)} dias.`
      : 'Nenhum chamado encerrado no recorte atual.';
    barsInto('s-ch-dist',BINS.map(b=>b.l),[{label:'Encerrados',values:vals}],{ordinal:true,h:240,mB:44});
  }

  function porMes(enc){
    const g=new Map();
    enc.forEach(r=>{const e=g.get(r.mesEnc)||{n:0,ok:0,c:[]}; e.n++; if(r.cls==='ok')e.ok++; e.c.push(r.ciclo); g.set(r.mesEnc,e);});
    /* mes com poucos encerramentos da pico de 0% ou 100% sem significado: fica fora, e a tela diz quanto */
    const MIN=5;
    const todos=[...g.keys()].sort(), ms=todos.filter(k=>g.get(k).n>=MIN), ev=Math.max(1,Math.ceil(ms.length/12));
    const fora=todos.filter(k=>g.get(k).n<MIN);
    const aviso=fora.length
      ? ` <em>${nfInt.format(fora.length)} ${fora.length===1?'mês com':'meses com'} menos de ${MIN} encerramentos (${nfInt.format(fora.reduce((s,k)=>s+g.get(k).n,0))} chamados) ficaram fora do gráfico.</em>`
      : '';
    $('s-cs-mespct').innerHTML='% dos chamados encerrados no mês que fecharam em até a meta. A dica mostra o volume do mês.'+aviso;
    $('s-cs-mesdias').innerHTML='Mediana e P90 (9 em cada 10 fecham em até este valor), em dias.'+aviso;
    const extra=i=>`<span>${nfInt.format(g.get(ms[i]).n)} encerrados no mês</span>`;
    areaInto('s-ch-mespct',ms,[{label:'No prazo',color:'var(--series-1)',values:ms.map(k=>pct(g.get(k).ok,g.get(k).n))}],
      {rotate:true,every:ev,mB:52,catLabel:mLab,fmtV:v=>f1(v)+'%',fmtY:v=>Math.round(v)+'%',extra});
    const dias=ms.map(k=>g.get(k).c.slice().sort((x,y)=>x-y));
    const defs=[{label:'Mediana',color:'var(--series-1)'},{label:'P90',color:'var(--series-2)'}];
    legendInto('s-lg-mes',defs,true);
    areaInto('s-ch-mesdias',ms,[{label:'Mediana',color:defs[0].color,values:dias.map(med)},
                                {label:'P90',color:defs[1].color,values:dias.map(p90)}],
      {rotate:true,every:ev,mB:52,catLabel:mLab,fmtV:v=>nfInt.format(v)+' d',fmtY:v=>Math.round(v)+' d',extra});
  }

  function dimensao(mount,enc,key,limite,idFiltro){
    const g=new Map();
    enc.forEach(r=>{const e=g.get(r[key])||{name:r[key],n:0,ok:0,v:0,c:[]};
      e.n++; if(r.cls==='ok')e.ok++; e.v+=r.v; e.c.push(r.ciclo); g.set(r[key],e);});
    const rows=[...g.values()].sort((a,b)=>b.n-a.n||a.name.localeCompare(b.name,'pt-BR')).slice(0,limite)
      .map(e=>{const c=e.c.sort((x,y)=>x-y), p=pct(e.ok,e.n);
        return {name:e.name,value:p,n:e.n,
          tip:`<span>${nfInt.format(e.n)} encerrados · ${f1(p)}% no prazo</span>`+
              `<span>Mediana ${nfInt.format(med(c))} d · P90 ${nfInt.format(p90(c))} d</span>`+
              `<span>${fmtBRL(e.v)}</span>`};});
    hbarsInto(mount,rows,{max:100,fmt:r=>`${f1(r.value)}% (${nfInt.format(r.n)})`,...pick(idFiltro)});
  }

  function backlog(abr,m){
    const dentro=abr.filter(r=>r.ciclo<=m), ate2=abr.filter(r=>r.ciclo>m&&r.ciclo<=2*m), mais2=abr.filter(r=>r.ciclo>2*m);
    const mk2=(name,rs,color)=>({name,value:rs.length,color,
      tip:`<span>${nfInt.format(rs.length)} chamados · ${f1(pct(rs.length,abr.length))}% do backlog</span>`+
          `<span>${fmtBRL(sum(rs,r=>r.v))}</span>`+(rs.length?`<span>idade mediana ${nfInt.format(med(sortedD(rs)))} dias</span>`:'')});
    hbarsInto('s-ch-back',[
      mk2(`Dentro da meta (até ${nfInt.format(m)} dias)`,dentro,'var(--good)'),
      mk2(`Até 2× a meta (${nfInt.format(m+1)}–${nfInt.format(2*m)} dias)`,ate2,'var(--warning)'),
      mk2(`Mais de 2× a meta (acima de ${nfInt.format(2*m)} dias)`,mais2,'var(--critical)')].filter(r=>r.value>0),{});
    $('s-cs-back').innerHTML=abr.length
      ? `<b>${nfInt.format(abr.length)}</b> chamados em aberto; <b>${nfInt.format(ate2.length+mais2.length)}</b> `+
        `(${f1(pct(ate2.length+mais2.length,abr.length))}%) já passaram da meta de ${nfInt.format(m)} dias e `+
        `<b>${nfInt.format(mais2.length)}</b> passaram do dobro.`
      : 'Nenhum chamado em aberto no recorte atual.';
    const anos=[...new Set(abr.map(r=>r.ano))].sort();
    barsInto('s-ch-ano',anos,[{label:'Em aberto',values:anos.map(a=>abr.filter(r=>r.ano===a).length)}],{h:240,mB:44});
  }

  function atrasos(abr,m){
    const top=[...abr].sort((a,b)=>b.ciclo-a.ciclo).slice(0,12);
    document.querySelector('#s-late tbody').innerHTML=top.length?top.map(r=>`<tr>
      <td><a href="${JIRA}${esc(r.k)}" target="_blank" rel="noopener">${esc(r.k)}</a></td>
      <td class="sum" title="${esc(r.m)}">${esc(r.m)}</td>
      <td><span class="pill">${esc(r.tema)}</span></td>
      <td style="color:var(--text-secondary)">${esc(r.status)}</td>
      <td class="num age-hi">${nfInt.format(r.ciclo)}</td>
      <td class="num">${r.ciclo>m?'+'+nfInt.format(r.ciclo-m)+' d':'—'}</td>
      <td class="num" style="font-weight:620">${nfBRL2.format(r.v)}</td></tr>`).join('')
      :'<tr><td colspan="7" class="empty">Nenhum chamado em aberto no recorte atual.</td></tr>';
  }

  function tabela(rows,m){
    const base=quem===''?rows:rows.filter(r=>String(r.d)===quem);
    const key=r=>sortKey==='k'?Number(r.k.split('-')[1]):sortKey==='cls'?CORD[r.cls]:r[sortKey];
    const sorted=[...base].sort((a,b)=>{
      const x=key(a), y=key(b);
      return typeof x==='number'?(x-y)*sortDir:String(x||'').localeCompare(String(y||''),'pt-BR')*sortDir;
    });
    const sl=sorted.slice(0,shown);
    document.querySelector('#s-dt tbody').innerHTML=sl.length?sl.map(r=>`<tr>
      <td><a href="${JIRA}${esc(r.k)}" target="_blank" rel="noopener">${esc(r.k)}</a></td>
      <td class="sum" title="${esc(r.m)}">${esc(r.m)}</td>
      <td><span class="pill">${esc(r.tema)}</span></td>
      <td style="color:var(--text-secondary)">${esc(r.status)}</td>
      <td class="num" style="color:var(--text-secondary)">${esc(r.c)}</td>
      <td class="num" style="color:var(--text-secondary)">${esc(r.r||'—')}</td>
      <td class="num ${r.ciclo>m?'age-hi':''}">${nfInt.format(r.ciclo)}</td>
      <td><span class="gpill"><i style="background:${CK[r.cls].color}"></i>${esc(CK[r.cls].lbl)}</span></td>
      <td class="num" style="font-weight:620">${nfBRL2.format(r.v)}</td></tr>`).join('')
      :'<tr><td colspan="9" class="empty">Sem chamados no recorte atual.</td></tr>';
    $('s-count').textContent=`Exibindo ${nfInt.format(sl.length)} de ${nfInt.format(base.length)} chamados · soma do recorte ${fmtBRL(sum(base,r=>r.v))}`;
    $('s-more').style.display=sl.length<base.length?'':'none';
    document.querySelectorAll('#s-dt th').forEach(th=>{
      const a=th.querySelector('.ar'); if(!a) return;
      a.textContent=th.dataset.s===sortKey?(sortDir>0?'▲':'▼'):'↕';
      a.style.opacity=th.dataset.s===sortKey?1:.45;
    });
  }

  function render(){
    const m=meta(), rows=current();
    const enc=rows.filter(r=>r.d), abr=rows.filter(r=>!r.d);
    kpis(rows,enc,abr,m);
    resultado(rows); distribuicao(enc,m); porMes(enc);
    dimensao('s-ch-tema',enc,'tema',10,'sTema');
    dimensao('s-ch-area',enc,'area',10,'sArea');
    dimensao('s-ch-prod',enc,'produto',10,'sProduto');
    dimensao('s-ch-nat',enc,'nat',10,'sNat');
    backlog(abr,m); atrasos(abr,m); tabela(rows,m);
  }

  const FILTROS=['sTema','sProduto','sNat','sArea','sAno','sRes'];
  FILTROS.forEach(id=>$(id).addEventListener('change',()=>{shown=100;render();}));
  let deb;
  const adia=()=>{clearTimeout(deb);deb=setTimeout(()=>{shown=100;render();},200);};
  $('sMeta').addEventListener('input',adia);
  $('sBusca').addEventListener('input',adia);
  $('s-clear').addEventListener('click',()=>{
    FILTROS.forEach(id=>$(id).value='');
    $('sBusca').value=''; $('sMeta').value=META_PADRAO; shown=100; render();});
  $('sSeg').addEventListener('click',e=>{
    const b=e.target.closest('button[data-q]'); if(!b) return;
    quem=b.dataset.q; shown=100;
    [...e.currentTarget.querySelectorAll('button')].forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    render();});
  document.querySelectorAll('#s-dt th').forEach(th=>th.addEventListener('click',()=>{
    const k=th.dataset.s; if(!k) return;
    if(k===sortKey) sortDir*=-1; else {sortKey=k; sortDir=(k==='ciclo'||k==='v'||k==='c'||k==='r')?-1:1;}
    render();}));
  $('s-more').addEventListener('click',()=>{shown+=100;render();});
  $('s-csv').addEventListener('click',()=>{
    const m=meta(), rows=current();
    const base=quem===''?rows:rows.filter(r=>String(r.d)===quem);
    const head=['Chave','Resumo','Tema','Produto','Natureza','Area identificadora','Status','Criado','Encerrado',
                'Ciclo (dias)','Meta (dias)','Resultado','Valor R$'];
    const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const csv='﻿'+[head.join(';'),...base.map(r=>[r.k,r.m,r.tema,r.produto,r.nat,r.area,r.status,r.c,r.r,r.ciclo,m,
      CK[r.cls].lbl,String(r.v).replace('.',',')].map(q).join(';'))].join('\r\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    a.download='sdprej-sla-ciclo-'+new Date().toISOString().slice(0,10)+'.csv'; a.click();});

  $('s-tot').textContent=nfInt.format(R.length);
  $('s-jql').textContent=SL.jql;
  return {render};
})();

/* ===================== TRATATIVA POR ANALISTA =====================
   Cada linha de SL.trat e uma PASSAGEM do chamado pela etapa de analise (a parte da TI):
   da entrada ate a entrega a conferencia, atribuida a quem entregou (extract/tratativa.js).
   Como no ciclo, a meta e editavel e tudo e calculado aqui. */

const TR=SL.trat;
TR.forEach(p=>{
  const r=R[p.t];
  p.k=r.k; p.resumo=r.m; p.tema=r.tema; p.produto=r.produto; p.v=r.v;
  p.min=p.m;                                   /* minutos corridos */
  p.entregue=p.f!=='';
  p.analista=p.a>=0?SL.analistas[p.a]:'(na fila)';
  p.ano=(p.f||p.i).slice(0,4);                 /* ano da entrega (na fila: ano da entrada) */
  p.mesEnt=p.f?p.f.slice(0,7):'';
});

const ZCLS=[
  {c:'ok',  lbl:'Entregue no prazo',      color:'var(--good)'},
  {c:'fora',lbl:'Entregue fora do prazo', color:'var(--warning)'},
  {c:'cur', lbl:'Na fila, dentro da meta',color:'var(--series-1)'},
  {c:'ven', lbl:'Na fila, vencida',       color:'var(--critical)'}
];
const ZK=Object.fromEntries(ZCLS.map(c=>[c.c,c]));
const ZORD=Object.fromEntries(ZCLS.map((c,i)=>[c.c,i]));
/* faixas do tempo de tratativa, em minutos */
const ZBINS=[{l:'até 1 h',max:60},{l:'1–4 h',max:240},{l:'4–24 h',max:1440},{l:'1–3 d',max:4320},
             {l:'3–7 d',max:10080},{l:'7–30 d',max:43200},{l:'30–90 d',max:129600},{l:'+ de 90 d',max:Infinity}];
/* minutos -> texto legivel: a tratativa vai de minutos a anos */
const fmtT=m=>m<60?`${nfInt.format(Math.round(m))} min`:m<1440?`${nf1.format(m/60)} h`
  :m<144000?`${nf1.format(m/1440)} d`:`${nfInt.format(Math.round(m/1440))} d`;   /* >= 100 dias: sem casa decimal */

const ViewTrat=(function(){
  let sortKey='min', sortDir=-1, shown=100, quem='', anKey='n', anDir=-1;
  const $=id=>document.getElementById(id);
  const META_PADRAO=30;
  const meta=()=>{const v=parseFloat($('zMeta').value); return v>0?v:META_PADRAO;};
  const fmtMeta=d=>(Number.isInteger(d)?nfInt.format(d):nf1.format(d))+' dias';

  const uniq=k=>[...new Set(TR.map(p=>p[k]))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  function fill(id,vals){
    const s=$(id);
    vals.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;s.appendChild(o);});
  }
  fill('zAnalista',[...SL.analistas].sort((a,b)=>a.localeCompare(b,'pt-BR')));
  fill('zAno',[...new Set(TR.map(p=>p.ano))].sort().reverse());
  fill('zTema',uniq('tema')); fill('zProduto',uniq('produto')); fill('zRes',ZCLS.map(c=>c.lbl));

  const pick=id=>({
    onClick:r=>{const s=$(id);s.value=(s.value===r.name)?'':r.name;shown=100;render();},
    active:n=>$(id).value===n});

  const sum=(rs,f)=>rs.reduce((a,r)=>a+f(r),0);
  const pct=(a,b)=>b?a/b*100:0;
  const ord=rs=>rs.map(p=>p.min).sort((x,y)=>x-y);
  const med=v=>v.length?v[v.length>>1]:0;
  const p90=v=>v.length?v[Math.min(v.length-1,Math.ceil(v.length*.9)-1)]:0;
  const avg=v=>v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
  const f1=v=>nf1.format(v);

  /* base = tudo menos o filtro de analista (o quadro por analista compara todos); rows = base + analista */
  function filtrar(){
    const m=meta()*1440, ps=$('zPass').value, y=$('zAno').value, t=$('zTema').value, pr=$('zProduto').value,
          res=$('zRes').value, an=$('zAnalista').value, q=$('zBusca').value.trim().toLowerCase();
    const base=[];
    for(const p of TR){
      p.cls=p.entregue?(p.min<=m?'ok':'fora'):(p.min<=m?'cur':'ven');   /* a meta reclassifica TODAS */
      if(ps==='1'&&p.n!==1) continue;
      if(ps==='2'&&p.n===1) continue;
      if(y&&p.ano!==y) continue;
      if(t&&p.tema!==t) continue;
      if(pr&&p.produto!==pr) continue;
      if(res&&ZK[p.cls].lbl!==res) continue;
      if(q&&!(p.k+' '+p.resumo+' '+p.tema+' '+p.analista).toLowerCase().includes(q)) continue;
      base.push(p);
    }
    return {base,rows:an?base.filter(p=>p.analista===an):base};
  }

  function kpis(rows,m){
    const ent=rows.filter(p=>p.entregue), fila=rows.filter(p=>!p.entregue);
    const ok=ent.filter(p=>p.cls==='ok'), fora=ent.filter(p=>p.cls==='fora'), ven=fila.filter(p=>p.cls==='ven');
    const d=ord(ent), ativos=new Set(ent.map(p=>p.analista)).size;
    const velho=fila.length?Math.max(...fila.map(p=>p.min)):0;
    $('z-kpis').innerHTML=`
      <div class="tile"><div class="k">Tratativas entregues</div><div class="v">${nfInt.format(ent.length)}</div>
        <div class="n">${nfInt.format(fila.length)} aguardando na fila agora</div></div>
      <div class="tile"><div class="k">Cumprimento do SLA</div><div class="v">${ent.length?f1(pct(ok.length,ent.length))+'%':'—'}</div>
        <div class="n">${nfInt.format(ok.length)} de ${nfInt.format(ent.length)} entregues em até ${fmtMeta(m)}</div></div>
      <div class="tile"><div class="k">Tempo mediano de tratativa</div><div class="v">${fmtT(med(d))}</div>
        <div class="n">P90: ${fmtT(p90(d))} · média ${fmtT(avg(d))}</div></div>
      <div class="tile"><div class="k">Entregues fora do prazo</div><div class="v">${nfInt.format(fora.length)}</div>
        <div class="n">${f1(pct(fora.length,ent.length))}% das entregues · ${fmtBRL(sum(fora,p=>p.v))}</div></div>
      <div class="tile alert"><div class="k">Fila vencida</div><div class="v">${nfInt.format(ven.length)}</div>
        <div class="n">${f1(pct(ven.length,fila.length))}% da fila · mais antiga há ${fmtT(velho)}</div></div>
      <div class="tile"><div class="k">Analistas no recorte</div><div class="v">${nfInt.format(ativos)}</div>
        <div class="n">${ativos?f1(ent.length/ativos):'0'} tratativas entregues por analista em média</div></div>`;
  }

  function resultado(rows){
    const rs=ZCLS.map(c=>({name:c.lbl,value:rows.filter(p=>p.cls===c.c).length,color:c.color})).filter(r=>r.value>0);
    donutInto('z-ch-res',rs,{label:'tratativas',...pick('zRes')});
  }

  function distribuicao(ent,m){
    const vals=ZBINS.map(()=>0);
    ent.forEach(p=>{vals[ZBINS.findIndex(b=>p.min<=b.max)]++;});
    const d=ord(ent);
    $('z-cs-dist').innerHTML=ent.length
      ? `Da entrada na análise até a entrega. Mediana <b>${fmtT(med(d))}</b>, P90 <b>${fmtT(p90(d))}</b>; `+
        `<b>${f1(pct(ent.filter(p=>p.min<=m).length,ent.length))}%</b> saem em até ${fmtMeta(m/1440)}.`
      : 'Nenhuma tratativa entregue no recorte atual.';
    barsInto('z-ch-dist',ZBINS.map(b=>b.l),[{label:'Entregues',values:vals}],{ordinal:true,h:240,mB:44});
  }

  function ranking(base){
    const g=new Map();
    base.filter(p=>p.entregue).forEach(p=>{
      const e=g.get(p.analista)||{nome:p.analista,n:0,ok:0,v:0,c:[]};
      e.n++; if(p.cls==='ok')e.ok++; e.v+=p.v; e.c.push(p.min); g.set(p.analista,e);});
    const lista=[...g.values()].map(e=>{const c=e.c.sort((x,y)=>x-y);
      return {...e,pct:pct(e.ok,e.n),med:med(c),p90:p90(c),avg:avg(c),max:c[c.length-1]};});
    lista.sort((a,b)=>{const x=a[anKey],y=b[anKey];
      return typeof x==='number'?(x-y)*anDir||b.n-a.n:String(x).localeCompare(String(y),'pt-BR')*anDir;});
    const sel=$('zAnalista').value;
    document.querySelector('#z-an tbody').innerHTML=lista.length?lista.map(e=>`<tr class="${e.nome===sel?'on':''}" data-nome="${esc(e.nome)}" style="cursor:pointer${e.nome===sel?';box-shadow:inset 3px 0 0 var(--brand-yellow);background:color-mix(in srgb,var(--series-1) 10%,transparent)':''}">
      <td>${esc(e.nome)}</td>
      <td class="num">${nfInt.format(e.n)}</td>
      <td class="num">${nfInt.format(e.ok)}</td>
      <td class="num" style="font-weight:620">${f1(e.pct)}%</td>
      <td class="num">${fmtT(e.med)}</td>
      <td class="num">${fmtT(e.p90)}</td>
      <td class="num">${fmtT(e.avg)}</td>
      <td class="num">${fmtT(e.max)}</td>
      <td class="num">${nfBRL2.format(e.v)}</td></tr>`).join('')
      :'<tr><td colspan="9" class="empty">Nenhuma tratativa entregue no recorte atual.</td></tr>';
    document.querySelectorAll('#z-an th').forEach(th=>{
      const a=th.querySelector('.ar'); if(!a) return;
      a.textContent=th.dataset.s===anKey?(anDir>0?'▲':'▼'):'↕';
      a.style.opacity=th.dataset.s===anKey?1:.45;
    });
  }

  function porMes(ent){
    const g=new Map();
    ent.forEach(p=>{const e=g.get(p.mesEnt)||{n:0,ok:0,c:[]}; e.n++; if(p.cls==='ok')e.ok++; e.c.push(p.min); g.set(p.mesEnt,e);});
    const MIN=5;
    const todos=[...g.keys()].sort(), ms=todos.filter(k=>g.get(k).n>=MIN), ev=Math.max(1,Math.ceil(ms.length/12));
    const fora=todos.filter(k=>g.get(k).n<MIN);
    const aviso=fora.length
      ? ` <em>${nfInt.format(fora.length)} ${fora.length===1?'mês com':'meses com'} menos de ${MIN} entregas (${nfInt.format(fora.reduce((s,k)=>s+g.get(k).n,0))} tratativas) ficaram fora do gráfico.</em>`
      : '';
    $('z-cs-mespct').innerHTML='% das tratativas entregues no mês que saíram em até a meta. A dica mostra o volume do mês.'+aviso;
    $('z-cs-mesdias').innerHTML='Mediana e P90 do tempo de tratativa das entregas do mês.'+aviso;
    const extra=i=>`<span>${nfInt.format(g.get(ms[i]).n)} entregues no mês</span>`;
    areaInto('z-ch-mespct',ms,[{label:'No prazo',color:'var(--series-1)',values:ms.map(k=>pct(g.get(k).ok,g.get(k).n))}],
      {rotate:true,every:ev,mB:52,catLabel:mLab,fmtV:v=>f1(v)+'%',fmtY:v=>Math.round(v)+'%',extra});
    const dias=ms.map(k=>g.get(k).c.slice().sort((x,y)=>x-y));
    const defs=[{label:'Mediana',color:'var(--series-1)'},{label:'P90',color:'var(--series-2)'}];
    legendInto('z-lg-mes',defs,true);
    areaInto('z-ch-mesdias',ms,[{label:'Mediana',color:defs[0].color,values:dias.map(med)},
                                {label:'P90',color:defs[1].color,values:dias.map(p90)}],
      {rotate:true,every:ev,mB:52,catLabel:mLab,fmtV:fmtT,fmtY:fmtT,extra});
  }

  function dimensao(mount,ent,keyFn,limite,filtroId){
    const g=new Map();
    ent.forEach(p=>{const k=keyFn(p); const e=g.get(k)||{name:k,n:0,ok:0,v:0,c:[]};
      e.n++; if(p.cls==='ok')e.ok++; e.v+=p.v; e.c.push(p.min); g.set(k,e);});
    const rows=[...g.values()].sort((a,b)=>b.n-a.n||a.name.localeCompare(b.name,'pt-BR')).slice(0,limite)
      .map(e=>{const c=e.c.sort((x,y)=>x-y), pc=pct(e.ok,e.n);
        return {name:e.name,value:pc,n:e.n,
          tip:`<span>${nfInt.format(e.n)} entregues · ${f1(pc)}% no prazo</span>`+
              `<span>Mediana ${fmtT(med(c))} · P90 ${fmtT(p90(c))}</span><span>${fmtBRL(e.v)}</span>`};});
    hbarsInto(mount,rows,{max:100,fmt:r=>`${f1(r.value)}% (${nfInt.format(r.n)})`,...(filtroId?pick(filtroId):{})});
  }

  function fila(fl,m){
    const dentro=fl.filter(p=>p.min<=m), ate2=fl.filter(p=>p.min>m&&p.min<=2*m), mais2=fl.filter(p=>p.min>2*m);
    const mk2=(name,rs,color)=>({name,value:rs.length,color,
      tip:`<span>${nfInt.format(rs.length)} tratativas · ${f1(pct(rs.length,fl.length))}% da fila</span>`+
          `<span>${fmtBRL(sum(rs,p=>p.v))}</span>`+(rs.length?`<span>espera mediana ${fmtT(med(ord(rs)))}</span>`:'')});
    const md=m/1440;
    hbarsInto('z-ch-fila',[
      mk2(`Dentro da meta (até ${fmtMeta(md)})`,dentro,'var(--good)'),
      mk2(`Até 2× a meta (até ${fmtMeta(2*md)})`,ate2,'var(--warning)'),
      mk2(`Mais de 2× a meta (acima de ${fmtMeta(2*md)})`,mais2,'var(--critical)')].filter(r=>r.value>0),{});
    $('z-cs-fila').innerHTML=fl.length
      ? `<b>${nfInt.format(fl.length)}</b> tratativas na fila agora; <b>${nfInt.format(ate2.length+mais2.length)}</b> `+
        `(${f1(pct(ate2.length+mais2.length,fl.length))}%) já passaram da meta e <b>${nfInt.format(mais2.length)}</b> do dobro. `+
        `Ainda não têm analista: o tempo corre desde a entrada na análise.`
      : 'Nenhuma tratativa na fila no recorte atual.';
    const g=new Map();
    fl.forEach(p=>{const e=g.get(p.tema)||{name:p.tema,value:0,v:0}; e.value++; e.v+=p.v; g.set(p.tema,e);});
    hbarsInto('z-ch-filatema',[...g.values()].sort((a,b)=>b.value-a.value).slice(0,10)
      .map(e=>({name:e.name,value:e.value,tip:`<span>${nfInt.format(e.value)} na fila</span><span>${fmtBRL(e.v)}</span>`})),{...pick('zTema')});
  }

  function esperas(fl,m){
    const top=[...fl].sort((a,b)=>b.min-a.min).slice(0,12);
    document.querySelector('#z-late tbody').innerHTML=top.length?top.map(p=>`<tr>
      <td><a href="${JIRA}${esc(p.k)}" target="_blank" rel="noopener">${esc(p.k)}</a></td>
      <td class="sum" title="${esc(p.resumo)}">${esc(p.resumo)}</td>
      <td><span class="pill">${esc(p.tema)}</span></td>
      <td class="num">${p.n===1?'1ª':p.n+'ª (retorno)'}</td>
      <td class="num age-hi">${fmtT(p.min)}</td>
      <td class="num">${p.min>m?'+'+fmtT(p.min-m):'—'}</td>
      <td class="num" style="font-weight:620">${nfBRL2.format(p.v)}</td></tr>`).join('')
      :'<tr><td colspan="7" class="empty">Nenhuma tratativa na fila no recorte atual.</td></tr>';
  }

  function tabela(rows,m){
    const base=quem===''?rows:rows.filter(p=>String(+p.entregue)===quem);
    const key=p=>sortKey==='k'?Number(p.k.split('-')[1]):sortKey==='cls'?ZORD[p.cls]:p[sortKey];
    const sorted=[...base].sort((a,b)=>{
      const x=key(a), y=key(b);
      return typeof x==='number'?(x-y)*sortDir:String(x||'').localeCompare(String(y||''),'pt-BR')*sortDir;
    });
    const sl=sorted.slice(0,shown);
    document.querySelector('#z-dt tbody').innerHTML=sl.length?sl.map(p=>`<tr>
      <td><a href="${JIRA}${esc(p.k)}" target="_blank" rel="noopener">${esc(p.k)}</a></td>
      <td class="sum" title="${esc(p.resumo)}">${esc(p.resumo)}</td>
      <td style="color:var(--text-secondary)">${esc(p.analista)}</td>
      <td class="num">${p.n===1?'1ª':p.n+'ª'}</td>
      <td class="num" style="color:var(--text-secondary)">${esc(p.i)}</td>
      <td class="num" style="color:var(--text-secondary)">${esc(p.f||'—')}</td>
      <td class="num ${p.min>m?'age-hi':''}">${fmtT(p.min)}</td>
      <td><span class="gpill"><i style="background:${ZK[p.cls].color}"></i>${esc(ZK[p.cls].lbl)}</span></td>
      <td class="num" style="font-weight:620">${nfBRL2.format(p.v)}</td></tr>`).join('')
      :'<tr><td colspan="9" class="empty">Sem tratativas no recorte atual.</td></tr>';
    $('z-count').textContent=`Exibindo ${nfInt.format(sl.length)} de ${nfInt.format(base.length)} tratativas · soma do recorte ${fmtBRL(sum(base,p=>p.v))}`;
    $('z-more').style.display=sl.length<base.length?'':'none';
    document.querySelectorAll('#z-dt th').forEach(th=>{
      const a=th.querySelector('.ar'); if(!a) return;
      a.textContent=th.dataset.s===sortKey?(sortDir>0?'▲':'▼'):'↕';
      a.style.opacity=th.dataset.s===sortKey?1:.45;
    });
  }

  function render(){
    const m=meta()*1440, {base,rows}=filtrar();
    const ent=rows.filter(p=>p.entregue), fl=rows.filter(p=>!p.entregue);
    kpis(rows,meta());
    resultado(rows); distribuicao(ent,m); ranking(base); porMes(ent);
    dimensao('z-ch-pass',ent,p=>p.n===1?'1ª passagem':'Retornos',2,null);
    dimensao('z-ch-tema',ent,p=>p.tema,10,'zTema');
    fila(fl,m); esperas(fl,m); tabela(rows,m);
  }

  const FILTROS=['zAnalista','zPass','zAno','zTema','zProduto','zRes'];
  FILTROS.forEach(id=>$(id).addEventListener('change',()=>{shown=100;render();}));
  let deb;
  const adia=()=>{clearTimeout(deb);deb=setTimeout(()=>{shown=100;render();},200);};
  $('zMeta').addEventListener('input',adia);
  $('zBusca').addEventListener('input',adia);
  $('z-clear').addEventListener('click',()=>{
    FILTROS.forEach(id=>$(id).value='');
    $('zBusca').value=''; $('zMeta').value=META_PADRAO; shown=100; render();});
  $('zSeg').addEventListener('click',e=>{
    const b=e.target.closest('button[data-q]'); if(!b) return;
    quem=b.dataset.q; shown=100;
    [...e.currentTarget.querySelectorAll('button')].forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    render();});
  /* clicar numa linha do quadro por analista filtra por ele; de novo, remove */
  document.querySelector('#z-an tbody').addEventListener('click',e=>{
    const tr=e.target.closest('tr[data-nome]'); if(!tr) return;
    const s=$('zAnalista'); s.value=(s.value===tr.dataset.nome)?'':tr.dataset.nome; shown=100; render();});
  document.querySelectorAll('#z-an th').forEach(th=>th.addEventListener('click',()=>{
    const k=th.dataset.s; if(!k) return;
    if(k===anKey) anDir*=-1; else {anKey=k; anDir=k==='nome'?1:-1;}
    render();}));
  document.querySelectorAll('#z-dt th').forEach(th=>th.addEventListener('click',()=>{
    const k=th.dataset.s; if(!k) return;
    if(k===sortKey) sortDir*=-1; else {sortKey=k; sortDir=(k==='min'||k==='v'||k==='i'||k==='f')?-1:1;}
    render();}));
  $('z-more').addEventListener('click',()=>{shown+=100;render();});
  $('z-csv').addEventListener('click',()=>{
    const m=meta(), {rows}=filtrar();
    const base=quem===''?rows:rows.filter(p=>String(+p.entregue)===quem);
    const head=['Chave','Resumo','Analista','Passagem','Entrada','Entrega','Tempo (minutos)','Tempo (dias)','Meta (dias)',
                'Resultado','Tema','Produto','Valor R$'];
    const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const csv='﻿'+[head.join(';'),...base.map(p=>[p.k,p.resumo,p.analista,p.n,p.i,p.f,p.min,
      String((p.min/1440).toFixed(2)).replace('.',','),String(m).replace('.',','),ZK[p.cls].lbl,p.tema,p.produto,
      String(p.v).replace('.',',')].map(q).join(';'))].join('\r\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    a.download='sdprej-sla-tratativa-'+new Date().toISOString().slice(0,10)+'.csv'; a.click();});

  $('z-tot').textContent=nfInt.format(TR.length);
  $('z-chs').textContent=nfInt.format(new Set(TR.map(p=>p.t)).size);
  $('z-jql').textContent=SL.jql;
  return {render};
})();

/* ===================== CAPACIDADE POR DIA =====================
   Quantos SDPREJs a TI consegue tratar (entregar a conferencia) por dia, no ritmo REAL de uma
   janela, e o que isso significa para a fila de hoje. Sai das mesmas passagens da tratativa:
   entrega = data de saida da analise; chegada = data de entrada nela (chamado novo ou retorno). */

const dowN=d=>new Date(d*DIA).getUTCDay();
const dtxt=d=>new Date(d*DIA).toISOString().slice(0,10);
const ddmm=s=>s.slice(8,10)+'/'+s.slice(5,7);
const DOWL=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const ehUtil=d=>{const w=dowN(d);return w>=1&&w<=5;};

const ENT_DIA=new Map(), CHEG_DIA=new Map(), ENT_AN=new Map();   /* dia -> n | dia -> n | dia -> Map(analista -> n) */
TR.forEach(p=>{
  const di=dn(p.i); CHEG_DIA.set(di,(CHEG_DIA.get(di)||0)+1);
  if(p.f){
    const df=dn(p.f); ENT_DIA.set(df,(ENT_DIA.get(df)||0)+1);
    let m=ENT_AN.get(df); if(!m){m=new Map();ENT_AN.set(df,m);}
    m.set(p.a,(m.get(p.a)||0)+1);
  }
});
const FILA_N=TR.filter(p=>!p.f).length;
const FILA_MAX=TR.filter(p=>!p.f).reduce((m,p)=>Math.max(m,p.min),0);

const ViewCap=(function(){
  const $=id=>document.getElementById(id);
  let util=true, sortKey='d', sortDir=-1, shown=100, anKey='n', anDir=-1;
  const FIM=HOJE-1;                       /* ultimo dia COMPLETO: o dia da extracao ainda esta andando */
  const JANELAS=[30,60,90,180,365];
  const PADRAO={janela:90,dias:60};
  const sum=a=>a.reduce((x,y)=>x+y,0);
  const ordenado=a=>[...a].sort((x,y)=>x-y);
  const q=(v,p)=>v.length?v[Math.min(v.length-1,Math.ceil(p*v.length)-1)]:0;
  const f1=v=>nf1.format(v);
  const base=d=>util?ehUtil(d):true;
  const unid=()=>util?'dias úteis':'dias';
  const dias=j=>{const out=[];for(let d=FIM-j+1;d<=FIM;d++) if(base(d)) out.push(d);return out;};

  function ritmo(j){
    const ds=dias(j), e=ds.map(d=>ENT_DIA.get(d)||0), c=ds.map(d=>CHEG_DIA.get(d)||0), n=ds.length||1, so=ordenado(e);
    return {j,ds,e,c,n:ds.length,ent:sum(e),cheg:sum(c),mE:sum(e)/n,mC:sum(c)/n,
            med:so.length?so[so.length>>1]:0,p25:q(so,.25),p75:q(so,.75),max:so.length?so[so.length-1]:0,
            zeros:e.filter(x=>x===0).length};
  }
  const somaDias=(d0,n)=>{let d=d0,k=0;while(k<n){d++;if(base(d))k++;}return d;};
  /* fila de hoje / (entregas - chegadas): so existe se saem mais do que entram */
  function zerar(r){
    const net=r.mE-r.mC;
    if(net<=0.005) return null;
    const n=Math.ceil(FILA_N/net);
    return {n,data:n>3650?null:dtxt(somaDias(HOJE,n))};
  }
  const txtZerar=z=>z?(z.n>3650?'mais de 10 anos':`${nfInt.format(z.n)} ${unid()}`):'não zera';
  const prazo=()=>Math.max(1,parseInt($('cDias').value,10)||PADRAO.dias);

  function kpis(r,z){
    const net=r.mE-r.mC, D=prazo(), req=FILA_N/D+r.mC;
    $('c-kpis').innerHTML=`
      <div class="tile"><div class="k">Capacidade por dia${util?' útil':''}</div><div class="v">${f1(r.mE)}<small> entregas</small></div>
        <div class="n">mediana ${nfInt.format(r.med)} · P25–P75: ${nfInt.format(r.p25)}–${nfInt.format(r.p75)} · máx ${nfInt.format(r.max)}</div></div>
      <div class="tile"><div class="k">Chegadas por dia${util?' útil':''}</div><div class="v">${f1(r.mC)}</div>
        <div class="n">entradas na análise (novos + retornos)</div></div>
      <div class="tile ${net<0?'alert':''}"><div class="k">Saldo por dia</div><div class="v">${net>0?'+':''}${f1(net)}</div>
        <div class="n">${net>=0?'sai mais do que entra: a fila diminui':'entra mais do que sai: a fila cresce'}</div></div>
      <div class="tile"><div class="k">Fila hoje</div><div class="v">${nfInt.format(FILA_N)}</div>
        <div class="n">tratativas aguardando · a mais antiga há ${fmtT(FILA_MAX)}</div></div>
      <div class="tile ${z?'':'alert'}"><div class="k">Fila zera em</div><div class="v">${z?(z.n>3650?'+10<small> anos</small>':nfInt.format(z.n)+'<small> '+unid()+'</small>'):'não zera'}</div>
        <div class="n">${z?(z.data?'por volta de '+z.data:'ritmo atual não resolve em tempo útil'):'no ritmo da janela, entram mais do que saem'}</div></div>
      <div class="tile"><div class="k">Para zerar em ${nfInt.format(D)} ${unid()}</div><div class="v">${f1(req)}<small> por dia</small></div>
        <div class="n">${r.mE>0?f1(req/r.mE)+'× o ritmo atual':'sem entregas na janela'} (inclui absorver as chegadas)</div></div>`;
  }

  function janelas(sel){
    $('c-cs-jan').innerHTML=`Fila de hoje: <b>${nfInt.format(FILA_N)}</b> tratativas. <b>Saldo</b> = entregas − chegadas por dia; `+
      `a fila só zera se o saldo é positivo. A linha da janela escolhida fica destacada — repare como a conclusão muda com a janela.`;
    document.querySelector('#c-jan tbody').innerHTML=JANELAS.map(j=>{
      const r=ritmo(j), z=zerar(r), net=r.mE-r.mC;
      return `<tr style="${j===sel?'font-weight:650;box-shadow:inset 3px 0 0 var(--brand-yellow);background:color-mix(in srgb,var(--series-1) 10%,transparent)':''}">
        <td>Últimos ${j} dias</td>
        <td class="num">${nfInt.format(r.n)}</td>
        <td class="num">${nfInt.format(r.ent)}</td>
        <td class="num">${f1(r.mE)}</td>
        <td class="num">${nfInt.format(r.med)}</td>
        <td class="num">${f1(r.mC)}</td>
        <td class="num" style="color:${net<0?'var(--critical)':'var(--good)'};font-weight:620">${net>0?'+':''}${f1(net)}</td>
        <td class="num">${txtZerar(z)}</td>
        <td>${z&&z.data?z.data:'—'}</td></tr>`;}).join('');
  }

  function graficoDia(r){
    const ev=n=>Math.max(1,Math.ceil(n/12));
    if(r.j<=120){
      const cats=r.ds.map(dtxt);
      $('c-h-dia').textContent='Entregas por dia';
      $('c-cs-dia').innerHTML=`${nfInt.format(r.n)} ${unid()} até ${dtxt(FIM)}. <b>${nfInt.format(r.zeros)}</b> sem nenhuma entrega; o melhor dia teve <b>${nfInt.format(r.max)}</b>.`;
      barsInto('c-ch-dia',cats,[{label:'Entregas',values:r.e}],
        {h:240,mB:56,rotate:true,every:ev(cats.length),catLabel:s=>DOWL[dowN(dn(s))]+' '+ddmm(s),labelMode:'global'});
    } else {
      /* 365 barras num cartao estreito nao se leem: acima de 120 dias, semana a semana */
      const g=new Map();
      r.ds.forEach((d,i)=>{const w=d-((dowN(d)+6)%7); g.set(w,(g.get(w)||0)+r.e[i]);});
      const ws=[...g.keys()].sort((a,b)=>a-b);
      $('c-h-dia').textContent='Entregas por semana';
      $('c-cs-dia').innerHTML=`Janela longa (${nfInt.format(r.n)} ${unid()}): agrupada por semana, começando na segunda. As semanas das pontas podem estar incompletas.`;
      barsInto('c-ch-dia',ws.map(dtxt),[{label:'Entregas na semana',values:ws.map(w=>g.get(w))}],
        {h:240,mB:56,rotate:true,every:ev(ws.length),catLabel:s=>'sem '+ddmm(s),labelMode:'global'});
    }
  }

  function graficoMM(r){
    const k=util?5:7;                                          /* uma semana de dias da base */
    const all=dias(r.j+14), off=all.length-r.n;                /* 14 dias a mais so para aquecer a media */
    const mm=arr=>arr.map((_,i)=>{const a=Math.max(0,i-k+1);return sum(arr.slice(a,i+1))/(i-a+1);}).slice(off);
    const e=mm(all.map(d=>ENT_DIA.get(d)||0)), c=mm(all.map(d=>CHEG_DIA.get(d)||0));
    const defs=[{label:'Entregas',color:'var(--series-1)'},{label:'Chegadas',color:'var(--series-2)'}];
    $('c-cs-mm').innerHTML=`Média móvel de ${k} ${util?'dias úteis':'dias'}. Quando a linha de chegadas está acima, a fila cresce.`;
    legendInto('c-lg-mm',defs,true);
    const cats=r.ds.map(dtxt);
    areaInto('c-ch-mm',cats,[{label:'Entregas',color:defs[0].color,values:e},{label:'Chegadas',color:defs[1].color,values:c}],
      {rotate:true,every:Math.max(1,Math.ceil(cats.length/12)),mB:52,catLabel:ddmm,fmtV:v=>f1(v)+' /dia',fmtY:v=>f1(v)});
  }

  function porSemana(r){
    const ordem=util?[1,2,3,4,5]:[1,2,3,4,5,6,0];
    const cnt={},tot={};
    for(let d=FIM-r.j+1;d<=FIM;d++){const w=dowN(d);cnt[w]=(cnt[w]||0)+1;tot[w]=(tot[w]||0)+(ENT_DIA.get(d)||0);}
    barsInto('c-ch-sem',ordem.map(w=>DOWL[w]),[{label:'Média de entregas',values:ordem.map(w=>cnt[w]?tot[w]/cnt[w]:0)}],
      {h:240,mB:36,fmtV:f1,fmtY:f1,labelMode:'global'});
  }

  function histograma(r){
    const B=[{l:'0',ok:x=>x===0},{l:'1–2',ok:x=>x>=1&&x<=2},{l:'3–5',ok:x=>x>=3&&x<=5},
             {l:'6–10',ok:x=>x>=6&&x<=10},{l:'11–20',ok:x=>x>=11&&x<=20},{l:'21+',ok:x=>x>=21}];
    const v=B.map(b=>r.e.filter(b.ok).length);
    $('c-cs-hist').innerHTML=`Em quantos ${unid()} da janela saiu cada quantidade de entregas. `+
      `<b>${nfInt.format(r.zeros)}</b> de ${nfInt.format(r.n)} (${f1(r.n?r.zeros/r.n*100:0)}%) ficaram sem nenhuma; `+
      `<b>${nfInt.format(r.e.filter(x=>x>10).length)}</b> passaram de 10.`;
    barsInto('c-ch-hist',B.map(b=>b.l),[{label:'Dias',values:v}],{ordinal:true,h:240,mB:36});
  }

  function analistas(r){
    const g=new Map(); let melhor=0;
    r.ds.forEach(d=>{const m=ENT_AN.get(d); if(!m) return;
      m.forEach((n,a)=>{const e=g.get(a)||{nome:SL.analistas[a],n:0,dias:0,max:0}; e.n+=n; e.dias++; if(n>e.max)e.max=n; g.set(a,e);});});
    const tot=sum(r.e), dn1=r.n||1;
    const lista=[...g.values()].map(e=>({...e,porDia:e.n/dn1,porAtivo:e.n/e.dias,part:tot?e.n/tot*100:0}));
    lista.sort((a,b)=>{const x=a[anKey],y=b[anKey];
      return typeof x==='number'?(x-y)*anDir||b.n-a.n:String(x).localeCompare(String(y),'pt-BR')*anDir;});
    $('c-cs-an').innerHTML=`<b>${nfInt.format(lista.length)}</b> analistas entregaram algo nos últimos ${nfInt.format(r.j)} dias. `+
      `A soma de “por dia da janela” é a capacidade da equipe (<b>${f1(r.mE)}</b>/dia). Só aparece quem entregou na janela.`;
    const linha=e=>`<tr><td>${esc(e.nome)}</td><td class="num">${nfInt.format(e.n)}</td><td class="num">${nfInt.format(e.dias)}</td>
      <td class="num" style="font-weight:620">${f1(e.porDia)}</td><td class="num">${f1(e.porAtivo)}</td>
      <td class="num">${nfInt.format(e.max)}</td><td class="num">${f1(e.part)}%</td></tr>`;
    const diasAtivos=r.e.filter(x=>x>0).length;
    document.querySelector('#c-an tbody').innerHTML=(lista.length?lista.map(linha).join('')
      +`<tr style="font-weight:700;border-top:2px solid var(--baseline)"><td>Equipe</td><td class="num">${nfInt.format(tot)}</td>
        <td class="num">${nfInt.format(diasAtivos)}</td><td class="num">${f1(r.mE)}</td>
        <td class="num">${diasAtivos?f1(tot/diasAtivos):'0,0'}</td><td class="num">${nfInt.format(r.max)}</td><td class="num">100,0%</td></tr>`
      :'<tr><td colspan="7" class="empty">Nenhuma entrega na janela.</td></tr>');
    document.querySelectorAll('#c-an th').forEach(th=>{
      const a=th.querySelector('.ar'); if(!a) return;
      a.textContent=th.dataset.s===anKey?(anDir>0?'▲':'▼'):'↕';
      a.style.opacity=th.dataset.s===anKey?1:.45;
    });
  }

  function diaADia(r){
    const linhas=r.ds.map((d,i)=>({d,dow:((dowN(d)+6)%7)+1,e:r.e[i],c:r.c[i],saldo:r.e[i]-r.c[i],na:(ENT_AN.get(d)||new Map()).size}));
    linhas.sort((a,b)=>(a[sortKey]-b[sortKey])*sortDir||b.d-a.d);
    const sl=linhas.slice(0,shown);
    document.querySelector('#c-dt tbody').innerHTML=sl.map(x=>`<tr>
      <td class="num" style="text-align:left">${dtxt(x.d)}</td><td style="color:var(--text-secondary)">${DOWL[dowN(x.d)]}</td>
      <td class="num" style="font-weight:620">${nfInt.format(x.e)}</td><td class="num">${nfInt.format(x.c)}</td>
      <td class="num" style="color:${x.saldo<0?'var(--critical)':x.saldo>0?'var(--good)':'var(--muted)'}">${x.saldo>0?'+':''}${nfInt.format(x.saldo)}</td>
      <td class="num">${nfInt.format(x.na)}</td></tr>`).join('');
    $('c-count').textContent=`Exibindo ${nfInt.format(sl.length)} de ${nfInt.format(linhas.length)} ${unid()} · ${nfInt.format(sum(r.e))} entregas e ${nfInt.format(sum(r.c))} chegadas`;
    $('c-more').style.display=sl.length<linhas.length?'':'none';
    document.querySelectorAll('#c-dt th').forEach(th=>{
      const a=th.querySelector('.ar'); if(!a) return;
      a.textContent=th.dataset.s===sortKey?(sortDir>0?'▲':'▼'):'↕';
      a.style.opacity=th.dataset.s===sortKey?1:.45;
    });
    return linhas;
  }

  function render(){
    const j=+$('cJanela').value, r=ritmo(j), z=zerar(r);
    document.querySelector('label[for=cDias]').textContent=`Prazo para zerar a fila (${unid()})`;
    kpis(r,z); janelas(j); graficoDia(r); graficoMM(r); porSemana(r); histograma(r); analistas(r); diaADia(r);
  }

  $('cJanela').addEventListener('change',()=>{shown=100;render();});
  let deb; $('cDias').addEventListener('input',()=>{clearTimeout(deb);deb=setTimeout(render,200);});
  $('cBase').addEventListener('click',e=>{
    const b=e.target.closest('button[data-b]'); if(!b) return;
    util=b.dataset.b==='u'; shown=100;
    [...e.currentTarget.querySelectorAll('button')].forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    render();});
  $('c-clear').addEventListener('click',()=>{
    $('cJanela').value=PADRAO.janela; $('cDias').value=PADRAO.dias; util=true; shown=100;
    [...$('cBase').querySelectorAll('button')].forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.b==='u')));
    render();});
  document.querySelectorAll('#c-an th').forEach(th=>th.addEventListener('click',()=>{
    const k=th.dataset.s; if(!k) return;
    if(k===anKey) anDir*=-1; else {anKey=k; anDir=k==='nome'?1:-1;}
    render();}));
  document.querySelectorAll('#c-dt th').forEach(th=>th.addEventListener('click',()=>{
    const k=th.dataset.s; if(!k) return;
    if(k===sortKey) sortDir*=-1; else {sortKey=k; sortDir=-1;}
    render();}));
  $('c-more').addEventListener('click',()=>{shown+=100;render();});
  $('c-csv').addEventListener('click',()=>{
    const r=ritmo(+$('cJanela').value);
    const q2=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const csv='﻿'+['Data;Dia da semana;Entregas;Chegadas;Saldo;Analistas que entregaram',
      ...r.ds.map((d,i)=>[dtxt(d),DOWL[dowN(d)],r.e[i],r.c[i],r.e[i]-r.c[i],(ENT_AN.get(d)||new Map()).size].map(q2).join(';'))].join('\r\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    a.download='sdprej-capacidade-por-dia-'+new Date().toISOString().slice(0,10)+'.csv'; a.click();});

  $('c-jql').textContent=SL.jql;
  return {render};
})();

/* ===================== TEMPO DE ATUACAO =====================
   Estimativa de quanto tempo alguem trabalhou em cada prejuizo (o tempo corrido inclui a fila).
   Dois sinais por entrega, calculados na extracao (extract/tratativa.js): ap = horas apontadas no
   Jira dentro da passagem (so desde ago/2026) e ra = ritmo entre acoes do analista (-1 = isolada). */

const ENTR=TR.filter(p=>p.entregue);
ENTR.forEach(p=>{ p.apS=p.ap>0?p.ap:-1; p.raS=p.ra>=0?p.ra:-1; });
const FONTES={
  ap:   {lbl:'Horas apontadas',             curto:'Apontado',   color:'var(--series-1)'},
  ritmo:{lbl:'Ritmo entre ações',           curto:'Ritmo',      color:'var(--series-3)'},
  lote: {lbl:'Entrega em lote',             curto:'Lote',       color:'var(--warning)'},
  sem:  {lbl:'Sem medida (entrega isolada)',curto:'Sem medida', color:'var(--neutral)'}
};

/* escolhe o numero de uma entrega conforme a fonte; null = sem estimativa (nunca um chute) */
function estimar(p,fonte,incluirLote){
  const ap=p.ap>0?p.ap:null, lote=p.lo===1;
  const ra=(p.ra>=0&&(incluirLote||!lote))?p.ra:null;
  const semMedida=(p.ra>=0&&lote&&!incluirLote)?'lote':'sem';
  if(fonte==='ap')    return ap!=null?{est:ap,f:'ap'}:{est:null,f:semMedida};
  if(fonte==='ritmo') return ra!=null?{est:ra,f:lote?'lote':'ritmo'}:{est:null,f:semMedida};
  if(ap!=null) return {est:ap,f:'ap'};
  return ra!=null?{est:ra,f:lote?'lote':'ritmo'}:{est:null,f:semMedida};
}

const ViewAtu=(function(){
  const $=id=>document.getElementById(id);
  let sortKey='f', sortDir=-1, shown=100, quem='', anKey='n', anDir=-1;
  const BINS=[{l:'até 1 min',max:1},{l:'2–5',max:5},{l:'6–10',max:10},{l:'11–15',max:15},
              {l:'16–30',max:30},{l:'31–60',max:60},{l:'1–2 h',max:120},{l:'+ de 2 h',max:Infinity}];
  const fmtA=m=>m<1?'< 1 min':fmtT(m);
  const fmtH=m=>nf1.format(m/60)+' h';
  const sum=a=>a.reduce((x,y)=>x+y,0);
  const pct=(a,b)=>b?a/b*100:0;
  const ord=a=>[...a].sort((x,y)=>x-y);
  const med=v=>v.length?v[v.length>>1]:0;
  const qn=(v,p)=>v.length?v[Math.min(v.length-1,Math.ceil(p*v.length)-1)]:0;
  const avg=v=>v.length?sum(v)/v.length:0;
  const f1=v=>nf1.format(v);

  const uniq=k=>[...new Set(ENTR.map(p=>p[k]))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  function fill(id,vals){
    const s=$(id);
    vals.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;s.appendChild(o);});
  }
  fill('uAnalista',[...new Set(ENTR.map(p=>p.analista))].sort((a,b)=>a.localeCompare(b,'pt-BR')));
  fill('uAno',[...new Set(ENTR.map(p=>p.ano))].sort().reverse());
  fill('uTema',uniq('tema')); fill('uProduto',uniq('produto'));

  const pick=id=>({
    onClick:r=>{const s=$(id);s.value=(s.value===r.name)?'':r.name;shown=100;render();},
    active:n=>$(id).value===n});

  /* base = tudo menos o filtro de analista (o quadro por analista compara todos); rows = base + analista */
  function filtrar(){
    const fonte=$('uFonte').value, lote=$('uLote').value==='1', ps=$('uPass').value, y=$('uAno').value,
          t=$('uTema').value, pr=$('uProduto').value, an=$('uAnalista').value, q=$('uBusca').value.trim().toLowerCase();
    const base=[];
    for(const p of ENTR){
      const e=estimar(p,fonte,lote); p.est=e.est; p.fonte=e.f;
      if(ps==='1'&&p.n!==1) continue;
      if(ps==='2'&&p.n===1) continue;
      if(y&&p.ano!==y) continue;
      if(t&&p.tema!==t) continue;
      if(pr&&p.produto!==pr) continue;
      if(q&&!(p.k+' '+p.resumo+' '+p.tema+' '+p.analista).toLowerCase().includes(q)) continue;
      base.push(p);
    }
    return {base,rows:an?base.filter(p=>p.analista===an):base};
  }

  function kpis(rows){
    const mem=rows.filter(p=>p.est!=null), v=ord(mem.map(p=>p.est)), tot=sum(v), m5=v.filter(x=>x<=5).length;
    const corr=sum(mem.map(p=>p.min)), razao=corr?tot/corr*100:0, media=avg(v);
    const txtRazao=razao<1?razao.toFixed(2).replace('.',','):f1(razao);
    const vazio='—';
    $('u-kpis').innerHTML=`
      <div class="tile"><div class="k">Prejuízos tratados</div><div class="v">${nfInt.format(rows.length)}</div>
        <div class="n">${nfInt.format(mem.length)} com estimativa (${f1(pct(mem.length,rows.length))}%)</div></div>
      <div class="tile"><div class="k">Tempo mediano de atuação</div><div class="v">${mem.length?fmtA(med(v)):vazio}</div>
        <div class="n">${mem.length?`P75 ${fmtA(qn(v,.75))} · P90 ${fmtA(qn(v,.9))} · média ${fmtA(media)}`:'sem entregas medidas no recorte'}</div></div>
      <div class="tile"><div class="k">Levam até 5 minutos</div><div class="v">${mem.length?f1(pct(m5,mem.length))+'%':vazio}</div>
        <div class="n">${nfInt.format(m5)} de ${nfInt.format(mem.length)} prejuízos medidos</div></div>
      <div class="tile"><div class="k">Total de atuação</div><div class="v">${mem.length?fmtH(tot):vazio}</div>
        <div class="n">soma só das ${nfInt.format(mem.length)} entregas com estimativa</div></div>
      <div class="tile"><div class="k">Atuação ÷ tempo corrido</div><div class="v">${mem.length?txtRazao+'%':vazio}</div>
        <div class="n">de cada 100 min corridos, só ${mem.length?txtRazao.replace('.',','):'0'} foram de atuação; o resto é espera</div></div>
      <div class="tile"><div class="k">Esforço para zerar a fila</div><div class="v">${mem.length?fmtH(FILA_N*media):vazio}</div>
        <div class="n">${nfInt.format(FILA_N)} tratativas na fila × média ${mem.length?fmtA(media):'—'}${mem.length?` ≈ ${f1(FILA_N*media/360)} dias de 6 h`:''}</div></div>`;
  }

  function distribuicao(rows){
    const mem=rows.filter(p=>p.est!=null), vals=BINS.map(()=>0);
    mem.forEach(p=>{vals[BINS.findIndex(b=>p.est<=b.max)]++;});
    const v=ord(mem.map(p=>p.est));
    $('u-cs-dist').innerHTML=mem.length
      ? `Minutos de atuação por entrega. Mediana <b>${fmtA(med(v))}</b>; <b>${f1(pct(v.filter(x=>x<=5).length,v.length))}%</b> levam até 5 minutos. `+
        `${nfInt.format(mem.length)} de ${nfInt.format(rows.length)} entregas têm estimativa.`
      : 'Nenhuma entrega com estimativa no recorte atual.';
    barsInto('u-ch-dist',BINS.map(b=>b.l),[{label:'Entregas',values:vals}],{ordinal:true,h:240,mB:44});
  }

  function fonteDonut(rows){
    const rs=Object.keys(FONTES).map(k=>({name:FONTES[k].lbl,value:rows.filter(p=>p.fonte===k).length,color:FONTES[k].color}))
      .filter(r=>r.value>0);
    donutInto('u-ch-fonte',rs,{label:'entregas'});
  }

  function ranking(base){
    const g=new Map();
    base.forEach(p=>{const e=g.get(p.analista)||{nome:p.analista,n:0,est:[],corr:[]}; e.n++; e.corr.push(p.min); if(p.est!=null)e.est.push(p.est); g.set(p.analista,e);});
    const lista=[...g.values()].map(e=>{const v=ord(e.est), c=ord(e.corr);
      return {nome:e.nome,n:e.n,m:v.length,cob:pct(v.length,e.n),med:med(v),p90:qn(v,.9),ate5:pct(v.filter(x=>x<=5).length,v.length),tot:sum(v),corr:med(c)};});
    lista.sort((a,b)=>{const x=a[anKey],y=b[anKey];
      return typeof x==='number'?(x-y)*anDir||b.n-a.n:String(x).localeCompare(String(y),'pt-BR')*anDir;});
    const sel=$('uAnalista').value;
    document.querySelector('#u-an tbody').innerHTML=lista.length?lista.map(e=>`<tr data-nome="${esc(e.nome)}" style="cursor:pointer${e.nome===sel?';box-shadow:inset 3px 0 0 var(--brand-yellow);background:color-mix(in srgb,var(--series-1) 10%,transparent)':''}">
      <td>${esc(e.nome)}</td>
      <td class="num">${nfInt.format(e.n)}</td>
      <td class="num">${nfInt.format(e.m)}</td>
      <td class="num">${f1(e.cob)}%</td>
      <td class="num" style="font-weight:620">${e.m?fmtA(e.med):'—'}</td>
      <td class="num">${e.m?fmtA(e.p90):'—'}</td>
      <td class="num">${e.m?f1(e.ate5)+'%':'—'}</td>
      <td class="num">${e.m?fmtH(e.tot):'—'}</td>
      <td class="num">${fmtT(e.corr)}</td></tr>`).join('')
      :'<tr><td colspan="9" class="empty">Nenhuma entrega no recorte atual.</td></tr>';
    document.querySelectorAll('#u-an th').forEach(th=>{
      const a=th.querySelector('.ar'); if(!a) return;
      a.textContent=th.dataset.s===anKey?(anDir>0?'▲':'▼'):'↕';
      a.style.opacity=th.dataset.s===anKey?1:.45;
    });
  }

  function porMes(rows){
    const g=new Map();
    rows.filter(p=>p.est!=null).forEach(p=>{const e=g.get(p.mesEnt)||[]; e.push(p.est); g.set(p.mesEnt,e);});
    const MIN=5, todos=[...g.keys()].sort(), ms=todos.filter(k=>g.get(k).length>=MIN), ev=Math.max(1,Math.ceil(ms.length/12));
    const fora=todos.filter(k=>g.get(k).length<MIN);
    $('u-cs-mes').innerHTML='Mediana e P90 do tempo de atuação das entregas do mês.'+(fora.length
      ? ` <em>${nfInt.format(fora.length)} ${fora.length===1?'mês com':'meses com'} menos de ${MIN} entregas medidas (${nfInt.format(fora.reduce((s,k)=>s+g.get(k).length,0))}) ficaram fora do gráfico.</em>`:'');
    const defs=[{label:'Mediana',color:'var(--series-1)'},{label:'P90',color:'var(--series-2)'}];
    legendInto('u-lg-mes',defs,true);
    const v=ms.map(k=>ord(g.get(k)));
    areaInto('u-ch-mes',ms,[{label:'Mediana',color:defs[0].color,values:v.map(med)},{label:'P90',color:defs[1].color,values:v.map(a=>qn(a,.9))}],
      {rotate:true,every:ev,mB:52,catLabel:mLab,fmtV:fmtA,fmtY:fmtA,extra:i=>`<span>${nfInt.format(g.get(ms[i]).length)} entregas medidas no mês</span>`});
  }

  function porTema(rows){
    const g=new Map();
    rows.filter(p=>p.est!=null).forEach(p=>{const e=g.get(p.tema)||{name:p.tema,v:[]}; e.v.push(p.est); g.set(p.tema,e);});
    const rs=[...g.values()].sort((a,b)=>b.v.length-a.v.length||a.name.localeCompare(b.name,'pt-BR')).slice(0,10).map(e=>{
      const v=ord(e.v);
      return {name:e.name,value:med(v),n:v.length,
        tip:`<span>${nfInt.format(v.length)} entregas medidas</span><span>Mediana ${fmtA(med(v))} · P90 ${fmtA(qn(v,.9))}</span><span>Total ${fmtH(sum(v))}</span>`};});
    hbarsInto('u-ch-tema',rs,{fmt:r=>`${fmtA(r.value)} (${nfInt.format(r.n)})`,...pick('uTema')});
  }

  /* as duas fontes nas MESMAS entregas: quanto elas discordam */
  function comparacao(rows){
    const ambos=rows.filter(p=>p.ap>0&&p.ra>=0&&p.lo!==1);
    const a=ord(ambos.map(p=>p.ap)), r=ord(ambos.map(p=>p.ra));
    if(!ambos.length){
      $('u-cs-cmp').innerHTML='Nenhuma entrega do recorte tem as duas medidas (horas apontadas e ritmo).';
      hbarsInto('u-ch-cmp',[],{}); return;
    }
    const rz=ord(ambos.filter(p=>p.ra>0).map(p=>p.ap/p.ra));
    $('u-cs-cmp').innerHTML=`Nas <b>${nfInt.format(ambos.length)}</b> entregas que têm as duas medidas, a mediana apontada é <b>${fmtA(med(a))}</b> e a do ritmo <b>${fmtA(med(r))}</b> — `+
      `o apontado é tipicamente <b>${f1(med(rz))}×</b> o ritmo. As horas vêm em blocos de 15 min e incluem trabalho fora do Jira; o ritmo só enxerga ações dentro do Jira. `+
      `A realidade deve ficar entre os dois.`;
    hbarsInto('u-ch-cmp',[
      {name:'Horas apontadas (mediana)',value:med(a),color:'var(--series-1)',tip:`<span>${nfInt.format(a.length)} entregas</span><span>P75 ${fmtA(qn(a,.75))} · P90 ${fmtA(qn(a,.9))}</span>`},
      {name:'Ritmo entre ações (mediana)',value:med(r),color:'var(--series-3)',tip:`<span>${nfInt.format(r.length)} entregas</span><span>P75 ${fmtA(qn(r,.75))} · P90 ${fmtA(qn(r,.9))}</span>`}],
      {fmt:x=>fmtA(x.value)});
  }

  function tabela(rows){
    const base=quem===''?rows:rows.filter(p=>quem==='1'?p.est!=null:p.est==null);
    const key=p=>sortKey==='k'?Number(p.k.split('-')[1]):sortKey==='est'?(p.est==null?-1:p.est):sortKey==='fonte'?FONTES[p.fonte].curto:p[sortKey];
    const sorted=[...base].sort((a,b)=>{
      const x=key(a), y=key(b);
      return typeof x==='number'?(x-y)*sortDir:String(x||'').localeCompare(String(y||''),'pt-BR')*sortDir;
    });
    const sl=sorted.slice(0,shown);
    document.querySelector('#u-dt tbody').innerHTML=sl.length?sl.map(p=>`<tr>
      <td><a href="${JIRA}${esc(p.k)}" target="_blank" rel="noopener">${esc(p.k)}</a></td>
      <td class="sum" title="${esc(p.resumo)}">${esc(p.resumo)}</td>
      <td style="color:var(--text-secondary);white-space:nowrap">${esc(p.analista)}</td>
      <td class="num" style="color:var(--text-secondary)">${esc(p.f)}</td>
      <td class="num" style="color:var(--text-secondary)">${fmtT(p.min)}</td>
      <td class="num">${p.ap>0?fmtA(p.ap):'—'}</td>
      <td class="num">${p.ra>=0?fmtA(p.ra)+(p.lo?' (lote)':''):'—'}</td>
      <td class="num" style="font-weight:620">${p.est!=null?fmtA(p.est):'—'}</td>
      <td><span class="gpill" title="${esc(FONTES[p.fonte].lbl)}"><i style="background:${FONTES[p.fonte].color}"></i>${esc(FONTES[p.fonte].curto)}</span></td></tr>`).join('')
      :'<tr><td colspan="9" class="empty">Sem entregas no recorte atual.</td></tr>';
    $('u-count').textContent=`Exibindo ${nfInt.format(sl.length)} de ${nfInt.format(base.length)} entregas`;
    $('u-more').style.display=sl.length<base.length?'':'none';
    document.querySelectorAll('#u-dt th').forEach(th=>{
      const a=th.querySelector('.ar'); if(!a) return;
      a.textContent=th.dataset.s===sortKey?(sortDir>0?'▲':'▼'):'↕';
      a.style.opacity=th.dataset.s===sortKey?1:.45;
    });
  }

  function render(){
    const {base,rows}=filtrar();
    kpis(rows); distribuicao(rows); fonteDonut(rows); ranking(base); porMes(rows); porTema(rows); comparacao(rows); tabela(rows);
  }

  const FILTROS=['uFonte','uLote','uAnalista','uPass','uAno','uTema','uProduto'];
  const PADRAO={uFonte:'ritmo',uLote:'0'};
  FILTROS.forEach(id=>$(id).addEventListener('change',()=>{shown=100;render();}));
  let deb; $('uBusca').addEventListener('input',()=>{clearTimeout(deb);deb=setTimeout(()=>{shown=100;render();},200);});
  $('u-clear').addEventListener('click',()=>{
    FILTROS.forEach(id=>$(id).value=PADRAO[id]!==undefined?PADRAO[id]:''); $('uBusca').value=''; shown=100; render();});
  $('uSeg').addEventListener('click',e=>{
    const b=e.target.closest('button[data-q]'); if(!b) return;
    quem=b.dataset.q; shown=100;
    [...e.currentTarget.querySelectorAll('button')].forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    render();});
  document.querySelector('#u-an tbody').addEventListener('click',e=>{
    const tr=e.target.closest('tr[data-nome]'); if(!tr) return;
    const s=$('uAnalista'); s.value=(s.value===tr.dataset.nome)?'':tr.dataset.nome; shown=100; render();});
  document.querySelectorAll('#u-an th').forEach(th=>th.addEventListener('click',()=>{
    const k=th.dataset.s; if(!k) return;
    if(k===anKey) anDir*=-1; else {anKey=k; anDir=k==='nome'?1:-1;}
    render();}));
  document.querySelectorAll('#u-dt th').forEach(th=>th.addEventListener('click',()=>{
    const k=th.dataset.s; if(!k) return;
    if(k===sortKey) sortDir*=-1; else {sortKey=k; sortDir=(k==='min'||k==='est'||k==='apS'||k==='raS'||k==='f')?-1:1;}
    render();}));
  $('u-more').addEventListener('click',()=>{shown+=100;render();});
  $('u-csv').addEventListener('click',()=>{
    const {rows}=filtrar();
    const base=quem===''?rows:rows.filter(p=>quem==='1'?p.est!=null:p.est==null);
    const head=['Chave','Resumo','Analista','Entrega','Tempo corrido (min)','Apontado (min)','Ritmo (min)','Entrega em lote','Estimativa (min)','Fonte','Tema','Produto'];
    const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const csv='﻿'+[head.join(';'),...base.map(p=>[p.k,p.resumo,p.analista,p.f,p.min,p.ap>0?p.ap:'',p.ra>=0?p.ra:'',p.lo?'sim':'',
      p.est!=null?p.est:'',FONTES[p.fonte].lbl,p.tema,p.produto].map(q).join(';'))].join('\r\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    a.download='sdprej-tempo-de-atuacao-'+new Date().toISOString().slice(0,10)+'.csv'; a.click();});

  $('u-tot').textContent=`${nfInt.format(ENTR.length)} entregas no total.`;
  $('u-jql').textContent=SL.jql;
  $('u-idle').textContent=SL.idle||30;
  return {render};
})();

/* ===================== troca de tela ===================== */
const VIEWS={atu :{sec:'view-atu', tab:'tab-atu', r:()=>ViewAtu.render()},
             trat:{sec:'view-trat',tab:'tab-trat',r:()=>ViewTrat.render()},
             cap :{sec:'view-cap', tab:'tab-cap', r:()=>ViewCap.render()},
             sla :{sec:'view-sla', tab:'tab-sla', r:()=>ViewSla.render()}};
let atual='atu';
function mostrar(v){
  atual=v;
  for(const k in VIEWS){
    document.getElementById(VIEWS[k].sec).hidden=(k!==v);
    document.getElementById(VIEWS[k].tab).setAttribute('aria-selected',String(k===v));
  }
  VIEWS[v].r(); hideTip(); scrollTo({top:0,behavior:'instant'});
}
for(const k in VIEWS) document.getElementById(VIEWS[k].tab).addEventListener('click',()=>mostrar(k));

document.getElementById('chipGer').textContent='Extraído do Jira em '+SL.geradoEm;
iniciarShell();
ViewAtu.render();
addEventListener('resize',()=>{clearTimeout(window.__r);window.__r=setTimeout(()=>VIEWS[atual].r(),180);});
