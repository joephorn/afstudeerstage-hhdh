
let bitmap;
let capturer = null;

// position + velocity for the blue rectangle (random drift)
let rx = 400, ry = 300;
let vx = 0, vy = 0;
let __liveTimer = null;

function renderTo(g) {
  const w = g.width || width;
  const h = g.height || height;
  g.background(240);
  g.rectMode(CENTER); g.noStroke();
  g.fill('#0096ff'); g.rect(rx, ry, 500, 200);
  g.fill(0); g.textAlign(CENTER, CENTER);
  g.textSize(20); g.text('bewijs dat', rx, ry - 50);
  g.textSize(50); g.text('ik', rx, ry);
  g.textSize(20); g.text('een WebM heb geexporteerd', rx, ry + 50);
}

function step() {
  // wander velocities slightly
  vx += (Math.random() - 0.5) * 0.2;
  vy += (Math.random() - 0.5) * 0.2;
  // clamp speed
  const maxSpeed = 2.0;
  vx = Math.max(-maxSpeed, Math.min(maxSpeed, vx));
  vy = Math.max(-maxSpeed, Math.min(maxSpeed, vy));
  // integrate
  rx += vx;
  ry += vy;
  // keep inside bounds (account for the rectangle half-size 250x100)
  const padX = 250, padY = 100;
  const W = 800, H = 600;
  if (rx < padX) { rx = padX; vx *= -1; }
  if (rx > W - padX) { rx = W - padX; vx *= -1; }
  if (ry < padY) { ry = padY; vy *= -1; }
  if (ry > H - padY) { ry = H - padY; vy *= -1; }
}

const setupFn = () => {
  createCanvas(800, 600, SVG);
  noLoop();

  // Offscreen bitmap voor video-opname
  bitmap = createGraphics(800, 600);
  bitmap.hide();

  window.captureCanvas = bitmap.elt;
  window.getRecCanvas = () => bitmap.elt;

  // drive a lightweight redraw loop at ~30fps when not recording
  if (!__liveTimer) {
    __liveTimer = setInterval(() => { if (!window.__recording) redraw(); }, 1000 / 30);
  }
};

const drawFn = () => {
  // advance motion each frame
  step();
  // draw to visible SVG
  renderTo(this);
  // and to the offscreen bitmap (for video capture)
  if (window.__recording && bitmap) {
    renderTo(bitmap);
  }
  // let CCapture grab the frame (bitmap)
  if (window.__recording && window.__capturer && window.captureCanvas) {
    window.__capturer.capture(window.captureCanvas);
  }
};

// Start CCapture opname (aangeroepen door HTML-knop)
window.startWebMCapture = ({ fps = 60, seconds = 4, filename = 'sketch.webm' } = {}) => {
  if (capturer) return; // al bezig

  // Safari check: MediaRecorder + captureStream nodig
  if (typeof MediaRecorder === 'undefined' ||
      typeof HTMLCanvasElement === 'undefined' ||
      !HTMLCanvasElement.prototype.captureStream) {
    alert('MediaRecorder niet beschikbaar in deze browser. Update Safari of gebruik Chrome.');
    return;
  }

  window.__recording = true;

  // Forceer MediaRecorder-backend => geen WebP gebruikt (niet supported door safari)
  capturer = new CCapture({
    format: 'webm-mediarecorder',
    framerate: fps,
    name: filename.replace(/\.webm$/i, ''),
  });
  window.__capturer = capturer;

  const totalFrames = Math.max(1, Math.round(fps * seconds));
  let frames = 0;

  capturer.start();

  const tick = () => {
    if (typeof window.redraw === 'function') window.redraw();
    if (window.captureCanvas) window.__capturer.capture(window.captureCanvas);

    frames++;
    if (frames < totalFrames) {
      setTimeout(tick, 1000 / fps);
    } else {
      window.__recording = false;
      capturer.stop();
      capturer.save();
      window.__capturer = null;
      capturer = null;
    }
  };

  tick();
};

// p5 entrypoints
window.setup = setupFn;
window.draw  = drawFn;

window.__startRecording = () => { window.__recording = true; };
window.__stopRecording  = () => { window.__recording  = false; };

// (remove mouse/touch input handlers for redraw)