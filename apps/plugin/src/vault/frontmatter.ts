export function yamlFrontmatter(fields: Record<string, string | undefined>): string {
  const lines = Object.entries(fields).flatMap(([key, value]) =>
    value === undefined ? [] : [`${key}: ${JSON.stringify(value)}`],
  );
  return `---\n${lines.join("\n")}\n---`;
}
