const contextNode = $input.first().json._contextNode || 'Build Context & Dedup';
const context = $(contextNode).item.json;
const response = $json.body ?? $json;
let raw;
if (context.aiProvider === 'gemini') {
  raw = response.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
} else {
  raw = response.message?.content || response.response || '';
}
raw = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
return [{ json: { ...context, rawModelText: raw } }];
