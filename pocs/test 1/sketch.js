// ====== CONFIG ======
const TEXT              = "ALBION";
const ROWS              = 12;
const LINE_HEIGHT       = 8;
const TIP_RATIO         = 0.25;
const PADDING           = 40;        // canvas padding
const DISPLACEMENT_LVL  = 1;
const DISPLACE_UNIT     = 20;        // px per row step for displacement
const LEN_SCALE_STRENGTH = 0.5;     // 0..1 — hoeveel van (widthFactor-1) wordt toegepast op lange runs (lager = minder snel meeschalen)
const TRACK_STRENGTH    = 1;    // meeschalen van lange lijnen (horizontaal)
const SMALL_LEN_BIAS   = 1;    // meeschalen van korte lijnen (verticaal)
const VIEW_SCALE        = 0.8;   // visual CSS scale of the canvas (no change to drawing scale)
const SAFE_MARGIN      = 16;    // keep content this far from canvas edges when auto-fitting
const LETTER_GAP       = 0;    // px fixed spacing between letters (visual)
const BOUND_MIN_LEN    = 4;

// Scan behavior
const BRIDGE_PIXELS     = 2;         // allow bridging small white gaps (0 = off)
const INK_THRESHOLD     = 160;

// Row sampling kernel (vertical) in the glyph buffer
const ROW_KERNEL_Y_FRAC = 0.015; // ~1.5% van bandhoogte → 1–3px meestal
const MIN_RUN_PX_BUFFER = 2;     // filter micro-runs die ruis veroorzaken

// Offscreen buffer + auto-fit targets
const BUFFER_W          = 2600;
const BUFFER_H          = 700;
const FIT_HEIGHT_FRAC   = 0.70;      // asc+dsc should use ≤ this of buffer height
const FIT_WIDTH_FRAC    = 0.80;      // total word width ≤ this of buffer width

// Vertical scan band (relative to asc/desc around baseline)
const BAND_TOP_FACTOR   = 0.92;      // baseline - asc * factor
const BAND_BOT_FACTOR   = 1.04;      // baseline + desc * factor

const FONT_PATH         = './src/Machine-Bold.otf';

// ====== STATE ======
let glyphBuffer;      // offscreen p5.Graphics used for scanning
let layout;           // computed positions + spans
let loadedFont;
let rowsSetting = ROWS;
let sliderRows;
let lineThickness = LINE_HEIGHT;
let heightScale   = 1.0;
let dispStep = 1;                    // -N..+N → per-row shift = dispStep * DISPLACE_UNIT * rowIndex
let sliderThickness, sliderHeight, sliderDisplacement, sliderWidth;
let checkboxRounded, checkboxdebugMode;
let roundedEdges = true;
let debugMode = false;
let widthFactor = 1.0;
let lenThresholdPx = 65;

let baseRowPitch;   // baseline row pitch derived at startup

// UI canvas (separate)
let canvasContainer;
let uiContainer;
let uiWidth = 360;
let uiHeight = 250;
let uiP5 = null;             // p5 instance for the UI canvas (instance mode)

let rowYsCanvas = []; // y-position of each row in canvas coordinates

function desiredCanvasHeight(){
  return Math.ceil(PADDING * 2 + baseRowPitch * ROWS * heightScale);
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
  if (sliderDisplacement)   { sliderDisplacement.parent(uiContainer);   sliderDisplacement.position(left, top); sliderDisplacement.style('z-index', '1000'); }  top += interval;
  if (checkboxRounded)      { checkboxRounded.parent(uiContainer);      checkboxRounded.position(left, top); }  top += interval;
  if (checkboxdebugMode)    { checkboxdebugMode.parent(uiContainer);    checkboxdebugMode.position(left, top); }  top += interval;
}

function redrawUI(){
  if (uiP5 && uiP5.redraw) uiP5.redraw();
}

function preload(){
  if (FONT_PATH) loadedFont = loadFont(FONT_PATH, () => {}, err => console.error(err));
}

function setup(){
  mainCanvas = createCanvas(800, 250, SVG);
  pixelDensity(1);
  baseRowPitch = (height - 2 * PADDING) / rowsSetting;
  noLoop();
  layout = buildLayout(TEXT);
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
      p.text(`Width: ${Math.round(widthFactor*100)}%`, 12, top);  top += interval;
      p.text(`Displace: ${dispStep} steps (×${DISPLACE_UNIT}px/step)`, 12, top);  top += interval;
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
  const eligible     = baseLen >= lenThresholdPx;
  const lenBiasBase  = (maxRunLen > 0) ? (baseLen / maxRunLen) : 0;  // 0..1
  const lenBiasShort = SMALL_LEN_BIAS;                                // kleine vaste bias voor korte runs
  const lenBias      = eligible ? lenBiasBase : lenBiasShort;
  return baseLen * (1 + (widthFactor - 1) * lenBias * LEN_SCALE_STRENGTH);
}

// Measure per-letter bounds (visual left/right) using the same math as the renderer

function computePerLetterBounds(){
  const tEff = 1 + (widthFactor - 1) * TRACK_STRENGTH;
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
      if (dispStep !== 0){
        const denom = Math.max(1, rowsSetting - 1);
        const t = r / denom;
        const stepIndex = Math.round(t * dispStep);
        xShift = stepIndex * DISPLACE_UNIT;
      }
      for (const seg of rows[r]){
        const rightEdgeX = baseX + seg.rightRel * layout.scale * widthFactor;
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

// Compute per-letter offsets so that visual left edges are spaced by a fixed gap
function computeSpacedOffsets(gapPx = LETTER_GAP){
  const { letterLeft, letterRight } = computePerLetterBounds();
  const n = letterLeft.length;
  const widths = new Array(n);
  for (let i = 0; i < n; i++) widths[i] = Math.max(0, letterRight[i] - letterLeft[i]);

  // Start at the global left so word remains centred by our later fit
  let globalLeft = Infinity; for (let i = 0; i < n; i++) if (letterLeft[i] < globalLeft) globalLeft = letterLeft[i];
  if (!isFinite(globalLeft)) globalLeft = 0;

  const targetLeft = new Array(n);
  if (n > 0){
    targetLeft[0] = globalLeft;
    for (let i = 1; i < n; i++) targetLeft[i] = targetLeft[i-1] + widths[i-1] + gapPx;
  }

  // Offsets to add to the original tracked baseX so that the visual left becomes targetLeft
  const offsets = new Array(n);
  for (let i = 0; i < n; i++) offsets[i] = targetLeft[i] - letterLeft[i];

  const start = n > 0 ? targetLeft[0] : 0;
  const end   = n > 0 ? targetLeft[n-1] + widths[n-1] : 0;
  return { offsets, targetLeft, widths, start, end };
}

// Build contiguous (packed) letter boxes so each next box starts where the previous ends
function computePackedLetterBoxes(){
  const { letterLeft, letterRight } = computePerLetterBounds();
  const n = letterLeft.length;
  const widths = new Array(n);
  for (let i = 0; i < n; i++) widths[i] = Math.max(0, letterRight[i] - letterLeft[i]);
  // start at global leftmost across all letters so the word stays centred later
  let globalLeft = Infinity; for (let i = 0; i < n; i++) if (letterLeft[i] < globalLeft) globalLeft = letterLeft[i];
  if (!isFinite(globalLeft)) globalLeft = 0;
  const packedLeft = new Array(n);
  if (n > 0){
    packedLeft[0] = globalLeft;
    for (let i = 1; i < n; i++) packedLeft[i] = packedLeft[i-1] + widths[i-1];
  }
  const start = n > 0 ? packedLeft[0] : 0;
  const end   = n > 0 ? packedLeft[n-1] + widths[n-1] : 0;
  const packedWidth = Math.max(0, end - start);
  return { packedLeft, widths, start, end, packedWidth };
}

function computeLayoutFit(){
  const tEff = 1 + (widthFactor - 1) * TRACK_STRENGTH;
  const rowPitchNow = (height - 2 * PADDING) / rowsSetting;

  const { offsets } = computeSpacedOffsets();

  // Use spaced letter positions for bounds
  let leftmost = Infinity;
  let rightmost = -Infinity;
  for (let li = 0; li < layout.lettersOrder.length; li++){
    const baseX = layout.letterX[li] * tEff + offsets[li];
    const letterKey = layout.lettersOrder[li];
    const rows = layout.letters[letterKey];

    for (let r = 0; r < rows.length; r++){
      // max run length in this row (for bias), same as render loop
      let maxRunLen = 0;
      for (const s of rows[r]) if (s.runLen > maxRunLen) maxRunLen = s.runLen;

      // displacement in this row
      let xShift = 0;
      if (dispStep !== 0){
        const denom = Math.max(1, rowsSetting - 1);
        const t = r / denom;
        const stepIndex = Math.round(t * dispStep);
        xShift = stepIndex * DISPLACE_UNIT;
      }

      for (const seg of rows[r]){
        const rightEdgeX = baseX + seg.rightRel * layout.scale * widthFactor;
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
  rowYsCanvas = Array.from({ length: rowsSetting }, (_, r) => r * rowPitchNow + rowPitchNow * 0.5);

  const { offsets } = computeSpacedOffsets();
  for (let li = 0; li < layout.lettersOrder.length; li++){
    const letterKey   = layout.lettersOrder[li];
    const rowsForLetter = layout.letters[letterKey];
    // Use spaced baseX (actual letter start + spacing offset)
    const baseX = layout.letterX[li] * tEff + offsets[li]; // apply spacing offset

    for (let r = 0; r < rowsForLetter.length; r++){
      const y = rowYsCanvas[r];
      // Determine max run length in this row to bias length scaling
      let maxRunLen = 0;
      for (const s of rowsForLetter[r]) {
        if (s.runLen > maxRunLen) maxRunLen = s.runLen;
      }
      for (const span of rowsForLetter[r]){
        const rightEdgeX = baseX + span.rightRel * layout.scale * widthFactor; // widen x-distance inside glyph
        const baseLen = Math.max(0, span.runLen * layout.scale);
        // Alleen runs die groter zijn dan de instelbare drempel schalen mee
        const eligible     = baseLen >= lenThresholdPx;
        const lenBiasBase  = (maxRunLen > 0) ? (span.runLen / maxRunLen) : 0;  // 0..1
        const lenBiasShort = SMALL_LEN_BIAS;                                    // kleine vaste bias voor korte runs
        const lenBias      = eligible ? lenBiasBase : lenBiasShort;
        const dashLen      = baseLen * (1 + (widthFactor - 1) * lenBias * LEN_SCALE_STRENGTH);
        // Displacement by snapped intervals across rows (optional)
        let xShift = 0;
        if (dispStep !== 0){
          const denom = Math.max(1, rowsSetting - 1);
          const t = r / denom; // 0..1 over rows
          const stepIndex = Math.round(t * dispStep); // signed steps
          xShift = stepIndex * DISPLACE_UNIT;
        }
        if (roundedEdges) {
          drawRoundedTaper(g, rightEdgeX + xShift, y, dashLen, lineThickness, TIP_RATIO);
        } else {
          drawStraightTaper(g, rightEdgeX + xShift, y, dashLen, lineThickness);
        }
      }
    }
  }
  g.pop();
}

function draw(){
  background(250);
  noStroke();
  renderLogo(this);
  if (debugMode) drawdebugModeOverlay();
  positionUI();
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
function isInkAt(g, x, y){
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return false;
  const yi = y | 0, xi = x | 0;
  const idx = 4 * (yi * g.width + xi);
  return g.pixels[idx] < INK_THRESHOLD; // sample red channel
}

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

// Helper: Measure actual vertical ink bounds in an offscreen buffer, scanning for black ink
function measureInkVerticalBounds(g, x1 = 0, x2 = null){
  if (x2 == null) x2 = g.width - 1;
  const xmin = Math.max(0, Math.floor(x1));
  const xmax = Math.min(g.width - 1, Math.ceil(x2));
  g.loadPixels();
  let top = g.height, bot = -1;
  for (let y = 0; y < g.height; y++){
    const rowIdx = 4 * y * g.width;
    for (let x = xmin; x <= xmax; x++){
      const idx = rowIdx + 4 * x;
      if (g.pixels[idx] < INK_THRESHOLD){
        if (y < top) top = y;
        if (y > bot) bot = y;
        break; // go to next row once ink is found
      }
    }
  }
  if (bot < 0) return { top: 0, bot: g.height - 1 }; // no ink fallback
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
  if (loadedFont) glyphBuffer.textFont(loadedFont); else glyphBuffer.textFont('sans-serif');
  glyphBuffer.textAlign(LEFT, BASELINE);

  // 2) Auto-fit text size to buffer
  let fontSize = Math.floor(BUFFER_H * 0.5); // initial guess
  let totalW = Infinity, asc = 0, desc = 0, letterWidths = [];
  for (let i = 0; i < 8; i++){
    glyphBuffer.textSize(fontSize);
    asc = glyphBuffer.textAscent();
    desc = glyphBuffer.textDescent();
    totalW = 0; letterWidths = [];
    for (const ch of word){ const w = glyphBuffer.textWidth(ch); letterWidths.push(w); totalW += w; }
    const fitH = (BUFFER_H * FIT_HEIGHT_FRAC) / (asc + desc);
    const fitW = (BUFFER_W * FIT_WIDTH_FRAC) / totalW;
    const fit  = Math.min(fitH, fitW, 1.0);
    const next = Math.max(8, Math.floor(fontSize * fit));
    if (Math.abs(next - fontSize) < 1) break;
    fontSize = next;
  }

  const baseline = (BUFFER_H + asc - desc) * 0.5;
  const startX   = (BUFFER_W - totalW) * 0.5;

  // 3) Draw each glyph at its pen position
  const letterX = [];
  let pen = startX;
  for (let i = 0; i < word.length; i++){
    letterX.push(pen);
    glyphBuffer.text(word[i], pen, baseline);
    pen += letterWidths[i];
  }
  glyphBuffer.loadPixels();

  // 4) Prepare vertical scan band (robust): measure actual ink bounds instead of trusting font metrics
  const { top: inkTop, bot: inkBot } = measureInkVerticalBounds(
    glyphBuffer,
    Math.floor(startX),
    Math.ceil(startX + totalW) - 1
  );
  const pad = Math.round(0.02 * BUFFER_H); // small breathing space (2%)
  let bandTop = Math.max(0, inkTop - pad);
  let bandBot = Math.min(BUFFER_H - 1, inkBot + pad);
  if (bandTop > bandBot){ const t = bandTop; bandTop = bandBot; bandBot = t; }

  const bandH = Math.max(1, bandBot - bandTop);
  const halfKernel = Math.max(1, Math.round(bandH * ROW_KERNEL_Y_FRAC));

  const rowsY = [];
  for (let r = 0; r < rowsCount; r++) rowsY.push( lerp(bandTop, bandBot, (r + 0.5) / rowsCount) );

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
  const scale    = (width  - 2 * PADDING) / totalW;           // X-scale fixed by width
  const rowPitch = (height - 2 * PADDING) / rowsCount;        // Y-scale from canvas height

  return {
    letters: perLetter,
    lettersOrder,
    letterX: letterX.map(x => (x - startX) * scale),
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
    // keep displacement slider in sync with new rowsSetting
    if (sliderDisplacement) {
      sliderDisplacement.attribute('min', -rowsSetting);
      sliderDisplacement.attribute('max', rowsSetting);
      // clamp current dispStep to new range
      dispStep = Math.max(-rowsSetting, Math.min(rowsSetting, dispStep));
      sliderDisplacement.value(dispStep);
    }
    layout = buildLayout(TEXT, rowsSetting);
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

  sliderDisplacement = createSlider(-rowsSetting, rowsSetting, dispStep, 1);
  sliderDisplacement.style('width', '180px');
  sliderDisplacement.input(() => {
    dispStep = sliderDisplacement.value();
    redraw(); positionUI(); redrawUI();
  });
  
  sliderWidth = createSlider(50, 300, Math.round(widthFactor * 100), 1);
  sliderWidth.style('width', '180px');
  sliderWidth.input(() => {
    widthFactor = sliderWidth.value() / 100;
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
}

// ====== debugMode OVERLAY ======
function drawdebugModeOverlay(){
  push();
  noFill(); stroke(0, 60); strokeWeight(1);

  const fit = computeLayoutFit();
  const { tEff, rowPitchNow, left, top, sFit } = fit;
  translate(left, top);
  scale(sFit, sFit);

  // reconstruct bandH from layout rows for kernel estimation
  const totalBandH = (layout.rowsY.length > 1) ? ((layout.rowsY[layout.rowsY.length-1] - layout.rowsY[0]) + rowPitchNow) : rowPitchNow;
  const halfKernel = Math.max(1, Math.round(totalBandH * ROW_KERNEL_Y_FRAC / rowsSetting));

  // letter boxes — spaced (fixed gap) based on visual widths
  stroke(0, 160);
  const { targetLeft, widths, start, end } = computeSpacedOffsets();
  const totalH = layout.rowsY.length * rowPitchNow;
  for (let i = 0; i < widths.length; i++){
    rect(targetLeft[i], 0, widths[i], totalH);
  }

  // row guides spanning the spaced bounds
  stroke(0, 60);
  for (let r = 0; r < layout.rowsY.length; r++){
    const y = rowYsCanvas[r] ?? (rowPitchNow * r + rowPitchNow * 0.5);
    line(start, y, end, y);
  }

  // scanned spans + right edges (using spaced baseX)
  const { offsets } = computeSpacedOffsets();
  for (let li = 0; li < layout.lettersOrder.length; li++){
    const letterKey = layout.lettersOrder[li];
    const rows = layout.letters[letterKey];
    const baseX = layout.letterX[li] * tEff + offsets[li];
    for (let r = 0; r < rows.length; r++){
      const y = rowYsCanvas[r] ?? (rowPitchNow * r + rowPitchNow * 0.5);
      for (const seg of rows[r]){
        const x2 = baseX + seg.rightRel * layout.scale * widthFactor;
        const x1 = x2 - seg.runLen * layout.scale;
        stroke(0,180,0); line(x1, y, x2, y);
        noStroke(); fill(255,0,0); circle(x2, y, 3);
      }
    }
  }
  pop();
}