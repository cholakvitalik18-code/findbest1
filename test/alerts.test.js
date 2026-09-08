'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAlertStore } = require('../alerts-store');

test('alerts: create, bind, list, update and disable round-trip', t => {
  const store = createAlertStore(':memory:');
  t.after(() => store.close());

  const alert = store.create({ query: '  iPhone 15  ', maxPrice: 500, location: 'Berlin' });
  assert.match(alert.id, /^[0-9a-f-]{36}$/);
  assert.equal(alert.query, 'iPhone 15');
  assert.equal(alert.maxPrice, 500);
  assert.equal(alert.chatId, null);
  assert.equal(store.listActive().length, 0, 'not surfaced until a chat connects');

  assert.equal(store.bind('wrong-token', '111'), null);
  const bound = store.bind(alert.token, '111');
  assert.equal(bound.chatId, '111');
  assert.equal(store.listActive().length, 1);
  assert.equal(store.listByChat('111')[0].id, alert.id);
  assert.equal(store.listByChat('222').length, 0);

  store.update(alert.id, { lastNotifiedPrice: 480, lastNotifiedItemId: 'x1', lastCheckedAt: 'now', bogus: 1 });
  const updated = store.listActive()[0];
  assert.equal(updated.lastNotifiedPrice, 480);
  assert.equal(updated.lastNotifiedItemId, 'x1');
  assert.equal('bogus' in updated, false);

  assert.equal(store.disable(alert.id, '999'), false, 'cannot disable another chat\'s alert');
  assert.equal(store.disable(alert.id, '111'), true);
  assert.equal(store.listActive().length, 0);
});

test('alerts: data persists across reopen and legacy alerts.json is imported once', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'findbest-alerts-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'alerts.json'), JSON.stringify([
    { id: 'legacy-1', token: 'tok1', query: 'PS5', maxPrice: 400, location: '', chatId: '5', active: true, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'legacy-2', token: 'tok2', query: 'Switch', maxPrice: 250, location: '', chatId: null, active: false, createdAt: '2026-01-02T00:00:00.000Z' }
  ]));

  let store = createAlertStore(dir);
  assert.equal(store.listByChat('5')[0].query, 'PS5');
  assert.equal(store.listActive().length, 1, 'legacy-2 is inactive and has no chat');
  assert.ok(fs.existsSync(path.join(dir, 'alerts.json.imported')));
  assert.ok(!fs.existsSync(path.join(dir, 'alerts.json')));
  store.create({ query: 'AirPods', maxPrice: 180 });
  store.close();

  store = createAlertStore(dir);
  assert.equal(store.listByChat('5').length, 1, 'legacy rows are not re-imported or duplicated');
  assert.equal(store.listActive().length, 1);
  store.close();
});
