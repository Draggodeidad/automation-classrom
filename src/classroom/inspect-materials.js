const data = $json;
const normalized = (data.materials || []).map((material, index) => {
  const attachment = material.driveFile?.driveFile || material.driveFile || null;
  if (attachment?.id) {
    return {
      index,
      type: 'driveFile',
      id: String(attachment.id),
      name: String(attachment.title || attachment.name || ''),
      alternateLink: attachment.alternateLink || null,
      shareMode: material.driveFile?.shareMode || null,
    };
  }
  if (material.link) return { index, type: 'link', url: material.link.url || null, title: material.link.title || null };
  if (material.youtubeVideo) return { index, type: 'youtubeVideo', id: material.youtubeVideo.id || null, title: material.youtubeVideo.title || null };
  if (material.form) return { index, type: 'form', title: material.form.title || null, formUrl: material.form.formUrl || null };
  return { index, type: 'other', metadata: material };
});

const zipCandidates = normalized.filter((item) => item.type === 'driveFile' && /\.zip$/i.test(item.name.trim()));
const weekToken = `w${data.weekPadded}`;
const score = (item) => {
  const name = item.name.toLowerCase();
  return (name.includes(data.course.toLowerCase()) ? 4 : 0) +
    (name.includes(weekToken) || name.includes(`week-${data.weekPadded}`) || name.includes(`semana-${data.weekPadded}`) ? 4 : 0) +
    (/(starter|kit-estudiante|student)/i.test(name) ? 2 : 0);
};
const ranked = zipCandidates.map((item) => ({ item, score: score(item) })).sort((a, b) => b.score - a.score);
if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
  throw new Error(`Hay múltiples ZIP ambiguos: ${ranked.map(({ item }) => item.name).join(', ')}`);
}
const selected = ranked[0]?.item || null;

return [{
  json: {
    ...data,
    materialInventory: normalized,
    starterFound: Boolean(selected),
    starterDriveFileId: selected?.id || null,
    starterName: selected?.name || null,
  },
}];
