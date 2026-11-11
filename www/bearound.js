/* global cordova */
'use strict';

var exec = require('cordova/exec');

var SERVICE = 'Bearound';

var ScanPrecision = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low' });
var MaxQueuedPayloads = Object.freeze({ SMALL: 50, MEDIUM: 100, LARGE: 200, XLARGE: 500 });

var EVENTS = Object.freeze({
  BEACONS: 'beacons',
  SYNC_LIFECYCLE: 'syncLifecycle',
  BACKGROUND_DETECTION: 'backgroundDetection',
  SCANNING: 'scanning',
  ERROR: 'error',
  BEACON_REGION: 'beaconRegion',
  ACTIVE_SCAN: 'activeScan',
  BLUETOOTH_ZONE: 'bluetoothZone',
  BLUETOOTH_SCAN_MODE: 'bluetoothScanMode',
  BLUETOOTH_STATE: 'bluetoothState',
  PUSH_SCAN: 'pushScan',
});

var BLUETOOTH_STATES = ['poweredOn', 'poweredOff', 'unauthorized', 'unsupported', 'resetting', 'unknown'];
var DISCOVERY_SOURCES = ['serviceUUID', 'name', 'coreLocation'];
var DETECTION_READINESS = ['full', 'backgroundBle', 'foregroundOnly', 'blind'];
var LOG_STATES = ['foreground', 'background', 'backgroundLocked', 'terminated'];

// --- native calls ---------------------------------------------------------

function toError(raw) {
  var error;
  if (raw && typeof raw === 'object') {
    error = new Error(String(raw.message || 'Bearound native error'));
    error.code = String(raw.code || 'BEAROUND_ERROR');
  } else {
    error = new Error(String(raw || 'Bearound native error'));
    error.code = 'BEAROUND_ERROR';
  }
  return error;
}

function call(action, args) {
  return new Promise(function (resolve, reject) {
    exec(
      resolve,
      function (raw) {
        reject(toError(raw));
      },
      SERVICE,
      action,
      args || []
    );
  });
}

// Cordova serializes booleans as true/false on Android and as 1/0 on some iOS paths.
function callBoolean(action, args) {
  return call(action, args).then(function (value) {
    return value === true || value === 1 || value === 'true';
  });
}

function callString(action, args) {
  return call(action, args).then(function (value) {
    return value === undefined || value === null ? '' : String(value);
  });
}

function callVoid(action, args) {
  return call(action, args).then(function () {});
}

// --- parsing --------------------------------------------------------------

function asMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asNumber(value, fallback) {
  if (typeof value === 'number' && isFinite(value)) return value;
  if (typeof value === 'string' && value !== '') {
    var parsed = Number(value);
    if (isFinite(parsed)) return parsed;
  }
  return fallback === undefined ? 0 : fallback;
}

function optionalNumber(value) {
  return value === undefined || value === null ? undefined : asNumber(value);
}

function optionalBoolean(value) {
  return value === undefined || value === null ? undefined : Boolean(value);
}

function parseProximity(value) {
  var raw = String(value || '').toLowerCase();
  return raw === 'immediate' || raw === 'near' || raw === 'far' || raw === 'bt' ? raw : 'unknown';
}

function parseMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return {
    firmwareVersion: String(value.firmwareVersion === undefined ? '' : value.firmwareVersion),
    batteryLevel: asNumber(value.batteryLevel),
    movements: asNumber(value.movements),
    temperature: asNumber(value.temperature),
    txPower: optionalNumber(value.txPower),
    rssiFromBLE: optionalNumber(value.rssiFromBLE),
    isConnectable: optionalBoolean(value.isConnectable),
  };
}

function parseRssiStats(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return {
    count: asNumber(value.count),
    min: asNumber(value.min),
    max: asNumber(value.max),
    avg: asNumber(value.avg),
    stdDev: asNumber(value.stdDev),
    firstSeen: asNumber(value.firstSeen),
    lastSeen: asNumber(value.lastSeen),
  };
}

function parseDiscoverySources(value) {
  if (!Array.isArray(value)) return undefined;
  return value.map(String).filter(function (entry) {
    return DISCOVERY_SOURCES.indexOf(entry) !== -1;
  });
}

function parseBeacons(event) {
  var raw = Array.isArray(event) ? event : asMap(event).beacons;
  if (!Array.isArray(raw)) return [];
  return raw.map(function (item) {
    var beacon = asMap(item);
    return {
      uuid: String(beacon.uuid === undefined ? '' : beacon.uuid),
      major: asNumber(beacon.major),
      minor: asNumber(beacon.minor),
      rssi: asNumber(beacon.rssi),
      proximity: parseProximity(beacon.proximity),
      accuracy: asNumber(beacon.accuracy),
      timestamp: asNumber(beacon.timestamp),
      metadata: parseMetadata(beacon.metadata),
      txPower: optionalNumber(beacon.txPower),
      alreadySynced: optionalBoolean(beacon.alreadySynced),
      syncedAt: optionalNumber(beacon.syncedAt),
      discoverySources: parseDiscoverySources(beacon.discoverySources),
      rssiRaw: optionalNumber(beacon.rssiRaw),
      rssiSamples: parseRssiStats(beacon.rssiSamples),
      isStale: optionalBoolean(beacon.isStale),
    };
  });
}

function parseBluetoothState(value) {
  var raw = String(value && typeof value === 'object' ? value.state : value);
  return BLUETOOTH_STATES.indexOf(raw) !== -1 ? raw : 'unknown';
}

function parseEnterExit(event) {
  return { type: String(asMap(event).type || '').toLowerCase() === 'exit' ? 'exit' : 'enter' };
}

var PARSERS = {};
PARSERS[EVENTS.BEACONS] = parseBeacons;
PARSERS[EVENTS.SYNC_LIFECYCLE] = function (event) {
  var payload = asMap(event);
  return {
    type: payload.type === 'completed' ? 'completed' : 'started',
    beaconCount: asNumber(payload.beaconCount),
    success: optionalBoolean(payload.success),
    error: payload.error === undefined || payload.error === null ? undefined : String(payload.error),
  };
};
PARSERS[EVENTS.BACKGROUND_DETECTION] = function (event) {
  return { beaconCount: asNumber(asMap(event).beaconCount) };
};
PARSERS[EVENTS.SCANNING] = function (event) {
  return typeof event === 'boolean' ? event : Boolean(asMap(event).isScanning);
};
PARSERS[EVENTS.ERROR] = function (event) {
  if (typeof event === 'string') return { message: event };
  var message = asMap(event).message;
  return { message: String(message === undefined || message === null ? 'Unknown error' : message) };
};
PARSERS[EVENTS.BEACON_REGION] = parseEnterExit;
PARSERS[EVENTS.ACTIVE_SCAN] = function (event) {
  return { isActive: Boolean(asMap(event).isActive) };
};
PARSERS[EVENTS.BLUETOOTH_ZONE] = parseEnterExit;
PARSERS[EVENTS.BLUETOOTH_SCAN_MODE] = function (event) {
  var payload = asMap(event);
  return {
    mode: String(payload.mode || '').toLowerCase() === 'active' ? 'active' : 'idle',
    nextIdleScanAt: optionalNumber(payload.nextIdleScanAt),
  };
};
PARSERS[EVENTS.BLUETOOTH_STATE] = parseBluetoothState;
PARSERS[EVENTS.PUSH_SCAN] = function (event) {
  var payload = asMap(event);
  return {
    beaconsFound: asNumber(payload.beaconsFound),
    ingestStarted: Boolean(payload.ingestStarted),
    pendingBatches: asNumber(payload.pendingBatches),
  };
};

// --- events ---------------------------------------------------------------

var listeners = {};
var channelOpen = false;

function dispatch(message) {
  var envelope = asMap(message);
  var name = envelope.event;
  var parser = PARSERS[name];
  var registered = listeners[name];
  if (!parser || !registered || registered.length === 0) return;
  var payload = parser(envelope.payload);
  registered.slice().forEach(function (listener) {
    try {
      listener(payload);
    } catch (error) {
      // A throwing listener must not starve the others.
      setTimeout(function () {
        throw error;
      }, 0);
    }
  });
}

function openChannel() {
  if (channelOpen) return;
  channelOpen = true;
  exec(
    dispatch,
    function () {
      channelOpen = false;
    },
    SERVICE,
    'registerEventChannel',
    []
  );
}

function addListener(name, listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('Bearound: listener must be a function');
  }
  (listeners[name] = listeners[name] || []).push(listener);
  openChannel();
  return {
    remove: function () {
      var registered = listeners[name] || [];
      var index = registered.indexOf(listener);
      if (index !== -1) registered.splice(index, 1);
    },
  };
}

// --- public API -----------------------------------------------------------

function configure(config) {
  var input = asMap(config);
  var businessToken = typeof input.businessToken === 'string' ? input.businessToken.trim() : '';
  if (!businessToken) {
    return Promise.reject(toError({ code: 'INVALID_ARGUMENT', message: 'Business token is required' }));
  }
  function pick(key, fallback) {
    return input[key] === undefined || input[key] === null ? fallback : input[key];
  }
  // Defaults are sent explicitly so both platforms behave the same; out-of-range values
  // are clamped by the native SDKs.
  return callVoid('configure', [
    {
      businessToken: businessToken,
      scanPrecision: pick('scanPrecision', ScanPrecision.HIGH),
      maxQueuedPayloads: pick('maxQueuedPayloads', MaxQueuedPayloads.MEDIUM),
      periodicReconciliationEnabled: pick('periodicReconciliationEnabled', true),
      periodicReconciliationIntervalMs: pick('periodicReconciliationIntervalMs', 20 * 60 * 1000),
      periodicScanDurationMs: pick('periodicScanDurationMs', 12000),
      presenceHeartbeatIntervalMs: pick('presenceHeartbeatIntervalMs', 5 * 60 * 1000),
      collectAdvertisingId: pick('collectAdvertisingId', true),
      collectLocation: pick('collectLocation', true),
      collectWifi: pick('collectWifi', true),
      adaptiveSamplingEnabled: pick('adaptiveSamplingEnabled', true),
      // Left out unless set: the native default follows collectLocation / collectWifi.
      collectMotionSensors: pick('collectMotionSensors', null),
    },
  ]);
}

function getPersistedLog() {
  return callString('getPersistedLog').then(function (raw) {
    var entries;
    try {
      entries = JSON.parse(raw);
    } catch (error) {
      return [];
    }
    if (!Array.isArray(entries)) return [];
    return entries.map(function (entry) {
      var item = asMap(entry);
      return {
        id: String(item.id === undefined ? '' : item.id),
        timestamp: asNumber(item.timestamp),
        state: LOG_STATES.indexOf(item.state) !== -1 ? item.state : 'background',
        type: String(item.type === undefined ? '' : item.type),
        detail: String(item.detail === undefined ? '' : item.detail),
      };
    });
  });
}

function ensurePermissions(options) {
  var askBackground = Boolean(asMap(options).askBackground);
  return call('requestForegroundPermissions').then(function (status) {
    if (!askBackground || !status.fineLocation || status.backgroundLocation) return status;
    return callBoolean('requestBackgroundLocation').then(
      function () {
        return call('checkPermissions');
      },
      function () {
        return status;
      }
    );
  });
}

module.exports = {
  ScanPrecision: ScanPrecision,
  MaxQueuedPayloads: MaxQueuedPayloads,

  configure: configure,
  startScanning: function () {
    return callVoid('startScanning');
  },
  stopScanning: function () {
    return callVoid('stopScanning');
  },
  isScanning: function () {
    return callBoolean('isScanning');
  },
  setUserProperties: function (properties) {
    return callVoid('setUserProperties', [asMap(properties)]);
  },
  clearUserProperties: function () {
    return callVoid('clearUserProperties');
  },

  // Push
  setPushToken: function (token) {
    return callVoid('setPushToken', [String(token === undefined || token === null ? '' : token)]);
  },
  handleRemoteMessage: function (data) {
    return callBoolean('handleRemoteMessage', [asMap(data)]);
  },
  trackNotificationOpened: function (data) {
    return callVoid('trackNotificationOpened', [asMap(data)]);
  },

  setErrorReportingEnabled: function (enabled) {
    return callVoid('setErrorReportingEnabled', [Boolean(enabled)]);
  },
  getDetectionReadiness: function () {
    return callString('getDetectionReadiness').then(function (value) {
      return DETECTION_READINESS.indexOf(value) !== -1 ? value : 'unknown';
    });
  },

  // QA aid: local notifications for SDK events, like the native example apps.
  setDebugNotificationsEnabled: function (enabled) {
    return callVoid('setDebugNotificationsEnabled', [Boolean(enabled)]);
  },
  isDebugNotificationsEnabled: function () {
    return callBoolean('isDebugNotificationsEnabled');
  },

  // Permissions
  checkPermissions: function () {
    return call('checkPermissions');
  },
  requestForegroundPermissions: function () {
    return call('requestForegroundPermissions');
  },
  requestBackgroundLocation: function () {
    return callBoolean('requestBackgroundLocation');
  },
  requestNotificationPermission: function () {
    return callBoolean('requestNotificationPermission');
  },
  checkNotificationPermission: function () {
    return callBoolean('checkNotificationPermission');
  },
  ensurePermissions: ensurePermissions,

  // State and diagnostics
  getSdkVersion: function () {
    return callString('getSdkVersion');
  },
  getCurrentScanPrecision: function () {
    return callString('getCurrentScanPrecision');
  },
  getBleDiagnosticInfo: function () {
    return callString('getBleDiagnosticInfo');
  },
  getPendingBatchCount: function () {
    return call('getPendingBatchCount').then(function (value) {
      return asNumber(value);
    });
  },
  getPendingBatches: function () {
    return call('getPendingBatches').then(function (batches) {
      return Array.isArray(batches) ? batches.map(parseBeacons) : [];
    });
  },
  isConfigured: function () {
    return callBoolean('isConfigured');
  },
  isLocationAvailable: function () {
    return callBoolean('isLocationAvailable');
  },
  getAuthorizationStatus: function () {
    return callString('getAuthorizationStatus');
  },
  getBluetoothState: function () {
    return call('getBluetoothState').then(parseBluetoothState);
  },
  getPersistedLog: getPersistedLog,
  clearPersistedLog: function () {
    return callVoid('clearPersistedLog');
  },
  requestLocationAuthorization: function (level) {
    return callVoid('requestLocationAuthorization', [level === 'whenInUse' ? 'whenInUse' : 'always']);
  },
  requestTrackingAuthorization: function () {
    return callString('requestTrackingAuthorization');
  },
  getTrackingAuthorizationStatus: function () {
    return callString('getTrackingAuthorizationStatus');
  },

  // Foreground-service scanning (Android-only)
  enableForegroundScanning: function (config) {
    return callVoid('enableForegroundScanning', [asMap(config)]);
  },
  disableForegroundScanning: function () {
    return callVoid('disableForegroundScanning');
  },
  isForegroundScanningEnabled: function () {
    return callBoolean('isForegroundScanningEnabled');
  },
  setForegroundNotificationContent: function (content) {
    return callVoid('setForegroundNotificationContent', [asMap(content)]);
  },

  // Background reliability (Android-only)
  isIgnoringBatteryOptimizations: function () {
    return callBoolean('isIgnoringBatteryOptimizations');
  },
  openBatteryOptimizationSettings: function () {
    return callBoolean('openBatteryOptimizationSettings');
  },
  isAutostartManageable: function () {
    return callBoolean('isAutostartManageable');
  },
  openManufacturerAutostartSettings: function () {
    return callBoolean('openManufacturerAutostartSettings');
  },

  // Events
  addBeaconsListener: function (listener) {
    return addListener(EVENTS.BEACONS, listener);
  },
  addSyncLifecycleListener: function (listener) {
    return addListener(EVENTS.SYNC_LIFECYCLE, listener);
  },
  addBackgroundDetectionListener: function (listener) {
    return addListener(EVENTS.BACKGROUND_DETECTION, listener);
  },
  addScanningListener: function (listener) {
    return addListener(EVENTS.SCANNING, listener);
  },
  addErrorListener: function (listener) {
    return addListener(EVENTS.ERROR, listener);
  },
  addBeaconRegionListener: function (listener) {
    return addListener(EVENTS.BEACON_REGION, listener);
  },
  addActiveScanListener: function (listener) {
    return addListener(EVENTS.ACTIVE_SCAN, listener);
  },
  addBluetoothZoneListener: function (listener) {
    return addListener(EVENTS.BLUETOOTH_ZONE, listener);
  },
  addBluetoothScanModeListener: function (listener) {
    return addListener(EVENTS.BLUETOOTH_SCAN_MODE, listener);
  },
  addBluetoothStateListener: function (listener) {
    return addListener(EVENTS.BLUETOOTH_STATE, listener);
  },
  addPushScanListener: function (listener) {
    return addListener(EVENTS.PUSH_SCAN, listener);
  },
};
