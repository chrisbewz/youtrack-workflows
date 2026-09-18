const encoder = () => new TextEncoder();

const concatBytes = chunks => {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  chunks.forEach(chunk => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
};

const ascii = value => Uint8Array.from(value, character => character.charCodeAt(0));

const littleEndian = (value, size) => {
  const result = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) {
    result[index] = value & 0xff;
    value = Math.floor(value / 256);
  }
  return result;
};

const toWinAnsi = value => {
  const result = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    result.push(codePoint <= 255 ? codePoint : 63);
  }
  return Uint8Array.from(result);
};

const escapePdfString = bytes => {
  const result = [];
  bytes.forEach(byte => {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) result.push(0x5c);
    result.push(byte);
  });
  return Uint8Array.from(result);
};

const stripMarkdown = value => String(value)
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/__([^_]+)__/g, '$1')
  .replace(/\*([^*]+)\*/g, '$1')
  .replace(/_([^_]+)_/g, '$1')
  .replace(/\\([\\`*_{}\[\]()#+.!\-])/g, '$1');

const wrapLine = (line, maximumLength) => {
  const words = line.split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach(word => {
    if (!current) current = word;
    else if ((current + ' ' + word).length <= maximumLength) current += ' ' + word;
    else {
      lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines;
};

const markdownBlocks = markdown => {
  const blocks = [];
  const source = String(markdown || '').split(/\r?\n/);
  let inCodeBlock = false;

  source.forEach((rawLine, index) => {
    if (/^```/.test(rawLine.trim())) {
      inCodeBlock = !inCodeBlock;
      return;
    }
    if (inCodeBlock) {
      wrapLine(rawLine || ' ', 80).forEach(text => blocks.push({ text, font: 'F3', size: 10, leading: 13, indent: 12 }));
      return;
    }

    if (rawLine.trim() === '') {
      blocks.push({ spacer: true, leading: 7 });
      return;
    }
    if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(rawLine)) {
      blocks.push({ divider: true, leading: 16 });
      return;
    }

    const heading = rawLine.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const style = level === 1
        ? { font: 'F2', size: 18, leading: 26, maximumLength: 56 }
        : level === 2
          ? { font: 'F2', size: 15, leading: 22, maximumLength: 68 }
          : { font: 'F2', size: 12, leading: 18, maximumLength: 82 };
      wrapLine(stripMarkdown(heading[2]), style.maximumLength).forEach(text => blocks.push({ ...style, text }));
      return;
    }

    const list = rawLine.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
    if (list) {
      const marker = /^\d/.test(list[2]) ? list[2] : '•';
      const indent = Math.min(36, Math.floor(list[1].length / 2) * 12);
      const wrapped = wrapLine(stripMarkdown(marker + ' ' + list[3]), 88 - Math.floor(indent / 6));
      wrapped.forEach((text, lineIndex) => blocks.push({
        text: lineIndex === 0 ? text : '  ' + text,
        font: 'F1', size: 11, leading: 15, indent
      }));
      return;
    }

    if (/^\|/.test(rawLine) && /\|\s*[-:]+\s*/.test(rawLine)) return;
    if (/^\|/.test(rawLine)) {
      const cells = rawLine.split('|').slice(1, -1).map(cell => stripMarkdown(cell.trim()));
      const nextLine = source[index + 1] || '';
      const header = /^\|/.test(nextLine) && /\|\s*[-:]+\s*/.test(nextLine);
      blocks.push({ text: cells.join('  |  '), font: header ? 'F2' : 'F1', size: 10, leading: 14, indent: 0 });
      return;
    }

    const quote = rawLine.match(/^>\s?(.+)$/);
    const text = stripMarkdown(quote ? quote[1] : rawLine);
    wrapLine(text, quote ? 82 : 92).forEach(line => blocks.push({
      text: line,
      font: 'F1',
      size: 11,
      leading: 15,
      indent: quote ? 12 : 0
    }));
  });

  return blocks;
};

const pdfObject = (number, body) => concatBytes([
  ascii(number + ' 0 obj\n'),
  body,
  ascii('\nendobj\n')
]);

const createPdfBytes = markdown => {
  const blocks = markdownBlocks(markdown);
  const pages = [[]];
  let remainingHeight = 740;
  blocks.forEach(block => {
    if (block.leading > remainingHeight && pages[pages.length - 1].length > 0) {
      pages.push([]);
      remainingHeight = 740;
    }
    pages[pages.length - 1].push(block);
    remainingHeight -= block.leading;
  });
  const regularFontObjectNumber = 3 + pages.length * 2;
  const boldFontObjectNumber = regularFontObjectNumber + 1;
  const codeFontObjectNumber = regularFontObjectNumber + 2;
  const pageObjects = [];
  const contentObjects = [];
  pages.forEach((pageBlocks, pageIndex) => {
    const contentParts = [];
    let y = 790;
    pageBlocks.forEach(block => {
      if (block.divider) {
        contentParts.push('0.75 w 50 ' + y + ' m 545 ' + y + ' l S\n');
      } else if (!block.spacer) {
        contentParts.push('BT /' + block.font + ' ' + block.size + ' Tf ' + (50 + block.indent) + ' ' + y + ' Td (');
        contentParts.push(escapePdfString(toWinAnsi(block.text)));
        contentParts.push(') Tj ET\n');
      }
      y -= block.leading;
    });
    const content = concatBytes(contentParts.map(part => typeof part === 'string' ? ascii(part) : part));
    const pageObjectNumber = 3 + pageIndex * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    pageObjects.push(pdfObject(pageObjectNumber, ascii(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ' +
      regularFontObjectNumber + ' 0 R /F2 ' + boldFontObjectNumber + ' 0 R /F3 ' + codeFontObjectNumber +
      ' 0 R >> >> /Contents ' + contentObjectNumber + ' 0 R >>'
    )));
    contentObjects.push(pdfObject(contentObjectNumber, concatBytes([
      ascii('<< /Length ' + content.length + ' >>\nstream\n'), content, ascii('endstream')
    ])));
  });
  const pageReferences = pages.map((_, index) => (3 + index * 2) + ' 0 R').join(' ');
  const objects = [
    pdfObject(1, ascii('<< /Type /Catalog /Pages 2 0 R >>')),
    pdfObject(2, ascii('<< /Type /Pages /Kids [' + pageReferences + '] /Count ' + pages.length + ' >>')),
    ...pageObjects.flatMap((page, index) => [page, contentObjects[index]]),
    pdfObject(regularFontObjectNumber, ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')),
    pdfObject(boldFontObjectNumber, ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')),
    pdfObject(codeFontObjectNumber, ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'))
  ];
  const header = ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const offsets = [0];
  let position = header.length;
  objects.forEach(object => {
    offsets.push(position);
    position += object.length;
  });
  const xref = ascii('xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n' +
    offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join(''));
  const trailer = ascii('trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' +
    position + '\n%%EOF\n');
  return concatBytes([header, ...objects, xref, trailer]);
};

const crc32 = bytes => {
  let crc = 0xffffffff;
  bytes.forEach(byte => {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  });
  return (crc ^ 0xffffffff) >>> 0;
};

const createZipBytes = files => {
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;
  files.forEach(file => {
    const name = encoder().encode(file.name || file.fileName);
    const content = encoder().encode(file.content);
    const header = concatBytes([
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
      littleEndian(20, 2), littleEndian(0x800, 2), littleEndian(0, 2),
      littleEndian(0, 2), littleEndian(0, 2), littleEndian(crc32(content), 4),
      littleEndian(content.length, 4), littleEndian(content.length, 4),
      littleEndian(name.length, 2), littleEndian(0, 2), name, content
    ]);
    localRecords.push(header);
    centralRecords.push(concatBytes([
      Uint8Array.from([0x50, 0x4b, 0x01, 0x02]),
      littleEndian(20, 2), littleEndian(20, 2), littleEndian(0x800, 2), littleEndian(0, 2),
      littleEndian(0, 2), littleEndian(0, 2), littleEndian(crc32(content), 4),
      littleEndian(content.length, 4), littleEndian(content.length, 4), littleEndian(name.length, 2),
      littleEndian(0, 2), littleEndian(0, 2), littleEndian(0, 2), littleEndian(0, 2),
      littleEndian(0, 4), littleEndian(offset, 4), name
    ]));
    offset += header.length;
  });
  const central = concatBytes(centralRecords);
  const local = concatBytes(localRecords);
  const end = concatBytes([
    Uint8Array.from([0x50, 0x4b, 0x05, 0x06]), littleEndian(0, 2), littleEndian(0, 2),
    littleEndian(files.length, 2), littleEndian(files.length, 2), littleEndian(central.length, 4),
    littleEndian(local.length, 4), littleEndian(0, 2)
  ]);
  return concatBytes([local, central, end]);
};

const createDownload = (fileName, mimeType, content) => ({ fileName, mimeType, content });

const api = { createPdfBytes, createZipBytes, createDownload };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.TaskExportClient = api;
