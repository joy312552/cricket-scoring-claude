// Static checks for the browser code: every named import resolves to an existing export.
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const dir = 'public/js';
test('browser modules: imports resolve to real exports', () => {
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/([\w-]+\.js)'/g)) {
      const mod = fs.readFileSync(path.join(dir, m[2]), 'utf8');
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0]; if (!name) continue;
        const safe = name.replace(/\$/g, '\\$');
        assert.ok(new RegExp('export\\s+(async\\s+)?(function|const|class|let)\\s+' + safe + '(?![\\w$])').test(mod), `${f} imports ${name} from ${m[2]}`);
      }
    }
  }
});
test('server and public copies of shared modules are identical', () => {
  for (const f of ['engine.js', 'vm.js']) assert.equal(fs.readFileSync('lib/' + f, 'utf8'), fs.readFileSync('public/js/' + f, 'utf8'), f);
});
