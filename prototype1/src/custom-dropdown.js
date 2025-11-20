// Minimal custom dropdowns for Shape and Color with SVG previews
(function(){
  function el(tag, cls){ const n=document.createElement(tag); if(cls) n.className=cls; return n; }
  function clear(n){ while(n.firstChild) n.removeChild(n.firstChild); }

  // Helper: build icon; prefer inline SVG, fetch .svg files, use <img> for raster (png/webp/jpg)
  function buildIconForOption(opt, type, idx){
    const iconWrap = el('div','dropdown__icon');
    let src = '';
    if (opt && opt.dataset){
      src = opt.dataset.iconSrc || opt.dataset.iconsrc || opt.dataset.iconpath || opt.dataset.icon || '';
    }
    if (!src && type === 'color' && Array.isArray(window.COLOR_COMBOS)){
      const c = window.COLOR_COMBOS[Math.max(0, Math.min(window.COLOR_COMBOS.length-1, idx|0))];
      if (c){ src = c.iconSrc || c.icon || ''; }
    }
    if (!src) return iconWrap;
    const v = String(src).trim();
    if (v.startsWith('<')){
      iconWrap.innerHTML = v; // inline SVG markup
    } else {
      // If file path looks like an SVG, inline it via fetch; otherwise use <img>
      if (/\.svg(\?.*)?$/i.test(v)){
        try { fetch(v).then(r => r.text()).then(txt => { iconWrap.innerHTML = txt; }).catch(()=>{}); } catch(e){}
      } else {
        const img = new Image(); img.src = v; img.alt = ''; iconWrap.appendChild(img);
      }
    }
    return iconWrap;
  }

  class CustomDropdown {
    constructor(root){
      this.root = root;
      const linkSel = root.getAttribute('data-link');
      this.link = linkSel ? document.querySelector(linkSel) : null;
      this.type = root.classList.contains('dropdown--color') ? 'color' : 'shape';
      this.open = false;
      this.build();
      this.syncFromLink();
      this.bind();
    }
    build(){
      this.root.innerHTML = '';
      const btn = el('button','dropdown__button'); btn.type='button'; btn.setAttribute('aria-haspopup','listbox'); btn.setAttribute('aria-expanded','false');
      const menu = el('div','dropdown__menu'); menu.setAttribute('role','listbox'); menu.hidden = true;
      this.root.appendChild(btn); this.root.appendChild(menu);
      this.btn = btn; this.menu = menu;
      this.rebuildMenu();
    }
    rebuildMenu(){
      clear(this.menu);
      if (!this.link) return;
      const opts = Array.from(this.link.options || []);
      opts.forEach((opt, i) => {
        const item = el('div','dropdown__item'); item.setAttribute('role','option'); item.dataset.value = opt.value;
        const iconWrap = buildIconForOption(opt, this.type, i);
        this.menu.appendChild(item);
        item.appendChild(iconWrap);
        if (this.type === 'shape'){
          const label = el('div','dropdown__label'); label.textContent = opt.text || opt.value; item.appendChild(label);
        }
        item.addEventListener('click', ()=> this.selectValue(opt.value));
      });
    }
    selectValue(v){
      if (!this.link) return;
      this.link.value = String(v);
      this.link.dispatchEvent(new Event('change', { bubbles: true }));
      this.syncFromLink();
      this.close();
    }
    syncFromLink(){
      if (!this.link) return;
      const val = String(this.link.value || '');
      this.btn.setAttribute('aria-expanded', this.open ? 'true' : 'false');
      // Button content
      clear(this.btn);
      const opts = Array.from(this.link.options || []);
      const idx = this.type==='color' ? (parseInt(val,10)||0) : Math.max(0, opts.findIndex(o=>String(o.value)===val));
      const opt = this.type==='color' ? (opts[idx] || null) : opts.find(o=>String(o.value)===val);
      const iconWrap = buildIconForOption(opt, this.type, idx);
      this.btn.appendChild(iconWrap);
      // Button label: only for shape
      if (this.type === 'shape'){
        const label = el('div','dropdown__label');
        const optForLabel = Array.from(this.link.options).find(o => String(o.value)===val);
        label.textContent = optForLabel ? (optForLabel.text || optForLabel.value) : val;
        this.btn.appendChild(label);
      }
    }
    toggle(){ this.open ? this.close() : this.openMenu(); }
    openMenu(){ this.open = true; this.menu.hidden = false; this.root.classList.add('is-open'); this.syncFromLink(); }
    close(){ this.open = false; this.menu.hidden = true; this.root.classList.remove('is-open'); this.syncFromLink(); }
    bind(){
      const clickToggle = (e)=>{ e.preventDefault(); e.stopPropagation(); this.toggle(); };
      this.btn.addEventListener('click', clickToggle);
      // Ensure clicking icon (or its children) toggles as well
      this.root.addEventListener('click', (e)=>{
        if (e.target && (e.target.closest && e.target.closest('.dropdown__button'))){ clickToggle(e); }
      });
      document.addEventListener('click', (e)=>{ if (!this.root.contains(e.target)) this.close(); });
      document.addEventListener('keydown', (e)=>{ if (e.key==='Escape') this.close(); });
      if (this.link){
        this.link.addEventListener('change', ()=>{ this.syncFromLink(); this.rebuildMenu(); });
      }
    }
  }

  function autoAttach(){
    document.querySelectorAll('.dropdown[data-link]').forEach(el => { if (!el.__dropdown){ el.__dropdown = new CustomDropdown(el); } });
  }
  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', autoAttach); }
  else { autoAttach(); }
  window.__CustomDropdown = CustomDropdown;
  window.__resyncCustomDropdowns = function(){ try { document.querySelectorAll('.dropdown[data-link]').forEach(el => { if (el.__dropdown){ el.__dropdown.syncFromLink(); el.__dropdown.rebuildMenu(); } }); } catch(e){} };
})();
