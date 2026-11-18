/* ============================================================
   FULL-WAVE BRIDGE RECTIFIER — simulation + animation
   ============================================================ */
const S = { wave:'sine', Vp:10, f:50, R:100, C:100e-6, useCap:false, Vd:0.7, speed:0.4, playing:true };

/* ---------- time-domain simulation (oscilloscope style sweep) ---------- */
const N = 720;            // columns across the scope
const CYC = 3;            // input cycles shown on screen
const NCYC = N / CYC;     // columns per cycle
const vinA = new Float32Array(N), voutA = new Float32Array(N);
let col = 0, total = 0, wrapped = false, acc = 0, Vc = 0;
let cur = { vin:0, vout:0, cond:false, pol:1 };

function waveAt(t){
  const p = (t * S.f) % 1;
  switch(S.wave){
    case 'square':   return p < 0.5 ? S.Vp : -S.Vp;
    case 'triangle': return S.Vp * (p < .25 ? 4*p : p < .75 ? 2 - 4*p : 4*p - 4);
    default:         return S.Vp * Math.sin(2*Math.PI*p);
  }
}

function stepColumn(){
  const Twin = CYC / S.f, dtCol = Twin / N, sub = 8, dt = dtCol / sub;
  let vin = 0, vout = 0, cond = false;
  for(let k = 1; k <= sub; k++){
    vin = waveAt(col * dtCol + k * dt);
    const target = Math.max(Math.abs(vin) - 2 * S.Vd, 0);   // two diodes in the path
    if(S.useCap){
      if(target > Vc){ Vc = target; cond = true; }          // capacitor charges through diodes
      else { Vc *= Math.exp(-dt / (S.R * S.C)); cond = false; } // capacitor feeds the load
      vout = Vc;
    } else { vout = target; cond = target > 0; }
  }
  vinA[col] = vin; voutA[col] = vout;
  cur = { vin, vout, cond, pol: vin >= 0 ? 1 : -1 };
  col++; total++;
  if(col >= N){ col = 0; wrapped = true; }
}

function restart(){
  col = 0; total = 0; wrapped = false; acc = 0; Vc = 0;
  vinA.fill(0); voutA.fill(0); cur = { vin:0, vout:0, cond:false, pol:1 };
  stepColumn(); col = 0; total = 0; // initialise 'cur'
}

/* ---------- canvas helpers ---------- */
function fit(cv){
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if(cv.width !== Math.round(w*dpr) || cv.height !== Math.round(h*dpr)){
    cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr);
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
  return { ctx, w, h };
}

/* ---------- circuit geometry (logical 640 x 440) ---------- */
const LW = 640, LH = 440;
const T = {x:300,y:140}, R_ = {x:390,y:230}, B = {x:300,y:320}, L_ = {x:210,y:230};
const SRC = {x:70,y:230};
const RES = {x:530, y1:268, y2:362};
const CAPX = 455;

function mkPath(pts){
  const cum=[0]; for(let i=1;i<pts.length;i++) cum.push(cum[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y));
  return {pts,cum,len:cum[cum.length-1]};
}
const P = (x,y)=>({x,y});
// Source + diode branch (always runs L -> R through the conducting pair)
const pathPos = mkPath([L_, B, P(70,320), P(70,140), T, R_]);         // D4, source (up), D1
const pathNeg = mkPath([L_, T, P(70,140), P(70,320), B, R_]);         // D3, source (down), D2
// Load branch R -> load -> L
const pathLoad = mkPath([R_, P(RES.x,230), P(RES.x,400), P(210,400), L_]);

function posAt(path,s){
  let i=1; while(i<path.cum.length-1 && path.cum[i]<s) i++;
  const a=path.pts[i-1], b=path.pts[i], t=(s-path.cum[i-1])/(path.cum[i]-path.cum[i-1]||1);
  return {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t};
}
const BALL = ['#b04dff','#ffe83d','#27e6e6','#ff2f3f'];  // same colours as the reference picture
let offA = 0, offB = 0;

function drawBalls(ctx, path, off, spacing){
  const k0 = Math.ceil(-off/spacing);
  for(let k=k0;;k++){
    const s = off + k*spacing; if(s >= path.len) break; if(s < 0) continue;
    const p = posAt(path,s), c = BALL[((k%4)+4)%4];
    ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = 10;
    const g = ctx.createRadialGradient(p.x-2,p.y-2,1,p.x,p.y,7.5);
    g.addColorStop(0,'#fff'); g.addColorStop(.35,c); g.addColorStop(1,c);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x,p.y,7,0,7); ctx.fill(); ctx.restore();
  }
}

function wire(ctx, pts, color, w){
  ctx.strokeStyle = color || '#f2f6ff'; ctx.lineWidth = w || 3.5; ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]); ctx.stroke();
}

function labelBox(ctx, text, x, y, size){
  ctx.font = `700 ${size||14}px Segoe UI, Arial`; const w = ctx.measureText(text).width + 12, h = (size||14) + 8;
  ctx.fillStyle = '#fff'; ctx.fillRect(x - w/2, y - h/2, w, h);
  ctx.fillStyle = '#000'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(text, x, y+1);
}

function drawDiode(ctx, a, b, on, name){
  const mx=(a.x+b.x)/2, my=(a.y+b.y)/2, ang=Math.atan2(b.y-a.y,b.x-a.x);
  ctx.save(); ctx.translate(mx,my); ctx.rotate(ang);
  const col = on ? '#3dff9a' : '#ff5a6e';
  if(on){ ctx.shadowColor = col; ctx.shadowBlur = 18; }
  ctx.fillStyle = on ? 'rgba(61,255,154,.85)' : 'rgba(255,90,110,.22)';
  ctx.strokeStyle = col; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-14,-14); ctx.lineTo(14,0); ctx.lineTo(-14,14); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(14,-15); ctx.lineTo(14,15); ctx.lineWidth=4; ctx.stroke();
  ctx.restore();
  // name tag, pushed outward from the bridge centre
  const nx = mx - 300, ny = my - 230, nl = Math.hypot(nx,ny);
  const tx = mx + nx/nl*34, ty = my + ny/nl*28;
  ctx.font='700 14px Segoe UI'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle = col; ctx.fillText(name, tx, ty-8);
  ctx.font='700 11px Segoe UI'; ctx.fillText(on?'ON':'OFF', tx, ty+8);
}

function drawResistor(ctx){
  const x = RES.x, y1 = RES.y1, y2 = RES.y2;
  wire(ctx,[[x,230],[x,y1]]); wire(ctx,[[x,y2],[x,400]]);
  const g = ctx.createLinearGradient(x-13,0,x+13,0); g.addColorStop(0,'#5a86b8'); g.addColorStop(.45,'#cfe6ff'); g.addColorStop(1,'#4a74a6');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x-13,y1,26,y2-y1,10); ctx.fill();
  const bands = ['#222','#6b3a12','#222','#d33','#222'];
  bands.forEach((c,i)=>{ ctx.fillStyle=c; ctx.fillRect(x-13, y1+16+i*14, 26, 6); });
}

function drawCapacitor(ctx, charge){
  const x = CAPX;
  wire(ctx,[[x,230],[x,288]]); wire(ctx,[[x,312],[x,400]]);
  ctx.fillStyle='#f2f6ff'; ctx.beginPath(); ctx.arc(x,230,4.5,0,7); ctx.arc(x,400,4.5,0,7); ctx.fill();
  ctx.lineWidth=5; ctx.strokeStyle = `rgb(${Math.round(240-150*charge)},${Math.round(246-20*charge)},255)`;
  ctx.shadowColor='#4db3ff'; ctx.shadowBlur = 16*charge;
  ctx.beginPath(); ctx.moveTo(x-22,288); ctx.lineTo(x+22,288); ctx.moveTo(x-22,312); ctx.lineTo(x+22,312); ctx.stroke();
  ctx.shadowBlur=0;
  labelBox(ctx,'Capacitor',x,270,12);
  ctx.fillStyle='#8fd0ff'; ctx.font='700 12px Segoe UI'; ctx.textAlign='center';
  ctx.fillText(Math.round(charge*100)+'% charged',x,336);
}

function drawSource(ctx, pol){
  const {x,y}=SRC;
  wire(ctx,[[x,140],[x,y-27]]); wire(ctx,[[x,y+27],[x,320]]);
  ctx.fillStyle='#0b1250'; ctx.strokeStyle='#f2f6ff'; ctx.lineWidth=3.5;
  ctx.beginPath(); ctx.arc(x,y,27,0,7); ctx.fill(); ctx.stroke();
  ctx.strokeStyle='#4db3ff'; ctx.lineWidth=3; ctx.beginPath();
  for(let i=-16;i<=16;i++){ const xx=x+i, yy=y-9*Math.sin(i/16*Math.PI); i===-16?ctx.moveTo(xx,yy):ctx.lineTo(xx,yy);} ctx.stroke();
  // instantaneous polarity
  ctx.font='700 22px Segoe UI'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle = pol>0?'#ff6b6b':'#6bb8ff'; ctx.fillText(pol>0?'+':'−', x+26, 165);
  ctx.fillStyle = pol>0?'#6bb8ff':'#ff6b6b'; ctx.fillText(pol>0?'−':'+', x+26, 295);
  labelBox(ctx,'AC Source',x,y+50,13);
}

function drawCircuit(dt){
  const cv = document.getElementById('circuit'); const {ctx,w,h} = fit(cv);
  const sc = Math.min(w/LW, h/LH); ctx.translate((w-LW*sc)/2,(h-LH*sc)/2); ctx.scale(sc,sc);

  const { pol, cond, vin, vout } = cur;
  const d1 = cond && pol>0, d4 = d1, d2 = cond && pol<0, d3 = d2;

  // ----- wires -----
  wire(ctx,[[70,140],[300,140]]);
  // bottom AC wire with a "hop" where it crosses the return wire (like the reference picture)
  ctx.strokeStyle='#f2f6ff'; ctx.lineWidth=3.5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(70,320); ctx.lineTo(197,320); ctx.quadraticCurveTo(210,298,223,320); ctx.lineTo(300,320); ctx.stroke();
  wire(ctx,[[390,230],[RES.x,230]]);
  wire(ctx,[[RES.x,400],[210,400],[210,230]]);
  ctx.fillStyle='#f2f6ff';
  [T,R_,B,L_].forEach(p=>{ ctx.beginPath(); ctx.arc(p.x,p.y,5,0,7); ctx.fill(); });
  // diode connections (faint wire under symbols)
  wire(ctx,[[T.x,T.y],[R_.x,R_.y],[B.x,B.y],[L_.x,L_.y],[T.x,T.y]],'#f2f6ff',3);

  // ----- moving charges -----
  const sp = 150 * (S.speed/0.4);
  const lvlA = 0.45 + 0.55*Math.min(1,Math.abs(vin)/S.Vp);
  const lvlB = 0.35 + 0.65*Math.min(1,vout/Math.max(S.Vp-2*S.Vd,1));
  if(S.playing){ if(cond) offA += sp*lvlA*dt; if(vout>0.05) offB += sp*lvlB*dt; }
  if(cond) drawBalls(ctx, pol>0?pathPos:pathNeg, offA, 38);
  if(vout > 0.05) drawBalls(ctx, pathLoad, offB, 38);

  // ----- components on top -----
  drawSource(ctx, pol);
  drawDiode(ctx, T, R_, d1, 'D1');
  drawDiode(ctx, B, R_, d2, 'D2');
  drawDiode(ctx, L_, T, d3, 'D3');
  drawDiode(ctx, L_, B, d4, 'D4');
  drawResistor(ctx);
  if(S.useCap) drawCapacitor(ctx, Math.min(1,Vc/Math.max(S.Vp-2*S.Vd,1)));

  labelBox(ctx,'Diode Bridge',300,230,14);
  labelBox(ctx,'Resistor',RES.x+50,315,13);
  ctx.fillStyle='#fff'; ctx.font='700 12px Segoe UI'; ctx.textAlign='left'; ctx.textBaseline='middle';
  ctx.fillText('(load)',RES.x+34,336);
  // output polarity markers (like the picture)
  ctx.fillStyle='#e53935'; ctx.fillRect(398,196,24,24); ctx.fillStyle='#fff'; ctx.fillRect(408,200,4,16); ctx.fillRect(402,206,16,4);
  ctx.beginPath(); ctx.fillStyle='#fff'; ctx.arc(L_.x-22,L_.y-22,13,0,7); ctx.fill();
  ctx.fillStyle='#0b1250'; ctx.fillRect(L_.x-30,L_.y-24,16,4);
  ctx.fillStyle='#ffd23f'; ctx.font='700 13px Segoe UI'; ctx.textAlign='center';
  ctx.fillText('V out  +',R_.x+22,R_.y-38+8); ctx.fillText('−',L_.x-22,L_.y-44);
  // live numbers
  ctx.font='700 15px Segoe UI'; ctx.textAlign='left';
  ctx.fillStyle='#6bb8ff'; ctx.fillText(`Vin  = ${vin>=0?'+':''}${vin.toFixed(1)} V`, 14, 22);
  ctx.fillStyle='#3dff9a'; ctx.fillText(`Vout = ${vout.toFixed(1)} V`, 14, 44);
}

/* ---------- charts ---------- */
function drawChart(cv, arr, cfg){
  const {ctx,w,h} = fit(cv);
  const pl=48, pr=12, pt=14, pb=24, pw=w-pl-pr, ph=h-pt-pb;
  const X = i => pl + i/(N-1)*pw, Y = v => pt + (cfg.max - v)/(cfg.max - cfg.min)*ph;

  // half-cycle shading
  const half = NCYC/2;
  for(let k=0;k<CYC*2;k++){
    const x0 = X(k*half), x1 = X((k+1)*half);
    if(cfg.shade){ ctx.fillStyle = k%2===0 ? 'rgba(80,160,255,.10)' : 'rgba(255,110,90,.10)'; ctx.fillRect(x0,pt,x1-x0,ph); }
    if(cfg.shade){
      ctx.fillStyle = k%2===0 ? '#7cc4ff' : '#ff9a8a'; ctx.font='700 12px Segoe UI'; ctx.textAlign='center';
      ctx.fillText(k%2===0?'+ half':'− half',(x0+x1)/2,pt+12);
    }
  }
  // grid + axes
  ctx.lineWidth=1; ctx.font='11px Segoe UI'; ctx.fillStyle='#a9b8ee'; ctx.textAlign='right'; ctx.textBaseline='middle';
  cfg.ticks.forEach(v=>{
    ctx.strokeStyle = v===0 ? 'rgba(255,255,255,.55)' : 'rgba(150,180,255,.22)';
    ctx.beginPath(); ctx.moveTo(pl,Y(v)); ctx.lineTo(w-pr,Y(v)); ctx.stroke();
    ctx.fillText((v>0?'+':'')+v.toFixed(0)+' V',pl-5,Y(v));
  });
  ctx.textAlign='center'; ctx.textBaseline='top';
  for(let k=0;k<=CYC*2;k++){
    const x = X(k*half); ctx.strokeStyle='rgba(150,180,255,.16)';
    ctx.beginPath(); ctx.moveTo(x,pt); ctx.lineTo(x,pt+ph); ctx.stroke();
    ctx.fillStyle='#a9b8ee'; ctx.fillText((k*500/S.f).toFixed(k*500/S.f%1?1:0)+' ms',x,pt+ph+5);
  }

  // helper to draw a trace segment
  const trace = (from,to,color,alpha,lw) => {
    if(to-from<2) return; ctx.globalAlpha=alpha; ctx.strokeStyle=color; ctx.lineWidth=lw; ctx.lineJoin='round';
    ctx.beginPath(); for(let i=from;i<to;i++){ const x=X(i), y=Y(arr[i]); i===from?ctx.moveTo(x,y):ctx.lineTo(x,y); } ctx.stroke(); ctx.globalAlpha=1;
  };
  // ghost of the input (|Vin|) on the output chart, for comparison
  if(cfg.ghost){
    ctx.setLineDash([5,5]); ctx.strokeStyle='rgba(120,190,255,.45)'; ctx.lineWidth=1.5; ctx.beginPath();
    for(let i=0;i<(wrapped?N:col);i++){ const x=X(i), y=Y(Math.abs(vinA[i])); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);} ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.save(); ctx.beginPath(); ctx.rect(pl,pt,pw,ph); ctx.clip();
  if(wrapped) trace(col+8,N,cfg.color,.28,2.5);
  ctx.shadowColor=cfg.color; ctx.shadowBlur=8; trace(0,col,cfg.color,1,2.8); ctx.shadowBlur=0;
  ctx.restore();

  // average line
  if(cfg.avg !== null && cfg.avg !== undefined){
    ctx.setLineDash([8,5]); ctx.strokeStyle='#ffd23f'; ctx.lineWidth=1.8;
    ctx.beginPath(); ctx.moveTo(pl,Y(cfg.avg)); ctx.lineTo(w-pr,Y(cfg.avg)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#ffd23f'; ctx.textAlign='right'; ctx.textBaseline='bottom'; ctx.font='700 12px Segoe UI';
    ctx.fillText('V dc = '+cfg.avg.toFixed(1)+' V',w-pr-4,Y(cfg.avg)-3);
  }
  // sweep cursor + dot
  const cx = X(Math.max(col-1,0)), cy = Y(arr[Math.max(col-1,0)]);
  ctx.strokeStyle='rgba(255,255,255,.7)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(cx,pt); ctx.lineTo(cx,pt+ph); ctx.stroke();
  ctx.fillStyle='#fff'; ctx.shadowColor=cfg.color; ctx.shadowBlur=12; ctx.beginPath(); ctx.arc(cx,cy,5.5,0,7); ctx.fill(); ctx.shadowBlur=0;
}

/* ---------- statistics ---------- */
function stats(){
  if(total < NCYC) return null;
  let sum=0, mn=1e9, mx=-1e9;
  for(let i=1;i<=NCYC;i++){ const v=voutA[(col-i+N)%N]; sum+=v; if(v<mn)mn=v; if(v>mx)mx=v; }
  return { avg:sum/NCYC, rip:mx-mn };
}

/* ---------- text panel ---------- */
const stEl = { box:document.getElementById('status'), t:document.getElementById('stTitle'), p:document.getElementById('stText'), path:document.getElementById('stPath') };
let lastMsg = '';
function updateStatus(){
  const {pol,cond,vin} = cur, vd2 = (2*S.Vd).toFixed(1);
  let key, title, text, path, color;
  if(cond && pol>0){
    key='pos'; color='#3dff9a';
    title='Positive half-cycle <span class="pill on">D1, D4 ON</span><span class="pill off">D2, D3 OFF</span>';
    text='The top terminal of the source is positive. Only D1 and D4 are forward-biased, so current can flow; D2 and D3 are reverse-biased and block.';
    path='Source (+) → D1 → Load ↓ (top → bottom) → D4 → Source (−)';
  } else if(cond){
    key='neg'; color='#3dff9a';
    title='Negative half-cycle <span class="pill on">D2, D3 ON</span><span class="pill off">D1, D4 OFF</span>';
    text='The source polarity has flipped: the bottom terminal is now positive. D2 and D3 conduct and D1, D4 block — yet the current still goes through the load in the SAME direction.';
    path='Source (+, bottom) → D2 → Load ↓ (top → bottom) → D3 → Source (−, top)';
  } else if(S.useCap){
    key='cap'; color='#4db3ff';
    title='Capacitor supplies the load <span class="pill off">all diodes OFF</span>';
    text='|Vin| has dropped below the capacitor voltage, so the diodes are reverse-biased. The capacitor discharges through the load and keeps V out up — this is what smooths the ripple.';
    path='Capacitor → Load ↓ → back to Capacitor';
  } else {
    key='dead'; color='#ff5a6e';
    title='Dead zone <span class="pill off">all diodes OFF</span>';
    text = S.Vd>0 ? `|Vin| is below ${vd2} V (two diode drops of ${S.Vd} V in series), so no current flows and V out = 0.` : 'Input is crossing zero, so there is no output at this instant.';
    path='No current path';
  }
  if(key+S.Vd === lastMsg) return; lastMsg = key+S.Vd;
  stEl.t.innerHTML = title; stEl.p.textContent = text; stEl.path.textContent = path; stEl.box.style.borderLeftColor = color;
}

function updateFacts(){
  const Vm = S.Vp, Vo = Math.max(Vm - 2*S.Vd,0);
  const shape = S.wave==='sine' ? `2·Vm/π ≈ <b>${(2*Vo/Math.PI).toFixed(1)} V</b> (0.637·Vm)` : S.wave==='square' ? `≈ <b>${Vo.toFixed(1)} V</b> (flat top)` : `≈ <b>${(Vo/2).toFixed(1)} V</b> (Vm/2)`;
  document.getElementById('facts').innerHTML =
    `<b>Peak output</b> = Vm − 2·V<sub>D</sub> = ${Vm} − ${(2*S.Vd).toFixed(1)} = <b>${Vo.toFixed(1)} V</b> &nbsp;•&nbsp; ` +
    `<b>Output frequency</b> = 2 × ${S.f} = <b>${2*S.f} Hz</b><br>` +
    (S.useCap ? `<b>Ripple</b> ≈ I<sub>L</sub> / (2·f·C) = <b>${(Vo/S.R/(2*S.f*S.C)).toFixed(1)} V</b> (theory) — bigger C or R = smoother DC` :
                `<b>Average (Vdc)</b> for this input ≈ ${shape}`);
  document.getElementById('tagIn').textContent = `${S.wave}, ${S.Vp} V peak, ${S.f} Hz`;
  document.getElementById('tagOut').textContent = `${2*S.f} Hz pulsating DC` + (S.useCap?' (filtered)':'');
}

/* ---------- main loop ---------- */
let last = performance.now(), statTick = 0;
function frame(now){
  const dt = Math.min((now-last)/1000, 0.05); last = now;
  if(S.playing){
    acc += dt * N * S.speed / CYC;
    while(acc >= 1){ stepColumn(); acc -= 1; }
  }
  drawCircuit(dt);
  const st = stats();
  const Ymax = S.Vp*1.2, ticks = [-S.Vp,0,S.Vp];
  drawChart(document.getElementById('chIn'), vinA, {min:-Ymax,max:Ymax,ticks,color:'#4db3ff',shade:true});
  drawChart(document.getElementById('chOut'), voutA, {min:-Ymax,max:Ymax,ticks:[0,Math.max(S.Vp-2*S.Vd,0)].filter((v,i,a)=>a.indexOf(v)===i),color:'#3dff9a',ghost:true,avg:st?st.avg:null});
  document.getElementById('rIn').textContent  = (cur.vin>=0?'+':'')+cur.vin.toFixed(1)+' V';
  document.getElementById('rOut').textContent = cur.vout.toFixed(1)+' V';
  document.getElementById('rDc').textContent  = st ? st.avg.toFixed(2)+' V' : '…';
  document.getElementById('rRip').textContent = st ? st.rip.toFixed(2)+' V' : '…';
  updateStatus();
  requestAnimationFrame(frame);
}

/* ---------- controls ---------- */
const $ = id => document.getElementById(id);
function bindRange(id, outId, fmt, apply, reset=true){
  const el=$(id), out=$(outId);
  const go=()=>{ out.textContent=fmt(+el.value); apply(+el.value); updateFacts(); if(reset) restart(); };
  el.addEventListener('input',go); out.textContent=fmt(+el.value);
}
bindRange('sVp','oVp',v=>v+' V',v=>S.Vp=v);
bindRange('sF','oF',v=>v+' Hz',v=>S.f=v);
bindRange('sR','oR',v=>v+' Ω',v=>S.R=v);
bindRange('sC','oC',v=>v+' µF',v=>S.C=v*1e-6);
bindRange('sSp','oSp',v=>v.toFixed(1)+'×',v=>S.speed=v,false);

document.querySelectorAll('#waveSeg button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#waveSeg button').forEach(x=>x.classList.remove('active')); b.classList.add('active');
  S.wave=b.dataset.w; updateFacts(); restart();
});
document.querySelectorAll('#vdSeg button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#vdSeg button').forEach(x=>x.classList.remove('active')); b.classList.add('active');
  S.Vd=+b.dataset.v; updateFacts(); restart();
});
$('cCap').onchange = e=>{ S.useCap=e.target.checked; $('capCtl').classList.toggle('enabled',S.useCap); updateFacts(); restart(); };
function togglePlay(){ S.playing=!S.playing; $('bPlay').textContent = S.playing?'⏸ Pause':'▶ Play'; $('bPlay').classList.toggle('primary',S.playing); }
$('bPlay').onclick = togglePlay;
$('bRestart').onclick = restart;
window.addEventListener('keydown',e=>{ if(e.code==='Space' && e.target.tagName!=='INPUT'){ e.preventDefault(); togglePlay(); } });

restart(); updateFacts(); requestAnimationFrame(frame);
