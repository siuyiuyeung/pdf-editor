import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

const compose = readFileSync(path.join(__dirname, '..', '..', 'docker-compose.yml'), 'utf8');

test('web is published on loopback by default, so CF-Connecting-IP can only come through the tunnel', () => {
  expect(compose).toContain('"${WEB_BIND:-127.0.0.1}:3000:3000"');
  expect(compose).not.toMatch(/^\s+- "3000:3000"$/m);
});
