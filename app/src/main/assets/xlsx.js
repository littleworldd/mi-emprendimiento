/* Generador mínimo de archivos Excel (.xlsx) sin librerías externas.
   Tipos de celda:  "texto" | 123 | {h:"Encabezado"} | {b:"Negrita"} | {m:1990} dinero
                    {bm:1990} dinero negrita | {d:"2026-11-25"} fecha | {p:0.35} porcentaje */
'use strict';
var XlsxLite = (function () {
  var enc = new TextEncoder();
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(files) {
    var parts = [], central = [], offset = 0;
    var now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    files.forEach(function (f) {
      var nm = enc.encode(f.name), d = f.data, crc = crc32(d);
      var h = new Uint8Array(30 + nm.length), v = new DataView(h.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true);
      v.setUint16(8, 0, true); v.setUint16(10, dosTime, true); v.setUint16(12, dosDate, true);
      v.setUint32(14, crc, true); v.setUint32(18, d.length, true); v.setUint32(22, d.length, true);
      v.setUint16(26, nm.length, true); v.setUint16(28, 0, true); h.set(nm, 30);
      parts.push(h, d);
      var c = new Uint8Array(46 + nm.length), cv = new DataView(c.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true); cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true); cv.setUint32(20, d.length, true);
      cv.setUint32(24, d.length, true); cv.setUint16(28, nm.length, true);
      cv.setUint32(42, offset, true); c.set(nm, 46);
      central.push(c);
      offset += h.length + d.length;
    });
    var cdSize = central.reduce(function (a, c) { return a + c.length; }, 0);
    var e = new Uint8Array(22), ev = new DataView(e.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    var all = parts.concat(central, [e]);
    var total = all.reduce(function (a, p) { return a + p.length; }, 0);
    var out = new Uint8Array(total), pos = 0;
    all.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }
  function x(s) {
    return String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function col(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function serial(iso) {
    var p = String(iso).split('-').map(Number);
    return Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(1899, 11, 30)) / 864e5);
  }
  function str(ref, s, st) {
    return '<c r="' + ref + '" t="inlineStr"' + (st ? ' s="' + st + '"' : '') + '><is><t xml:space="preserve">' + x(s) + '</t></is></c>';
  }
  function num(ref, n, st) { return '<c r="' + ref + '"' + (st ? ' s="' + st + '"' : '') + '><v>' + (isFinite(n) ? n : 0) + '</v></c>'; }
  function cell(ref, v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number') return num(ref, v, 0);
    if (typeof v === 'object') {
      if ('h' in v) return str(ref, v.h, 1);
      if ('m' in v) return num(ref, v.m, 2);
      if ('b' in v) return str(ref, v.b, 3);
      if ('d' in v) return v.d ? num(ref, serial(v.d), 4) : '';
      if ('p' in v) return num(ref, v.p, 5);
      if ('bm' in v) return num(ref, v.bm, 6);
    }
    return str(ref, String(v), 0);
  }
  function textLen(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return String(v).length + 1;
    if (typeof v === 'object') {
      if ('d' in v) return 11;
      var k = Object.keys(v)[0]; var s = String(v[k]);
      return (k === 'm' || k === 'bm') ? s.length + 4 : s.length;
    }
    return String(v).length;
  }
  function sheetXml(rows) {
    var widths = [];
    rows.forEach(function (r) { r.forEach(function (v, i) { widths[i] = Math.max(widths[i] || 8, Math.min(45, textLen(v) + 2)); }); });
    var cols = widths.length ? '<cols>' + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' : '';
    var body = rows.map(function (r, ri) {
      return '<row r="' + (ri + 1) + '">' + r.map(function (v, ci) { return cell(col(ci) + (ri + 1), v); }).join('') + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      cols + '<sheetData>' + body + '</sheetData></worksheet>';
  }
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0"/><numFmt numFmtId="165" formatCode="dd\\-mm\\-yyyy"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF880E4F"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFCE4EC"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="7">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function crear(sheets) {
    var used = {};
    sheets = sheets.map(function (s, i) {
      var n = String(s.name).replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31) || ('Hoja' + (i + 1));
      while (used[n.toLowerCase()]) n = n.slice(0, 28) + ' ' + (i + 1);
      used[n.toLowerCase()] = 1;
      return { name: n, rows: s.rows };
    });
    var files = [];
    var add = function (name, s) { files.push({ name: name, data: enc.encode(s) }); };
    add('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
      '</Types>');
    add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    add('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map(function (s, i) { return '<sheet name="' + x(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
      '</sheets></workbook>');
    add('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    add('xl/styles.xml', STYLES);
    sheets.forEach(function (s, i) { add('xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(s.rows)); });
    return zip(files);
  }
  return { crear: crear };
})();
if (typeof module !== 'undefined') module.exports = XlsxLite;
