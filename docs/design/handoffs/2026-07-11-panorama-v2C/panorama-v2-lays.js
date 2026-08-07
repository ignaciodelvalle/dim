/* ===== MiMAR · Panorama v2 — exploración de POSICIONES =====
   Misma consola (motor PANO), 4 disposiciones. El mapa cede lo mínimo posible:
   A filas arriba + dock abajo (referencia v2) · B barra única + dock abajo ·
   C overlays flotantes (el mapa nunca cambia de tamaño) · D dock lateral (el mapa nunca pierde alto). */
(function () {
  const P = window.PANO;
  const el = P.el, svg = P.svg;

  function icon(kind) {
    const s = svg('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const a = (t, at) => s.appendChild(svg(t, at));
    if (kind === 'map') { a('rect', { x: 2.5, y: 2.5, width: 11, height: 11, rx: 2 }); a('path', { d: 'M6 2.5v11M10 2.5v11' }); }
    else if (kind === 'eye') { a('circle', { cx: 8, cy: 8, r: 5.5 }); a('circle', { cx: 8, cy: 8, r: 1.8, fill: 'currentColor', stroke: 'none' }); }
    else if (kind === 'folder') { a('rect', { x: 2, y: 3.5, width: 12, height: 9.5, rx: 1.5 }); a('path', { d: 'M2 6.5h12' }); }
    else if (kind === 'users') { a('circle', { cx: 8, cy: 5.5, r: 2.6 }); a('path', { d: 'M3 13.5c.7-2.6 2.7-4 5-4s4.3 1.4 5 4' }); }
    else if (kind === 'rules') { a('rect', { x: 3, y: 2.5, width: 10, height: 11, rx: 1.5 }); a('path', { d: 'M5.5 6h5M5.5 9h5' }); }
    else if (kind === 'home') { a('path', { d: 'M3 7.5 8 3l5 4.5V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z' }); }
    else if (kind === 'shield') { a('path', { d: 'M8 2.5 13 4v4c0 3-2 5-5 5.5C5 13 3 11 3 8V4z' }); }
    return s;
  }

  const PERIODS = [
    { id: '7d', l: '7 días', f: 0.12 }, { id: '30d', l: '30 días', f: 0.4 },
    { id: '90d', l: '90 días', f: 1 }, { id: '12m', l: '12 meses', f: 2.6 }
  ];
  const MORE_PERIODS = [
    { id: 'ytd', l: 'Año en curso', f: 1.9 }, { id: '3a', l: '3 años', f: 6.4 },
    { id: '5a', l: '5 años', f: 9.8 }, { id: 'custom', l: 'Personalizado…', f: 1 }
  ];
  const LOCS = {
    CORDOBA: ['Capital', 'Colón', 'Punilla', 'Río Primero', 'San Justo', 'Totoral', 'Cruz del Eje', 'Río Segundo'],
    default: ['Capital', 'Norte', 'Este', 'Oeste', 'Sur', 'Centro']
  };
  const DATES = ['09 jul 2026', '08 jul 2026', '08 jul 2026', '05 jul 2026', '04 jul 2026', '02 jul 2026', '30 jun 2026', '28 jun 2026'];
  const ESTADOS = [
    ['Abierta', 'warn'], ['En curso', 'blue'], ['Cerrada', 'mute'], ['Abierta', 'warn'],
    ['En curso', 'blue'], ['Cerrada', 'mute'], ['En curso', 'blue'], ['Abierta', 'warn']
  ];
  function rawCount(code, base) {
    const v = P.PVAL[code] ? P.PVAL[code][base] : 40;
    return P.METRICS[base].type === 'div' ? 80 + v * 2.2 : 90 + v * 14;
  }
  function countFor(scope, base, perF) {
    const norm = 267 / rawCount('CORDOBA', 'denuncias');
    const raw = scope ? rawCount(scope, base) * norm : P.GEO.provinces.reduce((s, p) => s + rawCount(p.code, base), 0) * norm * 0.42;
    return Math.max(8, Math.round(raw * perF));
  }

  /* ---------- popover compartido (un solo listener global) ---------- */
  let openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
  document.addEventListener('click', (e) => { if (openMenu && !openMenu.contains(e.target) && !openMenu._anchor.contains(e.target)) closeMenu(); });
  function popover(anchor, build, cls) {
    if (openMenu && openMenu._anchor === anchor) { closeMenu(); return null; }
    closeMenu();
    const m = el('div', { class: 'pmenu ' + (cls || ''), role: 'menu' });
    m._anchor = anchor; build(m);
    anchor.parentElement.appendChild(m); openMenu = m;
    m.addEventListener('keydown', (e) => {
      const items = [...m.querySelectorAll('button:not([disabled])')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(i + 1, items.length - 1)].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(i - 1, 0)].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeMenu(); anchor.focus(); }
    });
    const first = m.querySelector('button[aria-checked="true"]') || m.querySelector('button');
    if (first) first.focus();
    return m;
  }

  /* ================================================================ */
  function mount(root, layout) {
    layout = layout || 'A';
    const st = {
      vista: 'bienestar', base: P.VISTAS.bienestar.base, layers: P.VISTAS.bienestar.layers.slice(),
      scope: null, scopeName: null, period: PERIODS[2], dockOpen: false, tab: 'registros'
    };
    let api = null;

    const toastEl = el('div', { class: 'toast', role: 'status' });
    let toastT;
    function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2400); }

    /* ---------- rail ---------- */
    const items = [['map', 'Panorama'], ['eye', 'Vigilancia'], ['folder', 'Casos'], ['users', 'Censo'], ['rules', 'Reglas'], ['home', 'Refugios'], ['shield', 'Organismos']];
    const rail = el('nav', { class: 'nav-rail' }, [
      el('div', { class: 'nav-brand' }, [el('span', { class: 'nav-logo' }, ['◆']), el('div', null, [el('div', { class: 'nav-brand-t' }, ['MiMAR']), el('div', { class: 'nav-brand-s' }, ['Operador · Nación'])])]),
      el('div', { class: 'nav-scope' }, ['Ministerio de Salud']),
      el('ul', { class: 'nav-list' }, items.map(([ic, lbl]) => el('li', { class: 'nav-item' + (lbl === 'Panorama' ? ' active' : '') }, [icon(ic), el('span', null, [lbl])]))),
      el('div', { class: 'nav-foot' }, [el('div', { class: 'nav-avatar' }, ['MR']), el('div', null, [el('div', { class: 'nav-user' }, ['M. Rodríguez']), el('div', { class: 'nav-role' }, ['Epidemiología'])])])
    ]);

    /* ---------- masthead (A y C) ---------- */
    const freshChip = el('span', { class: 'fresh-chip' }, ['Datos al 11/07, 09:41']);
    const masthead = el('header', { class: 'mast' }, [
      el('span', { class: 'mast-crumb' }, ['Operador › Panorama']),
      el('h1', { class: 'mast-title' }, ['Centro de Situación Nacional']),
      el('div', { class: 'mast-r' }, [freshChip, el('button', { class: 'op-btn sm', type: 'button', onclick: () => toast('Datos actualizados al 11/07, 09:41.') }, ['Actualizar'])])
    ]);

    /* ---------- vista: fila (A) o dropdown (B/C/D) ---------- */
    const vistaBtns = {};
    const capasCount = el('span', { class: 'capas-n' }, [String(st.layers.length)]);
    const capasBtn = el('button', { class: 'op-btn sm capas-btn', type: 'button', 'aria-haspopup': 'menu' }, ['Capas ', capasCount]);
    const capasWrap = el('div', { class: 'anchor' }, [capasBtn]);
    capasBtn.addEventListener('click', () => {
      popover(capasBtn, (m) => {
        m.appendChild(el('div', { class: 'pmenu-h' }, ['Base (choropleth)']));
        m.appendChild(el('div', { class: 'pmenu-row' }, [el('span', { class: 'capa-dot sq', style: 'background:' + (P.baseColor[st.base] || '#0e5a99') }), el('span', null, [P.METRICS[st.base].label]), el('span', { class: 'capa-tag' }, ['base'])]));
        m.appendChild(el('div', { class: 'pmenu-h' }, ['Capas de eventos (aditivas)']));
        P.POINT_ORDER.forEach(lid => {
          const L = P.POINT_LAYERS[lid];
          const on = () => st.layers.includes(lid);
          const b = el('button', { type: 'button', role: 'menuitemcheckbox', 'aria-checked': on() ? 'true' : 'false' }, [
            el('span', { class: 'capa-check' }, [on() ? '✓' : '']),
            el('span', { class: 'capa-dot', style: 'background:' + L.color }),
            el('span', null, [L.label]),
            el('span', { class: 'capa-count' }, [L.count])
          ]);
          b.addEventListener('click', () => {
            const i = st.layers.indexOf(lid);
            if (i >= 0) st.layers.splice(i, 1); else st.layers.push(lid);
            api.setLayers(st.layers);
            b.setAttribute('aria-checked', on() ? 'true' : 'false');
            b.querySelector('.capa-check').textContent = on() ? '✓' : '';
            capasCount.textContent = String(st.layers.length);
            refreshLegend(); refreshDockMeta(); rebuildTimeline();
          });
          m.appendChild(b);
        });
        m.appendChild(el('p', { class: 'pmenu-note' }, ['Las capas se suman sobre el mapa nacional; al entrar a una provincia se muestran sus unidades.']));
      }, 'pmenu-capas');
    });
    const vistaRow = el('div', { class: 'vista2' }, [
      el('span', { class: 'vista2-k' }, ['Vista']),
      el('div', { class: 'vista2-tabs' }, P.PRESETS.map(pr => {
        const b = el('button', { class: 'vista2-tab' + (pr.id === st.vista ? ' active' : ''), type: 'button', title: pr.q }, [pr.label]);
        b.addEventListener('click', () => pickVista(pr.id));
        vistaBtns[pr.id] = b; return b;
      })),
      capasWrap
    ]);
    const vdLbl = el('span', { class: 'vd-lbl' }, [P.PRESETS.find(p => p.id === st.vista).label]);
    const vistaDropBtn = el('button', { class: 'vista-drop', type: 'button', 'aria-haspopup': 'menu' }, [el('span', { class: 'vd-k' }, ['Vista']), vdLbl, el('span', { class: 'caret' }, ['▾'])]);
    const vistaDropWrap = el('div', { class: 'anchor' }, [vistaDropBtn]);
    vistaDropBtn.addEventListener('click', () => {
      popover(vistaDropBtn, (m) => {
        P.PRESETS.forEach(pr => {
          const cur = pr.id === st.vista;
          const b = el('button', { type: 'button', role: 'menuitemradio', 'aria-checked': cur ? 'true' : 'false', title: pr.q }, [el('span', { class: 'capa-check' }, [cur ? '✓' : '']), el('span', null, [pr.label])]);
          b.addEventListener('click', () => { closeMenu(); pickVista(pr.id); vistaDropBtn.focus(); });
          m.appendChild(b);
        });
      });
    });

    /* ---------- KPIs ---------- */
    const kpiWrap = el('div', { class: 'kchips' + (layout === 'C' ? ' vert' : '') });
    function renderKpis() {
      kpiWrap.innerHTML = '';
      P.VISTAS[st.vista].metrics.forEach(mid => {
        const m = P.METRICS[mid];
        const b = el('button', {
          class: 'kchip' + (mid === st.base ? ' active' : ''), type: 'button',
          title: 'Pintar el mapa por ' + m.label.toLowerCase(), 'aria-pressed': mid === st.base ? 'true' : 'false'
        }, [el('b', null, [m.natl]), el('span', null, [m.short]), m.delta ? el('i', { class: 'kdelta' }, [m.delta.d]) : null]);
        b.addEventListener('click', () => { st.base = mid; api.setBase(mid); renderKpis(); refreshLegend(); rebuildTimeline(); rebuildStats(); refreshCounts(); });
        kpiWrap.appendChild(b);
      });
    }

    /* ---------- alcance ---------- */
    const scopeLbl = el('span', null, ['Nacional']);
    const scopePill = el('button', { class: 'scope-pill', type: 'button', 'aria-haspopup': 'menu' }, [el('span', { class: 'scope-pin' }, ['◉']), scopeLbl, el('span', { class: 'caret' }, ['▾'])]);
    const scopeWrap = el('div', { class: 'anchor' }, [scopePill]);
    scopePill.addEventListener('click', () => {
      popover(scopePill, (m) => {
        m.appendChild(el('div', { class: 'pmenu-h' }, ['Jurisdicción']));
        const mk = (code, name) => {
          const cur = (st.scope || null) === code;
          const b = el('button', { type: 'button', role: 'menuitemradio', 'aria-checked': cur ? 'true' : 'false' }, [el('span', { class: 'capa-check' }, [cur ? '✓' : '']), el('span', null, [name])]);
          b.addEventListener('click', () => { closeMenu(); if (code) api.drill(code); else api.reset(); scopePill.focus(); });
          return b;
        };
        m.appendChild(mk(null, 'Nacional (todo el país)'));
        P.GEO.provinces.slice().sort((a, b) => a.name.localeCompare(b.name, 'es')).forEach(p => m.appendChild(mk(p.code, p.name)));
        m.appendChild(el('p', { class: 'pmenu-note' }, ['También podés hacer click en una provincia del mapa.']));
      }, 'pmenu-scope');
    });

    /* ---------- período ---------- */
    const segBtns = {};
    const moreBtn = el('button', { class: 'seg-more', type: 'button', 'aria-haspopup': 'menu' }, ['▾ más']);
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Período' }, PERIODS.map(pd => {
      const b = el('button', { class: pd.id === st.period.id ? 'active' : '', type: 'button' }, [pd.l]);
      b.addEventListener('click', () => setPeriod(pd));
      segBtns[pd.id] = b; return b;
    }));
    const segWrap = el('div', { class: 'anchor seg-wrap' }, [seg, moreBtn]);
    moreBtn.addEventListener('click', () => {
      popover(moreBtn, (m) => {
        MORE_PERIODS.forEach(pd => {
          const b = el('button', { type: 'button', role: 'menuitemradio', 'aria-checked': st.period.id === pd.id ? 'true' : 'false' }, [el('span', { class: 'capa-check' }, [st.period.id === pd.id ? '✓' : '']), el('span', null, [pd.l])]);
          b.addEventListener('click', () => { closeMenu(); if (pd.id === 'custom') { toast('Rango personalizado: disponible en la próxima iteración.'); return; } setPeriod(pd, true); moreBtn.focus(); });
          m.appendChild(b);
        });
      });
    });
    function setPeriod(pd, fromMore) {
      st.period = pd;
      Object.values(segBtns).forEach(b => b.classList.remove('active'));
      if (segBtns[pd.id]) segBtns[pd.id].classList.add('active');
      moreBtn.classList.toggle('active', !!fromMore);
      moreBtn.textContent = fromMore ? pd.l + ' ▾' : '▾ más';
      refreshCounts(); refreshDockMeta(); rebuildRegistros();
    }

    /* ---------- acciones ---------- */
    const savedBtn = el('button', { class: 'op-btn sm', type: 'button', 'aria-haspopup': 'menu' }, ['Vistas guardadas']);
    const savedWrap = el('div', { class: 'anchor' }, [savedBtn]);
    savedBtn.addEventListener('click', () => {
      popover(savedBtn, (m) => {
        const mk = (label, apply) => { const b = el('button', { type: 'button' }, [label]); b.addEventListener('click', () => { closeMenu(); apply(); }); return b; };
        m.appendChild(mk('Bienestar · Córdoba · 90 días', () => { pickVista('bienestar'); api.drill('CORDOBA'); setPeriod(PERIODS[2]); }));
        m.appendChild(mk('Brotes activos · Nacional · 30 días', () => { pickVista('brotes'); api.reset(); setPeriod(PERIODS[1]); }));
        m.appendChild(el('div', { class: 'pmenu-sep' }));
        m.appendChild(mk('Guardar vista actual…', () => toast('Vista guardada como borrador.')));
      });
    });
    const actions = el('div', { class: 'ctrl-actions' + (layout === 'C' ? ' col' : '') }, [
      el('button', { class: 'op-btn sm', type: 'button', onclick: () => { const link = 'mimar.gob.ar/panorama?vista=' + st.vista + '&alcance=' + (st.scope || 'nacional') + '&periodo=' + st.period.id; if (navigator.clipboard) navigator.clipboard.writeText('https://' + link).catch(() => {}); toast('Enlace copiado: ' + link); } }, ['Copiar vista']),
      savedWrap,
      el('button', { class: 'op-btn sm', type: 'button', onclick: () => toast('Exportando PNG del mapa… (demo)') }, ['Exportar PNG'])
    ]);

    /* ---------- mapa + leyenda ---------- */
    const mapHost = el('div', { class: 'map-host' });
    const backBtn = el('button', { class: 'back-btn map-back', type: 'button', style: 'display:none' }, ['← Volver a Nacional']);
    backBtn.addEventListener('click', () => api.reset());
    const zoom = el('div', { class: 'zoom-ctrls map-tr' }, [el('button', { class: 'zoom-btn', type: 'button', 'aria-label': 'Acercar' }, ['+']), el('button', { class: 'zoom-btn', type: 'button', 'aria-label': 'Alejar' }, ['−'])]);
    const legend = el('div', { class: 'legend-line' });
    function refreshLegend() {
      const m = P.METRICS[st.base];
      legend.innerHTML = '';
      const ramp = el('span', { class: 'ramp', 'aria-hidden': 'true' });
      for (let i = 0; i < 5; i++) { const sw = el('i'); sw.style.background = P.fillFor(st.base, m.type === 'div' ? 25 + i * 17 : (P.SEQ_MAX[st.base] || 10) * i / 4); ramp.appendChild(sw); }
      legend.append(el('b', null, [m.type === 'div' ? m.short + ' (% vs meta)' : 'Eventos por unidad']), ramp);
      st.layers.forEach(lid => { const L = P.POINT_LAYERS[lid]; const d = el('span', { class: 'lg-pt' }); const dot = el('i'); dot.style.background = L.color; d.append(dot, document.createTextNode(L.label)); legend.appendChild(d); });
      legend.appendChild(el('span', { class: 'kpill', title: 'Unidades con menos de 5 casos: valor suprimido por k-anonimato (Ley 25.326)' }, ['⊘ k<5 protegido']));
    }
    const mapWrap = el('div', { class: 'map-wrap2' }, [mapHost, backBtn, zoom, legend]);

    /* ---------- dock (bottom / float / side) ---------- */
    const dockMode = layout === 'C' ? 'float' : (layout === 'D' ? 'side' : 'bottom');
    const tabDefs = [['registros', 'Registros'], ['stats', 'Estadísticas'], ['timeline', 'Línea de tiempo']];
    const cntEl = el('span', { class: 'cnt' }, ['267']);
    const cntSide = el('span', { class: 'cnt' }, ['267']);
    const dockTabs = {};
    const dockToggle = el('button', { class: 'op-btn sm', type: 'button' }, ['▴ Expandir']);
    const dockMeta = el('span', { class: 'dock2-scope' }, ['']);
    const bar = el('div', { class: 'dock2-bar' }, [
      el('span', { class: 'dock2-grip', 'aria-hidden': 'true' }, ['≡']),
      ...tabDefs.map(([id, lbl]) => {
        const b = el('button', { class: 'dock2-tab' + (id === st.tab ? ' active' : ''), type: 'button' }, [lbl, id === 'registros' ? cntEl : null]);
        b.addEventListener('click', () => { st.tab = id; st.dockOpen = true; syncDock(); });
        dockTabs[id] = b; return b;
      }),
      el('div', { class: 'dock2-meta' }, [dockMeta, el('button', { class: 'op-btn sm dock-csv', type: 'button', onclick: () => toast('Exportando CSV de ' + countFor(st.scope, st.base, st.period.f) + ' registros… (demo)') }, ['Exportar CSV']), dockToggle])
    ]);
    const paneReg = el('div', { class: 'dock2-pane active' });
    const paneStats = el('div', { class: 'dock2-pane' });
    const paneTl = el('div', { class: 'dock2-pane' });
    const body = el('div', { class: 'dock2-body' }, [paneReg, paneStats, paneTl]);
    /* tira vertical (solo side, colapsado) */
    const stripTabs = {};
    const strip = el('div', { class: 'side-strip' }, [
      el('button', { class: 'strip-open', type: 'button', 'aria-label': 'Expandir panel', title: 'Expandir panel' }, ['◂']),
      ...tabDefs.map(([id, lbl]) => {
        const b = el('button', { class: 'strip-tab' + (id === st.tab ? ' active' : ''), type: 'button' }, [el('span', { class: 'strip-lbl' }, [lbl]), id === 'registros' ? cntSide : null]);
        b.addEventListener('click', () => { st.tab = id; st.dockOpen = true; syncDock(); });
        stripTabs[id] = b; return b;
      })
    ]);
    strip.querySelector('.strip-open').addEventListener('click', () => { st.dockOpen = true; syncDock(); });
    const dock = el('div', { class: 'dock2 collapsed ' + dockMode }, dockMode === 'side' ? [strip, bar, body] : [bar, body]);
    dockToggle.addEventListener('click', () => { st.dockOpen = !st.dockOpen; syncDock(); });
    function syncDock() {
      dock.classList.toggle('collapsed', !st.dockOpen);
      dockToggle.textContent = dockMode === 'side' ? (st.dockOpen ? 'Colapsar ▸' : '◂') : (st.dockOpen ? '▾ Colapsar' : '▴ Expandir');
      Object.entries(dockTabs).forEach(([id, b]) => b.classList.toggle('active', id === st.tab));
      Object.entries(stripTabs).forEach(([id, b]) => b.classList.toggle('active', id === st.tab));
      [['registros', paneReg], ['stats', paneStats], ['timeline', paneTl]].forEach(([id, p]) => p.classList.toggle('active', id === st.tab));
    }

    /* --- panes --- */
    function unitNames() {
      if (st.scope) return LOCS[st.scope] || LOCS.default;
      return P.GEO.provinces.slice().sort((a, b) => P.PVAL[b.code][st.base] - P.PVAL[a.code][st.base]).slice(0, 8).map(p => p.name);
    }
    function rebuildRegistros() {
      const V = P.VISTAS[st.vista];
      const names = unitNames();
      const rows = names.map((n, i) => {
        const prot = i === 4;
        return el('tr', null, [
          el('td', { class: 'num' }, [DATES[i % DATES.length]]),
          el('td', prot ? { class: 'mute-td' } : null, [n]),
          el('td', null, [V.baseLabel]),
          el('td', null, [prot ? '—' : (i % 2 ? 'Denuncia activa · asignada' : 'Denuncia activa · triage pendiente')]),
          el('td', null, [prot ? el('span', { class: 'st-pill prot' }, ['Protegido (k<5)']) : el('span', { class: 'st-pill ' + ESTADOS[i % ESTADOS.length][1] }, [ESTADOS[i % ESTADOS.length][0]])])
        ]);
      });
      paneReg.innerHTML = '';
      paneReg.appendChild(el('table', { class: 'dt' }, [
        el('thead', null, [el('tr', null, ['Fecha', 'Unidad', 'Capa', 'Detalle', 'Estado'].map(h => el('th', null, [h])))]),
        el('tbody', null, rows)
      ]));
    }
    function highlight(code) {
      if (!api || st.scope) return;
      api.el.querySelectorAll('.prov').forEach(p => { p.style.opacity = (code == null || p.dataset.code === code) ? 1 : 0.18; });
    }
    function rebuildStats() {
      const top = P.GEO.provinces.slice().sort((a, b) => P.PVAL[b.code][st.base] - P.PVAL[a.code][st.base]).slice(0, 7);
      const max = P.PVAL[top[0].code][st.base];
      const m = P.METRICS[st.base];
      const rows = top.map((p, i) => {
        const v = P.PVAL[p.code][st.base];
        const tr = el('tr', { class: 'hoverable', tabindex: '0' }, [
          el('td', { class: 'num rank' }, [String(i + 1)]),
          el('td', null, [p.name]),
          el('td', { class: 'num' }, [P.fmtVal(st.base, v)]),
          el('td', { class: 'bar-td' }, [el('div', { class: 'bar' }, [(() => { const f = el('i'); f.style.width = Math.round(v / max * 100) + '%'; return f; })()])]),
          el('td', { class: 'mute-td' }, [i % 3 === 0 ? '▲ sube' : (i % 3 === 1 ? '▼ baja' : '· estable')])
        ]);
        tr.addEventListener('mouseenter', () => highlight(p.code));
        tr.addEventListener('mouseleave', () => { if (!st.scope) api.repaint(); });
        tr.addEventListener('click', () => api.drill(p.code));
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') api.drill(p.code); });
        return tr;
      });
      rows.push(el('tr', null, [
        el('td', { class: 'num rank' }, ['—']), el('td', { class: 'mute-td' }, ['3 jurisdicciones']),
        el('td', null, [el('span', { class: 'st-pill prot' }, ['Protegido (k<5)'])]),
        el('td', { class: 'bar-td mute-td' }, ['suprimido por k-anonimato']), el('td', null, [''])
      ]));
      paneStats.innerHTML = '';
      paneStats.appendChild(el('table', { class: 'dt' }, [
        el('thead', null, [el('tr', null, [el('th', null, ['#']), el('th', null, ['Jurisdicción']), el('th', null, [m.short]), el('th', null, ['']), el('th', null, ['Tendencia'])])]),
        el('tbody', null, rows)
      ]));
      paneStats.appendChild(el('p', { class: 'dock2-note' }, ['Pasá el mouse por una fila para ubicarla en el mapa · click para entrar a la provincia.']));
    }
    function rebuildTimeline() {
      paneTl.innerHTML = '';
      paneTl.appendChild(P.scrubber({ compact: true, detail: dockMode !== 'side', available: P.isTemporal(st.base, st.layers) }));
    }

    /* ---------- refrescos ---------- */
    function refreshCounts() { const c = countFor(st.scope, st.base, st.period.f).toLocaleString('es-AR'); cntEl.textContent = c; cntSide.textContent = c; }
    function refreshDockMeta() {
      dockMeta.textContent = (st.scopeName || 'Nacional') + ' · ' + (st.period.id === 'ytd' || st.period.id === '3a' || st.period.id === '5a' ? st.period.l.toLowerCase() : 'últimos ' + st.period.l) + ' · ' + st.layers.length + ' ' + (st.layers.length === 1 ? 'capa' : 'capas');
    }
    function pickVista(id) {
      st.vista = id; const V = P.VISTAS[id];
      st.base = V.base; st.layers = V.layers.slice();
      Object.entries(vistaBtns).forEach(([k, b]) => b.classList.toggle('active', k === id));
      vdLbl.textContent = P.PRESETS.find(p => p.id === id).label;
      capasCount.textContent = String(st.layers.length);
      api.setBase(st.base); api.setLayers(st.layers);
      renderKpis(); refreshLegend(); refreshDockMeta(); refreshCounts();
      rebuildRegistros(); rebuildStats(); rebuildTimeline();
    }

    /* ---------- ensamblaje por layout ---------- */
    let main;
    if (layout === 'A') {
      const ctrl = el('div', { class: 'ctrl' }, [kpiWrap, el('span', { class: 'ctrl-sep' }), scopeWrap, el('span', { class: 'ctrl-sep' }), segWrap, actions]);
      main = el('div', { class: 'v2-main' }, [masthead, vistaRow, ctrl, mapWrap, dock]);
    } else if (layout === 'B') {
      const bar1 = el('div', { class: 'ctrl bar1' }, [vistaDropWrap, capasWrap, el('span', { class: 'ctrl-sep' }), kpiWrap, el('span', { class: 'ctrl-sep' }), scopeWrap, el('span', { class: 'ctrl-sep' }), segWrap, actions]);
      main = el('div', { class: 'v2-main' }, [bar1, mapWrap, dock]);
    } else if (layout === 'C') {
      const clTL = el('div', { class: 'float-card cluster-tl' }, [el('div', { class: 'fc-row' }, [vistaDropWrap, capasWrap]), kpiWrap]);
      const clTR = el('div', { class: 'float-card cluster-tr' }, [el('div', { class: 'fc-row' }, [scopeWrap, segWrap]), actions]);
      mapWrap.append(clTL, clTR, dock);
      main = el('div', { class: 'v2-main' }, [masthead, mapWrap]);
    } else { /* D */
      const bar1 = el('div', { class: 'ctrl bar1' }, [vistaDropWrap, capasWrap, el('span', { class: 'ctrl-sep' }), kpiWrap, el('span', { class: 'ctrl-sep' }), scopeWrap, el('span', { class: 'ctrl-sep' }), segWrap, actions]);
      const mid = el('div', { class: 'mid' }, [mapWrap, dock]);
      main = el('div', { class: 'v2-main' }, [bar1, mid]);
    }

    const grid = el('div', { class: 'act-grid lay-' + layout }, [rail, main]);
    root.appendChild(grid);
    root.appendChild(toastEl);

    api = P.buildMap(mapHost, {
      base: st.base, layers: st.layers,
      onScope: (code, p) => {
        st.scope = code; st.scopeName = p ? p.name : null;
        scopeLbl.textContent = p ? p.name : 'Nacional';
        backBtn.style.display = code ? '' : 'none';
        refreshCounts(); refreshDockMeta(); rebuildRegistros(); rebuildStats();
      },
      onFeature: (f) => { toast(f.supp ? 'Unidad protegida: menos de 5 eventos (k-anonimato).' : 'Unidad con ' + f.val + ' registros en el período.'); }
    });

    renderKpis(); refreshLegend(); refreshDockMeta(); refreshCounts();
    rebuildRegistros(); rebuildStats(); rebuildTimeline(); syncDock();
    api.drill('CORDOBA');
  }

  window.PANO_V2L = { mount };
})();
