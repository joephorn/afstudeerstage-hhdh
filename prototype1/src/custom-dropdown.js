// Minimal custom dropdowns for Text, Shape and Color with previews
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
      if (root.classList.contains('dropdown--color')) this.type = 'color';
      else if (root.classList.contains('dropdown--shape')) this.type = 'shape';
      else if (root.classList.contains('dropdown--ease')) this.type = 'ease';
      else this.type = 'text';
      this.open = false;
       this._lastValue = null;
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
      const currentVal = String(this.link.value || '');
      opts.forEach((opt, i) => {
        const optVal = String(opt.value || '');
        // Skip the currently selected value so the button shows it and
        // the menu only contains alternative choices.
        if (optVal === currentVal) return;
        const item = el('div','dropdown__item'); item.setAttribute('role','option'); item.dataset.value = opt.value;
        this.menu.appendChild(item);
        if (this.type === 'text'){
          const label = el('div','dropdown__label'); label.textContent = opt.text || opt.value; item.appendChild(label);
        } else if (this.type === 'ease'){
          const label = el('div','dropdown__label'); label.textContent = opt.text || opt.value; item.appendChild(label);
          const iconWrap = buildIconForOption(opt, this.type, i); item.appendChild(iconWrap);
        } else {
          const iconWrap = buildIconForOption(opt, this.type, i);
          item.appendChild(iconWrap);
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
    syncFromLink(force){
      if (!this.link) return;
      const val = String(this.link.value || '');
      this.btn.setAttribute('aria-expanded', this.open ? 'true' : 'false');
      if (!force && !this.open && this._lastValue === val){
        return;
      }
      this._lastValue = val;
      // Button content
      clear(this.btn);
      const opts = Array.from(this.link.options || []);
      const idx = this.type==='color' ? (parseInt(val,10)||0) : Math.max(0, opts.findIndex(o=>String(o.value)===val));
      const opt = this.type==='color' ? (opts[idx] || null) : opts.find(o=>String(o.value)===val);
      if (this.type === 'text'){
        const label = el('div','dropdown__label dropdown__label--text');
        label.textContent = opt ? (opt.text || opt.value) : '';
        this.btn.appendChild(label);
        const unitIcon = el('div','dropdown__unit-icon');
        this.btn.appendChild(unitIcon);
      } else if (this.type === 'ease'){
        const label = el('div','dropdown__label');
        label.textContent = opt ? (opt.text || opt.value) : '';
        this.btn.appendChild(label);
        const iconWrap = buildIconForOption(opt, this.type, idx);
        this.btn.appendChild(iconWrap);
      } else {
        const iconWrap = buildIconForOption(opt, this.type, idx);
        this.btn.appendChild(iconWrap);
      }
    }
    toggle(){ this.open ? this.close() : this.openMenu(); }
    positionMenu(){
      if (!this.menu || !this.btn) return;
      const menu = this.menu;
      // Reset inline positioning so measurements are up to date
      menu.style.maxHeight = '';
      menu.style.top = '';
      menu.style.bottom = '';
      menu.style.overflowY = '';

      const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
      const btnRect = this.btn.getBoundingClientRect();
      const margin = 8;

      const menuRect = menu.getBoundingClientRect();
      const menuH = menuRect.height || 0;
      const spaceBelow = viewportH - btnRect.bottom - margin;
      const spaceAbove = btnRect.top - margin;

      const openUp = menuH > spaceBelow && spaceAbove > spaceBelow;
      if (openUp){
        menu.style.top = 'auto';
        menu.style.bottom = 'calc(100% + 4px)';
        const maxH = Math.max(40, Math.min(menuH || spaceAbove, spaceAbove));
        if (maxH > 0 && Number.isFinite(maxH)) menu.style.maxHeight = maxH + 'px';
      } else {
        menu.style.top = 'calc(100% + 4px)';
        menu.style.bottom = 'auto';
        const maxH = Math.max(40, Math.min(menuH || spaceBelow, spaceBelow));
        if (maxH > 0 && Number.isFinite(maxH)) menu.style.maxHeight = maxH + 'px';
      }
      menu.style.overflowY = 'auto';
    }
    openMenu(){
      // Close other open dropdowns so only one menu is visible at a time,
      // similar to native system dropdown behaviour.
      try {
        document.querySelectorAll('.dropdown[data-link]').forEach(el => {
          if (el.__dropdown && el.__dropdown !== this){
            el.__dropdown.close();
          }
        });
      } catch(e){}
      this.open = true;
      // Rebuild the menu based on the *current* value so the selected
      // option is omitted from the list and does not appear twice.
      this.rebuildMenu();
      this.menu.hidden = false;
      this.root.classList.add('is-open');
      this.syncFromLink();
      // Position after layout so the menu never falls outside the viewport
      requestAnimationFrame(()=> this.positionMenu());
    }
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
        this.link.addEventListener('change', ()=>{ this.syncFromLink(true); });
      }
    }
  }

  function autoAttach(){
    document.querySelectorAll('.dropdown[data-link]').forEach(el => { if (!el.__dropdown){ el.__dropdown = new CustomDropdown(el); } });
  }
  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', autoAttach); }
  else { autoAttach(); }
  window.__CustomDropdown = CustomDropdown;
  window.__resyncCustomDropdowns = function(){
    try {
      document.querySelectorAll('.dropdown[data-link]').forEach(el => {
        if (el.__dropdown){
          el.__dropdown.rebuildMenu();
          el.__dropdown.syncFromLink(true);
        }
      });
    } catch(e){}
  };
  // Lightweight variant: only update button contents without rebuilding menus
  window.__syncCustomDropdownButtons = function(){
    try {
      document.querySelectorAll('.dropdown[data-link]').forEach(el => {
        if (el.__dropdown){
          el.__dropdown.syncFromLink();
        }
      });
    } catch(e){}
  };
})();
