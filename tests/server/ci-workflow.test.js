import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('OPS-004 CI Workflow Contract & Security Assertions', () => {
  const workflowPath = resolve(process.cwd(), '.github/workflows/ci.yml');
  const packageJsonPath = resolve(process.cwd(), 'package.json');
  const nvmrcPath = resolve(process.cwd(), '.nvmrc');

  const workflowContent = readFileSync(workflowPath, 'utf8');
  const secretAction = readFileSync(
    resolve(process.cwd(), '.github/actions/scan-secrets/action.yml'),
    'utf8',
  );
  const secretAuditWorkflow = readFileSync(
    resolve(process.cwd(), '.github/workflows/secret-audit.yml'),
    'utf8',
  );
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const nvmrc = readFileSync(nvmrcPath, 'utf8').trim();

  it('triggers on pull_request, push to main and develop, and manual workflow_dispatch', () => {
    expect(workflowContent).toMatch(
      /on:\s*\n\s*push:\s*\n\s*branches:\s*\[main,\s*develop\]/u,
    );
    expect(workflowContent).toMatch(/pull_request:/u);
    expect(workflowContent).toMatch(/workflow_dispatch:/u);
  });

  it('enforces read-only permissions and gives each push its own concurrency group', () => {
    expect(workflowContent).toMatch(/permissions:\s*\n\s*contents:\s*read/u);
    expect(workflowContent).toContain(
      "group: ci-${{ github.workflow }}-${{ github.ref }}-${{ github.event_name == 'push' && github.run_id || github.event_name }}",
    );
    expect(workflowContent).toContain('cancel-in-progress: true');
    expect(workflowContent).not.toMatch(/permissions:[\s\S]*write/u);
  });

  it('pins runtime to Node 24 via .nvmrc and uses pinned npm release from package.json', () => {
    expect(nvmrc).toBe('24');
    expect(packageJson.engines?.node).toBe('24.x');
    expect(packageJson.packageManager).toMatch(/^npm@11\./u);

    expect(workflowContent).toContain('node-version-file: .nvmrc');
    expect(workflowContent).toContain('cache: npm');
    expect(workflowContent).toMatch(
      /npm install --global "\$package_manager"/u,
    );
  });

  it('uses clean npm ci installation and executes the exact npm run check suite without skipping steps', () => {
    expect(packageJson.scripts?.check).toBe(
      'npm run format:check && npm run lint && npm run typecheck && npm test && npm run test:integration && npm run build',
    );
    expect(workflowContent).toMatch(/run:\s*npm ci/u);
    expect(workflowContent).toMatch(/run:\s*npm run check/u);
  });

  it('configures independent security jobs for dependency audit and verified secret scanning', () => {
    // Dependency audit job
    expect(workflowContent).toMatch(
      /name:\s*Dependency audit[\s\S]*?- run: npm ci\s*- run: npm run audit:ci/u,
    );
    expect(packageJson.scripts?.['audit:ci']).toBe(
      'node scripts/dependency-audit.js',
    );

    // Secret scan job
    expect(workflowContent).toMatch(/name:\s*Secret scan/u);
    expect(secretAction).toContain('GITLEAKS_VERSION: 8.30.1');
    expect(secretAction).toContain(
      'GITLEAKS_SHA256: 551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
    );
    expect(secretAction).toContain('sha256sum --check --strict');
    expect(secretAction).toContain('--redact --no-banner');
    expect(secretAction).toContain('${{ inputs.revisions }}');
    expect(secretAction).toContain(' ${GITLEAKS_REVISIONS:?}"');
  });

  it('scopes CI secret scans to the event and runs full history audits manually', () => {
    const scanAction = 'uses: ./.github/actions/scan-secrets';
    expect(workflowContent).toContain(scanAction);
    expect(workflowContent).toContain(
      'BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}',
    );
    expect(workflowContent).toContain(
      'HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}',
    );
    expect(workflowContent).toContain('revisions="$BASE_SHA..$HEAD_SHA"');
    expect(workflowContent).toContain(
      'revisions: ${{ steps.revisions.outputs.range }}',
    );
    expect(workflowContent).not.toContain('--all');

    expect(secretAuditWorkflow).toMatch(
      /^on:\s*\n\s*workflow_dispatch:\s*\n\s*permissions:/mu,
    );
    expect(secretAuditWorkflow).toContain(scanAction);
    expect(secretAuditWorkflow).toContain('revisions: --all');
  });

  it('strictly isolates tests by not referencing secrets or deployment steps', () => {
    // Must never reference secrets.* or cloud credentials
    expect(workflowContent).not.toContain('${{ secrets.');
    expect(workflowContent).not.toMatch(/secrets\./u);
    expect(workflowContent).not.toMatch(/MONGODB_URI/u);
    expect(workflowContent).not.toMatch(/JWT_SECRET/u);
    expect(workflowContent).not.toMatch(/LIVEKIT_/u);

    // Must never contain deploy steps
    expect(workflowContent).not.toMatch(/deploy/iu);
    expect(workflowContent).not.toMatch(/vercel/iu);
  });
});
