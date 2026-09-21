const data = $json;
if (data.parseError) return [{ json: data }];
const plan = data.plan || { issues: [] };
const catalog = data.groundingCatalog || {};
// Coverage reviews are operator-owned state, never model output. Bind each check to
// the exact requirement, source text, repository blob and a current content excerpt.
const reviews = data.coverageReview || {};
const files = data.repositoryContents || {};
const reports = [];
const excludedCompletedWork = [];
const excludedNotApplicableWork = [];
const warnings = [];
const remaining = [];
const nonempty = value => String(value || '').trim();
for (const original of plan.issues || []) {
  const issue = JSON.parse(JSON.stringify(original));
  const review = reviews[issue.key];
  const requirements = [...new Set([...(issue.sections?.alcance || []), ...(issue.sections?.criteriosAceptacion || [])].filter(nonempty))];
  const checks = requirements.map(requirement => {
    const proof = review?.requirementsChecked?.find(check => check.requirement === requirement);
    const file = proof && files[proof.path];
    const source = proof && catalog[proof.sourceEvidence];
    const satisfied = Boolean(review?.reviewedBy && proof?.satisfied === true &&
      source && ['classroom', 'starter'].includes(source.source) && nonempty(proof.sourceQuote) && source.content.includes(proof.sourceQuote) &&
      file?.sha && proof.blobSha === file.sha && !file.truncated && nonempty(proof.excerpt).length >= 20 &&
      file.content.includes(proof.excerpt) && !/\b(TODO|TBD|placeholder|pendiente)\b/i.test(proof.excerpt));
    return { requirement, satisfied, evidence: satisfied ? `repository.path:${proof.path}` : null,
      ...(satisfied ? { excerpt: proof.excerpt, blobSha: proof.blobSha, reviewedBy: review.reviewedBy,
        sourceEvidence: proof.sourceEvidence, sourceQuote: proof.sourceQuote } : { reason: 'coverage_not_verified' }) };
  });
  const personal = /evidencia individual|aportaci[oó]n individual|cada integrante|cada persona/i.test(`${issue.title} ${(issue.sections?.alcance || []).join(' ')}`);
  const expectedPaths = issue.sections?.archivosEsperados || [];
  const hasContent = expectedPaths.some(path => nonempty(files[path]?.content).length > 20);
  const covered = checks.filter(check => check.satisfied).length;
  let status = requirements.length > 0 && covered === requirements.length && !personal ? 'complete' :
    covered > 0 || hasContent ? 'partial' : 'missing';
  if (review?.notApplicable && review.reviewedBy && nonempty(review.reason) && !personal) status = 'not_applicable';
  if (issue.gapAnalysis?.status === 'complete' && status !== 'complete') warnings.push({
    code: 'WARNING_UNVERIFIED_COMPLETION', key: issue.key, message: 'EXISTS ≠ COMPLETE: falta cobertura verificada del contenido actual.',
  });
  const residual = checks.filter(check => !check.satisfied).map(check => check.requirement);
  issue.gapAnalysis = { ...issue.gapAnalysis, status, requirementsChecked: checks, remainingRequirements: residual,
    summary: status === 'complete' ? 'Cobertura revisada de todos los requisitos contra blobs actuales.' :
      status === 'not_applicable' ? review.reason : `Cobertura verificada ${covered}/${checks.length}; completar o verificar únicamente los requisitos pendientes.`,
  };
  reports.push({ key: issue.key, ...issue.gapAnalysis });
  if (['complete', 'not_applicable'].includes(status)) {
    const excluded = { key: issue.key, title: issue.title, reason: issue.gapAnalysis.summary,
      evidence: checks.filter(c => c.satisfied).map(c => c.evidence), requirementsChecked: checks, status };
    (status === 'complete' ? excludedCompletedWork : excludedNotApplicableWork).push(excluded);
    continue;
  }
  if (covered > 0 && residual.length) {
    issue.title = `Completar ${String(issue.title).replace(/^\s*\[[^\]]+\]\[W\d+\]\s*/, '')}`;
    const sections = issue.sections || {};
    issue.sections = { ...sections,
      historiaUsuario: 'Como integrante quiero completar los requisitos pendientes para satisfacer la actividad.',
      objetivoTecnico: residual, alcance: residual, pasosSugeridos: residual,
      criteriosAceptacion: residual.length >= 2 ? residual : [residual[0], `Verificar: ${residual[0]}`],
      pruebas: residual.map(r => `Verificar: ${r}`), definitionOfDone: residual,
      evidenciaIndividual: sections.evidenciaIndividual || [],
      fueraDeAlcance: [...(sections.fueraDeAlcance || []), ...checks.filter(c => c.satisfied).map(c => c.requirement)],
    };
  }
  remaining.push(issue);
}
const excluded = new Map([...excludedCompletedWork, ...excludedNotApplicableWork].map(issue => [issue.key, issue]));
for (const issue of remaining) {
  issue.satisfiedDependencies = [];
  issue.dependsOn = (issue.dependsOn || []).filter(key => {
    const dependency = excluded.get(key);
    if (!dependency) return true; // Unknown keys survive until PLAN_INVALID validation.
    issue.satisfiedDependencies.push({ dependency: key,
      resolution: dependency.status === 'complete' ? 'already_satisfied' : 'not_applicable',
      evidence: dependency.evidence, requirementsChecked: dependency.requirementsChecked, reason: dependency.reason });
    return false;
  });
}
return [{ json: { ...data, plan: { ...plan, issues: remaining },
  gapAnalysis: { requirements: reports, excludedCompletedWork, excludedNotApplicableWork, warnings } } }];
