const setupFn = () => {
  createCanvas(800, 600, SVG);
  noLoop();
};

const drawFn = () => {
  background(240);
  rectMode(CENTER); noStroke();
  fill('#0096ff'); rect(width/2, height/2, 500, 200);
  fill(0); textAlign(CENTER, CENTER);
  textSize(20); text('bewijs dat', width/2, height/2 - 50);
  textSize(50); text('ik', width/2, height/2);
  textSize(20); text('een PNG heb geexporteerd', width/2, height/2 + 50);
};

// LATEN STAAN!
window.setup = setupFn;
window.draw  = drawFn;