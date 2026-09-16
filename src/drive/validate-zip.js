const data = $json;
const inputField = Object.keys($binary || {})[0];
if (!inputField) throw new Error('Drive no devolvió contenido binario para el ZIP');
const buffer = await this.helpers.getBinaryDataBuffer(0, inputField);
const maxZip = Number($env.MAX_ZIP_SIZE_MB || 25) * 1024 * 1024;
const maxExtracted = Number($env.MAX_EXTRACTED_SIZE_MB || 100) * 1024 * 1024;
const maxFiles = Number($env.MAX_ZIP_FILES || 500);
const maxSingle = Number($env.MAX_SINGLE_FILE_MB || 10) * 1024 * 1024;
if (buffer.length > maxZip) throw new Error(`ZIP excede el límite de ${maxZip} bytes`);
if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) throw new Error('ZIP corrupto o firma local inválida');

let eocd = -1;
for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
  if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) throw new Error('ZIP corrupto: no se encontró el directorio central');
const entryCount = buffer.readUInt16LE(eocd + 10);
const centralSize = buffer.readUInt32LE(eocd + 12);
const centralOffset = buffer.readUInt32LE(eocd + 16);
if (entryCount > maxFiles) throw new Error(`ZIP contiene ${entryCount} archivos; máximo ${maxFiles}`);
if (centralOffset + centralSize > eocd) throw new Error('ZIP corrupto: directorio central fuera de rango');

const entries = [];
let cursor = centralOffset;
let totalUncompressed = 0;
for (let index = 0; index < entryCount; index += 1) {
  if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('ZIP corrupto: entrada central inválida');
  const flags = buffer.readUInt16LE(cursor + 8);
  const compressedSize = buffer.readUInt32LE(cursor + 20);
  const uncompressedSize = buffer.readUInt32LE(cursor + 24);
  const nameLength = buffer.readUInt16LE(cursor + 28);
  const extraLength = buffer.readUInt16LE(cursor + 30);
  const commentLength = buffer.readUInt16LE(cursor + 32);
  const externalAttributes = buffer.readUInt32LE(cursor + 38);
  const nameStart = cursor + 46;
  const name = buffer.subarray(nameStart, nameStart + nameLength).toString((flags & 0x800) ? 'utf8' : 'latin1').replace(/\\/g, '/');
  const segments = name.split('/');
  const unixMode = (externalAttributes >>> 16) & 0xffff;
  const isSymlink = (unixMode & 0xf000) === 0xa000;
  if (!name || name.includes('\0') || name.startsWith('/') || /^[a-z]:\//i.test(name) || segments.includes('..')) throw new Error(`ZIP Slip/path inseguro: ${name}`);
  if (isSymlink) throw new Error(`ZIP contiene symlink no permitido: ${name}`);
  if (flags & 0x1) throw new Error(`ZIP cifrado no soportado: ${name}`);
  if (uncompressedSize > maxSingle) throw new Error(`Archivo excede MAX_SINGLE_FILE_MB: ${name}`);
  if (compressedSize > 0 && uncompressedSize / compressedSize > 100) throw new Error(`Posible compression bomb: ${name}`);
  totalUncompressed += uncompressedSize;
  if (totalUncompressed > maxExtracted) throw new Error('ZIP excede MAX_EXTRACTED_SIZE_MB');
  entries.push({ path: name, compressedSize, uncompressedSize, directory: name.endsWith('/') });
  cursor = nameStart + nameLength + extraLength + commentLength;
}

return [{
  json: {
    ...data,
    zipValidation: { compressedBytes: buffer.length, extractedBytes: totalUncompressed, fileCount: entries.filter((e) => !e.directory).length, entries },
  },
  binary: $binary,
}];
