// ===== Params =====
const WORD   = "ALBION";
const NUM_ROWS = 12;
const THICK    = 10;
const TAPER    = 0.55;
const PAD      = 40;

const LEN_FACTOR    = 1; // hou dash iets binnen de letter
const LEN_MAX_RATIO = 1; // cap tov letterbreedte
let BRIDGE        = 0;    // overbrug kleine witte gaten (px)

// ===== Globals =====
let pg, layout, font;

let DEBUG = false;

function preload(){
  font = loadFont('Machine-Bold.otf', () => {}, err => console.error(err));
}

function setup() {
  createCanvas(900, 300, SVG);
  pixelDensity(1);
  noLoop();
  layout = buildLayout(WORD);
}

function draw() {
  background(255);
  text("ALBION", 50, 0);
  translate(PAD, PAD);
  fill(0);
  noStroke();

  for (let li = 0; li < layout.lettersOrder.length; li++) {
    const rows  = layout.letters[ layout.lettersOrder[li] ];
    const baseX = layout.letterX[li];
    const maxW  = layout.letterW[li] * LEN_MAX_RATIO * layout.scale;

    for (let r = 0; r < rows.length; r++) {
      const cy = r * layout.rowPitch + layout.rowPitch * 0.5;
      const spans = rows[r];
      for (const seg of spans) {
        const rightEdgeCanvas = baseX + seg.rightRel * layout.scale;
        let dashW = seg.runLen * layout.scale * LEN_FACTOR; // dynamisch per span
        dashW = min(dashW, maxW);
        const cx = rightEdgeCanvas - dashW * 0.5;
        roundedTaperDash(cx, cy, dashW, THICK, -1, 0.28); // tipRatio ~ 0.2–0.35
      }
    }
  }

  if (DEBUG) drawDebugOverlay();

  // save('albion_dynamic.svg'); // desgewenst export
}

/* ====== Helpers ====== */

// vector streepje: ronde kant aan "base", punt aan "tip"
function taperedDash(cx, cy, w, h, dir = -1, taper = 0.4) {
  const r = h * 0.5, half = w * 0.5;
  const baseCx = cx - dir * (half - r);
  const tipX   = cx + dir * half;
  circle(baseCx, cy, h);
  beginShape();
  vertex(baseCx, cy - r);
  vertex(baseCx, cy + r);
  vertex(tipX,   cy);
  endShape(CLOSE);
}

function roundedDash(cx, cy, w, h) {
  // draw a centered horizontal capsule using a stroked line with round caps
  // relies on stroke(0), strokeWeight(h), strokeCap(ROUND)
  line(cx - w * 0.5, cy, cx + w * 0.5, cy);
}

function roundedTaperDash(cx, cy, w, h, dir = -1, tipRatio = 0.25) {
  // Big round butt radius and smaller rounded tip radius
  const R = h * 0.5;
  const r = Math.max(0.01, R * tipRatio);
  const half = w * 0.5;

  // Centers of the two end-caps
  const bx = cx - dir * (half - R); // big end (right when dir=-1)
  const sx = cx + dir * (half - r); // small rounded tip (left when dir=-1)

  // Connect with a straight-sided quad between top and bottom tangents
  beginShape();
  // top edge from big to small
  vertex(bx, cy - R);
  vertex(sx, cy - r);
  // bottom edge back from small to big
  vertex(sx, cy + r);
  vertex(bx, cy + R);
  endShape(CLOSE);

  // Draw the two end caps
  circle(bx, cy, 2 * R);
  circle(sx, cy, 2 * r);
}

// is deze pixel "inkt" (zwart) in een p5.Graphics buffer?
function ink(g, x, y) {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return false;
  const idx = 4 * (y * g.width + (x | 0));
  // hogere drempel pakt anti-alias mee (werkt beter bij dunne/mono fonts)
  return g.pixels[idx] < 160;
}

function scanSpansInRange(g, y, x1, x2) {
  const spans = [];
  const yi = Math.max(0, Math.min(g.height - 1, y | 0)); // clamp één keer
  let inside = false, s = 0, gap = 0;
  for (let x = x1; x <= x2; x++) {
    const on = ink(g, x, yi);
    if (on) {
      if (!inside) { inside = true; s = x; gap = 0; }
      else gap = 0;
    } else if (inside) {
      gap++;
      if (gap > BRIDGE) {
        const e = x - gap;           // laatste echte inkt
        if (e >= s) spans.push([s, e + 1]); // [start, endExclusive]
        inside = false; gap = 0;
      }
    }
  }
  // als we op het eind nog "inside" zijn, sluit af
  if (inside) spans.push([s, x2 + 1]);
  return spans;
}

function drawDebugOverlay(){
  // Draw letter ranges and spans as vectors on the SVG canvas for inspection
  push();
  // light overlay
  noFill(); stroke(0, 60); strokeWeight(1);

  // show rows
  for (let r = 0; r < layout.rowsY.length; r++) {
    const cy = r * layout.rowPitch + layout.rowPitch * 0.5;
    line(0, cy, width, cy);
  }

  // show letter boxes
  stroke(0, 160);
  for (let i = 0; i < layout.ranges.length; i++){
    const rx1 = layout.letterX[i];
    const rw  = layout.letterW[i] * layout.scale;
    rect(rx1, 0, rw, layout.rowsY.length * layout.rowPitch);
  }

  // show spans (green) and right edges (red)
  for (let li = 0; li < layout.lettersOrder.length; li++){
    const rows = layout.letters[ layout.lettersOrder[li] ];
    const baseX = layout.letterX[li];
    for (let r = 0; r < rows.length; r++){
      const cy = r * layout.rowPitch + layout.rowPitch * 0.5;
      for (const seg of rows[r]){
        const x1 = baseX + (seg.rightRel - seg.runLen) * layout.scale;
        const x2 = baseX + seg.rightRel * layout.scale;
        stroke(0,180,0); line(x1, cy, x2, cy);
        noStroke(); fill(255,0,0); circle(x2, cy, 3);
      }
    }
  }
  pop();
}

/* ====== Tekst -> layout ====== */
function buildLayout(word) {
  // render groot naar offscreen bitmap (ruimer) en zonder anti-alias
  const PW = 2600, PH = 700;
  pg = createGraphics(PW, PH);

  pg.pixelDensity(1);
  pg.noSmooth();               // ★ geen anti-alias in de scanbuffer
  pg.background(255);
  pg.fill(0);
  pg.noStroke();
  if (font) pg.textFont(font); else pg.textFont('sans-serif');
  pg.textAlign(LEFT, BASELINE);

  // --- AUTO-FIT FONT SIZE ---
  // target: gebruik max 70% van bufferhoogte (asc+dsc) en max 80% van bufferbreedte (totaal woord)
  let FS = Math.floor(PH * 0.5); // startgok
  let total = Infinity, asc = 0, dsc = 0, widths = [];
  for (let iter = 0; iter < 8; iter++) { // een paar iteraties is genoeg
    pg.textSize(FS);
    asc = pg.textAscent();
    dsc = pg.textDescent();
    widths = [];
    total = 0;
    for (const ch of word) { const w = pg.textWidth(ch); widths.push(w); total += w; }
    const fitH = (PH * 0.70) / (asc + dsc);
    const fitW = (PW * 0.80) / total;
    const fit  = Math.min(fitH, fitW, 1.0);
    const nextFS = Math.max(8, Math.floor(FS * fit));
    if (Math.abs(nextFS - FS) < 1) break;
    FS = nextFS;
  }

  const baseline = (PH + asc - dsc) * 0.5;
  const startX   = (PW - total) * 0.5;

  // teken elk teken afzonderlijk op exact de pen-positie
  const letterX = [];
  let pen = startX;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    letterX.push(pen);
    pg.text(ch, pen, baseline);
    pen += widths[i];
  }
  pg.loadPixels();

  if (DEBUG && keyIsDown(80)) { // 'P'
    // wanneer je op P drukt en redrawt, slaat hij de buffer op
    try { pg.save('debug-pg.png'); } catch(e) { /* ignore in SVG mode */ }
  }

  // scan-rijen (robust): kies een band die ruim om de x-hoogte valt
  let bandTop = baseline - asc * 0.92;  // iets boven cap-height
  let bandBot = baseline + dsc * 1.04;  // iets onder descenders

  // clamp binnen buffer
  bandTop = Math.max(0, Math.min(PH - 1, bandTop));
  bandBot = 100;
  // zorg dat top < bot; zoniet, swap (anders lijkt tekst “ondersteboven”)
  if (bandTop > bandBot) { const t = bandTop; bandTop = bandBot; bandBot = t; }

  const rowsY = [];
  for (let r = 0; r < NUM_ROWS; r++) {
    rowsY.push( lerp(bandTop, bandBot, (r + 0.5) / NUM_ROWS) );
  }

  const ranges = widths.map((w, i) => {
    const x1 = Math.floor(letterX[i]);
    const x2 = Math.ceil(letterX[i] + w) - 1;
    return { x1, x2 };
  });

  // data containers
  const lettersOrder = [...word];
  const perLetter = {};
  lettersOrder.forEach(ch => perLetter[ch] = Array.from({ length: NUM_ROWS }, () => []));

  // scan alle rijen, per letter alle spans pakken
  for (let r = 0; r < NUM_ROWS; r++) {
    const y = rowsY[r];
    for (let li = 0; li < ranges.length; li++) {
      const { x1, x2 } = ranges[li];
      const spans = scanSpansInRange(pg, y, x1, x2);
      for (const [s, e] of spans) {
        const rightRel = (e - 1) - x1; // rechter rand t.o.v. letter-begin
        const runLen   = (e - s);      // zwarte lengte naar links
        perLetter[word[li]][r].push({ rightRel, runLen });
      }
    }
  }

  // schaal naar SVG-canvas
  const scale    = (width  - 2 * PAD) / total;
  const rowPitch = (height - 2 * PAD) / NUM_ROWS;

  return {
    letters: perLetter,
    lettersOrder,
    letterX: letterX.map(X => (X - startX) * scale),
    letterW: widths,
    scale, rowPitch,
    // debug extras
    rowsY, // array length only used for count; y positions are normalized in draw
    ranges: ranges
  };
}

function keyPressed(){
  if (key === 'P') {
    layout = buildLayout(WORD);
    redraw();
  }
}