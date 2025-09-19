import { COLORS } from './src/kleuren.js';

// ====== CONFIG ======
const LOGO_TEXT         = "ALBION";
const ROWS_DEFAULT      = 12;
const LINE_HEIGHT       = 10;
let TIP_RATIO           = 0.3; // small (tip) cap radius factor relative to big cap (0..1)
let END_RATIO           = 1.0; // big (end) cap radius factor relative to h/2 (0..1)
let DISPLACE_UNIT       = 28;
let ASPECT_W = 16;
let ASPECT_H = 9;
let LOGO_TARGET_W = 0;
let FIT_MODE = false;
const FIT_FRACTION = 0.75;
const BLOCK_STEPS = 4; // fixed number of blocks for block taper
const BLOCK_MIN_LEN_FRAC = 0.55; // leftmost block length as fraction of its segment
const BLOCK_LEAD_FRAC     = 0.65; // how much of the shortened width shifts left (0..1)
const BLOCK_CAP_FRAC      = 0.12; // extra front cap length as fraction of full len

// Scan behavior
const BRIDGE_PIXELS     = 0;         // WEGHALEN
const INK_THRESHOLD     = 140; // KAN WEG // GWN IN CODE ZETTEN?
const BAND_MIN_COVER_FRAC = 0.035; // ≥3.5% of word width must be continuous ink for a row to count

// Row sampling kernel (vertical) in the glyph buffer
const ROW_KERNEL_Y_FRAC = 0.015; // % van bandhoogte → 1–3px meestal
const MIN_RUN_PX_BUFFER = 0;     // WEGHALEN

// Offscreen buffer
const BUFFER_W          = 1400;
const BUFFER_H          = 420; 

const LETTERS_PATH      = './src/letters/';
let glyphImgs = {};   // map: char -> p5.Image (SVG rasterized)
let glyphDims = {};   // map: char -> {w,h}

// ====== STATE ======
let glyphBuffer;      // offscreen p5.Graphics used for scanning
let layout;           // computed positions + spans
let rows = ROWS_DEFAULT;
let linePx = LINE_HEIGHT;

let elRows, elThickness, elWidth, elGap, elGroups, elDispUnit, elPreset, elLogoScale, elAspectW, elAspectH, elCustomAR;
let elRowsOut, elThicknessOut, elWidthOut, elGapOut, elDispUnitOut, elGroupsOut, elLogoScaleOut;
let elTaper, elDebug, elAuto;
let elTipRatio, elTipOut;
let gapPx = 9;
let displaceGroups = 2;
let taperMode = 'rounded';
let debugMode = false;
let widthScale = 1.1;

let logoScaleMul = 1.0;

// --- Per-letter stretch (mouseX-weighted) ---
let PER_LETTER_STRETCH = true;   // toggle on/off
let MOUSE_STRETCH_MIN  = 0.5;   // min per-letter factor
let MOUSE_STRETCH_MAX  = 1.5;   // max per-letter factor
let MOUSE_STRETCH_SIGMA_FRAC = 0.15; // Gaussian sigma as fraction of content width

let baseRowPitch;
let targetContentH = null; // stays constant; rows change will shrink/grow pitch to keep this height
let targetContentW = null; // fixed reference width for scaling (decouples scale from width/gap)
let EXPORT_W = null; // when preset = custom, desired pixel width
let EXPORT_H = null; // when preset = custom, desired pixel height

// Keep the total logo width constant (sum of letter widths stays fixed)
let KEEP_TOTAL_WIDTH = true;
let BG_LINES = false;        // toggle via HTML checkbox
let BG_LINES_ALPHA = 40;

let REPEAT_V = false;          // vertically tile the logo to fill the canvas

// ---- Colors ----
const KLEUREN_JSON = './src/kleuren.json';
//let COLORS = [];
let color1 = '#ffffff';
let color2 = '#000000';

// ---- Canvas warp (final screen-space filter) ----
let WARP_ON = false;          // toggle via HTML checkbox
let WARP_AMP_PX = 12;         // peak vertical shift in pixels
let WARP_WAVELEN_PX = 240;    // wavelength along X in pixels
let WARP_PERIOD_S = 4.0;      // seconds per full wave cycle
let WARP_COL_W = 2;           // column slice width in pixels (performance)

// random animate
let lastAutoRandomMs = 0;
const RANDOM_INTERVAL_MS = 1000;
let autoRandomActive = false;
let autoTimer = null;
function setAuto(on){
  if (autoTimer){ clearInterval(autoTimer); autoTimer = null; }
  if (on){
    autoTimer = setInterval(()=>{ applyRandomTweaks(); }, RANDOM_INTERVAL_MS);
  }
}

let rowYsCanvas = []; // y-position of each row in canvas coordinates

// --- Curve + Animation controls ---
let MOUSE_CURVE = 'gauss';   // 'gauss' | 'cosine' | 'smoothstep'
let MOUSE_POWER = 1.0;       // t^power sharpening

let ANIM_MODE = 'off';     // 'mouse' | 'pulse' | 'scan' | 'off'
let animTime = 0;            // seconds
let _animRAF = null;
let _animStart = 0;
// Animation timing (seconds per full cycle)
let ANIM_PERIOD = 3.0;            // default: 3s per cycle
const SCAN_MARGIN_FRAC = 0.4; // allow the scan to travel 15% beyond both ends before wrapping

function startAnimLoop(){
  if (_animRAF) return;
  _animStart = performance.now();
  const step = (t)=>{
    animTime = (t - _animStart) / 1000.0;
    if (ANIM_MODE !== 'mouse' && ANIM_MODE !== 'off'){
      requestRedraw();
      _animRAF = requestAnimationFrame(step);
    } else {
      _animRAF = null;
    }
  };
  _animRAF = requestAnimationFrame(step);
}
function stopAnimLoop(){
  if (_animRAF){ cancelAnimationFrame(_animRAF); _animRAF = null; }
}

// === Preview vs Export ===
let isExport = false;
let _needsRedraw = false;
function requestRedraw(){
  if (_needsRedraw) return;
  _needsRedraw = true;
  requestAnimationFrame(()=>{
    _needsRedraw = false;
    draw();
  });
}

function exportSVG(cb){
  // nog toevoegen ; svg canvas maken en exporteren
}

function divisorsAsc(n){
  const d = [];
  for (let i = 1; i <= n; i++) if (n % i === 0) d.push(i);
  return d; // e.g. 12 -> [1,2,3,4,6,12]
}

function divisorsDescSigned(n){
  const asc = divisorsAsc(n);                 // [1,2,3,4,6,12]
  const negDesc = asc.slice().reverse().map(v => -v); // [-12,-6,-4,-3,-2,-1]
  const posAsc  = asc.slice();                // [1,2,3,4,6,12]
  return negDesc.concat(posAsc);
}

// --- Per-letter stretch helpers ---
function gaussian01(x){ return Math.exp(-0.5 * x * x); } // centered at 0

function mouseWeight(localMouseX, letterLeft, letterW, contentW, curve = MOUSE_CURVE, power = MOUSE_POWER){
  const cx    = letterLeft + 0.5 * letterW;
  const sigma = Math.max(1, MOUSE_STRETCH_SIGMA_FRAC * contentW);
  const dAbs  = Math.abs(localMouseX - cx);
  let t = 0;
  if (curve === 'gauss'){
    const z = dAbs / sigma;
    t = Math.exp(-0.5 * z * z);
  } else if (curve === 'cosine'){
    const x = Math.max(0, 1 - dAbs / sigma);
    t = 0.5 - 0.5 * Math.cos(Math.PI * x);
  } else if (curve === 'smoothstep'){
    const x = Math.max(0, Math.min(1, 1 - dAbs / sigma));
    t = x * x * (3 - 2 * x);
  } else {
    const z = dAbs / sigma;
    t = Math.exp(-0.5 * z * z);
  }
  if (power !== 1.0) t = Math.pow(t, power);
  return Math.max(0, Math.min(1, t));
}

function perLetterStretchFactor(localMouseX, baseX, letterScaledW, contentW0){
  if (ANIM_MODE === 'off' || !PER_LETTER_STRETCH) return 1.0;
  const t = mouseWeight(localMouseX, baseX, letterScaledW, contentW0, MOUSE_CURVE, MOUSE_POWER);
  return MOUSE_STRETCH_MIN + (MOUSE_STRETCH_MAX - MOUSE_STRETCH_MIN) * t;
}

function activeLocalMouseX(txLike, sLike, leftBound, rightBound){
  if (ANIM_MODE === 'mouse') return (mouseX - txLike) / Math.max(0.0001, sLike);
  if (ANIM_MODE === 'off'){
    const L = leftBound, R = rightBound; return (L + R) * 0.5;
  }
  const L = leftBound;
  const R = rightBound;
  const span = Math.max(1, R - L);
  const period = Math.max(0.05, ANIM_PERIOD); // seconds per full cycle
  const p = (animTime / period) % 1;          // normalized phase [0,1)

  if (ANIM_MODE === 'pulse'){
    const pos = 0.5 + 0.5 * Math.sin(2 * Math.PI * p);
    return L + pos * span;
  } else if (ANIM_MODE === 'scan'){
    const m = Math.max(0, Math.min(1, SCAN_MARGIN_FRAC));
    const f = -m + (1 + 2 * m) * p; // -m → 1+m, then wraps to -m
    return L + f * span;
  }

  return (mouseX - txLike) / Math.max(0.0001, sLike);
}

// Compute per-letter adjusted left positions and visual widths so that the gap between letters stays constant
function computeAdjustedLetterPositions(localMouseX, contentW0){
  const n = layout.letterX.length;
  const gapL = gapPx * layout.scale; // gap in layout units
  const adjX = new Array(n);
  const wUse = new Array(n);
  if (n === 0) return { adjX: [], wUse: [] };

  // Pass 1: compute preliminary per-letter visual widths with mouse weighting
  const baseW = new Array(n);
  const preW  = new Array(n);
  let sumBase = 0, sumPre = 0;
  for (let i = 0; i < n; i++){
    baseW[i] = layout.letterW[i] * layout.scale * widthScale; // base visual width without mouse weighting
    sumBase += baseW[i];
    let perW = 1.0;
    const baseXForWeight = (i === 0) ? (layout.letterX[0]) : (adjX[i] !== undefined ? adjX[i] : layout.letterX[i]);
    if (PER_LETTER_STRETCH){
      perW = perLetterStretchFactor(localMouseX, baseXForWeight, baseW[i], contentW0);
    }
    preW[i] = baseW[i] * perW;
    sumPre += preW[i];
  }

  // Compute normalization so total width stays constant
  let norm = 1.0;
  if (KEEP_TOTAL_WIDTH && sumPre > 0){
    norm = sumBase / sumPre; // scale all widths so the sum equals the original
  }

  // Pass 2: finalize widths and positions with constant gaps
  adjX[0] = layout.letterX[0];
  wUse[0] = preW[0] * norm;
  for (let i = 1; i < n; i++){
    wUse[i] = preW[i] * norm;
    adjX[i] = adjX[i-1] + wUse[i-1] + gapL;
  }
  return { adjX, wUse };
}


function randInt(min, max){ return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max){ return Math.random() * (max - min) + min; }

// ---- Random helpers that read ranges from the actual HTML inputs ----
function getInputRange(el, fallbackMin, fallbackMax, fallbackStep){
  const min  = (el && el.min  !== undefined && el.min  !== '') ? parseFloat(el.min)  : fallbackMin;
  const max  = (el && el.max  !== undefined && el.max  !== '') ? parseFloat(el.max)  : fallbackMax;
  const step = (el && el.step !== undefined && el.step !== '' && el.step !== 'any') ? parseFloat(el.step) : fallbackStep;
  return { min, max, step };
}
function randFromRangeInt(min, max, step){
  if (!isFinite(step) || step <= 0) step = 1;
  const nSteps = Math.max(1, Math.floor((max - min) / step));
  const k = randInt(0, nSteps);
  return min + k * step;
}
function randFromInputInt(el, fallbackMin, fallbackMax, fallbackStep){
  const {min, max, step} = getInputRange(el, fallbackMin, fallbackMax, fallbackStep);
  return Math.round(randFromRangeInt(min, max, step));
}
function randFromInputFloat(el, fallbackMin, fallbackMax, fallbackStep){
  const {min, max, step} = getInputRange(el, fallbackMin, fallbackMax, fallbackStep);
  const val = randFromRangeInt(min, max, step);
  return val;
}

function applyRandomTweaks(){
  const mutators = [];

  // Line thickness
  if (elThickness) mutators.push(()=>{
    linePx = randFromInputInt(elThickness, 1, 25, 1);
    elThickness.value = linePx;
    if (elThicknessOut) elThicknessOut.textContent = `${linePx} px`;
  });

  // Displacement groups
  mutators.push(()=>{
    const opts = divisorsDescSigned(rows);
    if (opts && opts.length){
      const curIdx = Math.max(0, opts.indexOf(displaceGroups));
      let newIdx = randInt(0, opts.length - 1);
      if (opts.length > 1 && newIdx === curIdx) newIdx = (newIdx + 1) % opts.length;
      displaceGroups = opts[newIdx];
      const groupsAbs = Math.max(1, Math.abs(displaceGroups));
      if (elGroups){
        elGroups.min = 0; elGroups.max = Math.max(0, opts.length - 1); elGroups.step = 1; elGroups.value = newIdx;
      }
      if (elGroupsOut) elGroupsOut.textContent = String(displaceGroups);
    }
  });

  // Displacement unit
  if (elDispUnit) mutators.push(()=>{
    DISPLACE_UNIT = randFromInputInt(elDispUnit, 0, 80, 1);
    elDispUnit.value = DISPLACE_UNIT;
    if (elDispUnitOut) elDispUnitOut.textContent = `${DISPLACE_UNIT} px`;
  });

  // Tip ratio
  if (elTipRatio) mutators.push(()=>{
    TIP_RATIO = randFromInputFloat(elTipRatio, 0, 1, 0.01);
    elTipRatio.value = TIP_RATIO.toFixed(2);
    if (elTipOut) elTipOut.textContent = TIP_RATIO.toFixed(2);
  });

  if (!mutators.length) return false;

  // Kies k mutators (1..all) zonder herhaling
  const k = randInt(1, mutators.length);
  const pool = mutators.slice();
  for (let i = pool.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (let i = 0; i < k; i++) pool[i]();

  // Rebuild layout (gap beïnvloedt posities; rebuild is goedkoop genoeg hier)
  layout = buildLayout(LOGO_TEXT, rows);
  requestRedraw();
  return true;
}

function preload(){
  // Load color list
  const data = loadJSON(KLEUREN_JSON);
  // kleuren.json is a root array of hex strings
  //COLORS = Array.isArray(data) ? data : [];
  color1 = COLORS[0] || color1;
  color2 = COLORS[1] || COLORS[0] || color2;
  const uniq = Array.from(new Set(LOGO_TEXT.split('').map(c => c.toUpperCase())));
  uniq.forEach(ch => {
    const p = LETTERS_PATH + ch + '.svg';
    glyphImgs[ch] = loadImage(p, img => { glyphDims[ch] = { w: img.width, h: img.height }; }, err => console.error('Failed to load', p, err));
  });
}

function setup(){
  // Warp controls
  const elWarpOn   = document.getElementById('warpOn');
  const elWarpAmp  = document.getElementById('warpAmp');
  const elWarpLen  = document.getElementById('warpLen');
  const elWarpPer  = document.getElementById('warpPeriod');
  const elWarpAmpOut = document.getElementById('warpAmpOut');
  const elWarpLenOut = document.getElementById('warpLenOut');
  const elWarpPerOut = document.getElementById('warpPeriodOut');

  if (elWarpOn){
    elWarpOn.checked = WARP_ON;
    elWarpOn.addEventListener('change', ()=>{ WARP_ON = !!elWarpOn.checked; requestRedraw(); });
  }
  if (elWarpAmp){
    elWarpAmp.value = String(WARP_AMP_PX);
    if (elWarpAmpOut) elWarpAmpOut.textContent = `${WARP_AMP_PX|0} px`;
    elWarpAmp.addEventListener('input', ()=>{
      WARP_AMP_PX = Math.max(0, parseFloat(elWarpAmp.value) || 0);
      if (elWarpAmpOut) elWarpAmpOut.textContent = `${WARP_AMP_PX|0} px`;
      requestRedraw();
    });
  }
  if (elWarpLen){
    elWarpLen.value = String(WARP_WAVELEN_PX);
    if (elWarpLenOut) elWarpLenOut.textContent = `${WARP_WAVELEN_PX|0} px`;
    elWarpLen.addEventListener('input', ()=>{
      WARP_WAVELEN_PX = Math.max(8, parseFloat(elWarpLen.value) || 8);
      if (elWarpLenOut) elWarpLenOut.textContent = `${WARP_WAVELEN_PX|0} px`;
      requestRedraw();
    });
  }
  if (elWarpPer){
    elWarpPer.value = String(ANIM_PERIOD);
    if (elWarpPerOut) elWarpPerOut.textContent = `${ANIM_PERIOD.toFixed(2)} s`;
    elWarpPer.addEventListener('input', ()=>{
      ANIM_PERIOD = Math.max(0.1, parseFloat(elWarpPer.value) || ANIM_PERIOD);
      if (elWarpPerOut) elWarpPerOut.textContent = `${ANIM_PERIOD.toFixed(2)} s`;
      startAnimLoop();
      requestRedraw();
    });
  }
  mainCanvas = createCanvas(800, 250);
  // Initialize intrinsic size to match the created canvas (will be updated by fitViewportToWindow)
  if (mainCanvas && mainCanvas.elt && mainCanvas.elt.tagName.toLowerCase() === 'svg'){
    mainCanvas.elt.setAttribute('width', String(width));
    mainCanvas.elt.setAttribute('height', String(height));
    mainCanvas.elt.setAttribute('viewBox', `0 0 ${width} ${height}`);
    mainCanvas.elt.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }
// Stop border op canvas; zet canvas in onze wrapper met border
  const wrap = document.getElementById('canvasWrap');
  if (wrap && mainCanvas) mainCanvas.parent('canvasWrap');
  if (LOGO_TARGET_W <= 0) LOGO_TARGET_W = Math.max(1, width);
  baseRowPitch = height / rows;
  // Freeze the visual logo height in pre-scale units; adding rows should not stretch the logo
  targetContentH = (rows <= 1) ? 0 : (rows - 1) * baseRowPitch;
  noLoop();
  layout = buildLayout(LOGO_TEXT);
  if (targetContentW == null){
    const _ws = widthScale;
    widthScale = 1.0;
    const initFit = computeLayoutFit();
    targetContentW = initFit.contentW0;
    widthScale = _ws;
  }
  fitViewportToWindow();
  window.addEventListener('resize', fitViewportToWindow);

  // Hook up HTML controls from index.html
  function byId(id){ return document.getElementById(id); }
  elRows      = byId('rows');
  elThickness = byId('thickness');
  elWidth     = byId('widthScale');
  elGap       = byId('gap');
  elGroups    = byId('groups');
  elGroupsOut = byId('groupsOut');
  elTaper     = byId('taper');
  elDebug     = byId('debug');
  elAuto      = byId('autorand');
  elRowsOut      = byId('rowsOut');
  elThicknessOut = byId('thicknessOut');
  elWidthOut     = byId('widthOut');
  elGapOut       = byId('gapOut');
  elDispUnit    = byId('dispUnit');
  elDispUnitOut = byId('dispUnitOut');
  elPreset       = byId('preset');
  elLogoScale    = byId('logoScale');
  elLogoScaleOut = byId('logoScaleOut');
  elTipRatio = byId('tipRatio');
  elTipOut   = byId('tipOut');
  elAspectW  = byId('aspectW');
  elAspectH  = byId('aspectH');
  elCustomAR = byId('customAR');

  // Curve buttons
const btnCurveGauss  = document.getElementById('curveGauss');
const btnCurveCos    = document.getElementById('curveCos');
const btnCurveSmooth = document.getElementById('curveSmooth');
if (btnCurveGauss)  btnCurveGauss.addEventListener('click', ()=>{ MOUSE_CURVE='gauss'; requestRedraw(); });
if (btnCurveCos)    btnCurveCos.addEventListener('click',   ()=>{ MOUSE_CURVE='cosine'; requestRedraw(); });
if (btnCurveSmooth) btnCurveSmooth.addEventListener('click',()=>{ MOUSE_CURVE='smoothstep'; requestRedraw(); });

const elBgLines = document.getElementById('bgLines');
if (elBgLines){
  elBgLines.checked = BG_LINES;
  elBgLines.addEventListener('change', ()=>{ 
    BG_LINES = !!elBgLines.checked; 
    requestRedraw(); 
  });
}
// Vertical repeat toggle
const elRepeatV = document.getElementById('repeatV');
if (elRepeatV){
  elRepeatV.checked = REPEAT_V;
  elRepeatV.addEventListener('change', ()=>{ REPEAT_V = !!elRepeatV.checked; requestRedraw(); });
}

// Color selectors (kleur 1 / kleur 2)
const selColor1 = document.getElementById('color1');
const selColor2 = document.getElementById('color2');
function fillColorSelect(sel){
  if (!sel) return;
  sel.innerHTML = '';
  const list = Array.isArray(COLORS) && COLORS.length ? COLORS : ['#ffffff','#000000'];
  list.forEach((hex)=>{
    const opt = document.createElement('option');
    opt.value = hex;
    opt.textContent = hex.toUpperCase();
    opt.style.background = hex;
    opt.style.color = '#000000';
    sel.appendChild(opt);
  });
}
fillColorSelect(selColor1);
fillColorSelect(selColor2);
if (selColor1){
  selColor1.value = color1;
  if (selColor1.selectedIndex === -1 && selColor1.options.length){
    selColor1.selectedIndex = 0;
    color1 = selColor1.value;
  }
  selColor1.addEventListener('change', ()=>{ color1 = selColor1.value; requestRedraw(); });
}
if (selColor2){
  selColor2.value = color2;
  if (selColor2.selectedIndex === -1 && selColor2.options.length){
    selColor2.selectedIndex = Math.min(1, selColor2.options.length - 1);
    color2 = selColor2.value;
  }
  selColor2.addEventListener('change', ()=>{ color2 = selColor2.value; requestRedraw(); });
}

// Animation buttons
const btnAnimMouse = document.getElementById('animMouse');
const btnAnimOff   = document.getElementById('animOff');
const btnAnimPulse = document.getElementById('animPulse');
const btnAnimScan  = document.getElementById('animScan');

function setAnim(mode){
  ANIM_MODE = mode;
  // Enable/disable stretch based on mode
  PER_LETTER_STRETCH = (mode !== 'off');
  // Start RAF only for time-based modes
  if (mode === 'pulse' || mode === 'scan') startAnimLoop(); else stopAnimLoop();
  requestRedraw();
}
if (btnAnimMouse) btnAnimMouse.addEventListener('click', ()=> setAnim('mouse'));
if (btnAnimOff)   btnAnimOff.addEventListener('click',   ()=> setAnim('off'));
if (btnAnimPulse) btnAnimPulse.addEventListener('click', ()=> setAnim('pulse'));
if (btnAnimScan)  btnAnimScan.addEventListener('click',  ()=> setAnim('scan'));

  // Animation duration (seconds per cycle)
  const animPeriodCtl = document.getElementById('animPeriod');
  const animPeriodOut = document.getElementById('animPeriodOut');
  if (animPeriodCtl){
    // initialize UI from current value
    animPeriodCtl.value = String(ANIM_PERIOD);
    if (animPeriodOut) animPeriodOut.textContent = ANIM_PERIOD.toFixed(2) + 's';
    animPeriodCtl.addEventListener('input', ()=>{
      const v = parseFloat(animPeriodCtl.value);
      if (Number.isFinite(v)){
        ANIM_PERIOD = Math.max(0.1, v);
        if (animPeriodOut) animPeriodOut.textContent = ANIM_PERIOD.toFixed(2) + 's';
        startAnimLoop(); // ensure loop is running when user tweaks
        requestRedraw();
      }
    });
  }

  // initialize values to current state
  elRows.value = rows;
  elThickness.value = linePx;
  elWidth.value = Math.round(widthScale * 100);
  elGap.value = gapPx;
  elDebug.checked = debugMode;
  elAuto.checked = false;
  if (elTaper) {
    elTaper.value = taperMode;
    elTaper.addEventListener('change', () => {
      const v = String(elTaper.value || '').toLowerCase();
      if (v === 'rounded' || v === 'straight' || v === 'circles' || v === 'blocks' || v === 'pluses') {
        taperMode = v;
      } else {
        taperMode = 'rounded';
      }
      requestRedraw();
    });
  }
    if (elLogoScaleOut) elLogoScaleOut.textContent = '100 %';
  if (elRowsOut)      elRowsOut.textContent      = String(rows);
  if (elThicknessOut) elThicknessOut.textContent = `${linePx} px`;
  if (elWidthOut)     elWidthOut.textContent     = `${Math.round(widthScale * 100)} %`;
  if (elGapOut)       elGapOut.textContent       = `${gapPx} px`;
  if (elLogoScale){
    elLogoScale.min = 10; elLogoScale.max = 200; elLogoScale.step = 1;
    elLogoScale.value = 100;
  }
  if (elPreset){
    elPreset.addEventListener('change', ()=>{
      const val = elPreset.value;

      if (val === 'fit') {
        FIT_MODE = true;
        if (elCustomAR) elCustomAR.style.display = 'none';
        fitViewportToWindow();
        requestRedraw();
        return;
      } else {
        FIT_MODE = false;
      }

      if (val === 'custom') {
        if (elCustomAR) elCustomAR.style.display = '';
        updateCustomResolutionAndAspect();
      } else {
        if (elCustomAR) elCustomAR.style.display = 'none';
        EXPORT_W = null; EXPORT_H = null;
        const opt = elPreset.options[elPreset.selectedIndex];
        const aw = parseInt(opt.dataset.aw, 10);
        const ah = parseInt(opt.dataset.ah, 10);
        if (Number.isFinite(aw) && Number.isFinite(ah)) {
          ASPECT_W = Math.max(1, aw);
          ASPECT_H = Math.max(1, ah);
          fitViewportToWindow();
          requestRedraw();
        }
      }
    });
  }

  function updateCustomResolutionAndAspect(){
    const w = parseInt(elAspectW && elAspectW.value, 10);
    const h = parseInt(elAspectH && elAspectH.value, 10);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0){
      EXPORT_W = w; EXPORT_H = h;
      ASPECT_W = w; ASPECT_H = h;
      fitViewportToWindow();
      requestRedraw();
    }
  }

  if (elAspectW) elAspectW.addEventListener('input', ()=>{ if (elPreset && elPreset.value === 'custom') updateCustomResolutionAndAspect(); });
  if (elAspectH) elAspectH.addEventListener('input', ()=>{ if (elPreset && elPreset.value === 'custom') updateCustomResolutionAndAspect(); });
  if (elLogoScale){
    elLogoScale.addEventListener('input', ()=>{
      const perc = Math.max(10, Math.min(200, parseInt(elLogoScale.value, 10) || 100));
      logoScaleMul = perc / 100;
      if (elLogoScaleOut) elLogoScaleOut.textContent = `${perc} %`;
      requestRedraw();
    });
  }
  if (elDispUnit){
    elDispUnit.value = DISPLACE_UNIT;
    if (elDispUnitOut) elDispUnitOut.textContent = `${DISPLACE_UNIT} px`;
  }
  if (elTipRatio){
    elTipRatio.value = TIP_RATIO;
    if (elTipOut) elTipOut.textContent = Number(TIP_RATIO).toFixed(2);
  }
  if (elDispUnit){
    elDispUnit.addEventListener('input', ()=>{
      DISPLACE_UNIT = parseInt(elDispUnit.value, 10) || 0;
      if (elDispUnitOut) elDispUnitOut.textContent = `${DISPLACE_UNIT} px`;
      requestRedraw();
    });
  }

  let _signedGroupOptions = [];
  function rebuildGroupsSelect(){
    _signedGroupOptions = divisorsDescSigned(rows); // [-rows..-1, rows..1]

    // vorige waarde respecteren: zelfde sign, en grootste geldige |v| die ≤ vorige |v|
    const prev = displaceGroups || 1;
    const sign = Math.sign(prev) || 1;
    const targetAbs = Math.max(1, Math.abs(prev));
    const posOptions = _signedGroupOptions
      .filter(v => Math.sign(v) === sign)
      .map(v => Math.abs(v))
      .sort((a,b)=>b-a); // groot → klein

    let chosenAbs = posOptions.find(v => v <= targetAbs);
    if (!chosenAbs) chosenAbs = posOptions[posOptions.length - 1] || 1; // val naar kleinste

    displaceGroups = sign * chosenAbs;

    // slider = index in de options-array
    const idx = _signedGroupOptions.indexOf(displaceGroups);
    elGroups.min = 0;
    elGroups.max = Math.max(0, _signedGroupOptions.length - 1);
    elGroups.step = 1;
    elGroups.value = (idx >= 0) ? idx : 0;

    const groupsAbs = Math.max(1, Math.abs(displaceGroups));
    if (elGroupsOut) elGroupsOut.textContent = String(displaceGroups);
  }
  rebuildGroupsSelect();

  // listeners
  elRows.addEventListener('input', ()=>{
    rows = parseInt(elRows.value,10);
    if (elRowsOut) elRowsOut.textContent = String(rows);
    rebuildGroupsSelect();             // behoudt sign en clamp ≤
    layout = buildLayout(LOGO_TEXT, rows);
    requestRedraw();
  });

  elThickness.addEventListener('input', ()=>{
    linePx = parseInt(elThickness.value,10);
    if (elThicknessOut) elThicknessOut.textContent = `${linePx} px`;
    requestRedraw();
  });

  elWidth.addEventListener('input', ()=>{
    widthScale = parseInt(elWidth.value,10) / 100;
    if (elWidthOut) elWidthOut.textContent = `${Math.round(widthScale * 100)} %`;
    requestRedraw();
  });

  elGap.addEventListener('input', ()=>{
    gapPx = parseInt(elGap.value,10);
    if (elGapOut) elGapOut.textContent = `${gapPx} px`;
    layout = buildLayout(LOGO_TEXT, rows);
    requestRedraw();
  });

  elGroups.addEventListener('input', ()=>{
    const idx = parseInt(elGroups.value,10) || 0;
    displaceGroups = _signedGroupOptions[idx] || 1; // gesigneerd
    const groupsAbs = Math.max(1, Math.abs(displaceGroups));
    if (elGroupsOut) elGroupsOut.textContent = String(displaceGroups);
    requestRedraw();
  });

  if (elTipRatio){
    elTipRatio.addEventListener('input', ()=>{
      TIP_RATIO = Math.max(0, Math.min(1, parseFloat(elTipRatio.value)));
      if (elTipOut) elTipOut.textContent = Number(TIP_RATIO).toFixed(2);
      requestRedraw();
    });
  }

  elDebug.addEventListener('change', ()=>{
    debugMode = elDebug.checked;
    requestRedraw();
  });

  elAuto.addEventListener('change', ()=>{
    autoRandomActive = elAuto.checked;
    setAuto(autoRandomActive);
  });

  if (elCustomAR) elCustomAR.style.display = (elPreset && elPreset.value === 'custom') ? '' : 'none';
  FIT_MODE = (elPreset && elPreset.value === 'fit');
  fitViewportToWindow();
  requestRedraw();
  if (elPreset && elPreset.value === 'custom') updateCustomResolutionAndAspect();
  noLoop();
  requestRedraw();
}

function computeLayoutFit(){
  // Centering based on fixed layout metrics; no auto scale-to-fit
  const tEff = 1 + (widthScale - 1);
  // Derive pitch from a fixed target content height so more rows → tighter spacing
  const rowPitchNow = (rows <= 1) ? 0 : (targetContentH / (rows - 1));

  // Horizontale bounds van letterdozen
  const boxesLeft = layout.letterX.map(x => x * tEff);
  const boxesW    = layout.letterW.map(w => w * layout.scale * widthScale);
  let leftmost = Infinity, rightmost = -Infinity;
  for (let i = 0; i < boxesLeft.length; i++){
    const L = boxesLeft[i];
    const R = boxesLeft[i] + boxesW[i];
    if (L < leftmost)  leftmost = L;
    if (R > rightmost) rightmost = R;
  }
  if (!isFinite(leftmost))  leftmost = 0;
  if (!isFinite(rightmost)) rightmost = LOGO_TARGET_W;

  const contentW0 = Math.max(1, rightmost - leftmost);
  const contentH0 = (rows <= 1) ? 0 : targetContentH;

  // Geen sFit: niet meer mee schalen
  const sFit = 1;
  const contentW = contentW0;
  const contentH = contentH0;

  // Centreer binnen huidige viewport
  const left = (width  - contentW) * 0.5 - leftmost;
  const top  = (height - contentH) * 0.5;

  return { tEff, rowPitchNow, leftmost, rightmost, contentW0, contentH0, sFit, left, top };
}

function renderLogo(){
  push();
  background(color1);
  fill(color2);
  noStroke();

  const fit = computeLayoutFit();
  const { tEff, rowPitchNow, leftmost, contentW0, contentH0 } = fit;

  // Center using the *current* content bounds so it stays centered as width/gap change
  const innerW = Math.max(1, width);
  const refW   = Math.max(1, targetContentW || contentW0);
  const sBase  = innerW / refW;
  const s      = Math.max(0.01, sBase * FIT_FRACTION * logoScaleMul);

  // Center using the *current* content bounds so it stays centered as width/gap change
  const innerH = Math.max(1, height);
  let tx = 0, ty = 0;

  // Provisional translate (unadjusted) just for mouse mapping
  const txProvisional = (innerW - s * contentW0) * 0.5 - s * leftmost;
  const tyProvisional = (innerH - s * contentH0) * 0.5;

  // Mouse in layout coordinates using provisional centering
  const localMouseX0 = activeLocalMouseX(txProvisional, s, leftmost, leftmost + contentW0);

  // Build per-letter adjusted positions so the visual gap stays constant (pass0)
  let adj = computeAdjustedLetterPositions(localMouseX0, contentW0);
  let adjX = adj.adjX;
  let wUseArr = adj.wUse;

  // Compute adjusted bounds for perfect centering
  const leftAdj0  = Math.min(...adjX);
  const rightAdj0 = Math.max(...adjX.map((x,i)=> x + wUseArr[i]));
  const contentWAdj0 = Math.max(1, rightAdj0 - leftAdj0);

  // Final centering based on adjusted bounds
  const txAdj = (innerW - s * contentWAdj0) * 0.5 - s * leftAdj0;
  const tyAdj = tyProvisional; // vertical centering unchanged

  // Recompute mouse in layout coords with final centering and rebuild adjusted positions (pass1)
  const localMouseX  = activeLocalMouseX(txAdj, s, leftAdj0,  leftAdj0  + contentWAdj0);
  adj = computeAdjustedLetterPositions(localMouseX, contentW0);
  adjX = adj.adjX;
  wUseArr = adj.wUse;

  // Backdrop lines across the full canvas (pixel space) aligned to row pitch
  if (BG_LINES){
    const pitchPx = rowPitchNow * s;           // spacing between rows in pixels
    const thickPx = 3;
    if (pitchPx > 0){
      push();
      noStroke();
      const a = Math.max(0, Math.min(255, BG_LINES_ALPHA));
      const cc = color(color2);
      cc.setAlpha(a);
      fill(cc);
      // Align first line to where row 0 would be after translate/scale
      const y0 = tyAdj; // row 0 at layout y=0 maps to canvas y=tyAdj
      const startY = ((y0 % pitchPx) + pitchPx) % pitchPx; // wrap to [0,pitch)
      for (let y = startY; y <= height; y += pitchPx){
        rect(0, y - thickPx * 0.5, width, thickPx);
      }
      pop();
    }
  }

  // Apply final transform
  tx = txAdj; ty = tyAdj;
  translate(tx, ty);
  scale(s, s);

  // Ensure row Y positions are defined for all rows (top at 0), independent of line thickness
  if (rows <= 1){
    rowYsCanvas = [0];
  } else {
    rowYsCanvas = Array.from({ length: rows }, (_, r) => r * rowPitchNow);
  }

  // Draw all letters with an additional vertical offset in *layout* units
  function drawLettersAtOffset(yOff){
    for (let li = 0; li < layout.lettersOrder.length; li++){
      const letterKey   = layout.lettersOrder[li];
      const rowsArr = layout.letters[letterKey];
      const baseX = adjX[li];
      const letterBaseScaledW = layout.letterW[li] * layout.scale;
      const wUse = wUseArr[li];
      const wScaleUse = letterBaseScaledW > 0 ? (wUse / letterBaseScaledW) : widthScale;

      for (let r = 0; r < rowsArr.length; r++){
        const y = rowYsCanvas[r] + yOff;
        for (const span of rowsArr[r]){
          const rightEdgeX = baseX + span.rightRel * layout.scale * wScaleUse; // per-letter stretch
          const baseLen    = Math.max(0, span.runLen * layout.scale * wScaleUse);
          const maxDash = Math.max(0, rightEdgeX - baseX);
          const dashLenClamped = Math.min(baseLen, maxDash);
          const xShift = computeXShift(r, rows, displaceGroups);
          const rx = rightEdgeX + xShift;
          switch (taperMode) {
            case 'straight':
              drawStraightTaper(rx, y, dashLenClamped, linePx);
              break;
            case 'circles':
              drawCircleTaper(rx, y, dashLenClamped, linePx, TIP_RATIO, END_RATIO);
              break;
            case 'blocks':
              drawBlockTaper(rx, y, dashLenClamped, linePx, TIP_RATIO, END_RATIO);
              break;
            case 'pluses':
              drawPlusTaper(rx, y, dashLenClamped, linePx, TIP_RATIO, END_RATIO);
              break;
            case 'rounded':
            default:
              drawRoundedTaper(rx, y, dashLenClamped, linePx, TIP_RATIO, END_RATIO);
              break;
          }
        }
      }
    }
  }

  // Draw base instance
  drawLettersAtOffset(0);

  // Vertically repeat to fill canvas (whole-logo step = rows * rowPitchNow)
  if (REPEAT_V && rows > 0){
    const tileH = rows * rowPitchNow; // next logo starts one line below the last of previous
    if (tileH > 0){
      const viewTopL  = -ty / s;           // canvas top in layout units
      const viewBotL  = (height - ty) / s; // canvas bottom in layout units

      // Base logo spans [0 .. (rows-1)*rowPitchNow]
      const baseTopL = 0;
      const baseBotL = (rows - 1) * rowPitchNow;

      // Choose k so copies cover viewport above and below
      const kStart = Math.floor((viewTopL - baseBotL) / tileH) - 1;
      const kEnd   = Math.ceil((viewBotL - baseTopL) / tileH) + 1;
      for (let k = kStart; k <= kEnd; k++){
        if (k === 0) continue; // base already drawn at yOff=0
        drawLettersAtOffset(k * tileH, 0, rows);
      }
    }
  }
  pop();
}

function draw(){
  // renderLogo() sets the background based on color1
  renderLogo();
  if (debugMode) drawdebugModeOverlay();
  applyWarpToCanvas();
}

// ====== DRAWING ======

function drawRoundedTaper(rightX, cy, len, h, tipRatio = TIP_RATIO, endRatio = END_RATIO){
  // Base radii from stroke height
  const Rfull = Math.max(0.0001, (h * 0.5) * Math.max(0, Math.min(1, endRatio)));
  const rfull = Math.max(0.0001, Rfull * Math.max(0, Math.min(1, tipRatio)));

  // Clamp radii based on available length
  const maxRByLen = Math.max(0.0001, len * 0.5);
  const R = Math.min(Rfull, maxRByLen);
  const r = Math.min(rfull, R);

  const centerSep = Math.max(0, len - (R + r));
  const bigX = rightX - R;           // center of big cap
  const tipX = bigX - centerSep;     // center of small cap

  const steps = 14; // more steps = smoother arc

  beginShape();
  for (let i = 0; i <= steps; i++){
    const a = -HALF_PI + (i/steps) * PI;
    vertex(bigX + R * Math.cos(a), cy + R * Math.sin(a));
  }
  for (let i = 0; i <= steps; i++){
    const a = HALF_PI + (i/steps) * PI;
    vertex(tipX + r * Math.cos(a), cy + r * Math.sin(a));
  }
  endShape(CLOSE);
}

function drawStraightTaper(rightX, cy, len, h){
  const R = h * 0.5;
  const bigX = rightX - R;
  const centerSep = Math.max(0, len - R); // r=0 for straight tip
  const tipX = bigX - centerSep;

  beginShape();
  vertex(bigX, cy - R);
  vertex(tipX, cy);
  vertex(bigX, cy + R);
  endShape(CLOSE);
}

function drawCircleTaper(rightX, cy, len, h, tipRatio = TIP_RATIO, endRatio = END_RATIO){
  // Base radii from stroke height
  const Rfull = Math.max(0.0001, (h * 0.5) * Math.max(0, Math.min(1, endRatio)));
  const rfull = Math.max(0.0001, Rfull * Math.max(0, Math.min(1, tipRatio)));

  // Clamp by available length
  const maxRByLen = Math.max(0.0001, len * 0.5);
  const R = Math.min(Rfull, maxRByLen);
  const r = Math.min(rfull, R);

  // Number of beads: scale with length/height, clamp to [3..12]
  const ideal = Math.floor(len / Math.max(1, h * 0.9));
  const n = Math.max(3, Math.min(12, ideal));

  // Centers from big cap center to small tip center
  const bigX = rightX - R;
  const tipX = rightX - Math.max(0, len - r); // keep right edge aligned
  for (let i = 0; i < n; i++){
    const t = (n === 1) ? 0 : (i / (n - 1));
    const cx = lerp(bigX, tipX, t);
    const rad = lerp(R, r, t);
    circle(cx, cy, Math.max(0.0001, rad * 2));
  }
}

function drawBlockTaper(rightX, cy, len, h, tipRatio = TIP_RATIO, endRatio = END_RATIO){
  // const steps = Math.max(2, BLOCK_STEPS | 0);
  const steps = 4;

  // Height is driven by ratios: diameter = h * ratio
  function heightAt(frac){ // frac: 0 (right) → 1 (left)
    const ratio = lerp(endRatio, tipRatio, frac); // end → tip
    return Math.max(0.5, h * Math.max(0, Math.min(1, ratio)));
  }

  // Compute cap first (on the RIGHT), then blocks in the remaining width
  const capLen = Math.max(0, len/2 * BLOCK_CAP_FRAC);
  const fracSecond = (steps > 1) ? (1 / (steps - 1)) : 0;
  const capH = heightAt(fracSecond);             // thickness equals second block
  const yCap = cy - capH * 0.5;
  const xCapL = rightX - capLen;                 // cap sits at the far right
  const remainingLen = Math.max(0, len - capLen);
  const segLen = (steps > 0) ? (remainingLen / steps) : 0;

  // Width per block: decrease toward the left, but keep blocks touching
  function widthAt(frac){
    const lenFrac = 1.0 - (1.0 - BLOCK_MIN_LEN_FRAC) * frac; // 1 → min
    return Math.max(0, segLen * lenFrac);
  }

  push();

  // Draw the cap on the right first
  fill(0, 0, 0, 255);
  rect(xCapL, yCap, capLen, capH);

  // Now march leftwards from the left edge of the cap
  let rightEdge = xCapL;
  for (let i = 0; i < steps; i++){
    const frac = (steps === 1) ? 0 : (i / (steps - 1)); // 0 at rightmost block, 1 at leftmost
    const w = widthAt(frac);
    const hi = heightAt(frac);
    const yTop = cy - hi * 0.5;
    const xL = rightEdge - w;   // touch the previous element
    const alpha = Math.floor(255 - (255 - 80) * frac); // darker → lighter
    fill(0, 0, 0, alpha);
    rect(xL, yTop, w, hi);
    rightEdge = xL; // continue left
  }

  pop();
}

function drawPlusTaper(rightX, cy, len, h, tipRatio = TIP_RATIO, endRatio = END_RATIO){
  // Grootte-envelope vanuit ratios, begrensd door lengte
  const Hfull = Math.max(0.0001, h * Math.max(0, Math.min(1, endRatio)));
  const hTip  = Math.max(0.0001, h * Math.max(0, Math.min(1, tipRatio)));
  const maxHByLen = Math.max(0.0001, len * 0.5);
  const Hbig = Math.min(Hfull, maxHByLen);
  const Hsmall = Math.min(hTip, Hbig);

  // Aantal samples uit lengte; klemmen voor performance
  const baseStep = Math.max(4, Math.floor(Hbig * 0.9));
  const n = Math.max(3, Math.min(24, Math.floor(len / baseStep)));

  const xRight = rightX;
  const xLeft  = rightX - len;

  const BAR_FRAC = 0.28; // dikte van de armen

  fill(color2); // volle zwart, geen opacity verloop
  for (let i = 0; i < n; i++){
    const t = (n === 1) ? 0 : i / (n - 1); // 0 = rechts, 1 = links
    const cx = lerp(xRight, xLeft, t);
    const size = lerp(Hbig, Hsmall, t);
    const half = size * 0.5;
    const bar = Math.max(0.5, size * BAR_FRAC);

    // horizontaal + verticaal gecentreerd rond (cx, cy)
    rect(cx - half, cy - bar * 0.5, size, bar);   // horizontale arm
    rect(cx - bar * 0.5, cy - half, bar, size);   // verticale arm
  }
}

// ====== SCANNING HELPERS ======

function isInkRowKernel(g, x, y, halfK){
  // check a small vertical window around y; returns true if any pixel is ink
  const yi = y | 0;
  for (let ky = -halfK; ky <= halfK; ky++){
    const yy = yi + ky;
    if (yy < 0 || yy >= g.height) continue;
    const idx = 4 * (yy * g.width + (x | 0));
    if (g.pixels[idx] < INK_THRESHOLD) return true;
  }
  return false;
}

function scanRowInRange(g, y, x1, x2, halfKernel){
  // Returns [ [start, endExclusive], ... ] across [x1,x2]
  const spans = [];
  const yi = Math.max(0, Math.min(g.height - 1, y | 0));
  const xmin = Math.max(0, x1 | 0);
  const xmax = Math.min(g.width - 1, x2 | 0);
  let inside = false, start = 0, gap = 0;
  for (let x = xmin; x <= xmax; x++){
    const on = isInkRowKernel(g, x, yi, halfKernel);
    if (on){
      if (!inside){ inside = true; start = x; gap = 0; } else gap = 0;
    } else if (inside){
      gap++;
      if (gap > BRIDGE_PIXELS){
        const e = x - gap; 
        if (e >= start){
          if ((e + 1 - start) >= MIN_RUN_PX_BUFFER) spans.push([start, e + 1]);
        }
        inside = false; gap = 0;
      }
    }
  }
  if (inside){
    const e = xmax;
    if ((e + 1 - start) >= MIN_RUN_PX_BUFFER) spans.push([start, e + 1]);
  }
  return spans;
}

// Robust vertical bounds: require a minimum continuous run length across the word
function measureInkVerticalBoundsRobust(g, x1 = 0, x2 = null){
  if (x2 == null) x2 = g.width - 1;
  const xmin = Math.max(0, Math.floor(x1));
  const xmax = Math.min(g.width - 1, Math.ceil(x2));
  const spanW = Math.max(1, xmax - xmin + 1);
  const minCover = Math.max(1, Math.round(spanW * BAND_MIN_COVER_FRAC));
  g.loadPixels();
  let top = g.height, bot = -1;
  for (let y = 0; y < g.height; y++){
    let best = 0, run = 0, gap = 0; // allow tiny bridges like scanRowInRange
    for (let x = xmin; x <= xmax; x++){
      const idx = 4 * (y * g.width + x);
      const on = g.pixels[idx] < INK_THRESHOLD;
      if (on){
        if (gap > 0 && gap <= BRIDGE_PIXELS){ run += gap; gap = 0; }
        run++;
      } else {
        if (run > 0){ if (run > best) best = run; run = 0; }
        gap++;
        if (gap > BRIDGE_PIXELS) gap = 0;
      }
    }
    if (run > best) best = run; // flush tail
    if (best >= minCover){
      if (y < top) top = y;
      if (y > bot) bot = y;
    }
  }
  if (bot < 0) return { top: 0, bot: g.height - 1 };
  return { top, bot };
}

// ====== LAYOUT PIPELINE ======
function buildLayout(word, rowsCount = rows){
  // 1) Create offscreen buffer with no smoothing (hard edges for scanning)
  if (!glyphBuffer){
    glyphBuffer = createGraphics(BUFFER_W, BUFFER_H);
    glyphBuffer.pixelDensity(1);
    glyphBuffer.noSmooth();
  }
  glyphBuffer.push();
  glyphBuffer.noSmooth(); //?
  glyphBuffer.background(255);
  glyphBuffer.fill(0);
  glyphBuffer.noStroke();

  // 2) Compute per-letter SVG layout and draw
  const up = word.split('').map(c => c.toUpperCase());
  const naturalDims = up.map(ch => glyphDims[ch] || { w: 0, h: 0 });
  const maxH = Math.max(1, ...naturalDims.map(d => d.h));
  const sumW = naturalDims.reduce((s,d) => s + d.w, 0);
  const sH = BUFFER_H / maxH;
  const sW = BUFFER_W / Math.max(1, sumW);
  const scaleUniform = Math.min(sH, sW, 1.0);

  // Compute total scaled width and start X for centering (NO gaps in buffer)
  const letterWidths = naturalDims.map(d => d.w * scaleUniform);
  const totalWLetters = letterWidths.reduce((a,b)=>a+b,0);
  // GAP DOES NOT AFFECT BUFFER DRAWING — keep buffer tight to letters only
  const totalW = totalWLetters;
  const startX = (BUFFER_W - totalW) * 0.5;

  // Vertical center
  const yTop = (BUFFER_H - maxH * scaleUniform) * 0.5;

  // Draw each SVG at pen position, NO gap added in buffer
  const letterX = [];
  let pen = startX;
  up.forEach((ch, i) => {
    letterX.push(pen);
    const img = glyphImgs[ch];
    const dims = naturalDims[i];
    if (img && dims.w > 0 && dims.h > 0){
      const w = dims.w * scaleUniform;
      const h = dims.h * scaleUniform;
      glyphBuffer.image(img, pen, yTop, w, h);
      pen += w;
    } else {
      const w = 40 * scaleUniform; pen += w;
    }
  });
  glyphBuffer.pop();
  glyphBuffer.loadPixels();

  // 4) Prepare vertical scan band (robust): measure actual ink bounds instead of trusting font metrics
  const { top: inkTop, bot: inkBot } = measureInkVerticalBoundsRobust(
    glyphBuffer,
    Math.floor(startX),
    Math.ceil(startX + totalW) - 1
  );
  let bandTop = Math.max(0, inkTop);
  let bandBot = Math.min(BUFFER_H - 1, inkBot);
  if (bandTop > bandBot){ const t = bandTop; bandTop = bandBot; bandBot = t; }

  const bandH = Math.max(1, bandBot - bandTop);
  const halfKernel = Math.max(1, Math.round(bandH * ROW_KERNEL_Y_FRAC));

  const rowsY = [];

  if (rowsCount <= 1){
    rowsY.push( (bandTop + bandBot) * 0.5 );
  } else {
    for (let r = 0; r < rowsCount; r++){
      rowsY.push( lerp(bandTop, bandBot, r / (rowsCount - 1)) ); // hits both ends
    }
  }

  // 5) Build letter ranges and scan per row
  const ranges = letterWidths.map((w, i) => ({ x1: Math.floor(letterX[i]), x2: Math.ceil(letterX[i] + w) - 1 }));
  const lettersOrder = [...word];
  const perLetter = {}; lettersOrder.forEach(ch => perLetter[ch] = Array.from({length: rowsCount}, () => []));

  for (let r = 0; r < rowsCount; r++){
    const y = rowsY[r];
    for (let li = 0; li < ranges.length; li++){
      const { x1, x2 } = ranges[li];
      const spans = scanRowInRange(glyphBuffer, y, x1, x2, halfKernel);
      for (const [s, e] of spans){
        const rightRel = (e - 1) - x1; // right edge relative to letter start
        const runLen   = (e - s);      // black run length from right → left
        perLetter[word[li]][r].push({ rightRel, runLen });
      }
    }
  }

  // 6) Map to output canvas coordinates (non-uniform: width locked, height stretches)
  const scale    = LOGO_TARGET_W / Math.max(1, totalW);
  const rowPitch = baseRowPitch; // vast; onafhankelijk van viewport

  return {
    letters: perLetter,
    lettersOrder,
    letterX: letterX.map((x, i) =>
      (x - startX) * scale + (i * gapPx * scale)
    ),
    letterW: letterWidths,
    scale,
    rowPitch,
    rowsY,
    ranges
  };
}

// ====== DEBUG OVERLAY ======
function drawdebugModeOverlay(){
  push();
  noFill(); stroke(0, 60); strokeWeight(1);

  // Reuse the exact same fit math as the renderer
  const fit = computeLayoutFit();
  const { rowPitchNow, leftmost, contentW0, contentH0 } = fit;

  // Compute scale s as before
  const innerW = Math.max(1, width);
  const innerH = Math.max(1, height);
  const refW   = Math.max(1, targetContentW || contentW0);
  const sBase  = innerW / refW;
  const s      = Math.max(0.01, sBase * FIT_FRACTION * logoScaleMul);

  // Provisional centering only for mouse mapping in layout coords
  const txProvisional = (innerW - s * contentW0) * 0.5 - s * leftmost;
  const tyProvisional = (innerH - s * contentH0) * 0.5;
  const localMouseX0    = activeLocalMouseX(txProvisional, s, leftmost, leftmost + contentW0);

  // Adjusted positions for boxes using pass0
  let adjDbg = computeAdjustedLetterPositions(localMouseX0, contentW0);
  let boxesLeft = adjDbg.adjX;
  let boxesW    = adjDbg.wUse;

  // Compute adjusted bounds and final centering
  const start = Math.min(...boxesLeft);
  const end   = Math.max(...boxesLeft.map((x,i)=> x + boxesW[i]));
  const txAdj = (innerW - s * Math.max(1, end - start)) * 0.5 - s * start;
  const tyAdj = tyProvisional;

  // Final mouse mapping with adjusted centering and recompute boxes (pass1)
  const localMouseX_dbg = activeLocalMouseX(txAdj, s, start, end);
  adjDbg = computeAdjustedLetterPositions(localMouseX_dbg, contentW0);
  boxesLeft = adjDbg.adjX;
  boxesW    = adjDbg.wUse;

  // Now apply transform
  translate(txAdj, tyAdj);
  scale(s, s);

  const totalH = (rows <= 1) ? 0 : (rows - 1) * rowPitchNow;
  stroke(0,160);
  for (let i = 0; i < boxesLeft.length; i++){
    rect(boxesLeft[i], 0, boxesW[i], totalH);
  }

  // row guides spanning the original bounds
  stroke(0, 60);
  for (let r = 0; r < rows; r++){
    const y = (rowYsCanvas[r] !== undefined)
      ? rowYsCanvas[r]
      : (rows <= 1 ? 0 : r * rowPitchNow);
    line(start, y, end, y);
  }
  pop();
}

function computeXShift(r, rows, displaceGroups){
  const groupsAbs = Math.max(1, Math.abs(displaceGroups));
  const gsize = Math.max(1, Math.floor(rows / groupsAbs));
  const sectionIndex = Math.floor(r / gsize) % groupsAbs;
  const centered = sectionIndex - (groupsAbs - 1) * 0.5;
  const sign = Math.sign(displaceGroups) || 1;
  return sign * centered * DISPLACE_UNIT;
}

function fitViewportToWindow(){
  if (!mainCanvas || !mainCanvas.elt) return;
  const stage = document.getElementById('stage');
  const wrap  = document.getElementById('canvasWrap');
  if (!stage || !wrap) return;

  // beschikbare ruimte
  const availW = Math.max(100, stage.clientWidth);
  const availH = Math.max(100, stage.clientHeight);

  let boxW, boxH;
  if (FIT_MODE) {
    // Vul de hele stage, negeer aspect ratio
    boxW = availW;
    boxH = availH;
  } else {
    const targetW = availH * (ASPECT_W / ASPECT_H);
    if (targetW <= availW) {
      boxH = availH;
      boxW = Math.round(targetW);
    } else {
      boxW = availW;
      boxH = Math.round(availW * (ASPECT_H / ASPECT_W));
    }
  }

  // CSS wrapper size
  wrap.style.width  = boxW + 'px';
  wrap.style.height = boxH + 'px';

  // p5-canvas buffer precies even groot maken als de wrapper
  if (width !== boxW || height !== boxH){
    resizeCanvas(boxW, boxH, true);
    layout = buildLayout(LOGO_TEXT, rows);
  }

  // Ensure the underlying SVG element uses the same intrinsic size (no CSS scaling)
  const svg = mainCanvas.elt;
  if (svg && svg.tagName && svg.tagName.toLowerCase() === 'svg'){
    svg.setAttribute('width', String(boxW));
    svg.setAttribute('height', String(boxH));
    svg.setAttribute('viewBox', `0 0 ${boxW} ${boxH}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  requestRedraw();
}
// ====== INPUT → REDRAW ======
function mouseMoved(){
  // Re-render when the mouse moves so per-letter stretch updates
  requestRedraw();
}
function mouseDragged(){
  requestRedraw();
}
function touchMoved(){
  requestRedraw();
  return false; // prevent default scrolling on touch devices
}
function applyWarpToCanvas(){
  if (!WARP_ON) return;
  const w = width | 0, h = height | 0;
  if (w <= 0 || h <= 0) return;

  // Snapshot current canvas
  const src = get(); // p5.Image of the whole canvas

  // Clear canvas and redraw warped columns
  push();
  background(color1);
  const A   = WARP_AMP_PX;
  const L   = Math.max(1, WARP_WAVELEN_PX);
  const T   = Math.max(0.05, WARP_PERIOD_S);
  const t   = (ANIM_MODE !== 'off') ? (animTime % T) : 0;
  const col = Math.max(1, WARP_COL_W | 0);

  for (let x = 0; x < w; x += col){
    const phase = ( (x / L) * TWO_PI ) + ( (t / T) * TWO_PI );
    const dy = Math.sin(phase) * A;
    const sw = Math.min(col, w - x);
    // draw this vertical slice shifted in Y; p5 handles clipping
    image(src, x, dy, sw, h,  x, 0, sw, h);
  }
  pop();
}