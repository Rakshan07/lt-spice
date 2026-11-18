/* ============================================================
   FULL-WAVE BRIDGE RECTIFIER — simulation + animation
   ============================================================ */
/* Values taken from the LTspice schematic:
   V1 = SINE(0 10 50), Rser = 0.1 | L1 = 1 mH, L2 = 2 mH, K1 = 1 | D1-D4 = 1N4148 | C1 = 5 uF | R1 = 5 k | .tran 100m */
const L1 = 1e-3, L2 = 2e-3, RSER = 0.1;
const RATIO = Math.sqrt(L2 / L1);                 // N2/N1 for K = 1  ->  1.414
const S = { wave:'sine', Vp:10, f:50, R:5000, C:5e-6, useCap:true, Vd:0.62, speed:0.4, playing:true };
const VSP = () => S.Vp * RATIO;                   // peak of secondary voltage
const fmtR = r => r >= 1000 ? (r/1000)+' kΩ' : r+' Ω';
const fmtC = c => Math.round(c*1e6)+' µF';
/* 1N4148 (LTspice model): Is = 2.52n, N = 1.752, Rs = 0.568 */
const VT = 0.02585, IS = 2.52e-9, NF = 1.752, RD = 0.568;
const vdrop = i => NF*VT*Math.log(i/IS + 1) + i*RD;
function solveI(f){ if(f(0) <= 0) return 0; let lo = 0, hi = 2; for(let k=0;k<50;k++){ const m=(lo+hi)/2; f(m) > 0 ? lo = m : hi = m; } return lo; }

/* ---------- time-domain simulation (oscilloscope style sweep) ---------- */
const N = 720;            // columns across the scope
const CYC = 5;            // cycles on screen (.tran 100m = 5 cycles at 50 Hz)
const NCYC = N / CYC;     // columns per cycle
const vinA = new Float32Array(N), voutA = new Float32Array(N);
let col = 0, total = 0, wrapped = false, acc = 0, Vc = 0;
let cur = { vin:0, vs:0, vout:0, cond:false, pol:1 };

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
    const a = Math.abs(vin) * RATIO;                          // |secondary voltage|
    if(S.Vd > 0){                                             // real 1N4148 diodes (2 in the path)
      if(S.useCap){
        const i = solveI(x => a - (Vc + (x - Vc/S.R)*dt/S.C) - 2*vdrop(x) - RSER*x);
        if(i > 1e-6){ Vc += (i - Vc/S.R)*dt/S.C; cond = true; }
        else Vc *= Math.exp(-dt / (S.R * S.C));
        vout = Vc;
      } else {
        const i = solveI(x => a - x*S.R - 2*vdrop(x) - RSER*x);
        if(i > 1e-6){ cond = true; vout = i*S.R; } else vout = 0;
      }
    } else {                                                  // ideal diodes
      if(S.useCap){
        if(a > Vc){ Vc = a; cond = true; } else Vc *= Math.exp(-dt / (S.R * S.C));
        vout = Vc;
      } else { vout = a; cond = a > 0; }
    }
  }
  vinA[col] = vin; voutA[col] = vout;
  cur = { vin, vs: vin*RATIO, vout, cond, pol: vin >= 0 ? 1 : -1 };
  col++; total++;
  if(col >= N){ col = 0; wrapped = true; }
}

function restart(){
  col = 0; total = 0; wrapped = false; acc = 0; Vc = 0;
  vinA.fill(0); voutA.fill(0); cur = { vin:0, vs:0, vout:0, cond:false, pol:1 };
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
const T = {x:300,y:150}, R_ = {x:390,y:230}, B = {x:300,y:310}, L_ = {x:210,y:230};
const SRC = {x:40,y:230};          // AC input (primary side)
const SX = 127;                    // secondary winding x
const RES = {x:560, y1:268, y2:352};
const CAPX = 455;
const RET_Y = 390;                 // bottom return wire

function mkPath(pts){
  const cum=[0]; for(let i=1;i<pts.length;i++) cum.push(cum[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y));
  return {pts,cum,len:cum[cum.length-1]};
}
const P = (x,y)=>({x,y});
// Secondary + diode branch (always runs L -> R through the conducting pair)
const pathPos = mkPath([L_, B, P(SX,310), P(SX,150), T, R_]);         // D2, secondary (up), D1
const pathNeg = mkPath([L_, T, P(SX,150), P(SX,310), B, R_]);         // D4, secondary (down), D3
// Load branch R -> load -> L
const pathLoad = mkPath([R_, P(RES.x,230), P(RES.x,RET_Y), P(210,RET_Y), L_]);

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
  ctx.fillStyle = col; ctx.fillText(name, tx, ty-15);
  ctx.font='600 11px Segoe UI'; ctx.fillStyle='#cfe0ff'; ctx.fillText('1N4148', tx, ty);
  ctx.font='700 11px Segoe UI'; ctx.fillStyle = col; ctx.fillText(on?'ON':'OFF', tx, ty+14);
}

function drawResistor(ctx){
  const x = RES.x, y1 = RES.y1, y2 = RES.y2;
  wire(ctx,[[x,230],[x,y1]]); wire(ctx,[[x,y2],[x,RET_Y]]);
  const g = ctx.createLinearGradient(x-13,0,x+13,0); g.addColorStop(0,'#5a86b8'); g.addColorStop(.45,'#cfe6ff'); g.addColorStop(1,'#4a74a6');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x-13,y1,26,y2-y1,10); ctx.fill();
  const bands = ['#222','#6b3a12','#222','#d33','#222'];
  bands.forEach((c,i)=>{ ctx.fillStyle=c; ctx.fillRect(x-13, y1+14+i*12, 26, 5); });
}

function drawCapacitor(ctx, charge){
  const x = CAPX;
  wire(ctx,[[x,230],[x,298]]); wire(ctx,[[x,314],[x,RET_Y]]);
  ctx.fillStyle='#f2f6ff'; ctx.beginPath(); ctx.arc(x,230,4.5,0,7); ctx.arc(x,RET_Y,4.5,0,7); ctx.fill();
  ctx.lineWidth=5; ctx.strokeStyle = `rgb(${Math.round(240-150*charge)},${Math.round(246-20*charge)},255)`;
  ctx.shadowColor='#4db3ff'; ctx.shadowBlur = 16*charge;
  ctx.beginPath(); ctx.moveTo(x-22,298); ctx.lineTo(x+22,298); ctx.moveTo(x-22,314); ctx.lineTo(x+22,314); ctx.stroke();
  ctx.shadowBlur=0;
  ctx.fillStyle='#fff'; ctx.font='italic 700 16px Segoe UI'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText('C1',x+30,306);
  labelBox(ctx,'C1 = '+fmtC(S.C),x,350,12);
  ctx.fillStyle='#8fd0ff'; ctx.font='700 12px Segoe UI'; ctx.textAlign='center';
  ctx.fillText(Math.round(charge*100)+'% charged',x,372);
}

function coil(ctx, x, y1, y2, dir){
  const n = 4, r = (y2-y1)/n/2;
  ctx.beginPath(); ctx.moveTo(x,y1);
  for(let i=0;i<n;i++) ctx.arc(x, y1 + r*(2*i+1), r, -Math.PI/2, Math.PI/2, dir<0);
  ctx.stroke();
}

function drawTransformer(ctx, pol){
  const {x,y}=SRC;
  // AC input source (primary side)
  wire(ctx,[[x,y-27],[x,175],[95,175]]); wire(ctx,[[x,y+27],[x,285],[95,285]]);
  ctx.fillStyle='#0b1250'; ctx.strokeStyle='#f2f6ff'; ctx.lineWidth=3.5;
  ctx.beginPath(); ctx.arc(x,y,27,0,7); ctx.fill(); ctx.stroke();
  ctx.strokeStyle='#4db3ff'; ctx.lineWidth=3; ctx.beginPath();
  for(let i=-16;i<=16;i++){ const xx=x+i, yy=y-9*Math.sin(i/16*Math.PI); i===-16?ctx.moveTo(xx,yy):ctx.lineTo(xx,yy);} ctx.stroke();
  labelBox(ctx,'V1',x,y-46,13);
  ctx.fillStyle='#cfe0ff'; ctx.font='600 11px Segoe UI'; ctx.textAlign='center';
  ctx.fillText('SINE(0 '+S.Vp+' '+S.f+')',x+8,y+84); ctx.fillText('Rser = 0.1',x+8,y+98);
  // windings + iron core
  ctx.strokeStyle='#f2f6ff'; ctx.lineWidth=3.5; ctx.lineCap='round';
  coil(ctx,95,175,285,-1); coil(ctx,SX,175,285,1);
  wire(ctx,[[108,165],[108,295]],'#f2f6ff',3); wire(ctx,[[114,165],[114,295]],'#f2f6ff',3);
  wire(ctx,[[SX,175],[SX,150],[T.x,150]]); wire(ctx,[[SX,285],[SX,310]]);
  // instantaneous secondary polarity
  ctx.font='700 22px Segoe UI'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle = pol>0?'#ff6b6b':'#6bb8ff'; ctx.fillText(pol>0?'+':'−', SX+16, 135);
  ctx.fillStyle = pol>0?'#6bb8ff':'#ff6b6b'; ctx.fillText(pol>0?'−':'+', SX+16, 325);
  ctx.fillStyle='#cfe0ff'; ctx.font='600 12px Segoe UI'; ctx.fillText('L1 = 1 mH   L2 = 2 mH   K = 1',111,350); ctx.fillText('Transformer (N2/N1 = '+RATIO.toFixed(2)+')',111,366);
}

function drawCircuit(dt){
  const cv = document.getElementById('circuit'); const {ctx,w,h} = fit(cv);
  const sc = Math.min(w/LW, h/LH); ctx.translate((w-LW*sc)/2,(h-LH*sc)/2); ctx.scale(sc,sc);

  const { pol, cond, vin, vout } = cur;
  // Positive half: D1 + D2 conduct.  Negative half: D3 + D4 conduct.
  const d1 = cond && pol>0, d2 = d1, d3 = cond && pol<0, d4 = d3;

  // ----- wires -----
  // bottom secondary wire with a "hop" where it crosses the return wire (like the reference picture)
  ctx.strokeStyle='#f2f6ff'; ctx.lineWidth=3.5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(SX,310); ctx.lineTo(197,310); ctx.quadraticCurveTo(210,288,223,310); ctx.lineTo(300,310); ctx.stroke();
  wire(ctx,[[390,230],[RES.x,230]]);
  wire(ctx,[[RES.x,RET_Y],[210,RET_Y],[210,230]]);
  ctx.fillStyle='#f2f6ff';
  [T,R_,B,L_].forEach(p=>{ ctx.beginPath(); ctx.arc(p.x,p.y,5,0,7); ctx.fill(); });
  wire(ctx,[[T.x,T.y],[R_.x,R_.y],[B.x,B.y],[L_.x,L_.y],[T.x,T.y]],'#f2f6ff',3);

  // ----- moving charges -----
  const sp = 150 * (S.speed/0.4);
  const lvlA = 0.45 + 0.55*Math.min(1,Math.abs(vin)/S.Vp);
  const lvlB = 0.35 + 0.65*Math.min(1,vout/VSP());
  if(S.playing){ if(cond) offA += sp*lvlA*dt; if(vout>0.05) offB += sp*lvlB*dt; }
  if(cond) drawBalls(ctx, pol>0?pathPos:pathNeg, offA, 38);
  if(vout > 0.05) drawBalls(ctx, pathLoad, offB, 38);

  // ----- components on top -----
  drawTransformer(ctx, pol);
  drawDiode(ctx, T, R_, d1, 'D1');     // top-right
  drawDiode(ctx, L_, B, d2, 'D2');     // bottom-left
  drawDiode(ctx, B, R_, d3, 'D3');     // bottom-right
  drawDiode(ctx, L_, T, d4, 'D4');     // top-left
  drawResistor(ctx);
  if(S.useCap) drawCapacitor(ctx, Math.min(1,Vc/VSP()));

  labelBox(ctx,'Bridge Rectifier',300,108,14);
  labelBox(ctx,'R1 = '+fmtR(S.R),RES.x+40,310,12);
  // output polarity markers (like the picture): + on the right node, − on the left node
  ctx.fillStyle='#e53935'; ctx.fillRect(398,196,24,24); ctx.fillStyle='#fff'; ctx.fillRect(408,200,4,16); ctx.fillRect(402,206,16,4);
  ctx.beginPath(); ctx.fillStyle='#fff'; ctx.arc(L_.x-22,L_.y-22,13,0,7); ctx.fill();
  ctx.fillStyle='#0b1250'; ctx.fillRect(L_.x-30,L_.y-24,16,4);
  ctx.fillStyle='#ffd23f'; ctx.font='700 14px Segoe UI'; ctx.textAlign='left'; ctx.textBaseline='middle';
  ctx.fillText('+V',RES.x-12,212);
  // live numbers
  ctx.font='700 15px Segoe UI'; ctx.textAlign='left';
  ctx.fillStyle='#6bb8ff'; ctx.fillText(`V1 = ${vin>=0?'+':''}${vin.toFixed(1)} V   (secondary ${(vin*RATIO).toFixed(1)} V)`, 14, 22);
  ctx.fillStyle='#3dff9a'; ctx.fillText(`Vout = ${vout.toFixed(2)} V`, 14, 44);
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
    ctx.fillText((v>0?'+':'')+(Number.isInteger(v)?v.toFixed(0):v.toFixed(1))+' V',pl-5,Y(v));
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
  if(cfg.overlay){
    ctx.setLineDash([6,4]); ctx.strokeStyle='#ffb347'; ctx.lineWidth=2; ctx.beginPath();
    for(let i=0;i<(wrapped?N:col);i++){ const x=X(i), y=Y(arr[i]*cfg.overlay); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);} ctx.stroke(); ctx.setLineDash([]);
  }
  if(cfg.ghost){
    ctx.setLineDash([5,5]); ctx.strokeStyle='rgba(120,190,255,.45)'; ctx.lineWidth=1.5; ctx.beginPath();
    for(let i=0;i<(wrapped?N:col);i++){ const x=X(i), y=Y(Math.abs(vinA[i])*RATIO); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);} ctx.stroke(); ctx.setLineDash([]);
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
  let sum=0, sq=0, mn=1e9, mx=-1e9;
  for(let i=1;i<=NCYC;i++){ const v=voutA[(col-i+N)%N]; sum+=v; sq+=v*v; if(v<mn)mn=v; if(v>mx)mx=v; }
  const avg = sum/NCYC, vrms = Math.sqrt(sq/NCYC);
  const vac = Math.sqrt(Math.max(vrms*vrms - avg*avg, 0));        // rms of the AC (ripple) part
  return { avg, rip:mx-mn, gamma: avg>0.01 ? vac/avg : 0 };
}

/* ---------- text panel ---------- */
const stEl = { box:document.getElementById('status'), t:document.getElementById('stTitle'), p:document.getElementById('stText'), path:document.getElementById('stPath') };
let lastMsg = '';
function updateStatus(){
  const {pol,cond,vin} = cur, vd2 = (2*S.Vd).toFixed(1);
  let key, title, text, path, color;
  if(cond && pol>0){
    key='pos'; color='#3dff9a';
    title='Positive half-cycle <span class="pill on">D1, D2 ON</span><span class="pill off">D3, D4 OFF</span>';
    text='The top end of the transformer secondary is positive. Only D1 and D2 are forward-biased, so current can flow; D3 and D4 are reverse-biased and block.';
    path='Secondary (+) → D1 → Load ↓ (top → bottom) → D2 → Secondary (−)';
  } else if(cond){
    key='neg'; color='#3dff9a';
    title='Negative half-cycle <span class="pill on">D3, D4 ON</span><span class="pill off">D1, D2 OFF</span>';
    text='The secondary polarity has flipped: the bottom end is now positive. D3 and D4 conduct and D1, D2 block — yet the current still goes through the load in the SAME direction.';
    path='Secondary (+, bottom) → D3 → Load ↓ (top → bottom) → D4 → Secondary (−, top)';
  } else if(S.useCap){
    key='cap'; color='#4db3ff';
    title='Capacitor supplies the load <span class="pill off">all diodes OFF</span>';
    text='|Vin| has dropped below the capacitor voltage, so the diodes are reverse-biased. The capacitor discharges through the load and keeps V out up — this is what smooths the ripple.';
    path='Smoothing capacitor → Load ↓ → back to capacitor';
  } else {
    key='dead'; color='#ff5a6e';
    title='Dead zone <span class="pill off">all diodes OFF</span>';
    text = S.Vd>0 ? `The secondary voltage is below about ${vd2} V (two 1N4148 drops in series), so no current flows and V out = 0.` : 'Input is crossing zero, so there is no output at this instant.';
    path='No current path';
  }
  if(key+S.Vd === lastMsg) return; lastMsg = key+S.Vd;
  stEl.t.innerHTML = title; stEl.p.textContent = text; stEl.path.textContent = path; stEl.box.style.borderLeftColor = color;
}

function updateFacts(){
  const Vs = VSP(), Vo = Math.max(Vs - 2*S.Vd,0);
  const gCap = 1/(4*Math.sqrt(3)*S.f*S.C*S.R);
  const act = on => on ? 'class="fm act"' : 'class="fm"';
  document.getElementById('facts').innerHTML =
    `<b>Secondary peak</b> Vs = V1·√(L2/L1) = ${S.Vp} × ${RATIO.toFixed(3)} = <b>${Vs.toFixed(2)} V</b> &nbsp;•&nbsp; <b>Peak output</b> ≈ Vs − 2V<sub>D</sub> ≈ <b>${Vo.toFixed(1)} V</b> &nbsp;•&nbsp; <b>Output freq</b> = 2f = <b>${2*S.f} Hz</b>` +
    `<div class="fm-title">Ripple factor  γ = V<sub>r(rms)</sub> / V<sub>dc</sub></div>` +
    `<div ${act(!S.useCap)}>Without filter (full-wave):&nbsp; γ = √[(V<sub>rms</sub>/V<sub>dc</sub>)² − 1] = √[(π/2√2)² − 1] = <b>0.482</b></div>` +
    `<div ${act(S.useCap)}>With C1 filter:&nbsp; γ = 1 / (4√3 · f · C · R<sub>L</sub>) = 1 / (4√3 × ${S.f} × ${fmtC(S.C)} × ${fmtR(S.R)}) = <b>${gCap.toFixed(3)}</b></div>`;
  document.getElementById('tagIn').textContent = `V1: ${S.wave}, ${S.Vp} V peak, ${S.f} Hz  (dashed = secondary)`;
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
  const Vs = VSP(), Ymax = Vs*1.2, ticks = [-Vs,-S.Vp,0,S.Vp,Vs];
  drawChart(document.getElementById('chIn'), vinA, {min:-Ymax,max:Ymax,ticks,color:'#4db3ff',shade:true,overlay:RATIO});
  drawChart(document.getElementById('chOut'), voutA, {min:-Ymax,max:Ymax,ticks:[0,Vs],color:'#3dff9a',ghost:true,avg:st?st.avg:null});
  document.getElementById('rIn').textContent  = (cur.vin>=0?'+':'')+cur.vin.toFixed(1)+' V';
  document.getElementById('rOut').textContent = cur.vout.toFixed(1)+' V';
  document.getElementById('rDc').textContent  = st ? st.avg.toFixed(2)+' V' : '…';
  document.getElementById('rRip').textContent = st ? st.rip.toFixed(2)+' V' : '…';
  document.getElementById('rGam').textContent = st ? st.gamma.toFixed(3) : '…';
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
bindRange('sR','oR',fmtR,v=>S.R=v);
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
