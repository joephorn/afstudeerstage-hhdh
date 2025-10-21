// ====== CONFIG ======
const LOGO_TEXT_OPTIONS       = ["ALBION", "PUSH   IT"];
let LOGO_TEXT_INDEX           = 0;
function currentLogoText(){
  const n = Array.isArray(LOGO_TEXT_OPTIONS) ? LOGO_TEXT_OPTIONS.length : 0;
  if (n <= 0) return '';
  const i = Math.max(0, Math.min(n - 1, LOGO_TEXT_INDEX|0));
  return String(LOGO_TEXT_OPTIONS[i] ?? '');
}
const ROWS_DEFAULT             = 12;
const LINE_HEIGHT              = 10;

const TIP_RATIO_DEFAULT        = 0.3;
const DISPLACE_UNIT_DEFAULT    = 28;
const GAP_PX_DEFAULT           = 9;
const DISPLACE_GROUPS_DEFAULT  = 2;
const TAPER_MODE_DEFAULT       = 'Rounded';
const DEBUG_MODE_DEFAULT       = false;
const WIDTH_SCALE_DEFAULT      = 1.1;
const H_WAVE_AMP_DEFAULT       = 0;
const H_WAVE_PERIOD_DEFAULT    = 3.0;
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
// Background lines optimization: cache into an offscreen buffer and blit.
// Exports/offscreen still draw directly to their target.
const CSS_BG_LINES = false; // legacy flag kept; CSS overlay not used to preserve layering
const PERF_MODE_DEFAULT        = false; // reduce detail during playback

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

const PARAM_EASE_FACTOR        = 0.1; // legacy smoothing factor (kept for rows/displace animation)

// Global easing for slider-driven transitions (gap, line height, etc.)
const EASE_TYPE_DEFAULT     = 'smooth';   // 'linear' | 'smooth' | 'easeInOut' | 'elastic'
const EASE_DURATION_DEFAULT = 0.25;       // seconds (legacy; derived from keyframe × %)
const EASE_DURATION_PCT_DEFAULT = 100;    // percentage of keyframe duration
const EASE_AMPLITUDE_DEFAULT= 1.0;        // only used for 'elastic' (overshoot)

const ANIM_MODE_DEFAULT   = 'off';
const ANIM_ENABLED_DEFAULT = false; // master toggle like Repeat (default OFF)
const ANIM_PERIOD_DEFAULT = 3.0;
const AUTO_RANDOM_DEFAULT = false; // disabled by default
const AUTO_RANDOM_PERIOD_DEFAULT = 1.0; // seconds
const KF_TIME_DEFAULT = 0.5; // seconds per keyframe
const KF_SPEED_DEFAULT = 1.0; // global time multiplier

// Pulse position (0..1) representing the peak location across the content
const PULSE_PHASE_DEFAULT = 0.0;

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

let H_WAVE_AMP = H_WAVE_AMP_DEFAULT; // target
let H_WAVE_AMP_TARGET = H_WAVE_AMP_DEFAULT;
let H_WAVE_AMP_ANIM = H_WAVE_AMP_DEFAULT;
let H_WAVE_PERIOD = H_WAVE_PERIOD_DEFAULT;
let PULSE_PHASE = PULSE_PHASE_DEFAULT; // 0..1
let H_WAVE_T0 = 0; // activation time reference for zero-crossing start

// Fade factor for enabling/disabling animation effects smoothly (0..1)
let ANIM_FADE = 1.0;
let ANIM_FADE_TARGET = 1.0;

const TAPER_SPACING = 16; // fixed distance between element centers along the line (layout units)

// Scan behavior
const BRIDGE_PIXELS     = 0;         // WEGHALEN
const INK_THRESHOLD     = 140; // KAN WEG // GWN IN CODE ZETTEN?
const BAND_MIN_COVER_FRAC = 0.035; // ≥3.5% of word width must be continuous ink for a row to count

// Row sampling kernel (vertical) in the glyph buffer
const ROW_KERNEL_Y_FRAC = 0.015; // % van bandhoogte → 1–3px meestal
const MIN_RUN_PX_BUFFER = 5;     // WEGHALEN

// Offscreen buffer
const BUFFER_W          = 1400;
const BUFFER_H          = 420; 

const LETTERS_PATH      = './src/letters/';
let glyphImgs = {};   // map: char -> p5.Image (SVG rasterized)
let glyphDims = {};   // map: char -> {w,h}

// Ensure required glyphs are loaded for a given text
function ensureGlyphsLoadedFor(text){
  if (!text) return;
  const uniq = Array.from(new Set(String(text).toUpperCase().split('')));
  uniq.forEach(ch => {
    // Only load A–Z letters; skip spaces or other chars
    if (!/^[A-Z]$/.test(ch)) return;
    if (!glyphImgs[ch]){
      const p = LETTERS_PATH + ch + '.svg';
      glyphImgs[ch] = loadImage(
        p,
        img => { glyphDims[ch] = { w: img.width, h: img.height }; _layoutDirty = true; layout = buildLayout(currentLogoText(), rows); requestRedraw(); },
        err => console.error('Failed to load', p, err)
      );
    }
  });
}

function setLogoText(next){
  const v = String(next || '');
  const idx = LOGO_TEXT_OPTIONS.findIndex(x => String(x) === v);
  const newIdx = (idx >= 0 ? idx : 0);
  if (LOGO_TEXT_INDEX !== newIdx){
    LOGO_TEXT_INDEX = newIdx;
    const word = currentLogoText();
    ensureGlyphsLoadedFor(word);
    _layoutDirty = true;
    layout = buildLayout(word, rows);
    requestRedraw();
  }
}

function setLogoTextByIndex(i){
  const n = LOGO_TEXT_OPTIONS.length;
  const cl = Math.max(0, Math.min(Math.max(0, n - 1), i|0));
  setLogoText(LOGO_TEXT_OPTIONS[cl] || LOGO_TEXT_OPTIONS[0]);
}

function setPulsePhase(x){
  const v = Math.max(0, Math.min(1, Number(x)));
  PULSE_PHASE = v;
  if (typeof window !== 'undefined'){
    if (typeof elPulsePhase !== 'undefined' && elPulsePhase) elPulsePhase.value = v.toFixed(3);
    if (typeof elPulsePhaseOut !== 'undefined' && elPulsePhaseOut) elPulsePhaseOut.textContent = v.toFixed(2);
  }
}

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
// Independent line-length multiplier (affects dash length only)
const LINE_LEN_MUL_DEFAULT = 1.0;

let elRows, elThickness, elWidth, elGap, elGroups, elDispUnit, elPreset, elLogoScale, elAspectW, elAspectH, elCustomAR, elReset, elLogoText, elFillBtn;
let elPulsePhase, elPulsePhaseOut, elHWavePeriod, elHWavePeriodOut;
let elAnimEnabled;
// Keyframe timing UI
let elKfTime, elKfTimeOut, elKfSpeed, elKfSpeedOut;
let elRowsOut, elThicknessOut, elWidthOut, elGapOut, elDispUnitOut, elGroupsOut, elLogoScaleOut;
let elEaseType, elEaseDurPct, elEaseDurPctOut, elEaseAmp, elEaseAmpOut;
let elTaper, elTaperIndex, elTaperIndexOut, elColorPreset, elColorPresetLabel, elRepeatFalloff, elRepeatFalloffOut, elRepeatUniform, elDebug, elAuto;
let elAutoDur, elAutoDurOut;
let elRepeatEnabled, elRepeatExtraRows, elRepeatExtraRowsOut;
let elTipRatio, elTipOut;
let gapPx = GAP_PX_DEFAULT;
let gapPxTarget = GAP_PX_DEFAULT;
let displaceGroupsTarget = DISPLACE_GROUPS_DEFAULT;
let displaceGroupsAnim = DISPLACE_GROUPS_DEFAULT;
let taperMode = TAPER_MODE_DEFAULT;
let debugMode = DEBUG_MODE_DEFAULT;
let widthScale = WIDTH_SCALE_DEFAULT;
let widthScaleTarget = WIDTH_SCALE_DEFAULT;
// Dash length multiplier (separate from Width)
let LINE_LEN_MUL = LINE_LEN_MUL_DEFAULT;
let LINE_LEN_MUL_TARGET = LINE_LEN_MUL_DEFAULT;
let LINE_LEN_MUL_ANIM = LINE_LEN_MUL_DEFAULT;

// Global easing state
let EASE_TYPE = EASE_TYPE_DEFAULT;
let EASE_DURATION = EASE_DURATION_DEFAULT;
let EASE_DURATION_PCT = EASE_DURATION_PCT_DEFAULT;
let EASE_AMPLITUDE = EASE_AMPLITUDE_DEFAULT;

// Per-parameter tween states for time-based easings
function makeTween(initial){
  return { from: Number(initial)||0, to: Number(initial)||0, start: 0, dur: EASE_DURATION_DEFAULT, active: false };
}
const _paramTweens = {
  linePx: makeTween(LINE_HEIGHT),
  gapPx: makeTween(GAP_PX_DEFAULT),
  dispUnit: makeTween(DISPLACE_UNIT_DEFAULT),
  tipRatio: makeTween(TIP_RATIO_DEFAULT),
  extraRows: makeTween(Number.isFinite(REPEAT_EXTRA_ROWS_DEFAULT) ? REPEAT_EXTRA_ROWS_DEFAULT : 0),
  repeatFalloff: makeTween(REPEAT_FALLOFF_DEFAULT),
  widthScale: makeTween(WIDTH_SCALE_DEFAULT),
  logoScale: makeTween(LOGO_SCALE_DEFAULT),
  rows: makeTween(ROWS_DEFAULT),
  groups: makeTween(DISPLACE_GROUPS_DEFAULT),
  mouseAmp: makeTween(MOUSE_AMPLITUDE_DEFAULT),
  hWaveAmp: makeTween(H_WAVE_AMP_DEFAULT),
  animFade: makeTween(1.0),
  dashMul: makeTween(LINE_LEN_MUL_DEFAULT),
};

// Easing functions (0..1 -> 0..1)
function easeLinear(t){ return t; }
function easeSmooth(t){ return t * t * (3 - 2 * t); }
function easeInOutCubic(t){ return (t < 0.5) ? (4 * t * t * t) : (1 - Math.pow(-2 * t + 2, 3) / 2); }
// (Elastic removed from UI; keep function comment for compatibility if needed)
// Snap/step easing: hold until a threshold, then jump to 1.
// We map amplitude (0..2) -> snapPoint in [0..1].
// amp=0 => snap immediately; amp=1 => snap at 50%; amp=2 => snap at the very end.
function easeSnap(t, amp = 1){
  const a = Math.max(0, Math.min(2, Number(amp)));
  const snapPoint = a / 2; // 0..1
  return (t < snapPoint) ? 0 : 1;
}
function applyEase(t){
  const tt = Math.max(0, Math.min(1, t));
  switch (EASE_TYPE){
    case 'linear':    return easeLinear(tt);
    case 'easeInOut': return easeInOutCubic(tt);
    case 'snap':      return easeSnap(tt, EASE_AMPLITUDE);
    case 'snapHalf': {
      // Snap immediately to 0.5, then ease the remainder to 1 over full duration
      return Math.min(1, 0.5 + 0.5 * easeSmooth(tt));
    }
    case 'fadeIn':    return easeSmooth(tt); // base curve; actual line height fades via _lineMul
    case 'smooth':
    default:          return easeSmooth(tt);
  }
}

// Shape a fade (0..1) with an initial hold near zero, then smoothstep.
const ZERO_HOLD_FRAC = 0.15; // keep first 15% at exactly 0 for cleaner start
function shapeFade01(x){
  const z = Math.max(0, Math.min(1, (x - ZERO_HOLD_FRAC) / Math.max(1e-6, 1 - ZERO_HOLD_FRAC)));
  return easeSmooth(z);
}

// Fade-in helpers (line height + stagger)
const FADEIN_STAGGER_FRAC_DEFAULT = 0.5; // portion of tween spread across rows (smaller = faster propagation)
const FADEIN_HEIGHT_POWER_DEFAULT = 1.3; // >1 makes height fade progress a bit slower
let FADEIN_STAGGER_FRAC = FADEIN_STAGGER_FRAC_DEFAULT;
let FADEIN_HEIGHT_POWER = FADEIN_HEIGHT_POWER_DEFAULT;
let _fadeTNorm = 1.0;         // 0..1 normalized progress of the active line-height tween

function fadeInRowMul(r, rows){
  if (rows <= 1) return Math.max(0, Math.min(1, _fadeTNorm));
  const frac = Math.max(0, Math.min(1, r / Math.max(1, rows - 1)));
  const d = Math.max(0, Math.min(1, FADEIN_STAGGER_FRAC));
  const t = Math.max(0, Math.min(1, ( _fadeTNorm - d * frac) / Math.max(1e-6, 1 - d)));
  const base = Math.max(0, Math.min(1, applyEase(t)));
  const pow = Math.max(1, Number(FADEIN_HEIGHT_POWER) || FADEIN_HEIGHT_POWER_DEFAULT);
  return Math.max(0, Math.min(1, Math.pow(base, pow)));
}

// Global alpha multiplier for fade-in (subtle opacity ramp)
// No global opacity changes for fade-in; keep solid fill

// Step/restart tween to reach target over EASE_DURATION seconds
function stepTween(tw, currentVal, targetVal, now){
  const to = Number(targetVal);
  if (!Number.isFinite(currentVal)) currentVal = tw.to;
  // Restart if target changed or inactive
  if (!tw.active || to !== tw.to){
    tw.from = Number(currentVal);
    tw.to = to;
    tw.start = now;
    tw.dur = Math.max(0, Number(EASE_DURATION));
    tw.active = (tw.dur > 0 && Math.abs(tw.to - tw.from) > 1e-6);
    if (!tw.active){
      // snap instantly when dur=0 or no change
      return { value: tw.to, changed: (tw.to !== currentVal), animating: false };
    }
  }
  // Active tween → compute eased value
  const t = Math.max(0, Math.min(1, (now - tw.start) / Math.max(0.0001, tw.dur)));
  const k = applyEase(t);
  const v = tw.from + (tw.to - tw.from) * k;
  if (t >= 1){
    tw.active = false;
    return { value: tw.to, changed: (tw.to !== currentVal), animating: false };
  }
  return { value: v, changed: Math.abs(v - currentVal) > 1e-6, animating: true };
}

let logoScaleMul = LOGO_SCALE_DEFAULT;
let logoScaleTarget = LOGO_SCALE_DEFAULT;
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
let MOUSE_AMPLITUDE = MOUSE_AMPLITUDE_DEFAULT;       // multiplies stretch delta relative to baseline (target)
let MOUSE_AMPLITUDE_TARGET = MOUSE_AMPLITUDE_DEFAULT;
let MOUSE_AMPLITUDE_ANIM = MOUSE_AMPLITUDE_DEFAULT;

let baseRowPitch;
let targetContentH = null; // stays constant; rows change will shrink/grow pitch to keep this height
let targetContentW = null; // fixed reference width for scaling (decouples scale from width/gap)
let EXPORT_W = null; // when preset = custom, desired pixel width
let EXPORT_H = null; // when preset = custom, desired pixel height

// Keep the total logo width constant (sum of letter widths stays fixed)
let KEEP_TOTAL_WIDTH = KEEP_TOTAL_WIDTH_DEFAULT;
let BG_LINES = BG_LINES_DEFAULT;        // toggle via HTML checkbox
let BG_LINES_ALPHA = 255;
let PERF_MODE = PERF_MODE_DEFAULT;
let KF_PLAYING = false; // set during keyframe playback
let KF_SPEED_MUL = KF_SPEED_DEFAULT; // global multiplier for keyframe durations
let KF_TIME_CUR = KF_TIME_DEFAULT;   // current keyframe's duration (seconds)
// Cached background-lines buffer for main canvas
let _bgLinesCache = null;
let _bgLinesCacheKey = '';

let REPEAT_ENABLED = REPEAT_ENABLED_DEFAULT;
let REPEAT_MIRROR = REPEAT_MIRROR_DEFAULT;
let REPEAT_EXTRA_ROWS = REPEAT_EXTRA_ROWS_DEFAULT;
let _repeatExtraRowsMax = Math.max(0, ROWS_DEFAULT - 1);
// Tracks whether the user explicitly set Extra Rows to FULL (sticky across range changes)
let REPEAT_EXTRA_ROWS_IS_FULL = !Number.isFinite(REPEAT_EXTRA_ROWS_DEFAULT) && REPEAT_EXTRA_ROWS_DEFAULT > 0;
// Animated version of EXTRA_ROWS (for eased transitions)
let REPEAT_EXTRA_ROWS_ANIM = (Number.isFinite(REPEAT_EXTRA_ROWS_DEFAULT) ? REPEAT_EXTRA_ROWS_DEFAULT : 0);
let REPEAT_FALLOFF = REPEAT_FALLOFF_DEFAULT;        // current (animated)
let REPEAT_FALLOFF_TARGET = REPEAT_FALLOFF_DEFAULT; // target for easing
let REPEAT_MODE    = REPEAT_MODE_DEFAULT;   // 'uniform' or 'falloff'
let COLOR_COMBOS = [];
let activeColorComboIdx = 0;

// ---- Colors ----
// Target hex colors (selected preset)
let color1TargetHex = COLOR_BACKGROUND_DEFAULT; // background target
let color2TargetHex = COLOR_LOGO_DEFAULT;       // logo target
let color3TargetHex = COLOR_LINES_DEFAULT;      // lines target
// Animated CSS colors used for drawing (updated each frame)
let color1 = COLOR_BACKGROUND_DEFAULT;
let color2 = COLOR_LOGO_DEFAULT;
let color3 = COLOR_LINES_DEFAULT;

// (Color tween removed — colors update instantly)

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
function hexByte(n){ const x = Math.max(0, Math.min(255, n|0)); return (x < 16 ? '0' : '') + x.toString(16); }
function rgbToHex(r,g,b){ return '#' + hexByte(r) + hexByte(g) + hexByte(b); }
function parseCssColorToRgb(str){
  const s = String(str||'').trim();
  // #RRGGBB
  let m = /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(s.startsWith('#') ? s : '#' + s);
  if (m) return { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) };
  // #RGB
  m = /^#?([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(s.startsWith('#') ? s : '#' + s);
  if (m) return { r: parseInt(m[1]+m[1],16), g: parseInt(m[2]+m[2],16), b: parseInt(m[3]+m[3],16) };
  // rgb(r,g,b)
  m = /^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(s.toLowerCase());
  if (m) return { r: Math.max(0,Math.min(255,parseInt(m[1],10))), g: Math.max(0,Math.min(255,parseInt(m[2],10))), b: Math.max(0,Math.min(255,parseInt(m[3],10))) };
  // named minimal
  const sn = s.toLowerCase();
  if (sn === 'black') return { r:0,g:0,b:0 };
  if (sn === 'white') return { r:255,g:255,b:255 };
  return { r:0,g:0,b:0 };
}
function setColorTargets(bgHex, logoHex, linesHex, animate=true){
  // Color tween removed: set targets and active draw colors immediately
  if (bgHex){
    color1TargetHex = bgHex;
    const to = parseCssColorToRgb(bgHex);
    color1 = rgbToHex(to.r,to.g,to.b);
  }
  if (logoHex){
    color2TargetHex = logoHex;
    const to = parseCssColorToRgb(logoHex);
    color2 = rgbToHex(to.r,to.g,to.b);
  }
  if (linesHex){
    color3TargetHex = linesHex;
    const to = parseCssColorToRgb(linesHex);
    color3 = rgbToHex(to.r,to.g,to.b);
  }
}
function applyColorComboByIndex(idx){
  if (!Array.isArray(COLOR_COMBOS) || !COLOR_COMBOS.length) return;
  const safeIdx = Math.max(0, Math.min(COLOR_COMBOS.length - 1, idx | 0));
  const combo = COLOR_COMBOS[safeIdx];
  activeColorComboIdx = safeIdx;
  setColorTargets(
    combo.background || COLOR_BACKGROUND_DEFAULT,
    combo.logo || COLOR_LOGO_DEFAULT,
    combo.lines || COLOR_LINES_DEFAULT,
    true
  );
}

function sanitizeColor(hex, fallback){
  if (typeof hex === 'string' && hex.trim()) return hex.trim();
  return fallback;
}

// random animate
let lastAutoRandomMs = 0;
let autoRandomActive = AUTO_RANDOM_DEFAULT;
let autoRandomPeriodSec = AUTO_RANDOM_PERIOD_DEFAULT;
let autoTimer = null;
function setAuto(on){
  if (autoTimer){ clearInterval(autoTimer); autoTimer = null; }
  if (on){
    const ms = Math.max(50, Math.round(Math.max(0.05, autoRandomPeriodSec) * 1000));
    autoTimer = setInterval(()=>{ applyRandomTweaks(); }, ms);
  }
}

let rowYsCanvas = []; // y-position of each row in canvas coordinates
let rowYsSmooth = [];

// --- Curve + Animation controls ---
let MOUSE_CURVE = MOUSE_CURVE_DEFAULT;   // 'sine' | 'smoothstep'
let MOUSE_POWER = MOUSE_POWER_DEFAULT;       // t^power sharpening

let ANIM_MODE = ANIM_MODE_DEFAULT;     // 'off' | 'mouse' | 'pulse' | 'scan'
let ANIM_ENABLED = ANIM_ENABLED_DEFAULT;
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

    // Update pulse phase (0..1) when in automatic pulse mode
    if (ANIM_ENABLED && ANIM_MODE === 'pulse'){
      const period = Math.max(0.05, ANIM_PERIOD);
      const cyc = (animTime / period) % 1; // 0..1
      // Ping-pong 0..1..0 using cosine so ends ease naturally
      setPulsePhase(0.5 - 0.5 * Math.cos(TWO_PI * cyc));
    }

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
    const fadeBusy = Math.abs((ANIM_FADE||0) - (ANIM_FADE_TARGET||0)) > 1e-4;
    const mouseAmpBusy = Math.abs((MOUSE_AMPLITUDE_ANIM||0) - (MOUSE_AMPLITUDE_TARGET||0)) > 1e-4;
    const hAmpBusy = Math.abs((H_WAVE_AMP_ANIM||0) - (H_WAVE_AMP_TARGET||0)) > 1e-4;
    const modeActive = (ANIM_ENABLED && (ANIM_MODE === 'pulse' || ANIM_MODE === 'scan'));
    const waveActive = (ANIM_ENABLED && (H_WAVE_AMP_TARGET||0) !== 0);
    const frameActive = (modeActive || waveActive || fadeBusy || mouseAmpBusy || hAmpBusy);
    if (frameActive) requestRedraw();

    if (frameActive || _taperTransActive){
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

function updateAnimRun(){
  const fadeBusy = Math.abs((ANIM_FADE||0) - (ANIM_FADE_TARGET||0)) > 1e-4;
  const mouseAmpBusy = Math.abs((MOUSE_AMPLITUDE_ANIM||0) - (MOUSE_AMPLITUDE_TARGET||0)) > 1e-4;
  const hAmpBusy = Math.abs((H_WAVE_AMP_ANIM||0) - (H_WAVE_AMP_TARGET||0)) > 1e-4;
  const modeActive = (ANIM_ENABLED && (ANIM_MODE === 'pulse' || ANIM_MODE === 'scan'));
  const waveActive = (ANIM_ENABLED && (H_WAVE_AMP_TARGET||0) !== 0);
  if (modeActive || waveActive || fadeBusy || mouseAmpBusy || hAmpBusy){
    startAnimLoop();
  } else {
    stopAnimLoop();
  }
}

function isPlaybackActive(){
  if (KF_PLAYING) return true;
  const fadeBusy = Math.abs((ANIM_FADE||0) - (ANIM_FADE_TARGET||0)) > 1e-4;
  const modeActive = (ANIM_ENABLED && (ANIM_MODE === 'pulse' || ANIM_MODE === 'scan'));
  const waveActive = (ANIM_ENABLED && (H_WAVE_AMP_TARGET||0) !== 0);
  return !!(modeActive || waveActive || fadeBusy);
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
let _lastDrawT = 0;
function requestRedraw(){
  if (_needsRedraw) return;
  _needsRedraw = true;
  requestAnimationFrame(()=>{
    _needsRedraw = false;
    draw();
  });
}

function exportSVG(cb){
  try {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const sg = createGraphics(w, h, SVG);
    // Ensure intrinsic size on the SVG output
    if (sg && sg.elt && sg.elt.tagName && sg.elt.tagName.toLowerCase() === 'svg'){
      sg.elt.setAttribute('width', String(w));
      sg.elt.setAttribute('height', String(h));
      sg.elt.setAttribute('viewBox', `0 0 ${w} ${h}`);
      sg.elt.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      // Allow drawing beyond the viewport without clipping (helps PDF export avoid root clipping paths)
      sg.elt.setAttribute('overflow', 'visible');
    }
    const prev = isExport; isExport = true;
    // Draw current frame into the SVG graphics
    renderLogo(sg);
    isExport = prev;

    // Get SVG element and serialize
    const svgEl = (sg && sg._renderer && sg._renderer.svg) ? sg._renderer.svg : (sg && sg.elt ? sg.elt : null);
    if (!svgEl){ throw new Error('SVG renderer not available'); }
    // Ensure xmlns for standalone file
    if (!svgEl.getAttribute('xmlns')) svgEl.setAttribute('xmlns','http://www.w3.org/2000/svg');
    if (!svgEl.getAttribute('xmlns:xlink')) svgEl.setAttribute('xmlns:xlink','http://www.w3.org/1999/xlink');
    const data = new XMLSerializer().serializeToString(svgEl);
    if (typeof cb === 'function') cb(data, svgEl);
    return data;
  } catch(err){
    console.error('exportSVG failed:', err);
    if (typeof cb === 'function') cb(null, null, err);
    return null;
  }
}

async function exportMP4(){
  if (typeof MediaRecorder === 'undefined'){
    throw new Error('MediaRecorder not supported in this browser');
  }
  // Determine desired export resolution from Size preset/custom
  let targetW = Math.max(1, width), targetH = Math.max(1, height);
  try {
    const presetSel = document.getElementById('preset');
    if (presetSel){
      const val = String(presetSel.value || 'fit');
      if (val === 'custom'){
        // Prefer applied custom px if present
        let w = (typeof EXPORT_W === 'number') ? EXPORT_W : null;
        let h = (typeof EXPORT_H === 'number') ? EXPORT_H : null;
        if (!w || !h){
          const elW = document.getElementById('aspectW');
          const elH = document.getElementById('aspectH');
          const ww = parseInt(elW && elW.value, 10);
          const hh = parseInt(elH && elH.value, 10);
          if (Number.isFinite(ww) && Number.isFinite(hh) && ww > 0 && hh > 0){ w = ww; h = hh; }
        }
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0){ targetW = w; targetH = h; }
      } else if (val !== 'fit'){
        const opt = presetSel.options[presetSel.selectedIndex];
        const dw = parseInt(opt && opt.dataset && opt.dataset.w, 10);
        const dh = parseInt(opt && opt.dataset && opt.dataset.h, 10);
        if (Number.isFinite(dw) && Number.isFinite(dh) && dw > 0 && dh > 0){ targetW = dw; targetH = dh; }
      }
    }
  } catch(e){}

  const canvasEl = (mainCanvas && mainCanvas.elt) ? mainCanvas.elt : null;
  if (!canvasEl || !canvasEl.captureStream){
    throw new Error('Canvas captureStream not available');
  }

  // Temporarily resize the main canvas to target resolution for crisp capture
  const prevW = width, prevH = height;
  let prevPD = null;
  const prevPerf = PERF_MODE;
  try {
    // Force high-quality rendering during capture
    PERF_MODE = false;
    if (width !== targetW || height !== targetH){
      // Force pixel density = 1 so exported pixels match requested resolution exactly
      try { prevPD = (typeof pixelDensity === 'function') ? pixelDensity() : null; } catch(e){}
      try { if (typeof pixelDensity === 'function') pixelDensity(1); } catch(e){}
      resizeCanvas(Math.max(1, targetW), Math.max(1, targetH), true);
      layout = buildLayout(currentLogoText(), rows);
      requestRedraw();
      // Allow one tick for resize to take effect
      await new Promise(r => setTimeout(r, 0));
    }
  } catch(e){}

  const fps = 60;
  const stream = canvasEl.captureStream(fps);
  // Pick best supported mime — prefer MP4 first if the browser supports it
  const candidates = [
    // MP4/H264 (supported in Safari; some Chrome/Edge builds)
    'video/mp4;codecs=h264',
    'video/mp4;codecs=avc1.4D401E',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    // WebM fallbacks (widely supported by Chrome/Edge/Firefox)
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  let mime = '';
  for (const m of candidates){ if (MediaRecorder.isTypeSupported(m)){ mime = m; break; } }
  if (!mime){ throw new Error('No supported recording mimeType'); }

  // Compute bitrate based on resolution and fps to avoid muddiness
  const px = Math.max(1, Math.round(targetW)) * Math.max(1, Math.round(targetH));
  const bpp = 1; // bits per pixel per frame (tune as needed)
  const est = Math.round(px * fps * bpp);
  const vbr = Math.max(4_000_000, Math.min(50_000_000, est));
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: vbr });
  rec.ondataavailable = (e)=>{ if (e && e.data && e.data.size > 0) chunks.push(e.data); };

  // Determine duration: one full keyframe cycle if available; else 3s
  const kfList = (function(){ try { return (typeof window !== 'undefined' && window.__keyframesRef) ? window.__keyframesRef : []; } catch(e){ return []; }})();
  let totalSec = 3.0;
  try {
    if (Array.isArray(kfList) && kfList.length){
      const sum = kfList.reduce((s,k)=> s + Math.max(0.05, (k && k.timeSec) ? k.timeSec : KF_TIME_DEFAULT), 0);
      totalSec = Math.max(0.2, sum * Math.max(0.1, KF_SPEED_MUL));
    }
  } catch(e){}

  // Prepare playback; start after recorder is running
  const wasPlaying = !!KF_PLAYING;

  // Warm-up: force a couple of painted frames at target size before starting the recorder
  try {
    // Ensure glyphs for current text are available
    try { ensureGlyphsLoadedFor(currentLogoText()); } catch(e){}
    // Wait briefly for any pending glyph loads (bounded)
    const chars = Array.from(new Set(String(currentLogoText()||'').toUpperCase().split('').filter(c => /^[A-Z]$/.test(c))));
    const deadlineAssets = performance.now() + 1000;
    while (true){
      const ready = chars.every(ch => glyphImgs[ch] && glyphDims[ch] && glyphDims[ch].w > 0 && glyphDims[ch].h > 0);
      if (ready || performance.now() > deadlineAssets) break;
      await new Promise(res => setTimeout(res, 16));
    }
    const startMark = performance.now();
    requestRedraw();
    await new Promise(res => requestAnimationFrame(res));
    await new Promise(res => requestAnimationFrame(res));
    // Wait until draw() has happened after warm-up
    const t0 = _lastDrawT;
    const deadline = startMark + 1000;
    while (_lastDrawT <= t0 && performance.now() < deadline){
      await new Promise(res => requestAnimationFrame(res));
    }
  } catch(e){}

  const started = new Promise((resolve)=>{ try { rec.onstart = ()=> resolve(); } catch(e){ resolve(); } });
  const stopped = new Promise((resolve)=>{
    rec.onstop = ()=> resolve();
  });
  // Hint encoder for detailed content
  try { const tr = stream.getVideoTracks && stream.getVideoTracks()[0]; if (tr) tr.contentHint = 'detail'; } catch(e){}
  rec.start();
  // Wait for recorder to be ready, then start autoplay to capture from exact beginning
  try { await started; } catch(e){}
  if (!wasPlaying){ try { if (typeof window !== 'undefined' && window.__kfPlay) window.__kfPlay(); } catch(e){} }
  await new Promise(res=> setTimeout(res, Math.round(totalSec * 1000)));
  rec.stop();
  await stopped;

  if (!wasPlaying){ try { if (typeof window !== 'undefined' && window.__kfStop) window.__kfStop(); } catch(e){} }

  const blob = new Blob(chunks, { type: mime });
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  downloadBlob(blob, `export.${ext}`);

  // Restore original canvas size after capture
  try {
    // Restore pixel density first so resize uses the correct backing resolution
    try { if (prevPD != null && typeof pixelDensity === 'function') pixelDensity(prevPD); } catch(e){}
    if (prevW !== width || prevH !== height){
      resizeCanvas(Math.max(1, prevW), Math.max(1, prevH), true);
      layout = buildLayout(currentLogoText(), rows);
      requestRedraw();
    }
    PERF_MODE = prevPerf;
    // Refit wrapper just in case
    try { if (typeof fitViewportToWindow === 'function') fitViewportToWindow(); } catch(e){}
  } catch(e){}
}

// Higher-bitrate MP4 export (less compression)
async function exportMP4HQ(){
  if (typeof MediaRecorder === 'undefined'){
    throw new Error('MediaRecorder not supported in this browser');
  }
  // Determine desired export resolution from Size preset/custom
  let targetW = Math.max(1, width), targetH = Math.max(1, height);
  try {
    const presetSel = document.getElementById('preset');
    if (presetSel){
      const val = String(presetSel.value || 'fit');
      if (val === 'custom'){
        let w = (typeof EXPORT_W === 'number') ? EXPORT_W : null;
        let h = (typeof EXPORT_H === 'number') ? EXPORT_H : null;
        if (!w || !h){
          const elW = document.getElementById('aspectW');
          const elH = document.getElementById('aspectH');
          const ww = parseInt(elW && elW.value, 10);
          const hh = parseInt(elH && elH.value, 10);
          if (Number.isFinite(ww) && Number.isFinite(hh) && ww > 0 && hh > 0){ w = ww; h = hh; }
        }
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0){ targetW = w; targetH = h; }
      } else if (val !== 'fit'){
        const opt = presetSel.options[presetSel.selectedIndex];
        const dw = parseInt(opt && opt.dataset && opt.dataset.w, 10);
        const dh = parseInt(opt && opt.dataset && opt.dataset.h, 10);
        if (Number.isFinite(dw) && Number.isFinite(dh) && dw > 0 && dh > 0){ targetW = dw; targetH = dh; }
      }
    }
  } catch(e){}

  const canvasEl = (mainCanvas && mainCanvas.elt) ? mainCanvas.elt : null;
  if (!canvasEl || !canvasEl.captureStream){
    throw new Error('Canvas captureStream not available');
  }

  // Temporarily resize the main canvas to target resolution for crisp capture
  const prevW = width, prevH = height;
  let prevPD = null;
  const prevPerf = PERF_MODE;
  try {
    PERF_MODE = false;
    if (width !== targetW || height !== targetH){
      try { prevPD = (typeof pixelDensity === 'function') ? pixelDensity() : null; } catch(e){}
      try { if (typeof pixelDensity === 'function') pixelDensity(1); } catch(e){}
      resizeCanvas(Math.max(1, targetW), Math.max(1, targetH), true);
      layout = buildLayout(currentLogoText(), rows);
      requestRedraw();
      await new Promise(r => setTimeout(r, 0));
    }
  } catch(e){}

  const fps = 60;
  const stream = canvasEl.captureStream(fps);
  // Restrict to MP4‑compatible mime types; prefer H264
  const candidates = [
    'video/mp4;codecs=h264',
    'video/mp4;codecs=avc1.4D401E',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4'
  ];
  let mime = '';
  for (const m of candidates){ if (MediaRecorder.isTypeSupported(m)){ mime = m; break; } }
  if (!mime){ throw new Error('No MP4 recording mimeType supported by this browser'); }

  // Higher target bitrate: scale with resolution × fps, use a higher bpp and cap higher
  const px = Math.max(1, Math.round(targetW)) * Math.max(1, Math.round(targetH));
  const bppHQ = 2; // bits per pixel per frame (higher than default)
  const est = Math.round(px * fps * bppHQ);
  const vbr = Math.max(20_000_000, Math.min(100_000_000, est));
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: vbr });
  rec.ondataavailable = (e)=>{ if (e && e.data && e.data.size > 0) chunks.push(e.data); };

  // Determine duration: one full keyframe cycle if available; else 3s
  const kfList = (function(){ try { return (typeof window !== 'undefined' && window.__keyframesRef) ? window.__keyframesRef : []; } catch(e){ return []; }})();
  let totalSec = 3.0;
  try {
    if (Array.isArray(kfList) && kfList.length){
      const sum = kfList.reduce((s,k)=> s + Math.max(0.05, (k && k.timeSec) ? k.timeSec : KF_TIME_DEFAULT), 0);
      totalSec = Math.max(0.2, sum * Math.max(0.1, KF_SPEED_MUL));
    }
  } catch(e){}

  // Warm-up then record
  const wasPlaying = !!KF_PLAYING;
  try {
    try { ensureGlyphsLoadedFor(currentLogoText()); } catch(e){}
    const chars = Array.from(new Set(String(currentLogoText()||'').toUpperCase().split('').filter(c => /^[A-Z]$/.test(c))));
    const deadlineAssets = performance.now() + 1000;
    while (true){
      const ready = chars.every(ch => glyphImgs[ch] && glyphDims[ch] && glyphDims[ch].w > 0 && glyphDims[ch].h > 0);
      if (ready || performance.now() > deadlineAssets) break;
      await new Promise(res => setTimeout(res, 16));
    }
    const startMark = performance.now();
    requestRedraw();
    await new Promise(res => requestAnimationFrame(res));
    await new Promise(res => requestAnimationFrame(res));
    const t0 = _lastDrawT;
    const deadline = startMark + 1000;
    while (_lastDrawT <= t0 && performance.now() < deadline){
      await new Promise(res => requestAnimationFrame(res));
    }
  } catch(e){}

  const started = new Promise((resolve)=>{ try { rec.onstart = ()=> resolve(); } catch(e){ resolve(); } });
  const stopped = new Promise((resolve)=>{ rec.onstop = ()=> resolve(); });
  try { const tr = stream.getVideoTracks && stream.getVideoTracks()[0]; if (tr) tr.contentHint = 'detail'; } catch(e){}
  rec.start();
  try { await started; } catch(e){}
  if (!wasPlaying){ try { if (typeof window !== 'undefined' && window.__kfPlay) window.__kfPlay(); } catch(e){} }
  await new Promise(res=> setTimeout(res, Math.round(totalSec * 1000)));
  rec.stop();
  await stopped;
  if (!wasPlaying){ try { if (typeof window !== 'undefined' && window.__kfStop) window.__kfStop(); } catch(e){} }

  const blob = new Blob(chunks, { type: mime });
  downloadBlob(blob, 'export-hq.mp4');

  // Restore original canvas size after capture
  try {
    try { if (prevPD != null && typeof pixelDensity === 'function') pixelDensity(prevPD); } catch(e){}
    if (prevW !== width || prevH !== height){
      resizeCanvas(Math.max(1, prevW), Math.max(1, prevH), true);
      layout = buildLayout(currentLogoText(), rows);
      requestRedraw();
    }
    PERF_MODE = prevPerf;
    try { if (typeof fitViewportToWindow === 'function') fitViewportToWindow(); } catch(e){}
  } catch(e){}
}

async function exportWebM(){
  if (typeof MediaRecorder === 'undefined'){
    throw new Error('MediaRecorder not supported in this browser');
  }
  // Determine desired export resolution from Size preset/custom
  let targetW = Math.max(1, width), targetH = Math.max(1, height);
  try {
    const presetSel = document.getElementById('preset');
    if (presetSel){
      const val = String(presetSel.value || 'fit');
      if (val === 'custom'){
        let w = (typeof EXPORT_W === 'number') ? EXPORT_W : null;
        let h = (typeof EXPORT_H === 'number') ? EXPORT_H : null;
        if (!w || !h){
          const elW = document.getElementById('aspectW');
          const elH = document.getElementById('aspectH');
          const ww = parseInt(elW && elW.value, 10);
          const hh = parseInt(elH && elH.value, 10);
          if (Number.isFinite(ww) && Number.isFinite(hh) && ww > 0 && hh > 0){ w = ww; h = hh; }
        }
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0){ targetW = w; targetH = h; }
      } else if (val !== 'fit'){
        const opt = presetSel.options[presetSel.selectedIndex];
        const dw = parseInt(opt && opt.dataset && opt.dataset.w, 10);
        const dh = parseInt(opt && opt.dataset && opt.dataset.h, 10);
        if (Number.isFinite(dw) && Number.isFinite(dh) && dw > 0 && dh > 0){ targetW = dw; targetH = dh; }
      }
    }
  } catch(e){}

  const canvasEl = (mainCanvas && mainCanvas.elt) ? mainCanvas.elt : null;
  if (!canvasEl || !canvasEl.captureStream){
    throw new Error('Canvas captureStream not available');
  }

  // Temporarily resize the main canvas to target resolution for crisp capture
  const prevW = width, prevH = height;
  let prevPD = null;
  const prevPerf = PERF_MODE;
  try {
    // Force high-quality rendering during capture
    PERF_MODE = false;
    if (width !== targetW || height !== targetH){
      try { prevPD = (typeof pixelDensity === 'function') ? pixelDensity() : null; } catch(e){}
      try { if (typeof pixelDensity === 'function') pixelDensity(1); } catch(e){}
      resizeCanvas(Math.max(1, targetW), Math.max(1, targetH), true);
      layout = buildLayout(currentLogoText(), rows);
      requestRedraw();
      await new Promise(r => setTimeout(r, 0));
    }
  } catch(e){}

  const fps = 60;
  const stream = canvasEl.captureStream(fps);
  // Prefer WebM codecs first
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    // Fallbacks (in case browser only supports mp4)
    'video/mp4;codecs=h264',
    'video/mp4;codecs=avc1.4D401E',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4'
  ];
  let mime = '';
  for (const m of candidates){ if (MediaRecorder.isTypeSupported(m)){ mime = m; break; } }
  if (!mime){ throw new Error('No supported recording mimeType'); }

  // Bitrate based on resolution and fps
  const px = Math.max(1, Math.round(targetW)) * Math.max(1, Math.round(targetH));
  const bpp = 1; // bits per pixel per frame
  const est = Math.round(px * fps * bpp);
  const vbr = Math.max(4_000_000, Math.min(50_000_000, est));
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: vbr });
  rec.ondataavailable = (e)=>{ if (e && e.data && e.data.size > 0) chunks.push(e.data); };

  // Duration: full keyframe cycle if present; else 3s
  const kfList = (function(){ try { return (typeof window !== 'undefined' && window.__keyframesRef) ? window.__keyframesRef : []; } catch(e){ return []; }})();
  let totalSec = 3.0;
  try {
    if (Array.isArray(kfList) && kfList.length){
      const sum = kfList.reduce((s,k)=> s + Math.max(0.05, (k && k.timeSec) ? k.timeSec : KF_TIME_DEFAULT), 0);
      totalSec = Math.max(0.2, sum * Math.max(0.1, KF_SPEED_MUL));
    }
  } catch(e){}

  // Warm-up and start
  const wasPlaying = !!KF_PLAYING;
  try {
    try { ensureGlyphsLoadedFor(currentLogoText()); } catch(e){}
    const chars = Array.from(new Set(String(currentLogoText()||'').toUpperCase().split('').filter(c => /^[A-Z]$/.test(c))));
    const deadlineAssets = performance.now() + 1000;
    while (true){
      const ready = chars.every(ch => glyphImgs[ch] && glyphDims[ch] && glyphDims[ch].w > 0 && glyphDims[ch].h > 0);
      if (ready || performance.now() > deadlineAssets) break;
      await new Promise(res => setTimeout(res, 16));
    }
    const startMark = performance.now();
    requestRedraw();
    await new Promise(res => requestAnimationFrame(res));
    await new Promise(res => requestAnimationFrame(res));
    const t0 = _lastDrawT;
    const deadline = startMark + 1000;
    while (_lastDrawT <= t0 && performance.now() < deadline){
      await new Promise(res => requestAnimationFrame(res));
    }
  } catch(e){}

  const started = new Promise((resolve)=>{ try { rec.onstart = ()=> resolve(); } catch(e){ resolve(); } });
  const stopped = new Promise((resolve)=>{ rec.onstop = ()=> resolve(); });
  try { const tr = stream.getVideoTracks && stream.getVideoTracks()[0]; if (tr) tr.contentHint = 'detail'; } catch(e){}
  rec.start();
  try { await started; } catch(e){}
  if (!wasPlaying){ try { if (typeof window !== 'undefined' && window.__kfPlay) window.__kfPlay(); } catch(e){} }
  await new Promise(res=> setTimeout(res, Math.round(totalSec * 1000)));
  rec.stop();
  await stopped;
  if (!wasPlaying){ try { if (typeof window !== 'undefined' && window.__kfStop) window.__kfStop(); } catch(e){} }

  const blob = new Blob(chunks, { type: mime });
  const ext = mime.includes('webm') ? 'webm' : (mime.includes('mp4') ? 'mp4' : 'webm');
  downloadBlob(blob, `export.${ext}`);

  // Restore canvas
  try {
    try { if (prevPD != null && typeof pixelDensity === 'function') pixelDensity(prevPD); } catch(e){}
    if (prevW !== width || prevH !== height){
      resizeCanvas(Math.max(1, prevW), Math.max(1, prevH), true);
      layout = buildLayout(currentLogoText(), rows);
      requestRedraw();
    }
    PERF_MODE = prevPerf;
    try { if (typeof fitViewportToWindow === 'function') fitViewportToWindow(); } catch(e){}
  } catch(e){}
}

function downloadTextAsFile(text, filename, mime = 'image/svg+xml'){
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(()=> URL.revokeObjectURL(a.href), 500);
}

function downloadBlob(blob, filename){
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(()=> URL.revokeObjectURL(a.href), 500);
  } catch(e){ console.error('downloadBlob failed', e); }
}

// === UI helpers: keyframe total + easing duration coupling ===
function updateKfTotalOut(){
  try {
    const el = (typeof document !== 'undefined') ? document.getElementById('kfTotalOut') : null;
    if (!el) return;
    const list = (typeof window !== 'undefined' && Array.isArray(window.__keyframesRef)) ? window.__keyframesRef : [];
    if (!list.length){ el.textContent = 'Total: 0.00 s'; return; }
    const sum = list.reduce((s, k) => s + Math.max(0.05, (k && k.timeSec) ? k.timeSec : KF_TIME_DEFAULT), 0);
    const total = Math.max(0.05, sum * Math.max(0.1, KF_SPEED_MUL));
    el.textContent = `Total: ${total.toFixed(2)} s`;
  } catch(e){}
}

function updateEaseDurationFromKf(){
  // Derive easing duration from current keyframe duration using percentage
  const pct = Math.max(0, Number(EASE_DURATION_PCT) || 0);
  // Use effective playback time (per-frame duration × global speed multiplier)
  const base = Math.max(0.05, (Number(KF_TIME_CUR) || KF_TIME_DEFAULT) * Math.max(0.1, Number(KF_SPEED_MUL) || KF_SPEED_DEFAULT));
  EASE_DURATION = Math.max(0, base * (pct / 100));
  try {
    const out = (typeof document !== 'undefined') ? document.getElementById('easeDurPctOut') : null;
    if (out) out.textContent = `${Math.round(pct)} %`;
  } catch(e){}
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
  // When disabled, keep static at current pulse-phase (no automation)
  if (!ANIM_ENABLED) {
    const L = leftBound; const span = Math.max(1, rightBound - leftBound);
    return L + Math.max(0, Math.min(1, PULSE_PHASE)) * span;
  }
  if (ANIM_MODE === 'mouse'){
    const L = leftBound; const R = rightBound; const span = Math.max(1, R - L);
    const mx = (mouseX - txLike) / Math.max(0.0001, sLike);
    const pos = (mx - L) / span;
    setPulsePhase(Math.max(0, Math.min(1, pos)));
    return mx;
  }
  const L = leftBound;
  const R = rightBound;
  const span = Math.max(1, R - L);
  const period = Math.max(0.05, ANIM_PERIOD); // seconds per full cycle
  const p = (animTime / period) % 1;          // normalized phase [0,1)

  if (ANIM_MODE === 'pulse'){
    const pos = Math.max(0, Math.min(1, PULSE_PHASE));
    return L + pos * span;
  } else if (ANIM_MODE === 'scan'){
    const m = Math.max(0, Math.min(1, SCAN_MARGIN_FRAC));
    const f = -m + (1 + 2 * m) * p; // -m → 1+m, then wraps to -m
    const posNorm = Math.max(0, Math.min(1, (f + m) / Math.max(0.0001, 1 + 2 * m)));
    setPulsePhase(posNorm);
    return L + f * span;
  }

  // 'off' mode: static at pulse-phase (no automation)
  return L + Math.max(0, Math.min(1, PULSE_PHASE)) * span;
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
  // Legacy exponential smoothing (still used for rows/displace groups)
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
  let capacityDirty = false;

  const now = performance.now() / 1000;

  // Time-based tweens for slider-driven params
  const lineStep = stepTween(_paramTweens.linePx, linePx, linePxTarget, now);
  if (lineStep.changed) linePx = lineStep.value;
  if (lineStep.animating) animating = true;
  if (lineStep.changed) capacityDirty = true; // row height affects repeat capacity

  // Special handling for 'fadeIn': per-row stagger for height (no opacity)
  if (!_taperTransActive){
    if (EASE_TYPE === 'fadeIn'){
      const tw = _paramTweens.linePx;
      if (tw && tw.active){
        _fadeTNorm = Math.max(0, Math.min(1, (now - tw.start) / Math.max(0.0001, tw.dur)));
        // Height uses per-row stagger; base mul stays 1 here.
        _lineMul = 1.0;
      } else {
        _fadeTNorm = 1.0;
        _lineMul = 1.0;
      }
    } else {
      _fadeTNorm = 1.0;
      // keep _lineMul unchanged
    }
  }

  const gapStep = stepTween(_paramTweens.gapPx, gapPx, gapPxTarget, now);
  if (gapStep.changed){ gapPx = gapStep.value; /* no layout rebuild needed for gap */ }
  if (gapStep.animating) animating = true;

  const dispStep = stepTween(_paramTweens.dispUnit, DISPLACE_UNIT, DISPLACE_UNIT_TARGET, now);
  if (dispStep.changed){ DISPLACE_UNIT = dispStep.value; /* no layout rebuild needed for displacement */ }
  if (dispStep.animating) animating = true;

  const tipStep = stepTween(_paramTweens.tipRatio, TIP_RATIO, TIP_RATIO_TARGET, now);
  if (tipStep.changed) TIP_RATIO = tipStep.value;
  if (tipStep.animating) animating = true;

  // Visible repeat extra rows — map Infinity to capacity, then tween
  const targetExtraNumeric = Number.isFinite(REPEAT_EXTRA_ROWS)
    ? Math.max(0, REPEAT_EXTRA_ROWS)
    : Math.max(0, _repeatExtraRowsMax);
  const extraStep = stepTween(_paramTweens.extraRows, REPEAT_EXTRA_ROWS_ANIM, targetExtraNumeric, now);
  if (extraStep.changed) REPEAT_EXTRA_ROWS_ANIM = extraStep.value;
  if (extraStep.animating) animating = true;

  // Repeat falloff easing (0.5..1 → 1 = uniform)
  const rfStep = stepTween(_paramTweens.repeatFalloff, REPEAT_FALLOFF, REPEAT_FALLOFF_TARGET, now);
  if (rfStep.changed) REPEAT_FALLOFF = rfStep.value;
  if (rfStep.animating) animating = true;

  // Width scale (percentage control)
  const widthStep = stepTween(_paramTweens.widthScale, widthScale, widthScaleTarget, now);
  if (widthStep.changed) widthScale = widthStep.value;
  if (widthStep.animating) animating = true;
  if (widthStep.changed) capacityDirty = true;

  // Logo scale (overall size)
  const logoStep = stepTween(_paramTweens.logoScale, logoScaleMul, logoScaleTarget, now);
  if (logoStep.changed) logoScaleMul = logoStep.value;
  if (logoStep.animating) animating = true;
  if (logoStep.changed) capacityDirty = true;

  // Rows tween (animate rowsAnim toward rowsTarget)
  const rowsStep = stepTween(_paramTweens.rows, rowsAnim, rowsTarget, now);
  if (rowsStep.changed) rowsAnim = rowsStep.value;
  if (rowsStep.animating) animating = true;
  if (rowsStep.changed) capacityDirty = true;

  // Displacement groups (continuous value; actual grouping calc still discrete)
  const grpStep = stepTween(_paramTweens.groups, displaceGroupsAnim, displaceGroupsTarget, now);
  if (grpStep.changed) displaceGroupsAnim = grpStep.value;
  if (grpStep.animating) animating = true;
  // Colors update instantly via setColorTargets; no per-frame color tweening

  // Dash length multiplier tween (independent fill)
  const dlStep = stepTween(_paramTweens.dashMul, LINE_LEN_MUL_ANIM, LINE_LEN_MUL_TARGET, now);
  if (dlStep.changed) LINE_LEN_MUL_ANIM = dlStep.value;
  if (dlStep.animating) animating = true;

  // Wave: amplitude tweens + enable/disable fade
  const ampStep = stepTween(_paramTweens.mouseAmp, MOUSE_AMPLITUDE_ANIM, MOUSE_AMPLITUDE_TARGET, now);
  if (ampStep.changed) MOUSE_AMPLITUDE_ANIM = ampStep.value;
  if (ampStep.animating) animating = true;

  const hAmpStep = stepTween(_paramTweens.hWaveAmp, H_WAVE_AMP_ANIM, H_WAVE_AMP_TARGET, now);
  if (hAmpStep.changed) H_WAVE_AMP_ANIM = hAmpStep.value;
  if (hAmpStep.animating) animating = true;

  const fadeTarget = Math.max(0, Math.min(1, ANIM_FADE_TARGET));
  const fadeStep = stepTween(_paramTweens.animFade, ANIM_FADE, fadeTarget, now);
  if (fadeStep.changed) ANIM_FADE = fadeStep.value;
  if (fadeStep.animating) animating = true;

  // Recompute per-frame stretch bounds using effective amplitude (amp × shaped fade)
  const effMouseAmp = Math.max(0, MOUSE_AMPLITUDE_ANIM) * shapeFade01(Math.max(0, ANIM_FADE));
  const stretchAbove = (BASE_STRETCH_MAX - 1) * effMouseAmp;
  const stretchBelow = (1 - BASE_STRETCH_MIN) * effMouseAmp;
  MOUSE_STRETCH_MAX = 1 + stretchAbove;
  MOUSE_STRETCH_MIN = Math.max(0.05, 1 - stretchBelow);

  if (layoutNeedsRebuild) _layoutDirty = true;
  if (capacityDirty){
    try { updateRepeatSlidersRange(); } catch(e){}
  }
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
    const { min, max, step } = getInputRange(elWidth);
    const pct = randFromRangeInt(Math.max(min), Math.min(max), Math.max(step));
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
  // Snap animated color state to initial targets (avoid first-load pop)
  setColorTargets(color1TargetHex, color2TargetHex, color3TargetHex, false);
  // Preload glyphs for all configured text options
  const preloadText = LOGO_TEXT_OPTIONS.join('').toUpperCase();
  const uniq = Array.from(new Set(preloadText.split('')));
  uniq.forEach(ch => {
    if (!/^[A-Z]$/.test(ch)) return; // skip spaces and non-letters
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
  switch(String(mode||'Rounded')){
    case 'Rounded':  return 1;
    case 'Straight': return 2;
    case 'Circles':  return 3;
    case 'Blocks':   return 4;
    case 'Pluses':   return 5;
    default:         return 1;
  }
}
// Show pending shape during transition to keep UI consistent
function effectiveTaperMode(){
  return _taperPendingMode || taperMode;
}
function triggerTaperSwitch(nextMode){
  const target = String(nextMode||'Rounded');
  // Switch shapes instantly without easing/transition
  if (target === taperMode){ return; }
  taperMode = target;
  _taperPendingMode = null;
  _taperTransActive = false;
  _taperPhase = 'idle';
  _lineMul = 1.0;
  requestRedraw();
  // Reflect target immediately in UI controls so chips/sliders don't look swapped
  try {
    if (typeof document !== 'undefined'){
      const idx = modeToIndex(target);
      const elIdx = document.getElementById('taperIndex');
      if (elIdx) elIdx.value = String(idx);
      const elIdxOut = document.getElementById('taperIndexOut');
      if (elIdxOut) elIdxOut.textContent = modeFromIndex(idx);
      const elSel = document.getElementById('taper');
      if (elSel) elSel.value = target;
    }
  } catch(e){}
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
        H_WAVE_AMP = v; H_WAVE_AMP_TARGET = v;
        if (elHWaveAmpOut) elHWaveAmpOut.textContent = v.toFixed(2) + '×';
        requestRedraw();
        updateAnimRun();
      }
    });
  }
  elHWavePeriod = document.getElementById('hWavePeriod');
  elHWavePeriodOut = document.getElementById('hWavePeriodOut');
  if (elHWavePeriod){
    elHWavePeriod.value = String(H_WAVE_PERIOD.toFixed(2));
    if (elHWavePeriodOut) elHWavePeriodOut.textContent = `${H_WAVE_PERIOD.toFixed(2)} s`;
    elHWavePeriod.addEventListener('input', ()=>{
      const v = parseFloat(elHWavePeriod.value);
      if (Number.isFinite(v)){
        H_WAVE_PERIOD = Math.max(0.0, v);
        if (elHWavePeriodOut) elHWavePeriodOut.textContent = `${H_WAVE_PERIOD.toFixed(2)} s`;
        updateAnimRun();
        requestRedraw();
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
  // Keep a reference to the wrapper for sizing; no overlay used.
  if (LOGO_TARGET_W <= 0) LOGO_TARGET_W = Math.max(1, width);
  baseRowPitch = height / rows;
  // Freeze the visual logo height in pre-scale units; adding rows should not stretch the logo
  targetContentH = (rows <= 1) ? 0 : (rows - 1) * baseRowPitch;
  layout = buildLayout(currentLogoText());
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
  elFillBtn      = byId('fillBtn');
  elLogoText     = byId('logoText');
  elGroups       = byId('groups');
  elGroupsOut    = byId('groupsOut');
  elTaper        = byId('taper');
  elDebug        = byId('debug');
  elAuto         = byId('autorand');
  elAutoDur      = byId('autorandDur');
  elAutoDurOut   = byId('autorandDurOut');
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
  const elApplyCustomAR   = byId('applyCustomAR');
  elReset        = byId('resetDefaults');

  // Easing controls
  elEaseType     = byId('easeType');
  elEaseDurPct   = byId('easeDurPct');
  elEaseDurPctOut= byId('easeDurPctOut');
  elEaseAmp      = byId('easeAmp');
  elEaseAmpOut   = byId('easeAmpOut');

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
  const optCurveSine      = byId('curveSine');
  const optCurveSmooth    = byId('curveSmooth');
  const powerCtl          = byId('powerCtl');
  const powerOut          = byId('powerOut');
  const animPeriodCtl     = byId('animPeriod');
  const animPeriodOut     = byId('animPeriodOut');
  elPulsePhase            = byId('pulsePhase');
  elPulsePhaseOut         = byId('pulsePhaseOut');

  // Export controls (export bar)
  const exportFormatSel = byId('exportFormat');
  const btnExportGo = byId('exportGo');
  const btnCfgSave = byId('cfgSave');
  const btnCfgLoad = byId('cfgLoad');
  const elCfgFile  = byId('cfgFile');

  elTaperIndex = byId('taperIndex');
  elTaperIndexOut = byId('taperIndexOut');
  elAnimEnabled = byId('animEnabled');
  const elPerfMode = byId('perfMode');

  // Logo text dropdown
  if (elLogoText){
    // Build options dynamically from config
    while (elLogoText.firstChild) elLogoText.removeChild(elLogoText.firstChild);
    LOGO_TEXT_OPTIONS.forEach(txt => {
      const opt = document.createElement('option');
      opt.value = txt; opt.textContent = txt;
      elLogoText.appendChild(opt);
    });
    // Initialize UI to current state (preserve original case)
    elLogoText.value = currentLogoText();
    // Keep state in sync on change
    elLogoText.addEventListener('change', ()=>{
      const v = elLogoText.value || LOGO_TEXT_OPTIONS[0];
      setLogoText(v);
    });
  }

  // ID controls
  const elIdCode   = byId('idCode');
  const elIdGet    = byId('idGet');
  const elIdSet    = byId('idSet');
  const elIdCopy   = byId('idCopy');
  const elIdStatus = byId('idStatus');
  const setIdStatus = (msg, ok=true)=>{ if (elIdStatus){ elIdStatus.textContent = msg; elIdStatus.style.opacity = ok ? '0.8' : '1'; } };
  if (elIdGet){
    elIdGet.addEventListener('click', ()=>{
      try {
        const code = (window.getParamCode ? window.getParamCode() : '');
        if (elIdCode) elIdCode.value = code;
        setIdStatus('Generated');
      } catch(err){ setIdStatus('Failed to generate', false); }
    });
  }
  if (elIdCopy){
    elIdCopy.addEventListener('click', async ()=>{
      try {
        const code = elIdCode && elIdCode.value ? elIdCode.value : (window.getParamCode ? window.getParamCode() : '');
        if (navigator.clipboard && navigator.clipboard.writeText){
          await navigator.clipboard.writeText(code);
        } else {
          const ta = document.createElement('textarea');
          ta.value = code; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        }
        setIdStatus('Copied');
      } catch(err){ setIdStatus('Copy failed', false); }
    });
  }
  if (elIdSet){
    elIdSet.addEventListener('click', ()=>{
      try {
        const raw = (elIdCode && elIdCode.value) ? elIdCode.value.trim() : '';
        const ok = window.applyParamCodeFast ? window.applyParamCodeFast(raw)
                  : (window.applyParamCode ? window.applyParamCode(raw) : false);
        // Persist this applied ID into the active keyframe
        try { kfAutosaveCurrent(); } catch(e){}
        setIdStatus(ok ? 'Applied' : 'Invalid code', !!ok);
      } catch(err){ setIdStatus('Invalid code', false); }
    });
  }

  // ----- Keyframes (store/apply ID codes) -----
  const elKfList   = byId('kfList');
  // New timing controls (export bar)
  elKfTime = byId('kfTime');
  elKfTimeOut = byId('kfTimeOut');
  elKfSpeed = byId('kfSpeed');
  elKfSpeedOut = byId('kfSpeedOut');
  const elKfAdd    = byId('kfAdd');
  const elKfDel    = byId('kfDel');
  const elKfToggle = byId('kfToggle');

  const keyframes = []; // { code: string, map?: object }
  let kfIndex = -1;
  let kfTimer = null; // timeout handle for variable-step playback

  function extractShapeIndexFromCode(code){
    if (!code || typeof code !== 'string') return null;
    // Accept common separators and optional '=': sh3, sh=3, ,sh=3, &sh=3, :sh3
    const m = code.match(/(?:^|[,&;:])sh\s*[=:]?\s*(\d)\b/i);
    if (m){
      const k = parseInt(m[1], 10);
      if (Number.isFinite(k) && k >= 1 && k <= 5) return k;
    }
    return null;
  }
  function ensureShapeInCode(code, idx){
    if (typeof code !== 'string') code = '';
    const present = extractShapeIndexFromCode(code);
    if (present != null){
      // Upsert: replace existing sh value in-place
      return code.replace(/((?:^|[,&;:])sh\s*[=:]?\s*)(\d)\b/i, `$1${idx}`);
    }
    // Choose a separator based on the existing style
    if (code.includes('&')) return code + `&sh=${idx}`;
    if (code.includes(',')) return code + `,sh=${idx}`;
    if (code.includes(';')) return code + `;sh=${idx}`;
    if (code.includes(':')) return code + `:sh${idx}`;
    // Default to comma-separated
    return code ? (code + `,sh=${idx}`) : `sh=${idx}`;
  }
  function kfGetCode(){
    try {
      let raw = (window.getParamCode ? window.getParamCode() : '') || '';
      // Global time multiplier is not stored per keyframe → strip 'km'
      raw = raw.replace(/km-?\d+(?:\.\d+)?/ig, '');
      return ensureShapeInCode(raw, Math.max(1, Math.min(5, modeToIndex(effectiveTaperMode()))));
    } catch(e){ return ''; }
  }
  function kfParse(code){ try { return (window.parseParamCode ? window.parseParamCode(code) : null); } catch(e){ return null; } }
  function kfAutosaveCurrent(force=false){
    // Persist current UI state into the active keyframe
    if (!keyframes.length || (kfTimer && !force)) return;
    if (kfIndex < 0 || kfIndex >= keyframes.length) return;
    const code = kfGetCode();
    const shapeIdx = Math.max(1, Math.min(5, modeToIndex(effectiveTaperMode())));
    const codeWithShape = ensureShapeInCode(code, shapeIdx);
    keyframes[kfIndex].code = codeWithShape;
    keyframes[kfIndex].map = kfParse(codeWithShape);
    if (elIdCode) elIdCode.value = codeWithShape;
  }
  function kfApply(code){
    if (!code) return false;

    // 1) Probeer shape (mode) uit code te halen
    let desiredMode = null;
    let parsed = null;
    if (window.parseParamCode) {
      try { parsed = window.parseParamCode(code); } catch(e){}
    }
    if (parsed){
      let m = parsed.taper || parsed.taperMode || parsed.shape || parsed.shapeMode;
      if (typeof m === 'number') m = modeFromIndex(m);
      if (typeof m === 'string') desiredMode = m;
    }
    if (!desiredMode){
      const sh = extractShapeIndexFromCode(code); // leest sh=1..5
      if (sh != null){ desiredMode = modeFromIndex(sh); }
    }

    // 2) Eerst numerieke params toepassen (strip globale multiplier 'km' — die is niet per keyframe)
    let codeToApply = code.replace(/km-?\d+(?:\.\d+)?/ig, '');
    let ok = false;
    if (window.applyParamCodeFast) ok = !!window.applyParamCodeFast(codeToApply);
    else if (window.applyParamCode) ok = !!window.applyParamCode(codeToApply);

    // 3) Dan visuele taper-switch
    if (desiredMode && desiredMode !== taperMode){
      triggerTaperSwitch(desiredMode);
    }

    // Recompute easing duration based on the possibly-updated KF_TIME_CUR
    try { updateEaseDurationFromKf(); } catch(e){}
    if (typeof updateUIFromState === 'function') updateUIFromState();
    requestRedraw();
    return ok;
  }

  // Light-weight active indicator update (avoids rebuilding the list each tick)
  let _kfPrevIdx = -1;
  function kfHighlightActive(){
    if (!elKfList) return;
    const kids = elKfList.children;
    // Toggle only previous and current to avoid O(n) DOM updates
    if (_kfPrevIdx >= 0 && _kfPrevIdx < kids.length){
      const prevBtn = kids[_kfPrevIdx];
      if (prevBtn && prevBtn.classList) prevBtn.classList.remove('is-active');
    }
    if (kfIndex >= 0 && kfIndex < kids.length){
      const curBtn = kids[kfIndex];
      if (curBtn && curBtn.classList) curBtn.classList.add('is-active');
    }
    _kfPrevIdx = kfIndex;
  }

  function kfRebuildList(){
    if (!elKfList) return;
    elKfList.innerHTML = '';
    keyframes.forEach((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'kf-chip' + (i === kfIndex ? ' is-active' : '');
      b.textContent = String(i + 1);
      b.addEventListener('click', ()=> kfSelect(i));
      elKfList.appendChild(b);
    });
  }

  function kfSelect(idx){
    const n = keyframes.length;
    if (n <= 0) return;
    idx = Math.max(0, Math.min(n - 1, idx|0));
    // Auto-save current before switching
    if (kfIndex >= 0 && kfIndex < keyframes.length){
      // Prefer explicit ID field content if present; fallback to current state snapshot
      let updated = '';
      try {
        if (elIdCode && elIdCode.value && String(elIdCode.value).trim()){
          updated = String(elIdCode.value).trim();
        }
      } catch(e){}
      if (!updated) updated = kfGetCode();
      const shIdxNow = Math.max(1, Math.min(5, modeToIndex(effectiveTaperMode())));
      let updatedWithShape = ensureShapeInCode(updated, shIdxNow);
      // Strip global multiplier from per-keyframe code
      updatedWithShape = updatedWithShape.replace(/km-?\d+(?:\.\d+)?/ig, '');
      keyframes[kfIndex].code = updatedWithShape;
      keyframes[kfIndex].map = kfParse(updatedWithShape);
    }
    kfIndex = idx;
    const frame = keyframes[kfIndex];
    if (frame && frame.code){ kfApply(frame.code); }
    // Ensure frame.timeSec is synced from code if present
    try {
      const m = kfParse(frame && frame.code);
      if (m && m.kt){ const t = parseFloat(m.kt); if (Number.isFinite(t)) frame.timeSec = Math.max(0.05, t); }
    } catch(e){}
    if (elIdCode && frame && frame.code){ elIdCode.value = frame.code; }
    // Update current keyframe duration UI
    const tt = (frame && Number.isFinite(frame.timeSec)) ? frame.timeSec : KF_TIME_DEFAULT;
    KF_TIME_CUR = Math.max(0.05, tt);
    if (elKfTime) elKfTime.value = KF_TIME_CUR.toFixed(2);
    if (elKfTimeOut) elKfTimeOut.textContent = `${KF_TIME_CUR.toFixed(2)} s`;
    updateEaseDurationFromKf();
    updateKfTotalOut();
    kfRebuildList();
  }

  function kfAdd(){
    // Use ID field when present, else current state snapshot
    let code = '';
    try {
      if (elIdCode && elIdCode.value && String(elIdCode.value).trim()){
        code = String(elIdCode.value).trim();
      }
    } catch(e){}
    if (!code) code = kfGetCode();
    // Strip global multiplier if provided in the input field
    code = code.replace(/km-?\d+(?:\.\d+)?/ig, '');
    const map = kfParse(code);
    const shapeMode = String(effectiveTaperMode());
    const shapeIndex = Math.max(1, Math.min(5, modeToIndex(effectiveTaperMode())));
    const codeWithShape = ensureShapeInCode(code, shapeIndex);
    // Determine per-keyframe duration
    let timeSec = KF_TIME_DEFAULT;
    try {
      if (map && map.kt){ const t = parseFloat(map.kt); if (Number.isFinite(t) && t > 0) timeSec = t; }
      else if (typeof KF_TIME_CUR === 'number' && KF_TIME_CUR > 0) timeSec = KF_TIME_CUR;
    } catch(e){}
    // Insert right after the current keyframe (default to end if none selected)
    const insertAt = (kfIndex >= 0 && kfIndex < keyframes.length) ? (kfIndex + 1) : keyframes.length;
    keyframes.splice(insertAt, 0, { code: codeWithShape, map, shapeMode, shapeIndex, timeSec });
    kfSelect(insertAt);
  }

  function kfDel(){
    if (!keyframes.length) return;
    keyframes.splice(Math.max(0, kfIndex), 1);
    if (!keyframes.length){
      const code = kfGetCode();
      const shapeIdx = Math.max(1, Math.min(5, modeToIndex(effectiveTaperMode())));
      const codeWithShape = ensureShapeInCode(code, shapeIdx);
      const map = kfParse(codeWithShape);
      const t0 = (map && parseFloat(map.kt)) || KF_TIME_DEFAULT;
      keyframes.push({ code: codeWithShape, map, shapeMode: String(taperMode), shapeIndex: shapeIdx, timeSec: Math.max(0.05, t0) });
      kfIndex = 0;
    } else {
      kfIndex = Math.max(0, Math.min(keyframes.length - 1, kfIndex));
      const f = keyframes[kfIndex];
      if (f){ kfApply(f.code); }
    }
    kfRebuildList();
    updateKfTotalOut();
  }

  function kfIsPlaying(){ return !!kfTimer; }
  function kfUpdateToggleUI(){ if (elKfToggle){ elKfToggle.textContent = kfIsPlaying() ? '⏸' : '▶'; elKfToggle.title = kfIsPlaying() ? 'Pause' : 'Play'; } }
  function kfStop(){ if (kfTimer){ clearTimeout(kfTimer); kfTimer = null; } KF_PLAYING = false; kfUpdateToggleUI(); }
  function kfPlay(){
    if (!keyframes.length){ return; }
    kfStop();
    KF_PLAYING = true;
    const tick = ()=>{
      if (!keyframes.length){ kfStop(); return; }
      // Persist edits on the current frame before advancing
      try { kfAutosaveCurrent(true); } catch(e){}
      const next = (kfIndex + 1) % keyframes.length;
      kfIndex = next;
      const f = keyframes[kfIndex];
      if (f){
        // Sync easing duration to this frame's duration so transitions fit the interval
        const tSec = Math.max(0.05, (f && f.timeSec) ? f.timeSec : KF_TIME_DEFAULT);
        KF_TIME_CUR = tSec;
        updateEaseDurationFromKf();
        kfApply(f.code);
      }
      kfHighlightActive();
      if (elIdCode && f && f.code){ elIdCode.value = f.code; }
      const tSec = Math.max(0.05, (f && f.timeSec) ? f.timeSec : KF_TIME_DEFAULT);
      const delayMs = Math.max(50, Math.round(tSec * Math.max(0.1, KF_SPEED_MUL) * 1000));
      kfTimer = setTimeout(tick, delayMs);
    };
    // Advance immediately so the initially selected frame is deselected
    tick();
    kfUpdateToggleUI();
  }

  // Keyframe timing controls (seconds per keyframe + global multiplier)
  if (elKfTime){
    const init = (Number.isFinite(KF_TIME_CUR) ? KF_TIME_CUR : KF_TIME_DEFAULT);
    elKfTime.value = init.toFixed(2);
    if (elKfTimeOut) elKfTimeOut.textContent = `${init.toFixed(2)} s`;
    elKfTime.addEventListener('input', ()=>{
      const v = parseFloat(elKfTime.value);
      if (Number.isFinite(v)){
        KF_TIME_CUR = Math.max(0.05, v);
        if (elKfTimeOut) elKfTimeOut.textContent = `${KF_TIME_CUR.toFixed(2)} s`;
        if (kfIndex >= 0 && kfIndex < keyframes.length){ keyframes[kfIndex].timeSec = KF_TIME_CUR; kfAutosaveCurrent(); }
        updateEaseDurationFromKf();
        updateKfTotalOut();
        if (kfIsPlaying()){ kfPlay(); }
      }
    });
  }
  if (elKfSpeed){
    const initS = (Number.isFinite(KF_SPEED_MUL) ? KF_SPEED_MUL : KF_SPEED_DEFAULT);
    elKfSpeed.value = initS.toFixed(2);
    if (elKfSpeedOut) elKfSpeedOut.textContent = `${initS.toFixed(2)}×`;
    elKfSpeed.addEventListener('input', ()=>{
      const v = parseFloat(elKfSpeed.value);
      if (Number.isFinite(v)){
        KF_SPEED_MUL = Math.max(0.1, v);
        if (elKfSpeedOut) elKfSpeedOut.textContent = `${KF_SPEED_MUL.toFixed(2)}×`;
        updateKfTotalOut();
        if (kfIsPlaying()){ kfPlay(); }
      }
    });
  }
  function kfToggle(){ if (kfIsPlaying()){ KF_PLAYING = false; kfStop(); } else kfPlay(); }
  if (elKfAdd)    elKfAdd.addEventListener('click', kfAdd);
  if (elKfDel)    elKfDel.addEventListener('click', kfDel);
  if (elKfToggle) elKfToggle.addEventListener('click', kfToggle);
  window.addEventListener('keydown', (e)=>{
    const isSpace = (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar');
    if (!isSpace) return;
    const el = document.activeElement;
    const tag = el && el.tagName ? el.tagName.toLowerCase() : '';
    const isTyping = (tag === 'input' || tag === 'textarea' || tag === 'select' || (el && el.isContentEditable));
    if (isTyping) return;
    e.preventDefault();
    kfToggle();
  });

  // Init with a single keyframe reflecting current state
  if (elKfList){
    const code0 = kfGetCode();
    const map0 = kfParse(code0);
    const t0 = (map0 && parseFloat(map0.kt)) || KF_TIME_DEFAULT;
    keyframes.push({ code: code0, map: map0, timeSec: Math.max(0.05, t0) });
    kfIndex = 0;
    kfRebuildList();
    kfUpdateToggleUI();
    updateKfTotalOut();
    updateEaseDurationFromKf();
  }

  // Expose keyframe playback + list for MP4 export helper
  if (typeof window !== 'undefined'){
    window.__kfPlay = kfPlay;
    window.__kfStop = kfStop;
    window.__keyframesRef = keyframes;
  }

  // Autosave on UI edits (after handlers update state)
  const controlsPanel = document.getElementById('controls');
  if (controlsPanel){
    const defer = ()=> setTimeout(()=> kfAutosaveCurrent(), 0);
    controlsPanel.addEventListener('input', defer);
    controlsPanel.addEventListener('change', defer);
  }

  // Transparent background checkbox
  const elBgTransparent = document.getElementById('bgTransparent');
  if (elBgTransparent){
    elBgTransparent.addEventListener('change', ()=>{
      BG_TRANSPARENT = elBgTransparent.checked;
      requestRedraw();
    });
  }

  // Performance mode
  if (elPerfMode){
    elPerfMode.addEventListener('change', ()=>{
      PERF_MODE = !!elPerfMode.checked;
      requestRedraw();
    });
  }
  // Fill button: make all lines ~2.8× longer (independent of Width)
  if (elFillBtn){
    elFillBtn.addEventListener('click', ()=>{
      LINE_LEN_MUL_TARGET = 2.8;
      updateUIFromState();
      requestRedraw();
      try { if (typeof kfAutosaveCurrent === 'function') kfAutosaveCurrent(); } catch(e){}
    });
  }

  function updateUIFromState(){
    if (elColorPreset) elColorPreset.value = String(activeColorComboIdx);
    if (elPerfMode) setChecked(elPerfMode, PERF_MODE);
    if (elLogoText){ elLogoText.value = currentLogoText(); }
    const widthPct = Math.round(widthScaleTarget * 100);
    const logoPct = Math.round(logoScaleTarget * 100);

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

    if (elTaper) elTaper.value = effectiveTaperMode();

    // Pulse phase control (0..1)
    if (elPulsePhase){
      elPulsePhase.min = '0';
      elPulsePhase.max = '1';
      elPulsePhase.step = '0.001';
      elPulsePhase.value = PULSE_PHASE.toFixed(3);
    }
    if (elPulsePhaseOut){
      elPulsePhaseOut.textContent = PULSE_PHASE.toFixed(2);
    }

    if (elTaperIndex){
      elTaperIndex.min = '1';
      elTaperIndex.max = '5';
      elTaperIndex.step = '1';
      elTaperIndex.value = String(modeToIndex(effectiveTaperMode()));
    }
    if (elTaperIndexOut){
      elTaperIndexOut.textContent = modeFromIndex(modeToIndex(effectiveTaperMode()));
    }

    setChecked(elDebug, debugMode);
    if (elAnimEnabled) setChecked(elAnimEnabled, ANIM_ENABLED);
    // Background + helpers
    const elBgTransparent = document.getElementById('bgTransparent');
    if (elBgTransparent) setChecked(elBgTransparent, BG_TRANSPARENT);
    const elHWaveAmp = document.getElementById('hWaveAmp');
    const elHWaveAmpOut = document.getElementById('hWaveAmpOut');
    if (elHWaveAmp){ elHWaveAmp.value = String(H_WAVE_AMP); }
    if (elHWaveAmpOut){ elHWaveAmpOut.textContent = H_WAVE_AMP.toFixed(2) + '×'; }
    if (elHWavePeriod){ elHWavePeriod.value = H_WAVE_PERIOD.toFixed(2); }
    if (elHWavePeriodOut){ elHWavePeriodOut.textContent = `${H_WAVE_PERIOD.toFixed(2)} s`; }
    setChecked(elAuto, autoRandomActive);
    if (elAutoDur){
      elAutoDur.min = '0.5';
      elAutoDur.max = '5';
      elAutoDur.step = '0.1';
      elAutoDur.value = String(autoRandomPeriodSec.toFixed(1));
      elAutoDur.disabled = !autoRandomActive;
    }
    if (elAutoDurOut){
      elAutoDurOut.textContent = `${autoRandomPeriodSec.toFixed(2)} s`;
    }

    setChecked(elBgLines, BG_LINES);
    setChecked(elRepeatEnabled, REPEAT_ENABLED);
    setChecked(elRepeatMirror, REPEAT_MIRROR);

    updateRepeatSlidersRange();
    // Repeat falloff + mode (optional controls) — set values only (listeners bound once in setup)
    if (elRepeatFalloff){
      elRepeatFalloff.min = '0.5';
      elRepeatFalloff.max = '1';
      elRepeatFalloff.step = '0.01';
      elRepeatFalloff.value = REPEAT_FALLOFF_TARGET.toFixed(2);
    }
    if (elRepeatFalloffOut){
      elRepeatFalloffOut.textContent = REPEAT_FALLOFF_TARGET.toFixed(2);
    }
    if (elRepeatModeUniform) elRepeatModeUniform.checked = (REPEAT_MODE === 'uniform');
    if (elRepeatModeFalloff) elRepeatModeFalloff.checked = (REPEAT_MODE === 'falloff');
    // Easing UI
    if (elEaseType){
      elEaseType.value = String(EASE_TYPE);
    }
    if (elEaseDurPct){
      elEaseDurPct.value = String(Math.round(EASE_DURATION_PCT));
    }
    if (elEaseDurPctOut){
      elEaseDurPctOut.textContent = `${Math.round(EASE_DURATION_PCT)} %`;
    }
    if (elEaseAmp){
      elEaseAmp.value = String(EASE_AMPLITUDE.toFixed(2));
      elEaseAmp.disabled = false; // always allow editing
    }
    if (elEaseAmpOut){
      elEaseAmpOut.textContent = `${EASE_AMPLITUDE.toFixed(2)}×`;
    }

    // Keyframe timing UI
    if (elKfTime){ elKfTime.value = Math.max(0.05, KF_TIME_CUR).toFixed(2); }
    if (elKfTimeOut){ elKfTimeOut.textContent = `${Math.max(0.05, KF_TIME_CUR).toFixed(2)} s`; }
    if (elKfSpeed){ elKfSpeed.value = Math.max(0.1, KF_SPEED_MUL).toFixed(2); }
    if (elKfSpeedOut){ elKfSpeedOut.textContent = `${Math.max(0.1, KF_SPEED_MUL).toFixed(2)}×`; }

    // Curve radios
    const curveSineEl = document.getElementById('curveSine');
    const curveSmoothEl = document.getElementById('curveSmooth');
    if (curveSineEl) curveSineEl.checked = (MOUSE_CURVE === 'sine');
    if (curveSmoothEl) curveSmoothEl.checked = (MOUSE_CURVE !== 'sine');

    // Mode radios
    const animOffEl = document.getElementById('animOff');
    const animMouseEl = document.getElementById('animMouse');
    const animPulseEl = document.getElementById('animPulse');
    const animScanEl = document.getElementById('animScan');
    if (animOffEl)   animOffEl.checked   = (ANIM_MODE === 'off');
    if (animMouseEl) animMouseEl.checked = (ANIM_MODE === 'mouse');
    if (animPulseEl) animPulseEl.checked = (ANIM_MODE === 'pulse');
    if (animScanEl)  animScanEl.checked  = (ANIM_MODE === 'scan');

    // Power (amplitude) + Anim period outputs
    if (powerCtl) setValue(powerCtl, (MOUSE_AMPLITUDE).toFixed(2));
    if (powerOut) setText(powerOut, (MOUSE_AMPLITUDE).toFixed(2));
    if (animPeriodCtl) setValue(animPeriodCtl, ANIM_PERIOD.toFixed(2));
    if (animPeriodOut) setText(animPeriodOut, ANIM_PERIOD.toFixed(2) + ' s');

    // Easing UI
    if (elEaseType) elEaseType.value = EASE_TYPE;
    if (elEaseDurPct)  elEaseDurPct.value  = String(Math.round(EASE_DURATION_PCT));
    if (elEaseDurPctOut) elEaseDurPctOut.textContent = `${Math.round(EASE_DURATION_PCT)} %`;
    if (elEaseAmp)  elEaseAmp.value  = String(EASE_AMPLITUDE.toFixed(2));
    if (elEaseAmpOut) elEaseAmpOut.textContent = `${EASE_AMPLITUDE.toFixed(2)}×`;
    if (elEaseAmp) elEaseAmp.disabled = false;

    // Do not force preset/custom inputs here; preserve user selection

    // Set state for background controls; handlers are bound once in setup
    if (elBgLines) elBgLines.checked = BG_LINES;
    if (elRepeatMirror) elRepeatMirror.checked = REPEAT_MIRROR;
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
  updateAnimRun();

  // One-time bindings moved out of updateUIFromState to avoid duplicate listeners
  if (optCurveSine){
    optCurveSine.addEventListener('change', ()=>{
      if (optCurveSine.checked){ MOUSE_CURVE='sine'; requestRedraw(); }
    });
  }
  if (optCurveSmooth){
    optCurveSmooth.addEventListener('change', ()=>{
      if (optCurveSmooth.checked){ MOUSE_CURVE='smoothstep'; requestRedraw(); }
    });
  }
  if (elRepeatFalloff){
    elRepeatFalloff.addEventListener('input', ()=>{
      const v = parseFloat(elRepeatFalloff.value);
      if (Number.isFinite(v)){
        REPEAT_FALLOFF_TARGET = Math.max(0.5, Math.min(1, v));
        if (elRepeatFalloffOut) elRepeatFalloffOut.textContent = REPEAT_FALLOFF_TARGET.toFixed(2);
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
  if (elBgLines){
    elBgLines.addEventListener('change', ()=>{
      BG_LINES = !!elBgLines.checked;
      updateUIFromState();
      requestRedraw();
    });
  }
  if (elRepeatMirror){
    elRepeatMirror.addEventListener('change', ()=>{
      REPEAT_MIRROR = !!elRepeatMirror.checked;
      updateUIFromState();
      requestRedraw();
    });
  }

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

  // Unified Export handler
  if (btnExportGo){
    btnExportGo.addEventListener('click', async ()=>{
      const fmt = (exportFormatSel && String(exportFormatSel.value || 'svg').toLowerCase()) || 'svg';
      if (fmt === 'svg'){
        const data = exportSVG();
        if (data) downloadTextAsFile(data, 'export.svg', 'image/svg+xml');
        return;
      }
      if (fmt === 'pdf'){
        try {
          const data = exportSVG();
          if (!data){ throw new Error('SVG data unavailable'); }
          // Parse into a DOM element for svg2pdf
          const parser = new DOMParser();
          const doc = parser.parseFromString(data, 'image/svg+xml');
          const svg = doc.documentElement;
          // Avoid root clipping by allowing overflow and targeting content group instead of <svg>
          svg.setAttribute('overflow', 'visible');
          let content = null;
          for (const node of Array.from(svg.children)){
            const tag = node.tagName && node.tagName.toLowerCase();
            if (tag && tag !== 'defs' && tag !== 'desc') { content = node; break; }
          }
          if (!content) content = svg;

          const W = Math.max(1, width), H = Math.max(1, height);
          const jsPDFCtor = window.jspdf && (window.jspdf.jsPDF || (window.jspdf.default && window.jspdf.default.jsPDF)) || (window.jsPDF || null);
          if (!jsPDFCtor){ throw new Error('jsPDF not loaded'); }
          const pdf = new jsPDFCtor({ orientation: (W >= H ? 'landscape' : 'portrait'), unit: 'pt', format: [W, H] });
          const s2p = (window.svg2pdf && (window.svg2pdf.svg2pdf || (window.svg2pdf.default && window.svg2pdf.default.svg2pdf))) || (typeof svg2pdf !== 'undefined' ? (svg2pdf.svg2pdf || (svg2pdf.default && svg2pdf.default.svg2pdf) || svg2pdf) : null);
          if (!s2p){ throw new Error('svg2pdf not loaded'); }
          // Do not pass width/height to avoid creating a viewport clip; useCSS for styling
          await s2p(content, pdf, { x: 0, y: 0, useCSS: true });
          pdf.save('export.pdf');
        } catch(err){
          console.error('Export PDF failed:', err);
          alert('Export PDF failed: ' + err.message);
        }
        return;
      }
      if (fmt === 'mp4'){
        try {
          await exportMP4();
        } catch(err){
          console.error('Export MP4 failed:', err);
          alert('Export MP4 failed: ' + (err && err.message ? err.message : err));
        }
        return;
      }
      if (fmt === 'mp4hq'){
        try {
          await exportMP4HQ();
        } catch(err){
          console.error('Export MP4 (HQ) failed:', err);
          alert('Export MP4 (HQ) failed: ' + (err && err.message ? err.message : err));
        }
        return;
      }
      if (fmt === 'webm'){
        try {
          await exportWebM();
        } catch(err){
          console.error('Export WebM failed:', err);
          alert('Export WebM failed: ' + (err && err.message ? err.message : err));
        }
        return;
      }
      alert('Unknown export format: ' + fmt);
    });
  }

  // ---- Config save/load (keyframes, speed, size, format) ----
  function getCurrentTargetSize(){
    const out = { preset: 'fit', width: null, height: null };
    try {
      const presetVal = elPreset ? String(elPreset.value || 'fit') : 'fit';
      out.preset = presetVal;
      if (presetVal === 'custom'){
        const w = parseInt(elAspectW && elAspectW.value, 10);
        const h = parseInt(elAspectH && elAspectH.value, 10);
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0){ out.width = w; out.height = h; }
      } else if (elPreset && elPreset.options && elPreset.selectedIndex >= 0){
        const opt = elPreset.options[elPreset.selectedIndex];
        const dw = parseInt(opt && opt.dataset && opt.dataset.w, 10);
        const dh = parseInt(opt && opt.dataset && opt.dataset.h, 10);
        if (Number.isFinite(dw) && Number.isFinite(dh) && dw > 0 && dh > 0){ out.width = dw; out.height = dh; }
      }
    } catch(e){}
    return out;
  }

  function saveConfig(){
    try {
      const frames = Array.isArray(keyframes) ? keyframes.map(k => ({
        code: String(k && k.code ? k.code : ''),
        timeSec: Number(Math.max(0.05, (k && k.timeSec) ? k.timeSec : KF_TIME_DEFAULT).toFixed(2))
      })) : [];
      const size = getCurrentTargetSize();
      const cfg = {
        version: 1,
        exportFormat: (exportFormatSel && exportFormatSel.value) || 'svg',
        size,
        speedMul: Number(Math.max(0.1, KF_SPEED_MUL).toFixed(2)),
        keyframes: frames
      };
      const json = JSON.stringify(cfg, null, 2);
      downloadTextAsFile(json, 'config.json', 'application/json');
    } catch(err){
      console.error('Config save failed', err);
      // No popup; fail silently in UI
    }
  }

  function applyLoadedSize(size){
    if (!size) return;
    try {
      const preset = String(size.preset || 'fit');
      if (elPreset){
        elPreset.value = preset;
        elPreset.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (preset === 'custom'){
        const w = parseInt(size.width, 10);
        const h = parseInt(size.height, 10);
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0){
          if (elAspectW) elAspectW.value = String(w);
          if (elAspectH) elAspectH.value = String(h);
          const elApply = document.getElementById('applyCustomAR');
          if (elApply){ elApply.click(); }
        }
      }
    } catch(e){}
  }

  function loadConfigFromObject(cfg){
    try {
      if (!cfg || typeof cfg !== 'object') throw new Error('Ongeldige data');

      // Export format
      try { if (exportFormatSel && cfg.exportFormat){ exportFormatSel.value = String(cfg.exportFormat); } } catch(e){}

      // Size preset/custom dims
      try { if (cfg.size) applyLoadedSize(cfg.size); } catch(e){}

      // Speed multiplier
      try {
        const s = parseFloat(cfg.speedMul);
        if (Number.isFinite(s)){
          const el = document.getElementById('kfSpeed');
          if (el){ el.value = String(Math.max(0.1, s)); el.dispatchEvent(new Event('input', { bubbles:true })); }
          else { KF_SPEED_MUL = Math.max(0.1, s); }
        }
      } catch(e){}

      // Keyframes
      try {
        const list = Array.isArray(cfg.keyframes) ? cfg.keyframes : [];
        // stop playback and reset
        if (typeof kfStop === 'function') kfStop();
        KF_PLAYING = false;
        try { kfIndex = -1; } catch(e){}
        // Clear existing and repopulate
        keyframes.splice(0, keyframes.length);
        for (const it of list){
          if (!it) continue;
          let code = String(it.code || '').trim();
          if (!code) continue;
          // Ensure no global multiplier in per-frame code
          code = code.replace(/km-?\d+(?:\.\d+)?/ig, '');
          const map = kfParse(code);
          let tSec = (map && map.kt) ? parseFloat(map.kt) : parseFloat(it.timeSec);
          if (!Number.isFinite(tSec) || tSec <= 0) tSec = KF_TIME_DEFAULT;
          keyframes.push({ code, map, timeSec: Math.max(0.05, tSec) });
        }
        if (!keyframes.length){
          const code0 = kfGetCode();
          const map0 = kfParse(code0);
          const t0 = (map0 && parseFloat(map0.kt)) || KF_TIME_DEFAULT;
          keyframes.push({ code: code0, map: map0, timeSec: Math.max(0.05, t0) });
        }
        // Select first and rebuild UI
        if (typeof kfSelect === 'function') kfSelect(0);
        if (typeof kfRebuildList === 'function') kfRebuildList();
        updateKfTotalOut();
      } catch(e){}

      // No popup; loaded silently
    } catch(err){
      console.error('Config load failed', err);
    }
  }

  if (btnCfgSave){ btnCfgSave.addEventListener('click', saveConfig); }
  if (btnCfgLoad){ btnCfgLoad.addEventListener('click', ()=>{ if (elCfgFile) elCfgFile.click(); }); }
  if (elCfgFile){
    elCfgFile.addEventListener('change', ()=>{
      const f = elCfgFile.files && elCfgFile.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        try {
          const text = String(reader.result || '');
          const obj = JSON.parse(text);
          loadConfigFromObject(obj);
        } catch(err){
          console.error('Failed to parse config', err);
        } finally {
          elCfgFile.value = '';
        }
      };
      reader.onerror = ()=>{
        console.error('Bestand lezen mislukt.');
        elCfgFile.value = '';
      };
      reader.readAsText(f);
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

  // Animation buttons + enable toggle
  const optAnimOff   = document.getElementById('animOff');
  const optAnimMouse = document.getElementById('animMouse');
  const optAnimPulse = document.getElementById('animPulse');
  const optAnimScan  = document.getElementById('animScan');

  function setAnim(mode){
    const prev = ANIM_MODE;
    ANIM_MODE = mode;
    // Cross-fade when switching modes while enabled
    if (ANIM_ENABLED && prev !== mode){
      ANIM_FADE = 0; ANIM_FADE_TARGET = 1; H_WAVE_T0 = 0;
    }
    updateAnimRun();
    requestRedraw();
  }
  if (optAnimOff)   optAnimOff.addEventListener('change',  ()=>{ if (optAnimOff.checked)   setAnim('off');   });
  if (optAnimMouse) optAnimMouse.addEventListener('change', ()=>{ if (optAnimMouse.checked) setAnim('mouse'); });
  if (optAnimPulse) optAnimPulse.addEventListener('change', ()=>{ if (optAnimPulse.checked) setAnim('pulse'); });
  if (optAnimScan)  optAnimScan.addEventListener('change',  ()=>{ if (optAnimScan.checked)  setAnim('scan');  });
  if (elAnimEnabled){
    elAnimEnabled.addEventListener('change', ()=>{
      const enable = !!elAnimEnabled.checked;
      ANIM_ENABLED = enable;
      // Smooth fade in/out; when enabling, start from 0
      if (enable){ ANIM_FADE = 0; ANIM_FADE_TARGET = 1; H_WAVE_T0 = 0; }
      else { ANIM_FADE_TARGET = 0; }
      updateAnimRun();
      updateUIFromState();
      requestRedraw();
    });
  }

  // Pulse phase control (0..1). When in pulse mode, also sync the animation timeline
  if (elPulsePhase){
    elPulsePhase.addEventListener('input', ()=>{
      const v = parseFloat(elPulsePhase.value);
      if (!Number.isFinite(v)) return;
      PULSE_PHASE = Math.max(0, Math.min(1, v));
      if (elPulsePhaseOut) elPulsePhaseOut.textContent = PULSE_PHASE.toFixed(2);
      if (ANIM_ENABLED && ANIM_MODE === 'pulse'){
        // Choose timeline so that current cycle maps to this phase (using ping-pong cos mapping)
        const clamped = Math.max(0, Math.min(1, PULSE_PHASE));
        const cyc = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * clamped))) / (2 * Math.PI); // 0..0.5
        const targetTime = cyc * Math.max(0.05, ANIM_PERIOD);
        const now = performance.now();
        _animStart = now - targetTime * 1000;
        updateAnimRun();
      }
      requestRedraw();
    });
  }

  // Easing controls (for slider-driven transitions)
  // Allow amplitude only for 'snap' (elastic removed)
  function updateEaseAmpState(){ if (elEaseAmp) elEaseAmp.disabled = false; }
  updateEaseAmpState();
  // Initialize duration % control
  if (elEaseDurPct){
    elEaseDurPct.min = '0';
    elEaseDurPct.max = '200';
    elEaseDurPct.step = '1';
    elEaseDurPct.value = String(Math.round(EASE_DURATION_PCT));
  }
  if (elEaseDurPctOut){ elEaseDurPctOut.textContent = `${Math.round(EASE_DURATION_PCT)} %`; }
  updateEaseDurationFromKf();
  if (elEaseType){
    elEaseType.addEventListener('change', ()=>{
      let v = String(elEaseType.value||'smooth');
      if (v === 'fade-in') v = 'fadeIn'; // accept hyphen alias
      EASE_TYPE = (v === 'linear' || v === 'easeInOut' || v === 'snap' || v === 'snapHalf' || v === 'fadeIn') ? v : 'smooth';
      updateEaseAmpState();
      updateUIFromState();
      requestRedraw();
    });
  }
  if (elEaseDurPct){
    elEaseDurPct.addEventListener('input', ()=>{
      const v = parseFloat(elEaseDurPct.value);
      if (Number.isFinite(v)){
        EASE_DURATION_PCT = Math.max(0, v);
        if (elEaseDurPctOut) elEaseDurPctOut.textContent = `${Math.round(EASE_DURATION_PCT)} %`;
        updateEaseDurationFromKf();
        requestRedraw();
      }
    });
  }
  if (elEaseAmp){
    elEaseAmp.addEventListener('input', ()=>{
      const v = parseFloat(elEaseAmp.value);
      if (Number.isFinite(v)){
        EASE_AMPLITUDE = Math.max(0, v);
        if (elEaseAmpOut) elEaseAmpOut.textContent = `${EASE_AMPLITUDE.toFixed(2)}×`;
        requestRedraw();
      }
    });
  }

  // Amplitude slider (controls stretch intensity around the mouse)
  if (powerCtl){
    const updateAmplitude = ()=>{
      const raw = parseFloat(powerCtl.value);
      const amp = Number.isFinite(raw) ? Math.max(0, raw) : MOUSE_AMPLITUDE;
      MOUSE_AMPLITUDE = amp; MOUSE_AMPLITUDE_TARGET = amp;
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
        updateAnimRun();
        updateUIFromState();
        requestRedraw();
      }
    });
  }

  if (elTaper) {
    elTaper.value = taperMode;
    elTaper.addEventListener('change', () => {
      const v = String(elTaper.value || '');
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
      logoScaleTarget = perc / 100;
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
        if (elCustomAR) elCustomAR.style.display = 'block';
        // Export bar height may change; refit viewport
        fitViewportToWindow();
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
    if (elApplyCustomAR){
      elApplyCustomAR.addEventListener('click', ()=>{
        const w = parseInt(elAspectW && elAspectW.value, 10);
        const h = parseInt(elAspectH && elAspectH.value, 10);
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;

        // Forceer ‘custom’-stand en pas aspect toe
        if (elPreset) elPreset.value = 'custom';
        FIT_MODE = false;
        EXPORT_W = w; EXPORT_H = h; // handig voor export; voor de viewport gebruiken we vooral de aspect
        ASPECT_W = w; ASPECT_H = h;

        if (elCustomAR) elCustomAR.style.display = 'block';
        fitViewportToWindow();
        requestRedraw();
      });
    }
  }

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
    // Reset logo text to first option
    setLogoText(LOGO_TEXT_OPTIONS[0]);
    rows = ROWS_DEFAULT;
    rowsTarget = ROWS_DEFAULT;
    rowsAnim = ROWS_DEFAULT;
    linePx = LINE_HEIGHT;
    linePxTarget = LINE_HEIGHT;
    widthScale = WIDTH_SCALE_DEFAULT;
    widthScaleTarget = WIDTH_SCALE_DEFAULT;
    LINE_LEN_MUL = LINE_LEN_MUL_DEFAULT;
    LINE_LEN_MUL_TARGET = LINE_LEN_MUL_DEFAULT;
    LINE_LEN_MUL_ANIM = LINE_LEN_MUL_DEFAULT;
    gapPx = GAP_PX_DEFAULT;
    gapPxTarget = GAP_PX_DEFAULT;
    displaceGroupsTarget = DISPLACE_GROUPS_DEFAULT;
    displaceGroupsAnim = DISPLACE_GROUPS_DEFAULT;
    displaceGroupsTarget = DISPLACE_GROUPS_DEFAULT;
    DISPLACE_UNIT = DISPLACE_UNIT_DEFAULT;
    DISPLACE_UNIT_TARGET = DISPLACE_UNIT_DEFAULT;
    TIP_RATIO = TIP_RATIO_DEFAULT;
    TIP_RATIO_TARGET = TIP_RATIO_DEFAULT;
    taperMode = TAPER_MODE_DEFAULT;
    logoScaleMul = LOGO_SCALE_DEFAULT;
    logoScaleTarget = LOGO_SCALE_DEFAULT;

    debugMode = DEBUG_MODE_DEFAULT;

    autoRandomActive = AUTO_RANDOM_DEFAULT;
    setAuto(autoRandomActive);

    KEEP_TOTAL_WIDTH = KEEP_TOTAL_WIDTH_DEFAULT;
    BG_LINES = BG_LINES_DEFAULT;
    BG_TRANSPARENT = false;
    H_WAVE_AMP = H_WAVE_AMP_DEFAULT; H_WAVE_AMP_TARGET = H_WAVE_AMP_DEFAULT; H_WAVE_AMP_ANIM = H_WAVE_AMP_DEFAULT;
    H_WAVE_PERIOD = H_WAVE_PERIOD_DEFAULT;
    PULSE_PHASE = PULSE_PHASE_DEFAULT;
    ANIM_ENABLED = ANIM_ENABLED_DEFAULT;
    ANIM_FADE = 1.0; ANIM_FADE_TARGET = 1.0;
    ANIM_MODE = ANIM_MODE_DEFAULT;
    REPEAT_ENABLED = REPEAT_ENABLED_DEFAULT;
    REPEAT_MIRROR = REPEAT_MIRROR_DEFAULT;
    REPEAT_EXTRA_ROWS = REPEAT_EXTRA_ROWS_DEFAULT;
    REPEAT_EXTRA_ROWS_ANIM = (Number.isFinite(REPEAT_EXTRA_ROWS_DEFAULT) ? REPEAT_EXTRA_ROWS_DEFAULT : 0);
    REPEAT_EXTRA_ROWS_IS_FULL = !Number.isFinite(REPEAT_EXTRA_ROWS_DEFAULT) && REPEAT_EXTRA_ROWS_DEFAULT > 0;
    REPEAT_FALLOFF = REPEAT_FALLOFF_DEFAULT;
    REPEAT_FALLOFF_TARGET = REPEAT_FALLOFF_DEFAULT;
    REPEAT_MODE    = REPEAT_MODE_DEFAULT;
    updateRepeatSlidersRange();

    PER_LETTER_STRETCH = PER_LETTER_STRETCH_DEFAULT;
    MOUSE_STRETCH_SIGMA_FRAC = MOUSE_STRETCH_SIGMA_FRAC_DEFAULT;
    MOUSE_AMPLITUDE = MOUSE_AMPLITUDE_DEFAULT; MOUSE_AMPLITUDE_TARGET = MOUSE_AMPLITUDE_DEFAULT; MOUSE_AMPLITUDE_ANIM = MOUSE_AMPLITUDE_DEFAULT;
    MOUSE_STRETCH_MIN = BASE_STRETCH_MIN;
    MOUSE_STRETCH_MAX = BASE_STRETCH_MAX;
    MOUSE_CURVE = MOUSE_CURVE_DEFAULT;
    MOUSE_POWER = MOUSE_POWER_DEFAULT;
    ANIM_PERIOD = ANIM_PERIOD_DEFAULT;
    animTime = 0;
    stopAnimLoop();

    // Easing
    EASE_TYPE = EASE_TYPE_DEFAULT;
    EASE_DURATION = EASE_DURATION_DEFAULT;
    EASE_AMPLITUDE = EASE_AMPLITUDE_DEFAULT;

    // Taper transition state
    _taperTransActive = false;
    _taperPhase = 'idle';
    _taperPendingMode = null;
    _lineMul = 1.0;

    ASPECT_W = ASPECT_W_DEFAULT;
    ASPECT_H = ASPECT_H_DEFAULT;
    EXPORT_W = null;
    EXPORT_H = null;

    applyColorComboByIndex(0);
    if (elPreset) elPreset.value = PRESET_DEFAULT;
    if (elAspectW) elAspectW.value = String(ASPECT_WIDTH_PX_DEFAULT);
    if (elAspectH) elAspectH.value = String(ASPECT_HEIGHT_PX_DEFAULT);
    FIT_MODE = FIT_MODE_DEFAULT;
    if (elCustomAR) elCustomAR.style.display = FIT_MODE ? 'none' : 'block';

    window.MOUSE_AMPLITUDE = MOUSE_AMPLITUDE;
    window.MOUSE_POWER = MOUSE_POWER;

    lastAutoRandomMs = 0;

    rebuildGroupsSelect();

    updateUIFromState();
    updateAnimRun();

    if (rows <= 1){
      baseRowPitch = 0;
      targetContentH = 0;
    } else {
      const refTargetH = (targetContentH != null) ? targetContentH : ((height / rows) * (rows - 1));
      targetContentH = refTargetH;
      baseRowPitch = refTargetH / (rows - 1);
    }
    _layoutDirty = true;
    layout = buildLayout(currentLogoText(), rows);

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

  // Expose helpers for batch updates (ID/keyframes)
  if (typeof window !== 'undefined'){
    window.__updateUIFromState = updateUIFromState;
    window.__rebuildGroupsSelect = rebuildGroupsSelect;
    // Allow programmatic applies (ID/Keyframes) to persist to the active keyframe
    window.__kfAutosaveActive = (typeof kfAutosaveCurrent === 'function') ? kfAutosaveCurrent : null;
  }

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
    widthScaleTarget = parseInt(elWidth.value,10) / 100;
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

  if (elDebug){
    elDebug.addEventListener('change', ()=>{
      debugMode = elDebug.checked;
      updateUIFromState();
      requestRedraw();
    });
  }

  elAuto.addEventListener('change', ()=>{
    autoRandomActive = elAuto.checked;
    setAuto(autoRandomActive);
    updateUIFromState();
  });

  if (elAutoDur){
    elAutoDur.addEventListener('input', ()=>{
      const v = parseFloat(elAutoDur.value);
      if (Number.isFinite(v)){
        autoRandomPeriodSec = Math.max(0.5, Math.min(5, v));
        if (autoRandomActive) setAuto(true); // restart timer with new interval
        updateUIFromState();
      }
    });
  }

  if (elCustomAR) elCustomAR.style.display = (elPreset && elPreset.value === 'custom') ? 'block' : 'none';
  FIT_MODE = (elPreset && elPreset.value === PRESET_DEFAULT);
  updateUIFromState();
  // Start auto-randomizer if enabled by default
  setAuto(autoRandomActive);
  fitViewportToWindow();
  requestRedraw();
  // Do not auto-apply custom aspect on load.
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
    layout = buildLayout(currentLogoText(), rows);
    _layoutDirty = false;
  }
  const targetRowsInt = Math.max(1, Math.round(rowsTarget));
  if (!Number.isFinite(rowsAnim)) rowsAnim = rows;
  const rowsAnimInt = Math.max(1, Math.round(rowsAnim));
  const animatingRows = Math.abs(targetRowsInt - rowsAnim) > 1e-3;

  if (rowsAnimInt !== rows){
    rows = rowsAnimInt;
    layout = buildLayout(currentLogoText(), rows);
  }
  if (animatingRows) requestRedraw();

  g.push();
  if (BG_TRANSPARENT) {
    g.clear();
  } else {
    g.background(color1);
  }
  // Solid fill; no opacity for fade-in
  g.fill(color2);
  g.noStroke();

  const fit = computeLayoutFit();
  const { tEff, rowPitchNow, leftmost, contentW0, contentH0 } = fit;

  if (!Number.isFinite(displaceGroupsAnim)) displaceGroupsAnim = displaceGroupsTarget;

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
  // Effective wave fades
  const fadeShaped = shapeFade01(Math.max(0, ANIM_FADE||0));
  const effHWave = (H_WAVE_AMP_ANIM || 0) * fadeShaped;
  if (rows <= 1){
    rowYsCanvas = [0];
  } else {
    rowYsCanvas = Array.from({ length: rows }, (_, r) => r * rowPitchNow);
  }

  const rowSmoothDelta = updateRowYsSmooth(rowYsCanvas);
  if (rowSmoothDelta > 0.2) requestRedraw();
  const rowPositions = (rowYsSmooth.length === rowYsCanvas.length) ? rowYsSmooth : rowYsCanvas;

  // Background lines: cache into an offscreen buffer and blit (fast on main canvas).
  // For exports/offscreen, draw directly into target g to keep vector output compatibility.
  {
    const showBg = BG_LINES && !(PERF_MODE && isPlaybackActive());
    const pitchPx = rowPitchNow * s;           // spacing between rows in pixels
    const thickPx = 5;
    const fillCol = isHexBlack(color3TargetHex) ? '#BFBFBF' : color3;
    // Align first line to where row 0 would be after translate/scale
    const y0 = tyAdj; // row 0 at layout y=0 maps to canvas y=tyAdj
    const startY = (pitchPx > 0) ? (((y0 % pitchPx) + pitchPx) % pitchPx) : 0; // [0,pitch)

    const isMainCanvas = (typeof mainCanvas !== 'undefined' && g === mainCanvas);
    if (showBg && pitchPx > 0){
      if (isMainCanvas){
        // Cache stripes aligned at multiples of pitch starting at 0.
        const key = [Math.round(width), Math.round(height), Math.round(pitchPx*1000)/1000, thickPx, fillCol].join('|');
        if (key !== _bgLinesCacheKey || !_bgLinesCache){
          _bgLinesCacheKey = key;
          if (_bgLinesCache){
            try { _bgLinesCache.resizeCanvas(Math.max(1,width), Math.max(1,height), true); } catch(e){ _bgLinesCache = null; }
          }
          if (!_bgLinesCache){
            _bgLinesCache = createGraphics(Math.max(1, width), Math.max(1, height));
            try { _bgLinesCache.pixelDensity(1); _bgLinesCache.noSmooth(); } catch(e){}
          }
          _bgLinesCache.clear();
          _bgLinesCache.noStroke();
          _bgLinesCache.fill(fillCol);
          for (let y = 0; y <= height; y += pitchPx){
            _bgLinesCache.rect(0, y - thickPx * 0.5, width, thickPx);
          }
        }
        if (_bgLinesCache){
          // Shift the cached pattern by startY without rebuilding: draw twice to cover wraparound
          const oy = startY % pitchPx;
          g.push();
          g.image(_bgLinesCache, 0, oy, width, height);
          if (oy > 0) g.image(_bgLinesCache, 0, oy - height, width, height);
          g.pop();
        }
      } else {
        // Export/offscreen: draw directly into g
        g.push();
        g.noStroke();
        g.fill(fillCol);
        for (let y = startY; y <= height; y += pitchPx){
          g.rect(0, y - thickPx * 0.5, width, thickPx);
        }
        g.pop();
      }
    }
  }

  // Apply final transform
  tx = txAdj;
  ty = tyAdj;
  g.translate(tx, ty);
  g.scale(s, s);

  const maxRowIdx = Math.max(0, rows - 1);

  function drawLettersSubset(gDest, yOff, mirrored = false, rowStart = 0, rowEnd = maxRowIdx, hMul = 1){
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

        // Row-specific fade-in: height stagger only (no opacity changes)

        const y = mirrored
          ? (tileHScaled - baseRowRelScaled) + yOff    // spiegel binnen geschaalde venster-hoogte
          : (baseRowRelScaled + yOff);
        for (const span of spans){
          const rightEdgeX = baseX + span.rightRel * layout.scale * wScaleUse;
          const baseLen    = Math.max(0, span.runLen * layout.scale * wScaleUse);
          // Base dash length (from scan result), scaled independently by LINE_LEN_MUL (animated)
          const dashLenUse = Math.max(0, baseLen * Math.max(0, (LINE_LEN_MUL_ANIM || 0)));
          // Distribute any extra length equally to left and right by shifting the right edge
          const extraLen = Math.max(0, dashLenUse - baseLen);
          const xShift = computeXShift(r, rows, displaceGroupsAnim);
          let rx = rightEdgeX + xShift + (extraLen * 0.5);
          if (ANIM_ENABLED && effHWave !== 0 && rowPitchNow > 0){
            const ampLayout = rowPitchNow * effHWave;
            const periodHW = Math.max(0.1, H_WAVE_PERIOD);
            // Blend row-phase in with the fade so we start at a global zero-crossing
            const rowW = fadeShaped; // 0..1: 0=uniform phase, 1=full per-row phase
            const tRel = Math.max(0, animTime - (H_WAVE_T0||0));
            const phase = (rowW * (r / rows) * TWO_PI) - tRel * TWO_PI / periodHW;
            rx += Math.sin(phase) * ampLayout;
          }
          const heightMul = (EASE_TYPE === 'fadeIn' && !_taperTransActive)
            ? Math.max(0, Math.min(1, fadeInRowMul(r, rows)))
            : _lineMul;
          const isFade = (EASE_TYPE === 'fadeIn' && !_taperTransActive);
          const rawH = linePx * heightMul * Math.max(0.01, hMul);
          // During fade-in: allow true 0 height (skip drawing if too small)
          if (isFade && rawH < 0.5) continue;
          const drawH = isFade ? rawH : Math.max(MIN_DRAW_HEIGHT, rawH);
          switch (taperMode) {
            case 'Straight':
              drawStraightTaper(gDest, rx, y, dashLenUse, drawH, TIP_RATIO);
              break;
            case 'Circles':
              drawCircleTaper(gDest, rx, y, dashLenUse, drawH, TIP_RATIO);
              break;
            case 'Blocks':
              drawBlockTaper(gDest, rx, y, dashLenUse, drawH, TIP_RATIO);
              break;
            case 'Pluses':
              drawPlusTaper(gDest, rx, y, dashLenUse, drawH, TIP_RATIO);
              break;
            case 'Rounded':
            default:
              drawRoundedTaper(gDest, rx, y, dashLenUse, drawH, TIP_RATIO);
              break;
          }
        }
      }
    }
  }

  const HlogoCore   = Math.max(0, (rows - 1) * rowPitchNow); // top row to bottom row distance
  const HlogoFull   = Math.max(0, rows * rowPitchNow);       // full block including 1-row gap

  // Try fast-path tiling: preview only, uniform repeats, no mirror, no H-wave, no time-driven anims
  let usedTile = false;
  let tileGfx = null, tileWpx = 0, tileHpx = 0;
  const canTile = (!isExport && PERF_MODE && REPEAT_ENABLED && REPEAT_MODE === 'uniform' && !REPEAT_MIRROR && effHWave === 0 && !ANIM_ENABLED);
  if (canTile){
    // Build base block tile once in pixel coords
    tileWpx = Math.max(1, Math.ceil(s * contentWAdj));
    tileHpx = Math.max(1, Math.ceil(s * HlogoCore));
    tileGfx = createGraphics(tileWpx, tileHpx);
    if (tileGfx){
      try { tileGfx.pixelDensity(1); tileGfx.noSmooth(); } catch(e){}
      tileGfx.clear(); tileGfx.noStroke(); tileGfx.fill(color2);
      tileGfx.push();
      tileGfx.scale(s, s);
      tileGfx.translate(-leftAdj, 0);
      drawLettersSubset(tileGfx, 0, false, 0, maxRowIdx, 1);
      tileGfx.pop();
      usedTile = true;
    }
  }

  if (usedTile){
    // Draw base block via tile (undo scale to pixel space but keep translate)
    g.push();
    g.scale(1/s, 1/s);
    g.image(tileGfx, 0, 0, tileWpx, tileHpx);
    g.pop();
  } else {
    drawLettersSubset(g, 0, false, 0, maxRowIdx, 1);
  }

  if (REPEAT_ENABLED && rows > 0){
    // All in layout units (multiples of rowPitchNow) for perfect alignment
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
      if (usedTile){
        const fullBlocks = Math.floor(extraBelowRemaining / rows);
        if (fullBlocks > 0){
          g.push(); g.scale(1/s,1/s);
          for (let k = 0; k < fullBlocks; k++){
            const layoutTranslate = (HlogoCore + rowPitchNow) + k * HlogoFull;
            const dyPx = s * layoutTranslate;
            g.image(tileGfx, 0, dyPx, tileWpx, tileHpx);
          }
          g.pop();
          extraBelowRemaining -= fullBlocks * rows;
          yCursorLayout += fullBlocks * HlogoFull;
          downIndex += fullBlocks;
        }
      }
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
        if (usedTile && rowsToDraw === rows && !mirrored && Math.abs(hMulDown - 1) < 1e-6){
          // full block fast-path
          g.push(); g.scale(1/s,1/s);
          g.image(tileGfx, 0, s * layoutTranslate, tileWpx, tileHpx);
          g.pop();
        } else {
          g.push();
          g.translate(0, layoutTranslate);
          drawLettersSubset(g, 0, mirrored, 0, rowsToDraw - 1, hMulDown);
          g.pop();
        }

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
      if (usedTile){
        const fullBlocks = Math.floor(extraAboveRemaining / rows);
        if (fullBlocks > 0){
          g.push(); g.scale(1/s,1/s);
          for (let k = 0; k < fullBlocks; k++){
            const topLayout = -(k + 1) * HlogoFull;
            const dyPx = s * topLayout;
            g.image(tileGfx, 0, dyPx, tileWpx, tileHpx);
          }
          g.pop();
          extraAboveRemaining -= fullBlocks * rows;
          yCursorLayoutUp = -(fullBlocks) * HlogoFull;
          upIndex += fullBlocks;
        }
      }
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
        if (usedTile && rowsToDraw === rows && !mirrored && Math.abs(hMulUp - 1) < 1e-6){
          g.push(); g.scale(1/s,1/s);
          g.image(tileGfx, 0, s * topLayout, tileWpx, tileHpx);
          g.pop();
        } else {
          const rowStart = mirrored ? 0 : Math.max(0, rows - rowsToDraw);
          const rowEnd   = mirrored ? Math.min(rows - 1, rowsToDraw - 1) : (rows - 1);

          // Offset so the compressed block's bottom touches the base block's top
          const tileRows = Math.max(0, rowEnd - rowStart);
          const tileHWin = tileRows * rowPitchNow;
          const yOffWin  = Math.max(0, HlogoCore * Math.max(0.01, hMulUp) - tileHWin * Math.max(0.01, hMulUp));

          g.push();
          g.translate(0, topLayout);
          drawLettersSubset(g, yOffWin, mirrored, rowStart, rowEnd, hMulUp);
          g.pop();
        }

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
  try { _lastDrawT = performance.now(); } catch(e){}
}

// ====== DRAWING ======
function arcStepsFor(h){
  if (isExport) return 14;
  if (PERF_MODE && isPlaybackActive()){
    const base = Math.max(6, Math.min(12, Math.round(h * 0.5)));
    return base;
  }
  return 14;
}

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

  const steps = arcStepsFor(h); // adaptive: fewer steps during playback

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

function drawStraightTaper(g, rightX, cy, len, h, tipRatio = TIP_RATIO){
  const Rfull = Math.max(0.0001, h * 0.5);
  const rfull = Math.max(0.0, Rfull * Math.max(0, Math.min(1, tipRatio)));
  const maxRByLen = Math.max(0.0001, len * 0.5);
  const R = Math.min(Rfull, maxRByLen);
  const r = Math.min(rfull, R);
  const bigX = rightX - R;

  if (r <= 1e-6){
    const centerSepTri = Math.max(0, len - R);
    const tipXTri = bigX - centerSepTri;
    g.beginShape();
    g.vertex(bigX, cy - R);
    g.vertex(tipXTri, cy);
    g.vertex(bigX, cy + R);
    g.endShape(CLOSE);
    return;
  }

  // Zorg dat de totale lengte gelijk blijft (linker uiterste blijft rightX - len)
  const centerSep = Math.max(0, len - (R + r));
  const tipX = bigX - centerSep;

  const steps = arcStepsFor(h);

  g.beginShape();
  // Start bovenaan de rechte trailing edge
  g.vertex(bigX, cy - R);

  // Sweep de tip als een LINKS-wijzende semicirkel:
  // t = -90° → +90°, x = tipX - r*cos(t) (min!), y = cy + r*sin(t)
  for (let i = 0; i <= steps; i++){
    const t = -Math.PI/2 + (i/steps) * Math.PI; // -90° → +90°
    const x = tipX - r * Math.cos(t);           // min cos => naar links gericht
    const y = cy + r * Math.sin(t);
    g.vertex(x, y);
  }

  // Sluit via onderste trailing edge
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
  const step = Math.max(1, (PERF_MODE && isPlaybackActive() && !isExport) ? TAPER_SPACING * 1.5 : TAPER_SPACING);
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
  g.fill(color2);

  // Draw cap on the right
  g.rect(xCapL, yCap, capLen, capH);

  // March leftwards with normalized block widths so total exactly fills `len`
  let rightEdge = xCapL;
  for (let i = 0; i < steps; i++){
    const frac = (steps === 1) ? 0 : (i / (steps - 1));
    const w = widths[i];
    const hi = heightAt(frac);
    const yTop = cy - hi * 0.5;
    const xL = rightEdge - w; // touch previous element

    // Optional subtle fade towards the tip (independent of fade-in)
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
  // Base sizes
  const Hfull  = Math.max(0.0001, h);
  const hTip   = Math.max(0.0001, h * Math.max(0, Math.min(1, tipRatio)));
  const maxHByLen = Math.max(0.0001, len * 0.5);
  const Hbig   = Math.min(Hfull, maxHByLen);
  const Hsmall = Math.min(hTip, Hbig);

  const xRight = rightX;            // right edge of the taper
  const xLeft  = rightX - len;      // left edge of the taper

  const step = Math.max(1, (PERF_MODE && isPlaybackActive() && !isExport) ? TAPER_SPACING * 1.5 : TAPER_SPACING);
  const startCx = xRight - Hbig * 0.5;
  const minCx   = xLeft + Hsmall * 0.5;
  const usableLen = Math.max(0, startCx - minCx);
  const n = Math.max(1, Math.floor(usableLen / step) + 1);

  g.push();
  g.noStroke();
  g.fill(color2);
  for (let i = 0; i < n; i++){
    // Center progresses from near the big end to near the tip at fixed spacing
    let cx = startCx - i * step;
    if (cx < minCx) cx = minCx;
    const t = (usableLen > 1e-6) ? ((startCx - cx) / usableLen) : 1; // 0 at big, 1 at tip
    const sizeRaw = lerp(Hbig, Hsmall, t);
    const size = Math.max(1, sizeRaw);
    const half = size * 0.5;
    const bar  = Math.max(1, size * 0.28);
    // horizontal + vertical bars centered at (cx, cy)
    g.rect(cx - half, cy - bar * 0.5, size, bar);
    g.rect(cx - bar * 0.5, cy - half, bar, size);
  }
  g.pop();
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
    // Base X positions without any inter-letter gap; gap is applied at draw time
    letterX: letterX.map((x) => (x - startX) * scale),
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
  const blockLeft = document.getElementById('blockLeft');
  const wrap  = document.getElementById('canvasWrap');
  const exportBar  = document.getElementById('exportBar');
  if (!blockLeft || !wrap) return;

  // Compute available width from the main container minus controls + gap,
  // so content never pushes into the controls column.
  let availW = Math.max(100, blockLeft.clientWidth);
  const mainEl = document.querySelector('main');
  const controlsEl = document.getElementById('controls');
  if (mainEl && controlsEl){
    const cs = getComputedStyle(mainEl);
    const padL = parseFloat(cs.paddingLeft||'0')||0;
    const padR = parseFloat(cs.paddingRight||'0')||0;
    const gapX = parseFloat(cs.columnGap || cs.gap || '0') || 0;
    const total = Math.max(0, mainEl.clientWidth - padL - padR);
    const candidate = Math.max(0, total - controlsEl.offsetWidth - gapX);
    availW = Math.max(100, Math.min(availW, candidate));
  }
  let availH = Math.max(100, blockLeft.clientHeight);
  // Reserve space for the export bar inside the stage, including vertical gap
  if (exportBar){
    const barH = exportBar.offsetHeight || exportBar.clientHeight || 0;
    let gapY = 0;
    const cs = getComputedStyle(blockLeft);
    const rowGap = parseFloat(cs.rowGap || cs.gap || '0') || 0;
    gapY = rowGap;
    // Ensure total (canvas + bar + gap) fits exactly in stage height
    availH = Math.max(1, availH - barH - gapY);
  }

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
    layout = buildLayout(currentLogoText(), rows);
  }

  updateRepeatSlidersRange();
  requestRedraw();
}
// ====== INPUT ======
function mouseMoved(){
  requestRedraw();
}

// ====== PARAM SNAPSHOT + CODE ======
function getParamSnapshot(){
  const snap = {};
  snap.scalePct = Math.round(Math.max(10, Math.min(200, (logoScaleTarget * 100))));
  snap.rows = Math.max(1, Math.round(rowsTarget));
  snap.linePx = Math.max(1, Math.round(linePxTarget));
  snap.tipRatio = Number(TIP_RATIO_TARGET.toFixed(2));
  snap.widthPct = Math.round(Math.max(0, Math.min(500, (widthScaleTarget * 100))));
  snap.gapPx = Math.round(gapPxTarget);
  // Independent dash length multiplier (use target like other params)
  snap.dashMul = Number(Math.max(0, LINE_LEN_MUL_TARGET || 0).toFixed(2));
  // Use the active taper mode for shape; do not read the UI slider to avoid leaking edits between keyframes
  snap.shapeIdx = modeToIndex(effectiveTaperMode());
  snap.groups = Math.round(displaceGroupsTarget);
  snap.dispUnit = Math.round(DISPLACE_UNIT_TARGET);
  snap.colorPreset = Math.max(0, Math.round(activeColorComboIdx || 0));
  snap.bgLines = !!BG_LINES;
  snap.bgTransparent = !!BG_TRANSPARENT;
  // Text selection: index in LOGO_TEXT_OPTIONS
  snap.text = Math.max(0, Math.min(Math.max(0, LOGO_TEXT_OPTIONS.length - 1), LOGO_TEXT_INDEX|0));
  snap.animEnabled = !!ANIM_ENABLED;
  const animModeMap = { off:0, mouse:1, pulse:2, scan:3 };
  snap.animMode = animModeMap[String(ANIM_MODE||'off')] ?? 0;
  const curveMap = { sine:0, smoothstep:1 };
  snap.curve = curveMap[String(MOUSE_CURVE||'sine')] ?? 0;
  snap.animPeriod = Number(Math.max(0, ANIM_PERIOD).toFixed(2));
  snap.wavePower = Number(Math.max(0, MOUSE_AMPLITUDE).toFixed(2));
  snap.pulsePhase = Number(Math.max(0, Math.min(1, PULSE_PHASE)).toFixed(3));
  snap.hWaveAmp = Number(Math.max(0, H_WAVE_AMP).toFixed(2));
  snap.hWavePeriod = Number(Math.max(0.1, H_WAVE_PERIOD).toFixed(2));
  // Keyframe timing
  snap.kfTimeSec = Number(Math.max(0.05, KF_TIME_CUR).toFixed(2));
  snap.kfSpeed = Number(Math.max(0.1, KF_SPEED_MUL).toFixed(2));
  snap.repeatEnabled = !!REPEAT_ENABLED;
  const repeatModeMap = { uniform:0, falloff:1 };
  snap.repeatMode = repeatModeMap[String(REPEAT_MODE||'uniform')] ?? 0;
  snap.repeatFalloff = Number(Math.max(0.5, Math.min(1, REPEAT_FALLOFF_TARGET)).toFixed(2));
  snap.repeatMirror = !!REPEAT_MIRROR;
  const isAll = !!REPEAT_EXTRA_ROWS_IS_FULL || !Number.isFinite(REPEAT_EXTRA_ROWS);
  snap.repeatExtraRows = isAll ? 'ALL' : Math.max(0, Math.round(REPEAT_EXTRA_ROWS));
  const et = String(EASE_TYPE||'smooth');
  const easeTypeMap = { smooth:0, linear:1, easeInOut:2, snap:4, snapHalf:5, fadeIn:6 };
  snap.easeType = easeTypeMap[et] ?? 0;
  snap.easeAmp = Number(Math.max(0, EASE_AMPLITUDE).toFixed(2));
  return snap;
}

function buildParamCode(snap){
  const s = snap || getParamSnapshot();
  const parts = [];
  parts.push('s' + s.scalePct);
  parts.push('r' + s.rows);
  parts.push('lh' + s.linePx);
  parts.push('tr' + s.tipRatio.toFixed(2));
  parts.push('w' + s.widthPct);
  parts.push('g' + s.gapPx);
   // dash length multiplier per keyframe
  parts.push('dl' + Number(s.dashMul).toFixed(2));
  parts.push('sh' + s.shapeIdx);
  parts.push('gr' + s.groups);
  parts.push('du' + s.dispUnit);
  parts.push('cp' + s.colorPreset);
  parts.push('tx' + (s.text|0));
  parts.push('bgl' + (s.bgLines ? 1 : 0));
  parts.push('bgt' + (s.bgTransparent ? 1 : 0));
  parts.push('an' + (s.animEnabled ? 1 : 0));
  parts.push('am' + s.animMode);
  parts.push('cv' + s.curve);
  parts.push('ad' + Number(s.animPeriod).toFixed(2));
  parts.push('pw' + Number(s.wavePower).toFixed(2));
  parts.push('pp' + Number(s.pulsePhase).toFixed(3));
  parts.push('hwa' + Number(s.hWaveAmp).toFixed(2));
  parts.push('hwp' + Number(s.hWavePeriod).toFixed(2));
  // Keyframe timing
  parts.push('kt' + Number(s.kfTimeSec).toFixed(2));
  parts.push('km' + Number(s.kfSpeed).toFixed(2));
  parts.push('re' + (s.repeatEnabled ? 1 : 0));
  parts.push('rm' + s.repeatMode);
  parts.push('rf' + Number(s.repeatFalloff).toFixed(2));
  parts.push('rmi' + (s.repeatMirror ? 1 : 0));
  parts.push('rx' + (s.repeatExtraRows === 'ALL' ? 'A' : s.repeatExtraRows));
  parts.push('et' + s.easeType);
  parts.push('ea' + Number(s.easeAmp).toFixed(2));
  return parts.join('');
}

if (typeof window !== 'undefined'){
  window.getParamSnapshot = getParamSnapshot;
  window.getParamCode = function(){ return buildParamCode(getParamSnapshot()); };
  window.printParamCode = function(){ const snap = getParamSnapshot(); const code = buildParamCode(snap); console.log('Param snapshot:', snap); console.log('Param code:', code); return code; };
}

// Parse compact code back into a token map
function parseParamCode(str){
  if (!str || typeof str !== 'string') return null;
  const input = str.trim();
  const tokens = [
    'hwp','hwa','rmi','bgl','bgt','lh','tr','sh','gr','du','cp','tx','am','cv','ad','pw','pp','kt','km','rm','rf','rx','et','ed','ea','re','an','dl','s','r','w','g'
  ].sort((a,b)=> b.length - a.length);
  const out = {};
  let i = 0;
  while (i < input.length){
    // skip whitespace
    if (/\s/.test(input[i])){ i++; continue; }
    const tok = tokens.find(t => input.startsWith(t, i));
    if (!tok){
      // unknown char → abort
      return null;
    }
    let j = i + tok.length;
    // collect until next token or whitespace/end
    while (j < input.length){
      if (/\s/.test(input[j])) break;
      const nextTok = tokens.find(t => input.startsWith(t, j));
      if (nextTok) break;
      j++;
    }
    const raw = input.slice(i + tok.length, j).trim();
    out[tok] = raw;
    i = j;
  }
  return out;
}

// Apply a compact code to the UI/state
function applyParamCode(code){
  const map = parseParamCode(String(code||''));
  if (!map) return false;
  const byId = (id)=> document.getElementById(id);
  const setVal = (id, val, type='input')=>{ const el = byId(id); if (!el) return false; el.value = String(val); el.dispatchEvent(new Event(type, { bubbles:true })); return true; };
  const setChk = (id, on)=>{ const el = byId(id); if (!el) return false; el.checked = !!on; el.dispatchEvent(new Event('change', { bubbles:true })); return true; };
  const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

  // Rows first (affects groups options and repeat capacity)
  if (map.r){
    const rv = clamp(parseInt(map.r,10)||ROWS_DEFAULT, 1, 512);
    setVal('rows', rv, 'input');
  }

  // Scale
  if (map.s){
    const sv = clamp(parseInt(map.s,10)||100, 10, 200);
    setVal('logoScale', sv, 'input');
  }

  if (map.lh){ setVal('thickness', clamp(parseInt(map.lh,10)||LINE_HEIGHT, 1, 100), 'input'); }
  // Dash length multiplier (no UI control) → set target or reset to default if absent in code
  if (Object.prototype.hasOwnProperty.call(map, 'dl')){
    const v = Math.max(0, parseFloat(map.dl)||0);
    LINE_LEN_MUL_TARGET = v;
  } else {
    LINE_LEN_MUL_TARGET = LINE_LEN_MUL_DEFAULT;
  }
  if (map.tr){ setVal('tipRatio', clamp(parseFloat(map.tr)||TIP_RATIO_DEFAULT, 0, 1).toFixed(2), 'input'); }
  if (map.w){  setVal('widthScale', clamp(parseInt(map.w,10)||110, 0, 500), 'input'); }
  if (map.g){  setVal('gap', parseInt(map.g,10)||0, 'input'); }
  if (map.du){ setVal('dispUnit', parseInt(map.du,10)||0, 'input'); }
  if (map.sh){ setVal('taperIndex', clamp(parseInt(map.sh,10)||1, 1, 5), 'input'); }

  // Logo text (by index in LOGO_TEXT_OPTIONS)
  if (map.tx){
    let v = parseInt(map.tx,10); if (!Number.isFinite(v)) v = 0;
    const maxIdx = Math.max(0, LOGO_TEXT_OPTIONS.length - 1);
    v = Math.max(0, Math.min(maxIdx, v));
    const txt = LOGO_TEXT_OPTIONS[v] || LOGO_TEXT_OPTIONS[0];
    setVal('logoText', txt, 'change');
  }

  // Groups: compute index within signed divisors of current rowsTarget
  if (map.gr){
    const gTarget = parseInt(map.gr,10);
    if (Number.isFinite(gTarget)){
      const rowsInt = Math.max(1, Math.round(typeof rowsTarget !== 'undefined' ? rowsTarget : rows));
      const options = divisorsDescSigned(rowsInt);
      let idx = options.indexOf(gTarget);
      if (idx < 0){
        // fallback: find nearest same-sign or closest absolute
        const sign = Math.sign(gTarget) || 1;
        const same = options.filter(v => Math.sign(v) === sign);
        const absTarget = Math.abs(gTarget);
        let best = same[0] || options[0];
        let bestDiff = Infinity;
        for (const v of same){ const d = Math.abs(Math.abs(v) - absTarget); if (d < bestDiff){ best = v; bestDiff = d; } }
        idx = Math.max(0, options.indexOf(best));
      }
      if (idx >= 0){ setVal('groups', idx, 'input'); }
    }
  }

  // Colors
  if (map.cp){ setVal('colorPreset', Math.max(0, parseInt(map.cp,10)||0), 'change'); }

  // Background toggles
  if (map.bgl){ setChk('bgLines', parseInt(map.bgl,10) === 1); }
  if (map.bgt){ setChk('bgTransparent', parseInt(map.bgt,10) === 1); }

  // Animation
  if (map.an){ setChk('animEnabled', parseInt(map.an,10) === 1); }
  if (map.am){
    const v = parseInt(map.am,10)||0;
    const id = v===1 ? 'animMouse' : v===2 ? 'animPulse' : v===3 ? 'animScan' : 'animOff';
    const el = byId(id); if (el){ el.checked = true; el.dispatchEvent(new Event('change', { bubbles:true })); }
  }
  if (map.cv){
    const id = (parseInt(map.cv,10)||0) === 1 ? 'curveSmooth' : 'curveSine';
    const el = byId(id); if (el){ el.checked = true; el.dispatchEvent(new Event('change', { bubbles:true })); }
  }
  if (map.ad){ setVal('animPeriod', Math.max(0.1, parseFloat(map.ad)||ANIM_PERIOD_DEFAULT).toFixed(2), 'input'); }
  if (map.pw){
    const p = parseFloat(map.pw);
    const v = Number.isFinite(p) ? p : MOUSE_AMPLITUDE_DEFAULT;
    setVal('powerCtl', Math.max(0, v).toFixed(2), 'input');
  }
  if (map.pp){ setVal('pulsePhase', clamp(parseFloat(map.pp)||0, 0, 1).toFixed(3), 'input'); }
  if (map.hwa){ setVal('hWaveAmp', Math.max(0, parseFloat(map.hwa)||0).toFixed(2), 'input'); }
  if (map.hwp){ setVal('hWavePeriod', Math.max(0.1, parseFloat(map.hwp)||H_WAVE_PERIOD_DEFAULT).toFixed(2), 'input'); }
  // Keyframe timing (per-frame seconds + global multiplier)
  if (map.kt){ setVal('kfTime', Math.max(0.05, parseFloat(map.kt)||KF_TIME_DEFAULT).toFixed(2), 'input'); }
  if (map.km){ setVal('kfSpeed', Math.max(0.1, parseFloat(map.km)||KF_SPEED_DEFAULT).toFixed(2), 'input'); }

  // Repeat
  if (map.re){ setChk('repeatEnabled', parseInt(map.re,10) === 1); }
  if (map.rm){
    const id = (parseInt(map.rm,10)||0) === 1 ? 'repeatModeFalloff' : 'repeatModeUniform';
    const el = byId(id); if (el){ el.checked = true; el.dispatchEvent(new Event('change', { bubbles:true })); }
  }
  if (map.rf){ setVal('repeatFalloff', clamp(parseFloat(map.rf)||1, 0.5, 1).toFixed(2), 'input'); }
  if (map.rmi){ setChk('repeatMirror', parseInt(map.rmi,10) === 1); }
  if (map.rx){
    const v = String(map.rx).trim();
    if (v.toUpperCase() === 'A'){
      REPEAT_EXTRA_ROWS_IS_FULL = true;
      REPEAT_EXTRA_ROWS = Number.POSITIVE_INFINITY;
      updateRepeatSlidersRange();
    } else {
      const n = Math.max(0, parseInt(v,10)||0);
      const slider = byId('repeatExtraRows');
      if (slider){
        const max = parseInt(slider.max || '0', 10) || 0;
        slider.value = String(Math.min(n, max));
        slider.dispatchEvent(new Event('input', { bubbles:true }));
      }
    }
  }

  // Easing
  if (map.et){
    const etIdx = parseInt(map.et,10)||0;
    const etVal = etIdx===1 ? 'linear'
                : etIdx===2 ? 'easeInOut'
                : etIdx===4 ? 'snap'
                : etIdx===5 ? 'snapHalf'
                : etIdx===6 ? 'fadeIn'
                : 'smooth';
    setVal('easeType', etVal, 'change');
  }
  if (map.ed){
    const ed = Math.max(0, parseFloat(map.ed)||EASE_DURATION_DEFAULT);
    const base = Math.max(0.05, parseFloat(map.kt)||KF_TIME_DEFAULT);
    const pct = Math.max(0, Math.round((ed / base) * 100));
    setVal('easeDurPct', pct, 'input');
  }
  if (map.ea){ setVal('easeAmp', Math.max(0, parseFloat(map.ea)||EASE_AMPLITUDE_DEFAULT).toFixed(2), 'input'); }

  // Autosave active keyframe after event-driven apply
  try { if (typeof window !== 'undefined' && window.__kfAutosaveActive) window.__kfAutosaveActive(); } catch(e){}

  requestRedraw();
  return true;
}

if (typeof window !== 'undefined'){
  window.parseParamCode = parseParamCode;
  window.applyParamCode = applyParamCode;
}

// Fast, DOM-light application of a param code (avoids event dispatch thrash)
function applyParamCodeFast(codeOrMap){
  const map = (typeof codeOrMap === 'string') ? parseParamCode(codeOrMap) : codeOrMap;
  if (!map) return false;
  const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

  // Rows first
  if (map.r){
    const rv = clamp(parseInt(map.r,10)||ROWS_DEFAULT, 1, 512);
    rowsTarget = rv; // let rows animate via tween
    _layoutDirty = true;
  }
  if (map.s){ logoScaleTarget = clamp(parseInt(map.s,10)||100, 10, 200) / 100; }
  if (map.lh){ linePxTarget = clamp(parseInt(map.lh,10)||LINE_HEIGHT, 1, 200); }
  // Dash length multiplier: set target or reset to default when missing
  if (Object.prototype.hasOwnProperty.call(map, 'dl')){
    const v = Math.max(0, parseFloat(map.dl)||0);
    LINE_LEN_MUL_TARGET = v;
  } else {
    LINE_LEN_MUL_TARGET = LINE_LEN_MUL_DEFAULT;
  }
  if (map.tr){ TIP_RATIO_TARGET = clamp(parseFloat(map.tr)||TIP_RATIO_DEFAULT, 0, 1); }
  if (map.w){  widthScaleTarget = clamp(parseInt(map.w,10)||110, 0, 500)/100; }
  if (map.g){  gapPxTarget = parseInt(map.g,10)||0; }
  if (map.du){ DISPLACE_UNIT_TARGET = parseInt(map.du,10)||0; }
  if (map.sh){ const next = modeFromIndex(clamp(parseInt(map.sh,10)||1, 1, 5)); triggerTaperSwitch(next); }
  // Logo text (fast)
  if (map.tx){
    let v = parseInt(map.tx,10); if (!Number.isFinite(v)) v = 0;
    const maxIdx = Math.max(0, LOGO_TEXT_OPTIONS.length - 1);
    v = Math.max(0, Math.min(maxIdx, v));
    const txt = LOGO_TEXT_OPTIONS[v] || LOGO_TEXT_OPTIONS[0];
    setLogoText(txt);
  }
  if (map.gr){
    const gTarget = parseInt(map.gr,10);
    if (Number.isFinite(gTarget)){
      const rowsInt = Math.max(1, Math.round(rowsTarget||rows));
      const options = divisorsDescSigned(rowsInt);
      let v = gTarget;
      if (!options.includes(v)){
        const sign = Math.sign(v) || 1;
        const same = options.filter(x => Math.sign(x) === sign);
        const absTarget = Math.abs(v);
        v = same.reduce((best, cur)=> Math.abs(Math.abs(cur)-absTarget) < Math.abs(Math.abs(best)-absTarget) ? cur : best, same[0] || options[0]);
      }
      displaceGroupsTarget = v; // tween handles anim for groups
    }
  }
  if (map.cp){
    const idx = Math.max(0, parseInt(map.cp,10)||0);
    applyColorComboByIndex(idx);
  }
  if (map.bgl){ BG_LINES = (parseInt(map.bgl,10) === 1); }
  if (map.bgt){ BG_TRANSPARENT = (parseInt(map.bgt,10) === 1); }

  if (map.an){ ANIM_ENABLED = (parseInt(map.an,10) === 1); }
  if (map.am){ const v=parseInt(map.am,10)||0; ANIM_MODE = (v===1?'mouse':v===2?'pulse':v===3?'scan':'off'); }
  if (map.cv){ MOUSE_CURVE = ((parseInt(map.cv,10)||0)===1)?'smoothstep':'sine'; }
  if (map.ad){ ANIM_PERIOD = Math.max(0.1, parseFloat(map.ad)||ANIM_PERIOD_DEFAULT); }
  if (map.pw){
    const p = parseFloat(map.pw);
    const v = Number.isFinite(p) ? p : MOUSE_AMPLITUDE_DEFAULT;
    MOUSE_AMPLITUDE = Math.max(0, v);
    MOUSE_AMPLITUDE_TARGET = MOUSE_AMPLITUDE;
  }
  if (map.pp){ setPulsePhase(clamp(parseFloat(map.pp)||0, 0, 1)); }
  if (map.hwa){ H_WAVE_AMP = Math.max(0, parseFloat(map.hwa)||0); H_WAVE_AMP_TARGET = H_WAVE_AMP; }
  if (map.hwp){ H_WAVE_PERIOD = Math.max(0.1, parseFloat(map.hwp)||H_WAVE_PERIOD_DEFAULT); }
  if (map.kt){ KF_TIME_CUR = Math.max(0.05, parseFloat(map.kt)||KF_TIME_DEFAULT); }
  if (map.km){ KF_SPEED_MUL = Math.max(0.1, parseFloat(map.km)||KF_SPEED_DEFAULT); }
  if (map.ed){
    const ed = Math.max(0, parseFloat(map.ed)||EASE_DURATION_DEFAULT);
    const base = Math.max(0.05, parseFloat(map.kt)||KF_TIME_DEFAULT);
    EASE_DURATION_PCT = Math.max(0, (ed / base) * 100);
    updateEaseDurationFromKf();
  }

  if (map.re){ REPEAT_ENABLED = (parseInt(map.re,10) === 1); }
  if (map.rm){ REPEAT_MODE = ((parseInt(map.rm,10)||0)===1)?'falloff':'uniform'; }
  if (map.rf){ REPEAT_FALLOFF_TARGET = clamp(parseFloat(map.rf)||1, 0.5, 1); }
  if (map.rmi){ REPEAT_MIRROR = (parseInt(map.rmi,10) === 1); }
  if (map.rx){
    const v = String(map.rx).trim();
    if (v.toUpperCase() === 'A'){
      REPEAT_EXTRA_ROWS_IS_FULL = true;
      REPEAT_EXTRA_ROWS = Number.POSITIVE_INFINITY;
    } else {
      REPEAT_EXTRA_ROWS_IS_FULL = false;
      REPEAT_EXTRA_ROWS = Math.max(0, parseInt(v,10)||0);
    }
    // tween for extra rows anim handles the visual interpolation
  }

  if (map.et){ const etIdx = parseInt(map.et,10)||0; EASE_TYPE = etIdx===1?'linear':etIdx===2?'easeInOut':etIdx===4?'snap':etIdx===5?'snapHalf':etIdx===6?'fadeIn':'smooth'; }
  if (map.ed){ EASE_DURATION = Math.max(0, parseFloat(map.ed)||EASE_DURATION_DEFAULT); }
  if (map.ea){ EASE_AMPLITUDE = Math.max(0, parseFloat(map.ea)||EASE_AMPLITUDE_DEFAULT); }

  if (typeof window !== 'undefined'){
    if (window.__rebuildGroupsSelect) window.__rebuildGroupsSelect();
    updateRepeatSlidersRange();
    if (!KF_PLAYING && window.__updateUIFromState) window.__updateUIFromState();
    updateAnimRun();
    // Autosave active keyframe after programmatic apply
    try { if (window.__kfAutosaveActive) window.__kfAutosaveActive(); } catch(e){}
  }
  // Ensure easing duration matches the (possibly new) keyframe duration
  try { updateEaseDurationFromKf(); } catch(e){}
  requestRedraw();
  return true;
}

if (typeof window !== 'undefined'){
  window.applyParamCodeFast = applyParamCodeFast;
}
