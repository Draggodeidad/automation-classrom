const requests = $('Prepare Repository Content Requests').all();
const repositoryContents = {};
for (const [index, item] of $input.all().entries()) {
  const response = item.json.body || item.json;
  const request = requests[index]?.json;
  if (!request || response.type !== 'file' || response.encoding !== 'base64' || response.size > 100000) continue;
  const content = Buffer.from(response.content || '', 'base64').toString('utf8');
  if (content.includes('\u0000')) continue;
  repositoryContents[request.path] = { path: request.path, sha: response.sha, content, truncated: false };
}
return [{ json: { repositoryContents } }];
