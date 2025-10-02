// ====== CONFIG ======
const LOGO_TEXT                = "ALBION";
const ROWS_DEFAULT             = 12;
const LINE_HEIGHT              = 10;

const TIP_RATIO_DEFAULT        = 0.3;
const DISPLACE_UNIT_DEFAULT    = 28;
const GAP_PX_DEFAULT           = 9;
const DISPLACE_GROUPS_DEFAULT  = 2;
const TAPER_MODE_DEFAULT       = 'rounded';
const DEBUG_MODE_DEFAULT       = false;
const WIDTH_SCALE_DEFAULT      = 1.1;
const H_WAVE_AMP_DEFAULT       = 0;
const LOGO_SCALE_DEFAULT       = 1.0;
const ASPECT_W_DEFAULT         = 16;
const ASPECT_H_DEFAULT         = 9;
const PRESET_DEFAULT           = 'fit';
const FIT_MODE_DEFAULT         = (PRESET_DEFAULT === 'fit');
const ASPECT_WIDTH_PX_DEFAULT  = 1920;
const ASPECT_HEIGHT_PX_DEFAULT = 1080;
const TIP_RATIO_SLIDER_STEP    = 0.01;

const PER_LETTER_STRETCH_DEFAULT      = true;
const MOUSE_STRETCH_SIGMA_FRAC_DEFAULT = 0.15;
const MOUSE_AMPLITUDE_DEFAULT         = 1.0;
const MOUSE_CURVE_DEFAULT             = 'sine';
const MOUSE_POWER_DEFAULT             = 1.0;

const KEEP_TOTAL_WIDTH_DEFAULT = true;
const BG_LINES_DEFAULT         = false;

// Transparent background toggle
let BG_TRANSPARENT = false;

const REPEAT_ENABLED_DEFAULT        = false;
const REPEAT_MIRROR_DEFAULT         = false;
const REPEAT_EXTRA_ROWS_DEFAULT     = 0;
// Falloff repeat mode
const REPEAT_FALLOFF_DEFAULT  = 1.0;       // 1.0 = uniform (no falloff); <1.0 = aflopend
const REPEAT_MODE_DEFAULT     = 'uniform'; // 'uniform' | 'falloff'

const COLOR_BACKGROUND_DEFAULT = '#ffffff';
const COLOR_LOGO_DEFAULT       = '#000000';
const COLOR_LINES_DEFAULT      = '#000000';

const PARAM_EASE_FACTOR        = 0.1;

const ANIM_MODE_DEFAULT   = 'off';
const ANIM_PERIOD_DEFAULT = 3.0;
const AUTO_RANDOM_DEFAULT = false;

let TIP_RATIO        = TIP_RATIO_DEFAULT;
let DISPLACE_UNIT    = DISPLACE_UNIT_DEFAULT;
let ASPECT_W         = ASPECT_W_DEFAULT;
let ASPECT_H         = ASPECT_H_DEFAULT;
let LOGO_TARGET_W    = 0;
let FIT_MODE         = FIT_MODE_DEFAULT;
const FIT_FRACTION = 0.75;
const BLOCK_STEPS = 4; // fixed number of blocks for block taper
const BLOCK_MIN_LEN_FRAC = 0.55; // leftmost block length as fraction of its segment
const BLOCK_LEAD_FRAC     = 0.65; // how much of the shortened width shifts left (0..1)
const BLOCK_CAP_FRAC      = 0.12; // extra front cap length as fraction of full len

let H_WAVE_AMP = H_WAVE_AMP_DEFAULT;

const TAPER_SPACING = 16; // fixed distance between element centers along the line (layout units)

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

function setValue(el, value){ if (el) el.value = String(value); }
function setText(el, text){ if (el) el.textContent = text; }
function setChecked(el, value){ if (el) el.checked = !!value; }

// ====== STATE ======
let glyphBuffer;      // offscreen p5.Graphics used for scanning
let layout;           // computed positions + spans
let rows = ROWS_DEFAULT;
let rowsTarget = ROWS_DEFAULT;
let rowsAnim = ROWS_DEFAULT;
let linePx = LINE_HEIGHT;
let linePxTarget = LINE_HEIGHT;
// --- Taper switch via height collapse/expand ---
let _lineMul = 1.0;                 // multiplies linePx at draw time (0..1)
let _taperTransActive = false;      // is a taper transition running?
let _taperPhase = 'idle';           // 'idle' | 'shrink' | 'expand'
let _taperPendingMode = null;       // mode to switch to once collapsed
let _taperT0 = 0;                   // phase start timestamp
const TAPER_SHRINK_DUR = 0.05;      // seconds
const TAPER_EXPAND_DUR = 0.1;      // seconds
const MIN_DRAW_HEIGHT  = 2;    // guard to avoid zero-area issues

let elRows, elThickness, elWidth, elGap, elGroups, elDispUnit, elPreset, elLogoScale, elAspectW, elAspectH, elCustomAR, elReset;
let elRowsOut, elThicknessOut, elWidthOut, elGapOut, elDispUnitOut, elGroupsOut, elLogoScaleOut;
let elTaper, elTaperIndex, elTaperIndexOut, elColorPreset, elColorPresetLabel, elRepeatFalloff, elRepeatFalloffOut, elRepeatUniform, elDebug, elAuto;
let elRepeatEnabled, elRepeatExtraRows, elRepeatExtraRowsOut;
let elTipRatio, elTipOut;
let gapPx = GAP_PX_DEFAULT;
let gapPxTarget = GAP_PX_DEFAULT;
let displaceGroupsTarget = DISPLACE_GROUPS_DEFAULT;
let displaceGroupsAnim = DISPLACE_GROUPS_DEFAULT;
let taperMode = TAPER_MODE_DEFAULT;
let debugMode = DEBUG_MODE_DEFAULT;
let widthScale = WIDTH_SCALE_DEFAULT;

let logoScaleMul = LOGO_SCALE_DEFAULT;
let DISPLACE_UNIT_TARGET = DISPLACE_UNIT_DEFAULT;
let TIP_RATIO_TARGET = TIP_RATIO_DEFAULT;
let _layoutDirty = false;

// --- Per-letter stretch (mouseX-weighted) ---
let PER_LETTER_STRETCH = PER_LETTER_STRETCH_DEFAULT;   // toggle on/off
const BASE_STRETCH_MIN = 0.5;    // baseline min per-letter factor when amplitude = 1
const BASE_STRETCH_MAX = 1.5;    // baseline max per-letter factor when amplitude = 1
let MOUSE_STRETCH_MIN  = BASE_STRETCH_MIN;
let MOUSE_STRETCH_MAX  = BASE_STRETCH_MAX;
let MOUSE_STRETCH_SIGMA_FRAC = MOUSE_STRETCH_SIGMA_FRAC_DEFAULT; // Gaussian sigma as fraction of content width
let MOUSE_AMPLITUDE = MOUSE_AMPLITUDE_DEFAULT;       // multiplies stretch delta relative to baseline

let baseRowPitch;
let targetContentH = null; // stays constant; rows change will shrink/grow pitch to keep this height
let targetContentW = null; // fixed reference width for scaling (decouples scale from width/gap)
let EXPORT_W = null; // when preset = custom, desired pixel width
let EXPORT_H = null; // when preset = custom, desired pixel height

// Keep the total logo width constant (sum of letter widths stays fixed)
let KEEP_TOTAL_WIDTH = KEEP_TOTAL_WIDTH_DEFAULT;
let BG_LINES = BG_LINES_DEFAULT;        // toggle via HTML checkbox
let BG_LINES_ALPHA = 255;

let REPEAT_ENABLED = REPEAT_ENABLED_DEFAULT;
let REPEAT_MIRROR = REPEAT_MIRROR_DEFAULT;
let REPEAT_EXTRA_ROWS = REPEAT_EXTRA_ROWS_DEFAULT;
let _repeatExtraRowsMax = Math.max(0, ROWS_DEFAULT - 1);
// Tracks whether the user explicitly set Extra Rows to FULL (sticky across range changes)
let REPEAT_EXTRA_ROWS_IS_FULL = !Number.isFinite(REPEAT_EXTRA_ROWS_DEFAULT) && REPEAT_EXTRA_ROWS_DEFAULT > 0;
// Animated version of EXTRA_ROWS (for eased transitions)
let REPEAT_EXTRA_ROWS_ANIM = (Number.isFinite(REPEAT_EXTRA_ROWS_DEFAULT) ? REPEAT_EXTRA_ROWS_DEFAULT : 0);
let REPEAT_FALLOFF = REPEAT_FALLOFF_DEFAULT;
let REPEAT_MODE    = REPEAT_MODE_DEFAULT;   // 'uniform' or 'falloff'
let COLOR_COMBOS = [];
let activeColorComboIdx = 0;

// ---- Colors ----
let color1 = COLOR_BACKGROUND_DEFAULT;
let color2 = COLOR_LOGO_DEFAULT;
let color3 = COLOR_LINES_DEFAULT;

// --- Color helpers: auto-combo and black detection ---
function normHex(hex){ return String(hex || '').trim().toLowerCase(); }
function isHexBlack(hex){
  const h = normHex(hex);
  return h === '#000000' || h === 'black' || h === '#000' || h === 'rgb(0,0,0)';
}
function nextColorAfter(list, hex){
  if (!Array.isArray(list) || !list.length) return hex;
  const h = normHex(hex);
  const idx = list.findIndex(c => normHex(c) === h);
  if (idx === -1) return list[0];
  return list[(idx + 1) % list.length];
}
function applyColorComboByIndex(idx){
  if (!Array.isArray(COLOR_COMBOS) || !COLOR_COMBOS.length) return;
  const safeIdx = Math.max(0, Math.min(COLOR_COMBOS.length - 1, idx | 0));
  const combo = COLOR_COMBOS[safeIdx];
  activeColorComboIdx = safeIdx;
  color1 = combo.background || COLOR_BACKGROUND_DEFAULT;
  color2 = combo.logo || COLOR_LOGO_DEFAULT;
  color3 = combo.lines || COLOR_LINES_DEFAULT;
}

function sanitizeColor(hex, fallback){
  if (typeof hex === 'string' && hex.trim()) return hex.trim();
  return fallback;
}

// random animate
let lastAutoRandomMs = 0;
const RANDOM_INTERVAL_MS = 1000;
let autoRandomActive = AUTO_RANDOM_DEFAULT;
let autoTimer = null;
function setAuto(on){
  if (autoTimer){ clearInterval(autoTimer); autoTimer = null; }
  if (on){
    autoTimer = setInterval(()=>{ applyRandomTweaks(); }, RANDOM_INTERVAL_MS);
  }
}

let rowYsCanvas = []; // y-position of each row in canvas coordinates
let rowYsSmooth = [];

// --- Curve + Animation controls ---
let MOUSE_CURVE = MOUSE_CURVE_DEFAULT;   // 'sine' | 'smoothstep'
let MOUSE_POWER = MOUSE_POWER_DEFAULT;       // t^power sharpening

let ANIM_MODE = ANIM_MODE_DEFAULT;     // 'mouse' | 'pulse' | 'scan' | 'off'
let animTime = 0;            // seconds
let _animRAF = null;
let _animStart = 0;
let _animLastFrame = 0;
// Animation timing (seconds per full cycle)
let ANIM_PERIOD = ANIM_PERIOD_DEFAULT;            // default: 3s per cycle
const SCAN_MARGIN_FRAC = 0.4; // allow the scan to travel 15% beyond both ends before wrapping

function updateRepeatSlidersRange(){
  if (!layout) return;
  const fit   = computeLayoutFit();
  const innerW = Math.max(1, width);
  const refW   = Math.max(1, targetContentW || fit.contentW0);
  const sBase  = innerW / refW;
  const s      = Math.max(0.01, sBase * FIT_FRACTION * logoScaleMul);
  // Use target rows for capacity so the slider & FULL state react immediately
  const rowsForCapacity = Math.max(1, Math.round(rowsTarget));
  const pitchLayout = (rowsForCapacity <= 1) ? 0 : (targetContentH / (rowsForCapacity - 1));
  const pitchPx = pitchLayout * s;
  const visRowsTotal = Math.max(0, Math.floor(height / Math.max(1e-6, pitchPx)));
  const maxExtra = Math.max(0, Math.floor(visRowsTotal / 2)); // per-side capacity in whole rows
  // Save the old max before updating
  const oldRepeatExtraRowsMax = _repeatExtraRowsMax;
  _repeatExtraRowsMax = maxExtra;

  const disabled = !REPEAT_ENABLED;

  let sliderValue;

  // If user chose FULL, keep it FULL regardless of rows/viewport changes
  if (REPEAT_EXTRA_ROWS_IS_FULL) {
    REPEAT_EXTRA_ROWS = Number.POSITIVE_INFINITY;
    sliderValue = maxExtra;
  } else if (!Number.isFinite(REPEAT_EXTRA_ROWS)) {
    // Safety: coerce to FULL if state was Infinity but flag wasn't set
    REPEAT_EXTRA_ROWS_IS_FULL = true;
    REPEAT_EXTRA_ROWS = Number.POSITIVE_INFINITY;
    sliderValue = maxExtra;
  } else {
    // Clamp numeric value to new range
    sliderValue = Math.max(0, Math.min(REPEAT_EXTRA_ROWS, maxExtra));
    REPEAT_EXTRA_ROWS = sliderValue;
  }

  if (REPEAT_EXTRA_ROWS_IS_FULL || !Number.isFinite(REPEAT_EXTRA_ROWS)){
  if (_repeatExtraRowsMax > oldRepeatExtraRowsMax){
    REPEAT_EXTRA_ROWS_ANIM = _repeatExtraRowsMax; // capaciteit groeide: FULL blijft visueel vol
  }
    // Als capaciteit krimpt, laat smoothToward() rustig afbouwen.
  } else {
  }

  if (elRepeatExtraRows){
    elRepeatExtraRows.min = '0';
    elRepeatExtraRows.max = String(Math.max(0, Math.floor(maxExtra)));
    elRepeatExtraRows.step = '1';
    elRepeatExtraRows.value = String(Math.max(0, Math.floor(sliderValue)));
    elRepeatExtraRows.disabled = disabled;
  }

  if (elRepeatExtraRowsOut){
    if (disabled){
      elRepeatExtraRowsOut.textContent = 'OFF';
    } else if (REPEAT_EXTRA_ROWS_IS_FULL || !Number.isFinite(REPEAT_EXTRA_ROWS) || sliderValue >= maxExtra){
      elRepeatExtraRowsOut.textContent = 'ALL';
    } else {
      elRepeatExtraRowsOut.textContent = String(sliderValue);
    }
  }
}

function startAnimLoop(){
  if (_animRAF) return;
  _animStart = performance.now();
  const step = (t)=>{
    animTime = (t - _animStart) / 1000.0;

    // taper transition logic
    if (_taperTransActive){
      if (_taperPhase === 'shrink'){
        const u = Math.min(1, (t - _taperT0) / (TAPER_SHRINK_DUR * 1000));
        _lineMul = Math.max(0, 1 - u);
        if (u >= 1){
          if (_taperPendingMode){ taperMode = _taperPendingMode; }
          _taperPendingMode = null;
          _taperPhase = 'expand';
          _taperT0 = t;
        }
        requestRedraw();
      } else if (_taperPhase === 'expand'){
        const u = Math.min(1, (t - _taperT0) / (TAPER_EXPAND_DUR * 1000));
        _lineMul = Math.max(0, u);
        if (u >= 1){
          _taperPhase = 'idle';
          _taperTransActive = false;
          _lineMul = 1.0;
        }
        requestRedraw();
      }
    }

    // bij tijdgestuurde animaties altijd redraw
    const timeDriven = (ANIM_MODE === 'pulse' || ANIM_MODE === 'scan' || H_WAVE_AMP !== 0);
    if (timeDriven) requestRedraw();

    if (timeDriven || _taperTransActive){
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

function computeProgressiveBandHeights(avail, fillFrac, count){
  if (!Number.isFinite(avail) || avail <= 1e-6) return [];
  const n = Math.max(0, count | 0);
  if (n <= 0) return [];
  const clampedFill = Math.max(0, Math.min(1, fillFrac));
  if (clampedFill <= 0) return [];

  const weights = new Array(n);
  let sumWeights = 0;
  const exp = Math.max(0, Number.isFinite(REPEAT_WEIGHT_EXP) ? REPEAT_WEIGHT_EXP : REPEAT_WEIGHT_EXP_DEFAULT);
  for (let i = 0; i < n; i++){
    const weight = (exp <= 0)
      ? 1
      : Math.pow((n - i), Math.max(0.1, exp));
    weights[i] = weight;
    sumWeights += weight;
  }
  if (sumWeights <= 0) return [];
  const targets = weights.map(w => avail * (w / sumWeights));

  const scaled = clampedFill * n;
  const fullBands = Math.floor(scaled);
  const partialFrac = scaled - fullBands;

  const heights = [];
  for (let i = 0; i < Math.min(fullBands, n); i++){
    const h = targets[i];
    if (h > 0) heights.push(h);
  }
  if (fullBands < n){
    const partial = targets[fullBands] * partialFrac;
    if (partial > 1e-6) heights.push(partial);
  }
  return heights;
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
  if (curve === 'sine'){
    const z = dAbs / sigma;
    t = Math.exp(-0.5 * z * z);
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

function smoothToward(current, target, ease = PARAM_EASE_FACTOR){
  if (!Number.isFinite(current)) current = 0;
  if (!Number.isFinite(target)) target = current;
  const diff = target - current;
  if (Math.abs(diff) < 1e-3) return { value: target, changed: false, animating: false };
  const next = current + diff * ease;
  if (Math.abs(target - next) < 1e-3){
    return { value: target, changed: true, animating: false };
  }
  return { value: next, changed: true, animating: true };
}

function updateAnimatedParameters(){
  let animating = false;
  let layoutNeedsRebuild = false;

  const lineStep = smoothToward(linePx, linePxTarget);
  if (lineStep.changed) linePx = lineStep.value;
  if (lineStep.animating) animating = true;

  const gapStep = smoothToward(gapPx, gapPxTarget);
  if (gapStep.changed){
    gapPx = gapStep.value;
    layoutNeedsRebuild = true;
  }
  if (gapStep.animating) animating = true;

  const dispStep = smoothToward(DISPLACE_UNIT, DISPLACE_UNIT_TARGET);
  if (dispStep.changed){
    DISPLACE_UNIT = dispStep.value;
    layoutNeedsRebuild = true;
  }
  if (dispStep.animating) animating = true;

  const tipStep = smoothToward(TIP_RATIO, TIP_RATIO_TARGET);
  if (tipStep.changed) TIP_RATIO = tipStep.value;
  if (tipStep.animating) animating = true;

  // Ease the visible repeat extra rows toward the target (Infinity maps to current max)
  const targetExtraNumeric = Number.isFinite(REPEAT_EXTRA_ROWS)
    ? Math.max(0, REPEAT_EXTRA_ROWS)
    : Math.max(0, _repeatExtraRowsMax);
  const extraStep = smoothToward(REPEAT_EXTRA_ROWS_ANIM, targetExtraNumeric);
  if (extraStep.changed) REPEAT_EXTRA_ROWS_ANIM = extraStep.value;
  if (extraStep.animating) animating = true;

  if (layoutNeedsRebuild) _layoutDirty = true;
  if (animating) requestRedraw();
}

function applyRandomTweaks(){
  let mutated = false;

  const setAndDispatch = (el, value, type = 'input') => {
    if (!el) return;
    el.value = String(value);
    el.dispatchEvent(new Event(type, { bubbles: true }));
    mutated = true;
  };

  const maybe = (chance, fn) => {
    if (Math.random() <= chance) fn();
  };

  maybe(0.9, ()=>{
    if (!elRows) return;
    const { min, max, step } = getInputRange(elRows, 4, 32, 1);
    const val = randFromRangeInt(Math.round(Math.max(1, min)), Math.round(Math.max(min, max)), Math.max(1, Math.round(step || 1)));
    setAndDispatch(elRows, val, 'input');
  });

  maybe(0.8, ()=>{
    if (!elThickness) return;
    const { min, max, step } = getInputRange(elThickness, 1, 25, 1);
    const val = randFromRangeInt(Math.round(Math.max(1, min)), Math.round(Math.max(min, max)), Math.max(1, Math.round(step || 1)));
    setAndDispatch(elThickness, val, 'input');
  });

  maybe(0.75, ()=>{
    if (!elGap) return;
    const { min, max, step } = getInputRange(elGap, -20, 150, 1);
    const val = randFromRangeInt(min, Math.min(150, max), Math.max(0.1, step || 1));
    setAndDispatch(elGap, val, 'input');
  });

  maybe(0.75, ()=>{
    if (!elWidth) return;
    const { min, max, step } = getInputRange(elWidth, 10, 150, 1);
    const pct = randFromRangeInt(Math.max(10, min), Math.min(150, max), Math.max(0.1, step || 1));
    setAndDispatch(elWidth, pct, 'input');
  });

  maybe(0.7, ()=>{
    if (!elDispUnit) return;
    const { min, max, step } = getInputRange(elDispUnit, 0, 80, 1);
    const val = randFromRangeInt(Math.max(0, min), Math.max(min, max), Math.max(0.1, step || 1));
    setAndDispatch(elDispUnit, val, 'input');
  });

  maybe(0.7, ()=>{
    if (!elTipRatio) return;
    const { min, max, step } = getInputRange(elTipRatio, 0, 1, 0.01);
    const val = randFromRangeInt(Math.max(0, min), Math.min(1, max), Math.max(0.001, step || 0.01));
    setAndDispatch(elTipRatio, Number(val.toFixed(2)), 'input');
  });

  maybe(0.6, ()=>{
    if (!elTaperIndex) return;
    const { min, max } = getInputRange(elTaperIndex, 1, 5, 1);
    const val = randInt(Math.round(Math.max(1, min)), Math.round(Math.max(min, max)) || 5);
    setAndDispatch(elTaperIndex, val, 'input');
  });

  maybe(0.65, ()=>{
    if (!elGroups) return;
    const min = parseInt(elGroups.min || '0', 10) || 0;
    const max = parseInt(elGroups.max || '0', 10) || 0;
    if (max >= min) setAndDispatch(elGroups, randInt(min, max), 'input');
  });

  maybe(0.6, ()=>{
    if (!elColorPreset) return;
    const count = elColorPreset.options ? elColorPreset.options.length : 0;
    if (count <= 0) return;
    let idx = randInt(0, count - 1);
    if (count > 1 && idx === activeColorComboIdx) idx = (idx + 1) % count;
    setAndDispatch(elColorPreset, idx, 'change');
  });

  if (!mutated){
    if (elRows){
      const { min, max, step } = getInputRange(elRows, 4, 32, 1);
      const val = randFromRangeInt(Math.round(Math.max(1, min)), Math.round(Math.max(min, max)), Math.max(1, Math.round(step || 1)));
      setAndDispatch(elRows, val, 'input');
    } else {
      requestRedraw();
    }
  }

  return mutated;
}


function preload(){
  const rawCombos = Array.isArray(window.COLOR_COMBINATIONS) ? window.COLOR_COMBINATIONS : [];
  COLOR_COMBOS = rawCombos
    .map((combo, idx) => {
      if (!combo) return null;
      const background = sanitizeColor(combo.background || combo.bg, COLOR_BACKGROUND_DEFAULT).toUpperCase();
      const logo = sanitizeColor(combo.logo || combo.foreground, COLOR_LOGO_DEFAULT).toUpperCase();
      const lines = sanitizeColor(combo.lines || combo.accent, COLOR_LINES_DEFAULT).toUpperCase();
      const label = combo.label ? String(combo.label) : `Preset ${idx + 1}`;
      const id = combo.id ? String(combo.id) : `combo-${idx}`;
      return { id, label, background, logo, lines };
    })
    .filter(Boolean);
  if (!COLOR_COMBOS.length){
    COLOR_COMBOS = [{
      id: 'combo-0',
      label: 'Default',
      background: sanitizeColor(color1, COLOR_BACKGROUND_DEFAULT).toUpperCase(),
      logo: sanitizeColor(color2, COLOR_LOGO_DEFAULT).toUpperCase(),
      lines: sanitizeColor(color3, COLOR_LINES_DEFAULT).toUpperCase()
    }];
  }
  applyColorComboByIndex(0);
  const uniq = Array.from(new Set(LOGO_TEXT.split('').map(c => c.toUpperCase())));
  uniq.forEach(ch => {
    const p = LETTERS_PATH + ch + '.svg';
    glyphImgs[ch] = loadImage(p, img => { glyphDims[ch] = { w: img.width, h: img.height }; }, err => console.error('Failed to load', p, err));
  });
}

function modeFromIndex(idx){
  switch((idx|0)){
    case 1: return 'Rounded';
    case 2: return 'Straight';
    case 3: return 'Circles';
    case 4: return 'Blocks';
    case 5: return 'Pluses';
    default: return 'Rounded';
  }
}
function modeToIndex(mode){
  switch(String(mode||'rounded').toLowerCase()){
    case 'Rounded':  return 1;
    case 'Straight': return 2;
    case 'Circles':  return 3;
    case 'Blocks':   return 4;
    case 'Pluses':   return 5;
    default:         return 1;
  }
}
function triggerTaperSwitch(nextMode){
  const target = String(nextMode||'Rounded');
  if (target === taperMode){ return; }
  _taperPendingMode = target;
  _taperTransActive = true;
  _taperPhase = 'shrink';
  _taperT0 = performance.now();
  startAnimLoop();
}

function setup(){
  const elHWaveAmp = document.getElementById('hWaveAmp');
  const elHWaveAmpOut = document.getElementById('hWaveAmpOut');
  if (elHWaveAmp){
    elHWaveAmp.value = String(H_WAVE_AMP);
    if (elHWaveAmpOut) elHWaveAmpOut.textContent = H_WAVE_AMP.toFixed(2) + '×';
    elHWaveAmp.addEventListener('input', ()=>{
      const v = parseFloat(elHWaveAmp.value);
      if (Number.isFinite(v)){
        H_WAVE_AMP = v;
        if (elHWaveAmpOut) elHWaveAmpOut.textContent = v.toFixed(2) + '×';
        requestRedraw();
        startAnimLoop();
      }
    });
  }
  // Warp controls
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
  elRows         = byId('rows');
  elThickness    = byId('thickness');
  elWidth        = byId('widthScale');
  elGap          = byId('gap');
  elGroups       = byId('groups');
  elGroupsOut    = byId('groupsOut');
  elTaper        = byId('taper');
  elDebug        = byId('debug');
  elAuto         = byId('autorand');
  elRowsOut      = byId('rowsOut');
  elThicknessOut = byId('thicknessOut');
  elWidthOut     = byId('widthOut');
  elGapOut       = byId('gapOut');
  elDispUnit     = byId('dispUnit');
  elDispUnitOut  = byId('dispUnitOut');
  elPreset       = byId('preset');
  elLogoScale    = byId('logoScale');
  elLogoScaleOut = byId('logoScaleOut');
  elTipRatio     = byId('tipRatio');
  elTipOut       = byId('tipOut');
  elAspectW      = byId('aspectW');
  elAspectH      = byId('aspectH');
  elCustomAR     = byId('customAR');
  elReset        = byId('resetDefaults');

  const elBgLines         = byId('bgLines');
  elRepeatEnabled         = byId('repeatEnabled');
  const elRepeatMirror    = byId('repeatMirror');
  elRepeatExtraRows       = byId('repeatExtraRows');
  elRepeatExtraRowsOut    = byId('repeatExtraRowsOut');
  const elRepeatFalloff     = byId('repeatFalloff');
  const elRepeatFalloffOut  = byId('repeatFalloffOut');
  const elRepeatModeUniform = byId('repeatModeUniform');
  const elRepeatModeFalloff = byId('repeatModeFalloff');
  elColorPreset           = byId('colorPreset');
  elColorPresetLabel      = byId('colorPresetLabel');
  const btnCurveSine      = byId('curveSine');
  const btnCurveSmooth    = byId('curveSmooth');
  const powerCtl          = byId('powerCtl');
  const powerOut          = byId('powerOut');
  const animPeriodCtl     = byId('animPeriod');
  const animPeriodOut     = byId('animPeriodOut');

  elTaperIndex = byId('taperIndex');
  elTaperIndexOut = byId('taperIndexOut');

  // Transparent background checkbox
  const elBgTransparent = document.getElementById('bgTransparent');
  if (elBgTransparent){
    elBgTransparent.addEventListener('change', ()=>{
      BG_TRANSPARENT = elBgTransparent.checked;
      requestRedraw();
    });
  }

  function updateUIFromState(){
    if (elColorPreset) elColorPreset.value = String(activeColorComboIdx);
    const widthPct = Math.round(widthScale * 100);
    const logoPct = Math.round(logoScaleMul * 100);

    const rowsDisplay = Math.max(1, Math.round(rowsTarget));
    setValue(elRows, rowsDisplay);
    setText(elRowsOut, rowsDisplay);

    setValue(elThickness, Math.round(linePxTarget));
    setText(elThicknessOut, `${Math.round(linePxTarget)} px`);

    setValue(elWidth, widthPct);
    setText(elWidthOut, `${widthPct} %`);

    setValue(elGap, Math.round(gapPxTarget));
    setText(elGapOut, `${Math.round(gapPxTarget)} px`);

    setValue(elLogoScale, logoPct);
    setText(elLogoScaleOut, `${logoPct} %`);

    setValue(elDispUnit, Math.round(DISPLACE_UNIT_TARGET));
    setText(elDispUnitOut, `${Math.round(DISPLACE_UNIT_TARGET)} px`);

    setValue(elTipRatio, TIP_RATIO_TARGET.toFixed(2));
    setText(elTipOut, TIP_RATIO_TARGET.toFixed(2));

    const dgDisplay = (Math.abs(displaceGroupsTarget - Math.round(displaceGroupsTarget)) < 1e-3)
      ? String(Math.round(displaceGroupsTarget))
      : displaceGroupsTarget.toFixed(2);
    setText(elGroupsOut, dgDisplay);

    if (elTaper) elTaper.value = taperMode;

    if (elTaperIndex){
      elTaperIndex.min = '1';
      elTaperIndex.max = '5';
      elTaperIndex.step = '1';
      elTaperIndex.value = String(modeToIndex(taperMode));
    }
    if (elTaperIndexOut){
      elTaperIndexOut.textContent = modeFromIndex(modeToIndex(taperMode));
    }

    setChecked(elDebug, debugMode);
    setChecked(elAuto, autoRandomActive);

    setChecked(elBgLines, BG_LINES);
    setChecked(elRepeatEnabled, REPEAT_ENABLED);
    setChecked(elRepeatMirror, REPEAT_MIRROR);

    updateRepeatSlidersRange();
    // Repeat falloff + mode (optional controls)
    if (elRepeatFalloff){
      elRepeatFalloff.min = '0';
      elRepeatFalloff.max = '1';
      elRepeatFalloff.step = '0.01';
      elRepeatFalloff.value = REPEAT_FALLOFF.toFixed(2);
    }
    if (elRepeatFalloffOut){
      elRepeatFalloffOut.textContent = REPEAT_FALLOFF.toFixed(2);
    }
    if (elRepeatModeUniform) elRepeatModeUniform.checked = (REPEAT_MODE === 'uniform');
    if (elRepeatModeFalloff) elRepeatModeFalloff.checked = (REPEAT_MODE === 'falloff');
  // Repeat falloff + mode listeners (optional)
  if (elRepeatFalloff){
    elRepeatFalloff.addEventListener('input', ()=>{
      const v = parseFloat(elRepeatFalloff.value);
      if (Number.isFinite(v)){
        REPEAT_FALLOFF = Math.max(0, Math.min(1, v));
        if (elRepeatFalloffOut) elRepeatFalloffOut.textContent = REPEAT_FALLOFF.toFixed(2);
        requestRedraw();
      }
    });
  }
  if (elRepeatModeUniform){
    elRepeatModeUniform.addEventListener('change', ()=>{
      if (elRepeatModeUniform.checked){
        REPEAT_MODE = 'uniform';
        updateUIFromState();
        requestRedraw();
      }
    });
  }
  if (elRepeatModeFalloff){
    elRepeatModeFalloff.addEventListener('change', ()=>{
      if (elRepeatModeFalloff.checked){
        REPEAT_MODE = 'falloff';
        updateUIFromState();
        requestRedraw();
      }
    });
  }

    // Power (amplitude) + Anim period outputs
    if (powerCtl) setValue(powerCtl, MOUSE_AMPLITUDE.toFixed(2));
    if (powerOut) setText(powerOut, MOUSE_AMPLITUDE.toFixed(2));
    if (animPeriodCtl) setValue(animPeriodCtl, ANIM_PERIOD.toFixed(2));
    if (animPeriodOut) setText(animPeriodOut, ANIM_PERIOD.toFixed(2) + ' s');

    if (elPreset) elPreset.value = PRESET_DEFAULT;
    if (elAspectW) elAspectW.value = String(ASPECT_WIDTH_PX_DEFAULT);
    if (elAspectH) elAspectH.value = String(ASPECT_HEIGHT_PX_DEFAULT);

    // Curve buttons
    if (btnCurveSine)   btnCurveSine.addEventListener('click', ()=>{ MOUSE_CURVE='sine'; requestRedraw(); });
    if (btnCurveSmooth) btnCurveSmooth.addEventListener('click',()=>{ MOUSE_CURVE='smoothstep'; requestRedraw(); });

    if (elBgLines){
      elBgLines.checked = BG_LINES;
      elBgLines.addEventListener('change', ()=>{
        BG_LINES = !!elBgLines.checked;
        updateUIFromState();
        requestRedraw();
      });
    }

    if (elRepeatMirror){
      elRepeatMirror.checked = REPEAT_MIRROR;
      elRepeatMirror.addEventListener('change', ()=>{
        REPEAT_MIRROR = !!elRepeatMirror.checked;
        updateUIFromState();
        requestRedraw();
      });
    }
  }

  function updateColorPresetLabel(idx){
    if (!elColorPresetLabel) return;
    if (!Array.isArray(COLOR_COMBOS) || !COLOR_COMBOS.length){
      elColorPresetLabel.textContent = 'Preset';
      return;
    }
    const combo = COLOR_COMBOS[Math.max(0, Math.min(COLOR_COMBOS.length - 1, idx | 0))] || COLOR_COMBOS[0];
    const label = combo.label || `Preset ${idx + 1}`;
    elColorPresetLabel.textContent = `${label} — ${combo.background} / ${combo.logo} / ${combo.lines}`;
  }

  function populateColorPresetSelect(){
    if (!elColorPreset) return;
    elColorPreset.innerHTML = '';
    COLOR_COMBOS.forEach((combo, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = combo.label || `Preset ${idx + 1}`;
      elColorPreset.appendChild(opt);
    });
    elColorPreset.value = String(activeColorComboIdx);
    updateColorPresetLabel(activeColorComboIdx);
  }

  populateColorPresetSelect();
  updateRepeatSlidersRange();
  updateUIFromState();

  if (elRepeatEnabled){
    elRepeatEnabled.addEventListener('change', ()=>{
      REPEAT_ENABLED = !!elRepeatEnabled.checked;
      updateRepeatSlidersRange();
      updateUIFromState();
      requestRedraw();
    });
  }

  if (elRepeatExtraRows){
    elRepeatExtraRows.addEventListener('input', ()=>{
      const raw = parseInt(elRepeatExtraRows.value, 10);
      if (!Number.isFinite(raw)) return;
      if (_repeatExtraRowsMax > 0 && raw >= _repeatExtraRowsMax){
        // User hit the max → mark FULL, laat easing naar capacity gaan
        REPEAT_EXTRA_ROWS_IS_FULL = true;
        REPEAT_EXTRA_ROWS = Number.POSITIVE_INFINITY;
      } else {
        REPEAT_EXTRA_ROWS_IS_FULL = false;
        REPEAT_EXTRA_ROWS = Math.max(0, raw);
      }
      updateRepeatSlidersRange();
      requestRedraw();
    });
  }

  if (elColorPreset){
    elColorPreset.addEventListener('change', ()=>{
      const idx = parseInt(elColorPreset.value, 10);
      const safeIdx = Number.isFinite(idx) ? idx : 0;
      applyColorComboByIndex(safeIdx);
      updateColorPresetLabel(safeIdx);   // ← update label text immediately
      if (elColorPreset) elColorPreset.value = String(activeColorComboIdx); // keep select in sync
      updateUIFromState();
      requestRedraw();
    });
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

  // Amplitude slider (controls stretch intensity around the mouse)
  if (powerCtl){
    const updateAmplitude = ()=>{
      const raw = parseFloat(powerCtl.value);
      const amp = Number.isFinite(raw) ? Math.max(0.1, raw) : MOUSE_AMPLITUDE;
      MOUSE_AMPLITUDE = amp;
      const stretchAbove = (BASE_STRETCH_MAX - 1) * amp;
      const stretchBelow = (1 - BASE_STRETCH_MIN) * amp;
      MOUSE_STRETCH_MAX = 1 + stretchAbove;
      MOUSE_STRETCH_MIN = Math.max(0.05, 1 - stretchBelow);
      window.MOUSE_AMPLITUDE = MOUSE_AMPLITUDE;
      window.MOUSE_POWER = MOUSE_POWER;
      if (powerOut) powerOut.textContent = MOUSE_AMPLITUDE.toFixed(2);
      updateUIFromState();
      requestRedraw();
    };
    powerCtl.addEventListener('input', updateAmplitude);
  }

  // Animation duration (seconds per cycle)
  if (animPeriodCtl){
    animPeriodCtl.addEventListener('input', ()=>{
      const v = parseFloat(animPeriodCtl.value);
      if (Number.isFinite(v)){
        ANIM_PERIOD = Math.max(0.1, v);
        if (animPeriodOut) animPeriodOut.textContent = ANIM_PERIOD.toFixed(2) + ' s';
        startAnimLoop();
        updateUIFromState();
        requestRedraw();
      }
    });
  }

  if (elTaper) {
    elTaper.value = taperMode;
    elTaper.addEventListener('change', () => {
      const v = String(elTaper.value || '').toLowerCase();
      const valid = (v === 'Rounded' || v === 'Straight' || v === 'Circles' || v === 'Blocks' || v === 'Pluses');
      const next = valid ? v : TAPER_MODE_DEFAULT;
      triggerTaperSwitch(next);
      updateUIFromState();
    });
  }

  if (elTaperIndex){
    elTaperIndex.addEventListener('input', ()=>{
      const idx = Math.max(1, Math.min(5, parseInt(elTaperIndex.value,10)||1));
      const next = modeFromIndex(idx);
      if (elTaperIndexOut) elTaperIndexOut.textContent = modeFromIndex(idx); // ← naam tonen
      triggerTaperSwitch(next);
    });
  }
  if (elLogoScale){
    elLogoScale.min = 10;
    elLogoScale.max = 200;
    elLogoScale.step = 1;
    elLogoScale.addEventListener('input', ()=>{
      const perc = Math.max(10, Math.min(200, parseInt(elLogoScale.value, 10) || 100));
      logoScaleMul = perc / 100;
      updateUIFromState();
      requestRedraw();
    });
  }
  if (elPreset){
    elPreset.addEventListener('change', ()=>{
      const val = elPreset.value;

      if (val === PRESET_DEFAULT) {
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
  if (elTipRatio) elTipRatio.step = String(TIP_RATIO_SLIDER_STEP);
  if (elDispUnit){
    elDispUnit.addEventListener('input', ()=>{
      const val = parseInt(elDispUnit.value, 10);
      if (!Number.isFinite(val)) return;
      DISPLACE_UNIT_TARGET = val;
      _layoutDirty = true;
      updateUIFromState();
      requestRedraw();
    });
  }
  if (elTipRatio){
    elTipRatio.addEventListener('input', ()=>{
      const raw = parseFloat(elTipRatio.value);
      if (!Number.isFinite(raw)) return;
      TIP_RATIO_TARGET = Math.max(0, Math.min(1, raw));
      updateUIFromState();
      requestRedraw();
    });
  }

  function resetDefaults(){
    rows = ROWS_DEFAULT;
    rowsTarget = ROWS_DEFAULT;
    rowsAnim = ROWS_DEFAULT;
    linePx = LINE_HEIGHT;
    linePxTarget = LINE_HEIGHT;
    widthScale = WIDTH_SCALE_DEFAULT;
    gapPx = GAP_PX_DEFAULT;
    gapPxTarget = GAP_PX_DEFAULT;
    displaceGroupsTarget = DISPLACE_GROUPS_DEFAULT;
    displaceGroupsAnim = DISPLACE_GROUPS_DEFAULT;
    DISPLACE_UNIT = DISPLACE_UNIT_DEFAULT;
    DISPLACE_UNIT_TARGET = DISPLACE_UNIT_DEFAULT;
    TIP_RATIO = TIP_RATIO_DEFAULT;
    TIP_RATIO_TARGET = TIP_RATIO_DEFAULT;
    taperMode = TAPER_MODE_DEFAULT;
    logoScaleMul = LOGO_SCALE_DEFAULT;

    debugMode = DEBUG_MODE_DEFAULT;

    autoRandomActive = AUTO_RANDOM_DEFAULT;
    setAuto(autoRandomActive);

    KEEP_TOTAL_WIDTH = KEEP_TOTAL_WIDTH_DEFAULT;
    BG_LINES = BG_LINES_DEFAULT;
    REPEAT_ENABLED = REPEAT_ENABLED_DEFAULT;
    REPEAT_MIRROR = REPEAT_MIRROR_DEFAULT;
    REPEAT_EXTRA_ROWS = REPEAT_EXTRA_ROWS_DEFAULT;
    REPEAT_EXTRA_ROWS_ANIM = (Number.isFinite(REPEAT_EXTRA_ROWS_DEFAULT) ? REPEAT_EXTRA_ROWS_DEFAULT : 0);
    REPEAT_EXTRA_ROWS_IS_FULL = !Number.isFinite(REPEAT_EXTRA_ROWS_DEFAULT) && REPEAT_EXTRA_ROWS_DEFAULT > 0;
    updateRepeatSlidersRange();
    REPEAT_FALLOFF = REPEAT_FALLOFF_DEFAULT;
    REPEAT_MODE    = REPEAT_MODE_DEFAULT;

    PER_LETTER_STRETCH = PER_LETTER_STRETCH_DEFAULT;
    MOUSE_STRETCH_SIGMA_FRAC = MOUSE_STRETCH_SIGMA_FRAC_DEFAULT;
    MOUSE_AMPLITUDE = MOUSE_AMPLITUDE_DEFAULT;
    MOUSE_STRETCH_MIN = BASE_STRETCH_MIN;
    MOUSE_STRETCH_MAX = BASE_STRETCH_MAX;
    MOUSE_CURVE = MOUSE_CURVE_DEFAULT;
    MOUSE_POWER = MOUSE_POWER_DEFAULT;

    ANIM_MODE = ANIM_MODE_DEFAULT;
    ANIM_PERIOD = ANIM_PERIOD_DEFAULT;
    animFpsLimit = ANIM_FPS_DEFAULT;
    animTime = 0;
    stopAnimLoop();

    ASPECT_W = ASPECT_W_DEFAULT;
    ASPECT_H = ASPECT_H_DEFAULT;
    EXPORT_W = null;
    EXPORT_H = null;

    applyColorComboByIndex(0);
    if (elPreset) elPreset.value = PRESET_DEFAULT;
    if (elAspectW) elAspectW.value = String(ASPECT_WIDTH_PX_DEFAULT);
    if (elAspectH) elAspectH.value = String(ASPECT_HEIGHT_PX_DEFAULT);
    if (elCustomAR) elCustomAR.style.display = FIT_MODE ? 'none' : '';

    window.MOUSE_AMPLITUDE = MOUSE_AMPLITUDE;
    window.MOUSE_POWER = MOUSE_POWER;

    lastAutoRandomMs = 0;

    rebuildGroupsSelect();

    updateUIFromState();

    if (rows <= 1){
      baseRowPitch = 0;
      targetContentH = 0;
    } else {
      const refTargetH = (targetContentH != null) ? targetContentH : ((height / rows) * (rows - 1));
      targetContentH = refTargetH;
      baseRowPitch = refTargetH / (rows - 1);
    }
    _layoutDirty = true;
    layout = buildLayout(LOGO_TEXT, rows);

    fitViewportToWindow();
    requestRedraw();
  }

  elReset.addEventListener('click', resetDefaults);

  let _signedGroupOptions = [];
  function rebuildGroupsSelect(){
    const targetRowsInt = Math.max(1, Math.round(rowsTarget));
    _signedGroupOptions = divisorsDescSigned(targetRowsInt); // [-rows..-1, rows..1]

    // vorige waarde respecteren: zelfde sign, en grootste geldige |v| die ≤ vorige |v|
    const prev = displaceGroupsTarget || 1;
    const sign = Math.sign(prev) || 1;
    const targetAbs = Math.max(1, Math.abs(prev));
    const posOptions = _signedGroupOptions
      .filter(v => Math.sign(v) === sign)
      .map(v => Math.abs(v))
      .sort((a,b)=>b-a); // groot → klein

    let chosenAbs = posOptions.find(v => v <= targetAbs);
    if (!chosenAbs) chosenAbs = posOptions[posOptions.length - 1] || 1; // val naar kleinste

    displaceGroupsTarget = sign * chosenAbs;
    if (!Number.isFinite(displaceGroupsAnim)) displaceGroupsAnim = displaceGroupsTarget;

    // slider = index in de options-array
    const idx = _signedGroupOptions.indexOf(displaceGroupsTarget);
    if (elGroups){
      elGroups.min = 0;
      elGroups.max = Math.max(0, _signedGroupOptions.length - 1);
      elGroups.step = 1;
      elGroups.value = (idx >= 0) ? idx : 0;
    }

    if (elGroupsOut) elGroupsOut.textContent = String(displaceGroupsTarget);
  }
  rebuildGroupsSelect();

  // listeners
  elRows.addEventListener('input', ()=>{
    const val = parseInt(elRows.value,10);
    rowsTarget = Number.isFinite(val) ? Math.max(1, val) : rowsTarget;
    rebuildGroupsSelect();
    updateRepeatSlidersRange();
    updateUIFromState();
    // FULL: stick and snap to new capacity immediately when rows jump
    if (REPEAT_EXTRA_ROWS_IS_FULL){
      REPEAT_EXTRA_ROWS = Number.POSITIVE_INFINITY;
      REPEAT_EXTRA_ROWS_ANIM = _repeatExtraRowsMax; // snap to new capacity immediately
    }
    requestRedraw();
  });

  elThickness.addEventListener('input', ()=>{
    const val = parseInt(elThickness.value,10);
    if (!Number.isFinite(val)) return;
    linePxTarget = Math.max(1, val);
    updateUIFromState();
    requestRedraw();
  });

  elWidth.addEventListener('input', ()=>{
    widthScale = parseInt(elWidth.value,10) / 100;
    updateUIFromState();
    requestRedraw();
  });

  elGap.addEventListener('input', ()=>{
    const val = parseInt(elGap.value,10);
    if (!Number.isFinite(val)) return;
    gapPxTarget = val;
    _layoutDirty = true;
    updateUIFromState();
    requestRedraw();
  });

  if (elGroups){
    elGroups.addEventListener('input', ()=>{
      const idx = parseInt(elGroups.value,10) || 0;
      displaceGroupsTarget = _signedGroupOptions[idx] || 1; // gesigneerd
      if (elGroupsOut) elGroupsOut.textContent = String(displaceGroupsTarget);
      requestRedraw();
    });
  }

  elDebug.addEventListener('change', ()=>{
    debugMode = elDebug.checked;
    updateUIFromState();
    requestRedraw();
  });

  elAuto.addEventListener('change', ()=>{
    autoRandomActive = elAuto.checked;
    setAuto(autoRandomActive);
    updateUIFromState();
  });

  if (elCustomAR) elCustomAR.style.display = (elPreset && elPreset.value === 'custom') ? '' : 'none';
  FIT_MODE = (elPreset && elPreset.value === PRESET_DEFAULT);
  updateUIFromState();
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

function remapRowArray(oldArr, newLen){
  if (newLen <= 0) return [];
  if (!Array.isArray(oldArr) || oldArr.length === 0){
    return Array.from({ length: newLen }, () => 0);
  }
  if (oldArr.length === 1){
    return Array.from({ length: newLen }, () => oldArr[0]);
  }
  if (newLen === 1){
    const mid = oldArr[Math.floor((oldArr.length - 1) * 0.5)];
    return [mid];
  }
  const result = new Array(newLen);
  const maxOldIdx = oldArr.length - 1;
  for (let i = 0; i < newLen; i++){
    const t = i / (newLen - 1);
    const src = t * maxOldIdx;
    const idx0 = Math.floor(src);
    const idx1 = Math.min(maxOldIdx, idx0 + 1);
    const frac = src - idx0;
    const val0 = oldArr[idx0];
    const val1 = oldArr[idx1];
    result[i] = val0 + (val1 - val0) * frac;
  }
  return result;
}

function updateRowYsSmooth(target){
// Compute per-repeat rows with geometric falloff
  const safeTarget = Array.isArray(target) ? target : [];
  if (!safeTarget.length){
    rowYsSmooth = [];
    return 0;
  }
  if (rowYsSmooth.length !== safeTarget.length){
    if (rowYsSmooth.length === 0){
      rowYsSmooth = safeTarget.slice();
    } else {
      rowYsSmooth = remapRowArray(rowYsSmooth, safeTarget.length);
    }
  }
  let maxDelta = 0;
  const lerpFactor = 0.2;
  for (let i = 0; i < safeTarget.length; i++){
    const prev = rowYsSmooth[i];
    const next = prev + (safeTarget[i] - prev) * lerpFactor;
    const delta = Math.abs(safeTarget[i] - next);
    if (delta > maxDelta) maxDelta = delta;
    rowYsSmooth[i] = next;
  }
  return maxDelta;
}

function computeRepeatRowsSequence(totalExtraRows, rowsPerBlock, falloff){
  const out = [];
  let remain = Math.max(0, totalExtraRows|0);
  const rpb = Math.max(1, rowsPerBlock|0);
  const f = Math.max(0, Math.min(1, Number(falloff)));
  if (f >= 0.999){
    // Uniform: consecutive full blocks until exhausted
    while (remain > 0){
      const n = Math.min(rpb, remain);
      out.push(n);
      remain -= n;
      if (out.length > 2048) break;
    }
    return out;
  }
  let k = 0;
  while (remain > 0){
    const ideal = rpb * Math.pow(f, k);
    const n = Math.max(1, Math.min(remain, Math.round(ideal)));
    out.push(n);
    remain -= n;
    k++;
    if (k > 2048) break;
  }
  return out;
}

function renderLogo(g){
  updateAnimatedParameters();
  if (_layoutDirty){
    layout = buildLayout(LOGO_TEXT, rows);
    _layoutDirty = false;
  }
  const targetRowsInt = Math.max(1, Math.round(rowsTarget));
  if (!Number.isFinite(rowsAnim)) rowsAnim = rows;
  const rowsEase = 0.2;
  rowsAnim += (targetRowsInt - rowsAnim) * rowsEase;
  const rowsAnimInt = Math.max(1, Math.round(rowsAnim));
  const animatingRows = Math.abs(targetRowsInt - rowsAnim) > 0.01;

  if (rowsAnimInt !== rows){
    rows = rowsAnimInt;
    layout = buildLayout(LOGO_TEXT, rows);
  }
  if (animatingRows) requestRedraw();

  g.push();
  if (BG_TRANSPARENT) {
    g.clear();
  } else {
    g.background(color1);
  }
  g.fill(color2);
  g.noStroke();

  const fit = computeLayoutFit();
  const { tEff, rowPitchNow, leftmost, contentW0, contentH0 } = fit;

  if (!Number.isFinite(displaceGroupsAnim)) displaceGroupsAnim = displaceGroupsTarget;
  const dgDiff = displaceGroupsTarget - displaceGroupsAnim;
  if (Math.abs(dgDiff) > 1e-3){
    displaceGroupsAnim += dgDiff * 0.18;
    if (Math.abs(displaceGroupsTarget - displaceGroupsAnim) > 0.015) requestRedraw();
  }

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

  // Bounds after pass0
  let leftAdj  = Math.min(...adjX);
  let rightAdj = Math.max(...adjX.map((x,i)=> x + wUseArr[i]));
  let contentWAdj = Math.max(1, rightAdj - leftAdj);

  // Center using pass0 bounds
  let txAdj = (innerW - s * contentWAdj) * 0.5 - s * leftAdj;
  const tyAdj = tyProvisional; // vertical centering unchanged

  // Recompute mouse in layout coords with centered, adjusted bounds and rebuild (pass1)
  let localMouseX  = activeLocalMouseX(txAdj, s, leftAdj, rightAdj);
  adj = computeAdjustedLetterPositions(localMouseX, contentWAdj);
  adjX = adj.adjX;
  wUseArr = adj.wUse;

  // Recompute bounds after pass1 and recentre + one more rebuild so the mouse range
  // spans exactly to the end of the last letter (pass2)
  leftAdj  = Math.min(...adjX);
  rightAdj = Math.max(...adjX.map((x,i)=> x + wUseArr[i]));
  contentWAdj = Math.max(1, rightAdj - leftAdj);
  txAdj = (innerW - s * contentWAdj) * 0.5 - s * leftAdj;
  localMouseX  = activeLocalMouseX(txAdj, s, leftAdj, rightAdj);
  adj = computeAdjustedLetterPositions(localMouseX, contentWAdj);
  adjX = adj.adjX;
  wUseArr = adj.wUse;

  // (keep txAdj/tyAdj for the final transform below)

  if (rows <= 1){
    rowYsCanvas = [0];
  } else {
    rowYsCanvas = Array.from({ length: rows }, (_, r) => r * rowPitchNow);
  }

  const rowSmoothDelta = updateRowYsSmooth(rowYsCanvas);
  if (rowSmoothDelta > 0.2) requestRedraw();
  const rowPositions = (rowYsSmooth.length === rowYsCanvas.length) ? rowYsSmooth : rowYsCanvas;

  // Backdrop lines across the full canvas (pixel space) aligned to row pitch
  if (BG_LINES){
    const pitchPx = rowPitchNow * s;           // spacing between rows in pixels
    const thickPx = 5;
    if (pitchPx > 0){
      g.push();
      g.noStroke();
      // If line color is black, use 25% opacity; otherwise full opacity
      const a = isHexBlack(color3) ? Math.round(255 * 0.25) : 255;
      const cc = color(color3);
      cc.setAlpha(a);
      g.fill(cc);
      // Align first line to where row 0 would be after translate/scale
      const y0 = tyAdj; // row 0 at layout y=0 maps to canvas y=tyAdj
      const startY = ((y0 % pitchPx) + pitchPx) % pitchPx; // wrap to [0,pitch)
      for (let y = startY; y <= height; y += pitchPx){
        g.rect(0, y - thickPx * 0.5, width, thickPx);
      }
      g.pop();
    }
  }

  // Apply final transform
  tx = txAdj;
  ty = tyAdj;
  g.translate(tx, ty);
  g.scale(s, s);

  const maxRowIdx = Math.max(0, rows - 1);

  function drawLettersSubset(yOff, mirrored = false, rowStart = 0, rowEnd = maxRowIdx, hMul = 1){
        const start = Math.max(0, Math.min(maxRowIdx, rowStart | 0));
    const end   = Math.max(start, Math.min(maxRowIdx, rowEnd | 0));

    // Window-relatieve metrics met smoothed rows → geen drift t.o.v. background grid
    const baseStartAbs = (rowPositions[start] !== undefined)
      ? rowPositions[start]
      : (rows <= 1 ? 0 : start * rowPitchNow);
    const baseEndAbs = (rowPositions[end] !== undefined)
      ? rowPositions[end]
      : (rows <= 1 ? 0 : end * rowPitchNow);
    const tileH = Math.max(0, baseEndAbs - baseStartAbs); // hoogte van dit venster
    const tileHScaled = tileH * Math.max(0.01, hMul);

    for (let li = 0; li < layout.lettersOrder.length; li++){
      const letterKey   = layout.lettersOrder[li];
      const rowsArr = layout.letters[letterKey];
      const baseX = adjX[li];
      const letterBaseScaledW = layout.letterW[li] * layout.scale;
      const wUse = wUseArr[li];
      const wScaleUse = letterBaseScaledW > 0 ? (wUse / letterBaseScaledW) : widthScale;

      for (let r = start; r <= end; r++){
        const spans = rowsArr[r] || [];

        // Absoluut → relatief binnen dit venster
        const baseRowAbs = (rowPositions[r] !== undefined)
          ? rowPositions[r]
          : (rows <= 1 ? 0 : r * rowPitchNow);
        const baseRowRel = baseRowAbs - baseStartAbs; // 0 op start, stijgt per rowPitch
        const baseRowRelScaled = baseRowRel * Math.max(0.01, hMul);

        const y = mirrored
          ? (tileHScaled - baseRowRelScaled) + yOff    // spiegel binnen geschaalde venster-hoogte
          : (baseRowRelScaled + yOff);
        for (const span of spans){
          const rightEdgeX = baseX + span.rightRel * layout.scale * wScaleUse;
          const baseLen    = Math.max(0, span.runLen * layout.scale * wScaleUse);
          const maxDash = Math.max(0, rightEdgeX - baseX);
          const dashLenClamped = Math.min(baseLen, maxDash);
          const xShift = computeXShift(r, rows, displaceGroupsAnim);
          let rx = rightEdgeX + xShift;
          if (H_WAVE_AMP !== 0 && rowPitchNow > 0){
            const ampLayout = rowPitchNow * H_WAVE_AMP;
            const phase = (r / rows) * TWO_PI - animTime * TWO_PI * 0.35;
            rx += Math.sin(phase) * ampLayout;
          }
          const drawH = Math.max(MIN_DRAW_HEIGHT, linePx * _lineMul * Math.max(0.01, hMul));
          switch (taperMode) {
            case 'Straight':
              drawStraightTaper(g, rx, y, dashLenClamped, drawH);
              break;
            case 'Circles':
              drawCircleTaper(g, rx, y, dashLenClamped, drawH, TIP_RATIO);
              break;
            case 'Blocks':
              drawBlockTaper(g, rx, y, dashLenClamped, drawH, TIP_RATIO);
              break;
            case 'Pluses':
              drawPlusTaper(g, rx, y, dashLenClamped, drawH, TIP_RATIO);
              break;
            case 'Rounded':
            default:
              drawRoundedTaper(g, rx, y, dashLenClamped, drawH, TIP_RATIO);
              break;
          }
        }
      }
    }
  }

  // Draw base instance (not mirrored)
  drawLettersSubset(0, false, 0, maxRowIdx, 1);

  if (REPEAT_ENABLED && rows > 0){
    // All in layout units (multiples of rowPitchNow) for perfect alignment
    const HlogoCore   = Math.max(0, (rows - 1) * rowPitchNow); // top row to bottom row distance
    const HlogoFull   = Math.max(0, rows * rowPitchNow);       // full block including 1-row gap
    const stepLayout  = HlogoFull;               // adjacent blocks without extra gap

    // Use animated numeric cap; when target is Infinity we smoothly approach the current max
    const useFalloff = (REPEAT_MODE === 'falloff' && REPEAT_FALLOFF < 0.999);
    const extraCap = useFalloff
      ? Number.MAX_SAFE_INTEGER // in falloff: ignore slider; draw until offscreen
      : Math.max(0, Math.floor(REPEAT_EXTRA_ROWS_ANIM));

    // Repeats downward
    let extraBelowRemaining = extraCap;
    if (extraBelowRemaining > 0){
      let yCursorLayout = HlogoCore; // bottom of base block (unscaled base)
      let downIndex = 1; // 1st repeat below = index 1
      while (true){
        if (extraBelowRemaining <= 0) break;

        // Height multiplier for this repeat (e.g. 0.8, 0.64, ...)
        const hMulDown = useFalloff ? Math.pow(REPEAT_FALLOFF, Math.max(1, downIndex)) : 1.0;

        // Top of this repeat sits one *scaled* row below previous bottom
        const layoutTranslate = yCursorLayout + rowPitchNow * Math.max(0.01, hMulDown);
        const yTopPx = ty + s * layoutTranslate;
        if (yTopPx > height) break;

        const mirrored = REPEAT_MIRROR && ((downIndex % 2) === 1);
        let rowsToDraw = Math.min(rows, extraBelowRemaining);
        if (rowsToDraw <= 0){
          extraBelowRemaining = 0;
          break;
        }
        const rowStart = mirrored ? Math.max(0, rows - rowsToDraw) : 0;
        const rowEnd   = mirrored ? (rows - 1) : (rowsToDraw - 1);

        g.push();
        g.translate(0, layoutTranslate);
        drawLettersSubset(0, mirrored, rowStart, rowEnd, hMulDown);
        g.pop();

        extraBelowRemaining -= rowsToDraw;
        // Advance cursor by scaled block height + one scaled row gap => HlogoFull * hMulDown
        yCursorLayout += HlogoFull * Math.max(0.01, hMulDown);
        downIndex++;
      }
    }

    // Repeats upward
    let extraAboveRemaining = extraCap;
    if (extraAboveRemaining > 0){
      let yCursorLayoutUp = 0; // top of base block (unscaled base)
      let upIndex = 1; // 1st repeat above = index 1
      while (true){
        if (extraAboveRemaining <= 0) break;

        const hMulUp = useFalloff ? Math.pow(REPEAT_FALLOFF, Math.max(1, upIndex)) : 1.0;
        // Top of this repeat sits one *scaled* block above the current top
        const topLayout = yCursorLayoutUp - HlogoFull * Math.max(0.01, hMulUp);
        const yTopPx = ty + s * topLayout;
        if ((yTopPx + s * (HlogoCore * Math.max(0.01, hMulUp))) < 0) break;

        const mirrored = REPEAT_MIRROR && ((upIndex % 2) === 1);
        let rowsToDraw = Math.min(rows, extraAboveRemaining);
        if (rowsToDraw <= 0){
          extraAboveRemaining = 0;
          break;
        }
        const rowStart = mirrored ? 0 : Math.max(0, rows - rowsToDraw);
        const rowEnd   = mirrored ? Math.min(rows - 1, rowsToDraw - 1) : (rows - 1);

        // Offset so the compressed block's bottom touches the base block's top
        const tileRows = Math.max(0, rowEnd - rowStart);
        const tileHWin = tileRows * rowPitchNow;
        const yOffWin  = Math.max(0, HlogoCore * Math.max(0.01, hMulUp) - tileHWin * Math.max(0.01, hMulUp));

        g.push();
        g.translate(0, topLayout);
        drawLettersSubset(yOffWin, mirrored, rowStart, rowEnd, hMulUp);
        g.pop();

        extraAboveRemaining -= rowsToDraw;
        yCursorLayoutUp = topLayout; // next anchor is this repeat's top
        upIndex++;
      }
    }
  }
  g.pop();
}

function draw(){
  if (!BG_TRANSPARENT){
    background(255);
  } else {
    clear(); // keep transparent
  }
  noStroke();
  renderLogo(this);
  if (debugMode) drawdebugModeOverlay();
}

// ====== DRAWING ======

function drawRoundedTaper(g, rightX, cy, len, h, tipRatio = TIP_RATIO){
  // Base radii from stroke height
  const Rfull = Math.max(0.0001, (h * 0.5));
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

function drawCircleTaper(g, rightX, cy, len, h, tipRatio = TIP_RATIO){
  // Base radii from stroke height
  const Rfull = Math.max(0.0001, (h * 0.5)); // end ratio fixed at 1.0
  const rfull = Math.max(0.0001, Rfull * Math.max(0, Math.min(1, tipRatio)));

  // Clamp by available length
  const maxRByLen = Math.max(0.0001, len * 0.5);
  const R = Math.min(Rfull, maxRByLen);
  const r = Math.min(rfull, R);

  // We place circle centers from big cap center (right) towards tip (left)
  const xRight = rightX - R;            // center of big cap on the right
  const xLeftLimit = rightX - Math.max(0, len - r); // do not place centers past leftmost small radius tip

  const pathLen = Math.max(0, xRight - xLeftLimit);
  const step = Math.max(1, TAPER_SPACING);
  const n = Math.max(1, Math.floor(pathLen / step) + 1);

  g.fill(color2);
  for (let i = 0; i < n; i++){
    const cx = xRight - i * step;
    if (cx < xLeftLimit - 1e-3) break; // guard
    const t = (pathLen > 0) ? ((xRight - cx) / pathLen) : 1; // 0 at right (R), 1 at left (r)
    const rad = lerp(R, r, t);
    g.circle(cx, cy, Math.max(0.0001, rad * 2));
  }
}

function drawBlockTaper(g, rightX, cy, len, h, tipRatio = TIP_RATIO){
  const steps = Math.max(2, BLOCK_STEPS | 0);

  function heightAt(frac){
    const ratio = lerp(1.0, tipRatio, frac);
    return Math.max(0.5, h * Math.max(0, Math.min(1, ratio)));
  }

  // Cap length is a fraction of the FULL taper length
  const capLen = Math.max(0, len * BLOCK_CAP_FRAC);
  const xCapL = rightX - capLen;                 // cap sits at the far right
  const fracSecond = (steps > 1) ? (1 / (steps - 1)) : 0; // height similar to 2nd block
  const capH = heightAt(fracSecond);
  const yCap = cy - capH * 0.5;

  // Remaining length gets partitioned over `steps` blocks.
  const remainingLen = Math.max(0, len - capLen);

  // Raw width profile per block (decreasing towards the left)
  const rawWeights = [];
  for (let i = 0; i < steps; i++){
    const frac = (steps === 1) ? 0 : (i / (steps - 1)); // 0 rightmost → 1 leftmost
    const lenFrac = 1.0 - (1.0 - BLOCK_MIN_LEN_FRAC) * frac; // 1 → min
    rawWeights.push(Math.max(0.0001, lenFrac));
  }
  const sumRaw = rawWeights.reduce((a,b)=>a+b,0);
  const widths = rawWeights.map(w => (remainingLen * w / sumRaw)); // normalized so sum = remainingLen

  g.push();
  g.noStroke();

  // Draw cap on the right
  g.fill(color2);
  g.rect(xCapL, yCap, capLen, capH);

  // March leftwards with normalized block widths so total exactly fills `len`
  let rightEdge = xCapL;
  for (let i = 0; i < steps; i++){
    const frac = (steps === 1) ? 0 : (i / (steps - 1));
    const w = widths[i];
    const hi = heightAt(frac);
    const yTop = cy - hi * 0.5;
    const xL = rightEdge - w; // touch previous element

    // Optional subtle fade towards the tip
    const alpha = Math.floor(255 - (255 - 80) * frac);
    const cc = color(color2);
    cc.setAlpha(alpha);
    g.fill(cc);
    g.rect(xL, yTop, w, hi);

    rightEdge = xL;
  }

  g.pop();
}

function drawPlusTaper(g, rightX, cy, len, h, tipRatio = TIP_RATIO){
  const Hfull  = Math.max(0.0001, h);
  const hTip   = Math.max(0.0001, h * Math.max(0, Math.min(1, tipRatio)));
  const maxHByLen = Math.max(0.0001, len * 0.5);
  const Hbig   = Math.min(Hfull, maxHByLen);
  const Hsmall = Math.min(hTip, Hbig);

  const xRight = rightX;            // right edge of the taper
  const xLeft  = rightX - len;      // left edge of the taper

  const step = Math.max(1, TAPER_SPACING);
  const usableLen = Math.max(0, (xRight - Hbig * 0.5) - (xLeft + Hsmall * 0.5));
  const n = Math.max(1, Math.floor(usableLen / step) + 1);

  g.fill(color2);
  for (let i = 0; i < n; i++){
    // Center progresses from near the big end to near the tip at fixed spacing
    const cx = (xRight - Hbig * 0.5) - i * step;
    if (cx < (xLeft + Hsmall * 0.5) - 1e-3) break;
    const t = (usableLen > 0) ? ((xRight - Hbig * 0.5 - cx) / usableLen) : 1; // 0 at big, 1 at tip
    const size = lerp(Hbig, Hsmall, t);
    const half = size * 0.5;
    const bar  = Math.max(0.5, size * 0.28);
    // horizontal + vertical bars centered at (cx, cy)
    g.rect(cx - half, cy - bar * 0.5, size, bar);
    g.rect(cx - bar * 0.5, cy - half, bar, size);
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

function computeXShift(r, rows, groupsValue){
  if (!Number.isFinite(groupsValue) || rows <= 0) return 0;
  const sign = Math.sign(groupsValue) || 1;
  const groupsFloat = Math.max(1, Math.abs(groupsValue));
  const gLow = Math.floor(groupsFloat);
  const gHigh = Math.min(rows, Math.max(gLow + 1, gLow));
  const t = Math.min(1, Math.max(0, groupsFloat - gLow));

  const shiftLow = computeShiftForGroupCount(r, rows, Math.max(1, gLow));
  const shiftHigh = computeShiftForGroupCount(r, rows, Math.max(1, gHigh));
  const blended = shiftLow + (shiftHigh - shiftLow) * t;
  return blended * sign;
}

function computeShiftForGroupCount(r, rows, groups){
  if (!Number.isFinite(groups) || groups <= 0) return 0;
  const groupSize = rows / Math.max(1, groups);
  const idxRaw = Math.floor(r / Math.max(1e-6, groupSize));
  const idx = Math.min(groups - 1, Math.max(0, idxRaw));
  const centered = idx - (groups - 1) * 0.5;
  return centered * DISPLACE_UNIT;
}

function fitViewportToWindow(){
  if (!mainCanvas || !mainCanvas.elt) return;
  const stage = document.getElementById('stage');
  const wrap  = document.getElementById('canvasWrap');
  if (!stage || !wrap) return;

  const availW = Math.max(100, stage.clientWidth);
  const availH = Math.max(100, stage.clientHeight);

  let boxW, boxH;
  if (FIT_MODE) {
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

  updateRepeatSlidersRange();
  requestRedraw();
}
// ====== INPUT ======
function mouseMoved(){
  requestRedraw(); // KAN WEG?
}
  