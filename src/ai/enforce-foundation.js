const data = $json;
const plan = data.plan || { issues: [] };
const issues = (Array.isArray(plan.issues) ? plan.issues : []).filter(
  (issue) => issue && !["foundation", "classroom-delivery"].includes(issue.key),
);
const weekPadded = String(
  plan.weekPadded || String(plan.week || "").padStart(2, "0"),
);
const prefix = `[${plan.course}][W${weekPadded}]`;
const hasStarter = Boolean(data.starter?.found);
const starterName = plan.source?.starterName || data.starter?.name || null;

const internalSections = (
  description,
  objectives,
  criteria,
  tests,
  evidence,
) => ({
  historiaUsuario: `Como responsable operativo quiero ${description} para habilitar el trabajo semanal.`,
  contexto:
    "Esta responsabilidad proviene de la política interna del workflow, no de un requisito atribuido al profesor.",
  objetivoTecnico: objectives,
  alcance: objectives,
  fueraDeAlcance: [
    "Agregar requisitos técnicos no respaldados por Classroom, starter o repositorio.",
  ],
  archivosEsperados: [],
  pasosSugeridos: [
    "Revisar las fuentes disponibles y ejecutar únicamente acciones respaldadas por ellas.",
  ],
  criteriosAceptacion: criteria,
  pruebas: tests,
  dependencias: [],
  evidenciaIndividual: evidence,
  definitionOfDone: criteria,
});

const next = [];
if (hasStarter) {
  next.push({
    key: "foundation",
    title: `${prefix} Preparar ${starterName} y establecer baseline de trabajo`,
    assignee: "Draggodeidad",
    type: "devops",
    priority: "high",
    category: "setup",
    difficulty: "easy",
    estimatedWeight: 1,
    functionalWeight: 0,
    operationalWeight: 1,
    risk: "low",
    requiresCoding: false,
    requiresRepositoryKnowledge: true,
    dependsOn: [],
    requirementKind: "internalWorkflowRequirement",
    gapAnalysis: {
      status: "missing",
      summary: "El starter requiere preparación antes del trabajo funcional.",
      evidence: ["workflow.setup-policy", "starter.archive"],
    },
    provenance: [
      { claim: starterName, source: "starter", evidence: "starter.archive" },
      {
        claim: "Draggodeidad prepara el starter y el baseline",
        source: "workflowConfiguration",
        evidence: "workflow.setup-policy",
      },
    ],
    sections: internalSections(
      `preparar ${starterName} y dejar un baseline utilizable`,
      [
        "Obtener e integrar el starter sin inventar comandos.",
        "Comprobar la estructura y las verificaciones respaldadas por las fuentes disponibles.",
      ],
      [
        "El starter queda preparado como baseline de trabajo.",
        "Cualquier comando o archivo mencionado conserva provenance verificable.",
      ],
      [
        "Ejecutar únicamente las verificaciones definidas actualmente por el proyecto o el starter.",
      ],
      [
        "Registrar el resultado de la preparación y los conflictos encontrados.",
      ],
    ),
  });
}

const foundationDependency = hasStarter ? ["foundation"] : [];
for (const issue of issues) {
  next.push({
    ...issue,
    dependsOn: [
      ...new Set([...(issue.dependsOn || []), ...foundationDependency]),
    ],
  });
}

const deliveryDependencies = next.map((issue) => issue.key);
next.push({
  key: "classroom-delivery",
  title: `${prefix} Consolidar evidencia y preparar entrega en Classroom`,
  assignee: "Draggodeidad",
  type: "evidence",
  priority: "high",
  category: "delivery",
  difficulty: "easy",
  estimatedWeight: 1,
  functionalWeight: 0,
  operationalWeight: 1,
  risk: "low",
  requiresCoding: false,
  requiresRepositoryKnowledge: false,
  dependsOn: deliveryDependencies,
  requirementKind: "internalWorkflowRequirement",
  gapAnalysis: {
    status: "missing",
    summary: "La actividad todavía requiere el cierre operativo de la entrega.",
    evidence: ["workflow.delivery-policy"],
  },
  provenance: [
    {
      claim:
        "Draggodeidad consolida la evidencia y realiza la entrega final en Google Classroom",
      source: "workflowConfiguration",
      evidence: "workflow.delivery-policy",
    },
  ],
  sections: internalSections(
    "consolidar la evidencia disponible y preparar la entrega final en Classroom",
    [
      "Comprobar los criterios de entrega realmente presentes en las fuentes.",
      "Reunir la evidencia disponible y realizar el cierre en Classroom.",
    ],
    [
      "Todas las tareas necesarias del plan están resueltas antes del cierre.",
      "La entrega usa sólo elementos solicitados o respaldados por las fuentes.",
    ],
    [
      "Revisar el conjunto final contra los criterios explícitos de la actividad.",
    ],
    ["Registrar la referencia final de entrega que corresponda."],
  ),
});

return [{ json: { ...data, plan: { ...plan, issues: next } } }];
