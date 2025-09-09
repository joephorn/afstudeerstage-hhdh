// ====== CONFIG ======
const LOGO_TEXT              = "ALBION";
const ROWS              = 12;
const LINE_HEIGHT       = 8;
const TIP_RATIO         = 0.25;
const PADDING           = 40;        // canvas padding
const DISPLACE_UNIT     = 20;        // px per row step for displacement
const LEN_SCALE_STRENGTH = 1;     // 0..1 — hoeveel van (widthSetting-1) wordt toegepast op lange runs (lager = minder snel meeschalen)
const TRACK_STRENGTH    = 1;    // meeschalen van lange lijnen (horizontaal)
const SMALL_LEN_BIAS   = 1;    // meeschalen van korte lijnen (verticaal)
const VIEW_SCALE        = 0.8;   // visual CSS scale of the canvas (no change to drawing scale)
const SAFE_MARGIN      = 0;    // keep content this far from canvas edges when auto-fitting

// Scan behavior
const BRIDGE_PIXELS     = 2;         // allow bridging small white gaps (0 = off)
const INK_THRESHOLD     = 140;
const BAND_MIN_COVER_FRAC = 0.035; // ≥3.5% of word width must be continuous ink for a row to count

// Row sampling kernel (vertical) in the glyph buffer
const ROW_KERNEL_Y_FRAC = 0.015; // % van bandhoogte → 1–3px meestal
const MIN_RUN_PX_BUFFER = 0;     // filter micro-runs die ruis veroorzaken

// Offscreen buffer + auto-fit targets
const BUFFER_W          = 2600;
const BUFFER_H          = 700;
const FIT_HEIGHT_FRAC   = 1;      // asc+dsc should use ≤ this of buffer height
const FIT_WIDTH_FRAC    = 1;      // total word width ≤ this of buffer width

const LETTERS_PATH      = './src/letters/';
let glyphImgs = {};   // map: char -> p5.Image (SVG rasterized)
let glyphDims = {};   // map: char -> {w,h}

// ====== STATE ======
let glyphBuffer;      // offscreen p5.Graphics used for scanning
let layout;           // computed positions + spans
let rowsSetting = ROWS;
let lineThickness = LINE_HEIGHT;
let heightScale   = 1.0;
let sliderRows, sliderThickness, sliderHeight, sliderDisplacement, sliderWidth, sliderGap;
let gapSetting = 5;
let displaceGroupSize = 3;
let displaceGroupCount = 2;
let checkboxRounded, checkboxdebugMode, checkboxAutoRandom;
let roundedEdges = true;
let debugMode = false;
let widthSetting = 0.96;
let lenThreshold = 65;

let baseRowPitch;   // baseline row pitch derived at startup

// random animate
let lastAutoRandomMs = 0;
const RANDOM_INTERVAL_MS = 1000;
let autoRandomActive = false;

// UI canvas (separate)
let canvasContainer;
let uiContainer;
let uiWidth = 360;
let uiHeight = 300;
let uiP5 = null;             // p5 instance for the UI canvas (instance mode)

let rowYsCanvas = []; // y-position of each row in canvas coordinates

function desiredCanvasHeight(){
  return Math.ceil(PADDING * 2 + baseRowPitch * ROWS * heightScale);
}

function divisorsAsc(n){
  const d = [];
  for (let i = 1; i <= n; i++) if (n % i === 0) d.push(i);
  return d; // e.g. 12 -> [1,2,3,4,6,12]
}

let _groupsOpts = [1]; // valid groups for current rowsSetting
function rebuildGroupSlider(){
  _groupsOpts = divisorsAsc(rowsSetting);
  let idx = _groupsOpts.indexOf(displaceGroupCount);
  if (idx === -1){
    // pick nearest valid option to current displaceGroupCount
    let best = 0, bestDiff = Infinity;
    for (let i = 0; i < _groupsOpts.length; i++){
      const diff = Math.abs(_groupsOpts[i] - displaceGroupCount);
      if (diff < bestDiff){ bestDiff = diff; best = i; }
    }
    idx = best;
    displaceGroupCount = _groupsOpts[idx];
  }
  if (!sliderDisplacement){
    // create the slider once; it selects an INDEX into _groupsOpts
    sliderDisplacement = createSlider(0, Math.max(0, _groupsOpts.length - 1), idx, 1);
    sliderDisplacement.style('width','180px');
    sliderDisplacement.input(()=>{
      const i = sliderDisplacement.value();
      displaceGroupCount = _groupsOpts[i];              // number of groups
      displaceGroupSize  = Math.max(1, Math.floor(rowsSetting / displaceGroupCount));
      redraw(); positionUI(); redrawUI();
    });
  } else {
    // update range and current index when rowsSetting changes
    sliderDisplacement.attribute('min', 0);
    sliderDisplacement.attribute('max', Math.max(0, _groupsOpts.length - 1));
    sliderDisplacement.attribute('step', 1);
    sliderDisplacement.value(idx);
  }
  // keep derived size in sync
  displaceGroupSize = Math.max(1, Math.floor(rowsSetting / displaceGroupCount));
}

function randInt(min, max){ return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max){ return Math.random() * (max - min) + min; }

function applyOneRandomTweak(){
  // kies 1 parameter
  const choices = ['width','gap','groups','line','height'];
  const pick = choices[randInt(0, choices.length - 1)];
  let needsLayout = false;
  let needsResize = false;

  if (pick === 'width'){
    // 0.85..1.20
    widthSetting = Math.max(0.5, Math.min(3.0, randFloat(0.85, 1.20)));
    if (sliderWidth) sliderWidth.value(Math.round(widthSetting * 100));
  } else if (pick === 'gap'){
    // 0..120 px
    gapSetting = randInt(0, 120);
    if (sliderGap) sliderGap.value(gapSetting);
    needsLayout = true;
  } else if (pick === 'groups'){
    // kies geldige groepsaantallen (delers van rowsSetting)
    const opts = divisorsAsc(rowsSetting);
    const curIdx = Math.max(0, opts.indexOf(displaceGroupCount));
    let idx = randInt(0, Math.max(0, opts.length - 1));
    if (opts.length > 1 && idx === curIdx){ idx = (idx + 1) % opts.length; }
    displaceGroupCount = opts[idx];
    displaceGroupSize  = Math.max(1, Math.floor(rowsSetting / displaceGroupCount));
    // UI-slider updaten als aanwezig (index-slider over _groupsOpts)
    if (sliderDisplacement && typeof sliderDisplacement.value === 'function'){
      const i = Math.max(0, opts.indexOf(displaceGroupCount));
      sliderDisplacement.value(i);
    }
  } else if (pick === 'line'){
    // 1..25 px
    lineThickness = randInt(1, 25);
    if (sliderThickness) sliderThickness.value(lineThickness);
  } else if (pick === 'height'){
    // 70%..130% (geclamped binnen je slider 50..200)
    heightScale = Math.max(0.5, Math.min(2.0, randFloat(0.70, 1.30)));
    if (sliderHeight) sliderHeight.value(Math.round(heightScale * 100));
    needsResize = true;
  }

  if (needsResize){
    resizeCanvas(width, desiredCanvasHeight(), true);
  }
  if (needsLayout){
    layout = buildLayout(LOGO_TEXT, rowsSetting);
  }

  // redraw + UI
  redraw();
  redrawUI();
}

function autoRandomizeTick(){
  if (!autoRandomActive || !checkboxAutoRandom || !checkboxAutoRandom.checked()) return;
  const now = millis();
  if (now - lastAutoRandomMs >= RANDOM_INTERVAL_MS){
    lastAutoRandomMs = now;
    applyOneRandomTweak();
  }
}

function positionUI(){
  if (!mainCanvas || !uiContainer) return;
  const x = Math.max(0, windowWidth - uiWidth - 16);
  const y = 16;
  uiContainer.style('position', 'fixed');
  uiContainer.style('z-index', '1000');
  uiContainer.position(x, y);
  positionControls();
  redrawUI();
}
// Helper to visually scale and center the canvas in the window via CSS (does not alter p5 width/height)
function fitCanvasToWindow(){
  // Compute a CSS size that fits inside the window, with a slight margin via VIEW_SCALE
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

function positionControls(){
  if (!uiContainer) return;
  const left = uiContainer.position.x + 12;
  let top  = 16;
  const interval = 30;
  if (sliderRows)           { sliderRows.parent(uiContainer);           sliderRows.position(left, top); } sliderRows.style('z-index', '1000');  top += interval;
  if (sliderThickness)      { sliderThickness.parent(uiContainer);      sliderThickness.position(left, top); sliderThickness.style('z-index', '1000'); }  top += interval;
  if (sliderHeight)         { sliderHeight.parent(uiContainer);         sliderHeight.position(left, top); sliderHeight.style('z-index', '1000'); }  top += interval;
  if (sliderWidth)          { sliderWidth.parent(uiContainer);          sliderWidth.position(left, top); sliderWidth.style('z-index','1000'); }  top += interval;
  if (sliderGap)            { sliderGap.parent(uiContainer);            sliderGap.position(left, top); sliderGap.style('z-index','1000'); }  top += interval;
  if (sliderDisplacement)   { sliderDisplacement.parent(uiContainer);   sliderDisplacement.position(left, top); sliderDisplacement.style('z-index', '1000'); }  top += interval;
  if (checkboxRounded)      { checkboxRounded.parent(uiContainer);      checkboxRounded.position(left, top); }  top += interval;
  if (checkboxdebugMode)    { checkboxdebugMode.parent(uiContainer);    checkboxdebugMode.position(left, top); }  top += interval;
  if (checkboxAutoRandom)   { checkboxAutoRandom.parent(uiContainer);   checkboxAutoRandom.position(left, top); }  top += interval;
}

function redrawUI(){
  if (uiP5 && uiP5.redraw) uiP5.redraw();
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
  baseRowPitch = (height - 2 * PADDING) / rowsSetting;
  noLoop();
  layout = buildLayout(LOGO_TEXT);
  initInterface();
  resizeCanvas(width, desiredCanvasHeight(), true);
  positionUI();
  fitCanvasToWindow();

  // Create UI holder + UI canvas (instance-mode p5)
  if (uiContainer) uiContainer.remove();
  uiContainer = createDiv();
  uiContainer.style('width', uiWidth + 'px');
  uiContainer.style('height', uiHeight + 'px');
  uiContainer.style('padding', '0');
  uiContainer.style('margin', '0');

  // Second p5 instance for the UI canvas
  uiP5 = new p5((p) => {
    p.setup = function(){
      const cnv = p.createCanvas(uiWidth, uiHeight);
      cnv.parent(uiContainer);
      p.frameRate(12); // light loop so labels always reflect latest values
    };
    p.draw = function(){
      var top = 4;
      const interval = 30;
      p.background(250);
      p.noStroke(); p.fill(0); p.textSize(12); p.textAlign(p.LEFT, p.TOP);
      p.text(`Rows: ${rowsSetting}`, 12, top);  top += interval;
      p.text(`Line: ${lineThickness}px`, 12, top);  top += interval;
      p.text(`Height: ${Math.round(heightScale*100)}%`, 12, top);  top += interval;
      p.text(`Width: ${Math.round(widthSetting*100)}%`, 12, top);  top += interval;
      p.text(`Gap: ${gapSetting}px`, 12, top);  top += interval;
      const gsize = Math.max(1, Math.floor(rowsSetting / Math.max(1, displaceGroupCount)));
      p.text(`Groups: ${displaceGroupCount} × (each ${gsize} rows)`, 12, top);  top += interval;
    };
  });

  redrawUI();
  positionUI();
  fitCanvasToWindow();

  noLoop();
  redraw();
}

// Compute the effective dash length for a span (same math as in renderLogo)
function dashLenForSpan(baseLen, maxRunLen){
  const eligible     = baseLen >= lenThreshold;
  const lenBiasBase  = (maxRunLen > 0) ? (baseLen / maxRunLen) : 0;  // 0..1
  const lenBiasShort = SMALL_LEN_BIAS;                                // kleine vaste bias voor korte runs
  const lenBias      = eligible ? lenBiasBase : lenBiasShort;
  return baseLen * (1 + (widthSetting - 1) * lenBias * LEN_SCALE_STRENGTH);
}

// Measure per-letter bounds (visual left/right) using the same math as the renderer

function computePerLetterBounds(){
  const tEff = 1 + (widthSetting - 1) * TRACK_STRENGTH;
  const letterLeft = new Array(layout.lettersOrder.length).fill(Infinity);
  const letterRight = new Array(layout.lettersOrder.length).fill(-Infinity);

  for (let li = 0; li < layout.lettersOrder.length; li++){
    const baseX = layout.letterX[li] * tEff; // tracking-applied start of letter box
    const letterKey = layout.lettersOrder[li];
    const rows = layout.letters[letterKey];

    for (let r = 0; r < rows.length; r++){
      // max run length in this row for bias
      let maxRunLen = 0; for (const s of rows[r]) if (s.runLen > maxRunLen) maxRunLen = s.runLen;
      // displacement for this row
      let xShift = 0;
      const gsize = Math.max(1, displaceGroupSize);
      if (rowsSetting % gsize === 0){
        const groups = Math.max(1, Math.floor(rowsSetting / gsize));
        const sectionIndex = Math.floor(r / gsize);               // 0..groups-1
        const centered = sectionIndex - (groups - 1) * 0.5;       // symmetric around 0
        xShift = centered * DISPLACE_UNIT;                        // fixed offset per section
      }
      for (const seg of rows[r]){
        const rightEdgeX = baseX + seg.rightRel * layout.scale * widthSetting;
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
  const tEff = 1 + (widthSetting - 1) * TRACK_STRENGTH;
  const rowPitchNow = (rowsSetting <= 1)
    ? (height - 2 * PADDING)
    : (height - 2 * PADDING) / (rowsSetting - 1);

  let leftmost = Infinity;
  let rightmost = -Infinity;
  for (let li = 0; li < layout.lettersOrder.length; li++){
    const baseX = layout.letterX[li] * tEff;
    const letterKey = layout.lettersOrder[li];
    const rows = layout.letters[letterKey];

    for (let r = 0; r < rows.length; r++){
      // max run length in this row (for bias), same as render loop
      let maxRunLen = 0;
      for (const s of rows[r]) if (s.runLen > maxRunLen) maxRunLen = s.runLen;

      // displacement in this row
      let xShift = 0;
      const gsize = Math.max(1, displaceGroupSize);
      if (rowsSetting % gsize === 0){
        const groups = Math.max(1, Math.floor(rowsSetting / gsize));
        const sectionIndex = Math.floor(r / gsize);               // 0..groups-1
        const centered = sectionIndex - (groups - 1) * 0.5;       // symmetric around 0
        xShift = centered * DISPLACE_UNIT;                        // fixed offset per section
      }

      for (const seg of rows[r]){
        const rightEdgeX = baseX + seg.rightRel * layout.scale * widthSetting;
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
  const contentH0 = rowsSetting * rowPitchNow;

  const sFit = Math.min(
    (width  - 2 * SAFE_MARGIN) / contentW0,
    (height - 2 * SAFE_MARGIN) / contentH0,
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
  rowYsCanvas = (rowsSetting <= 1)
    ? [0]
    : Array.from({ length: rowsSetting }, (_, r) => r * rowPitchNow);

  // Use original SVG letter positions (no offsets)
  for (let li = 0; li < layout.lettersOrder.length; li++){
    const letterKey   = layout.lettersOrder[li];
    const rowsForLetter = layout.letters[letterKey];
    const baseX = layout.letterX[li] * tEff;

    for (let r = 0; r < rowsForLetter.length; r++){
      const y = rowYsCanvas[r];
      // Determine max run length in this row to bias length scaling
      let maxRunLen = 0;
      for (const s of rowsForLetter[r]) {
        if (s.runLen > maxRunLen) maxRunLen = s.runLen;
      }
      for (const span of rowsForLetter[r]){
        const rightEdgeX = baseX + span.rightRel * layout.scale * widthSetting; // widen x-distance inside glyph
        const baseLen = Math.max(0, span.runLen * layout.scale);
        // Alleen runs die groter zijn dan de instelbare drempel schalen mee
        const eligible     = baseLen >= lenThreshold;
        const lenBiasBase  = (maxRunLen > 0) ? (span.runLen / maxRunLen) : 0;  // 0..1
        const lenBiasShort = SMALL_LEN_BIAS;                                    // kleine vaste bias voor korte runs
        const lenBias      = eligible ? lenBiasBase : lenBiasShort;
        const dashLen      = baseLen * (1 + (widthSetting - 1) * lenBias * LEN_SCALE_STRENGTH);
        // Clamp dash length to the letter’s left edge (no wider than SVG envelope)
        const maxDash = Math.max(0, rightEdgeX - baseX);
        const dashLenClamped = Math.min(dashLen, maxDash);
        // Displacement by snapped intervals across rows (optional)
        let xShift = 0;
        const gsize = Math.max(1, displaceGroupSize);
        if (rowsSetting % gsize === 0){
          const groups = Math.max(1, Math.floor(rowsSetting / gsize));
          const sectionIndex = Math.floor(r / gsize);               // 0..groups-1
          const centered = sectionIndex - (groups - 1) * 0.5;       // symmetric around 0
          xShift = centered * DISPLACE_UNIT;                        // fixed offset per section
        }
        if (roundedEdges) {
          drawRoundedTaper(g, rightEdgeX + xShift, y, dashLenClamped, lineThickness, TIP_RATIO);
        } else {
          drawStraightTaper(g, rightEdgeX + xShift, y, dashLenClamped, lineThickness);
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
function buildLayout(word, rowsCount = rowsSetting){
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
  // Target fit: tallest letter uses FIT_HEIGHT_FRAC of buffer height
  const sH = (BUFFER_H * FIT_HEIGHT_FRAC) / maxH;
  const sW = (BUFFER_W * FIT_WIDTH_FRAC) / Math.max(1, sumW);
  const scaleUniform = Math.min(sH, sW, 1.0);

  // Compute total scaled width and start X for centering (NO gaps in buffer)
  const letterWidths = naturalDims.map(d => d.w * scaleUniform);
  const totalWLetters = letterWidths.reduce((a,b)=>a+b,0);
  // GAP DOES NOT AFFECT BUFFER DRAWING — keep buffer tight to letters only
  const totalW = totalWLetters;
  const startX = (BUFFER_W - totalW) * 0.5;

  // Vertical center (we’ll scan actual ink bounds later anyway)
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
    letterX: letterX.map((x, i) => (x - startX) * scale + (i * Math.max(0, gapSetting) * scale)),
    letterW: letterWidths,
    scale,
    rowPitch,
    rowsY,
    ranges
  };
}

// ====== INTERFACE ======
function initInterface(){
  sliderRows = createSlider(4, 4*8, rowsSetting, 4);
  sliderRows.style('width', '180px');
  sliderRows.input(() => {
    rowsSetting = sliderRows.value();
    rebuildGroupSlider();
    layout = buildLayout(LOGO_TEXT, rowsSetting);
    redraw(); positionUI(); redrawUI();
  });

  sliderThickness = createSlider(1, 25, lineThickness, 1);
  sliderThickness.style('width', '180px');
  sliderThickness.input(() => {
    lineThickness = sliderThickness.value();
    redraw(); positionUI(); redrawUI();});

  sliderHeight = createSlider(50, 200, Math.round(heightScale * 100), 1);
  sliderHeight.style('width', '180px');
  sliderHeight.input(() => {
    heightScale = sliderHeight.value() / 100;
    resizeCanvas(width, desiredCanvasHeight(), true);
    redraw(); positionUI(); redrawUI();
  });

  rebuildGroupSlider();
  
  sliderWidth = createSlider(50, 300, Math.round(widthSetting * 100), 1);
  sliderWidth.style('width', '180px');
  sliderWidth.input(() => {
    widthSetting = sliderWidth.value() / 100;
    redraw(); positionUI(); redrawUI();
  });

  sliderGap = createSlider(0, 150, gapSetting, 1);
  sliderGap.style('width', '180px');
  sliderGap.input(() => {
    gapSetting = sliderGap.value();
    layout = buildLayout(LOGO_TEXT, rowsSetting);
    redraw(); positionUI(); redrawUI();
  });

  positionControls();

  checkboxRounded = createCheckbox('Rounded edges', roundedEdges);
  checkboxRounded.changed(() => {
    roundedEdges = checkboxRounded.checked();
    redraw(); positionUI(); redrawUI();
  });

  checkboxdebugMode = createCheckbox('Debug mode', debugMode);
  checkboxdebugMode.changed(() => {
    debugMode = checkboxdebugMode.checked();
    redraw(); positionUI(); redrawUI();
  });

  checkboxAutoRandom = createCheckbox('Auto randomize', false);
  checkboxAutoRandom.changed(() => {
    lastAutoRandomMs = millis();
    autoRandomActive = checkboxAutoRandom.checked();
    if (checkboxAutoRandom.checked()){
      loop();
    } else {
      noLoop();
      lastAutoRandomMs = millis();
      redraw();
    }
    positionUI(); redrawUI();
  });
}

// ====== debug OVERLAY ======
function drawdebugModeOverlay(){
  push();
  noFill(); stroke(0, 60); strokeWeight(1);

  const fit = computeLayoutFit();
  const { tEff, rowPitchNow, left, top, sFit } = fit;
  translate(left, top);
  scale(sFit, sFit);

  // letter boxes based on original SVG layout
  const tEff2 = 1 + (widthSetting - 1) * TRACK_STRENGTH;
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
      : (rowsSetting <= 1 ? 0 : r * rowPitchNow);
    line(start, y, end, y);
  }

  // scanned spans + right edges (using original baseX, clamp dash to box)
  for (let li = 0; li < layout.lettersOrder.length; li++){
    const letterKey = layout.lettersOrder[li];
    const rows = layout.letters[letterKey];
    const baseX = layout.letterX[li] * tEff;
    for (let r = 0; r < rows.length; r++){
      const y = rowYsCanvas[r] ?? (rowPitchNow * r + rowPitchNow * 0.5);
      for (const seg of rows[r]){
        const x2Raw = baseX + seg.rightRel * layout.scale * widthSetting;
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