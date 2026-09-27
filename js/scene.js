/* ════════════════════════════════════════════════════════════
   UNIVERSO — cena: câmera, órbitas, desenho e interação
   ════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

var TAU = Math.PI * 2;

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

/* converte '#rrggbb' → 'r,g,b' */
var rgbCache = {};
function rgb(hex) {
  if (rgbCache[hex]) return rgbCache[hex];
  var h = (hex || '#ffffff').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var n = parseInt(h, 16);
  var s = ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  rgbCache[hex] = s;
  return s;
}
function rgba(hex, a) { return 'rgba(' + rgb(hex) + ',' + a + ')'; }

/* quebra um nome comprido em linhas, sem estourar a tela */
function wrapLabel(txt, max, maxLines) {
  txt = String(txt || '');
  if (txt.length <= max) return [txt];
  var palavras = txt.split(/\s+/), linhas = [], cur = '', i, p;
  for (i = 0; i < palavras.length; i++) {
    p = palavras[i];
    while (p.length > max) {                 // palavra sozinha maior que a linha
      if (cur) { linhas.push(cur); cur = ''; }
      linhas.push(p.slice(0, max - 1) + '-');
      p = p.slice(max - 1);
      if (linhas.length >= maxLines) break;
    }
    if (linhas.length >= maxLines) break;
    if (!cur) cur = p;
    else if ((cur + ' ' + p).length <= max) cur += ' ' + p;
    else { linhas.push(cur); cur = p; if (linhas.length >= maxLines) break; }
  }
  if (linhas.length < maxLines && cur) { linhas.push(cur); cur = ''; }
  // sobrou texto? a última linha termina em reticências
  var usado = linhas.join(' ').replace(/-$/, '').length;
  if (usado < txt.replace(/\s+/g, ' ').length - 1) {
    var ult = linhas[linhas.length - 1] || '';
    linhas[linhas.length - 1] = ult.slice(0, Math.max(1, max - 1)).replace(/[\s,.;:]+$/, '') + '…';
  }
  return linhas;
}

var Scene = {
  canvas: null, ctx: null,
  W: 0, H: 0, dpr: 1,
  cam: { x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1 },
  t: 0,
  paused: false,
  phase: 'intro',          // intro | bang | live
  bangT: 0,
  parts: [],
  dust: [],
  dust3: [],               // poeira de pixels do disco 3D
  dustFor: undefined,      // nível para o qual a poeira foi gerada
  mode3: 0,                // 0 = mapa plano (raiz) · 1 = galáxia 3D
  d3: 600,                 // distância da câmera ao plano do disco
  index: {},               // id → node
  order: [],               // nós em ordem de profundidade
  depth: {},               // id → profundidade
  kids: {},                // id → [nós]
  hidden: {},              // typeId → true (filtros)
  vis: {},                 // id → visível
  selected: null,
  hover: null,
  connectFrom: null,
  drag: null,
  view: null,              // id do astro em que estamos "dentro"
  trans: null,             // transição de entrada/saída
  fade: 1,
  fx: {},                  // animações de clique em andamento
  pendingEnter: null,      // entrada adiada, para a animação aparecer antes
  onView: null,            // callback da UI (migalhas de pão)
  onSelect: null,          // callback da UI
  onHoverChange: null,

  /* ═══════════ INIT ═══════════ */
  init: function () {
    var self = this;
    this.canvas = document.getElementById('sky');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', function () { self.resize(); });
    this.makeSky();
    this.rebuild();
    this.bindPointer();
    this.cam.z = this.cam.tz = 0.06;
    this.last = performance.now();
    requestAnimationFrame(function (ts) { self.loop(ts); });
  },

  resize: function () {
    // guarda o tamanho anterior para reajustar o zoom junto com a janela
    var antes = (this.W > 0 && this.H > 0) ? Math.min(this.W, this.H) : 0;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    var de = document.documentElement;
    this.W = window.innerWidth || (de && de.clientWidth) || 0;
    this.H = window.innerHeight || (de && de.clientHeight) || 0;

    if (antes) {
      // girar o celular ou mudar a janela não pode deixar o universo perdido
      var k = Math.min(this.W, this.H) / antes;
      if (isFinite(k) && k > 0) {
        this.cam.z = clamp(this.cam.z * k, 0.05, 5);
        this.cam.tz = clamp(this.cam.tz * k, 0.05, 5);
      }
    } else if (this.W > 0 && this.H > 0) {
      // primeira medida válida (a página pode ter carregado em aba oculta,
      // onde innerWidth é 0 e todo enquadramento sairia errado)
      this._precisaEnquadrar = true;
    }
    this.canvas.width = Math.floor(this.W * this.dpr);
    this.canvas.height = Math.floor(this.H * this.dpr);
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.sky) this.makeSky();
    if (this.is3d()) this.makeDust();
  },

  /* ═══════════ CÉU DE FUNDO (campo profundo) ═══════════
     Desenhado uma única vez num canvas fora da tela e reaproveitado
     a cada quadro — centenas de estrelas sem custo de desempenho.     */
  makeSky: function () {
    var PAD = 180;
    var w = this.W + PAD * 2, h = this.H + PAD * 2;
    var off = document.createElement('canvas');
    off.width = Math.floor(w * this.dpr);
    off.height = Math.floor(h * this.dpr);
    var c = off.getContext('2d');
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.skyPad = PAD;
    this.sky = off;
    this.skyW = w; this.skyH = h;

    var area = w * h, i;
    var rnd = Math.random;

    // cores de estrela: branco, azulado, amarelo, laranja, avermelhado
    var STAR = ['255,255,255', '214,231,255', '255,241,205', '255,214,150', '255,180,130', '255,152,120'];
    var GAL = ['255,236,205', '255,214,160', '226,236,255', '255,248,235', '210,225,255', '255,200,170'];

    /* ── galáxias distantes: manchinhas alongadas ── */
    var ng = Math.round(clamp(area / 17000, 18, 130));
    for (i = 0; i < ng; i++) {
      var gx = rnd() * w, gy = rnd() * h;
      var rr = 2.2 + Math.pow(rnd(), 2.4) * 11;
      var squash = 0.16 + rnd() * 0.75;
      var rot = rnd() * TAU;
      var col = GAL[(rnd() * GAL.length) | 0];
      var a = 0.12 + rnd() * 0.4;
      c.save();
      c.translate(gx, gy);
      c.rotate(rot);
      c.scale(1, squash);
      var g = c.createRadialGradient(0, 0, 0, 0, 0, rr);
      g.addColorStop(0, 'rgba(' + col + ',' + (a + 0.35).toFixed(3) + ')');
      g.addColorStop(0.45, 'rgba(' + col + ',' + (a * 0.55).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, rr, 0, TAU); c.fill();
      c.restore();
      // núcleo
      if (rr > 4.5) {
        c.fillStyle = 'rgba(255,250,240,' + (0.35 + rnd() * 0.35).toFixed(3) + ')';
        c.beginPath(); c.arc(gx, gy, rr * 0.16, 0, TAU); c.fill();
      }
    }

    /* ── estrelas pequenas ── */
    var ns = Math.round(clamp(area / 1250, 200, 2200));
    for (i = 0; i < ns; i++) {
      var sx = rnd() * w, sy = rnd() * h;
      var sr = 0.35 + Math.pow(rnd(), 3) * 1.6;
      var sc = STAR[(Math.pow(rnd(), 1.6) * STAR.length) | 0];
      var sa = 0.25 + Math.pow(rnd(), 1.5) * 0.7;
      if (sr > 1.1) {
        var g2 = c.createRadialGradient(sx, sy, 0, sx, sy, sr * 4.5);
        g2.addColorStop(0, 'rgba(' + sc + ',' + (sa * 0.5).toFixed(3) + ')');
        g2.addColorStop(1, 'rgba(' + sc + ',0)');
        c.fillStyle = g2;
        c.beginPath(); c.arc(sx, sy, sr * 4.5, 0, TAU); c.fill();
      }
      c.fillStyle = 'rgba(' + sc + ',' + sa.toFixed(3) + ')';
      c.beginPath(); c.arc(sx, sy, sr, 0, TAU); c.fill();
    }

    /* ── estrelas brilhantes com as quatro pontas de difração ── */
    this.spikes = [];
    var nb = Math.round(clamp(area / 78000, 4, 28));
    for (i = 0; i < nb; i++) {
      this.spikes.push({
        x: rnd() * w, y: rnd() * h,
        len: 14 + rnd() * 34,
        r: 1.6 + rnd() * 2.4,
        col: ['255,255,255', '210,230,255', '255,238,200', '255,215,150'][(rnd() * 4) | 0],
        ph: rnd() * TAU,
        sp: 0.5 + rnd()
      });
    }
    for (i = 0; i < this.spikes.length; i++) this.drawSpike(c, this.spikes[i], 1);
  },

  /* estrela com pontas — usada no céu e nos brilhos animados */
  drawSpike: function (c, s, alpha) {
    var col = s.col, L = s.len;
    var g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, L * 0.55);
    g.addColorStop(0, 'rgba(' + col + ',' + (0.75 * alpha).toFixed(3) + ')');
    g.addColorStop(0.3, 'rgba(' + col + ',' + (0.18 * alpha).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + col + ',0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(s.x, s.y, L * 0.55, 0, TAU); c.fill();

    c.save();
    c.translate(s.x, s.y);
    for (var k = 0; k < 4; k++) {
      var lg = c.createLinearGradient(0, 0, L, 0);
      lg.addColorStop(0, 'rgba(' + col + ',' + (0.85 * alpha).toFixed(3) + ')');
      lg.addColorStop(1, 'rgba(' + col + ',0)');
      c.fillStyle = lg;
      c.beginPath();
      c.moveTo(0, -s.r * 0.42); c.lineTo(L, 0); c.lineTo(0, s.r * 0.42);
      c.closePath(); c.fill();
      c.rotate(Math.PI / 2);
    }
    c.restore();

    c.fillStyle = 'rgba(255,255,255,' + (0.95 * alpha).toFixed(3) + ')';
    c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill();
  },

  /* ═══════════ GALÁXIA 3D ═══════════
     A raiz continua sendo um mapa plano. Ao entrar num astro, o nível vira
     um disco inclinado no espaço: as órbitas ganham perspectiva, os astros
     do fundo passam por trás do centro e uma poeira de pixels enche o volume.

     O truque para não reescrever a cena inteira: a projeção acontece aqui e
     devolve coordenadas de mundo já achatadas, do mesmo jeito que o modo
     plano entregava. Câmera, clique, arrastar e rótulos seguem intactos —
     só passam a multiplicar o raio pela escala de profundidade (_s).        */
  /* ── um pouco de física de verdade ──────────────────────────────────
      Nada aqui é uma simulação: são três correções pequenas, calculadas do
      zero a cada quadro a partir do tempo, sem acumular estado. Por isso
      não existe deriva, e a organização em anéis continua valendo.

      NEWTON — cada astro é puxado pelos vizinhos mais pesados, com força
      proporcional à massa dividida pela distância ao quadrado. Os grandes
      alcançam mais longe, exatamente como na lei. O empurrão é limitado a
      uma fração da folga que existe entre os dois, então ele nunca chega a
      encostar um astro no outro.

      EINSTEIN — as órbitas não são círculos perfeitos: são elipses leves
      cujo eixo gira devagar. É a precessão do periélio, a anomalia da
      órbita de Mercúrio que a gravitação de Newton não explicava e que a
      relatividade geral resolveu. Gira mais rápido perto de massa grande e
      em órbita curta (∝ M/r), como na teoria. Como o anel inteiro divide a
      mesma elipse e o mesmo eixo, ele continua girando rígido.            */
  ECC: 0.075,                      // o quanto a órbita foge do círculo
  PREC: 0.06,                      // ritmo da precessão do eixo
  PULL: 6000,                      // alcance da atração entre vizinhos
  PULLMAX: 0.12,                   // teto: fração da folga que a atração usa
  // ECC e PULLMAX são orçados pela organização em anéis: ver U.FOLGA_FISICA
  // e U.BALANCO no data.js. Mexer aqui pede mexer lá.

  T3: 0.60,                        // inclinação (0 = de lado · π/2 = de frente)
  SIN3: Math.sin(0.60),
  COS3: Math.cos(0.60),

  /* todo nível é um disco no espaço — a raiz também */
  is3d: function () { return !!this.viewNode(); },

  /* Distância da câmera ao disco, proporcional ao tamanho do nível.
     A medida é um percentil, não o maior raio: um único astro solitário
     lá longe — o Sadalo, por exemplo — achataria a perspectiva do nível
     inteiro se puxasse a câmera para trás sozinho.                       */
  dist3: function (kids) {
    var raios = [];
    (kids || []).forEach(function (n) {
      if (n.orbit && n.orbit.r > 0) raios.push(n.orbit.r);
    });
    if (!raios.length) { this.raio3 = 1; return 260; }
    raios.sort(function (a, b) { return a - b; });
    var r = raios[Math.min(raios.length - 1, Math.floor(raios.length * 0.8))];
    this.raio3 = r;
    return Math.max(260, r * 2.8);
  },

  /* ponto do disco (ângulo, raio, altura) → mundo achatado + escala + profundidade */
  proj3: function (a, R, y) {
    var px = Math.cos(a) * R, pz = Math.sin(a) * R;
    var fx = px, fy = pz * 0.94, s = 1, z3 = 0;   // plano: leve achatamento
    var m = this.mode3;
    if (m > 0.001) {
      var sinT = this.SIN3, cosT = this.COS3;
      y = y || 0;
      var y3 = y * cosT - pz * sinT;              // inclina em torno do eixo X
      z3 = y * sinT + pz * cosT;
      var ss = this.d3 / Math.max(1, this.d3 + z3);
      fx = lerp(fx, px * ss, m);
      fy = lerp(fy, y3 * ss, m);
      s = lerp(1, ss, m);
      z3 *= m;
    }
    return [fx, fy, s, z3];
  },

  /* o caminho de volta: mundo achatado → (raio, ângulo) da órbita.

     Tentar chegar lá por aproximações sucessivas não funciona: para os
     astros da frente do disco a conta diverge em vez de convergir, e o
     astro arrastado saltava para longe. Mas há solução fechada — a altura
     na tela já carrega a perspectiva, então dela sai a escala, e com a
     escala o raio e o ângulo saem de uma vez.                            */
  unproj3: function (wx, wy) {
    if (this.mode3 < 0.5) return [Math.hypot(wx, wy / 0.94), Math.atan2(wy / 0.94, wx)];
    var sinT = this.SIN3, cosT = this.COS3, d = this.d3;
    var q = -wy / sinT;              // profundidade já multiplicada pela escala
    var s = 1 - q * cosT / d;        // a escala que produziu este ponto
    if (s < 0.05) s = 0.05;          // atrás da câmera: não deixa explodir
    var px = wx / s, pz = q / s;
    return [Math.hypot(px, pz), Math.atan2(pz, px)];
  },

  /* poeira de pixels: um disco de partículas em volta do centro do nível */
  makeDust: function () {
    this.dustFor = this.view;
    this.dust3 = [];
    var v = this.viewNode();
    if (!this.is3d() || !v || !(this.W > 0)) return;

    var kids = this.kids[v.id] || [];
    var maxR = 220;
    kids.forEach(function (n) { if (n.orbit && n.orbit.r > maxR) maxR = n.orbit.r; });
    var raio = this.dustRaio = maxR * 1.5;

    // menos partículas em tela pequena: o celular também precisa dar conta
    var qtd = Math.round(clamp(this.W * this.H / 780, 600, 2000));
    var base = rgb(U.type(v.type).color);
    var PAL = [base, base, base, base, '255,255,255', '255,226,196', '255,186,206'];
    var rnd = Math.random;
    for (var i = 0; i < qtd; i++) {
      var r = raio * Math.pow(rnd(), 0.62);            // miolo mais denso
      var esp = raio * 0.048 * (1 - (r / raio) * 0.6); // disco afina nas bordas
      var col = PAL[(rnd() * PAL.length) | 0];
      this.dust3.push({
        r: r,
        a: rnd() * TAU,
        y: (rnd() + rnd() - 1) * esp,
        sz: 1.2 + Math.pow(rnd(), 2.2) * 4.0,
        css: 'rgb(' + col + ')',
        al: 0.26 + Math.pow(rnd(), 1.7) * 0.7,
        sp: 0.055 * (raio * 0.35 + 1) / (r + raio * 0.35)  // rotação diferencial
      });
    }
    // agrupadas por cor: trocar fillStyle é o que custa caro no desenho
    this.dust3.sort(function (a, b) { return a.css < b.css ? -1 : (a.css > b.css ? 1 : 0); });
  },

  /* duas passadas: perto=false desenha o fundo do disco, perto=true a frente.
     Sem ordenar nada — é a metade do custo e o volume aparece igual.        */
  drawDust3: function (perto) {
    var m = this.mode3;
    if (m < 0.02 || !this.dust3.length) return;
    var ctx = this.ctx, z = this.cam.z, t = this.t;
    var W = this.W, H = this.H;
    var sinT = this.SIN3, cosT = this.COS3, d = this.d3;
    var camx = this.cam.x, camy = this.cam.y;
    var cx = W / 2, cy = H / 2 + this.oy();

    // miolo aceso por trás da poeira
    if (!perto) {
      var v = this.viewNode();
      var halo = (this.dustRaio || 300) * 0.62 * z;
      if (v && halo > 4 && halo < 6000) {
        ctx.save();
        ctx.globalAlpha = m * this._alpha;
        this.glow(cx - camx * z, cy - camy * z, halo, U.type(v.type).color, 0.34);
        ctx.restore();
      }
    }

    ctx.save();
    var aBase = m * this._alpha * (perto ? 0.85 : 1);
    // as partículas vêm ordenadas por cor e a opacidade anda em degraus:
    // assim o canvas troca de estado algumas dezenas de vezes, não milhares
    var ultimaCor = null, ultimaOp = -1;
    for (var i = 0; i < this.dust3.length; i++) {
      var p = this.dust3[i];
      var a = p.a + t * p.sp;
      var pz = Math.sin(a) * p.r;
      var z3 = p.y * sinT + pz * cosT;
      if (perto ? z3 >= 0 : z3 < 0) continue;
      var y3 = p.y * cosT - pz * sinT;
      var s = d / Math.max(1, d + z3);
      var sx = (Math.cos(a) * p.r * s - camx) * z + cx;
      var sy = (y3 * s - camy) * z + cy;
      if (sx < -8 || sx > W + 8 || sy < -8 || sy > H + 8) continue;
      var w = p.sz * s * z;
      if (w < 0.6) w = 0.6;
      var op = Math.round(aBase * p.al * clamp(s * 0.85, 0.12, 1) * 24) / 24;
      if (op <= 0) continue;
      if (op !== ultimaOp) { ctx.globalAlpha = op; ultimaOp = op; }
      if (p.css !== ultimaCor) { ctx.fillStyle = p.css; ultimaCor = p.css; }
      ctx.fillRect(sx - w / 2, sy - w / 2, w, w);
    }
    ctx.restore();
  },

  /* ═══════════ ÍNDICES ═══════════ */
  rebuild: function () {
    var self = this;
    var nodes = U.data.nodes;
    this.index = {}; this.kids = {}; this.depth = {};
    nodes.forEach(function (n) {
      self.index[n.id] = n;
      if (!n.orbit) U.assignOrbit(n);
    });
    nodes.forEach(function (n) {
      var p = n.parent || '__root__';
      (self.kids[p] = self.kids[p] || []).push(n);
    });
    // ordem por profundidade (BFS)
    var order = [], queue = (this.kids['__root__'] || []).slice();
    queue.forEach(function (n) { self.depth[n.id] = 0; });
    var guard = 0;
    while (queue.length && guard++ < 20000) {
      var n = queue.shift();
      order.push(n);
      (this.kids[n.id] || []).forEach(function (c) {
        self.depth[c.id] = self.depth[n.id] + 1;
        queue.push(c);
      });
    }
    this.d3For = undefined;   // mudou o conteúdo: recalibra a perspectiva
    // cada nível ganha a organização em anéis: nada de astros sobrepostos
    for (var pid in this.kids) {
      if (this.kids.hasOwnProperty(pid) && pid !== '__root__') U.arrange(pid);
    }

    this.order = order;
    if (!this.index[this.view]) this.view = null;
    this.updateVis();
    if (this.onView) this.onView();
  },

  /* o astro em que estamos dentro (raiz do universo por padrão) */
  viewNode: function () {
    return this.index[this.view] || (this.kids['__root__'] || [])[0] || null;
  },

  /* só aparecem o astro atual e o que orbita diretamente nele */
  updateVis: function () {
    var self = this;
    this.vis = {};
    var v = this.viewNode();
    if (!v) return;
    this.vis[v.id] = true;
    (this.kids[v.id] || []).forEach(function (n) {
      self.vis[n.id] = !self.hidden[n.type];
    });
  },

  /* ═══════════ ENTRAR / SAIR ═══════════ */
  enter: function (id, selectId) {
    if (this.trans) return;
    var n = this.index[id];
    if (!n || id === (this.viewNode() || {}).id) {
      if (selectId) this.select(selectId);
      return;
    }
    var goingUp = !U.isDescendant(id, (this.viewNode() || {}).id) &&
                  U.isDescendant((this.viewNode() || {}).id, id);
    this.trans = { t: 0, phase: 0, to: id, sel: selectId || null, dir: goingUp ? -1 : 1 };
    if (this.vis[id]) { this.cam.tx = n._x; this.cam.ty = n._y; }
    this.cam.tz = clamp(this.cam.z * (goingUp ? 0.45 : 2.1), 0.1, 5);
  },

  up: function () {
    var v = this.viewNode();
    if (!v || !v.parent) return false;
    // só reabre o painel lá em cima se ele já estava aberto aqui
    this.enter(v.parent, this.selected ? v.id : null);
    return true;
  },

  /* ═══════════ ANIMAÇÃO DE CLIQUE ═══════════ */
  FXDUR: {
    spiral: 1.7, burst: 1.9, blackhole: 2.0, quasar: 1.5, pulsar: 1.6,
    comet: 1.5, constellation: 1.8, binary: 1.6, cloud: 1.7, rock: 1.2,
    moon: 1.7, planet: 1.2, ringed: 1.5, star: 1.4
  },
  pulse: function (id) {
    var n = this.index[id];
    if (!n) return;
    var sh = U.type(n.type).shape || 'star';
    this.fx[id] = { t: 0, dur: this.FXDUR[sh] || 1.3, seed: Math.random() * 10 };
  },

  commitView: function (id, dir, sel) {
    this.view = id;
    this.updateVis();
    // a troca plano↔3D acontece durante o escurecimento da transição
    this.mode3 = this.is3d() ? 1 : 0;
    this.layout();
    this.makeDust();
    var fit = this.fitZoom();
    this.cam.x = this.cam.y = this.cam.tx = this.cam.ty = 0;
    this.cam.z = clamp(fit * (dir > 0 ? 0.42 : 2.3), 0.1, 5);
    this.cam.tz = fit;
    if (sel) this.select(sel); else if (this.selected && !this.vis[this.selected]) this.select(null);
    if (this.onView) this.onView();
  },

  /* ═══════════ POSIÇÕES ═══════════ */
  layout: function () {
    var self = this;
    var v = this.viewNode();
    if (!v) return;
    v._x = 0; v._y = 0; v._a = 0; v._s = 1; v._z = 0;
    var kids = this.kids[v.id] || [];
    // a perspectiva é calibrada uma vez por nível. Se fosse recalculada a
    // cada quadro, arrastar um astro para fora mudaria a perspectiva de
    // todos juntos e ele nunca pararia debaixo do cursor.
    if (this.d3For !== this.view) {
      this.d3 = this.dist3(kids);
      this.d3For = this.view;
    }
    var mCentro = U.type(v.type).size;
    kids.forEach(function (n) {
      var o = n.orbit || { r: 220, a0: 0, speed: 0 };
      var a = o.a0 + self.t * (o.speed || 0);
      n._a = a;
      // Einstein: elipse leve com o eixo precessionando. O eixo de partida
      // vem do próprio raio, então cada anel começa virado para um lado.
      var eixo = o.r * 0.013 + self.t * (self.PREC * mCentro / Math.max(40, o.r));
      var R = o.r * (1 - self.ECC * Math.cos(a - eixo));
      var q = self.proj3(a, R, 0);
      n._x = q[0]; n._y = q[1]; n._s = q[2]; n._z = q[3];
      n._R3 = R;   // distância real ao centro: é dela que sai a fase
    });
    this.atrair(kids, v);
  },

  /* Newton: cada astro cede um pouco na direção dos vizinhos mais
     pesados. O deslocamento é calculado sobre as posições já projetadas e
     limitado pela folga entre os dois corpos, então é impossível ele
     fechar a distância e sobrepor alguém.                                */
  atrair: function (kids, centro) {
    var i, j;
    // o centro do nível puxa junto, mas não sai do lugar: ele é a âncora
    var corpos = kids.slice();
    if (centro) corpos.push(centro);

    for (i = 0; i < kids.length; i++) {
      kids[i]._px = 0; kids[i]._py = 0; kids[i]._folga = 1e9;
    }

    for (i = 0; i < kids.length; i++) {
      var A = kids[i];
      var rA = U.type(A.type).size * (A._s || 1);
      for (j = 0; j < corpos.length; j++) {
        var B = corpos[j];
        if (B === A) continue;
        var dx = (B._x || 0) - (A._x || 0);
        var dy = (B._y || 0) - (A._y || 0);
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1) continue;
        var mB = U.type(B.type).size;
        var rB = mB * (B._s || 1);
        var folga = d - rA - rB;
        if (folga <= 0) continue;
        if (folga < A._folga) A._folga = folga;
        // a aceleração que B provoca em A depende da massa de B sobre a
        // distância ao quadrado. Os dois se atraem, e quem é leve cede
        // mais — é o que a lei diz.
        var f = this.PULL * mB / (d * d);
        A._px += dx / d * f;
        A._py += dy / d * f;
      }
    }

    // trava final: nenhum astro anda mais que uma fração da menor folga
    // que ele tem. Como no máximo os dois de um par andam um na direção do
    // outro, a distância entre eles nunca fecha de verdade.
    for (i = 0; i < kids.length; i++) {
      var n = kids[i];
      var mag = Math.sqrt(n._px * n._px + n._py * n._py);
      var teto = this.PULLMAX * n._folga;
      if (mag > teto && mag > 0) {
        var k = teto / mag;
        n._px *= k; n._py *= k;
      }
      n._x += n._px;
      n._y += n._py;
    }
  },

  /* ═══════════ CÂMERA ═══════════ */
  /* deslocamento vertical: deixa respiro para a barra do topo */
  oy: function () { return Math.min(34, this.H * 0.045); },
  w2s: function (x, y) {
    return [(x - this.cam.x) * this.cam.z + this.W / 2,
            (y - this.cam.y) * this.cam.z + this.H / 2 + this.oy()];
  },
  s2w: function (x, y) {
    return [(x - this.W / 2) / this.cam.z + this.cam.x,
            (y - this.H / 2 - this.oy()) / this.cam.z + this.cam.y];
  },
  focus: function (n, z) {
    if (!n) return;
    this.cam.tx = n._x || 0;
    this.cam.ty = n._y || 0;
    if (z) this.cam.tz = clamp(z, 0.12, 4);
  },
  resetView: function () {
    this.cam.tx = 0; this.cam.ty = 0; this.cam.tz = this.fitZoom();
  },
  /* zoom que faz o nível atual caber na tela */
  fitZoom: function () {
    // sem tela medida não há enquadramento possível: não invente um número
    if (!(this.W > 0) || !(this.H > 0)) return this.cam.tz || 1;
    // o disco 3D é achatado na vertical, então medir um raio circular
    // sobraria margem e encolheria tudo: mede-se a caixa já projetada.
    // Os pisos evitam que um astro sozinho vire um borrão gigante.
    var self = this, mx = 120, my = 100;
    this.order.forEach(function (n) {
      if (!self.vis[n.id]) return;
      var folga = U.type(n.type).size * (n._s || 1) * 2.4 + 26;
      var ax = Math.abs(n._x || 0) + folga;
      var ay = Math.abs(n._y || 0) + folga;
      if (ax > mx) mx = ax;
      if (ay > my) my = ay;
    });
    var zx = (this.W - 120) * 0.5 / mx;
    var zy = (this.H - 160) * 0.5 / my;
    return clamp(Math.min(zx, zy), 0.14, 3.2);
  },
  zoomBy: function (f) {
    this.cam.tz = clamp(this.cam.tz * f, 0.12, 4);
  },

  /* ═══════════ BIG BANG ═══════════ */
  bigBang: function () {
    this.phase = 'bang';
    this.bangT = 0;
    this.bangStart = performance.now();
    this.parts = [];
    for (var i = 0; i < 320; i++) {
      var a = Math.random() * TAU;
      var sp = 60 + Math.pow(Math.random(), 0.45) * 900;
      this.parts.push({
        a: a, sp: sp, d: 0,
        r: 0.6 + Math.random() * 2,
        h: Math.random() < 0.2 ? '#bcd6ff' : '#ffffff'
      });
    }
    this.cam.z = 0.06;
    this.layout();
    this.cam.tz = this.fitZoom();
    this.cam.x = this.cam.y = this.cam.tx = this.cam.ty = 0;
  },

  /* ═══════════ LOOP ═══════════ */
  loop: function (ts) {
    var self = this;
    var dt = Math.min((ts - this.last) / 1000, 0.05);
    this.last = ts;
    if (!this.paused) this.t += dt;
    // o nível pode mudar por fora (importar backup): refaz a poeira na hora
    if (this.dustFor !== this.view) {
      this.mode3 = this.is3d() ? 1 : 0;
      this.makeDust();
    } else {
      this.mode3 = lerp(this.mode3, this.is3d() ? 1 : 0, 1 - Math.pow(0.002, dt));
    }
    if (this.phase === 'bang') {
      // relógio real: se a aba for estrangulada, o flash não trava na tela
      this.bangT = Math.max(0, (ts - this.bangStart) / 1000);
      if (this.bangT > 2.4) { this.phase = 'live'; }
    }
    // animações de clique
    for (var fid in this.fx) {
      if (!this.fx.hasOwnProperty(fid)) continue;
      this.fx[fid].t += dt;
      if (this.fx[fid].t >= this.fx[fid].dur) delete this.fx[fid];
    }
    // entrada adiada: dá tempo da animação começar antes do mergulho
    if (this.pendingEnter) {
      this.pendingEnter.t -= dt;
      if (this.pendingEnter.t <= 0) {
        var pid = this.pendingEnter.id;
        this.pendingEnter = null;
        this.enter(pid, null);
      }
    }

    // transição de entrar/sair de um astro
    if (this.trans) {
      var tr = this.trans;
      tr.t += dt;
      if (tr.phase === 0) {
        this.fade = 1 - clamp(tr.t / 0.3, 0, 1);
        if (tr.t >= 0.3) {
          this.commitView(tr.to, tr.dir, tr.sel);
          tr.phase = 1; tr.t = 0;
        }
      } else {
        this.fade = clamp(tr.t / 0.42, 0, 1);
        if (tr.t >= 0.42) { this.fade = 1; this.trans = null; }
      }
    }

    try {
      this.layout();

      // a tela acabou de ganhar tamanho de verdade: reenquadra agora que
      // as posições existem
      if (this._precisaEnquadrar && this.W > 0 && this.H > 0) {
        this._precisaEnquadrar = false;
        this.cam.tz = this.fitZoom();
        if (this.phase !== 'live') this.cam.z = this.cam.tz * 0.1;
      }

      // durante o Big Bang o enquadramento se ajusta sozinho ao tamanho real do universo
      if (this.phase === 'bang') this.cam.tz = this.fitZoom();

      var k = 1 - Math.pow(0.0015, dt);
      this.cam.x = lerp(this.cam.x, this.cam.tx, k);
      this.cam.y = lerp(this.cam.y, this.cam.ty, k);
      this.cam.z = lerp(this.cam.z, this.cam.tz, k);

      this.draw(dt);
    } catch (err) {
      // um erro de desenho nunca pode matar o universo
      if (!this._errShown) { this._errShown = true; console.error('erro ao desenhar:', err); }
    }
    requestAnimationFrame(function (t2) { self.loop(t2); });
  },

  /* ═══════════ DESENHO ═══════════ */
  draw: function (dt) {
    var ctx = this.ctx, W = this.W, H = this.H;

    // fundo
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000208';
    ctx.fillRect(0, 0, W, H);

    var uAlpha = 1;
    if (this.phase === 'intro') uAlpha = 0;
    else if (this.phase === 'bang') uAlpha = clamp((this.bangT - 0.45) / 1.25, 0, 1);

    this._alpha = uAlpha * this.fade;

    if (uAlpha > 0.001) {
      ctx.save();
      ctx.globalAlpha = uAlpha;
      this.drawSky();
      ctx.globalAlpha = this._alpha;
      this.drawDust3(false);
      this.drawLinks();
      this.drawNodes();
      this.drawDust3(true);
      ctx.restore();
    }

    if (this.phase === 'bang') this.drawBang();
  },

  /* céu de fundo: imagem pronta + brilhos animados, com leve paralaxe */
  drawSky: function () {
    if (!this.sky) return;
    var ctx = this.ctx, P = this.skyPad;
    var ox = clamp(-this.cam.x * 0.045, -P, P);
    var oy = clamp(-this.cam.y * 0.045, -P, P);
    ctx.drawImage(this.sky, 0, 0, this.sky.width, this.sky.height,
      -P + ox, -P + oy, this.skyW, this.skyH);

    // algumas estrelas piscam de leve por cima
    var self = this;
    this.spikes.forEach(function (s, i) {
      if (i % 3) return;
      var tw = 0.55 + 0.45 * Math.sin(self.t * s.sp * 0.7 + s.ph);
      self.drawSpike(ctx, { x: s.x - P + ox, y: s.y - P + oy, len: s.len, r: s.r, col: s.col }, tw * 0.55);
    });
  },

  /* laços: órbitas + hierarquia + conexões livres */
  drawLinks: function () {
    var ctx = this.ctx, self = this, z = this.cam.z;
    var rel = this.relatedSet();

    var v = this.viewNode();
    if (!v) return;
    var kids = (this.kids[v.id] || []).filter(function (n) { return self.vis[n.id]; });
    var c0 = this.w2s(0, 0);

    // anéis de órbita em volta do astro atual
    ctx.lineWidth = Math.max(0.3, 0.6 * z);
    var seenR = {};
    kids.forEach(function (n) {
      if (!n.orbit || !n.orbit.r) return;
      var key = Math.round(n.orbit.r);
      if (seenR[key]) return;
      seenR[key] = 1;
      var rr = n.orbit.r * z;
      if (rr < 12 || rr > 9000) return;
      ctx.strokeStyle = 'rgba(120,160,240,' + (rel ? 0.05 : 0.1) + ')';
      ctx.beginPath();
      if (self.mode3 > 0.02) {
        // com perspectiva a órbita não é uma elipse centrada: traça ponto a ponto
        for (var k = 0; k <= 64; k++) {
          var q = self.proj3(k / 64 * TAU, n.orbit.r, 0);
          var sp = self.w2s(q[0], q[1]);
          if (k) ctx.lineTo(sp[0], sp[1]); else ctx.moveTo(sp[0], sp[1]);
        }
        ctx.closePath();
      } else {
        ctx.ellipse(c0[0], c0[1], rr, rr * 0.94, 0, 0, TAU);
      }
      ctx.stroke();
    });

    // fios ligando o centro aos astros que orbitam nele
    kids.forEach(function (n) {
      var b = self.w2s(n._x, n._y);
      var dim = rel && !(rel[n.id] && rel[v.id]);
      var gr = ctx.createLinearGradient(c0[0], c0[1], b[0], b[1]);
      gr.addColorStop(0, rgba(U.type(v.type).color, dim ? 0.05 : 0.26));
      gr.addColorStop(1, rgba(U.type(n.type).color, dim ? 0.05 : 0.22));
      ctx.strokeStyle = gr;
      ctx.lineWidth = Math.max(0.4, (dim ? 0.7 : 1.1) * z);
      ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    });

    // conexões livres (constelações entre astros)
    U.data.links.forEach(function (l) {
      var A = self.index[l.a], B = self.index[l.b];
      if (!A || !B || !self.vis[l.a] || !self.vis[l.b]) return;
      var a = self.w2s(A._x, A._y), b = self.w2s(B._x, B._y);
      var dim = rel && !(rel[l.a] && rel[l.b]);
      ctx.save();
      ctx.setLineDash([5 * z + 2, 6 * z + 3]);
      ctx.strokeStyle = 'rgba(140,190,255,' + (dim ? 0.08 : 0.46) + ')';
      ctx.lineWidth = Math.max(0.4, 1 * z);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.restore();
      if (!dim && l.label && z > 0.5) {
        var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        ctx.fillStyle = 'rgba(175,205,255,.55)';
        ctx.font = '400 10px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText(l.label, mx, my - 4);
      }
    });

    // linha do modo conectar
    if (this.connectFrom && this.index[this.connectFrom] && this.mouse) {
      var A2 = this.index[this.connectFrom];
      var a2 = this.w2s(A2._x, A2._y);
      ctx.save();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(160,200,255,.8)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(a2[0], a2[1]); ctx.lineTo(this.mouse[0], this.mouse[1]); ctx.stroke();
      ctx.restore();
    }
  },

  relatedSet: function () {
    if (!this.selected || !this.index[this.selected]) return null;
    var set = {}, self = this;
    var n = this.index[this.selected];
    set[n.id] = 1;
    if (n.parent) set[n.parent] = 1;
    (this.kids[n.id] || []).forEach(function (c) { set[c.id] = 1; });
    U.linksOf(n.id).forEach(function (l) { set[l.a] = 1; set[l.b] = 1; });
    return set;
  },

  drawNodes: function () {
    var self = this, ctx = this.ctx, z = this.cam.z;
    var rel = this.relatedSet();
    var list = this.order.filter(function (n) { return self.vis[n.id]; });
    if (this.mode3 > 0.5) {
      // no disco 3D quem manda é a profundidade: o fundo desenha primeiro
      list.sort(function (a, b) { return (b._z || 0) - (a._z || 0); });
    } else {
      // maiores primeiro (ficam atrás)
      list.sort(function (a, b) { return U.type(b.type).size - U.type(a.type).size; });
    }

    var labels = [], fxList = [];
    list.forEach(function (n) {
      var ty = U.type(n.type);
      var s = self.w2s(n._x, n._y);
      var r = Math.max(1.2, ty.size * z * (n._s || 1));
      var pad = r * 4 + 80;
      if (s[0] < -pad || s[0] > self.W + pad || s[1] < -pad || s[1] > self.H + pad) return;

      var dim = rel && !rel[n.id] ? 0.35 : 1;
      // o que está no fundo do disco chega mais apagado
      if (self.mode3 > 0.01) dim *= lerp(1, clamp((n._s || 1) * 0.92, 0.4, 1), self.mode3);
      var isHot = (self.hover === n.id || self.selected === n.id);
      if (isHot) dim = 1;

      var f = self.fx[n.id];
      var fxo = f ? { p: clamp(f.t / f.dur, 0, 1), seed: f.seed } : null;
      if (fxo) fxList.push({ n: n, ty: ty, x: s[0], y: s[1], r: r, fx: fxo });

      ctx.save();
      ctx.globalAlpha = dim * self._alpha;
      self.drawBody(n, ty, s[0], s[1], r, isHot, fxo);
      // aro indicando que há um sistema inteiro aí dentro
      var kidCount = (self.kids[n.id] || []).length;
      if (kidCount && n.id !== (self.viewNode() || {}).id) {
        ctx.save();
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = rgba(ty.color, isHot ? 0.6 : 0.28);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(s[0], s[1], r * 2.1 + 13, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      var d = n.id === (self.viewNode() || {}).id ? 0 : 1;
      // nomes longos viram várias linhas em vez de atravessar a tela
      var maxCh = Math.max(16, Math.min(34, Math.floor(self.W / 17)));
      labels.push({
        n: n, ty: ty, x: s[0], y: s[1] + r + 15, d: d, r: r, hot: isHot, kids: kidCount,
        linhas: wrapLabel(n.name, maxCh, isHot ? 5 : 3),
        a: dim * (isHot ? 1 : 0.92),
        prio: (isHot ? 100 : 0) + (n.fav ? 20 : 0) + (10 - d) + ty.size / 10 + (n._s || 1) * 6
      });
    });

    // efeitos de clique por cima dos corpos
    ctx.save();
    ctx.globalAlpha = this._alpha;
    fxList.forEach(function (o) { self.drawFxFor(o.n, o.ty, o.x, o.y, o.r, o.fx); });
    ctx.restore();

    // mais importantes primeiro; quem colide fica de fora
    labels.sort(function (a, b) { return b.prio - a.prio; });
    var boxes = [];
    labels = labels.filter(function (L) {
      var maior = 0;
      L.linhas.forEach(function (t) { if (t.length > maior) maior = t.length; });
      var w = maior * 6.2 + 10, h = 15 * L.linhas.length + 6;
      var b = [L.x - w / 2, L.y - 3, L.x + w / 2, L.y + h];
      for (var i = 0; i < boxes.length; i++) {
        var o = boxes[i];
        if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return false;
      }
      boxes.push(b);
      return true;
    });

    // rótulos por cima de tudo
    labels.forEach(function (L) {
      var d = L.d;
      var size = L.hot ? 13.5 : (d === 0 ? 14 : d === 1 ? 12.5 : 11.5);
      ctx.font = (L.hot || d <= 1 ? '600 ' : '400 ') + size + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0,0,0,.9)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(' + (L.hot ? '255,255,255' : '218,230,255') + ',' + L.a.toFixed(2) + ')';
      var lh = size + 3, li;
      for (li = 0; li < L.linhas.length; li++) {
        ctx.fillText(L.linhas[li], L.x, L.y + li * lh);
      }
      var baixo = L.y + L.linhas.length * lh;
      ctx.shadowBlur = 0;
      if (L.hot || L.kids) {
        ctx.font = '400 10px ' + FONT;
        ctx.fillStyle = rgba(L.ty.color, (L.hot ? 0.9 : 0.5) * L.a);
        var sub = L.ty.name.toUpperCase();
        if (L.kids && L.d) sub = (L.hot ? '▸ ENTRAR · ' : '') + L.kids + (L.kids > 1 ? ' ASTROS' : ' ASTRO');
        ctx.fillText(sub, L.x, baixo + 1);
      }
      if (L.n.fav) {
        ctx.font = '400 10px ' + FONT;
        ctx.fillStyle = 'rgba(255,158,205,' + (0.9 * L.a) + ')';
        ctx.fillText('♥', L.x, L.y - size - 6);
      }
    });
  },

  /* halo radial */
  glow: function (x, y, r, color, a) {
    var ctx = this.ctx;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(0.35, rgba(color, a * 0.35));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  },

  /* ── volume dos corpos ───────────────────────────────────────────────
     Até aqui o 3D estava no arranjo, e cada astro continuava um desenho
     chapado. Estas duas funções dão volume a eles.

     A luz vem do centro do nível, que é quem brilha ali: o lado virado
     para o centro é o lado aceso. E a fase sai da profundidade — um astro
     no fundo do disco tem o centro entre ele e nós, está de costas para a
     luz e aparece como um crescente; um astro na frente aparece cheio. É
     a mesma razão de a Lua ter fases, e cai de graça porque a cena já
     sabe a profundidade de cada astro.

     Só os corpos que não brilham sozinhos ganham fase. Estrela, supernova,
     quasar, pulsar e buraco negro não têm lado escuro — a luz é deles.   */
  luz: function (n, x, y) {
    var c0 = this.w2s(0, 0);
    var dx = c0[0] - x, dy = c0[1] - y;
    var d = Math.sqrt(dx * dx + dy * dy);
    var lx = d > 0.5 ? dx / d : 0;
    var ly = d > 0.5 ? dy / d : -1;
    var R3 = n._R3 || 0;
    // fase cheia na frente do disco, crescente no fundo
    var lit = R3 > 1 ? 0.5 - 0.5 * ((n._z || 0) / R3) : 1;
    return [lx, ly, clamp(lit, 0.14, 1)];
  },

  /* sombreia uma esfera: noite, terminador, brilho especular e o fio de
     luz na borda acesa. Tudo recortado no círculo do corpo.             */
  relevo: function (x, y, r, lit, lx, ly, boost) {
    if (r < 2.2) return;                 // pequeno demais: só custaria caro
    var ctx = this.ctx;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();

    // o terminador anda de uma borda à outra conforme a fase
    var d = (1 - 2 * lit) * r;
    var g = ctx.createLinearGradient(
      x + lx * (d + r * 0.30), y + ly * (d + r * 0.30),
      x + lx * (d - r * 0.95), y + ly * (d - r * 0.95));
    g.addColorStop(0, 'rgba(2,5,14,0)');
    g.addColorStop(0.5, 'rgba(2,5,14,.52)');
    g.addColorStop(1, 'rgba(2,5,14,.9)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    // brilho especular do lado aceso
    var hx = x + lx * r * 0.44, hy = y + ly * r * 0.44;
    var sp = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.7);
    sp.addColorStop(0, 'rgba(255,255,255,' + (0.26 * lit * boost).toFixed(3) + ')');
    sp.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sp;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();

    // fio de luz na borda virada para o centro
    var ang = Math.atan2(ly, lx);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.2 * lit * boost).toFixed(3) + ')';
    ctx.lineWidth = Math.max(0.5, r * 0.1);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.95, ang - 1.05, ang + 1.05);
    ctx.stroke();
    ctx.restore();
  },

  /* ── desenho de cada corpo celeste ── */
  drawBody: function (n, ty, x, y, r, hot, fx) {
    var ctx = this.ctx, c = ty.color, t = this.t;
    var seed = (n.id.charCodeAt(0) + n.id.charCodeAt(n.id.length - 1)) % 100;
    var sh = ty.shape || 'star';
    var boost = hot ? 1.25 : 1;

    /* animação de clique: p = progresso, k = decaimento, e = sino, spin = giro extra */
    var p = fx ? fx.p : 0;
    var k = fx ? 1 - p : 0;
    var e = fx ? Math.sin(p * Math.PI) : 0;
    var pop = fx ? Math.sin(Math.min(p * 2.6, 1) * Math.PI) * Math.pow(k, 0.5) : 0;
    var spin = fx ? Math.pow(k, 2) * 9 : 0;
    if (fx) {
      r = r * (1 + 0.2 * pop);
      boost *= 1 + 0.5 * e;
    }

    switch (sh) {

      case 'spiral': {
        this.glow(x, y, r * 4.2, c, 0.2 * boost);
        ctx.save();
        ctx.translate(x, y);
        // uma galáxia é um disco. A inclinação entra ANTES do giro, então
        // ela gira no próprio plano e nós é que a vemos de lado —
        // antes o achatamento girava junto, o que é a deformação errada.
        // Cada uma foge um pouco do plano do nível para não ficarem iguais.
        var sqG = this.SIN3 * (0.86 + ((seed % 9) / 9) * 0.42);
        ctx.rotate((((seed % 5) / 5) - 0.5) * 0.5);
        ctx.scale(1, sqG);
        ctx.rotate(t * 0.05 + seed + spin * 1.6);
        var arms = 3, ai;
        for (ai = 0; ai < arms; ai++) {
          ctx.save();
          ctx.rotate((TAU / arms) * ai);
          ctx.beginPath();
          for (var i = 0; i <= 26; i++) {
            var f = i / 26;
            var ang = f * 2.5, rad = f * r * 2.7;
            var px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.strokeStyle = rgba(c, 0.32 * boost);
          ctx.lineWidth = Math.max(0.6, r * 0.14);
          ctx.stroke();
          // estrelinhas no braço
          for (var j = 1; j <= 5; j++) {
            var ff = j / 5, aa = ff * 2.5, rr2 = ff * r * 2.7;
            ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * boost) + ')';
            ctx.beginPath();
            ctx.arc(Math.cos(aa) * rr2, Math.sin(aa) * rr2, Math.max(0.5, r * 0.07), 0, TAU);
            ctx.fill();
          }
          ctx.restore();
        }
        ctx.restore();
        this.glow(x, y, r * 1.25, '#ffffff', 0.85 * boost);
        break;
      }

      case 'cloud': {
        ctx.save();
        var puff = 1 + 0.55 * e;   // a nuvem respira ao ser clicada
        for (var m = 0; m < 5; m++) {
          var ang2 = (seed + m) * 1.7 + t * 0.06 + spin * 0.4;
          var ox = Math.cos(ang2) * r * 0.9 * puff, oy = Math.sin(ang2 * 1.3) * r * 0.6 * puff;
          this.glow(x + ox, y + oy, r * (1.6 + (m % 3) * 0.5) * puff, m % 2 ? c : '#5b8cff', 0.16 * boost);
        }
        ctx.restore();
        this.glow(x, y, r * 0.8, '#ffffff', 0.55 * boost);
        for (var s2 = 0; s2 < 6; s2++) {
          var a3 = seed + s2 * 2.1;
          ctx.fillStyle = 'rgba(255,255,255,.6)';
          ctx.beginPath();
          ctx.arc(x + Math.cos(a3) * r * 1.3, y + Math.sin(a3) * r, Math.max(0.5, r * 0.08), 0, TAU);
          ctx.fill();
        }
        break;
      }

      case 'blackhole': {
        ctx.save();
        this.glow(x, y, r * 3.4, c, 0.3 * boost);
        // disco de acreção
        ctx.translate(x, y);
        ctx.rotate(0.5 + t * 0.12 + spin * 2.2);
        for (var d2 = 0; d2 < 3; d2++) {
          ctx.beginPath();
          ctx.ellipse(0, 0, r * (1.5 + d2 * 0.35), r * (0.5 + d2 * 0.12), 0, 0, TAU);
          ctx.strokeStyle = rgba(d2 === 1 ? '#ffffff' : c, (0.55 - d2 * 0.14) * boost);
          ctx.lineWidth = Math.max(0.6, r * 0.12);
          ctx.stroke();
        }
        ctx.restore();
        // horizonte de eventos
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba('#ffffff', 0.5 * boost);
        ctx.lineWidth = Math.max(0.5, r * 0.07);
        ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0, TAU); ctx.stroke();
        break;
      }

      case 'burst': {
        var pulse = 0.75 + 0.25 * Math.sin(t * 1.6 + seed) + e * 0.6;
        this.glow(x, y, r * 3.6 * pulse, c, 0.34 * boost);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 0.08 + seed);
        for (var ry = 0; ry < 12; ry++) {
          var len = r * (1.6 + ((ry % 3) * 0.7)) * pulse;
          ctx.rotate(TAU / 12);
          ctx.strokeStyle = rgba('#ffffff', 0.4 * boost);
          ctx.lineWidth = Math.max(0.4, r * 0.06);
          ctx.beginPath(); ctx.moveTo(r * 0.5, 0); ctx.lineTo(len * 1.6, 0); ctx.stroke();
        }
        ctx.restore();
        this.glow(x, y, r * 1.1, '#ffffff', 0.95 * boost);
        break;
      }

      case 'comet': {
        var dir = (n._a || 0) + Math.PI / 2;
        var tl = r * 9 * (1 + 1.6 * e);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(dir + Math.PI);
        var gg = ctx.createLinearGradient(0, 0, tl, 0);
        gg.addColorStop(0, rgba(c, 0.55 * boost));
        gg.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.75); ctx.lineTo(tl, 0); ctx.lineTo(0, r * 0.75);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        this.glow(x, y, r * 2.4, c, 0.5 * boost);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y, Math.max(1, r * 0.55), 0, TAU); ctx.fill();
        break;
      }

      case 'rock': {
        ctx.save();
        // treme quando clicado
        ctx.translate(x + (fx ? (Math.sin(p * 61) * r * 0.3 * k) : 0),
                      y + (fx ? (Math.cos(p * 73) * r * 0.3 * k) : 0));
        ctx.rotate(t * 0.3 + seed + spin * 3);
        ctx.beginPath();
        for (var v = 0; v < 7; v++) {
          var av = (TAU / 7) * v;
          var rv = r * (0.72 + ((seed + v * 7) % 10) / 22);
          var vx = Math.cos(av) * rv, vy = Math.sin(av) * rv;
          if (v === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.fillStyle = rgba(c, 0.85 * boost);
        ctx.fill();
        ctx.restore();
        var Lr = this.luz(n, x, y);
        this.relevo(x, y, r * 0.86, Lr[2], Lr[0], Lr[1], boost);
        this.glow(x, y, r * 2, c, 0.18 * boost);
        break;
      }

      case 'quasar': {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(seed * 0.7 + t * 0.03);
        var jet = r * 6 * (1 + 1.4 * e);   // os jatos disparam no clique
        var bg = ctx.createLinearGradient(0, -jet, 0, jet);
        bg.addColorStop(0, rgba(c, 0));
        bg.addColorStop(0.5, rgba(c, 0.5 * boost));
        bg.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(-r * 0.3, -jet); ctx.lineTo(r * 0.3, -jet);
        ctx.lineTo(r * 0.75, jet); ctx.lineTo(-r * 0.75, jet);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.7, r * 0.45, 0, 0, TAU);
        ctx.strokeStyle = rgba('#ffffff', 0.45 * boost);
        ctx.lineWidth = Math.max(0.5, r * 0.1);
        ctx.stroke();
        ctx.restore();
        this.glow(x, y, r * 2, '#ffffff', 0.8 * boost);
        break;
      }

      case 'constellation': {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 0.04 + seed);
        var pts = [];
        var np = 5 + (seed % 3);
        for (var q = 0; q < np; q++) {
          var aq = (TAU / np) * q + (seed % 7) * 0.2;
          var rq = r * (0.8 + ((seed + q * 13) % 10) / 12);
          pts.push([Math.cos(aq) * rq, Math.sin(aq) * rq]);
        }
        ctx.strokeStyle = rgba(c, 0.5 * boost);
        ctx.lineWidth = Math.max(0.4, r * 0.06);
        ctx.beginPath();
        pts.forEach(function (pt, i2) { i2 ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]); });
        ctx.stroke();
        // no clique, a constelação se desenha traço a traço
        if (fx) {
          var lim = p * (pts.length - 1);
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.95 * Math.min(1, k * 2.5)) + ')';
          ctx.lineWidth = Math.max(0.8, r * 0.1);
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (var si = 1; si < pts.length; si++) {
            var fr = clamp(lim - (si - 1), 0, 1);
            if (fr <= 0) break;
            ctx.lineTo(pts[si - 1][0] + (pts[si][0] - pts[si - 1][0]) * fr,
                       pts[si - 1][1] + (pts[si][1] - pts[si - 1][1]) * fr);
          }
          ctx.stroke();
        }
        pts.forEach(function (pt, i3) {
          var born = fx ? (p * (pts.length - 1) >= i3 - 0.2 ? 1 : 0.25) : 1;
          ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * boost * born) + ')';
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], Math.max(0.8, r * 0.13) * (fx && born > 0.5 ? 1.5 : 1), 0, TAU);
          ctx.fill();
        });
        ctx.restore();
        this.glow(x, y, r * 2.2, c, 0.12 * boost);
        break;
      }

      case 'binary': {
        var sep = r * 1.15 * (1 + 0.5 * e), ab = t * 0.6 + seed + spin * 2.6;
        var x1 = x + Math.cos(ab) * sep, y1 = y + Math.sin(ab) * sep;
        var x2 = x - Math.cos(ab) * sep, y2 = y - Math.sin(ab) * sep;
        this.glow(x1, y1, r * 1.9, c, 0.6 * boost);
        this.glow(x2, y2, r * 1.5, '#ffffff', 0.45 * boost);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x1, y1, Math.max(0.8, r * 0.4), 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x2, y2, Math.max(0.6, r * 0.3), 0, TAU); ctx.fill();
        break;
      }

      case 'pulsar': {
        // no clique, os pulsos aceleram
        var beat = Math.pow(0.5 + 0.5 * Math.sin((t + (fx ? p * p * 6 : 0)) * 3.4 + seed), 3);
        this.glow(x, y, r * (2 + beat * 4), c, (0.25 + beat * 0.4) * boost);
        ctx.strokeStyle = rgba('#ffffff', (0.15 + beat * 0.5) * boost);
        ctx.lineWidth = Math.max(0.4, r * 0.08);
        ctx.beginPath(); ctx.arc(x, y, r * (1 + beat * 2.4), 0, TAU); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y, Math.max(1, r * 0.5), 0, TAU); ctx.fill();
        break;
      }

      case 'planet':
      case 'ringed': {
        var L = this.luz(n, x, y);
        this.glow(x, y, r * 2.6, c, 0.26 * boost);

        // os anéis ficam no plano do disco do nível, como os de Saturno.
        // A metade de trás é desenhada antes do planeta e a da frente
        // depois — é isso que faz o anel passar por trás e por diante.
        var anelSq = this.SIN3 * 0.92;
        function anel(de, ate) {
          ctx.save();
          ctx.translate(x, y);
          ctx.strokeStyle = rgba(c, 0.6 * boost);
          ctx.lineWidth = Math.max(0.6, r * 0.16);
          ctx.beginPath(); ctx.ellipse(0, 0, r * 1.9, r * 1.9 * anelSq, 0, de, ate); ctx.stroke();
          ctx.strokeStyle = rgba('#ffffff', 0.3 * boost);
          ctx.lineWidth = Math.max(0.3, r * 0.07);
          ctx.beginPath(); ctx.ellipse(0, 0, r * 2.2, r * 2.2 * anelSq, 0, de, ate); ctx.stroke();
          ctx.restore();
        }
        if (sh === 'ringed') anel(Math.PI, TAU);          // metade de trás

        var pg = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
        pg.addColorStop(0, '#ffffff');
        pg.addColorStop(0.35, c);
        pg.addColorStop(1, rgba(c, 0.55));
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        this.relevo(x, y, r, L[2], L[0], L[1], boost);

        if (sh === 'ringed') anel(0, Math.PI);            // metade da frente
        break;
      }

      case 'moon': {
        var Lm = this.luz(n, x, y);
        this.glow(x, y, r * 3, c, 0.3 * boost);
        ctx.fillStyle = '#eef4ff';
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        // a lua é quem mais pede isso: a fase vem da posição no disco
        if (!fx) this.relevo(x, y, r, Lm[2], Lm[0], Lm[1], boost);
        // no clique, a sombra atravessa a lua: as fases em segundos
        if (fx) {
          ctx.save();
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
          ctx.fillStyle = 'rgba(2,4,12,.93)';
          ctx.beginPath();
          ctx.arc(x + (p * 4 - 2) * r, y, r * 1.02, 0, TAU);
          ctx.fill();
          ctx.restore();
          ctx.strokeStyle = 'rgba(226,238,255,' + (0.5 * k) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
        }
        break;
      }

      default: { // 'star'
        var tw2 = 0.85 + 0.15 * Math.sin(t * 1.9 + seed);
        this.glow(x, y, r * 4 * tw2 * (1 + 0.7 * e), c, 0.35 * boost);
        ctx.save();
        ctx.translate(x, y);
        // as pontas de difração se esticam no clique
        var arm = r * 2.1 * (1 + 2.1 * e);
        ctx.rotate(fx ? spin * 0.12 : 0);
        ctx.strokeStyle = rgba('#ffffff', 0.55 * boost);
        ctx.lineWidth = Math.max(0.4, r * 0.11);
        ctx.beginPath();
        ctx.moveTo(-arm, 0); ctx.lineTo(arm, 0);
        ctx.moveTo(0, -arm); ctx.lineTo(0, arm);
        if (fx) {
          var d45 = arm * 0.5;
          ctx.moveTo(-d45, -d45); ctx.lineTo(d45, d45);
          ctx.moveTo(d45, -d45); ctx.lineTo(-d45, d45);
        }
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y, Math.max(1, r * 0.62), 0, TAU); ctx.fill();
      }
    }

    // aro de seleção
    if (this.selected === n.id || this.connectFrom === n.id) {
      ctx.strokeStyle = this.connectFrom === n.id ? 'rgba(160,200,255,.95)' : 'rgba(255,255,255,.8)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(x, y, r * 2.1 + 7, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    } else if (this.hover === n.id) {
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r * 2.1 + 6, 0, TAU); ctx.stroke();
    }
  },

  /* ═══════════ EFEITOS DE CLIQUE (camada de cima) ═══════════ */
  drawFxFor: function (n, ty, x, y, r, fx) {
    var ctx = this.ctx, c = ty.color, i;
    var p = fx.p, k = 1 - p, e = Math.sin(p * Math.PI);
    var sd = fx.seed;
    var sh = ty.shape || 'star';
    // espessuras com teto: em zoom alto o efeito não vira um borrão
    var W1 = Math.max(0.9, Math.min(5.5, r * 0.22));
    var W2 = Math.max(0.5, Math.min(2.4, r * 0.1));
    ctx.save();

    switch (sh) {

      /* supernova: explode de verdade */
      case 'burst': {
        var R = r * 1.6 + p * r * 5;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.65 * k * k) + ')';
        ctx.lineWidth = W1 * k;
        ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
        ctx.strokeStyle = rgba(c, 0.5 * k);
        ctx.lineWidth = W2 * 1.4 * k;
        ctx.beginPath(); ctx.arc(x, y, R * 0.64, 0, TAU); ctx.stroke();
        for (i = 0; i < 16; i++) {
          var aa = (TAU / 16) * i + sd;
          var l0 = r * 1.3 + p * r * 4.2, l1 = l0 + r * 1.3 * k;
          ctx.strokeStyle = 'rgba(255,240,225,' + (0.55 * k) + ')';
          ctx.lineWidth = W2 * 0.8;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(aa) * l0, y + Math.sin(aa) * l0);
          ctx.lineTo(x + Math.cos(aa) * l1, y + Math.sin(aa) * l1);
          ctx.stroke();
        }
        this.glow(x, y, r * 3 * e, '#ffffff', 0.6 * k);
        break;
      }

      /* buraco negro: tudo em volta é sugado em espiral */
      case 'blackhole': {
        for (i = 0; i < 46; i++) {
          var st = (p * 1.25 + (i % 11) / 11) % 1;
          var rad = r * 4.6 * (1 - st) + r * 0.9;
          var ang = i * 2.39996 + sd + (1 - st) * 7;
          var al = (1 - st) * 0.85 * k;
          ctx.fillStyle = i % 4 ? 'rgba(255,255,255,' + al.toFixed(3) + ')' : rgba(c, al);
          ctx.beginPath();
          ctx.arc(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad * 0.62,
                  Math.max(0.6, Math.min(2.4, r * 0.08)), 0, TAU);
          ctx.fill();
        }
        // anel de lente gravitacional se fechando
        ctx.strokeStyle = rgba(c, 0.5 * k);
        ctx.lineWidth = W2;
        ctx.beginPath(); ctx.arc(x, y, r * (1.2 + 3 * k), 0, TAU); ctx.stroke();
        break;
      }

      /* cometa: dispara e deixa rastro */
      case 'comet': {
        var dir = (n._a || 0) + Math.PI / 2;
        for (i = 1; i <= 9; i++) {
          var dd = i * r * 1.1 * (0.6 + e);
          ctx.fillStyle = 'rgba(210,244,255,' + (0.45 * k * (1 - i / 10)) + ')';
          ctx.beginPath();
          ctx.arc(x - Math.cos(dir) * dd, y - Math.sin(dir) * dd, r * 0.42 * (1 - i / 12), 0, TAU);
          ctx.fill();
        }
        this.glow(x, y, r * 3 * (1 + 0.6 * e), c, 0.45 * k);
        break;
      }

      /* galáxia: ondas saindo do núcleo */
      case 'spiral': {
        for (i = 0; i < 3; i++) {
          var pp = clamp(p * 1.5 - i * 0.22, 0, 1);
          if (pp <= 0) continue;
          ctx.strokeStyle = rgba(c, 0.4 * (1 - pp));
          ctx.lineWidth = W2 * (1 - pp);
          ctx.beginPath();
          ctx.ellipse(x, y, r * (1.2 + pp * 2.6), r * (1.2 + pp * 2.6) * 0.66, 0, 0, TAU);
          ctx.stroke();
        }
        this.glow(x, y, r * 1.9 * e, '#ffffff', 0.5 * k);
        break;
      }

      /* pulsar: pulsos em sequência */
      case 'pulsar': {
        for (i = 0; i < 4; i++) {
          var qp = clamp(p * 2.2 - i * 0.3, 0, 1);
          if (qp <= 0 || qp >= 1) continue;
          ctx.strokeStyle = rgba(c, 0.65 * (1 - qp));
          ctx.lineWidth = W1 * 0.7 * (1 - qp);
          ctx.beginPath(); ctx.arc(x, y, r * (1 + qp * 4.5), 0, TAU); ctx.stroke();
        }
        break;
      }

      /* asteroide: lasca pedaços */
      case 'rock': {
        for (i = 0; i < 9; i++) {
          var ra = i * 1.7 + sd, rd = r * (1.1 + p * 3);
          ctx.fillStyle = rgba(c, 0.7 * k * k);
          ctx.beginPath();
          ctx.arc(x + Math.cos(ra) * rd, y + Math.sin(ra) * rd * 0.8,
                  Math.max(0.5, Math.min(3, r * 0.15)) * k, 0, TAU);
          ctx.fill();
        }
        break;
      }

      /* nebulosa: faíscas se espalhando */
      case 'cloud': {
        for (i = 0; i < 18; i++) {
          var na = i * 2.39996 + sd, nd = r * (1 + p * 2.6);
          ctx.fillStyle = 'rgba(255,255,255,' + (0.6 * k * (0.4 + (i % 3) * 0.3)) + ')';
          ctx.beginPath();
          ctx.arc(x + Math.cos(na) * nd, y + Math.sin(na) * nd * 0.78,
                  Math.max(0.5, Math.min(2.2, r * 0.09)), 0, TAU);
          ctx.fill();
        }
        break;
      }

      /* quasar: clarão do disco */
      case 'quasar': {
        ctx.strokeStyle = rgba(c, 0.5 * k);
        ctx.lineWidth = W1 * 0.8 * k;
        ctx.beginPath();
        ctx.ellipse(x, y, r * (1.8 + p * 3), r * (0.5 + p * 0.9), 0, 0, TAU);
        ctx.stroke();
        break;
      }

      /* constelação: brilho que acompanha o traço */
      case 'constellation': {
        this.glow(x, y, r * 2.6 * e, c, 0.4 * k);
        break;
      }

      /* planeta com anel: os anéis se soltam */
      case 'ringed': {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-0.42);
        for (i = 0; i < 3; i++) {
          var rp = clamp(p * 1.4 - i * 0.2, 0, 1);
          if (rp <= 0) continue;
          ctx.strokeStyle = rgba(c, 0.5 * (1 - rp));
          ctx.lineWidth = W2 * (1 - rp);
          ctx.beginPath();
          ctx.ellipse(0, 0, r * (1.9 + rp * 2.4), r * (0.55 + rp * 0.75), 0, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }

      /* estrela: raios de luz */
      case 'star': {
        for (i = 0; i < 12; i++) {
          var sa = (TAU / 12) * i + sd * 0.3;
          var s0 = r * 1.5 + p * r * 3.4, s1 = s0 + r * 1.1 * k;
          ctx.strokeStyle = 'rgba(255,252,240,' + (0.5 * k * k) + ')';
          ctx.lineWidth = W2 * 0.8;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(sa) * s0, y + Math.sin(sa) * s0);
          ctx.lineTo(x + Math.cos(sa) * s1, y + Math.sin(sa) * s1);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * k * k) + ')';
        ctx.lineWidth = W1 * 0.8 * k;
        ctx.beginPath(); ctx.arc(x, y, r * 1.8 + p * r * 4, 0, TAU); ctx.stroke();
        break;
      }

      /* lua, planeta e qualquer tipo novo: anel de luz limpo */
      default: {
        ctx.strokeStyle = rgba(c, 0.6 * k * k);
        ctx.lineWidth = W1 * k;
        ctx.beginPath(); ctx.arc(x, y, r * 1.4 + p * r * 3.6, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.4 * k) + ')';
        ctx.lineWidth = W2 * k;
        ctx.beginPath(); ctx.arc(x, y, r * 1.2 + p * r * 2.2, 0, TAU); ctx.stroke();
      }
    }

    ctx.restore();
  },

  /* explosão inicial */
  drawBang: function () {
    var ctx = this.ctx, T = this.bangT, cx = this.W / 2, cy = this.H / 2;

    if (T < 0.55) {
      ctx.fillStyle = 'rgba(255,255,255,' + clamp(1 - T / 0.55, 0, 1) * 0.9 + ')';
      ctx.fillRect(0, 0, this.W, this.H);
    }
    // onda de choque
    var shock = T * 1400;
    if (T < 1.8) {
      ctx.strokeStyle = 'rgba(180,215,255,' + clamp(1 - T / 1.8, 0, 1) * 0.55 + ')';
      ctx.lineWidth = clamp(26 - T * 14, 1, 26);
      ctx.beginPath(); ctx.arc(cx, cy, shock, 0, TAU); ctx.stroke();
    }
    // partículas
    var fade = clamp(1 - (T - 0.6) / 1.6, 0, 1);
    if (fade > 0) {
      this.parts.forEach(function (p) {
        p.d = p.sp * T * (1 + T * 0.55);
        var x = cx + Math.cos(p.a) * p.d, y = cy + Math.sin(p.a) * p.d;
        var x2 = cx + Math.cos(p.a) * p.d * 0.93, y2 = cy + Math.sin(p.a) * p.d * 0.93;
        ctx.strokeStyle = p.h === '#ffffff'
          ? 'rgba(255,255,255,' + (fade * 0.85) + ')'
          : 'rgba(188,214,255,' + (fade * 0.7) + ')';
        ctx.lineWidth = p.r;
        ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x, y); ctx.stroke();
      });
    }
  },

  /* ═══════════ INTERAÇÃO ═══════════ */
  nodeAt: function (sx, sy) {
    var self = this, best = null, bestD = 1e9;
    this.order.forEach(function (n) {
      if (!self.vis[n.id]) return;
      var s = self.w2s(n._x, n._y);
      var r = Math.max(1.2, U.type(n.type).size * self.cam.z * (n._s || 1));
      var hit = Math.max(r * 1.25 + 7, 13);
      var dx = sx - s[0], dy = sy - s[1], d = Math.sqrt(dx * dx + dy * dy);
      // dois astros sobrepostos: ganha o que está mais à frente
      var score = d - (n._s || 1) * 6;
      if (d < hit && score < bestD) { bestD = score; best = n; }
    });
    return best;
  },

  select: function (id) {
    this.selected = id;
    if (this.onSelect) this.onSelect(id ? this.index[id] : null);
  },

  bindPointer: function () {
    var self = this, cv = this.canvas;
    var pointers = {}, panning = false, moved = 0, startCam = null, last = null, pinch = null;

    function pos(e) {
      var r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }

    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId);
      var p = pos(e);
      pointers[e.pointerId] = p;
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: self.cam.tz };
        panning = false; self.drag = null;
        return;
      }
      moved = 0; last = p;
      var hit = self.nodeAt(p[0], p[1]);
      if (hit && self.phase === 'live') {
        self.drag = { id: hit.id, started: false };
      } else {
        panning = true;
        startCam = { x: self.cam.tx, y: self.cam.ty };
        cv.classList.add('grabbing');
      }
    });

    cv.addEventListener('pointermove', function (e) {
      var p = pos(e);
      self.mouse = p;
      if (pointers[e.pointerId]) pointers[e.pointerId] = p;

      var ids = Object.keys(pointers);
      if (pinch && ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        self.cam.tz = self.cam.z = clamp(pinch.z * (d / pinch.d), 0.12, 4);
        return;
      }

      if (last) moved += Math.hypot(p[0] - last[0], p[1] - last[1]);

      if (self.drag && moved > 4) {
        self.drag.started = true;
        var n = self.index[self.drag.id];
        var vn = self.viewNode();
        if (n && (!vn || vn.id !== n.id)) {
          var w = self.s2w(p[0], p[1]);
          // o centro do nível está sempre na origem; no disco 3D é preciso
          // desfazer a inclinação e a perspectiva para achar a órbita
          var pol = self.unproj3(w[0], w[1]);
          var r = Math.max(0, pol[0]);
          var ang = pol[1];
          n.orbit = n.orbit || { r: r, a0: 0, speed: 0 };
          n.orbit.r = r;
          n.orbit.a0 = ang - self.t * (n.orbit.speed || 0);
          n.orbit.fix = 1;   // colocado à mão: a organização respeita
        }
      } else if (panning && last) {
        self.cam.tx = self.cam.x -= (p[0] - last[0]) / self.cam.z;
        self.cam.ty = self.cam.y -= (p[1] - last[1]) / self.cam.z;
      } else if (!self.drag) {
        var h = self.nodeAt(p[0], p[1]);
        var id = h ? h.id : null;
        if (id !== self.hover) {
          self.hover = id;
          cv.classList.toggle('pointing', !!id && !self.connectFrom);
          if (self.onHoverChange) self.onHoverChange(h);
        }
      }
      last = p;
    });

    function end(e) {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) pinch = null;
      cv.classList.remove('grabbing');
      if (self.drag) {
        if (self.drag.started) { U.save(); }
        else { self.click(self.drag.id); }
        self.drag = null;
      } else if (panning && moved < 5) {
        self.click(null);
      }
      panning = false; last = null;
    }
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);

    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = pos(e);
      var before = self.s2w(p[0], p[1]);
      var f = Math.pow(1.0016, -e.deltaY);
      self.cam.tz = self.cam.z = clamp(self.cam.z * f, 0.12, 4);
      var after = self.s2w(p[0], p[1]);
      self.cam.tx = self.cam.x += before[0] - after[0];
      self.cam.ty = self.cam.y += before[1] - after[1];
    }, { passive: false });

    cv.addEventListener('dblclick', function (e) {
      var p = pos(e);
      var h = self.nodeAt(p[0], p[1]);
      // duplo clique no vazio: sobe um nível
      if (!h) { self.up(); return; }
      var v = self.viewNode();
      if (v && h.id === v.id) self.up();
    });
  },

  click: function (id) {
    if (this.phase !== 'live' || this.trans) return;
    if (this.connectFrom) {
      if (id && id !== this.connectFrom) {
        if (global.UI) UI.finishConnect(id);
      } else if (!id) {
        if (global.UI) UI.cancelConnect();
      }
      return;
    }
    if (!id) { this.select(null); return; }
    var v = this.viewNode();
    this.pulse(id);
    // clicar no astro do centro abre só o painel dele
    if (v && id === v.id) { this.select(id); return; }
    // clicar num astro que tem um sistema dentro: entra nele, sem abrir painel
    if ((this.kids[id] || []).length) {
      this.select(null);
      this.pendingEnter = { id: id, t: 0.4 };
      return;
    }
    this.select(id);
  }
};

var FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Arial, sans-serif';

global.Scene = Scene;
})(window);
