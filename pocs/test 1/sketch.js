/******************************
 * ALBION logo
 * - Font-render → scan per row per letter
 * - Dashes start at right edge, length = local run of ink
 * - Rounded tapered tip (no sharp point)
 ******************************/

// ====== CONFIG ======
const TEXT              = "ALBION"; // word to render
const ROWS              = 12;        // number of horizontal stripes
const LINE_HEIGHT       = 8;         // dash thickness (px in output canvas)
const TIP_RATIO         = 0.25;      // 0..1: small cap radius relative to big cap
const PADDING           = 40;        // canvas padding

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
let loadedFont;       // p5.Font
let rowsSetting = ROWS; // mutable rows count controlled by UI
let sliderRows;         // p5 DOM slider instance
const DEBUG = false;  // set true to draw overlay

function preload(){
  if (FONT_PATH) loadedFont = loadFont(FONT_PATH, () => {}, err => console.error(err));
}

function setup(){
  createCanvas(800, 250, SVG);
  pixelDensity(1);
  noLoop();
  layout = buildLayout(TEXT);
  initInterface();
}

function draw(){
  background(255);
  translate(PADDING, PADDING);
  fill(0); noStroke();

  for (let li = 0; li < layout.lettersOrder.length; li++){
    const letterKey = layout.lettersOrder[li];
    const rowsForLetter = layout.letters[letterKey];
    const baseX = layout.letterX[li];

    for (let r = 0; r < rowsForLetter.length; r++){
      const y = r * layout.rowPitch + layout.rowPitch * 0.5;
      for (const span of rowsForLetter[r]){
        const rightEdgeX = baseX + span.rightRel * layout.scale; // canvas units
        const dashLen    = Math.max(0, span.runLen * layout.scale);
        drawRoundedTaper(rightEdgeX, y, dashLen, LINE_HEIGHT, TIP_RATIO);
      }
    }
  }

  drawInterface();
  if (DEBUG) drawDebugOverlay();
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
    // debug extras
    rowsY,
    ranges
  };
}

// ====== INTERFACE ======
function initInterface(){
  // Slider: rows (3..100)
  sliderRows = createSlider(5, 50, rowsSetting, 1);
  sliderRows.position(interfaceX, interfaceY+20);
  sliderRows.style('width', '100px');
  sliderRows.input(() => {
    rowsSetting = sliderRows.value();
    layout = buildLayout(TEXT, rowsSetting);
    redraw();
  });
}

function drawInterface(){
  // simple HUD label in the canvas
  push();
  resetMatrix();
  fill(0); noStroke(); textSize(12); textAlign(LEFT, TOP);
  text(`Rows: ${rowsSetting}`, 50, height - 24);
  pop();
}

// ====== DEBUG OVERLAY ======
function drawDebugOverlay(){
  push();
  noFill(); stroke(0, 60); strokeWeight(1);
  // row guides
  for (let r = 0; r < layout.rowsY.length; r++){
    const y = r * layout.rowPitch + layout.rowPitch * 0.5;
    line(0, y, width, y);
  }
  // letter boxes
  stroke(0, 160);
  for (let i = 0; i < layout.ranges.length; i++){
    const lx = layout.letterX[i];
    const lw = layout.letterW[i] * layout.scale;
    rect(lx, 0, lw, layout.rowsY.length * layout.rowPitch);
  }
  // scanned spans + right edges
  for (let li = 0; li < layout.lettersOrder.length; li++){
    const letterKey = layout.lettersOrder[li];
    const rows = layout.letters[letterKey];
    const baseX = layout.letterX[li];
    for (let r = 0; r < rows.length; r++){
      const y = r * layout.rowPitch + layout.rowPitch * 0.5;
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