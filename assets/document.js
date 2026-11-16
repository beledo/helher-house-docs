(function (root) {
  'use strict';
  const W = 595.28, H = 841.89, LEFT = 60, RIGHT = 535.28;
  const COLORS = { ink: '#252525', gray: '#eaecf0', pale: '#f0f0f0', orange: '#d94e22', faint: '#7c8490' };
  let fonts, unicode, logoData, logoBytes, logoFormat;
  const euro = value => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(value / 100);
  function decimal(value, places) {
    const s = String(value ?? '').trim().replace(',', '.');
    if (!new RegExp('^\\d{1,9}(?:\\.\\d{1,' + places + '})?$').test(s)) throw new Error('Usá un número positivo, sin separadores de miles.');
    const [whole, fraction = ''] = s.split('.');
    return BigInt(whole) * (10n ** BigInt(places)) + BigInt(fraction.padEnd(places, '0'));
  }
  function lineCents(item) {
    const qty = decimal(item.quantity, 3), price = decimal(item.price, 2);
    if (qty === 0n) throw new Error('La cantidad debe ser mayor que cero.');
    const cents = (qty * price + 500n) / 1000n;
    if (cents > 999999999999n) throw new Error('El importe de la partida es demasiado grande.');
    return Number(cents);
  }
  function calculate(items, rate) {
    if (![10, 21].includes(Number(rate))) throw new Error('Elegí IVA del 10 % o del 21 %.');
    const lines = items.map(lineCents);
    const base = lines.reduce((sum, n) => sum + BigInt(n), 0n);
    const tax = (base * BigInt(rate) + 50n) / 100n;
    if (base + tax > 999999999999n) throw new Error('El importe total es demasiado grande.');
    return { lines, base: Number(base), tax: Number(tax), total: Number(base + tax), rate: Number(rate) };
  }
  function safeText(text) {
    return String(text ?? '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, '  ')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufe0e\ufe0f\ufeff]/g, '')
      .replace(/[\u2028\u2029]/g, '\n').replace(/[\u2000-\u200a\u202f\u205f\u3000]/g, ' ')
      .replace(/㎡/g, 'm²').replace(/㎥/g, 'm³');
  }
  function fontFor(bold) { return bold ? fonts.bold : fonts.regular; }
  function printable(text) {
    const chars = Array.from(safeText(text));
    if (chars.every(char => char === '\n' || fonts.latin.has(char.codePointAt(0)))) return { value:chars.join(''), fallback:false };
    const symbols = { '✓':'[OK]', '✔':'[OK]', '→':'->', '←':'<-', '≤':'<=', '≥':'>=', '−':'-' };
    let fallback=false;
    const value=chars.map(char=>{
      const code=char.codePointAt(0);
      if (char==='\n'||fonts.latin.has(code)) return char;
      if (unicode?.characters.has(code)) { fallback=true; return char; }
      return symbols[char] || '[U+'+code.toString(16).toUpperCase()+']';
    }).join('');
    // Use one font per line. If any standard character is absent in the fallback
    // face, make that character explicit rather than printing a missing glyph.
    return { value:fallback?Array.from(value).map(char=>char==='\n'||unicode.characters.has(char.codePointAt(0))?char:'[U+'+char.codePointAt(0).toString(16).toUpperCase()+']').join(''):value, fallback };
  }
  function width(text, size, bold) {
    const {value,fallback}=printable(text);
    const font=fallback?unicode.metrics:fontFor(bold);
    return Math.max(...value.split('\n').map(line=>font.widthOfTextAtSize(line,size)));
  }
  function fitSize(text, maxWidth, preferred, bold = false) {
    let size = preferred;
    while (size > 7 && width(text, size, bold) > maxWidth) size -= 0.25;
    return size;
  }
  function wrap(text, maxWidth, size = 10, bold = false) {
    const result = [];
    for (const paragraph of safeText(text).split('\n')) {
      if (!paragraph.trim()) { result.push(''); continue; }
      let line = '';
      for (const word of paragraph.trim().split(/\s+/)) {
        if (width(word, size, bold) > maxWidth) {
          if (line) { result.push(line); line = ''; }
          let fragment = '';
          for (const char of word) {
            if (fragment && width(fragment + char, size, bold) > maxWidth) { result.push(fragment); fragment = ''; }
            fragment += char;
          }
          line = fragment;
        } else if (line && width(line + ' ' + word, size, bold) > maxWidth) {
          result.push(line); line = word;
        } else line += (line ? ' ' : '') + word;
      }
      if (line) result.push(line);
    }
    return result;
  }
  async function init(PDFLib, imageData, fallbackFont) {
    // pdf-lib's JPEG parser reads the underlying ArrayBuffer from offset zero.
    // Always copy the exact image view, including Node Buffer/subarray inputs.
    let source;
    if (typeof imageData === 'string') {
      const match = imageData.match(/^data:image\/(?:jpeg|png);base64,([A-Za-z0-9+/=\s]+)$/);
      if (!match) throw new Error('No se pudo leer el logo del documento.');
      const binary = atob(match[1].replace(/\s/g, ''));
      source = Uint8Array.from(binary, char => char.charCodeAt(0));
    } else if (ArrayBuffer.isView(imageData)) source = new Uint8Array(imageData.buffer, imageData.byteOffset, imageData.byteLength);
    else if (imageData instanceof ArrayBuffer) source = new Uint8Array(imageData);
    else throw new Error('No se pudo leer el logo del documento.');
    logoBytes = new Uint8Array(source.byteLength);
    logoBytes.set(source);
    const png = [137,80,78,71,13,10,26,10].every((byte, i) => logoBytes[i] === byte);
    const jpeg = logoBytes[0] === 255 && logoBytes[1] === 216 && logoBytes[2] === 255;
    if (!png && !jpeg) throw new Error('El logo no es una imagen PNG o JPEG válida. Recargá la página.');
    logoFormat = png ? 'png' : 'jpeg';
    let binary = ''; for (const byte of logoBytes) binary += String.fromCharCode(byte);
    logoData = 'data:image/' + logoFormat + ';base64,' + btoa(binary);
    const metrics = await PDFLib.PDFDocument.create();
    const regular = await metrics.embedFont(PDFLib.StandardFonts.Helvetica), bold = await metrics.embedFont(PDFLib.StandardFonts.HelveticaBold);
    fonts = {regular,bold,latin:new Set(regular.getCharacterSet())};
    unicode = undefined;
    if (fallbackFont) {
      metrics.registerFontkit(fallbackFont.kit);
      const face = await metrics.embedFont(fallbackFont.bytes);
      unicode = { ...fallbackFont, metrics:face, characters:new Set(face.getCharacterSet()) };
    }
  }
  function layout(data) {
    if (!fonts) throw new Error('El generador de PDF se está preparando.');
    const invoice = data.type === 'invoice', title = invoice ? 'FACTURA' : 'PRESUPUESTO';
    const amounts = calculate(data.items, data.tax);
    const pages = []; let ops, y;
    function text(str, x, top, size = 10.5, bold = false, align = 'left', color = COLORS.ink) {
      const {value:content,fallback}=printable(str);
      let adjustedX = x;
      if (align === 'right') adjustedX -= width(content, size, bold);
      if (align === 'center') adjustedX -= width(content, size, bold) / 2;
      ops.push({ kind: 'text', text: content, x: adjustedX, y: top, size, bold, fallback, color });
    }
    function line(x1, top, x2, color = COLORS.orange, thickness = 1) { ops.push({ kind: 'line', x1, y1: top, x2, y2: top, color, thickness }); }
    function rect(x, top, w, h, color) { ops.push({ kind: 'rect', x, y: top, w, h, color }); }
    function newPage(first = false) {
      ops = []; pages.push(ops);
      rect(0, 0, W, 140, COLORS.gray);
      text(title, LEFT, 66, invoice ? 32 : 29, true);
      ops.push({ kind: 'image', x: 445, y: 21, w: 106, h: 106 });
      const companyLines = wrap(data.company.name || 'HELHER HOUSE, SL', 292, 14, true);
      companyLines.forEach((v, i) => text(v, LEFT, 177 + i * 17, 14, true));
      let cY = 177 + companyLines.length * 17 + 4;
      for (const entry of ['NIF: ' + (data.company.nif || '—'), 'DOM: ' + (data.company.address || '—'), 'CP: ' + [data.company.postcode, data.company.city].filter(Boolean).join(' ')]) {
        const lines = wrap(entry, 290, 10.5, true);
        lines.forEach(v => { text(v, LEFT, cY, 10.5, true); cY += 16; });
      }
      const numberText = 'Nº: ' + (data.number || (invoice ? '—' : 'BORRADOR'));
      text(numberText, RIGHT, 177, fitSize(numberText, 175, 11, true), true, 'right');
      text('Fecha: ' + formatDate(data.date), RIGHT, 199, 11, true, 'right');
      y = Math.max(cY + 30, 283);
      if (first && (invoice || Object.values(data.client).some(v => String(v).trim()))) {
        const c = data.client;
        for (const entry of ['CLIENTE: ' + (c.name || '—'), 'NIF/CIF/NIE: ' + (c.nif || '—'), 'DOMICILIO: ' + (c.address || '—'), 'CP: ' + ([c.postcode, c.city].filter(Boolean).join(' ') || '—')]) {
          wrap(entry, RIGHT - LEFT, 10, true).forEach(v => { text(v, LEFT, y, 10, true); y += 16; });
        }
        y += 23;
      } else y += 17;
    }
    function tableHeader() {
      line(LEFT, y, RIGHT, COLORS.orange, 1.2);
      text('Detalle', LEFT + 5, y + 9, 11.5, true, 'left', COLORS.orange);
      text(data.unit || 'Cantidad', 347, y + 9, 10.5, true, 'center', COLORS.orange);
      text('Precio', 415, y + 9, 11, true, 'center', COLORS.orange);
      text('Total', 500, y + 9, 11, true, 'center', COLORS.orange);
      y += 32; line(LEFT, y, RIGHT, COLORS.orange, 1.1); y += 12;
    }
    const bottom = 748;
    newPage(true); tableHeader();
    data.items.forEach((item, index) => {
      let lines = wrap(item.description || 'Descripción de los trabajos', 253, 10.5);
      let firstPiece = true;
      while (lines.length) {
        if (y + 30 > bottom) { newPage(); tableHeader(); }
        const room = Math.max(1, Math.floor((bottom - y - 12) / 14));
        const piece = lines.splice(0, room);
        piece.forEach((v, i) => text(v, LEFT + 3, y + i * 14));
        if (firstPiece) {
          const qtyText = String(item.quantity || '1').replace('.', ',');
          text(qtyText, 347, y, fitSize(qtyText, 52, 10.5), false, 'center');
          const unitPrice = Number(decimal(item.price || '0', 2));
          text(euro(unitPrice), 443, y, fitSize(euro(unitPrice), 68, 10.5), false, 'right');
          text(euro(amounts.lines[index]), RIGHT - 8, y, fitSize(euro(amounts.lines[index]), 77, 10.5), false, 'right');
          firstPiece = false;
        }
        y += Math.max(24, piece.length * 14 + 10);
        if (lines.length) { newPage(); tableHeader(); }
      }
    });
    // Keep ordinary invoice totals and payment instructions together at a page break.
    const paymentReserve = invoice ? Math.min(200, 30 + (data.iban ? 20 : 0) + (data.paymentMethod ? wrap('FORMA DE PAGO: '+data.paymentMethod,RIGHT-LEFT,9.5).length*14+5 : 0) + (data.paymentTerms ? wrap(data.paymentTerms,RIGHT-LEFT,9.5,true).length*14+6 : 0)) : 0;
    if (y + 116 + paymentReserve > bottom) newPage();
    line(LEFT, y, RIGHT, COLORS.orange, .8); y += 12;
    const shortNotes = !invoice && data.notes ? wrap(data.notes, 246, 9, true) : [];
    const notesAtSummary = shortNotes.length > 0 && shortNotes.length <= 5;
    if (notesAtSummary) shortNotes.forEach((v, i) => text(v, LEFT, y + i * 11, 9, true));
    text('BASE IMPONIBLE', 433, y, 10.5, false, 'right');
    text(euro(amounts.base), RIGHT - 8, y, fitSize(euro(amounts.base), 84, 11), false, 'right'); y += 26;
    text('IVA ' + data.tax + ' %', 433, y, 10.5, false, 'right');
    text(euro(amounts.tax), RIGHT - 8, y, fitSize(euro(amounts.tax), 84, 11), false, 'right'); y += 28;
    const quotePaymentLines = !invoice ? [data.paymentMethod ? 'FORMA DE PAGO: ' + data.paymentMethod : '', data.paymentTerms, data.validity ? 'Este presupuesto tendrá una validez de ' + data.validity + ' días.' : '', data.iban ? 'IBAN: ' + data.iban : ''].filter(Boolean).flatMap(v => wrap(v, 270, 8.5)) : [];
    const paymentInBand = !invoice && quotePaymentLines.length <= 4;
    const bandHeight = paymentInBand ? 56 : 42;
    rect(0, y, W, bandHeight, COLORS.pale);
    if (paymentInBand) quotePaymentLines.forEach((v, i) => text(v, LEFT, y + 8 + i * 11, 8.5, i > 0 && !v.startsWith('IBAN:')));
    text('TOTAL', 433, y + 13, 14, true, 'right');
    text(euro(amounts.total), RIGHT - 8, y + 12, fitSize(euro(amounts.total), 85, 15, true), true, 'right'); y += bandHeight + 22;
    function paragraph(content, options = {}) {
      if (!String(content || '').trim()) return;
      const size = options.size || 10, lead = options.lead || 14;
      const lines = wrap(content, RIGHT - LEFT, size, !!options.bold);
      if (y + Math.min(lines.length, 3) * lead > bottom) newPage();
      lines.forEach(v => {
        if (y + lead > bottom) newPage();
        text(v, LEFT, y, size, !!options.bold); y += lead;
      }); y += options.gap ?? 9;
    }
    if (!paymentInBand) {
      paragraph('INFORMACIÓN DE PAGO', { bold: true, size: 11, gap: 11 });
      if (data.iban) paragraph('IBAN: ' + data.iban, { size: 10.5, gap: 6 });
      if (data.paymentMethod) paragraph('FORMA DE PAGO: ' + data.paymentMethod, { size: 9.5, gap: 5 });
      paragraph(data.paymentTerms, { bold: true, size: 9.5, gap: 6 });
      if (!invoice && data.validity) paragraph('Este presupuesto tendrá una validez de ' + data.validity + ' días.', { bold: true, size: 9.5, gap: 14 });
    }
    if (!notesAtSummary) paragraph(data.notes, { size: 9.5, gap: 14 });
    if (!invoice && data.clause) {
      if (y + 60 > bottom) newPage();
      paragraph('Cláusula de Vicios Ocultos y Trabajos Adicionales:', { bold: true, size: 9.5, gap: 3 });
      paragraph(data.clause, { size: 9, lead: 12.5, gap: 10 });
    }
    pages.forEach((p, i) => {
      ops = p;
      line(LEFT, 775, RIGHT, '#e0e3e8', .5);
      text('CONTACTO', LEFT, 786, 9, true);
      const contact = [data.company.email, data.company.phone ? 'Tel: ' + data.company.phone : ''].filter(Boolean).join('  |  ');
      wrap(contact, 370, 9).slice(0, 2).forEach((v, n) => text(v, LEFT, 801 + n * 12, 9));
      text((i + 1) + ' / ' + pages.length, RIGHT, 801, 9, false, 'right', COLORS.faint);
    });
    return { pages, amounts, data };
  }
  function formatDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—';
    const [year, month, day] = value.split('-');
    return day + '/' + month + '/' + year;
  }
  function escape(text) { return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function svgPages(document) {
    return document.pages.map((ops, page) => '<svg class="document-page" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + escape((document.data.type === 'invoice' ? 'Factura' : 'Presupuesto') + ', página ' + (page + 1)) + '"><rect width="100%" height="100%" fill="white"/>' + ops.map(op => {
      if (op.kind === 'rect') return '<rect x="' + op.x + '" y="' + op.y + '" width="' + op.w + '" height="' + op.h + '" fill="' + op.color + '"/>';
      if (op.kind === 'line') return '<line x1="' + op.x1 + '" y1="' + op.y1 + '" x2="' + op.x2 + '" y2="' + op.y2 + '" stroke="' + op.color + '" stroke-width="' + op.thickness + '"/>';
      if (op.kind === 'image') return '<image href="' + logoData + '" x="' + op.x + '" y="' + op.y + '" width="' + op.w + '" height="' + op.h + '"/>';
      return '<text x="' + op.x + '" y="' + (op.y + op.size * .82) + '" font-family="'+(op.fallback?'Helher PDF,':'')+'Arial,Helvetica,sans-serif" font-size="' + op.size + '" font-weight="' + (op.bold&&!op.fallback ? '700' : '400') + '" fill="' + op.color + '">' + escape(op.text) + '</text>';
    }).join('') + '</svg>').join('');
  }
  function rgb(PDFLib, hex) { const n = parseInt(hex.slice(1), 16); return PDFLib.rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); }
  async function pdfBytes(PDFLib, document) {
    const pdf = await PDFLib.PDFDocument.create();
    const regular = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    const bold = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
    let fallback;
    if (document.pages.some(page=>page.some(op=>op.fallback))) {
      pdf.registerFontkit(unicode.kit);
      // The source font is already trimmed. Embedding it without another
      // subsetting pass preserves glyph outlines in third-party PDF readers.
      fallback=await pdf.embedFont(unicode.bytes);
    }
    const image = logoFormat === 'png' ? await pdf.embedPng(logoBytes) : await pdf.embedJpg(logoBytes);
    const name = document.data.type === 'invoice' ? 'Factura' : 'Presupuesto';
    pdf.setTitle(name + ' ' + document.data.number + ' · ' + document.data.company.name);
    pdf.setAuthor(document.data.company.name);
    pdf.setSubject('Base imponible: ' + euro(document.amounts.base) + '; IVA ' + document.data.tax + ' %: ' + euro(document.amounts.tax) + '; Total: ' + euro(document.amounts.total));
    for (const ops of document.pages) {
      const page = pdf.addPage([W, H]);
      for (const op of ops) {
        if (op.kind === 'rect') page.drawRectangle({ x: op.x, y: H - op.y - op.h, width: op.w, height: op.h, color: rgb(PDFLib, op.color) });
        if (op.kind === 'line') page.drawLine({ start: { x: op.x1, y: H - op.y1 }, end: { x: op.x2, y: H - op.y2 }, thickness: op.thickness, color: rgb(PDFLib, op.color) });
        if (op.kind === 'image') page.drawImage(image, { x: op.x, y: H - op.y - op.h, width: op.w, height: op.h });
        if (op.kind === 'text') page.drawText(op.text, { x: op.x, y: H - op.y - op.size * .82, size: op.size, font: op.fallback ? fallback : op.bold ? bold : regular, color: rgb(PDFLib, op.color) });
      }
    }
    return pdf.save();
  }
  root.HelherDocument = { init, layout, svgPages, pdfBytes, calculate, lineCents, decimal, euro, escape, formatDate };
})(typeof window === 'undefined' ? globalThis : window);
