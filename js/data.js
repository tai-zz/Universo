/* ════════════════════════════════════════════════════════════
   UNIVERSO — modelo de dados, persistência e operações
   ════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

var STORAGE_KEY = 'universo.v1';
var PUB_KEY = 'universo.publicado';   // carimbo do universo publicado já aplicado
var PUB_FILE = 'universo.json';       // universo publicado junto com o site
var GOLDEN = 2.399963229728653;   // ângulo áureo — distribui órbitas sem colidir

function uid(p) {
  return (p || 'n') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* ── formas desenháveis disponíveis para qualquer tipo ───────── */
var SHAPES = [
  { id: 'star',          label: 'Estrela' },
  { id: 'planet',        label: 'Planeta' },
  { id: 'ringed',        label: 'Planeta c/ anel' },
  { id: 'moon',          label: 'Lua' },
  { id: 'spiral',        label: 'Galáxia' },
  { id: 'cloud',         label: 'Nebulosa' },
  { id: 'blackhole',     label: 'Buraco negro' },
  { id: 'burst',         label: 'Supernova' },
  { id: 'comet',         label: 'Cometa' },
  { id: 'rock',          label: 'Asteroide' },
  { id: 'quasar',        label: 'Quasar' },
  { id: 'constellation', label: 'Constelação' },
  { id: 'binary',        label: 'Estrela binária' },
  { id: 'pulsar',        label: 'Pulsar' }
];

/* ── tipos padrão ─────────────────────────────────────────────── */
var DEFAULT_TYPES = [
  { id: 'coracao',   name: 'Estrela-Mãe',  shape: 'star',          color: '#ffd9a0', size: 30 },
  { id: 'galaxia',   name: 'Galáxia',      shape: 'spiral',        color: '#7aa2ff', size: 34 },
  { id: 'nebulosa',  name: 'Nebulosa',     shape: 'cloud',         color: '#a78bfa', size: 30 },
  { id: 'planeta',   name: 'Planeta',      shape: 'planet',        color: '#6fd3ff', size: 16 },
  { id: 'anelado',   name: 'Planeta anelado', shape: 'ringed',     color: '#f6c177', size: 17 },
  { id: 'estrela',   name: 'Estrela',      shape: 'star',          color: '#fff3c4', size: 14 },
  { id: 'lua',       name: 'Lua',          shape: 'moon',          color: '#e6eeff', size: 8 },
  { id: 'cometa',    name: 'Cometa',       shape: 'comet',         color: '#9ef0ff', size: 9 },
  { id: 'asteroide', name: 'Asteroide',    shape: 'rock',          color: '#c3cfe4', size: 7 },
  { id: 'buraco',    name: 'Buraco Negro', shape: 'blackhole',     color: '#c084fc', size: 24 },
  { id: 'supernova', name: 'Supernova',    shape: 'burst',         color: '#ff9ecd', size: 22 },
  { id: 'quasar',    name: 'Quasar',       shape: 'quasar',        color: '#5eead4', size: 20 },
  { id: 'constel',   name: 'Constelação',  shape: 'constellation', color: '#93c5fd', size: 18 },
  { id: 'binaria',   name: 'Estrela Binária', shape: 'binary',     color: '#ffb4a2', size: 15 },
  { id: 'pulsar',    name: 'Pulsar',       shape: 'pulsar',        color: '#7dd3fc', size: 14 }
];

/* ── universo inicial: só a estrela-mãe, o resto você cria ────── */
function seed() {
  var t = Date.now();
  return {
    version: 1,
    title: 'Ela',
    types: clone(DEFAULT_TYPES),
    nodes: [{
      id: 'core', name: 'Ela', type: 'coracao', parent: null,
      desc: '', tags: [], img: '', fav: false, created: t
    }],
    links: [],
    savedAt: t
  };
}

/* ════════════════ API ════════════════ */
var U = {
  data: null,
  SHAPES: SHAPES,
  DEFAULT_TYPES: DEFAULT_TYPES,
  GOLDEN: GOLDEN,
  uid: uid,
  onChange: null,          // preenchido pela UI

  /* ── persistência ── */
  load: function () {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (raw) {
      try {
        var d = JSON.parse(raw);
        if (d && d.nodes) { this.data = this.normalize(d); return; }
      } catch (e) { console.warn('dados corrompidos, recomeçando', e); }
    }
    this.data = this.normalize(seed());
    this.save();
  },

  /* ── universo publicado ──────────────────────────────────────
     Se existe um universo.json ao lado do site, ele é a versão
     oficial: quem abrir o link vê o que você publicou, mesmo sem
     nunca ter escrito nada aqui. Só é aplicado quando o arquivo
     muda, para não atropelar o que você está editando agora.      */
  fetchPublished: function (done) {
    var self = this;
    done = done || function () {};
    if (location.protocol === 'file:' || typeof fetch !== 'function') { done(false); return; }

    fetch(PUB_FILE, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('sem universo publicado'); return r.json(); })
      .then(function (d) {
        if (!d || !d.nodes || !d.nodes.length) throw new Error('arquivo vazio');
        var stamp = String(d.savedAt || d.nodes.length);
        var applied = null;
        try { applied = localStorage.getItem(PUB_KEY); } catch (e) {}
        if (stamp === applied) { done(false); return; }   // esta versão já está aqui
        self.data = self.normalize(d);
        self.data.nodes.forEach(function (n) { if (!n.orbit) self.assignOrbit(n); });
        try { localStorage.setItem(PUB_KEY, stamp); } catch (e) {}
        self.save();
        done(true);
      })
      .catch(function () { done(false); });
  },

  normalize: function (d) {
    d.version = 1;
    d.title = d.title || 'Universo';
    d.types = d.types && d.types.length ? d.types : clone(DEFAULT_TYPES);
    d.nodes = d.nodes || [];
    d.links = d.links || [];
    var ids = {};
    d.nodes.forEach(function (n) {
      n.id = n.id || uid();
      ids[n.id] = 1;
      n.tags = n.tags || [];
      n.desc = n.desc || '';
      n.img = n.img || '';
      n.fav = !!n.fav;
      if (n.parent === undefined) n.parent = null;
      n.created = n.created || Date.now();
    });
    // pais órfãos viram raiz
    d.nodes.forEach(function (n) { if (n.parent && !ids[n.parent]) n.parent = null; });
    // remove ciclos
    d.nodes.forEach(function (n) {
      var seen = {}, cur = n;
      while (cur && cur.parent) {
        if (seen[cur.id]) { n.parent = null; break; }
        seen[cur.id] = 1;
        cur = d.nodes.filter(function (x) { return x.id === cur.parent; })[0];
      }
    });
    d.links = d.links.filter(function (l) { return ids[l.a] && ids[l.b] && l.a !== l.b; });
    d.links.forEach(function (l) { l.id = l.id || uid('l'); l.label = l.label || ''; });
    return d;
  },

  save: function () {
    this.data.savedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('não consegui salvar', e);
      if (global.UI && UI.toast) UI.toast('⚠ não consegui salvar (armazenamento cheio ou bloqueado)');
    }
    if (this.onChange) this.onChange();
  },

  /* ── consultas ── */
  node: function (id) {
    var a = this.data.nodes, i;
    for (i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  },
  type: function (id) {
    var a = this.data.types, i;
    for (i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return a[0];
  },
  children: function (id) {
    return this.data.nodes.filter(function (n) { return n.parent === id; });
  },
  roots: function () {
    return this.data.nodes.filter(function (n) { return !n.parent; });
  },
  depth: function (n) {
    var d = 0, guard = 0;
    while (n && n.parent && guard++ < 50) { n = this.node(n.parent); d++; }
    return d;
  },
  path: function (n) {
    var out = [], guard = 0;
    while (n && guard++ < 50) { out.unshift(n); n = n.parent ? this.node(n.parent) : null; }
    return out;
  },
  linksOf: function (id) {
    return this.data.links.filter(function (l) { return l.a === id || l.b === id; });
  },
  other: function (link, id) { return link.a === id ? link.b : link.a; },
  isDescendant: function (maybeChildId, ancestorId) {
    var n = this.node(maybeChildId), guard = 0;
    while (n && guard++ < 50) {
      if (n.id === ancestorId) return true;
      n = n.parent ? this.node(n.parent) : null;
    }
    return false;
  },
  countOfType: function (tid) {
    return this.data.nodes.filter(function (n) { return n.type === tid; }).length;
  },

  /* ── órbita automática ── */
  assignOrbit: function (n) {
    // índice do astro entre os irmãos — é ele que espalha as órbitas
    var sibsAll = this.children(n.parent);
    var i = sibsAll.indexOf(n);
    if (i < 0) i = sibsAll.length;
    // o primeiro astro raiz é o próprio centro do universo
    if (!n.parent && sibsAll.length <= 1) { n.orbit = { r: 0, a0: 0, speed: 0 }; return; }
    var parent = n.parent ? this.node(n.parent) : null;
    var pSize = parent ? this.type(parent.type).size : 34;
    var mySize = this.type(n.type).size;
    var depth = parent ? this.depth(parent) + 1 : 0;

    var base, step;
    if (depth <= 1)       { base = 560; step = 235; }              // galáxias em volta do centro
    else if (depth === 2) { base = pSize * 2.2 + 128; step = 62; } // planetas em volta da galáxia
    else                  { base = pSize * 2.2 + 30;  step = 26; } // luas em volta do planeta

    var perRing = depth <= 1 ? 7 : (depth === 2 ? 8 : 9);
    var ring = Math.floor(i / perRing);
    var r = base + ring * step + mySize * 0.6;

    n.orbit = {
      r: r,
      a0: (i * GOLDEN) % (Math.PI * 2),
      speed: (depth <= 1 ? 0.03 : 0.09) / Math.sqrt(r / 120) * (0.85 + Math.random() * 0.3)
    };
  },

  /* ── organização das órbitas ──────────────────────────────────────────
     Antes cada astro ganhava uma velocidade sorteada, então os irmãos iam
     derivando até se encontrarem: com o tempo, qualquer nível acabava com
     astros sobrepostos. A organização aqui resolve isso com duas regras:

       · os astros de um nível são distribuídos em ANÉIS, e todos os astros
         de um mesmo anel giram na MESMA velocidade — a roda gira inteira,
         a formação nunca se embaralha;
       · o raio de um anel cresce até caber a volta inteira dos astros que
         ele carrega, e um anel só começa depois que o anterior termina.

     Anéis vizinhos giram em sentidos opostos, o que mantém o nível vivo
     sem nunca aproximar dois astros. Quem foi arrastado à mão fica onde o
     usuário deixou (orbit.fix) e não é remexido.                          */
  /* Margem que a organização reserva para a física da cena. A elipse da
     precessão faz o raio inchar e murchar, e a atração entre vizinhos
     encurta distâncias — os anéis precisam ser dimensionados já contando
     com isso, senão a garantia de não-sobreposição vale só para círculos
     parados. Estes dois números têm de cobrir Scene.ECC e Scene.PULLMAX:
     se um deles subir lá, estes sobem aqui junto.                        */
  FOLGA_FISICA: 1.38,   // folga angular extra (cobre a atração)
  BALANCO: 0.09,        // o quanto o raio pode inchar (cobre a elipse)

  arrange: function (parentId) {
    // o centro do universo não orbita nada: não há o que organizar
    if (!parentId) return;
    var self = this;
    var TAU = Math.PI * 2;
    var kids = this.children(parentId).filter(function (n) {
      return !(n.orbit && n.orbit.fix);
    });
    if (!kids.length) return;

    var parent = this.node(parentId);
    if (!parent) return;
    var pSize = this.type(parent.type).size;
    var depth = this.depth(parent) + 1;

    // espaço que cada astro ocupa: o corpo mais o aro tracejado e uma folga
    function raio(n) { return self.type(n.type).size * 2.2 + 18; }

    // maiores nos anéis de dentro: o nível fica mais equilibrado
    kids.sort(function (a, b) { return self.type(b.type).size - self.type(a.type).size; });

    var porAnel = depth <= 1 ? 7 : (depth === 2 ? 8 : 9);
    var rAtual = pSize * 2.2 + (depth <= 1 ? 300 : 90);
    var i = 0, anel = 0;

    while (i < kids.length) {
      var grupo = kids.slice(i, i + porAnel);
      var maior = 0, volta = 0;
      grupo.forEach(function (n) {
        var q = raio(n);
        volta += q * 2;
        if (q > maior) maior = q;
      });
      // raio mínimo para a roda inteira caber sem um astro encostar no outro
      var rMin = volta * 1.12 * this.FOLGA_FISICA / TAU;
      var r = Math.max(rAtual + maior, rMin);
      var passo = TAU / grupo.length;
      var giro = (anel * 0.5 + 0.17) * passo;   // anéis vizinhos desencontrados
      // 3ª lei de Kepler, que é o que a gravitação de Newton dá para uma
      // órbita circular: quanto mais longe, mais devagar (ω ∝ 1/r^1,5), e
      // quanto mais pesado o centro, mais rápido (ω ∝ √M). O teto e o piso
      // existem só para as luas não virarem um borrão nem os anéis de fora
      // parecerem parados.
      var vel = 0.062 * Math.sqrt(pSize / 30) * Math.pow(200 / r, 1.5);
      vel = Math.max(0.004, Math.min(0.16, vel)) * (anel % 2 ? -1 : 1);
      grupo.forEach(function (n, k) {
        n.orbit = { r: r, a0: (giro + k * passo) % TAU, speed: vel, fix: 0 };
      });
      // o próximo anel começa depois deste, com espaço para a elipse inchar
      rAtual = r + maior + r * this.BALANCO * 2;
      i += porAnel;
      anel++;
    }
  },

  /* ── criação / edição ── */
  add: function (o) {
    var n = {
      id: uid(),
      name: (o.name || 'Sem nome').trim(),
      type: o.type || 'planeta',
      parent: o.parent || null,
      desc: o.desc || '',
      tags: o.tags || [],
      img: o.img || '',
      fav: !!o.fav,
      created: Date.now()
    };
    this.data.nodes.push(n);
    this.assignOrbit(n);
    this.save();
    return n;
  },

  update: function (id, patch) {
    var n = this.node(id);
    if (!n) return null;
    var reorbit = (patch.parent !== undefined && patch.parent !== n.parent) ||
                  (patch.type !== undefined && patch.type !== n.type);
    // protege contra virar filho do próprio descendente
    if (patch.parent && this.isDescendant(patch.parent, id)) delete patch.parent;
    for (var k in patch) if (patch.hasOwnProperty(k)) n[k] = patch[k];
    if (reorbit || !n.orbit) this.assignOrbit(n);
    this.save();
    return n;
  },

  remove: function (id) {
    var self = this;
    var n = this.node(id);
    if (!n) return;
    // filhos sobem um nível
    this.children(id).forEach(function (c) { c.parent = n.parent; self.assignOrbit(c); });
    this.data.nodes = this.data.nodes.filter(function (x) { return x.id !== id; });
    this.data.links = this.data.links.filter(function (l) { return l.a !== id && l.b !== id; });
    this.save();
  },

  link: function (a, b, label) {
    if (a === b) return null;
    var dup = this.data.links.filter(function (l) {
      return (l.a === a && l.b === b) || (l.a === b && l.b === a);
    })[0];
    if (dup) { if (label) { dup.label = label; this.save(); } return dup; }
    var l = { id: uid('l'), a: a, b: b, label: label || '' };
    this.data.links.push(l);
    this.save();
    return l;
  },
  unlink: function (id) {
    this.data.links = this.data.links.filter(function (l) { return l.id !== id; });
    this.save();
  },

  /* ── tipos ── */
  addType: function (o) {
    var id = (o.id || o.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-')).replace(/^-|-$/g, '') || uid('t');
    while (this.data.types.filter(function (t) { return t.id === id; })[0]) id += '2';
    var t = { id: id, name: o.name.trim(), shape: o.shape || 'star', color: o.color || '#7aa2ff', size: +o.size || 16, custom: true };
    this.data.types.push(t);
    this.save();
    return t;
  },
  updateType: function (id, patch) {
    var t = this.type(id);
    for (var k in patch) if (patch.hasOwnProperty(k)) t[k] = patch[k];
    this.save();
    return t;
  },
  removeType: function (id) {
    if (this.data.types.length <= 1) return false;
    if (this.countOfType(id) > 0) return false;
    this.data.types = this.data.types.filter(function (t) { return t.id !== id; });
    this.save();
    return true;
  },

  /* ── importar / exportar ── */
  exportJSON: function () {
    return JSON.stringify(this.data, null, 2);
  },
  importJSON: function (txt) {
    var d = JSON.parse(txt);
    if (!d || !d.nodes) throw new Error('arquivo inválido');
    this.data = this.normalize(d);
    var self = this;
    this.data.nodes.forEach(function (n) { if (!n.orbit) self.assignOrbit(n); });
    this.save();
  },
  reset: function () {
    this.data = this.normalize(seed());
    this.save();
  },
  clearAll: function () {
    this.data = this.normalize({
      version: 1,
      title: this.data.title,
      types: this.data.types,
      nodes: [{ id: 'core', name: 'Ela', type: 'coracao', parent: null, desc: '', tags: [], created: Date.now() }],
      links: []
    });
    this.save();
  }
};

global.U = U;
})(window);
