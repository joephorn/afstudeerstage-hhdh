// Lightweight custom scalar control: drag anywhere, edit on click, arrow keys to nudge
(function(){
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function quantize(v, step){ if (!step || step<=0) return v; return Math.round(v/step)*step; }

  class CustomSlider {
    constructor(root){
      this.root = root;
      const linkSel = root.getAttribute('data-link');
      this.link = linkSel ? document.querySelector(linkSel) : null;
      const unit = root.getAttribute('data-unit') || '';
      this.unit = unit;
      this.editing = false;
      this.dragging = false;
      this.build();
      this.syncFromLink();
      this.bind();
    }
    build(){
      const fill = document.createElement('div'); fill.className = 'scalar__fill';
      const val  = document.createElement('div'); val.className = 'scalar__value';
      const unit = document.createElement('div'); unit.className = 'scalar__unit'; unit.textContent = this.unit;
      this.root.innerHTML = '';
      this.root.appendChild(fill);
      this.root.appendChild(val);
      this.root.appendChild(unit);
      this.elFill = fill; this.elVal = val; this.elUnit = unit; this.elEdit = null; this.elInput = null;
      this.root.tabIndex = 0;
    }
    get min(){ return this.link ? parseFloat(this.link.min||'0') : 0; }
    get max(){ return this.link ? parseFloat(this.link.max||'100') : 100; }
    get step(){
      if (!this.link) return 1;
      const s = parseFloat(this.link.step||'1');
      if (!isFinite(s) || s===0) return 1;
      return s;
    }
    get value(){ return this.link ? parseFloat(this.link.value||'0') : 0; }
    set value(v){ if (!this.link) return; this.link.value = String(v); this.link.dispatchEvent(new Event('input', {bubbles:true})); }
    get isPercentScale(){ return (this.unit === '%') && (this.max <= 1.5); }
    fmtBase(v){ return (Math.abs(this.step) < 1 ? v.toFixed(String(this.step).split('.')[1]?.length||2) : Math.round(v)); }
    fmtDisplay(v){
      if (this.isPercentScale){ return Math.round(v); }
      return this.fmtBase(v);
    }
    syncFromLink(){
      const v = clamp(this.value, this.min, this.max);
      const pct = (this.max>this.min)? ((v-this.min)/(this.max-this.min))*100 : 0;
      this.elFill.style.width = pct + '%';
      const disp = this.isPercentScale ? (v * 100) : v;
      this.elVal.textContent = this.fmtDisplay(disp);
    }
    setFromClientX(x){
      const rect = this.root.getBoundingClientRect();
      const t = clamp((x - rect.left) / Math.max(1, rect.width), 0, 1);
      let v = this.min + t * (this.max - this.min);
      v = quantize(v, this.step);
      v = clamp(v, this.min, this.max);
      this.value = v; this.syncFromLink();
    }
    startDrag(e){ this.dragging = true; this.root.classList.add('scalar--dragging'); this.setFromClientX(e.clientX); this.capture(e); }
    moveDrag(e){ if (!this.dragging) return; this.setFromClientX(e.clientX); }
    endDrag(){ this.dragging = false; this.root.classList.remove('scalar--dragging'); }
    capture(e){
      const mm = (ev)=>{ ev.preventDefault(); this.moveDrag(ev); };
      const mu = ()=>{ window.removeEventListener('pointermove', mm); window.removeEventListener('pointerup', mu); this.endDrag(); };
      window.addEventListener('pointermove', mm, { passive: false });
      window.addEventListener('pointerup', mu);
    }
    selectValueText(){ try { const r=document.createRange(); r.selectNodeContents(this.elVal); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);}catch(e){} }
    beginEdit(){ if (this.editing) return; this.editing = true; this.root.classList.add('is-editing'); this.elVal.setAttribute('contenteditable','true'); this.elVal.focus(); this.selectValueText(); }
    endEdit(commit){
      if (!this.editing) return;
      if (commit){
        const raw = parseFloat(this.elVal.textContent);
        if (isFinite(raw)){
          let vRaw = this.isPercentScale ? (raw / 100) : raw;
          let v = quantize(vRaw, this.step);
          v = clamp(v, this.min, this.max);
          this.value = v;
        }
      }
      this.editing = false; this.root.classList.remove('is-editing'); this.elVal.removeAttribute('contenteditable'); this.syncFromLink();
    }
    bind(){
      this.root.addEventListener('pointerdown', (e)=>{
        if (this.editing) return;
        e.preventDefault();
        const isVal = (e.target === this.elVal) || this.elVal.contains(e.target);
        if (!isVal){ this.startDrag(e); return; }
        const x0 = e.clientX, y0 = e.clientY; let moved = false;
        const cleanup = ()=>{
          window.removeEventListener('pointermove', move, { passive:false });
          window.removeEventListener('pointerup', up);
        };
        const move = (ev)=>{
          if (!moved && (Math.abs(ev.clientX-x0)>3 || Math.abs(ev.clientY-y0)>3)){
            moved = true; cleanup(); this.startDrag(ev);
          }
        };
        const up = (ev)=>{ cleanup(); if (!moved){ this.beginEdit(); } };
        window.addEventListener('pointermove', move, { passive:false });
        window.addEventListener('pointerup', up);
      });
      // value editing lifecycle
      this.elVal.addEventListener('keydown', (e)=>{
        if (!this.editing) return;
        if (e.key==='Enter'){ e.preventDefault(); this.endEdit(true); }
        else if (e.key==='Escape'){ e.preventDefault(); this.endEdit(false); }
      });
      this.elVal.addEventListener('blur', ()=> this.endEdit(true));
      this.root.addEventListener('keydown', (e)=>{
        let inc = 0; const step = this.step || 1; const big = step * 10; const small = (String(step).indexOf('.')>=0) ? step : step;
        if (e.key==='ArrowLeft') inc = - (e.shiftKey ? big : small);
        if (e.key==='ArrowRight') inc = + (e.shiftKey ? big : small);
        if (inc!==0){ e.preventDefault(); let v = clamp(quantize(this.value + inc, step), this.min, this.max); this.value = v; this.syncFromLink(); }
      });
      if (this.link){ this.link.addEventListener('input', ()=> this.syncFromLink()); }
    }
  }

  function autoAttach(){
    document.querySelectorAll('.scalar[data-link]').forEach(el => { if (!el.__scalar){ el.__scalar = new CustomSlider(el); } });
  }
  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', autoAttach); }
  else { autoAttach(); }
  window.__CustomSlider = CustomSlider;
  window.__resyncCustomSliders = function(){
    try {
      document.querySelectorAll('.scalar[data-link]').forEach(el => {
        if (el.__scalar && typeof el.__scalar.syncFromLink === 'function') el.__scalar.syncFromLink();
      });
    } catch(e){}
  };
})();
