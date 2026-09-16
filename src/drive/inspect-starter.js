const data = $json;
const binaries = $binary || {};
const maxFiles = Number($env.MAX_ZIP_FILES || 500);
const maxSingle = Number($env.MAX_SINGLE_FILE_MB || 10) * 1024 * 1024;
const entries = Object.entries(binaries).map(([field, meta]) => ({ field, meta, path: String(meta.fileName || field).replace(/\\/g, '/') }));
if (entries.length > maxFiles) throw new Error(`Extracción produjo ${entries.length} archivos; máximo ${maxFiles}`);
for (const entry of entries) {
  if (entry.path.startsWith('/') || /^[a-z]:\//i.test(entry.path) || entry.path.split('/').includes('..')) throw new Error(`Ruta extraída insegura: ${entry.path}`);
}

const priority = (path) => {
  const name = path.toLowerCase();
  if (/(activity_student_facing|starter_and_repository|rubric_public|readme)\.md$/.test(name)) return 100;
  if (/(requirements|instructions|activity|rubric).*\.md$/.test(name)) return 90;
  if (/(^|\/)(package\.json|makefile)$/.test(name)) return 80;
  if (/\.github\/workflows\//.test(name) || /(^|\/)(tests?|specs?)\//.test(name)) return 75;
  if (/(tsconfig|eslint|vite|next|expo|app\.json)/.test(name)) return 65;
  if (/\.(md|txt|json|ya?ml|toml|js|mjs|cjs|ts|tsx|jsx|py|java|kt|swift|go|rs|css|html|sql|sh)$/.test(name)) return 20;
  return 0;
};
const selected = entries.filter((entry) => priority(entry.path) > 0).sort((a, b) => priority(b.path) - priority(a.path) || a.path.localeCompare(b.path));
const relevantFiles = [];
let contextBytes = 0;
const maxContextBytes = 220000;
for (const entry of selected) {
  const buffer = await this.helpers.getBinaryDataBuffer(0, entry.field);
  if (buffer.length > maxSingle || contextBytes >= maxContextBytes) continue;
  const slice = buffer.subarray(0, Math.min(buffer.length, 64000, maxContextBytes - contextBytes));
  if (slice.includes(0)) continue;
  const content = slice.toString('utf8');
  contextBytes += Buffer.byteLength(content);
  relevantFiles.push({ path: entry.path, content, truncated: slice.length < buffer.length });
}
const corpus = relevantFiles.map((file) => `# ${file.path}\n${file.content}`).join('\n');
const lines = corpus.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const unique = (values, limit = 40) => [...new Set(values)].slice(0, limit);
const commands = unique(lines.filter((line) => /^(?:\$\s*)?(npm|pnpm|yarn|bun|npx|make|docker|go\s+test|pytest|mvn|gradle|swift\s+test)\b/i.test(line)).map((line) => line.replace(/^\$\s*/, '')));
const acceptanceCriteria = unique(lines.filter((line) => /^[-*]\s*\[[ xX]\]/.test(line)).map((line) => line.replace(/^[-*]\s*\[[ xX]\]\s*/, '')));
const constraints = unique(lines.filter((line) => /\b(no\s+(?:modificar|eliminar|usar)|debe|obligatorio|restricci[oó]n|prohibido|conservar|preservar)\b/i.test(line)));
const rubric = unique(lines.filter((line) => /\b(r[uú]brica|puntos?|criterio|excelente|satisfactorio)\b/i.test(line)));
const requiredFiles = unique(lines.flatMap((line) => [...line.matchAll(/`([^`]+\.[a-z0-9]+)`/gi)].map((match) => match[1])));
const tests = unique(entries.map((entry) => entry.path).filter((path) => /(^|\/)(tests?|specs?)\/|\.(test|spec)\.[^.]+$/i.test(path)));

return [{
  json: {
    ...data,
    starter: {
      found: true,
      name: data.starterName,
      driveFileId: data.starterDriveFileId,
      fileCount: entries.length,
      files: entries.map((entry) => entry.path).sort(),
      relevantFiles,
      requiredFiles,
      instructions: unique(lines.filter((line) => /^(?:\d+\.|[-*])\s+/.test(line))),
      commands,
      acceptanceCriteria,
      tests,
      constraints,
      rubric,
      potentialConflicts: [],
      security: data.zipValidation,
    },
  },
}];
