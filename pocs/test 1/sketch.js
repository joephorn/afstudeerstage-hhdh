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
const BASE_LINE_FRAC      = 2;

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
let elTaper, elBase, elDebug, elAuto;
let elTipRatio, elEndRatio, elTipOut, elEndOut;
let gapPx = 9;
let displaceGroups = 2;
let taperMode = 'rounded';
let debugMode = false;
let showBaseLines = false;
let widthScale = 1.1;
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
let autoTimer = null;
function setAuto(on){
  if (autoTimer){ clearInterval(autoTimer); autoTimer = null; }
  if (on){
    autoTimer = setInterval(()=>{ applyRandomTweaks(); }, RANDOM_INTERVAL_MS);
  }
}

let rowYsCanvas = []; // y-position of each row in canvas coordinates

// === Preview vs Export ===
let isExport = false;
let _needsRedraw = false;
function requestRedraw(){
  if (_needsRedraw) return;
  _needsRedraw = true;
  requestAnimationFrame(()=>{
    _needsRedraw = false;
    redraw();
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
  requestRedraw();
  return true;
}

function preload(){
  const uniq = Array.from(new Set(LOGO_TEXT.split('').map(c => c.toUpperCase())));
  uniq.forEach(ch => {
    const p = LETTERS_PATH + ch + '.svg';
    glyphImgs[ch] = loadImage(p, img => { glyphDims[ch] = { w: img.width, h: img.height }; }, err => console.error('Failed to load', p, err));
  });
}

function setup(){
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
  elBase      = byId('baseLines');
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
  elDebug.checked = debugMode;
  elAuto.checked = false;
  if (elBase) {
    elBase.checked = showBaseLines;
    elBase.addEventListener('change', ()=>{
      showBaseLines = elBase.checked;
      requestRedraw();
    });
  }
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
      // drive viewport ratio from these pixels
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
  if (elEndRatio){
    elEndRatio.value = END_RATIO;
    if (elEndOut) elEndOut.textContent = Number(END_RATIO).toFixed(2);
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
  if (elEndRatio){
    elEndRatio.addEventListener('input', ()=>{
      END_RATIO = Math.max(0, Math.min(1, parseFloat(elEndRatio.value)));
      if (elEndOut) elEndOut.textContent = Number(END_RATIO).toFixed(2);
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

  // Optional base lines: straight guide rows across the full screen width
  if (showBaseLines){
    g.push();
    g.noStroke();
    g.fill(0, 0, 0, 30); // light gray base

    // Compute full-screen span in *local* coords (after translate/scale)
    const innerW = Math.max(1, width);
    const innerH = Math.max(1, height);
    const refW   = Math.max(1, targetContentW || contentW0);
    const sBase  = innerW / refW;
    const s      = Math.max(0.01, sBase * FIT_FRACTION * logoScaleMul);

    // tx is same as computed above; we recompute the same math here for clarity
    const tx = (innerW - s * contentW0) * 0.5 - s * leftmost;

    const fullLeft  = -tx / s;
    const fullRight = (innerW - tx) / s;
    const baseW = Math.max(0, fullRight - fullLeft);

    const baseH = BASE_LINE_FRAC;
    for (let r = 0; r < rows; r++){
      const y = rowYsCanvas[r];
      g.rect(fullLeft, y - baseH * 0.5, baseW, baseH);
    }
    g.pop();
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
        const rx = rightEdgeX + xShift;
        switch (taperMode) {
          case 'straight':
            drawStraightTaper(g, rx, y, dashLenClamped, linePx);
            break;
          case 'circles':
            drawCircleTaper(g, rx, y, dashLenClamped, linePx, TIP_RATIO, END_RATIO);
            break;
          case 'blocks':
            drawBlockTaper(g, rx, y, dashLenClamped, linePx, TIP_RATIO, END_RATIO);
            break;
          case 'pluses':
            drawPlusTaper(g, rx, y, dashLenClamped, linePx, TIP_RATIO, END_RATIO);
            break;
          case 'rounded':
          default:
            drawRoundedTaper(g, rx, y, dashLenClamped, linePx, TIP_RATIO, END_RATIO);
            break;
        }
      }
    }
  }
  g.pop();
}

function draw(){
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

  const steps = 14; // more steps = smoother arc

  g.beginShape();
  for (let i = 0; i <= steps; i++){
    const a = -HALF_PI + (i/steps) * PI;
    g.vertex(bigX + R * Math.cos(a), cy + R * Math.sin(a));
  }
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

function drawCircleTaper(g, rightX, cy, len, h, tipRatio = TIP_RATIO, endRatio = END_RATIO){
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
    g.circle(cx, cy, Math.max(0.0001, rad * 2));
  }
}

function drawBlockTaper(g, rightX, cy, len, h, tipRatio = TIP_RATIO, endRatio = END_RATIO){
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

  g.push();

  // Draw the cap on the right first
  g.fill(0, 0, 0, 255);
  g.rect(xCapL, yCap, capLen, capH);

  // Now march leftwards from the left edge of the cap
  let rightEdge = xCapL;
  for (let i = 0; i < steps; i++){
    const frac = (steps === 1) ? 0 : (i / (steps - 1)); // 0 at rightmost block, 1 at leftmost
    const w = widthAt(frac);
    const hi = heightAt(frac);
    const yTop = cy - hi * 0.5;
    const xL = rightEdge - w;   // touch the previous element
    const alpha = Math.floor(255 - (255 - 80) * frac); // darker → lighter
    g.fill(0, 0, 0, alpha);
    g.rect(xL, yTop, w, hi);
    rightEdge = xL; // continue left
  }

  g.pop();
}

function drawPlusTaper(g, rightX, cy, len, h, tipRatio = TIP_RATIO, endRatio = END_RATIO){
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

  g.fill(0); // volle zwart, geen opacity verloop
  for (let i = 0; i < n; i++){
    const t = (n === 1) ? 0 : i / (n - 1); // 0 = rechts, 1 = links
    const cx = lerp(xRight, xLeft, t);
    const size = lerp(Hbig, Hsmall, t);
    const half = size * 0.5;
    const bar = Math.max(0.5, size * BAR_FRAC);

    // horizontaal + verticaal gecentreerd rond (cx, cy)
    g.rect(cx - half, cy - bar * 0.5, size, bar);   // horizontale arm
    g.rect(cx - bar * 0.5, cy - half, bar, size);   // verticale arm
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

  requestRedraw();
}