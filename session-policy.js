export function createSessionBinding(project, area) {
  if (typeof project !== 'string' || typeof area !== 'string' || !project || !area) return null;
  return Object.freeze({ project, area });
}

export function matchesSessionBinding(session, project, area) {
  return Boolean(session && session.project === project && session.area === area);
}
