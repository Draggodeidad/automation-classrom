const data = $json;
const plan = JSON.parse(JSON.stringify(data.plan));
const members = ['Draggodeidad', 'JulianDele', 'osbaldoXxC'];
const personalPattern = /evidencia individual|aportaci[oó]n individual|cada (?:integrante|persona|miembro)/i;
const negative = /\bno\s+(?:(?:se\s+)?(?:requiere|pide|exige|solicita)\s+)?(?:evidencia individual|aportaci[oó]n individual)/i;
const sources = Object.entries(data.groundingCatalog || {}).filter(([, entry]) => ['classroom', 'starter'].includes(entry.source));
const requirements = sources.flatMap(([id, entry]) => {
  const lines = String(entry.content).split('\n');
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim();
    if (!personalPattern.test(text) || negative.test(text) ||
      !/evidencia|aportaci[oó]n|contribuci[oó]n|documentar|registrar/i.test(text)) continue;
    found.push({ id, source: entry.source, text });
    // Preserve source-defined fields in a following rubric/list; do not invent fields.
    for (let j = i + 1; j < lines.length && /^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[j]); j++) {
      found.push({ id, source: entry.source, text: lines[j].trim() });
    }
  }
  return found;
});
if (!requirements.length) return [{ json: { ...data, personalRequirementsRequired: false } }];
const templates = plan.issues.filter(issue => ['evidence', 'documentation'].includes(issue.category) &&
  personalPattern.test(issue.title));
const removed = new Set(templates.map(issue => issue.key));
plan.issues = plan.issues.filter(issue => !removed.has(issue.key));
const keys = members.map(member => `evidence-${member.toLowerCase()}`);
if (plan.issues.some(issue => keys.includes(issue.key))) throw new Error('PLAN_INVALID: personal evidence key collision');
for (const issue of plan.issues) issue.dependsOn = [...new Set((issue.dependsOn || []).flatMap(key => removed.has(key) ? keys : [key]))];
const completePersonalEvidence = [];
for (const member of members) {
  const criteria = [...new Set(requirements.map(requirement => requirement.text))];
  const template = templates[0];
  const review = data.coverageReview?.[`evidence-${member.toLowerCase()}`];
  const checks = criteria.map(requirement => {
    const proof = review?.requirementsChecked?.find(check => check.requirement === requirement);
    const file = proof && data.repositoryContents?.[proof.path];
    const satisfied = Boolean(review?.reviewedBy && proof?.satisfied === true && proof.personalOwner === member &&
      file?.sha === proof.blobSha && file?.sha && !file.truncated &&
      String(proof.excerpt || '').trim().length >= 20 && file.content.includes(proof.excerpt) &&
      !/\b(TODO|TBD|placeholder|pendiente)\b/i.test(proof.excerpt));
    return { requirement, satisfied, evidence: satisfied ? `repository.path:${proof.path}` : null,
      ...(satisfied ? { excerpt: proof.excerpt, blobSha: proof.blobSha, reviewedBy: review.reviewedBy, personalOwner: member } : {}) };
  });
  if (checks.length && checks.every(check => check.satisfied)) {
    completePersonalEvidence.push({ key: `evidence-${member.toLowerCase()}`, member, status: 'complete', requirementsChecked: checks });
    continue;
  }
  const pendingCriteria = checks.filter(check => !check.satisfied).map(check => check.requirement);
  const sections = {
    historiaUsuario: `Como integrante ${member}, quiero documentar MI contribución para cumplir la evidencia individual solicitada.`,
    contexto: `Responsabilidad exclusiva de ${member}. Registrar únicamente mi propia contribución.`,
    objetivoTecnico: pendingCriteria, alcance: pendingCriteria, fueraDeAlcance: ['Completar evidencia de otros integrantes.'],
    archivosEsperados: template?.sections?.archivosEsperados || [], pasosSugeridos: pendingCriteria,
    criteriosAceptacion: pendingCriteria, pruebas: ['Verificar mi evidencia contra los requisitos citados.'], dependencias: [],
    evidenciaIndividual: pendingCriteria, definitionOfDone: pendingCriteria,
  };
  plan.issues.push({ key: `evidence-${member.toLowerCase()}`,
    title: `[${data.course}][W${data.weekPadded}] Evidencia individual — ${member}`,
    category: 'individual-evidence', type: 'evidence', priority: 'medium', difficulty: 'easy', estimatedWeight: 1,
    risk: 'low', requiresCoding: false, requiresRepositoryKnowledge: false,
    requirementKind: 'sourceRequirement', personalRequirement: true, delegable: false, personalOwner: member,
    assignee: member, dependsOn: [], sections,
    gapAnalysis: { status: checks.some(check => check.satisfied) ? 'partial' : 'missing', summary: 'La responsabilidad personal requiere cobertura verificada por integrante.',
      evidence: [...new Set(requirements.map(r => r.id))], requirementsChecked: checks },
    provenance: requirements.map(r => ({ claim: r.text, source: r.source, evidence: r.id })),
    groundingStatus: 'grounded', personalSourceRequirements: requirements,
  });
}
for (const issue of plan.issues) {
  issue.dependsOn = (issue.dependsOn || []).filter(key => {
    const done = completePersonalEvidence.find(entry => entry.key === key);
    if (!done) return true;
    issue.satisfiedDependencies ||= [];
    issue.satisfiedDependencies.push({ dependency: key, resolution: 'already_satisfied', requirementsChecked: done.requirementsChecked });
    return false;
  });
}
return [{ json: { ...data, plan, personalRequirementsRequired: true, personalEvidenceKeys: keys, completePersonalEvidence,
  personalExpansion: { replacedKeys: [...removed], sourceRequirements: requirements } } }];
