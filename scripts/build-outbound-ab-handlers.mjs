import fs from 'fs';

const lines = fs.readFileSync('server.js', 'utf8').split(/\r?\n/);

function indent(s, n) {
  const sp = ' '.repeat(n);
  return s.split('\n').map((l) => sp + l).join('\n');
}

const helpersBlock = lines.slice(3243, 3282).join('\n');
const h1 = lines.slice(3286, 3515).join('\n');
const h2 = lines.slice(3517, 3638).join('\n');
const h3 = lines.slice(3640, 3715).join('\n');

const header = `/**
 * Dashboard outbound A/B HTTP handlers (extracted from server composition root).
 */

`;

const helpersExported = helpersBlock
  .replace(/^function getDashboardSelfServiceClientKeys/m, 'export function getDashboardSelfServiceClientKeys')
  .replace(/^function isDashboardSelfServiceClient/m, 'export function isDashboardSelfServiceClient')
  .replace(/^function isVapiOutboundAbExperimentOnlyPatch/m, 'export function isVapiOutboundAbExperimentOnlyPatch');

const out =
  header +
  helpersExported +
  `

export function createOutboundAbHandlers(deps) {
  const { invalidateClientCache, getFullClient, nanoid, createABTestExperiment } = deps;

${indent(h1, 2)}

${indent(h2, 2)}

${indent(h3, 2)}

  return {
    runOutboundAbTestSetup,
    runOutboundAbChallengerUpdate,
    runOutboundAbDimensionStop,
  };
}
`;

fs.writeFileSync('lib/outbound-ab-dashboard-handlers.js', out);
console.log('wrote lib/outbound-ab-dashboard-handlers.js');
