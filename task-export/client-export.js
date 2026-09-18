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

const markdownLines = markdown => String(markdown || '')
  .replace(/```[^\n]*\n?/g, '')
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .split(/\r?\n/)
  .map(line => line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\s*[-*+]\s+/, '• ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim())
  .filter(line => line.length > 0);

const wrapLine = line => {
  const words = line.split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach(word => {
    if (!current) current = word;
    else if ((current + ' ' + word).length <= 92) current += ' ' + word;
    else {
      lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines;
};

const pdfObject = (number, body) => concatBytes([
  ascii(number + ' 0 obj\n'),
  body,
  ascii('\nendobj\n')
]);

const createPdfBytes = markdown => {
  const lines = markdownLines(markdown).flatMap(wrapLine);
  const pages = [];
  for (let index = 0; index < Math.max(1, lines.length); index += 52) pages.push(lines.slice(index, index + 52));
  const fontObjectNumber = 3 + pages.length * 2;
  const pageObjects = [];
  const contentObjects = [];
  pages.forEach((pageLines, pageIndex) => {
    const contentParts = [];
    pageLines.forEach((line, index) => {
      const command = index === 0 ? 'BT /F1 11 Tf 50 790 Td ' : '0 -14 Td ';
      contentParts.push(command + '(');
      contentParts.push(escapePdfString(toWinAnsi(line)));
      contentParts.push(') Tj\n');
    });
    contentParts.push('ET\n');
    const content = concatBytes(contentParts.map(part => typeof part === 'string' ? ascii(part) : part));
    const pageObjectNumber = 3 + pageIndex * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    pageObjects.push(pdfObject(pageObjectNumber, ascii(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ' +
      fontObjectNumber + ' 0 R >> >> /Contents ' + contentObjectNumber + ' 0 R >>'
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
    pdfObject(fontObjectNumber, ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'))
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
    const name = encoder().encode(file.name);
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
