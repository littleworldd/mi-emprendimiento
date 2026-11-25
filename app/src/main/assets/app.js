'use strict';
/* ================= Utilidades ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const miles = n => String(Math.abs(Math.round(n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmt = n => { n = Math.round(n || 0); return (n < 0 ? '-' : '') + '$' + miles(n); };
const fmtNum = n => String(Math.round((n || 0) * 100) / 100).replace('.', ',');
const pad = n => String(n).padStart(2, '0');
const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const fechaTxt = iso => iso ? iso.split('-').reverse().join('-') : '';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const parseMonto = v => parseInt(String(v == null ? '' : v).replace(/[^\d]/g, ''), 10) || 0;
const parseCant = v => { const n = parseFloat(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; };
const norm = s => String(s || '').trim().toLowerCase();
const clone = o => JSON.parse(JSON.stringify(o));
const suma = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
const byNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
const byFechaDesc = (a, b) => b.fecha.localeCompare(a.fecha) || String(b.creado || '').localeCompare(String(a.creado || ''));
const byFechaAsc = (a, b) => -byFechaDesc(a, b);
function fechaBonita(iso) {
  const p = iso.split('-').map(Number); const d = new Date(p[0], p[1] - 1, p[2]);
  const esHoy = iso === hoy();
  const dia = DIAS[d.getDay()];
  return (esHoy ? 'Hoy · ' + dia : dia.charAt(0).toUpperCase() + dia.slice(1)) + ' ' + p[2] + ' de ' + MESES[p[1] - 1].toLowerCase() + ' ' + p[0];
}
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const COLORES = ['#D81B60', '#1E88E5', '#43A047', '#FB8C00'];

/* ================= Datos (todo local) ================= */
function normalizar(d) {
  d = d && typeof d === 'object' ? d : {};
  ['productos', 'ventas', 'gastos', 'inversiones'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  if (!Array.isArray(d.tiposGasto)) d.tiposGasto = ['Mercadería', 'Insumos', 'Envases y embalaje', 'Transporte', 'Otros'];
  d.config = Object.assign({ nombre: 'Susana', creado: new Date().toISOString(), ultimoAuto: null, ultimoRespaldo: null, ultimoArchivo: '', respaldos: [] }, d.config || {});
  d.version = 1;
  return d;
}
const Store = {
  load() {
    let raw = null;
    try { raw = window.AndroidApp ? AndroidApp.loadData() : localStorage.getItem('susana_datos'); } catch (e) { }
    let d = null;
    try { d = raw ? JSON.parse(raw) : null; } catch (e) { d = null; }
    return normalizar(d);
  },
  save() {
    const s = JSON.stringify(DB);
    try {
      if (window.AndroidApp) { if (!AndroidApp.saveData(s)) toast('⚠️ No se pudo guardar. Intenta de nuevo.'); }
      else localStorage.setItem('susana_datos', s);
    } catch (e) { toast('⚠️ Error al guardar'); }
  }
};
let DB = Store.load();
const prodById = id => DB.productos.find(p => p.id === id);
const ventaById = id => DB.ventas.find(v => v.id === id);
const hayDatos = () => DB.ventas.length + DB.gastos.length + DB.inversiones.length + DB.productos.length > 0;

/* ================= Estado de pantalla ================= */
const ahora = new Date();
let P = { tipo: 'mes', y: ahora.getFullYear(), m: ahora.getMonth() };
let route = { tab: 'inicio', sub: null };
let rankModo = 'cant';
let compSel = null;
let ctx = null;

function enPeriodo(fecha) {
  if (P.tipo === 'todo') return true;
  return !!fecha && fecha.slice(0, 7) === P.y + '-' + pad(P.m + 1);
}
function periodoNav() {
  const esTodo = P.tipo === 'todo';
  const lbl = esTodo ? 'Todo el historial' : MESES[P.m] + ' ' + P.y;
  return `<div class="pnav"><button class="pa" data-act="pmov" data-d="-1" ${esTodo ? 'disabled' : ''}>‹</button>
    <button class="pl" data-act="ptoggle">${lbl}<small>${esTodo ? 'tocar para ver por mes' : 'tocar para ver todo'}</small></button>
    <button class="pa" data-act="pmov" data-d="1" ${esTodo ? 'disabled' : ''}>›</button></div>`;
}

/* ================= Cálculos ================= */
function resumen(filtro) {
  const r = { ventas: 0, nVentas: 0, efectivo: 0, transf: 0, porCobrar: 0, nDeuda: 0, gastos: 0, nGastos: 0 };
  DB.ventas.forEach(v => {
    if (!filtro(v.fecha)) return;
    r.ventas += v.total; r.nVentas++;
    if (v.metodo === 'efectivo') r.efectivo += v.total;
    else if (v.metodo === 'transferencia') r.transf += v.total;
    else if (v.pagada) { if (v.metodoPago === 'transferencia') r.transf += v.total; else r.efectivo += v.total; }
    else { r.porCobrar += v.total; r.nDeuda++; }
  });
  DB.gastos.forEach(g => { if (filtro(g.fecha)) { r.gastos += g.total; r.nGastos++; } });
  r.ganancia = r.ventas - r.gastos;
  r.recibido = r.efectivo + r.transf;
  return r;
}
function claveItem(it) { return it.productoId && prodById(it.productoId) ? it.productoId : 'n:' + norm(it.nombre); }
function ranking(filtro, modo) {
  const m = {};
  DB.ventas.forEach(v => {
    if (!filtro(v.fecha)) return;
    v.items.forEach(it => {
      const k = claveItem(it);
      const p = prodById(it.productoId);
      if (!m[k]) m[k] = { key: k, nombre: p ? p.nombre : it.nombre, cant: 0, monto: 0 };
      m[k].cant += it.cantidad; m[k].monto += it.cantidad * it.precio;
    });
  });
  const f = modo === 'monto' ? 'monto' : 'cant';
  return Object.values(m).sort((a, b) => b[f] - a[f] || b.monto - a.monto);
}
const deudasPendientes = () => DB.ventas.filter(v => v.metodo === 'debe' && !v.pagada);
function ultimosMeses(n) {
  const out = []; const d = new Date(); d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: x.getFullYear() + '-' + pad(x.getMonth() + 1), label: MESES[x.getMonth()].slice(0, 3) + ' ' + String(x.getFullYear()).slice(2) });
  }
  return out;
}
const resumenItems = v => v.items.map(i => fmtNum(i.cantidad) + '× ' + i.nombre).join(', ');

/* ================= Componentes ================= */
const head = (t, back) => `<div class="head">${back ? '<button class="back" data-act="back">‹</button>' : ''}<h1>${t}</h1></div>`;
const vacio = (txt, act, btn) => `<div class="card"><p class="vacio">${txt}</p>${act ? `<button class="btn pri full" data-act="${act}">${btn}</button>` : ''}</div>`;
const fab = act => `<button class="fab" data-act="${act}" aria-label="Agregar">＋</button>`;
function barras(list, modo) {
  const tot = suma(list, x => x[modo]) || 1;
  const max = Math.max.apply(null, list.map(x => x[modo])) || 1;
  return '<div class="bars">' + list.map((x, i) => `<div class="bar ${i === 0 ? 'b1' : ''}">
    <div class="bl"><span>${i === 0 ? '🏆 ' : (i + 1) + '. '}${esc(x.nombre)}</span><b>${modo === 'cant' ? fmtNum(x.cant) + ' u.' : fmt(x.monto)}</b></div>
    <div class="bt"><div style="width:${Math.max(3, x[modo] / max * 100)}%"></div></div>
    <small>${modo === 'cant' ? fmt(x.monto) : fmtNum(x.cant) + ' unidades'} · ${Math.round(x[modo] / tot * 100)}% del total</small></div>`).join('') + '</div>';
}
function badgeMetodo(v) {
  if (v.metodo === 'efectivo') return '<span class="bdg ok">Efectivo</span>';
  if (v.metodo === 'transferencia') return '<span class="bdg blue">Transferencia</span>';
  return v.pagada ? `<span class="bdg gray">Fiado · pagó por ${v.metodoPago === 'transferencia' ? 'transf.' : 'efectivo'}</span>` : '<span class="bdg warn">Debe</span>';
}
function agrupar(list, fn) {
  let out = '', last = null;
  list.forEach(x => { if (x.fecha !== last) { out += `<div class="dhead">${fechaBonita(x.fecha)}</div>`; last = x.fecha; } out += fn(x); });
  return out;
}
function proximoAuto() {
  const base = new Date(DB.config.ultimoAuto || DB.config.creado);
  return new Date(base.getTime() + 30 * 864e5);
}
function textoRespaldo() {
  const dias = Math.max(0, Math.ceil((proximoAuto() - new Date()) / 864e5));
  const ult = DB.config.ultimoRespaldo ? 'Último: ' + fechaTxt(DB.config.ultimoRespaldo.slice(0, 10)) + ' · ' : '';
  return ult + 'Próximo respaldo automático en ' + dias + ' día' + (dias === 1 ? '' : 's');
}

/* ================= Pantallas ================= */
function vInicio() {
  const r = resumen(enPeriodo);
  const pend = deudasPendientes();
  const top = ranking(enPeriodo, 'cant').slice(0, 5);
  const d = new Date();
  return `<section class="hero"><div class="hola">¡Hola, ${esc(DB.config.nombre)}! 🌸</div>
    <div class="sub">Bienvenida a tu emprendimiento</div>
    <div class="hoy">${DIAS[d.getDay()].charAt(0).toUpperCase() + DIAS[d.getDay()].slice(1)} ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()} de ${d.getFullYear()}</div></section>
  ${periodoNav()}
  <div class="grid2">
    <div class="stat" data-act="tab" data-tab="ventas"><span>Ventas</span><b>${fmt(r.ventas)}</b><small>${r.nVentas} venta${r.nVentas === 1 ? '' : 's'}</small></div>
    <div class="stat" data-act="tab" data-tab="gastos"><span>Gastos</span><b>${fmt(r.gastos)}</b><small>${r.nGastos} registro${r.nGastos === 1 ? '' : 's'}</small></div>
  </div>
  <div class="stat big ${r.ganancia >= 0 ? 'pos' : 'neg'}"><span>Ganancia (ventas − gastos)</span><b>${fmt(r.ganancia)}</b>
    ${r.porCobrar ? `<small>Incluye ${fmt(r.porCobrar)} que aún te deben</small>` : ''}</div>
  <div class="card"><div class="ctitle">Dinero recibido</div>
    <div class="kv"><span>💵 Efectivo</span><b>${fmt(r.efectivo)}</b></div>
    <div class="kv"><span>🏦 Transferencia</span><b>${fmt(r.transf)}</b></div></div>
  <div class="card link warn" data-act="sub" data-sub="deudas"><div><div class="ctitle">📒 Te deben</div>
    <small>${pend.length} deuda${pend.length === 1 ? '' : 's'} pendiente${pend.length === 1 ? '' : 's'}</small></div><b>${fmt(suma(pend, v => v.total))} ›</b></div>
  <div class="acciones"><button class="btn pri" data-act="nuevaVenta">＋ Venta</button><button class="btn sec" data-act="nuevoGasto">＋ Gasto</button></div>
  <div class="card"><div class="ctitle">⭐ Lo más vendido</div>
    ${top.length ? barras(top, 'cant') : '<p class="vacio">Aún no hay ventas en este período.</p>'}
    <button class="lnk" data-act="tab" data-tab="reportes">Ver reportes y comparar ›</button></div>
  <div class="card mini" data-act="sub" data-sub="respaldo">💾 ${textoRespaldo()}</div>`;
}

function vVentas() {
  const list = DB.ventas.filter(v => enPeriodo(v.fecha)).sort(byFechaDesc);
  return head('Ventas') + periodoNav() +
    `<div class="sumline">${list.length} venta${list.length === 1 ? '' : 's'} · <b>${fmt(suma(list, v => v.total))}</b></div>` +
    (list.length ? agrupar(list, v => `<div class="item" data-act="editVenta" data-id="${v.id}">
      <div class="im"><div class="it">${esc(resumenItems(v))}</div><div class="is">${v.cliente ? esc(v.cliente) + ' · ' : ''}${badgeMetodo(v)}</div></div>
      <b class="iv">${fmt(v.total)}</b></div>`)
      : vacio('Todavía no hay ventas en este período.', 'nuevaVenta', '＋ Registrar venta')) + fab('nuevaVenta');
}

function vGastos() {
  const list = DB.gastos.filter(g => enPeriodo(g.fecha)).sort(byFechaDesc);
  const porTipo = {};
  list.forEach(g => { porTipo[g.tipo] = (porTipo[g.tipo] || 0) + g.total; });
  const chips = Object.keys(porTipo).sort((a, b) => porTipo[b] - porTipo[a]).map(t => `<span class="bdg pink">${esc(t)}: ${fmt(porTipo[t])}</span>`).join(' ');
  return head('Gastos') + periodoNav() +
    `<div class="sumline">${list.length} gasto${list.length === 1 ? '' : 's'} · <b>${fmt(suma(list, g => g.total))}</b></div>` +
    (chips ? `<div class="chips">${chips}</div>` : '') +
    (list.length ? agrupar(list, g => `<div class="item" data-act="editGasto" data-id="${g.id}">
      <div class="im"><div class="it">${esc(g.items.map(i => fmtNum(i.cantidad) + '× ' + i.concepto).join(', '))}</div>
      <div class="is"><span class="bdg pink">${esc(g.tipo)}</span>${g.nota ? ' · ' + esc(g.nota) : ''}</div></div>
      <b class="iv">${fmt(g.total)}</b></div>`)
      : vacio('Todavía no hay gastos en este período.', 'nuevoGasto', '＋ Registrar gasto')) + fab('nuevoGasto');
}

function vReportes() {
  const rk = ranking(enPeriodo, rankModo);
  const todos = ranking(() => true, 'cant');
  if (!compSel) compSel = todos.slice(0, 3).map(x => x.key);
  compSel = compSel.filter(k => todos.some(x => x.key === k));
  const meses = ultimosMeses(6);
  const uni = (k, ym) => { let c = 0; DB.ventas.forEach(v => { if (v.fecha.slice(0, 7) === ym) v.items.forEach(it => { if (claveItem(it) === k) c += it.cantidad; }); }); return c; };
  const sel = compSel.map(k => todos.find(x => x.key === k));
  const mat = meses.map(m => sel.map(s => uni(s.key, m.key)));
  const maxU = Math.max(1, ...mat.flat());
  const tabla = sel.length ? `<div class="scroll"><table class="tbl"><tr><th>Mes</th>${sel.map((s, i) => `<th><span class="dot" style="background:${COLORES[i]}"></span>${esc(s.nombre)}</th>`).join('')}</tr>
    ${meses.map((m, mi) => `<tr><td>${m.label}</td>${sel.map((s, i) => `<td>${fmtNum(mat[mi][i])}<div class="mb" style="width:${mat[mi][i] / maxU * 100}%;background:${COLORES[i]}"></div></td>`).join('')}</tr>`).join('')}
    <tr class="tot"><td>Total 6 meses</td>${sel.map((s, i) => `<td>${fmtNum(suma(mat, r => r[i]))}</td>`).join('')}</tr></table></div>`
    : '<p class="vacio">Elige productos arriba para compararlos.</p>';

  const gt = {};
  DB.gastos.filter(g => enPeriodo(g.fecha)).forEach(g => { gt[g.tipo] = (gt[g.tipo] || 0) + g.total; });
  const gList = Object.keys(gt).map(t => ({ nombre: t, monto: gt[t], cant: 0 })).sort((a, b) => b.monto - a.monto);
  const gMax = gList.length ? gList[0].monto : 1, gTot = suma(gList, x => x.monto) || 1;

  const filas = meses.slice().reverse().map(m => { const r = resumen(f => !!f && f.slice(0, 7) === m.key); return `<tr><td>${m.label}</td><td>${fmt(r.ventas)}</td><td>${fmt(r.gastos)}</td><td class="${r.ganancia < 0 ? 'neg' : 'pos'}"><b>${fmt(r.ganancia)}</b></td></tr>`; }).join('');

  return head('Reportes') + periodoNav() +
    `<div class="card"><div class="ctitle">🏆 Productos más vendidos</div>
      <div class="seg sm"><button data-act="rankModo" data-m="cant" class="${rankModo === 'cant' ? 'on' : ''}">Por cantidad</button><button data-act="rankModo" data-m="monto" class="${rankModo === 'monto' ? 'on' : ''}">Por dinero</button></div>
      <div style="height:10px"></div>${rk.length ? barras(rk, rankModo) : '<p class="vacio">Sin ventas en este período.</p>'}</div>
    <div class="card"><div class="ctitle">⚖️ Comparar productos (unidades por mes)</div>
      <div class="help">Toca hasta 4 productos para compararlos.</div>
      <div class="chips">${todos.map(x => { const i = compSel.indexOf(x.key); return `<button class="chip ${i >= 0 ? 'on' : ''}" ${i >= 0 ? `style="background:${COLORES[i]}"` : ''} data-act="compToggle" data-k="${esc(x.key)}">${esc(x.nombre)}</button>`; }).join('') || '<span class="help">Aún no hay ventas.</span>'}</div>
      ${tabla}</div>
    <div class="card"><div class="ctitle">🧾 Gastos por tipo</div>
      ${gList.length ? '<div class="bars">' + gList.map(x => `<div class="bar"><div class="bl"><span>${esc(x.nombre)}</span><b>${fmt(x.monto)}</b></div><div class="bt"><div style="width:${Math.max(3, x.monto / gMax * 100)}%"></div></div><small>${Math.round(x.monto / gTot * 100)}% de los gastos</small></div>`).join('') + '</div>' : '<p class="vacio">Sin gastos en este período.</p>'}</div>
    <div class="card"><div class="ctitle">📈 Ganancia por mes</div>
      <div class="scroll"><table class="tbl"><tr><th>Mes</th><th>Ventas</th><th>Gastos</th><th>Ganancia</th></tr>${filas}</table></div></div>`;
}

function vMas() {
  const items = [
    ['productos', '🏷️', 'Mis productos', 'Nombres y precios de venta'],
    ['tipos', '🗂️', 'Tipos de gasto', 'Mercadería, insumos y los que quieras'],
    ['inversion', '💰', 'Inversión', 'Lo invertido y cuánto has recuperado'],
    ['deudas', '📒', 'Deudas', 'Quién te debe y registrar pagos'],
    ['respaldo', '💾', 'Respaldo y Excel', 'Exportar, compartir y restaurar'],
    ['ajustes', '⚙️', 'Ajustes', 'Nombre de la dueña']
  ];
  return head('Más') + '<div class="menu">' + items.map(i => `<div class="item" data-act="sub" data-sub="${i[0]}"><span class="ico">${i[1]}</span>
    <div class="im"><div class="it">${i[2]}</div><div class="is">${i[3]}</div></div><span class="chev">›</span></div>`).join('') + '</div>' +
    '<p class="help" style="text-align:center;margin-top:20px">Todos los datos se guardan solo en este teléfono.<br>La app no usa internet.</p>';
}

function vProductos() {
  const vend = {}; DB.ventas.forEach(v => v.items.forEach(it => { if (it.productoId) vend[it.productoId] = (vend[it.productoId] || 0) + it.cantidad; }));
  const list = DB.productos.slice().sort(byNombre);
  return head('Mis productos', true) +
    '<p class="help">Los productos nuevos que escribas al registrar una venta se agregan aquí solos. Puedes cambiar nombres y precios cuando quieras.</p>' +
    (list.length ? list.map(p => `<div class="item" data-act="editProd" data-id="${p.id}"><div class="im"><div class="it">${esc(p.nombre)}</div>
      <div class="is">${vend[p.id] ? fmtNum(vend[p.id]) + ' vendidos en total' : 'Sin ventas aún'}</div></div><b class="iv">${p.precio ? fmt(p.precio) : '—'}</b></div>`).join('')
      : vacio('Aún no tienes productos.', 'nuevoProd', '＋ Agregar producto')) + fab('nuevoProd');
}

function vTipos() {
  const uso = {}; DB.gastos.forEach(g => { uso[g.tipo] = (uso[g.tipo] || 0) + 1; });
  return head('Tipos de gasto', true) + '<p class="help">Clasifica tus gastos como quieras. Toca uno para cambiarle el nombre o eliminarlo.</p>' +
    (DB.tiposGasto.length ? DB.tiposGasto.map((t, i) => `<div class="item" data-act="editTipo" data-i="${i}"><div class="im"><div class="it">${esc(t)}</div>
      <div class="is">${uso[t] || 0} gasto${uso[t] === 1 ? '' : 's'}</div></div><span class="chev">›</span></div>`).join('') : vacio('No hay tipos de gasto.')) + fab('nuevoTipo');
}

function vInversion() {
  const inv = suma(DB.inversiones, x => x.monto);
  const gan = resumen(() => true).ganancia;
  const pct = inv ? Math.max(0, Math.min(100, gan / inv * 100)) : 0;
  const msg = !inv ? 'Registra lo que inviertes en tu emprendimiento para ver cuánto has recuperado.'
    : gan >= inv ? `🎉 ¡Ya recuperaste tu inversión! Ganancia por sobre lo invertido: <b>${fmt(gan - inv)}</b>`
      : `Te falta recuperar <b>${fmt(inv - gan)}</b>`;
  const list = DB.inversiones.slice().sort(byFechaDesc);
  return head('Inversión', true) +
    `<div class="grid2"><div class="stat"><span>Total invertido</span><b>${fmt(inv)}</b></div>
     <div class="stat"><span>Ganancia acumulada</span><b class="${gan < 0 ? 'neg' : 'pos'}">${fmt(gan)}</b><small>ventas − gastos (todo)</small></div></div>
    <div class="card"><div class="ctitle">Recuperado: ${Math.round(pct)}%</div><div class="prog"><div style="width:${pct}%"></div></div><div>${msg}</div></div>
    <h3>Lo invertido</h3>` +
    (list.length ? agrupar(list, x => `<div class="item" data-act="editInv" data-id="${x.id}"><div class="im"><div class="it">${esc(x.descripcion || 'Inversión')}</div></div><b class="iv">${fmt(x.monto)}</b></div>`)
      : vacio('Aún no registras inversiones.', 'nuevaInv', '＋ Agregar inversión')) + fab('nuevaInv');
}

function vDeudas() {
  const pend = deudasPendientes().sort(byFechaAsc);
  const porCli = {};
  pend.forEach(v => { const k = v.cliente.trim(); porCli[k] = (porCli[k] || 0) + v.total; });
  const clis = Object.keys(porCli).sort((a, b) => porCli[b] - porCli[a]);
  const pagadas = DB.ventas.filter(v => v.metodo === 'debe' && v.pagada).sort((a, b) => String(b.fechaPago).localeCompare(String(a.fechaPago))).slice(0, 30);
  return head('Deudas', true) +
    `<div class="stat big warnc"><span>Total por cobrar</span><b>${fmt(suma(pend, v => v.total))}</b><small>${pend.length} venta${pend.length === 1 ? '' : 's'} fiada${pend.length === 1 ? '' : 's'} sin pagar</small></div>` +
    (clis.length > 1 ? `<div class="card"><div class="ctitle">Por persona</div>${clis.map(c => `<div class="kv"><span>${esc(c)}</span><b>${fmt(porCli[c])}</b></div>`).join('')}</div>` : '') +
    '<h3>Pendientes</h3>' +
    (pend.length ? pend.map(v => `<div class="item"><div class="im" data-act="editVenta" data-id="${v.id}"><div class="it">${esc(v.cliente)}</div>
      <div class="is">${fechaTxt(v.fecha)} · ${esc(resumenItems(v))}</div></div>
      <div class="dr"><b>${fmt(v.total)}</b><button class="btn sm pri" data-act="pagar" data-id="${v.id}">Pagó ✓</button></div></div>`).join('')
      : vacio('¡Nadie te debe! 🎉')) +
    (pagadas.length ? '<h3>Pagadas</h3>' + pagadas.map(v => `<div class="item"><div class="im"><div class="it">${esc(v.cliente)}</div>
      <div class="is">Pagó el ${fechaTxt(v.fechaPago)} por ${v.metodoPago === 'transferencia' ? 'transferencia' : 'efectivo'} · venta del ${fechaTxt(v.fecha)}</div></div>
      <div class="dr"><b>${fmt(v.total)}</b><button class="btn sm ghost" data-act="despagar" data-id="${v.id}">Deshacer</button></div></div>`).join('') : '');
}

function vRespaldo() {
  const c = DB.config;
  const hist = (c.respaldos || []).slice(0, 12);
  return head('Respaldo y Excel', true) +
    `<div class="card"><div class="kv"><span>Último respaldo</span><b>${c.ultimoRespaldo ? fechaTxt(c.ultimoRespaldo.slice(0, 10)) : 'Aún no hay'}</b></div>
      <div class="kv"><span>Próximo automático</span><b>${fechaTxt(proximoAuto().toISOString().slice(0, 10))}</b></div></div>
    <p class="help">Cada 30 días la app guarda sola un <b>Excel</b> y una <b>copia de seguridad</b> en la carpeta <b>Descargas › Emprendimiento Susana</b> de tu teléfono. Nada se sube a internet.</p>
    <button class="btn pri full" data-act="exportar">📤 Exportar Excel ahora</button>
    ${c.ultimoArchivo && c.ultimoArchivo.indexOf('content://') === 0 ? `<div class="row"><button class="btn" data-act="abrirXls">📂 Abrir</button><button class="btn" data-act="compartirXls">📨 Compartir</button></div>` : ''}
    ${hist.length ? '<h3>Historial</h3><div class="card">' + hist.map(h => `<div class="kv"><span>${fechaTxt(h.fecha.slice(0, 10))} ${h.auto ? '<span class="bdg gray">automático</span>' : '<span class="bdg pink">manual</span>'}</span><small>${esc(h.archivo)}</small></div>`).join('') + '</div>' : ''}
    <h3>Restaurar</h3>
    <p class="help">Si cambias de teléfono o reinstalas la app, elige el archivo <b>.json</b> de un respaldo para recuperar todo.</p>
    <button class="btn ghost full" data-act="restaurar">♻️ Restaurar desde una copia (.json)</button>`;
}

function vAjustes() {
  return head('Ajustes', true) +
    `<label class="f">Nombre de la dueña<input id="aNombre" value="${esc(DB.config.nombre)}"></label>
    <button class="btn pri full" data-act="guardarAjustes">Guardar</button>
    <p class="help" style="margin-top:18px">Datos guardados: ${DB.ventas.length} ventas, ${DB.gastos.length} gastos, ${DB.productos.length} productos, ${DB.inversiones.length} inversiones.</p>`;
}
const SUBS = { productos: vProductos, tipos: vTipos, inversion: vInversion, deudas: vDeudas, respaldo: vRespaldo, ajustes: vAjustes };

function render() {
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === route.tab));
  let html = '';
  if (route.sub) html = SUBS[route.sub]();
  else html = { inicio: vInicio, ventas: vVentas, gastos: vGastos, reportes: vReportes, mas: vMas }[route.tab]();
  $('#view').innerHTML = html;
}
function go(tab, sub) { route = { tab: tab, sub: sub || null }; render(); window.scrollTo(0, 0); }

/* ================= Hoja de formularios ================= */
function openSheet(html) { $('#sheet').innerHTML = html; $('#sheetBg').classList.add('open'); $('#sheet').scrollTop = 0; document.body.style.overflow = 'hidden'; }
function closeSheet() { $('#sheetBg').classList.remove('open'); $('#sheet').innerHTML = ''; ctx = null; document.body.style.overflow = ''; }
const sheetAbierta = () => $('#sheetBg').classList.contains('open');

let dlgResolve = null;
function confirmar(msg, ok, peligro) {
  return new Promise(res => {
    const d = $('#dlg');
    d.innerHTML = `<div class="dbox"><p>${esc(msg)}</p><div class="row"><button class="btn ghost" data-dlg="0">Cancelar</button><button class="btn ${peligro ? 'danger' : 'pri'}" data-dlg="1">${esc(ok || 'Sí')}</button></div></div>`;
    d.classList.add('open'); dlgResolve = res;
  });
}
function cerrarDlg(v) { $('#dlg').classList.remove('open'); const r = dlgResolve; dlgResolve = null; if (r) r(v); }
let toastT = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2800); }

/* ---- líneas con cantidad × precio ---- */
function recalc() {
  let tot = 0;
  $$('#lineas .linea').forEach(ln => {
    const sub = parseCant($('.lCant', ln).value) * parseMonto($('.lPrecio', ln).value);
    tot += sub; $('.lSub b', ln).textContent = fmt(sub);
  });
  const t = $('#fTotal'); if (t) t.textContent = fmt(tot);
}
const filaCantPrecio = it => `<div class="lrow"><label>Cantidad<input class="lCant" inputmode="decimal" value="${fmtNum(it.cantidad || 1)}"></label>
  <label>Precio c/u<input class="lPrecio" inputmode="numeric" placeholder="$0" value="${it.precio ? miles(it.precio) : ''}"></label>
  <div class="lSub">Subtotal<b>$0</b></div></div>`;

/* ---- Venta ---- */
function optsProductos(sel) {
  return '<option value="">Elegir producto…</option>' + DB.productos.slice().sort(byNombre).map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nombre)}${p.precio ? ' — ' + fmt(p.precio) : ''}</option>`).join('') +
    `<option value="__otro" ${sel === '__otro' ? 'selected' : ''}>➕ Producto nuevo…</option>`;
}
function lineaVenta(it) {
  it = it || { cantidad: 1 };
  const sel = it.productoId && prodById(it.productoId) ? it.productoId : (it.nombre || !DB.productos.length ? '__otro' : '');
  return `<div class="linea"><div class="lt"><select class="lProd">${optsProductos(sel)}</select><button class="x" data-act="delLinea" aria-label="Quitar">✕</button></div>
    <input class="lNombre" placeholder="Nombre del producto nuevo" value="${sel === '__otro' ? esc(it.nombre || '') : ''}" ${sel === '__otro' ? '' : 'hidden'}>
    ${filaCantPrecio(it)}</div>`;
}
function formVenta(v) {
  const ed = !!v;
  v = ed ? clone(v) : { fecha: hoy(), items: [{ cantidad: 1 }], metodo: 'efectivo', cliente: '', nota: '' };
  ctx = { tipo: 'venta', id: ed ? v.id : null, metodo: v.metodo };
  const clientes = Array.from(new Set(DB.ventas.map(x => (x.cliente || '').trim()).filter(Boolean))).sort();
  openSheet(`<h2>${ed ? 'Editar venta' : 'Nueva venta'}</h2>
    <label class="f">Fecha de la venta<input type="date" id="fFecha" value="${v.fecha}"></label>
    <div class="lbl">Productos vendidos</div>
    <div id="lineas">${v.items.map(lineaVenta).join('')}</div>
    <button class="btn ghost full" data-act="addLineaV">＋ Agregar otro producto</button>
    <div class="totalbox"><span>Total</span><b id="fTotal">$0</b></div>
    <div class="lbl">¿Cómo pagó?</div>
    <div class="seg" id="segM">${[['efectivo', '💵 Efectivo'], ['transferencia', '🏦 Transfer.'], ['debe', '📒 Debe']].map(m => `<button data-act="metodo" data-m="${m[0]}" class="${v.metodo === m[0] ? 'on' : ''}">${m[1]}</button>`).join('')}</div>
    <label class="f">Nombre del cliente <em id="reqCli"></em><input id="fCliente" list="dlCli" autocomplete="off" value="${esc(v.cliente)}"></label>
    <datalist id="dlCli">${clientes.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    ${ed && v.metodo === 'debe' && v.pagada ? `<div class="note ok">✓ Pagó el ${fechaTxt(v.fechaPago)} por ${v.metodoPago}</div>` : ''}
    <label class="f">Nota (opcional)<input id="fNota" value="${esc(v.nota)}"></label>
    <div class="row"><button class="btn ghost" data-act="close">Cancelar</button><button class="btn pri" data-act="guardarVenta">Guardar</button></div>
    ${ed ? '<button class="btn danger full" data-act="borrarVenta">Eliminar venta</button>' : ''}`);
  marcarMetodo(); recalc();
}
function marcarMetodo() {
  $$('#segM button').forEach(b => b.classList.toggle('on', b.dataset.m === ctx.metodo));
  const r = $('#reqCli'); if (!r) return;
  const req = ctx.metodo === 'debe';
  r.textContent = req ? '(obligatorio)' : '(opcional)'; r.className = req ? 'req' : '';
  if (!req) $('#fCliente').classList.remove('err');
}
function guardarVenta() {
  const items = []; let err = null;
  $$('#lineas .linea').forEach(ln => {
    if (err) return;
    const sel = $('.lProd', ln).value; let nombre = '', pid = '';
    if (sel === '__otro') nombre = $('.lNombre', ln).value.trim();
    else if (sel) { const p = prodById(sel); pid = sel; nombre = p ? p.nombre : ''; }
    const cant = parseCant($('.lCant', ln).value), precio = parseMonto($('.lPrecio', ln).value);
    if (!nombre && !precio) return;
    if (!nombre) { err = 'Elige o escribe el producto en cada línea.'; return; }
    if (!cant) { err = 'Revisa la cantidad de "' + nombre + '".'; return; }
    items.push({ productoId: pid, nombre: nombre, cantidad: cant, precio: precio });
  });
  if (!err && !items.length) err = 'Agrega al menos un producto.';
  const cliente = $('#fCliente').value.trim();
  if (!err && ctx.metodo === 'debe' && !cliente) { $('#fCliente').classList.add('err'); $('#fCliente').focus(); err = 'Si queda debiendo, el nombre es obligatorio.'; }
  if (err) { toast(err); return; }
  items.forEach(it => {
    if (it.productoId) return;
    let p = DB.productos.find(x => norm(x.nombre) === norm(it.nombre));
    if (!p) { p = { id: uid(), nombre: it.nombre, precio: it.precio }; DB.productos.push(p); }
    it.productoId = p.id; it.nombre = p.nombre;
  });
  const prev = ctx.id ? ventaById(ctx.id) : null;
  const v = {
    id: prev ? prev.id : uid(), creado: prev ? prev.creado : new Date().toISOString(),
    fecha: $('#fFecha').value || hoy(), items: items,
    total: Math.round(suma(items, i => i.cantidad * i.precio)),
    metodo: ctx.metodo, cliente: cliente, nota: $('#fNota').value.trim()
  };
  if (v.metodo === 'debe') {
    v.pagada = !!(prev && prev.metodo === 'debe' && prev.pagada);
    if (v.pagada) { v.fechaPago = prev.fechaPago; v.metodoPago = prev.metodoPago; }
  }
  if (prev) DB.ventas[DB.ventas.indexOf(prev)] = v; else DB.ventas.push(v);
  Store.save(); closeSheet(); render(); toast(prev ? 'Venta actualizada ✓' : 'Venta guardada ✓');
}

/* ---- Gasto ---- */
function lineaGasto(it) {
  it = it || { cantidad: 1 };
  return `<div class="linea"><div class="lt"><input class="lConc" list="dlConc" autocomplete="off" placeholder="¿Qué compraste? (ej: hilo, cajas)" value="${esc(it.concepto || '')}">
    <button class="x" data-act="delLinea" aria-label="Quitar">✕</button></div>${filaCantPrecio(it)}</div>`;
}
function formGasto(g) {
  const ed = !!g;
  g = ed ? clone(g) : { fecha: hoy(), tipo: DB.tiposGasto[0] || '', items: [{ cantidad: 1 }], nota: '' };
  ctx = { tipo: 'gasto', id: ed ? g.id : null };
  const tipos = DB.tiposGasto.slice(); if (g.tipo && tipos.indexOf(g.tipo) < 0) tipos.push(g.tipo);
  const conceptos = Array.from(new Set(DB.productos.map(p => p.nombre).concat(...DB.gastos.map(x => x.items.map(i => i.concepto))).filter(Boolean))).sort();
  openSheet(`<h2>${ed ? 'Editar gasto' : 'Nuevo gasto'}</h2>
    <label class="f">Fecha del gasto<input type="date" id="fFecha" value="${g.fecha}"></label>
    <label class="f">Tipo de gasto<select id="fTipo">${tipos.map(t => `<option ${t === g.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}<option value="__nuevo">➕ Nuevo tipo…</option></select></label>
    <input id="fTipoNuevo" placeholder="Nombre del nuevo tipo (ej: Publicidad)" hidden>
    <div class="lbl">¿Qué compraste? (cantidad × precio)</div>
    <div id="lineas">${g.items.map(lineaGasto).join('')}</div>
    <datalist id="dlConc">${conceptos.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <button class="btn ghost full" data-act="addLineaG">＋ Agregar otra cosa</button>
    <div class="totalbox"><span>Total</span><b id="fTotal">$0</b></div>
    <label class="f">Nota (opcional)<input id="fNota" placeholder="Ej: proveedor, tienda" value="${esc(g.nota)}"></label>
    <div class="row"><button class="btn ghost" data-act="close">Cancelar</button><button class="btn pri" data-act="guardarGasto">Guardar</button></div>
    ${ed ? '<button class="btn danger full" data-act="borrarGasto">Eliminar gasto</button>' : ''}`);
  recalc();
}
function guardarGasto() {
  let tipo = $('#fTipo').value;
  if (tipo === '__nuevo') {
    tipo = $('#fTipoNuevo').value.trim();
    if (!tipo) { toast('Escribe el nombre del nuevo tipo de gasto.'); $('#fTipoNuevo').focus(); return; }
    const ex = DB.tiposGasto.find(t => norm(t) === norm(tipo));
    if (ex) tipo = ex; else DB.tiposGasto.push(tipo);
  }
  const items = []; let err = null;
  $$('#lineas .linea').forEach(ln => {
    if (err) return;
    const concepto = $('.lConc', ln).value.trim(), cant = parseCant($('.lCant', ln).value), precio = parseMonto($('.lPrecio', ln).value);
    if (!concepto && !precio) return;
    if (!concepto) { err = 'Escribe qué compraste en cada línea.'; return; }
    if (!cant) { err = 'Revisa la cantidad de "' + concepto + '".'; return; }
    items.push({ concepto: concepto, cantidad: cant, precio: precio });
  });
  if (!err && !items.length) err = 'Agrega al menos una cosa comprada.';
  if (err) { toast(err); return; }
  const prev = ctx.id ? DB.gastos.find(x => x.id === ctx.id) : null;
  const g = {
    id: prev ? prev.id : uid(), creado: prev ? prev.creado : new Date().toISOString(),
    fecha: $('#fFecha').value || hoy(), tipo: tipo, items: items,
    total: Math.round(suma(items, i => i.cantidad * i.precio)), nota: $('#fNota').value.trim()
  };
  if (prev) DB.gastos[DB.gastos.indexOf(prev)] = g; else DB.gastos.push(g);
  Store.save(); closeSheet(); render(); toast(prev ? 'Gasto actualizado ✓' : 'Gasto guardado ✓');
}

/* ---- Pago de deuda ---- */
function formPago(id) {
  const v = ventaById(id); if (!v) return;
  ctx = { tipo: 'pago', id: id, metodo: 'efectivo' };
  openSheet(`<h2>Registrar pago</h2>
    <p><b>${esc(v.cliente)}</b> debe <b>${fmt(v.total)}</b> (venta del ${fechaTxt(v.fecha)}).</p>
    <div class="lbl">¿Cómo te pagó?</div>
    <div class="seg" id="segM"><button data-act="metodo" data-m="efectivo" class="on">💵 Efectivo</button><button data-act="metodo" data-m="transferencia">🏦 Transferencia</button></div>
    <label class="f">Fecha del pago<input type="date" id="fFechaPago" value="${hoy()}"></label>
    <div class="row"><button class="btn ghost" data-act="close">Cancelar</button><button class="btn pri" data-act="confirmarPago">Confirmar pago</button></div>`);
}

/* ---- Producto ---- */
function formProd(p) {
  const ed = !!p;
  ctx = { tipo: 'prod', id: ed ? p.id : null };
  openSheet(`<h2>${ed ? 'Editar producto' : 'Nuevo producto'}</h2>
    <label class="f">Nombre<input id="pNombre" value="${ed ? esc(p.nombre) : ''}" placeholder="Ej: Aros de plata"></label>
    <label class="f">Precio de venta (sugerido)<input id="pPrecio" inputmode="numeric" value="${ed && p.precio ? miles(p.precio) : ''}" placeholder="$0"></label>
    <p class="help">El precio se completa solo al vender, pero siempre lo puedes cambiar en cada venta.</p>
    <div class="row"><button class="btn ghost" data-act="close">Cancelar</button><button class="btn pri" data-act="guardarProd">Guardar</button></div>
    ${ed ? '<button class="btn danger full" data-act="borrarProd">Eliminar producto</button>' : ''}`);
}
function guardarProd() {
  const nombre = $('#pNombre').value.trim(), precio = parseMonto($('#pPrecio').value);
  if (!nombre) { toast('Escribe el nombre del producto.'); return; }
  const dup = DB.productos.find(x => norm(x.nombre) === norm(nombre) && x.id !== ctx.id);
  if (dup) { toast('Ya existe un producto con ese nombre.'); return; }
  if (ctx.id) {
    const p = prodById(ctx.id); p.nombre = nombre; p.precio = precio;
    DB.ventas.forEach(v => v.items.forEach(it => { if (it.productoId === p.id) it.nombre = nombre; }));
  } else DB.productos.push({ id: uid(), nombre: nombre, precio: precio });
  Store.save(); closeSheet(); render(); toast('Producto guardado ✓');
}

/* ---- Tipo de gasto ---- */
function formTipo(i) {
  const ed = i != null;
  ctx = { tipo: 'tipoG', i: ed ? i : null };
  openSheet(`<h2>${ed ? 'Editar tipo de gasto' : 'Nuevo tipo de gasto'}</h2>
    <label class="f">Nombre<input id="tNombre" value="${ed ? esc(DB.tiposGasto[i]) : ''}" placeholder="Ej: Publicidad"></label>
    <div class="row"><button class="btn ghost" data-act="close">Cancelar</button><button class="btn pri" data-act="guardarTipo">Guardar</button></div>
    ${ed ? '<button class="btn danger full" data-act="borrarTipo">Eliminar tipo</button>' : ''}`);
}
function guardarTipo() {
  const n = $('#tNombre').value.trim();
  if (!n) { toast('Escribe un nombre.'); return; }
  if (DB.tiposGasto.some((t, j) => norm(t) === norm(n) && j !== ctx.i)) { toast('Ese tipo ya existe.'); return; }
  if (ctx.i != null) {
    const viejo = DB.tiposGasto[ctx.i]; DB.tiposGasto[ctx.i] = n;
    DB.gastos.forEach(g => { if (g.tipo === viejo) g.tipo = n; });
  } else DB.tiposGasto.push(n);
  Store.save(); closeSheet(); render(); toast('Guardado ✓');
}

/* ---- Inversión ---- */
function formInv(x) {
  const ed = !!x;
  ctx = { tipo: 'inv', id: ed ? x.id : null };
  openSheet(`<h2>${ed ? 'Editar inversión' : 'Nueva inversión'}</h2>
    <label class="f">Fecha<input type="date" id="iFecha" value="${ed ? x.fecha : hoy()}"></label>
    <label class="f">¿En qué invertiste?<input id="iDesc" value="${ed ? esc(x.descripcion) : ''}" placeholder="Ej: capital inicial, máquina, vitrina"></label>
    <label class="f">Monto<input id="iMonto" inputmode="numeric" value="${ed ? miles(x.monto) : ''}" placeholder="$0"></label>
    <div class="row"><button class="btn ghost" data-act="close">Cancelar</button><button class="btn pri" data-act="guardarInv">Guardar</button></div>
    ${ed ? '<button class="btn danger full" data-act="borrarInv">Eliminar</button>' : ''}`);
}
function guardarInv() {
  const monto = parseMonto($('#iMonto').value);
  if (!monto) { toast('Escribe el monto invertido.'); return; }
  const x = { id: ctx.id || uid(), fecha: $('#iFecha').value || hoy(), descripcion: $('#iDesc').value.trim(), monto: monto, creado: new Date().toISOString() };
  const i = DB.inversiones.findIndex(y => y.id === ctx.id);
  if (i >= 0) { x.creado = DB.inversiones[i].creado; DB.inversiones[i] = x; } else DB.inversiones.push(x);
  Store.save(); closeSheet(); render(); toast('Inversión guardada ✓');
}

/* ================= Excel y respaldo ================= */
function construirExcel() {
  const H = s => ({ h: s }), M = n => ({ m: Math.round(n || 0) }), D = s => ({ d: s });
  const metodoTxt = v => v.metodo === 'efectivo' ? 'Efectivo' : v.metodo === 'transferencia' ? 'Transferencia' : 'Fiado (debe)';
  const estadoTxt = v => v.metodo !== 'debe' ? 'Pagado' : v.pagada ? 'Pagado por ' + (v.metodoPago === 'transferencia' ? 'transferencia' : 'efectivo') : 'PENDIENTE';

  const ventas = [['Fecha', 'Cliente', 'Producto', 'Cantidad', 'Precio unitario', 'Subtotal', 'Total de la venta', 'Método de pago', 'Estado', 'Fecha de pago', 'Nota'].map(H)];
  DB.ventas.slice().sort(byFechaAsc).forEach(v => v.items.forEach((it, i) => ventas.push([
    D(v.fecha), v.cliente || '', it.nombre, it.cantidad, M(it.precio), M(it.cantidad * it.precio),
    i === 0 ? M(v.total) : '', metodoTxt(v), estadoTxt(v), v.pagada ? D(v.fechaPago) : '', i === 0 ? (v.nota || '') : ''])));

  const gastos = [['Fecha', 'Tipo de gasto', 'Qué se compró', 'Cantidad', 'Precio unitario', 'Subtotal', 'Total del gasto', 'Nota'].map(H)];
  DB.gastos.slice().sort(byFechaAsc).forEach(g => g.items.forEach((it, i) => gastos.push([
    D(g.fecha), g.tipo, it.concepto, it.cantidad, M(it.precio), M(it.cantidad * it.precio), i === 0 ? M(g.total) : '', i === 0 ? (g.nota || '') : ''])));

  const meses = Array.from(new Set(DB.ventas.map(v => v.fecha.slice(0, 7)).concat(DB.gastos.map(g => g.fecha.slice(0, 7))))).sort();
  const resumenRows = [[H('Mes'), H('Ventas'), H('Gastos'), H('Ganancia'), H('Efectivo'), H('Transferencia'), H('Por cobrar')]];
  meses.forEach(m => {
    const r = resumen(f => !!f && f.slice(0, 7) === m); const p = m.split('-');
    resumenRows.push([MESES[+p[1] - 1] + ' ' + p[0], M(r.ventas), M(r.gastos), M(r.ganancia), M(r.efectivo), M(r.transf), M(r.porCobrar)]);
  });
  const T = resumen(() => true), inv = suma(DB.inversiones, x => x.monto);
  resumenRows.push([{ b: 'TOTAL' }, { bm: T.ventas }, { bm: T.gastos }, { bm: T.ganancia }, { bm: T.efectivo }, { bm: T.transf }, { bm: T.porCobrar }]);
  resumenRows.push([], [{ b: 'Inversión total' }, M(inv)], [{ b: 'Ganancia acumulada' }, M(T.ganancia)],
    [{ b: 'Recuperado de la inversión' }, inv ? { p: Math.round(T.ganancia / inv * 1000) / 1000 } : '—'],
    [], ['Respaldo generado el ' + fechaTxt(hoy()) + ' — Emprendimiento de ' + DB.config.nombre]);

  const rk = ranking(() => true, 'cant'), totU = suma(rk, x => x.cant) || 1, totM = suma(rk, x => x.monto) || 1;
  const mas = [[H('Puesto'), H('Producto'), H('Unidades vendidas'), H('% unidades'), H('Dinero vendido'), H('% dinero')]];
  rk.forEach((x, i) => mas.push([i + 1, x.nombre, x.cant, { p: x.cant / totU }, M(x.monto), { p: x.monto / totM }]));

  const deudas = [[H('Cliente'), H('Fecha de venta'), H('Productos'), H('Monto'), H('Estado'), H('Fecha de pago'), H('Pagó por')]];
  DB.ventas.filter(v => v.metodo === 'debe').sort(byFechaAsc).forEach(v => deudas.push([
    v.cliente, D(v.fecha), resumenItems(v), M(v.total), v.pagada ? 'Pagado' : 'PENDIENTE', v.pagada ? D(v.fechaPago) : '', v.pagada ? (v.metodoPago === 'transferencia' ? 'Transferencia' : 'Efectivo') : '']));

  const invs = [[H('Fecha'), H('Descripción'), H('Monto')]];
  DB.inversiones.slice().sort(byFechaAsc).forEach(x => invs.push([D(x.fecha), x.descripcion || '', M(x.monto)]));
  invs.push([{ b: 'TOTAL' }, '', { bm: inv }]);

  const prods = [[H('Producto'), H('Precio de venta')]];
  DB.productos.slice().sort(byNombre).forEach(p => prods.push([p.nombre, M(p.precio)]));

  return XlsxLite.crear([
    { name: 'Resumen', rows: resumenRows }, { name: 'Ventas', rows: ventas }, { name: 'Gastos', rows: gastos },
    { name: 'Más vendidos', rows: mas }, { name: 'Deudas', rows: deudas }, { name: 'Inversión', rows: invs }, { name: 'Productos', rows: prods }]);
}
function aBase64(bytes) {
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
function guardarArchivo(nombre, bytes, mime) {
  if (window.AndroidApp) {
    try { return AndroidApp.saveFile(nombre, aBase64(bytes), mime) || ''; } catch (e) { return ''; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: mime })); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  return 'navegador';
}
function hacerRespaldo(auto) {
  const f = hoy();
  const base = 'Respaldo_' + (auto ? 'mensual_' : '') + f;
  const xl = guardarArchivo(base + '.xlsx', construirExcel(), MIME_XLSX);
  const js = guardarArchivo(base + '.json', new TextEncoder().encode(JSON.stringify(DB)), 'application/json');
  if (!xl) { toast('⚠️ No se pudo guardar el respaldo'); return false; }
  const c = DB.config, ts = new Date().toISOString();
  c.ultimoRespaldo = ts; c.ultimoArchivo = xl;
  if (auto) c.ultimoAuto = ts;
  c.respaldos = [{ fecha: ts, archivo: base + '.xlsx', auto: !!auto, json: !!js }].concat(c.respaldos || []).slice(0, 24);
  Store.save();
  toast(auto ? '💾 Respaldo mensual guardado en Descargas › Emprendimiento Susana' : '✓ Excel guardado en Descargas › Emprendimiento Susana');
  return true;
}
function revisarRespaldo() {
  if (!hayDatos()) return;
  if (new Date() >= proximoAuto()) { hacerRespaldo(true); if (route.sub === 'respaldo' || route.tab === 'inicio') render(); }
}
function restaurarDesde(texto) {
  let d;
  try { d = JSON.parse(texto); } catch (e) { toast('Ese archivo no es una copia válida. Elige el archivo .json'); return; }
  if (!d || !Array.isArray(d.ventas)) { toast('Ese archivo no es una copia de esta app.'); return; }
  confirmar('¿Restaurar esta copia? Tiene ' + d.ventas.length + ' ventas y ' + (d.gastos || []).length + ' gastos. Reemplazará los datos actuales (antes se guardará una copia de lo actual).', 'Restaurar', true).then(ok => {
    if (!ok) return;
    if (hayDatos()) guardarArchivo('Antes_de_restaurar_' + hoy() + '.json', new TextEncoder().encode(JSON.stringify(DB)), 'application/json');
    DB = normalizar(d); Store.save(); compSel = null; go('inicio'); toast('Datos restaurados ✓');
  });
}

/* ================= Acciones ================= */
const ACC = {
  tab: el => go(el.dataset.tab),
  sub: el => go('mas', el.dataset.sub),
  back: () => go('mas'),
  pmov: el => { const d = +el.dataset.d; P.m += d; if (P.m < 0) { P.m = 11; P.y--; } if (P.m > 11) { P.m = 0; P.y++; } render(); },
  ptoggle: () => { if (P.tipo === 'todo') { P.tipo = 'mes'; P.y = new Date().getFullYear(); P.m = new Date().getMonth(); } else P.tipo = 'todo'; render(); },
  rankModo: el => { rankModo = el.dataset.m; render(); },
  compToggle: el => {
    const k = el.dataset.k, i = compSel.indexOf(k);
    if (i >= 0) compSel.splice(i, 1); else if (compSel.length >= 4) { toast('Puedes comparar hasta 4 productos'); return; } else compSel.push(k);
    render();
  },
  nuevaVenta: () => formVenta(null),
  editVenta: el => formVenta(ventaById(el.dataset.id)),
  nuevoGasto: () => formGasto(null),
  editGasto: el => formGasto(DB.gastos.find(g => g.id === el.dataset.id)),
  addLineaV: () => { $('#lineas').insertAdjacentHTML('beforeend', lineaVenta()); recalc(); },
  addLineaG: () => { $('#lineas').insertAdjacentHTML('beforeend', lineaGasto()); const l = $$('#lineas .lConc'); l[l.length - 1].focus(); recalc(); },
  delLinea: el => {
    const lns = $$('#lineas .linea');
    if (lns.length > 1) el.closest('.linea').remove();
    else { const ln = lns[0]; $$('input', ln).forEach(i => { i.value = i.classList.contains('lCant') ? '1' : ''; }); const s = $('.lProd', ln); if (s) s.value = ''; }
    recalc();
  },
  metodo: el => { ctx.metodo = el.dataset.m; marcarMetodo(); },
  close: () => closeSheet(),
  guardarVenta: guardarVenta,
  guardarGasto: guardarGasto,
  borrarVenta: () => confirmar('¿Eliminar esta venta? No se puede deshacer.', 'Eliminar', true).then(ok => {
    if (!ok) return; DB.ventas = DB.ventas.filter(v => v.id !== ctx.id); Store.save(); closeSheet(); render(); toast('Venta eliminada');
  }),
  borrarGasto: () => confirmar('¿Eliminar este gasto? No se puede deshacer.', 'Eliminar', true).then(ok => {
    if (!ok) return; DB.gastos = DB.gastos.filter(g => g.id !== ctx.id); Store.save(); closeSheet(); render(); toast('Gasto eliminado');
  }),
  pagar: el => formPago(el.dataset.id),
  confirmarPago: () => {
    const v = ventaById(ctx.id); v.pagada = true; v.metodoPago = ctx.metodo; v.fechaPago = $('#fFechaPago').value || hoy();
    Store.save(); closeSheet(); render(); toast('Pago registrado ✓');
  },
  despagar: el => confirmar('¿Volver a marcar esta venta como pendiente de pago?', 'Sí, pendiente').then(ok => {
    if (!ok) return; const v = ventaById(el.dataset.id); v.pagada = false; delete v.fechaPago; delete v.metodoPago; Store.save(); render();
  }),
  nuevoProd: () => formProd(null),
  editProd: el => formProd(prodById(el.dataset.id)),
  guardarProd: guardarProd,
  borrarProd: () => confirmar('¿Eliminar este producto de tu lista? Las ventas anteriores no se borran.', 'Eliminar', true).then(ok => {
    if (!ok) return; DB.productos = DB.productos.filter(p => p.id !== ctx.id); Store.save(); closeSheet(); render(); toast('Producto eliminado');
  }),
  nuevoTipo: () => formTipo(null),
  editTipo: el => formTipo(+el.dataset.i),
  guardarTipo: guardarTipo,
  borrarTipo: () => confirmar('¿Eliminar el tipo "' + DB.tiposGasto[ctx.i] + '"? Los gastos ya registrados lo conservan.', 'Eliminar', true).then(ok => {
    if (!ok) return; DB.tiposGasto.splice(ctx.i, 1); Store.save(); closeSheet(); render();
  }),
  nuevaInv: () => formInv(null),
  editInv: el => formInv(DB.inversiones.find(x => x.id === el.dataset.id)),
  guardarInv: guardarInv,
  borrarInv: () => confirmar('¿Eliminar esta inversión?', 'Eliminar', true).then(ok => {
    if (!ok) return; DB.inversiones = DB.inversiones.filter(x => x.id !== ctx.id); Store.save(); closeSheet(); render();
  }),
  exportar: () => { if (hacerRespaldo(false)) render(); },
  abrirXls: () => { if (window.AndroidApp && !AndroidApp.openFile(DB.config.ultimoArchivo, MIME_XLSX)) toast('No se encontró una app para abrir Excel'); },
  compartirXls: () => { if (window.AndroidApp) AndroidApp.shareFile(DB.config.ultimoArchivo, MIME_XLSX); },
  restaurar: () => $('#fileRest').click(),
  guardarAjustes: () => {
    const n = $('#aNombre').value.trim(); if (!n) { toast('Escribe un nombre.'); return; }
    DB.config.nombre = n; Store.save(); toast('Guardado ✓'); go('inicio');
  }
};

document.addEventListener('click', e => {
  const d = e.target.closest('[data-dlg]');
  if (d) { cerrarDlg(d.dataset.dlg === '1'); return; }
  const el = e.target.closest('[data-act]');
  if (el && ACC[el.dataset.act]) { e.preventDefault(); ACC[el.dataset.act](el); }
});
const sh = $('#sheet');
sh.addEventListener('change', e => {
  const t = e.target;
  if (t.classList.contains('lProd')) {
    const ln = t.closest('.linea'), n = $('.lNombre', ln);
    if (t.value === '__otro') { n.hidden = false; n.focus(); }
    else { n.hidden = true; const p = prodById(t.value); if (p && p.precio) $('.lPrecio', ln).value = miles(p.precio); }
    recalc();
  }
  if (t.id === 'fTipo') { const n = $('#fTipoNuevo'); n.hidden = t.value !== '__nuevo'; if (!n.hidden) n.focus(); }
});
sh.addEventListener('input', e => { if (e.target.closest('.linea')) recalc(); if (e.target.id === 'fCliente') e.target.classList.remove('err'); });
sh.addEventListener('focusout', e => {
  const t = e.target;
  if (t.classList.contains('lPrecio') || t.id === 'pPrecio' || t.id === 'iMonto') { const n = parseMonto(t.value); t.value = n ? miles(n) : ''; }
});
$('#fileRest').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if (!f) return;
  const rd = new FileReader(); rd.onload = () => restaurarDesde(rd.result); rd.onerror = () => toast('No se pudo leer el archivo'); rd.readAsText(f);
});

/* Botón "atrás" de Android: 1 = manejado, 0 = salir */
window.onAndroidBack = function () {
  if ($('#dlg').classList.contains('open')) { cerrarDlg(false); return 1; }
  if (sheetAbierta()) { closeSheet(); return 1; }
  if (route.sub) { go('mas'); return 1; }
  if (route.tab !== 'inicio') { go('inicio'); return 1; }
  return 0;
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarRespaldo(); });
setInterval(revisarRespaldo, 60 * 60 * 1000);

/* ================= Inicio ================= */
$('#spNombre').textContent = DB.config.nombre;
render();
setTimeout(() => { $('#splash').classList.add('out'); revisarRespaldo(); }, 1600);
$('#splash').addEventListener('click', () => $('#splash').classList.add('out'));
Store.save();
