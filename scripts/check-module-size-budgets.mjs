import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const moduleBudgets = [
  {
    path: 'server/index.ts',
    maxLines: 9_932,
    owner: 'server composition root',
  },
  {
    path: 'src/features/DeferredRoutes.tsx',
    maxLines: 4_829,
    owner: 'Arena route bundle',
  },
  {
    path: 'src/features/Battlegrounds.tsx',
    maxLines: 4_373,
    owner: 'Battlegrounds routes',
  },
  {
    path: 'src/App.tsx',
    maxLines: 1_966,
    owner: 'application shell',
  },
  {
    path: 'server/constructedCardRoutes.ts',
    maxLines: 1_591,
    owner: 'constructed-card API',
  },
  {
    path: 'src/features/StandardCards.tsx',
    maxLines: 1_560,
    owner: 'constructed-card UI',
  },
];

let failed = false;

for (const budget of moduleBudgets) {
  const source = readFileSync(resolve(process.cwd(), budget.path), 'utf8');
  const lines = source.endsWith('\n')
    ? source.slice(0, -1).split('\n').length
    : source.split('\n').length;
  const status = lines <= budget.maxLines ? 'ok' : 'over';
  console.log(
    `[module-size] ${status} ${budget.path}: ${lines} / ${budget.maxLines} lines (${budget.owner})`,
  );
  if (lines > budget.maxLines) failed = true;
}

if (failed) {
  console.error(
    '[module-size] A known monolith grew. Extract a focused module or deliberately lower another boundary before merging.',
  );
  process.exit(1);
}

console.log('[module-size] hotspot budgets are ratcheted at or below the production baseline.');
