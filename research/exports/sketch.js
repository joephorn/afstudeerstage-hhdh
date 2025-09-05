let bitmap;

function renderTo(g) {
  const w = g.width || width;
  const h = g.height || height;
  g.background(240);
  g.rectMode(CENTER); g.noStroke();
  g.fill('#0096ff'); g.rect(w/2, h/2, 500, 200);
  g.fill(0); g.textAlign(CENTER, CENTER);
  g.textSize(20); g.text('bewijs dat', w/2, h/2 - 50);
  g.textSize(50); g.text('ik', w/2, h/2);
  g.textSize(20); g.text('een MP4 heb geexporteerd', w/2, h/2 + 50);
}

const setupFn = () => {
  createCanvas(800, 600, SVG);
  noLoop();

  // LATEN STAAN!
  bitmap = createGraphics(800, 600); // bitmap voor video
  bitmap.hide();
  window.captureCanvas = bitmap.elt;
  window.getRecCanvas = () => bitmap.elt;
};

const drawFn = () => {
  renderTo(this);
  if (window.__recording && bitmap) {
    renderTo(bitmap);
  }
};

// LATEN STAAN!
window.setup = setupFn;
window.draw  = drawFn;

// recording toggles (index.html calls these)
window.__startRecording = () => { window.__recording = true; };
window.__stopRecording  = () => { window.__recording  = false; };