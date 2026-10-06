// Blocks commits whose *added* lines contain strings shaped like live credentials.
// Dependency-free so it runs on any developer machine. Backs up GitHub secret scanning;
// it can be skipped with --no-verify, so it is not the only line of defence.

const PATTERNS = [
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Google API key (AQ. form)', re: /AQ\.[A-Za-z0-9_-]{30,}/ },
  { name: 'Anthropic API key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'AWS access key ID', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'Slack token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Private key block', re: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY( BLOCK)?-----/ },
];

/**
 * @param {string} text  text to scan (typically the added lines of a staged diff)
 * @returns {{ name: string, line: number }[]}
 */
export function findSecrets(text) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    for (const p of PATTERNS) if (p.re.test(line)) hits.push({ name: p.name, line: i + 1 });
  });
  return hits;
}

/** Keeps only lines added in a unified diff (ignores removed lines and file headers). */
export function addedLines(diff) {
  return diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => l.slice(1)).join('\n');
}

async function main() {
  const { execFileSync } = await import('node:child_process');
  const diff = execFileSync('git', ['diff', '--cached', '--unified=0', '--no-color'], { encoding: 'utf8' });
  const hits = findSecrets(addedLines(diff));
  if (!hits.length) process.exit(0);
  console.error('\nCommit blocked: staged changes look like they contain a credential:');
  for (const h of hits) console.error(`  - ${h.name} (added line ${h.line} of the staged diff)`);
  console.error('\nRemove it, store it in server/.env instead, and try again.\n');
  process.exit(1);
}

import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
