const data = $json;
const plan = data.plan || { issues: [] };
const weekPadded = String(plan.weekPadded || String(plan.week || '').padStart(2, '0'));
const prefix = `[${plan.course}][W${weekPadded}]`;

const slug = (value) => {
  const out = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return out || 'issue';
};
const stripPrefix = (title) => String(title || '').replace(/^\s*\[[A-Za-z0-9]+\]\[W\d{1,2}\]\s*/, '');
const keyOk = (key) => /^[a-z0-9][a-z0-9-]{1,39}$/.test(key) && !/^\d+$/.test(key);

const issues = Array.isArray(plan.issues) ? plan.issues : [];
const usedKeys = new Set();
const keyMap = new Map();

const normalized = issues.map((issue, index) => {
  const originalKey = String(issue.key || '').trim().toLowerCase();
  const baseKey = keyOk(originalKey)
    ? originalKey
    : slug(issue.title || `issue-${index + 1}`).slice(0, 40);
  let key = baseKey;
  let suffix = 1;
  while (usedKeys.has(key)) {
    key = `${baseKey}-${++suffix}`;
  }
  usedKeys.add(key);
  keyMap.set(originalKey, key);
  keyMap.set(issue.key, key);

  const semanticTitle = stripPrefix(issue.title);
  const title = `${prefix} ${semanticTitle}`.replace(/\s+/g, ' ').trim();
  return { ...issue, key, title };
});

const validKeys = new Set(normalized.map((issue) => issue.key));
const droppedDependencies = [];
for (const issue of normalized) {
  const deps = Array.isArray(issue.dependsOn) ? issue.dependsOn : [];
  const cleaned = [];
  const seen = new Set();
  for (const dependency of deps) {
    const target = keyMap.get(dependency) || String(dependency || '').trim().toLowerCase();
    if (target === issue.key) {
      droppedDependencies.push({ issue: issue.key, dependency: target, reason: 'SELF_DEPENDENCY' });
      cleaned.push(target);
      continue;
    }
    if (!validKeys.has(target)) {
      droppedDependencies.push({ issue: issue.key, dependency: target, reason: 'INVALID_DEPENDENCY' });
      cleaned.push(target);
      continue;
    }
    if (seen.has(target)) continue;
    seen.add(target);
    cleaned.push(target);
  }
  issue.dependsOn = cleaned;
}

return [{
  json: {
    ...data,
    plan: { ...plan, issues: normalized },
    normalization: { droppedDependencies, keyMap: Object.fromEntries(keyMap) },
  },
}];