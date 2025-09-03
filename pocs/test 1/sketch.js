/******************************
 * ALBION logo
 ******************************/

// ====== CONFIG ======
const TEXT              = "ALBION";
const ROWS              = 12;
const LINE_HEIGHT       = 8;
const TIP_RATIO         = 0.25;
const PADDING           = 40;        // canvas padding
const DISPLACEMENT_LVL  = 1;
const DISPLACE_UNIT     = 20;        // px per row step for displacement

// Scan behavior
const BRIDGE_PIXELS     = 0;         // allow bridging small white gaps (0 = off)
const INK_THRESHOLD     = 160;       // 0..255: darker considered ink in pg buffer

// Offscreen buffer + auto-fit targets
const BUFFER_W          = 2600;
const BUFFER_H          = 700;
const FIT_HEIGHT_FRAC   = 0.70;      // asc+dsc should use ≤ this of buffer height
const FIT_WIDTH_FRAC    = 0.80;      // total word width ≤ this of buffer width

// Vertical scan band (relative to asc/desc around baseline)
const BAND_TOP_FACTOR   = 0.92;      // baseline - asc * factor
const BAND_BOT_FACTOR   = 1.04;      // baseline + desc * factor

// Interface
const interfaceX = 50;
const interfaceY = 220;

// Font file (set to null to use system sans-serif)
const FONT_PATH         = 'Machine-Bold.otf';

// ====== STATE ======
let glyphBuffer;      // offscreen p5.Graphics used for scanning
let layout;           // computed positions + spans
let loadedFont;
let rowsSetting = ROWS;
let sliderRows;
let lineThickness = LINE_HEIGHT;
let heightScale   = 1.0;
let dispStep = 1;                    // -N..+N → per-row shift = dispStep * DISPLACE_UNIT * rowIndex
let sliderThickness, sliderHeight, sliderDisplacement;
const DEBUG = false;

let baseRowPitch;   // baseline row pitch derived at startup
let rowsBaseline;   // rows count at startup; canvas height scales only with this

// UI canvas (separate)
let mainCanvas;
let uiHolder;
let uiWidth = 360;
let uiHeight = 130;
let uiP5 = null;             // p5 instance for the UI canvas (instance mode)

let rowYsCanvas = []; // y-position of each row in canvas coordinates

function desiredCanvasHeight(){
  return Math.ceil(PADDING * 2 + baseRowPitch * rowsBaseline * heightScale);
}

function positionUI(){
  if (!mainCanvas || !uiHolder) return;
  uiHolder.position(mainCanvas.width + 20, 0); // directly under main canvas
  positionControls();
  redrawUI();
}

function positionControls(){
  if (!uiHolder) return;
  const left = uiHolder.position.x + 12;
  const top  = 16;
  if (sliderRows)           { sliderRows.parent(uiHolder);           sliderRows.position(left, top); }
  if (sliderThickness)      { sliderThickness.parent(uiHolder);      sliderThickness.position(left, top + 28); }
  if (sliderHeight)         { sliderHeight.parent(uiHolder);         sliderHeight.position(left, top + 56); }
  if (sliderDisplacement)   { sliderDisplacement.parent(uiHolder);   sliderDisplacement.position(left, top + 84); }
  // ensure sliders are on top of the UI canvas
  if (sliderRows)           sliderRows.style('z-index', '1000');
  if (sliderThickness)      sliderThickness.style('z-index', '1000');
  if (sliderHeight)         sliderHeight.style('z-index', '1000');
  if (sliderDisplacement)   sliderDisplacement.style('z-index', '1000');
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
  rowsBaseline = rowsSetting; // lock baseline to initial rows
  noLoop();
  layout = buildLayout(TEXT);
  initInterface();
  resizeCanvas(width, desiredCanvasHeight(), true);
  positionUI();

  // Create UI holder + UI canvas (instance-mode p5)
  if (uiHolder) uiHolder.remove();
  uiHolder = createDiv();
  uiHolder.style('width', uiWidth + 'px');
  uiHolder.style('height', uiHeight + 'px');
  uiHolder.style('padding', '0');
  uiHolder.style('margin', '0');

  // Second p5 instance for the UI canvas
  uiP5 = new p5((p) => {
    p.setup = function(){
      const cnv = p.createCanvas(uiWidth, uiHeight);
      cnv.parent(uiHolder);
      p.frameRate(12); // light loop so labels always reflect latest values
    };
    p.draw = function(){
      p.background(250);
      p.noStroke(); p.fill(0); p.textSize(12); p.textAlign(p.LEFT, p.TOP);
      p.text(`Rows: ${rowsSetting}`, 12, 4);
      p.text(`Line: ${lineThickness}px`, 12, 33);
      p.text(`Height: ${Math.round(heightScale*100)}%`, 12, 62);
      p.text(`Displace: ${dispStep} steps (×${DISPLACE_UNIT}px/step)`, 12, 90);
    };
  });

  redrawUI();

  // Place UI under the main canvas and align sliders with it
  positionUI();

  noLoop();
  redraw();
}

function draw(){
  background(250);
  translate(PADDING, PADDING);
  fill(0); noStroke();

  // compute row centers (canvas space) and store for later use
  const rowPitchNow = (height - 2 * PADDING) / rowsSetting;
  rowYsCanvas = Array.from({ length: rowsSetting }, (_, r) => r * rowPitchNow + rowPitchNow * 0.5);

  for (let li = 0; li < layout.lettersOrder.length; li++){
    const letterKey = layout.lettersOrder[li];
    const rowsForLetter = layout.letters[letterKey];
    const baseX = layout.letterX[li];

    for (let r = 0; r < rowsForLetter.length; r++){
      const y = rowYsCanvas[r];
      for (const span of rowsForLetter[r]){
        const rightEdgeX = baseX + span.rightRel * layout.scale; // canvas units
        const dashLen    = Math.max(0, span.runLen * layout.scale);
        // Displacement by snapped intervals across rows.
        // We compute a step index = round( (r/(rows-1)) * dispStep )
        // Then shift by stepIndex * DISPLACE_UNIT. This keeps the logo straight
        // but only moves rows at a few discrete intervals.
        let xShift = 0;
        if (dispStep !== 0){
          const denom = Math.max(1, rowsSetting - 1);
          const t = r / denom; // 0..1 over rows
          const stepIndex = Math.round(t * dispStep); // signed steps
          xShift = stepIndex * DISPLACE_UNIT;
        }
        drawRoundedTaper(rightEdgeX + xShift, y, dashLen, lineThickness, TIP_RATIO);
      }
    }
  }

  drawInterface();
  if (DEBUG) drawDebugOverlay();
  positionUI();
}

// ====== DRAWING ======

function drawRoundedTaper(rightX, cy, len, h, tipRatio = 0.25){
  const R = h * 0.5;                   // big round end radius
  const r = Math.max(0.01, R * tipRatio); // small tip radius

  // Center of big circle is R left from the rightmost edge
  const bigX = rightX - R;

  // Separation between circle centers. Ensure non-negative to avoid flipping.
  const centerSep = Math.max(0, len - (R + r));
  const tipX = bigX - centerSep;  // tip center to the left

  // Connect tangents with a quad
  beginShape();
  vertex(bigX, cy - R);
  vertex(tipX, cy - r);
  vertex(tipX, cy + r);
  vertex(bigX, cy + R);
  endShape(CLOSE);

  // Caps
  circle(bigX, cy, 2 * R);
  circle(tipX, cy, 2 * r);
}

function drawStraightTaper(rightX, cy, len, h){
  const R = h * 0.5;
  const r = 0;

  // Center of big circle is R left from the rightmost edge
  const bigX = rightX - R;

  // Separation between circle centers. Ensure non-negative to avoid flipping.
  const centerSep = Math.max(0, len - (R + r));
  const tipX = bigX - centerSep;  // tip center to the left

  // Connect tangents with a quad
  beginShape();
  vertex(bigX, cy - R);
  vertex(tipX, cy - r);
  vertex(tipX, cy + r);
  vertex(bigX, cy + R);
  endShape(CLOSE);
}

// ====== SCANNING HELPERS ======
function isInk(g, x, y){
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return false;
  const idx = 4 * (y * g.width + (x | 0));
  return g.pixels[idx] < INK_THRESHOLD; // sample red channel
}

function scanRowInRange(g, y, x1, x2){
  // Returns [ [start, endExclusive], ... ] across [x1,x2]
  const spans = [];
  const yi = Math.max(0, Math.min(g.height - 1, y | 0));
  let inside = false, start = 0, gap = 0;
  for (let x = x1; x <= x2; x++){
    const on = isInk(g, x, yi);
    if (on){
      if (!inside){ inside = true; start = x; gap = 0; } else gap = 0;
    } else if (inside){
      gap++;
      if (gap > BRIDGE_PIXELS){
        const e = x - gap; if (e >= start) spans.push([start, e + 1]);
        inside = false; gap = 0;
      }
    }
  }
  if (inside) spans.push([start, x2 + 1]);
  return spans;
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

  // 4) Prepare vertical scan band
  let bandTop = baseline - asc * BAND_TOP_FACTOR;
  let bandBot = baseline + desc * BAND_BOT_FACTOR;
  bandTop = Math.max(0, Math.min(BUFFER_H - 1, bandTop));
  bandBot = 100;
  if (bandTop > bandBot){ const t = bandTop; bandTop = bandBot; bandBot = t; }

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
      const spans = scanRowInRange(glyphBuffer, y, x1, x2);
      for (const [s, e] of spans){
        const rightRel = (e - 1) - x1; // right edge relative to letter start
        const runLen   = (e - s);      // black run length from right → left
        perLetter[word[li]][r].push({ rightRel, runLen });
      }
    }
  }

  // 6) Map to output canvas coordinates
  const scale    = (width  - 2 * PADDING) / totalW;
  const rowPitch = (height - 2 * PADDING) / rowsCount;

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
    layout = buildLayout(TEXT, rowsSetting);
    redraw();
    positionUI();
    redrawUI();
  });

  sliderThickness = createSlider(1, 40, lineThickness, 1);
  sliderThickness.style('width', '180px');
  sliderThickness.input(() => { lineThickness = sliderThickness.value(); redraw(); positionUI(); redrawUI(); });

  sliderHeight = createSlider(50, 200, Math.round(heightScale * 100), 1);
  sliderHeight.style('width', '180px');
  sliderHeight.input(() => {
    heightScale = sliderHeight.value() / 100;
    resizeCanvas(width, desiredCanvasHeight(), true);
    redraw();
    positionUI();
    redrawUI();
  });

  // Displacement step (−4 .. +4); −1 = 30px/rij naar links, +1 = 30px/rij naar rechts
  sliderDisplacement = createSlider(-4, 4, dispStep, 1);
  sliderDisplacement.style('width', '180px');
  sliderDisplacement.input(() => {
    dispStep = sliderDisplacement.value();
    redraw();
    positionUI();
    redrawUI();
  });

  positionControls();
}

// ====== DEBUG OVERLAY ======
function drawDebugOverlay(){
  push();
  noFill(); stroke(0, 60); strokeWeight(1);
  // row guides
  for (let r = 0; r < layout.rowsY.length; r++){
    const y = rowYsCanvas[r] ?? ((height - 2 * PADDING) / rowsSetting) * r + ((height - 2 * PADDING) / rowsSetting) * 0.5;
    line(0, y, width, y);
  }
  // letter boxes
  stroke(0, 160);
  for (let i = 0; i < layout.ranges.length; i++){
    const lx = layout.letterX[i];
    const lw = layout.letterW[i] * layout.scale;
    const rowPitchNow2 = (height - 2 * PADDING) / rowsSetting;
    rect(lx, 0, lw, layout.rowsY.length * rowPitchNow2);
  }
  // scanned spans + right edges
  for (let li = 0; li < layout.lettersOrder.length; li++){
    const letterKey = layout.lettersOrder[li];
    const rows = layout.letters[letterKey];
    const baseX = layout.letterX[li];
    for (let r = 0; r < rows.length; r++){
      const y = rowYsCanvas[r] ?? ((height - 2 * PADDING) / rowsSetting) * r + ((height - 2 * PADDING) / rowsSetting) * 0.5;
      for (const seg of rows[r]){
        const x2 = baseX + seg.rightRel * layout.scale;
        const x1 = x2 - seg.runLen * layout.scale;
        stroke(0,180,0); line(x1, y, x2, y);
        noStroke(); fill(255,0,0); circle(x2, y, 3);
      }
    }
  }
  pop();
}