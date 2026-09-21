/* ════════════════════════════════════════════════════════════
   UNIVERSO — interface: painel, formulários, busca, dados
   ════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

var $ = function (s) { return document.querySelector(s); };

function el(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) { return ''; }
}

var COLORS = ['#7aa2ff', '#6fd3ff', '#5eead4', '#a7f3a0', '#ffe08a', '#f6c177',
  '#ff9ecd', '#ff8fa3', '#c084fc', '#a78bfa', '#e6eeff', '#93c5fd', '#fca5a5', '#fdba74'];

/* mesmo ponto de corte do CSS — uma fonte de verdade só */
var MOBILE = window.matchMedia('(max-width: 760px)');

var UI = {
  toastTimer: null,

  /* ═══════════ BOOT ═══════════ */
  init: function () {
    var self = this;
    U.load();
    U.onChange = function () { self.afterChange(); };

    Scene.init();
    Scene.onSelect = function (n) { self.showPanel(n); };
    Scene.onView = function () { self.buildCrumbs(); };

    $('#univTitle').textContent = U.data.title;
    this.buildCrumbs();
    this.bind();

    // se já tinha dado salvo, o intro continua — o Big Bang é sempre a entrada
  },

  /* ═══════════ CAMINHO (migalhas) ═══════════ */
  buildCrumbs: function () {
    var self = this, wrap = $('#crumbs');
    if (!wrap) return;
    var v = Scene.viewNode();
    wrap.innerHTML = '';
    if (!v) return;

    if (v.parent) {
      var back = el('button', 'crumb-back', '←&nbsp; Voltar');
      back.addEventListener('click', function () { Scene.up(); });
      wrap.appendChild(back);
    }

    var trail = el('div', 'crumb-trail');
    trail.appendChild(el('span', 'inside', 'dentro de'));
    var path = U.path(v);
    path.forEach(function (n, i) {
      if (i) trail.appendChild(el('span', 'sep', '›'));
      if (i === path.length - 1) {
        trail.appendChild(el('span', 'cur', esc(n.name)));
      } else {
        var a = el('a', null, esc(n.name));
        a.addEventListener('click', function () { Scene.enter(n.id, null); });
        trail.appendChild(a);
      }
    });
    wrap.appendChild(trail);
  },

  afterChange: function () {
    Scene.rebuild();
    this.buildCrumbs();
    $('#univTitle').textContent = U.data.title;
    if (Scene.selected && !this.isMobile()) {
      var n = U.node(Scene.selected);
      if (n) this.renderPanel(n); else this.showPanel(null);
    }
  },

  bind: function () {
    var self = this;

    /* ── Big Bang ── */
    var intro = $('#intro');
    intro.addEventListener('click', function () {
      if (intro.classList.contains('boom')) return;
      intro.classList.add('boom');
      Scene.bigBang();
      setTimeout(function () { document.body.classList.add('live'); }, 900);
      setTimeout(function () { intro.classList.add('gone'); }, 700);
      setTimeout(function () { intro.style.display = 'none'; }, 1800);
    });

    /* ── topo ── */
    $('#btnNew').addEventListener('click', function () {
      var v = Scene.viewNode();
      self.nodeForm(null, Scene.selected || (v ? v.id : null));
    });

    /* menu discreto no nome do universo */
    var menu = $('#brandMenu');
    $('#brand').addEventListener('click', function (e) {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    menu.addEventListener('click', function (e) {
      var mi = e.target.closest('.mi');
      if (!mi) return;
      menu.classList.remove('open');
      var act = mi.dataset.act;
      if (act === 'rename') self.renameUniverse();
      else if (act === 'types') self.typesModal();
      else if (act === 'data') self.dataModal();
      else if (act === 'help') self.helpModal();
    });
    document.addEventListener('click', function () { menu.classList.remove('open'); });

    /* girar o celular ou redimensionar a janela mantém as duas regras coerentes */
    var onSize = function () {
      if (self.isMobile()) $('#panel').classList.remove('open');
      else if (Scene.selected) self.showPanel(U.node(Scene.selected));
    };
    if (MOBILE.addEventListener) MOBILE.addEventListener('change', onSize);
    else if (MOBILE.addListener) MOBILE.addListener(onSize);

    /* ── controles ── */
    $('#cZoomIn').addEventListener('click', function () { Scene.zoomBy(1.45); });
    $('#cZoomOut').addEventListener('click', function () { Scene.zoomBy(1 / 1.45); });
    $('#cReset').addEventListener('click', function () {
      var root = (Scene.kids['__root__'] || [])[0];
      if (root && (Scene.viewNode() || {}).id !== root.id) Scene.enter(root.id, null);
      else Scene.resetView();
    });
    $('#cPause').addEventListener('click', function () {
      Scene.paused = !Scene.paused;
      this.classList.toggle('on', Scene.paused);
      this.textContent = Scene.paused ? '▶' : '❚❚';
      this.title = Scene.paused ? 'Retomar órbitas' : 'Pausar órbitas';
    });

    /* ── teclado ── */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if ($('.backdrop')) self.closeModal();
        else if (Scene.connectFrom) self.cancelConnect();
        else if (Scene.selected) Scene.select(null);
        else Scene.up();
        return;
      }
      if (e.key === 'Backspace' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
        e.preventDefault(); Scene.up(); return;
      }
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (typing) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        var v = Scene.viewNode();
        self.nodeForm(null, Scene.selected || (v ? v.id : null));
      }
      if (e.key === ' ') {
        e.preventDefault();
        $('#cPause').click();
      }
    });
  },

  /* ═══════════ TOAST ═══════════ */
  toast: function (msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  },

  /* leva o universo até um astro.
     Se ele tem um sistema dentro, entramos nele (sem abrir painel);
     se não tem, entramos no nível do pai e abrimos o painel dele. */
  goTo: function (id) {
    var n = U.node(id);
    if (!n) return;
    var hasKids = U.children(id).length > 0;
    var view = hasKids ? id : (n.parent || id);
    var sel = hasKids ? null : id;
    if ((Scene.viewNode() || {}).id !== view) {
      Scene.enter(view, sel);
    } else {
      Scene.select(sel);
      if (sel && Scene.vis[id]) Scene.focus(n);
    }
  },

  /* ═══════════ PAINEL ═══════════ */
  isMobile: function () { return MOBILE.matches; },

  showPanel: function (n) {
    var p = $('#panel');
    // no celular o painel tomaria a tela inteira — o astro só reage e pronto
    if (!n || this.isMobile()) { p.classList.remove('open'); return; }
    this.renderPanel(n);
    p.classList.add('open');
  },

  renderPanel: function (n) {
    var self = this, p = $('#panel');
    var ty = U.type(n.type);
    var kids = U.children(n.id);
    var links = U.linksOf(n.id);
    var path = U.path(n);

    p.innerHTML = '';

    /* cabeçalho */
    var head = el('div', 'p-head');
    var close = el('button', 'p-close', '✕');
    close.addEventListener('click', function () { Scene.select(null); });
    var fav = el('button', 'fav-btn' + (n.fav ? ' on' : ''), '♥');
    fav.title = 'Marcar como favorito';
    fav.addEventListener('click', function () { U.update(n.id, { fav: !n.fav }); });
    head.appendChild(close);
    head.appendChild(fav);

    head.appendChild(el('div', 'p-type',
      '<span class="dot" style="background:' + ty.color + ';color:' + ty.color + '"></span>' + esc(ty.name)));
    head.appendChild(el('h2', 'p-title', esc(n.name)));

    if (path.length > 1) {
      var bc = el('div', 'p-path');
      path.slice(0, -1).forEach(function (a, i) {
        var link = el('a', null, esc(a.name));
        link.addEventListener('click', function () { self.goTo(a.id); });
        bc.appendChild(link);
        bc.appendChild(document.createTextNode(' › '));
      });
      bc.appendChild(document.createTextNode(n.name));
      head.appendChild(bc);
    }
    p.appendChild(head);

    /* corpo */
    var body = el('div', 'p-body');

    if (n.img) {
      var img = el('img', 'p-img');
      img.src = n.img;
      img.alt = n.name;
      img.onerror = function () { img.remove(); };
      body.appendChild(img);
    }

    var s1 = el('div', 'p-sec');
    s1.appendChild(el('h4', null, 'Sobre'));
    s1.appendChild(n.desc
      ? el('div', 'p-desc', esc(n.desc))
      : el('div', 'p-empty', 'Sem anotações ainda. Clique em "Editar" e escreva o que você sabe.'));
    body.appendChild(s1);

    if (n.tags && n.tags.length) {
      var s2 = el('div', 'p-sec');
      s2.appendChild(el('h4', null, 'Marcadores'));
      var tg = el('div', 'tags');
      n.tags.forEach(function (t) { tg.appendChild(el('span', 'tag', esc(t))); });
      s2.appendChild(tg);
      body.appendChild(s2);
    }

    /* filhos */
    var s3 = el('div', 'p-sec');
    s3.appendChild(el('h4', null, 'Orbitando aqui (' + kids.length + ')'));
    if (kids.length) {
      var lst = el('div', 'orb-list');
      kids.forEach(function (c) {
        var cty = U.type(c.type);
        var row = el('div', 'orb',
          '<span class="dot" style="background:' + cty.color + ';color:' + cty.color + '"></span>' +
          '<span class="nm">' + esc(c.name) + (c.fav ? ' ♥' : '') + '</span>' +
          '<span class="kind">' + esc(cty.name) + '</span>');
        row.addEventListener('click', function () { self.goTo(c.id); });
        lst.appendChild(row);
      });
      s3.appendChild(lst);
    } else {
      s3.appendChild(el('div', 'p-empty', 'Nada orbita este astro ainda.'));
    }
    var addKid = el('button', 'btn sm', '+ Adicionar aqui');
    addKid.style.marginTop = '9px';
    addKid.addEventListener('click', function () { self.nodeForm(null, n.id); });
    s3.appendChild(addKid);
    body.appendChild(s3);

    /* conexões */
    var s4 = el('div', 'p-sec');
    s4.appendChild(el('h4', null, 'Conexões (' + links.length + ')'));
    if (links.length) {
      var l2 = el('div', 'orb-list');
      links.forEach(function (lk) {
        var o = U.node(U.other(lk, n.id));
        if (!o) return;
        var oty = U.type(o.type);
        var row = el('div', 'orb',
          '<span class="dot" style="background:' + oty.color + ';color:' + oty.color + '"></span>' +
          '<span class="nm">' + esc(o.name) + '</span>' +
          '<span class="kind">' + esc(lk.label || oty.name) + '</span>');
        var x = el('button', 'x', '✕');
        x.title = 'Remover conexão';
        x.addEventListener('click', function (ev) {
          ev.stopPropagation();
          U.unlink(lk.id);
          self.toast('conexão desfeita');
        });
        row.appendChild(x);
        row.addEventListener('click', function () { self.goTo(o.id); });
        l2.appendChild(row);
      });
      s4.appendChild(l2);
    } else {
      s4.appendChild(el('div', 'p-empty', 'Sem conexões com outros astros.'));
    }
    var conn = el('button', 'btn sm', '⇄ Conectar a outro astro');
    conn.style.marginTop = '9px';
    conn.addEventListener('click', function () { self.startConnect(n.id); });
    s4.appendChild(conn);
    body.appendChild(s4);

    /* ações */
    var acts = el('div', 'p-actions');
    var isView = (Scene.viewNode() || {}).id === n.id;

    if (!isView && kids.length) {
      var bIn = el('button', 'btn primary', '▸ Entrar em ' + esc(n.name));
      bIn.addEventListener('click', function () { Scene.select(null); Scene.enter(n.id, null); });
      acts.appendChild(bIn);
    } else if (isView && n.parent) {
      var bUp = el('button', 'btn', '← Voltar para ' + esc(U.node(n.parent).name));
      bUp.addEventListener('click', function () { Scene.up(); });
      acts.appendChild(bUp);
    }

    var bEdit = el('button', 'btn' + (isView || !kids.length ? ' primary' : ''), 'Editar');
    bEdit.addEventListener('click', function () { self.nodeForm(n); });
    var bFocus = el('button', 'btn', 'Focar');
    bFocus.addEventListener('click', function () { Scene.focus(n, Math.max(Scene.cam.tz, 1.1)); });
    var bDel = el('button', 'btn danger', 'Excluir');
    bDel.addEventListener('click', function () { self.confirmDelete(n); });
    acts.appendChild(bEdit); acts.appendChild(bFocus); acts.appendChild(bDel);
    body.appendChild(acts);

    body.appendChild(el('div', 'meta-line', 'criado em ' + fmtDate(n.created)));
    p.appendChild(body);
  },

  /* ═══════════ MODAL BÁSICO ═══════════ */
  modal: function (title, bodyEl, buttons) {
    this.closeModal();
    var back = el('div', 'backdrop');
    var m = el('div', 'modal');
    var head = el('div', 'm-head', '<h3>' + esc(title) + '</h3>');
    var x = el('button', 'p-close', '✕');
    x.style.position = 'static';
    x.addEventListener('click', function () { UI.closeModal(); });
    head.appendChild(x);
    var body = el('div', 'm-body');
    body.appendChild(bodyEl);
    var foot = el('div', 'm-foot');
    (buttons || []).forEach(function (b) {
      var btn = el('button', 'btn ' + (b.cls || ''), b.label);
      btn.addEventListener('click', b.fn);
      foot.appendChild(btn);
    });
    m.appendChild(head); m.appendChild(body); m.appendChild(foot);
    back.appendChild(m);
    back.addEventListener('mousedown', function (e) { if (e.target === back) UI.closeModal(); });
    $('#modalRoot').appendChild(back);
    setTimeout(function () {
      var f = m.querySelector('input,textarea,select');
      if (f) f.focus();
    }, 60);
    return m;
  },
  closeModal: function () { $('#modalRoot').innerHTML = ''; },

  field: function (label, inputEl, hint) {
    var l = el('label', 'f');
    l.appendChild(el('span', null, label));
    l.appendChild(inputEl);
    if (hint) l.appendChild(el('div', 'hintline', hint));
    return l;
  },

  /* ═══════════ FORMULÁRIO DE ASTRO ═══════════ */
  nodeForm: function (node, presetParent) {
    var self = this;
    var isNew = !node;
    var box = el('div');

    // nome
    var name = el('input', 'inp');
    name.type = 'text';
    name.placeholder = 'ex.: Jujutsu Kaisen';
    name.value = node ? node.name : '';
    box.appendChild(this.field('Nome', name));

    // tipo + órbita
    var row = el('div', 'row2');

    var typeSel = el('select', 'inp');
    U.data.types.forEach(function (t) {
      var o = el('option', null, esc(t.name));
      o.value = t.id;
      typeSel.appendChild(o);
    });
    var optNew = el('option', null, '＋ criar novo tipo…');
    optNew.value = '__new__';
    typeSel.appendChild(optNew);
    typeSel.value = node ? node.type : (presetParent ? this.guessType(presetParent) : 'galaxia');
    typeSel.addEventListener('change', function () {
      if (this.value === '__new__') {
        var prev = node ? node.type : 'planeta';
        this.value = prev;
        self.typeForm(null, function (t) {
          self.nodeForm(node, presetParent);
          setTimeout(function () {
            var s = document.querySelector('.modal select.inp');
            if (s) s.value = t.id;
          }, 40);
        });
      }
    });
    var f1 = this.field('Tipo de astro', typeSel);
    f1.style.margin = '0';
    row.appendChild(f1);

    var picker = this.buildPicker(node ? node.parent : (presetParent || null), node ? node.id : null);
    var f2 = this.field('Orbita ao redor de', picker.el);
    f2.style.margin = '0';
    row.appendChild(f2);
    box.appendChild(row);
    box.appendChild(el('div', 'hintline', 'Ex.: galáxia “Animes” › planeta “Nome do anime” › lua “Personagem”.'));
    box.appendChild(el('div', null, '<div style="height:14px"></div>'));

    // descrição
    var desc = el('textarea', 'inp');
    desc.placeholder = 'O que ela falou? Por que gosta? Detalhes, datas, lembranças…';
    desc.value = node ? node.desc : '';
    box.appendChild(this.field('Anotações', desc));

    // tags + imagem
    var tags = el('input', 'inp');
    tags.type = 'text';
    tags.placeholder = 'favorito, chorou, 2024';
    tags.value = node && node.tags ? node.tags.join(', ') : '';
    box.appendChild(this.field('Marcadores', tags, 'separe por vírgula'));

    var img = el('input', 'inp');
    img.type = 'text';
    img.placeholder = 'https://…';
    img.value = node ? node.img : '';
    box.appendChild(this.field('Imagem (link opcional)', img));

    // favorito
    var favWrap = el('label', 'f');
    var fav = el('input');
    fav.type = 'checkbox';
    fav.checked = node ? !!node.fav : false;
    fav.style.marginRight = '8px';
    var fl = el('div', null, '');
    fl.style.cssText = 'display:flex;align-items:center;font-size:13px;color:#c6d5f5;cursor:pointer';
    fl.appendChild(fav);
    fl.appendChild(document.createTextNode('Marcar como favorito ♥'));
    favWrap.appendChild(fl);
    box.appendChild(favWrap);

    function save(andAnother) {
      var nm = name.value.trim();
      if (!nm) { name.focus(); self.toast('dê um nome ao astro'); return; }
      var payload = {
        name: nm,
        type: typeSel.value,
        parent: picker.get(),
        desc: desc.value,
        tags: tags.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
        img: img.value.trim(),
        fav: fav.checked
      };
      if (isNew) {
        var created = U.add(payload);
        Scene.rebuild();
        if (andAnother) {
          self.closeModal();
          self.nodeForm(null, payload.parent);
          self.toast('“' + nm + '” criado ✦');
          return;
        }
        self.closeModal();
        self.goTo(created.id);
        self.toast('“' + nm + '” nasceu no universo ✦');
      } else {
        U.update(node.id, payload);
        Scene.rebuild();
        self.closeModal();
        self.renderPanel(U.node(node.id));
        self.toast('atualizado');
      }
    }

    name.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(false); });

    var btns = [{ label: 'Cancelar', cls: 'ghost', fn: function () { self.closeModal(); } }];
    if (isNew) btns.push({ label: 'Salvar e criar outro', fn: function () { save(true); } });
    btns.push({ label: isNew ? 'Criar astro' : 'Salvar', cls: 'primary', fn: function () { save(false); } });

    this.modal(isNew ? 'Novo astro' : 'Editar astro', box, btns);
  },

  /* sugere um tipo coerente com a profundidade do pai */
  guessType: function (parentId) {
    var d = Scene.depth[parentId];
    if (d === undefined) return 'galaxia';
    if (d === 0) return 'galaxia';
    if (d === 1) return 'planeta';
    return 'lua';
  },

  /* seletor de pai com busca */
  buildPicker: function (currentId, excludeId) {
    var wrap = el('div', 'picker');
    var inp = el('input', 'inp');
    inp.type = 'text';
    inp.placeholder = 'buscar astro…';
    inp.autocomplete = 'off';
    var list = el('div', 'picker-list');
    wrap.appendChild(inp); wrap.appendChild(list);

    var value = currentId || null;
    var cur = currentId ? U.node(currentId) : null;
    inp.value = cur ? cur.name : '— centro do universo —';

    function options(q) {
      q = (q || '').toLowerCase();
      var arr = U.data.nodes.filter(function (n) {
        if (excludeId && (n.id === excludeId || U.isDescendant(n.id, excludeId))) return false;
        return !q || n.name.toLowerCase().indexOf(q) >= 0;
      });
      arr.sort(function (a, b) { return (Scene.depth[a.id] || 0) - (Scene.depth[b.id] || 0); });
      return arr.slice(0, 40);
    }

    function render(q) {
      list.innerHTML = '';
      var none = el('div', 'pick', '<span>— centro do universo (raiz) —</span>');
      none.addEventListener('mousedown', function (e) {
        e.preventDefault();
        value = null; inp.value = '— centro do universo —'; list.classList.remove('open');
      });
      list.appendChild(none);
      options(q).forEach(function (n) {
        var ty = U.type(n.type);
        var path = U.path(n).slice(0, -1).map(function (x) { return x.name; }).join(' › ');
        var it = el('div', 'pick',
          '<span class="dot" style="width:8px;height:8px;border-radius:50%;background:' + ty.color + '"></span>' +
          '<span>' + esc(n.name) + '</span><span class="kind">' + esc(path || ty.name) + '</span>');
        it.addEventListener('mousedown', function (e) {
          e.preventDefault();
          value = n.id; inp.value = n.name; list.classList.remove('open');
        });
        list.appendChild(it);
      });
      list.classList.add('open');
    }

    inp.addEventListener('focus', function () { this.select(); render(''); });
    inp.addEventListener('input', function () { render(this.value); });
    inp.addEventListener('blur', function () {
      setTimeout(function () {
        list.classList.remove('open');
        var c = value ? U.node(value) : null;
        inp.value = c ? c.name : '— centro do universo —';
      }, 120);
    });

    return { el: wrap, get: function () { return value; } };
  },

  /* ═══════════ CONECTAR ═══════════ */
  startConnect: function (id) {
    Scene.connectFrom = id;
    Scene.canvas.classList.add('connecting');
    var b = $('#banner');
    b.innerHTML = '';
    b.appendChild(document.createTextNode('Clique no astro que se conecta a “' + U.node(id).name + '”'));
    var c = el('button', null, 'cancelar');
    c.addEventListener('click', function () { UI.cancelConnect(); });
    b.appendChild(c);
    b.classList.add('show');
    $('#panel').classList.remove('open');
  },
  cancelConnect: function () {
    Scene.connectFrom = null;
    Scene.canvas.classList.remove('connecting');
    $('#banner').classList.remove('show');
  },
  finishConnect: function (toId) {
    var from = Scene.connectFrom, self = this;
    this.cancelConnect();
    var box = el('div');
    var lab = el('input', 'inp');
    lab.type = 'text';
    lab.placeholder = 'ex.: mesmo autor, ela descobriu por causa disso…';
    box.appendChild(el('div', 'hintline',
      '<b style="color:#dbe6ff">' + esc(U.node(from).name) + '</b> ⇄ <b style="color:#dbe6ff">' + esc(U.node(toId).name) + '</b>'));
    box.appendChild(el('div', null, '<div style="height:12px"></div>'));
    box.appendChild(this.field('Rótulo da conexão (opcional)', lab));
    lab.addEventListener('keydown', function (e) { if (e.key === 'Enter') done(); });
    function done() {
      U.link(from, toId, lab.value.trim());
      self.closeModal();
      Scene.rebuild();
      self.goTo(from);
      self.toast('conectados ⇄');
    }
    this.modal('Nova conexão', box, [
      { label: 'Cancelar', cls: 'ghost', fn: function () { self.closeModal(); } },
      { label: 'Conectar', cls: 'primary', fn: done }
    ]);
  },

  /* ═══════════ EXCLUIR ═══════════ */
  confirmDelete: function (n) {
    var self = this;
    var kids = U.children(n.id).length;
    var box = el('div');
    box.appendChild(el('div', 'p-desc',
      'Excluir <b>' + esc(n.name) + '</b>?' +
      (kids ? '<br><br>Os ' + kids + ' astro(s) que orbitam aqui <b>não serão apagados</b> — eles sobem um nível e passam a orbitar ' +
        esc(n.parent ? U.node(n.parent).name : 'o centro do universo') + '.' : '')));
    this.modal('Excluir astro', box, [
      { label: 'Cancelar', cls: 'ghost', fn: function () { self.closeModal(); } },
      {
        label: 'Excluir', cls: 'danger', fn: function () {
          U.remove(n.id);
          Scene.rebuild();
          Scene.select(null);
          self.closeModal();
          self.toast('astro removido');
        }
      }
    ]);
  },

  /* ═══════════ TIPOS ═══════════ */
  typesModal: function () {
    var self = this;
    var box = el('div');
    box.appendChild(el('div', 'hintline',
      'Cada tipo é uma forma de corpo celeste. Crie quantos quiser — buraco negro, quasar, pulsar, o que você imaginar.'));
    box.appendChild(el('div', null, '<div style="height:14px"></div>'));
    var grid = el('div', 'type-grid');
    U.data.types.forEach(function (t) {
      var c = U.countOfType(t.id);
      var card = el('div', 'type-card',
        '<span class="dot" style="background:' + t.color + ';color:' + t.color + '"></span>' +
        '<span class="nm">' + esc(t.name) + '</span>');
      var tools = el('div', 'tools');
      var ed = el('button', null, '✎');
      ed.title = 'Editar';
      ed.addEventListener('click', function () { self.typeForm(t, function () { self.typesModal(); }); });
      tools.appendChild(ed);
      var dl = el('button', 'del', '✕');
      dl.title = c ? 'Em uso por ' + c + ' astro(s)' : 'Excluir tipo';
      dl.addEventListener('click', function () {
        if (!U.removeType(t.id)) { self.toast(c ? 'tipo em uso por ' + c + ' astro(s)' : 'não dá pra remover'); return; }
        self.typesModal();
        self.toast('tipo removido');
      });
      tools.appendChild(dl);
      card.appendChild(tools);
      grid.appendChild(card);
    });
    box.appendChild(grid);
    this.modal('Tipos de corpo celeste', box, [
      { label: 'Fechar', cls: 'ghost', fn: function () { self.closeModal(); } },
      { label: '+ Novo tipo', cls: 'primary', fn: function () { self.typeForm(null, function () { self.typesModal(); }); } }
    ]);
  },

  typeForm: function (t, done) {
    var self = this;
    var box = el('div');

    var name = el('input', 'inp');
    name.type = 'text';
    name.placeholder = 'ex.: Meteoro';
    name.value = t ? t.name : '';
    box.appendChild(this.field('Nome do tipo', name));

    var shape = t ? t.shape : 'star';
    var color = t ? t.color : COLORS[Math.floor(Math.random() * COLORS.length)];

    // formas
    var sg = el('div', 'shape-grid');
    function paint() {
      sg.querySelectorAll('.shape-opt').forEach(function (o) {
        o.classList.toggle('on', o.dataset.shape === shape);
        var cv = o.querySelector('canvas');
        UI.previewShape(cv, { shape: o.dataset.shape, color: color, size: 12 });
      });
    }
    U.SHAPES.forEach(function (s) {
      var o = el('div', 'shape-opt');
      o.dataset.shape = s.id;
      var cv = el('canvas');
      cv.width = 46; cv.height = 34;
      o.appendChild(cv);
      o.appendChild(document.createTextNode(s.label));
      o.addEventListener('click', function () { shape = s.id; paint(); });
      sg.appendChild(o);
    });
    box.appendChild(this.field('Forma', sg));

    // cores
    var sw = el('div', 'swatches');
    COLORS.forEach(function (c) {
      var b = el('div', 'sw' + (c === color ? ' on' : ''));
      b.style.background = c;
      b.dataset.c = c;
      b.addEventListener('click', function () {
        color = c;
        sw.querySelectorAll('.sw').forEach(function (x) { x.classList.toggle('on', x.dataset.c === c); });
        paint();
      });
      sw.appendChild(b);
    });
    var custom = el('input');
    custom.type = 'color';
    custom.value = color;
    custom.style.cssText = 'width:30px;height:26px;background:none;border:1px solid rgba(96,146,255,.3);border-radius:8px;cursor:pointer';
    custom.addEventListener('input', function () {
      color = this.value;
      sw.querySelectorAll('.sw').forEach(function (x) { x.classList.remove('on'); });
      paint();
    });
    sw.appendChild(custom);
    box.appendChild(this.field('Cor', sw));

    var size = el('input', 'inp');
    size.type = 'range';
    size.min = 5; size.max = 40; size.step = 1;
    size.value = t ? t.size : 16;
    size.style.padding = '6px';
    box.appendChild(this.field('Tamanho', size, 'estrelas pequenas, galáxias grandes'));

    paint();

    this.modal(t ? 'Editar tipo' : 'Novo tipo', box, [
      { label: 'Cancelar', cls: 'ghost', fn: function () { self.closeModal(); } },
      {
        label: 'Salvar', cls: 'primary', fn: function () {
          var nm = name.value.trim();
          if (!nm) { name.focus(); return; }
          var res;
          if (t) res = U.updateType(t.id, { name: nm, shape: shape, color: color, size: +size.value });
          else res = U.addType({ name: nm, shape: shape, color: color, size: +size.value });
          Scene.rebuild();
          self.closeModal();
          self.toast('tipo salvo');
          if (done) done(res);
        }
      }
    ]);
  },

  previewShape: function (cv, ty) {
    if (!cv) return;
    var old = Scene.ctx;
    var c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    Scene.ctx = c;
    try {
      Scene.drawBody({ id: 'prev' + ty.shape, _a: 0, name: '' }, ty, cv.width / 2, cv.height / 2, 7, false);
    } catch (e) {}
    Scene.ctx = old;
  },

  /* ═══════════ DADOS ═══════════ */
  dataModal: function () {
    var self = this;
    var box = el('div');

    var stats = el('div', 'stat-row');
    stats.innerHTML =
      '<div class="stat"><b>' + U.data.nodes.length + '</b><span>astros</span></div>' +
      '<div class="stat"><b>' + U.data.links.length + '</b><span>conexões</span></div>' +
      '<div class="stat"><b>' + U.data.types.length + '</b><span>tipos</span></div>';
    box.appendChild(stats);

    box.appendChild(el('div', 'hintline',
      'Tudo fica salvo neste navegador automaticamente. Exporte de vez em quando para ter um backup — ' +
      'e para levar o universo para outro computador ou celular.'));
    box.appendChild(el('div', null, '<div style="height:18px"></div>'));

    var bExp = el('button', 'btn primary', '⬇ Exportar backup (.json)');
    bExp.addEventListener('click', function () { self.exportFile(); });

    var bImp = el('button', 'btn', '⬆ Importar backup');
    var file = el('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.style.display = 'none';
    file.addEventListener('change', function () {
      var f = this.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          U.importJSON(fr.result);
          Scene.rebuild();
          Scene.select(null);
          Scene.resetView();
          self.closeModal();
          self.toast('universo importado ✦');
        } catch (e) { self.toast('arquivo inválido'); }
      };
      fr.readAsText(f);
    });
    bImp.addEventListener('click', function () { file.click(); });

    var wrap = el('div');
    wrap.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    wrap.appendChild(bExp); wrap.appendChild(bImp); wrap.appendChild(file);
    box.appendChild(wrap);

    box.appendChild(el('div', null, '<div style="height:26px"></div>'));
    var dh = el('div', null, 'Zona de perigo');
    dh.style.cssText = 'font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#ff8fa3;font-weight:600';
    box.appendChild(dh);
    var danger = el('div');
    danger.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px';
    var bClear = el('button', 'btn danger', 'Esvaziar universo');
    bClear.addEventListener('click', function () {
      self.confirm('Esvaziar universo', 'Isso apaga todos os astros e conexões, mantendo só o centro. Exporte um backup antes!', function () {
        U.clearAll(); Scene.rebuild(); Scene.select(null); Scene.resetView();
        self.closeModal(); self.toast('universo esvaziado');
      });
    });
    var bSeed = el('button', 'btn danger', 'Restaurar exemplo');
    bSeed.addEventListener('click', function () {
      self.confirm('Restaurar exemplo', 'Isso substitui tudo pelo universo de exemplo. Seus dados atuais serão perdidos.', function () {
        U.reset(); Scene.rebuild(); Scene.select(null); Scene.resetView();
        self.closeModal(); self.toast('exemplo restaurado');
      });
    });
    danger.appendChild(bClear); danger.appendChild(bSeed);
    box.appendChild(danger);

    this.modal('Dados do universo', box, [
      { label: 'Fechar', cls: 'ghost', fn: function () { self.closeModal(); } }
    ]);
  },

  exportFile: function () {
    var blob = new Blob([U.exportJSON()], { type: 'application/json' });
    var a = document.createElement('a');
    var d = new Date();
    var stamp = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    a.href = URL.createObjectURL(blob);
    a.download = 'universo-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    this.toast('backup baixado');
  },

  confirm: function (title, msg, fn) {
    var self = this;
    var box = el('div');
    box.appendChild(el('div', 'p-desc', msg));
    this.modal(title, box, [
      { label: 'Cancelar', cls: 'ghost', fn: function () { self.closeModal(); } },
      { label: 'Confirmar', cls: 'danger', fn: fn }
    ]);
  },

  renameUniverse: function () {
    var self = this;
    var box = el('div');
    var inp = el('input', 'inp');
    inp.type = 'text';
    inp.value = U.data.title;
    inp.placeholder = 'Universo dela';
    box.appendChild(this.field('Nome do universo', inp));
    function ok() {
      U.data.title = inp.value.trim() || 'Universo';
      U.save();
      self.closeModal();
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok(); });
    this.modal('Renomear universo', box, [
      { label: 'Cancelar', cls: 'ghost', fn: function () { self.closeModal(); } },
      { label: 'Salvar', cls: 'primary', fn: ok }
    ]);
  },

  /* ═══════════ AJUDA ═══════════ */
  helpModal: function () {
    var self = this;
    var box = el('div');
    box.innerHTML =
      '<div class="p-desc" style="margin-bottom:20px">' +
      'Este universo guarda o que você aprende sobre ela. A hierarquia é livre, mas a ideia é:<br><br>' +
      '<b>Galáxia</b> = campo de conhecimento (Animes, Comidas, Músicas)<br>' +
      '<b>Planeta</b> = um gosto específico (um anime, um prato)<br>' +
      '<b>Lua / Estrela</b> = detalhes daquele gosto (personagens, ingredientes)<br><br>' +
      'E os corpos especiais: <b>buraco negro</b> (o que ela evita), <b>supernova</b> (momentos marcantes), ' +
      '<b>cometa</b> (coisas que voltam), <b>constelação</b> (padrões e manias). Você pode criar quantos tipos quiser.' +
      '</div>' +
      '<div class="p-desc" style="margin-bottom:20px">' +
      'Você vê <b>um nível de cada vez</b>: no começo só as galáxias em volta do centro. ' +
      'Clicar numa galáxia <b>entra</b> nela e mostra o sistema que existe lá dentro. ' +
      'O aro tracejado e o “2 ASTROS” embaixo do nome avisam que tem coisa dentro daquele astro.' +
      '</div>' +
      '<h4 style="font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#7d90bb;margin:0 0 12px">Como usar</h4>' +
      '<div class="help-row"><span class="k">Clique</span><span>entra no astro (ou só abre o painel, se não tiver nada dentro)</span></div>' +
      '<div class="help-row"><span class="k">← Voltar</span><span>sobe um nível — também com <span class="kbd">esc</span> ou clique duplo no vazio</span></div>' +
      '<div class="help-row"><span class="k">Arrastar astro</span><span>muda a órbita dele</span></div>' +
      '<div class="help-row"><span class="k">Arrastar fundo</span><span>navega pelo nível</span></div>' +
      '<div class="help-row"><span class="k">Roda / pinça</span><span>zoom</span></div>' +
      '<div class="help-row"><span class="k"><span class="kbd">N</span></span><span>criar novo astro</span></div>' +
      '<div class="help-row"><span class="k"><span class="kbd">/</span></span><span>buscar</span></div>' +
      '<div class="help-row"><span class="k"><span class="kbd">espaço</span></span><span>pausar as órbitas</span></div>' +
      '<div class="help-row"><span class="k"><span class="kbd">esc</span></span><span>fechar o painel / voltar um nível</span></div>';
    this.modal('Como funciona', box, [
      { label: 'Entendi', cls: 'primary', fn: function () { self.closeModal(); } }
    ]);
  }
};

global.UI = UI;
window.addEventListener('DOMContentLoaded', function () { UI.init(); });
})(window);
