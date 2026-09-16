const COURSE_MAP = {
  DMI: { match: 'DMI - 10B', repository: 'Draggodeidad/campusops-dmi-team' },
  PWA: { match: 'PWA - 10B', repository: 'Draggodeidad/pwa-utt' },
};

function decodeBase64Url(value = '') {
  if (!value) return '';
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function collectParts(part, result = { text: [], html: [] }) {
  if (!part) return result;
  const data = part.body?.data;
  if (data) {
    const decoded = decodeBase64Url(data);
    if (part.mimeType === 'text/plain') result.text.push(decoded);
    if (part.mimeType === 'text/html') result.html.push(decoded);
  }
  for (const child of part.parts || []) collectParts(child, result);
  return result;
}

function stripHtml(html = '') {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function header(message, name) {
  const direct = message[name] || message[name.toLowerCase()];
  if (direct) return String(direct);
  const headers = message.payload?.headers || [];
  return String(headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '');
}

const output = [];
for (const item of $input.all()) {
  const message = item.json;
  const subject = header(message, 'Subject');
  const from = header(message, 'From');
  if (!/no-reply@classroom\.google\.com/i.test(from)) continue;

  const parts = collectParts(message.payload);
  const body = (parts.text.join('\n').trim() || stripHtml(parts.html.join('\n')) || message.snippet || '').slice(0, 45000);
  const positive = subject.match(/Nueva tarea:\s*["“']?\s*(?:\[\s*)?Semana\s*0*(\d{1,2})(?:\s*\])?/i);
  if (!positive) continue;
  if (/quiz\s+(semanal|individual)|fecha de entrega mañana|recordatorio|aviso general|comentario|calificaci[oó]n/i.test(subject)) continue;

  const corpus = `${subject}\n${body}`;
  const course = Object.keys(COURSE_MAP).find((key) => corpus.includes(COURSE_MAP[key].match));
  if (!course) continue;

  const week = Number(positive[1]);
  const assignmentTitle = subject
    .replace(/^.*?Nueva tarea:\s*/i, '')
    .replace(/^["“]|["”]$/g, '')
    .trim();
  const labels = (message.labels || []).map((label) => typeof label === 'string' ? label : label.name);
  if (labels.includes('Automation/Classroom/Processed')) continue;

  output.push({
    json: {
      gmailMessageId: message.id,
      gmailThreadId: message.threadId,
      subject,
      from,
      emailText: body,
      course,
      week,
      weekPadded: String(week).padStart(2, '0'),
      repository: COURSE_MAP[course].repository,
      assignmentTitle,
      receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null,
      automationMode: ($env.AUTOMATION_MODE || 'dry-run').toLowerCase(),
      aiProvider: ($env.AI_PROVIDER || 'gemini').toLowerCase(),
    },
    pairedItem: item.pairedItem,
  });
}

return output;
