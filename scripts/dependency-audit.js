import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const picomatchAdvisory = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
const picomatchVersion = '4.0.7';
const exceptionExpiresAt = Date.parse('2026-12-02T17:00:00Z');
const severities = new Set(['info', 'low', 'moderate', 'high', 'critical']);

/**
 * @typedef {{ name: string, severity: string, url: string }} Advisory
 * @typedef {{ severity: string, nodes: string[], via: (string | Advisory)[] }} Finding
 * @typedef {Record<string, Finding>} Findings
 * @typedef {Record<string, { dev?: boolean, version?: string }>} LockfilePackages
 * @typedef {{
 *   auditReportVersion: number,
 *   error?: object,
 *   vulnerabilities: Findings,
 *   metadata: { vulnerabilities: { high: number, critical: number } },
 * }} AuditReport
 */

/**
 * npm reports affected dependents as separate findings with package names in
 * `via`. Follow every cause back to its advisory before applying the exception.
 *
 * @param {string} name
 * @param {Findings} findings
 * @param {LockfilePackages} packages
 * @param {Set<string>} [ancestors]
 * @returns {boolean}
 */
function isExceptedFinding(name, findings, packages, ancestors = new Set()) {
  const finding = findings[name];
  if (
    ancestors.has(name) ||
    finding?.severity !== 'high' ||
    !Array.isArray(finding.nodes) ||
    finding.nodes.length === 0 ||
    !Array.isArray(finding.via) ||
    finding.via.length === 0
  ) {
    return false;
  }

  const devOnly = finding.nodes.every((path) => {
    const pkg = packages[path];
    return (
      typeof path === 'string' &&
      pkg?.dev === true &&
      (name !== 'picomatch' ||
        (path.endsWith('/picomatch') && pkg.version === picomatchVersion))
    );
  });
  if (!devOnly) return false;

  const chain = new Set(ancestors).add(name);
  return finding.via.every((cause) => {
    if (typeof cause === 'string') {
      return isExceptedFinding(cause, findings, packages, chain);
    }
    return (
      name === 'picomatch' &&
      cause?.name === 'picomatch' &&
      cause.severity === 'high' &&
      cause.url === picomatchAdvisory
    );
  });
}

/**
 * @param {number | null} status
 * @param {AuditReport | null} report
 * @param {LockfilePackages} packages
 * @param {Date} [now]
 */
export function evaluateAudit(status, report, packages, now = new Date()) {
  if (
    report?.auditReportVersion !== 2 ||
    report.error ||
    !report.vulnerabilities ||
    typeof report.vulnerabilities !== 'object' ||
    Array.isArray(report.vulnerabilities)
  ) {
    return 'fail';
  }

  const findings = Object.entries(report.vulnerabilities);
  if (findings.some(([, finding]) => !severities.has(finding?.severity))) {
    return 'fail';
  }
  const high = findings.filter(([, finding]) => finding.severity === 'high');
  const counts = report.metadata?.vulnerabilities;
  if (
    counts?.high !== high.length ||
    counts.critical !== 0 ||
    findings.some(([, finding]) => finding.severity === 'critical')
  ) {
    return 'fail';
  }
  if (status === 0 && high.length === 0) return 'pass';
  if (
    status !== 1 ||
    high.length === 0 ||
    !(now.getTime() < exceptionExpiresAt)
  ) {
    return 'fail';
  }

  return high.every(([name]) =>
    isExceptedFinding(name, report.vulnerabilities, packages),
  )
    ? 'exception'
    : 'fail';
}

if (import.meta.main) {
  const npmPath = process.env.npm_execpath;
  if (!npmPath) throw new Error('Run this command with npm run audit:ci.');

  const audit = spawnSync(
    process.execPath,
    [npmPath, 'audit', '--audit-level=high', '--include=dev', '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  if (audit.error) throw audit.error;

  process.stdout.write(audit.stdout);
  const report = JSON.parse(audit.stdout);
  const { packages } = JSON.parse(
    readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
  );
  const result = evaluateAudit(audit.status, report, packages);
  if (result === 'exception') {
    console.warn(
      `Temporary dev-only exception for picomatch@${picomatchVersion}: ${picomatchAdvisory}. Expires ${new Date(exceptionExpiresAt).toISOString()}.`,
    );
  }
  if (result === 'fail') {
    console.error(
      `Dependency audit failed (npm exit status: ${audit.status}).`,
    );
    process.exitCode = 1;
  }
}
