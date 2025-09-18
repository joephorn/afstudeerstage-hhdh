// ====== CONFIG ======
const LOGO_TEXT         = "ALBION";
const ROWS_DEFAULT      = 12;
const LINE_HEIGHT       = 8;
let TIP_RATIO           = 0.3; // small (tip) cap radius factor relative to big cap (0..1)
let END_RATIO           = 1.0; // big (end) cap radius factor relative to h/2 (0..1)
let DISPLACE_UNIT       = 20;
let ASPECT_W = 16;
let ASPECT_H = 9;
let LOGO_TARGET_W = 0;
let FIT_MODE = false;
const FIT_FRACTION = 0.75;

// Scan behavior
const BRIDGE_PIXELS     = 0;         // hoger = betere performance, minder acuraat
const INK_THRESHOLD     = 140; // KAN WEG // GWN IN CODE ZETTEN?
const BAND_MIN_COVER_FRAC = 0.035; // ≥3.5% of word width must be continuous ink for a row to count

// Row sampling kernel (vertical) in the glyph buffer
const ROW_KERNEL_Y_FRAC = 0.015; // % van bandhoogte → 1–3px meestal
const MIN_RUN_PX_BUFFER = 0;     // filter micro-runs die ruis veroorzaken

// Offscreen buffer + auto-fit targets
const BUFFER_W          = 2600;
const BUFFER_H          = 700;

const LETTERS_PATH      = './src/letters/';
let glyphImgs = {};   // map: char -> p5.Image (SVG rasterized)
let glyphDims = {};   // map: char -> {w,h}

// ====== STATE ======
let glyphBuffer;      // offscreen p5.Graphics used for scanning
let layout;           // computed positions + spans
let rows = ROWS_DEFAULT;
let linePx = LINE_HEIGHT;
// HTML UI elements (wired via index.html)
let elRows, elThickness, elWidth, elGap, elGroups, elDispUnit, elPreset, elLogoScale, elAspectW, elAspectH, elCustomAR;
let elRowsOut, elThicknessOut, elWidthOut, elGapOut, elDispUnitOut, elGroupsOut, elLogoScaleOut;
let elRounded, elDebug, elAuto;
let elTipRatio, elEndRatio, elTipOut, elEndOut;
let gapPx = 5;
let displaceGroups = 2;
let roundedEdges = true;
let debugMode = false;
let widthScale = 0.96;            // global X-stretch factor applied to rightRel and runLen
let logoScaleMul = 1.0;

let baseRowPitch;
let targetContentH = null; // stays constant; rows change will shrink/grow pitch to keep this height
let targetContentW = null; // fixed reference width for scaling (decouples scale from width/gap)
let EXPORT_W = null; // when preset = custom, desired pixel width
let EXPORT_H = null; // when preset = custom, desired pixel height

// random animate
let lastAutoRandomMs = 0;
const RANDOM_INTERVAL_MS = 1000;
let autoRandomActive = false;

let rowYsCanvas = []; // y-position of each row in canvas coordinates

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

  // Width (% → scale)
  if (elWidth) mutators.push(()=>{
    const wPerc = randFromInputFloat(elWidth, 50, 300, 1);
    widthScale = Math.max(0.05, wPerc / 100);
    elWidth.value = Math.round(widthScale * 100);
    if (elWidthOut) elWidthOut.textContent = `${Math.round(widthScale * 100)} %`;
  });

  // Gap (px) — mag negatief
  if (elGap) mutators.push(()=>{
    gapPx = randFromInputInt(elGap, -100, 150, 1);
    elGap.value = gapPx;
    if (elGapOut) elGapOut.textContent = `${gapPx} px`;
  });

  // Line thickness (px)
  if (elThickness) mutators.push(()=>{
    linePx = randFromInputInt(elThickness, 1, 25, 1);
    elThickness.value = linePx;
    if (elThicknessOut) elThicknessOut.textContent = `${linePx} px`;
  });

  // Displacement groups (signed divisors)
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

  // Displacement unit (px per step)
  if (elDispUnit) mutators.push(()=>{
    DISPLACE_UNIT = randFromInputInt(elDispUnit, 0, 80, 1);
    elDispUnit.value = DISPLACE_UNIT;
    if (elDispUnitOut) elDispUnitOut.textContent = `${DISPLACE_UNIT} px`;
  });

  // Tip ratio (0..1)
  if (elTipRatio) mutators.push(()=>{
    TIP_RATIO = randFromInputFloat(elTipRatio, 0, 1, 0.01);
    elTipRatio.value = TIP_RATIO.toFixed(2);
    if (elTipOut) elTipOut.textContent = TIP_RATIO.toFixed(2);
  });

  // End ratio (0..1)
  if (elEndRatio) mutators.push(()=>{
    END_RATIO = randFromInputFloat(elEndRatio, 0, 1, 0.01);
    elEndRatio.value = END_RATIO.toFixed(2);
    if (elEndOut) elEndOut.textContent = END_RATIO.toFixed(2);
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
  redraw();
  return true;
}

function autoRandomizeTick(){
  if (!autoRandomActive) return;
  const now = millis();
  if (now - lastAutoRandomMs >= RANDOM_INTERVAL_MS){
    lastAutoRandomMs = now;
    applyRandomTweaks();
  }
}

function preload(){
  const uniq = Array.from(new Set(LOGO_TEXT.split('').map(c => c.toUpperCase())));
  uniq.forEach(ch => {
    const p = LETTERS_PATH + ch + '.svg';
    glyphImgs[ch] = loadImage(p, img => { glyphDims[ch] = { w: img.width, h: img.height }; }, err => console.error('Failed to load', p, err));
  });
}

function setup(){
  mainCanvas = createCanvas(800, 250, SVG);
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
  // Lock initial content width so later width/gap tweaks don't change overall scale
  const initFit = computeLayoutFit();
  if (targetContentW == null) targetContentW = initFit.contentW0;
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
  elRounded   = byId('rounded');
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
  elEndRatio = byId('endRatio');
  elTipOut   = byId('tipOut');
  elEndOut   = byId('endOut');
  elAspectW  = byId('aspectW');
  elAspectH  = byId('aspectH');
  elCustomAR = byId('customAR');

  // initialize values to current state
  elRows.value = rows;
  elThickness.value = linePx;
  elWidth.value = Math.round(widthScale * 100);
  elGap.value = gapPx;
  elRounded.checked = roundedEdges;
  elDebug.checked = debugMode;
  elAuto.checked = false;
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
        redraw();
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
          redraw();
        }
      }
    });
  }

  function updateCustomResolutionAndAspect(){
    const w = parseInt(elAspectW && elAspectW.value, 10);
    const h = parseInt(elAspectH && elAspectH.value, 10);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0){
      EXPORT_W = w; EXPORT_H = h;
      // drive viewport ratio from these pixels
      ASPECT_W = w; ASPECT_H = h;
      fitViewportToWindow();
      redraw();
    }
  }

  if (elAspectW) elAspectW.addEventListener('input', ()=>{ if (elPreset && elPreset.value === 'custom') updateCustomResolutionAndAspect(); });
  if (elAspectH) elAspectH.addEventListener('input', ()=>{ if (elPreset && elPreset.value === 'custom') updateCustomResolutionAndAspect(); });
  if (elLogoScale){
    elLogoScale.addEventListener('input', ()=>{
      const perc = Math.max(10, Math.min(200, parseInt(elLogoScale.value, 10) || 100));
      logoScaleMul = perc / 100;
      if (elLogoScaleOut) elLogoScaleOut.textContent = `${perc} %`;
      layout = buildLayout(LOGO_TEXT, rows);
      redraw();
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
  if (elEndRatio){
    elEndRatio.value = END_RATIO;
    if (elEndOut) elEndOut.textContent = Number(END_RATIO).toFixed(2);
  }
  if (elDispUnit){
    elDispUnit.addEventListener('input', ()=>{
      DISPLACE_UNIT = parseInt(elDispUnit.value, 10) || 0;
      if (elDispUnitOut) elDispUnitOut.textContent = `${DISPLACE_UNIT} px`;
      redraw();
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
    redraw();
  });

  elThickness.addEventListener('input', ()=>{
    linePx = parseInt(elThickness.value,10);
    if (elThicknessOut) elThicknessOut.textContent = `${linePx} px`;
    redraw();
  });

  elWidth.addEventListener('input', ()=>{
    widthScale = parseInt(elWidth.value,10) / 100;
    if (elWidthOut) elWidthOut.textContent = `${Math.round(widthScale * 100)} %`;
    redraw();
  });

  elGap.addEventListener('input', ()=>{
    gapPx = parseInt(elGap.value,10);
    if (elGapOut) elGapOut.textContent = `${gapPx} px`;
    layout = buildLayout(LOGO_TEXT, rows);
    redraw();
  });

  elGroups.addEventListener('input', ()=>{
    const idx = parseInt(elGroups.value,10) || 0;
    displaceGroups = _signedGroupOptions[idx] || 1; // gesigneerd
    const groupsAbs = Math.max(1, Math.abs(displaceGroups));
    if (elGroupsOut) elGroupsOut.textContent = String(displaceGroups);
    redraw();
  });

  if (elTipRatio){
    elTipRatio.addEventListener('input', ()=>{
      TIP_RATIO = Math.max(0, Math.min(1, parseFloat(elTipRatio.value)));
      if (elTipOut) elTipOut.textContent = Number(TIP_RATIO).toFixed(2);
      redraw();
    });
  }
  if (elEndRatio){
    elEndRatio.addEventListener('input', ()=>{
      END_RATIO = Math.max(0, Math.min(1, parseFloat(elEndRatio.value)));
      if (elEndOut) elEndOut.textContent = Number(END_RATIO).toFixed(2);
      redraw();
    });
  }

  elRounded.addEventListener('change', ()=>{
    roundedEdges = elRounded.checked;
    redraw();
  });

  elDebug.addEventListener('change', ()=>{
    debugMode = elDebug.checked;
    redraw();
  });

  elAuto.addEventListener('change', ()=>{
    autoRandomActive = elAuto.checked;
    lastAutoRandomMs = millis();
    if (autoRandomActive) { loop(); } else { noLoop(); redraw(); }
  });

  if (elCustomAR) elCustomAR.style.display = (elPreset && elPreset.value === 'custom') ? '' : 'none';
  FIT_MODE = (elPreset && elPreset.value === 'fit');
  fitViewportToWindow();
  redraw();
  if (elPreset && elPreset.value === 'custom') updateCustomResolutionAndAspect();
  noLoop();
  redraw();
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

function renderLogo(g){
  g.push();
  g.background(255);
  g.fill(0); g.noStroke();

  const fit = computeLayoutFit();
  const { tEff, rowPitchNow, leftmost, contentW0, contentH0 } = fit;

  // Scale based on a fixed reference width: contain-by-width at startup × slider
  const innerW = Math.max(1, width);
  const refW   = Math.max(1, targetContentW || contentW0);
  const sBase  = innerW / refW;
  const s      = Math.max(0.01, sBase * FIT_FRACTION * logoScaleMul);

  // Center using the *current* content bounds so it stays centered as width/gap change
  const innerH = Math.max(1, height);
  const tx = (innerW - s * contentW0) * 0.5 - s * leftmost;
  const ty = (innerH - s * contentH0) * 0.5;

  g.translate(tx, ty);
  g.scale(s, s);

  // Ensure row Y positions are defined for all rows to avoid NaN in SVG paths
  if (rows <= 1){
    rowYsCanvas = [0];
  } else {
    // Use row centers spaced by rowPitchNow (top at 0), offset by linePx*0.5 for centering within stroked envelope
    rowYsCanvas = Array.from({ length: rows }, (_, r) => r * rowPitchNow + linePx * 0.5);
  }

  // Use original SVG letter positions (no offsets)
  for (let li = 0; li < layout.lettersOrder.length; li++){
    const letterKey   = layout.lettersOrder[li];
    const baseX = layout.letterX[li] * tEff;
    const rowsArr = layout.letters[letterKey];

    for (let r = 0; r < rowsArr.length; r++){
      const y = rowYsCanvas[r];
      for (const span of rowsArr[r]){
        const rightEdgeX = baseX + span.rightRel * layout.scale * widthScale; // global X-stretch
        const baseLen    = Math.max(0, span.runLen * layout.scale * widthScale); // stretch dash lengths too
        // Clamp dash length to the letter’s left edge (no wider than SVG envelope)
        const maxDash = Math.max(0, rightEdgeX - baseX);
        const dashLenClamped = Math.min(baseLen, maxDash);
        const xShift = computeXShift(r, rows, displaceGroups);
        if (roundedEdges) {
          drawRoundedTaper(g, rightEdgeX + xShift, y, dashLenClamped, linePx, TIP_RATIO, END_RATIO);
        } else {
          drawStraightTaper(g, rightEdgeX + xShift, y, dashLenClamped, linePx);
        }
      }
    }
  }
  g.pop();
}

function draw(){
  autoRandomizeTick();
  background(255);
  noStroke();
  renderLogo(this);
  if (debugMode) drawdebugModeOverlay();
}

// ====== DRAWING ======

function drawRoundedTaper(g, rightX, cy, len, h, tipRatio = TIP_RATIO, endRatio = END_RATIO){
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

  const steps = 12; // more steps = smoother arc

  g.beginShape();
  // Big cap: -90° → +90°
  for (let i = 0; i <= steps; i++){
    const a = -HALF_PI + (i/steps) * PI;
    g.vertex(bigX + R * Math.cos(a), cy + R * Math.sin(a));
  }
  // Small cap: +90° → +270° (same winding, opposite side)
  for (let i = 0; i <= steps; i++){
    const a = HALF_PI + (i/steps) * PI;
    g.vertex(tipX + r * Math.cos(a), cy + r * Math.sin(a));
  }
  g.endShape(CLOSE);
}

function drawStraightTaper(g, rightX, cy, len, h){
  const R = h * 0.5;
  const bigX = rightX - R;
  const centerSep = Math.max(0, len - R); // r=0 for straight tip
  const tipX = bigX - centerSep;

  g.beginShape();
  g.vertex(bigX, cy - R);
  g.vertex(tipX, cy);
  g.vertex(bigX, cy + R);
  g.endShape(CLOSE);
}

function drawCircleTaper(){

}

function drawBlockTaper(){
  
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

  // Fixed reference width for scale; center from current bounds
  const innerW = Math.max(1, width);
  const innerH = Math.max(1, height);
  const refW   = Math.max(1, targetContentW || contentW0);
  const sBase  = innerW / refW;
  const s      = Math.max(0.01, sBase * FIT_FRACTION * logoScaleMul);

  const tx = (innerW - s * contentW0) * 0.5 - s * leftmost;
  const ty = (innerH - s * contentH0) * 0.5;
  translate(tx, ty);
  scale(s, s);

  // letter boxes based on original SVG layout
  const tEff2 = 1 + (widthScale - 1);
  const boxesLeft = layout.letterX.map(x => x * tEff2);
  const boxesW    = layout.letterW.map(w => w * layout.scale * widthScale);
  const start = Math.min(...boxesLeft);
  const end   = Math.max(...boxesLeft.map((x,i)=> x + boxesW[i]));
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
      : (rows <= 1 ? 0 : r * rowPitchNow + linePx * 0.5);
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

  redraw();
}