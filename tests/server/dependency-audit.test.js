import { describe, expect, it } from 'vitest';
import { evaluateAudit } from '../../scripts/dependency-audit.js';

const advisory = {
  name: 'picomatch',
  severity: 'high',
  url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
};
const beforeExpiry = new Date('2026-11-18T00:00:00Z');
const timeAtExpiry = new Date('2026-12-02T17:00:00Z');

function auditReport() {
  return {
    auditReportVersion: 2,
    metadata: { vulnerabilities: { high: 2, critical: 0 } },
    vulnerabilities: {
      picomatch: {
        severity: 'high',
        nodes: ['node_modules/picomatch'],
        via: [{ ...advisory }],
      },
      vitest: {
        severity: 'high',
        nodes: ['node_modules/vitest'],
        via: ['picomatch'],
      },
    },
  };
}

function lockfilePackages() {
  return {
    'node_modules/picomatch': { dev: true, version: '4.0.7' },
    'node_modules/vitest': { dev: true, version: '5.1.0' },
  };
}

describe('Dependency audit', () => {
  it('allows a healthy audit after the exception expires', () => {
    const report = {
      auditReportVersion: 2,
      metadata: { vulnerabilities: { high: 0, critical: 0 } },
      vulnerabilities: {},
    };

    expect(evaluateAudit(0, report, {}, timeAtExpiry)).toBe('pass');
  });

  it('allows the known dev-only advisory and its dependent findings before expiry', () => {
    expect(
      evaluateAudit(1, auditReport(), lockfilePackages(), beforeExpiry),
    ).toBe('exception');
  });

  it('blocks the known advisory when the exception expires', () => {
    expect(
      evaluateAudit(1, auditReport(), lockfilePackages(), timeAtExpiry),
    ).toBe('fail');
  });

  it('blocks a runtime copy of picomatch', () => {
    const packages = lockfilePackages();
    packages['node_modules/picomatch'].dev = false;

    expect(evaluateAudit(1, auditReport(), packages, beforeExpiry)).toBe(
      'fail',
    );
  });

  it('blocks another affected version of picomatch', () => {
    const packages = lockfilePackages();
    packages['node_modules/picomatch'].version = '4.0.6';

    expect(evaluateAudit(1, auditReport(), packages, beforeExpiry)).toBe(
      'fail',
    );
  });

  it('blocks a second high advisory even when it affects the same package', () => {
    const report = auditReport();
    report.vulnerabilities.picomatch.via.push({
      ...advisory,
      url: 'https://github.com/advisories/GHSA-c2c7-rcm5-vvqj',
    });

    expect(evaluateAudit(1, report, lockfilePackages(), beforeExpiry)).toBe(
      'fail',
    );
  });

  it('blocks a critical finding in the dependency chain', () => {
    const report = auditReport();
    report.metadata.vulnerabilities = { high: 1, critical: 1 };
    report.vulnerabilities.vitest.severity = 'critical';

    expect(evaluateAudit(1, report, lockfilePackages(), beforeExpiry)).toBe(
      'fail',
    );
  });

  it('blocks report entries whose advisory cannot be traced', () => {
    const report = auditReport();
    report.vulnerabilities.vitest.via = ['vitest'];

    expect(evaluateAudit(1, report, lockfilePackages(), beforeExpiry)).toBe(
      'fail',
    );
  });

  it('blocks npm registry errors', () => {
    const report = { ...auditReport(), error: { code: 'E503' } };

    expect(evaluateAudit(1, report, lockfilePackages(), beforeExpiry)).toBe(
      'fail',
    );
  });
});
