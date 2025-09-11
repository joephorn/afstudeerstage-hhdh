// ====== CONFIG ======
const LOGO_TEXT         = "ALBION";
const ROWS_DEFAULT      = 12;
const LINE_HEIGHT       = 8;
const TIP_RATIO         = 0.3;
const PADDING           = 40;        // canvas padding
const DISPLACE_UNIT     = 20;        // px per row step for displacement
const LEN_SCALE_STRENGTH = 1;     // 0..1 — hoeveel van (widthSetting-1) wordt toegepast op lange runs (lager = minder snel meeschalen)
const TRACK_STRENGTH    = 1;    // meeschalen van lange lijnen (horizontaal)
const SMALL_LEN_BIAS    = 1;    // meeschalen van korte lijnen (verticaal)
const VIEW_SCALE        = 0.8;   // visual CSS scale of the canvas (no change to drawing scale)

// Scan behavior
const BRIDGE_PIXELS     = 0;         // allow bridging small white gaps (0 = off)
const INK_THRESHOLD     = 140;
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
let rows = ROWS_DEFAULT;          // number of horizontal scan rows
let linePx = LINE_HEIGHT;         // stroke thickness in px
// HTML UI elements (wired via index.html)
let elRows, elThickness, elWidth, elGap, elGroups, elGroupsOut;
let elRowsOut, elThicknessOut, elWidthOut, elGapOut;
let elRounded, elDebug, elAuto;
let gapPx = 5;                    // letter gap in px (can be negative)
let displaceGroupSize = 3;        // derived: rows / |displaceGroups|
let displaceGroups = 2;           // signed: negative flips direction
let roundedEdges = true;
let debugMode = false;
let widthScale = 0.96;            // overall width scaling factor
let minDashLenPx = 65;            // threshold for “long run” behaviour

let baseRowPitch;

// random animate
let lastAutoRandomMs = 0;
const RANDOM_INTERVAL_MS = 1000;
let autoRandomActive = false;

let rowYsCanvas = []; // y-position of each row in canvas coordinates

function desiredCanvasHeight(){
  return Math.ceil(PADDING * 2 + baseRowPitch * rows);
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

function applyOneRandomTweak(){
  // Randomize ALL relevant controls based on their actual input ranges

  // 1) Width (percent slider → 0.xx scale)
  if (elWidth){
    const wPerc = randFromInputFloat(elWidth, 50, 300, 1); // fallback matches index.html defaults
    widthScale = Math.max(0.05, wPerc / 100);
    elWidth.value = Math.round(widthScale * 100);
    if (elWidthOut) elWidthOut.textContent = `${Math.round(widthScale * 100)} %`;
  }

  // 2) Gap (px) — allow negatives if the input allows it
  let layoutNeedsRebuild = false;
  if (elGap){
    gapPx = randFromInputInt(elGap, -100, 150, 1);
    elGap.value = gapPx;
    if (elGapOut) elGapOut.textContent = `${gapPx} px`;
    layoutNeedsRebuild = true; // gap affects buildLayout letter positions
  }

  // 3) Line height (px)
  if (elThickness){
    linePx = randFromInputInt(elThickness, 1, 25, 1);
    elThickness.value = linePx;
    if (elThicknessOut) elThicknessOut.textContent = `${linePx} px`;
  }

  // 4) Displacement groups (signed options derived from rows)
  // Use divisorsDescSigned so order matches the UI options
  let opts = divisorsDescSigned(rows);
  if (opts.length){
    let newIdx = randInt(0, opts.length - 1);
    const curIdx = Math.max(0, opts.indexOf(displaceGroups));
    if (opts.length > 1 && newIdx === curIdx) newIdx = (newIdx + 1) % opts.length;
    displaceGroups = opts[newIdx];
    const groupsAbs = Math.max(1, Math.abs(displaceGroups));
    displaceGroupSize = Math.max(1, Math.floor(rows / groupsAbs));
    if (elGroups){
      // keep slider in sync with the chosen option index
      elGroups.min = 0; elGroups.max = Math.max(0, opts.length - 1); elGroups.step = 1; elGroups.value = newIdx;
    }
    if (elGroupsOut) elGroupsOut.textContent = String(displaceGroups);
  }

  if (layoutNeedsRebuild){
    layout = buildLayout(LOGO_TEXT, rows);
  }
  redraw();
}

function autoRandomizeTick(){
  if (!autoRandomActive) return;
  const now = millis();
  if (now - lastAutoRandomMs >= RANDOM_INTERVAL_MS){
    lastAutoRandomMs = now;
    applyOneRandomTweak();
  }
}

// Helper to visually scale and center the canvas in the window via CSS (does not alter p5 width/height)
function fitCanvasToWindow(){
  const base = Math.min(windowWidth / width, windowHeight / height);
  const s    = base * VIEW_SCALE;
  const cssW = Math.max(1, Math.floor(width  * s));
  const cssH = Math.max(1, Math.floor(height * s));
  const left = Math.floor((windowWidth  - cssW) * 0.5);
  const top  = Math.floor((windowHeight - cssH) * 0.5);

  const el = mainCanvas.elt;
  el.style.position = 'fixed';
  el.style.zIndex   = '0';
  el.style.width    = cssW + 'px';
  el.style.height   = cssH + 'px';
  el.style.left     = left + 'px';
  el.style.top      = top  + 'px';
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
  pixelDensity(1);
  baseRowPitch = (height - 2 * PADDING) / rows;
  noLoop();
  layout = buildLayout(LOGO_TEXT);
  resizeCanvas(width, desiredCanvasHeight(), true);

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

  // initialize values to current state
  elRows.value = rows;
  elThickness.value = linePx;
  elWidth.value = Math.round(widthScale * 100);
  elGap.value = gapPx;
  elRounded.checked = roundedEdges;
  elDebug.checked = debugMode;
  elAuto.checked = false;
  if (elRowsOut)      elRowsOut.textContent      = String(rows);
  if (elThicknessOut) elThicknessOut.textContent = `${linePx} px`;
  if (elWidthOut)     elWidthOut.textContent     = `${Math.round(widthScale * 100)} %`;
  if (elGapOut)       elGapOut.textContent       = `${gapPx} px`;

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
    displaceGroupSize = Math.max(1, Math.floor(rows / groupsAbs));
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
    displaceGroupSize  = Math.max(1, Math.floor(rows / groupsAbs));
    if (elGroupsOut) elGroupsOut.textContent = String(displaceGroups);
    redraw();
  });

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

  // keep canvas fitted on resize
  window.addEventListener('resize', fitCanvasToWindow);
  fitCanvasToWindow();

  noLoop();
  redraw();
}

// Compute the effective dash length for a span (same math as in renderLogo)
function dashLenForSpan(baseLen, maxRunLen){
  const eligible     = baseLen >= minDashLenPx;
  const lenBiasBase  = (maxRunLen > 0) ? (baseLen / maxRunLen) : 0;
  const lenBiasShort = SMALL_LEN_BIAS;
  const lenBias      = eligible ? lenBiasBase : lenBiasShort;
  return baseLen * (1 + (widthScale - 1) * lenBias * LEN_SCALE_STRENGTH);
}

// Measure per-letter bounds (visual left/right) using the same math as the renderer

function computePerLetterBounds(){
  const tEff = 1 + (widthScale - 1) * TRACK_STRENGTH;
  const letterLeft = new Array(layout.lettersOrder.length).fill(Infinity);
  const letterRight = new Array(layout.lettersOrder.length).fill(-Infinity);

  for (let li = 0; li < layout.lettersOrder.length; li++){
    const baseX = layout.letterX[li] * tEff; // tracking-applied start of letter box
    const letterKey = layout.lettersOrder[li];
    const rowsArr = layout.letters[letterKey];

    for (let r = 0; r < rowsArr.length; r++){
      const maxRunLen = maxRunLength(rowsArr[r]);
      const xShift = computeXShift(r, rows, displaceGroups);
      for (const seg of rowsArr[r]){
        const rightEdgeX = baseX + seg.rightRel * layout.scale * widthScale;
        const baseLen    = Math.max(0, seg.runLen * layout.scale);
        const dlen       = dashLenForSpan(baseLen, maxRunLen);
        const rightX     = rightEdgeX + xShift;
        const leftX      = rightX - dlen;
        if (leftX  < letterLeft[li])  letterLeft[li]  = leftX;
        if (rightX > letterRight[li]) letterRight[li] = rightX;
      }
    }
    // Fallback if a letter had no spans
    if (!isFinite(letterLeft[li]))  letterLeft[li]  = baseX;
    if (!isFinite(letterRight[li])) letterRight[li] = baseX;
  }
  return { tEff, letterLeft, letterRight };
}

function computeLayoutFit(){
  const tEff = 1 + (widthScale - 1) * TRACK_STRENGTH;
  const rowPitchNow = (rows <= 1)
    ? (height - 2 * PADDING)
    : (height - 2 * PADDING) / (rows - 1);

  let leftmost = Infinity;
  let rightmost = -Infinity;
  for (let li = 0; li < layout.lettersOrder.length; li++){
    const baseX = layout.letterX[li] * tEff;
    const letterKey = layout.lettersOrder[li];
    const rowsArr = layout.letters[letterKey];

    for (let r = 0; r < rowsArr.length; r++){
      const maxRunLen = maxRunLength(rowsArr[r]);
      const xShift = computeXShift(r, rows, displaceGroups);

      for (const seg of rowsArr[r]){
        const rightEdgeX = baseX + seg.rightRel * layout.scale * widthScale;
        const baseLen    = Math.max(0, seg.runLen * layout.scale);
        const dlen       = dashLenForSpan(baseLen, maxRunLen);
        const rightX     = rightEdgeX + xShift;
        const leftX      = rightX - dlen; // dash grows to the left
        if (leftX  < leftmost)  leftmost  = leftX;
        if (rightX > rightmost) rightmost = rightX;
      }
    }
  }

  if (!isFinite(leftmost)) leftmost = 0;
  if (!isFinite(rightmost)) rightmost = width - 2 * PADDING;

  const contentW0 = Math.max(1, rightmost - leftmost);
  const contentH0 = rows * rowPitchNow;

  const sFit = Math.min(
    (width  - 2) / contentW0,
    (height - 2) / contentH0,
    1
  );

  const contentW = contentW0 * sFit;
  const contentH = contentH0 * sFit;
  const left = (width  - contentW) * 0.5 - leftmost * sFit; // offset with measured left bound
  const top  = (height - contentH) * 0.5;

  return { tEff, rowPitchNow, leftmost, rightmost, contentW0, contentH0, sFit, left, top };
}

function renderLogo(g){
  g.push();
  g.background(255);
  g.fill(0); g.noStroke();

  const fit = computeLayoutFit();
  const { tEff, rowPitchNow, left, top, sFit } = fit;
  g.translate(left, top);
  g.scale(sFit, sFit);
  // (Debug rendering of packed letter boxes removed for clarity)
  rowYsCanvas = (rows <= 1)
    ? [0]
    : Array.from({ length: rows }, (_, r) => r * rowPitchNow);

  // Use original SVG letter positions (no offsets)
  for (let li = 0; li < layout.lettersOrder.length; li++){
    const letterKey   = layout.lettersOrder[li];
    const rowsForLetter = layout.letters[letterKey];
    const baseX = layout.letterX[li] * tEff;
    const rowsArr = layout.letters[letterKey];

    for (let r = 0; r < rowsForLetter.length; r++){
      const y = rowYsCanvas[r];
      const maxRunLen = maxRunLength(rowsArr[r]);
      for (const span of rowsForLetter[r]){
        const rightEdgeX = baseX + span.rightRel * layout.scale * widthScale; // widen x-distance inside glyph
        const baseLen = Math.max(0, span.runLen * layout.scale);
        // Alleen runs die groter zijn dan de instelbare drempel schalen mee
        const dashLen = dashLenForSpan(baseLen, maxRunLen);
        // Clamp dash length to the letter’s left edge (no wider than SVG envelope)
        const maxDash = Math.max(0, rightEdgeX - baseX);
        const dashLenClamped = Math.min(dashLen, maxDash);
        const xShift = computeXShift(r, rows, displaceGroups);
        if (roundedEdges) {
          drawRoundedTaper(g, rightEdgeX + xShift, y, dashLenClamped, linePx, TIP_RATIO);
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
  background(250);
  noStroke();
  renderLogo(this);
  if (debugMode) drawdebugModeOverlay();
}

// ====== DRAWING ======

function drawRoundedTaper(g, rightX, cy, len, h, tipRatio = 0.25){
  // Base radii vanuit lijndikte
  let R = h * 0.5;                      // grote cap rechts
  let r = Math.max(0.01, R * tipRatio); // kleine cap links

  // 1) Grote cap mag nooit > 50% van de lengte zijn
  const maxRByLen = Math.max(0.0001, len * 0.5);
  R = Math.min(R, maxRByLen);

  // 2) Kleine cap afleiden van effectieve R, maar begrenzen zodat R + r ≤ len en r ≤ R
  const rTarget = Math.max(0.01, R * tipRatio);
  r = Math.min(rTarget, Math.max(0, len - R));
  r = Math.min(r, R);

  // 3) Afstand tussen cap-centra
  const centerSep = Math.max(0, len - (R + r));

  // 4) Cap-centra
  const bigX = rightX - R;       // center grote cap (rechts)
  const tipX = bigX - centerSep; // center kleine cap (links)

  // 5) Body (stadionvorm) verbinden
  g.beginShape();
  g.vertex(bigX, cy - R);
  g.vertex(tipX, cy - r);
  g.vertex(tipX, cy + r);
  g.vertex(bigX, cy + R);
  g.endShape(CLOSE);

  // 6) Caps tekenen
  g.circle(bigX, cy, 2 * R);
  g.circle(tipX, cy, 2 * r);
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
  glyphBuffer = createGraphics(BUFFER_W, BUFFER_H);
  glyphBuffer.pixelDensity(1);
  glyphBuffer.noSmooth();
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
  const scale    = (width  - 2 * PADDING) / Math.max(1, totalW);           // X-scale fixed by width
  const rowPitch = (height - 2 * PADDING) / rowsCount;        // Y-scale from canvas height

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

// ====== INTERFACE ======

// ====== DEBUG OVERLAY ======
function drawdebugModeOverlay(){
  push();
  noFill(); stroke(0, 60); strokeWeight(1);

  const fit = computeLayoutFit();
  const { tEff, rowPitchNow, left, top, sFit } = fit;
  translate(left, top);
  scale(sFit, sFit);

  // letter boxes based on original SVG layout
  const tEff2 = 1 + (widthScale - 1) * TRACK_STRENGTH;
  const boxesLeft = layout.letterX.map(x => x * tEff2);
  const boxesW    = layout.letterW.map(w => w * layout.scale);
  const start = Math.min(...boxesLeft);
  const end   = Math.max(...boxesLeft.map((x,i)=> x + boxesW[i]));
  const totalH = layout.rowsY.length * rowPitchNow;
  stroke(0,160);
  for (let i = 0; i < boxesLeft.length; i++){
    rect(boxesLeft[i], 0, boxesW[i], totalH);
  }

  // row guides spanning the original bounds
  stroke(0, 60);
  for (let r = 0; r < layout.rowsY.length; r++){
    const y = (rowYsCanvas[r] !== undefined)
      ? rowYsCanvas[r]
      : (rows <= 1 ? 0 : r * rowPitchNow);
    line(start, y, end, y);
  }

  // scanned spans + right edges (using original baseX, clamp dash to box)
  for (let li = 0; li < layout.lettersOrder.length; li++){
    const letterKey = layout.lettersOrder[li];
    const rowsArr = layout.letters[letterKey];
    const baseX = layout.letterX[li] * tEff;
    for (let r = 0; r < rowsArr.length; r++){
      const y = rowYsCanvas[r] ?? (rowPitchNow * r + rowPitchNow * 0.5);
      for (const seg of rowsArr[r]){
        const x2Raw = baseX + seg.rightRel * layout.scale * widthScale;
        const maxDash = Math.max(0, x2Raw - baseX);
        const baseLen = Math.max(0, seg.runLen * layout.scale);
        const dlen    = Math.min(baseLen, maxDash);
        const x1 = x2Raw - dlen;
        const x2 = x2Raw;
        stroke(0,180,0); line(x1, y, x2, y);
        noStroke(); fill(255,0,0); circle(x2, y, 3);
      }
    }
  }
  pop();
}

// EXTRA BEREKENINGEN
function maxRunLength(row){
  let maxRunLen = 0;
  for (const s of row) if (s.runLen > maxRunLen) maxRunLen = s.runLen;
  return maxRunLen;
}

function computeXShift(r, rows, displaceGroups){
  const groupsAbs = Math.max(1, Math.abs(displaceGroups));
  const gsize = Math.max(1, Math.floor(rows / groupsAbs));
  const sectionIndex = Math.floor(r / gsize) % groupsAbs;
  const centered = sectionIndex - (groupsAbs - 1) * 0.5;
  const sign = Math.sign(displaceGroups) || 1;
  return sign * centered * DISPLACE_UNIT;
}