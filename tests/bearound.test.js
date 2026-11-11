'use strict';

// Tests the JavaScript layer against a fake `cordova/exec`: what it sends to the native
// side, and how it turns native answers and events into the public API results.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', 'www', 'bearound.js');

/** Loads a fresh copy of the plugin wired to a scripted native side. */
function load(native) {
  const calls = [];
  let emit = null;

  const exec = (success, failure, service, action, args) => {
    calls.push({ service, action, args });
    if (action === 'registerEventChannel') {
      emit = success;
      return;
    }
    const answer = native && native[action];
    if (answer && 'error' in answer) failure(answer.error);
    else success(answer ? answer.value : undefined);
  };

  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'cordova/exec') return exec;
    return originalLoad.call(this, request, ...rest);
  };
  delete require.cache[MODULE_PATH];
  try {
    return { plugin: require(MODULE_PATH), calls, emit: (event, payload) => emit({ event, payload }) };
  } finally {
    Module._load = originalLoad;
  }
}

test('configure fills the defaults and trims the token', async () => {
  const { plugin, calls } = load();
  await plugin.configure({ businessToken: '  token-1  ', collectWifi: false });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].service, 'Bearound');
  assert.equal(calls[0].action, 'configure');
  assert.deepEqual(calls[0].args, [
    {
      businessToken: 'token-1',
      scanPrecision: 'high',
      maxQueuedPayloads: 100,
      periodicReconciliationEnabled: true,
      periodicReconciliationIntervalMs: 1200000,
      periodicScanDurationMs: 12000,
      presenceHeartbeatIntervalMs: 300000,
      collectAdvertisingId: true,
      collectLocation: true,
      collectWifi: false,
      adaptiveSamplingEnabled: true,
      collectMotionSensors: null,
    },
  ]);
});

test('configure keeps an explicit zero heartbeat', async () => {
  const { plugin, calls } = load();
  await plugin.configure({ businessToken: 'token-1', presenceHeartbeatIntervalMs: 0 });
  assert.equal(calls[0].args[0].presenceHeartbeatIntervalMs, 0);
});

test('configure rejects an empty token without calling native', async () => {
  const { plugin, calls } = load();
  await assert.rejects(plugin.configure({ businessToken: '   ' }), (error) => {
    assert.equal(error.code, 'INVALID_ARGUMENT');
    assert.equal(error.message, 'Business token is required');
    return true;
  });
  await assert.rejects(plugin.configure(), { code: 'INVALID_ARGUMENT' });
  assert.equal(calls.length, 0);
});

test('a native error becomes an Error with a code', async () => {
  const { plugin } = load({ startScanning: { error: { code: 'START_ERROR', message: 'boom' } } });
  await assert.rejects(plugin.startScanning(), (error) => {
    assert.ok(error instanceof Error);
    assert.equal(error.code, 'START_ERROR');
    assert.equal(error.message, 'boom');
    return true;
  });
});

test('a plain-string native error gets the generic code', async () => {
  const { plugin } = load({ stopScanning: { error: 'Invalid action' } });
  await assert.rejects(plugin.stopScanning(), { code: 'BEAROUND_ERROR', message: 'Invalid action' });
});

test('booleans are normalized across platforms', async () => {
  assert.equal(await load({ isScanning: { value: 1 } }).plugin.isScanning(), true);
  assert.equal(await load({ isScanning: { value: true } }).plugin.isScanning(), true);
  assert.equal(await load({ isScanning: { value: 0 } }).plugin.isScanning(), false);
  assert.equal(await load({ isScanning: { value: undefined } }).plugin.isScanning(), false);
});

test('getBluetoothState falls back to unknown', async () => {
  assert.equal(await load({ getBluetoothState: { value: 'poweredOff' } }).plugin.getBluetoothState(), 'poweredOff');
  assert.equal(await load({ getBluetoothState: { value: 'weird' } }).plugin.getBluetoothState(), 'unknown');
});

test('getPersistedLog parses entries and survives bad input', async () => {
  const raw = JSON.stringify([
    { id: 'a', timestamp: 10, state: 'terminated', type: 'sync', detail: 'ok' },
    { id: 'b', timestamp: '20', state: 'nonsense', type: 'scan' },
  ]);
  const entries = await load({ getPersistedLog: { value: raw } }).plugin.getPersistedLog();
  assert.deepEqual(entries, [
    { id: 'a', timestamp: 10, state: 'terminated', type: 'sync', detail: 'ok' },
    { id: 'b', timestamp: 20, state: 'background', type: 'scan', detail: '' },
  ]);

  assert.deepEqual(await load({ getPersistedLog: { value: 'not json' } }).plugin.getPersistedLog(), []);
  assert.deepEqual(await load({ getPersistedLog: { value: '{}' } }).plugin.getPersistedLog(), []);
});

test('beacon events are parsed and delivered to every listener', () => {
  const { plugin, emit, calls } = load();
  const first = [];
  const second = [];
  plugin.addBeaconsListener((beacons) => first.push(beacons));
  plugin.addBeaconsListener((beacons) => second.push(beacons));

  // One native channel, however many listeners.
  assert.equal(calls.filter((call) => call.action === 'registerEventChannel').length, 1);

  emit('beacons', {
    beacons: [
      {
        uuid: 'E2',
        major: 1,
        minor: '7',
        rssi: -60,
        proximity: 'NEAR',
        accuracy: 1.5,
        timestamp: 1000,
        alreadySynced: 1,
        discoverySources: ['coreLocation', 'bogus'],
        metadata: { firmwareVersion: 1, batteryLevel: 3269, movements: 2, temperature: 21 },
      },
    ],
  });

  assert.equal(first.length, 1);
  assert.deepEqual(second, first);
  const beacon = first[0][0];
  assert.equal(beacon.minor, 7);
  assert.equal(beacon.proximity, 'near');
  assert.equal(beacon.alreadySynced, true);
  assert.deepEqual(beacon.discoverySources, ['coreLocation']);
  assert.equal(beacon.metadata.firmwareVersion, '1');
  assert.equal(beacon.metadata.batteryLevel, 3269);
  assert.equal(beacon.isStale, undefined);
  assert.equal(beacon.rssiSamples, undefined);
});

test('each event type reaches only its own listeners, in its public shape', () => {
  const { plugin, emit } = load();
  const seen = {};
  plugin.addScanningListener((value) => (seen.scanning = value));
  plugin.addSyncLifecycleListener((value) => (seen.sync = value));
  plugin.addErrorListener((value) => (seen.error = value));
  plugin.addBeaconRegionListener((value) => (seen.region = value));
  plugin.addBluetoothStateListener((value) => (seen.bluetooth = value));
  plugin.addBluetoothScanModeListener((value) => (seen.mode = value));

  emit('scanning', { isScanning: true });
  emit('syncLifecycle', { type: 'completed', beaconCount: 3, success: false, error: 'offline' });
  emit('error', { message: 'SDK not configured' });
  emit('beaconRegion', { type: 'EXIT' });
  emit('bluetoothState', { state: 'poweredOff' });
  emit('bluetoothScanMode', { mode: 'idle', nextIdleScanAt: 5000 });
  emit('unknownEvent', { anything: true });

  assert.deepEqual(seen, {
    scanning: true,
    sync: { type: 'completed', beaconCount: 3, success: false, error: 'offline' },
    error: { message: 'SDK not configured' },
    region: { type: 'exit' },
    bluetooth: 'poweredOff',
    mode: { mode: 'idle', nextIdleScanAt: 5000 },
  });
});

test('remove() stops delivery to that listener only', () => {
  const { plugin, emit } = load();
  let kept = 0;
  let removed = 0;
  plugin.addScanningListener(() => kept++);
  const subscription = plugin.addScanningListener(() => removed++);

  emit('scanning', { isScanning: true });
  subscription.remove();
  emit('scanning', { isScanning: false });

  assert.equal(kept, 2);
  assert.equal(removed, 1);
});

test('a non-function listener is refused', () => {
  const { plugin } = load();
  assert.throws(() => plugin.addBeaconsListener('nope'), TypeError);
});

test('ensurePermissions asks for background only when requested and useful', async () => {
  const granted = { fineLocation: true, backgroundLocation: false };
  const upgraded = { fineLocation: true, backgroundLocation: true };

  const plain = load({ requestForegroundPermissions: { value: granted } });
  assert.deepEqual(await plain.plugin.ensurePermissions(), granted);
  assert.deepEqual(plain.calls.map((call) => call.action), ['requestForegroundPermissions']);

  const background = load({
    requestForegroundPermissions: { value: granted },
    requestBackgroundLocation: { value: true },
    checkPermissions: { value: upgraded },
  });
  assert.deepEqual(await background.plugin.ensurePermissions({ askBackground: true }), upgraded);
  assert.deepEqual(background.calls.map((call) => call.action), [
    'requestForegroundPermissions',
    'requestBackgroundLocation',
    'checkPermissions',
  ]);

  // A manifest without the background permission must not fail the whole call.
  const undeclared = load({
    requestForegroundPermissions: { value: granted },
    requestBackgroundLocation: { error: { code: 'PERMISSION_NOT_DECLARED', message: 'x' } },
  });
  assert.deepEqual(await undeclared.plugin.ensurePermissions({ askBackground: true }), granted);

  const denied = load({ requestForegroundPermissions: { value: { fineLocation: false } } });
  await denied.plugin.ensurePermissions({ askBackground: true });
  assert.deepEqual(denied.calls.map((call) => call.action), ['requestForegroundPermissions']);
});

test('push helpers forward their payloads', async () => {
  const { plugin, calls } = load({ handleRemoteMessage: { value: true } });
  await plugin.setPushToken('abc');
  assert.equal(await plugin.handleRemoteMessage({ bearound: '1' }), true);
  await plugin.trackNotificationOpened({ bearound: { sid: 's' } });

  assert.deepEqual(
    calls.map((call) => [call.action, call.args]),
    [
      ['setPushToken', ['abc']],
      ['handleRemoteMessage', [{ bearound: '1' }]],
      ['trackNotificationOpened', [{ bearound: { sid: 's' } }]],
    ]
  );
});

test('pending batches are parsed as lists of beacons', async () => {
  const raw = [[{ uuid: 'E2', major: 1, minor: 2, rssi: -70, proximity: 'bt', accuracy: -1, timestamp: 5 }], []];
  const batches = await load({ getPendingBatches: { value: raw } }).plugin.getPendingBatches();
  assert.equal(batches.length, 2);
  assert.equal(batches[0][0].proximity, 'bt');
  assert.equal(batches[0][0].accuracy, -1);
  assert.deepEqual(batches[1], []);
  assert.deepEqual(await load({ getPendingBatches: { value: null } }).plugin.getPendingBatches(), []);
});

test('the push scan event keeps its three fields', () => {
  const { plugin, emit } = load();
  let seen;
  plugin.addPushScanListener((event) => (seen = event));
  emit('pushScan', { beaconsFound: 2, ingestStarted: 1, pendingBatches: '3' });
  assert.deepEqual(seen, { beaconsFound: 2, ingestStarted: true, pendingBatches: 3 });
});

test('debug notifications are toggled with a boolean', async () => {
  const { plugin, calls } = load({ isDebugNotificationsEnabled: { value: 1 } });
  await plugin.setDebugNotificationsEnabled('yes');
  assert.deepEqual(calls[0].args, [true]);
  assert.equal(await plugin.isDebugNotificationsEnabled(), true);
});

test('collection switches are forwarded as given', async () => {
  const { plugin, calls } = load();
  await plugin.configure({ businessToken: 'token-1', collectMotionSensors: false, adaptiveSamplingEnabled: false });
  assert.equal(calls[0].args[0].collectMotionSensors, false);
  assert.equal(calls[0].args[0].adaptiveSamplingEnabled, false);
});

test('detection readiness falls back to unknown', async () => {
  assert.equal(await load({ getDetectionReadiness: { value: 'backgroundBle' } }).plugin.getDetectionReadiness(), 'backgroundBle');
  assert.equal(await load({ getDetectionReadiness: { value: 'something' } }).plugin.getDetectionReadiness(), 'unknown');
});

test('error reporting is toggled with a boolean', async () => {
  const { plugin, calls } = load();
  await plugin.setErrorReportingEnabled(false);
  assert.deepEqual([calls[0].action, calls[0].args], ['setErrorReportingEnabled', [false]]);
});
