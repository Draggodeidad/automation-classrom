return [{
  json: {
    ...$json,
    starter: {
      found: false,
      name: null,
      driveFileId: null,
      fileCount: 0,
      files: [],
      relevantFiles: [],
      requiredFiles: [],
      instructions: [],
      commands: [],
      acceptanceCriteria: [],
      tests: [],
      constraints: [],
      rubric: [],
      potentialConflicts: [],
    },
  },
}];
