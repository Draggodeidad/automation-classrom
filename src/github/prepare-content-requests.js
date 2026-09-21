const context = $('Activity Context').item.json;
const tree = $('GitHub - Tree').item.json.body || {};
if (tree.truncated) throw new Error('REPOSITORY_INCOMPLETE_TREE');
const source = `${context.description || ''} ${(context.starter?.files || []).join(' ')}`;
const files = (tree.tree || []).filter(file => file.type === 'blob' && file.size <= 100000 &&
  /\.(md|txt|json|[cm]?js|ts|tsx|jsx|html|css|ya?ml)$/i.test(file.path) &&
  !/(^|\/)(node_modules|vendor|dist|\.env|package-lock|pnpm-lock|yarn.lock)/i.test(file.path));
files.sort((a, b) => Number(source.includes(b.path)) - Number(source.includes(a.path)) ||
  Number(/requirements|individual|evidence|rubric/i.test(b.path)) - Number(/requirements|individual|evidence|rubric/i.test(a.path)) || a.path.localeCompare(b.path));
const selected = files.slice(0, 20);
// README is also a safe fallback so an empty tree still advances to Build Context.
if (!selected.length) selected.push({ path: 'README.md' });
return selected.map(file => ({ json: { repository: context.repository, path: file.path,
  ref: tree.sha || $('GitHub - Repository').item.json.body.default_branch } }));
