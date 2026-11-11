/* global cordova */

// Example app for the Bearound Cordova plugin. It follows the native BeAroundScan example
// apps screen by screen: same sections, labels, formatting and sorting, so readings can be
// compared side by side. SDK values are shown as delivered, with no extra processing.
(function () {
  'use strict';

  var SETTINGS_KEY = 'bearound.example.settings';
  var MAX_GEOFENCE_EVENTS = 50;
  var NO_VALUE = '-';
  var Bearound;
  var isIos = false;

  var state = {
    statusMessage: 'Pronto',
    isScanning: false,
    beacons: [],
    lastScanTime: null,
    sortOption: 'proximity',
    pinned: {},
    permissions: null,
    authorization: '',
    bluetooth: 'unknown',
    lastSyncTime: null,
    lastSyncBeaconCount: 0,
    lastSyncResult: 'Aguardando...',
    retryBatches: [],
    location: { inside: false, lastEnter: null, lastExit: null, enterCount: 0, seen: {} },
    bluetoothEye: { inside: false, lastEnter: null, lastExit: null, enterCount: 0, seen: {} },
    bluetoothScanMode: 'idle',
    bluetoothNextIdleScanAt: null,
    isActiveScanRunning: false,
    geofenceEvents: [],
    log: [],
    logFilter: 'all',
  };

  var settings = {
    token: '',
    scanPrecision: null,
    queueSize: 100,
    userId: '',
    userEmail: '',
    userName: '',
    userCustom: '',
    debugNotifications: true,
    foregroundService: true,
  };

  // --- small helpers -------------------------------------------------------

  function $(id) {
    return document.getElementById(id);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clockTime(value) {
    if (value === null || value === undefined) return '--';
    return new Date(value).toLocaleTimeString('pt-BR', { hour12: false });
  }

  function plural(count) {
    return count === 1 ? '' : 's';
  }

  function describe(error) {
    return (error && error.code ? error.code + ': ' : '') + (error && error.message ? error.message : String(error));
  }

  function note(message) {
    // Mirrored to the native console so a run can be followed from a connected computer.
    console.log('[bearound-example] ' + message);
  }

  function beaconKey(beacon) {
    return beacon.major + '.' + beacon.minor;
  }

  // --- icons ---------------------------------------------------------------

  var ICONS = {
    location: 'M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21z M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    antenna: 'M12 13v8 M12 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M8.5 15a5 5 0 0 1 0-7 M15.5 8a5 5 0 0 1 0 7 M6 17.5a8.5 8.5 0 0 1 0-12 M18 5.5a8.5 8.5 0 0 1 0 12',
    bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z M10 20a2 2 0 0 0 4 0',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L7 6.5 5 6l-1 3 2 1v2l-2 1 1 3 2-.5L8.5 17 8 19l3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1v-2z',
    check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8 12.5l2.8 2.8L16 9.5',
    list: 'M4 5h16v14H4z M8 9h8 M8 12h8 M8 15h5',
    retry: 'M12 21a9 9 0 1 0-8.5-6 M3 20v-5h5',
    eye: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    upload: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16V8 M8.5 11.5L12 8l3.5 3.5',
    battery: 'M3 8h15v8H3z M20 10.5v3',
    thermometer: 'M12 14.5V4a2 2 0 0 0-4 0v10.5a4 4 0 1 0 4 0z',
    walk: 'M13 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M9 22l2-7-3-3 1-5 4 1 2 3 3 1 M11 15l4 2 1 5',
    cpu: 'M7 7h10v10H7z M10 3v4 M14 3v4 M10 17v4 M14 17v4 M3 10h4 M3 14h4 M17 10h4 M17 14h4',
  };

  function icon(name, className) {
    var holder = el('span', 'icon' + (className ? ' ' + className : ''));
    fillIcon(holder, name);
    return holder;
  }

  function fillIcon(holder, name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[name] || '');
    svg.appendChild(path);
    holder.textContent = '';
    holder.appendChild(svg);
  }

  // --- settings ------------------------------------------------------------

  function loadSettings() {
    try {
      var stored = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}');
      Object.keys(settings).forEach(function (key) {
        if (stored[key] !== undefined && stored[key] !== null) settings[key] = stored[key];
      });
    } catch (error) {
      note('settings could not be read: ' + describe(error));
    }
    if (!settings.token) settings.token = window.BEAROUND_EXAMPLE_TOKEN || '';
    // Same defaults as each native example: iOS scans at high precision, Android at medium.
    if (!settings.scanPrecision) settings.scanPrecision = isIos ? 'high' : 'medium';
  }

  function saveSettings() {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  // --- labels --------------------------------------------------------------

  var PROXIMITY = {
    immediate: { text: 'Imediato', color: 'var(--green)', rank: 0 },
    near: { text: 'Perto', color: 'var(--orange)', rank: 1 },
    far: { text: 'Longe', color: 'var(--red)', rank: 2 },
    bt: { text: 'Bluetooth', color: 'var(--blue)', rank: 3 },
    unknown: { text: 'Desconhecido', color: 'var(--gray)', rank: 4 },
  };

  var SOURCES = {
    serviceUUID: { text: 'Service UUID', color: 'var(--purple)' },
    coreLocation: { text: 'iBeacon', color: 'var(--indigo)' },
    name: { text: 'Name', color: 'var(--teal)' },
  };

  function precisionLabel(value) {
    if (isIos) {
      return { high: 'Alta (Ininterrupto)', medium: 'Média (3x10s/min)', low: 'Baixa (1x10s/min)' }[value] || '--';
    }
    return { high: 'Alta (contínuo, sync 15s)', medium: 'Média (sync 60s)', low: 'Baixa (sync 60s)' }[value] || '--';
  }

  function locationStatus() {
    var permissions = state.permissions;
    var raw = String(state.authorization || '').toLowerCase();
    var text;
    var tone;
    if (raw.indexOf('always') !== -1) {
      text = 'Sempre (Background habilitado)';
      tone = 'green';
    } else if (raw.indexOf('wheninuse') !== -1 || raw.indexOf('when_in_use') !== -1) {
      text = 'Quando em uso (Background não funciona)';
      tone = 'orange';
    } else if (raw.indexOf('denied') !== -1 || raw.indexOf('restricted') !== -1) {
      text = 'Negada';
      tone = 'red';
    } else if (raw.indexOf('notdetermined') !== -1 || raw.indexOf('not_determined') !== -1) {
      text = 'Aguardando resposta...';
      tone = 'orange';
    } else if (permissions && permissions.fineLocation) {
      text = permissions.backgroundLocation ? 'Sempre (Background habilitado)' : 'Concedida';
      tone = 'green';
    } else {
      text = permissions ? 'Negada' : 'Verificando...';
      tone = permissions ? 'red' : 'secondary';
    }
    // With reduced accuracy iOS turns the Core Location beacon APIs off.
    if (permissions && permissions.fineLocation && permissions.preciseLocation === false) {
      text += ' | Precisa: OFF (beacons CL desabilitados)';
    }
    return { text: text, tone: tone };
  }

  function bluetoothStatus() {
    switch (state.bluetooth) {
      case 'poweredOn':
        return { text: 'Ligado', tone: 'green' };
      case 'poweredOff':
        return { text: 'Desligado', tone: 'red' };
      case 'unauthorized':
        return { text: 'Não autorizado', tone: 'red' };
      case 'unsupported':
        return { text: 'Não suportado', tone: 'red' };
      case 'resetting':
        return { text: 'Reiniciando', tone: 'orange' };
      default:
        return { text: 'Desconhecido', tone: 'orange' };
    }
  }

  function notificationStatus() {
    if (!state.permissions) return { text: 'Verificando...', tone: 'orange' };
    return state.permissions.notifications
      ? { text: 'Autorizada', tone: 'green' }
      : { text: 'Negada', tone: 'red' };
  }

  function setStatus(id, status) {
    var node = $(id);
    node.textContent = status.text;
    node.className = 'value tone-' + status.tone;
    var rowIcon = node.parentNode.querySelector('.icon');
    if (rowIcon) rowIcon.className = 'icon tone-' + status.tone;
  }

  // --- sorting (same rules as the native examples) --------------------------

  function sortBeacons(beacons) {
    return beacons.slice().sort(function (a, b) {
      var pinnedA = Boolean(state.pinned[beaconKey(a)]);
      var pinnedB = Boolean(state.pinned[beaconKey(b)]);
      if (pinnedA !== pinnedB) return pinnedA ? -1 : 1;

      if (state.sortOption === 'id') {
        return beaconKey(a) < beaconKey(b) ? -1 : beaconKey(a) > beaconKey(b) ? 1 : 0;
      }

      var rankA = (PROXIMITY[a.proximity] || PROXIMITY.unknown).rank;
      var rankB = (PROXIMITY[b.proximity] || PROXIMITY.unknown).rank;
      if (rankA !== rankB) return rankA - rankB;
      if (a.rssi !== b.rssi) return b.rssi - a.rssi;
      var accuracyA = a.accuracy > 0 ? a.accuracy : Infinity;
      var accuracyB = b.accuracy > 0 ? b.accuracy : Infinity;
      if (accuracyA !== accuracyB) return accuracyA - accuracyB;
      return 0;
    });
  }

  // --- beacon rows ---------------------------------------------------------

  function beaconSources(beacon) {
    if (Array.isArray(beacon.discoverySources)) {
      return ['serviceUUID', 'coreLocation', 'name'].filter(function (source) {
        return beacon.discoverySources.indexOf(source) !== -1;
      });
    }
    // Android does not report sources: BLE service data always, iBeacon frame when it
    // carried a transmit power (the rule the native Android example uses).
    return beacon.txPower === undefined ? ['serviceUUID'] : ['serviceUUID', 'coreLocation'];
  }

  function lineItem(iconName, text, color) {
    var item = el('span', 'item');
    var holder = icon(iconName);
    if (color) holder.style.color = color;
    item.appendChild(holder);
    item.appendChild(document.createTextNode(text));
    return item;
  }

  function batteryColor(millivolts) {
    if (millivolts > 2800) return 'var(--green)';
    if (millivolts > 2400) return 'var(--orange)';
    return 'var(--red)';
  }

  function beaconRow(beacon, interactive) {
    var row = el('li', 'beacon');
    if (beacon.isStale) row.style.opacity = '0.5';
    var main = el('div', 'beacon-main');

    var name = el('div', 'beacon-name');
    if (state.pinned[beaconKey(beacon)]) name.appendChild(el('span', 'pin', '📌'));
    name.appendChild(document.createTextNode('Beacon ' + beaconKey(beacon)));
    if (beacon.isStale) {
      var stale = el('span', 'chip', 'STALE');
      stale.style.background = 'var(--gray)';
      name.appendChild(stale);
    }
    main.appendChild(name);
    main.appendChild(el('div', 'beacon-uuid', String(beacon.uuid).toUpperCase()));

    var proximity = PROXIMITY[beacon.proximity] || PROXIMITY.unknown;
    var line = el('div', 'beacon-line');
    var proximityItem = el('span', 'item');
    var dot = el('span', 'dot');
    dot.style.color = proximity.color;
    proximityItem.appendChild(dot);
    proximityItem.appendChild(document.createTextNode(proximity.text));
    line.appendChild(proximityItem);
    // The SDK reports no distance (-1) for Bluetooth-only sightings: show nothing then.
    if (beacon.accuracy > 0) line.appendChild(el('span', 'item', beacon.accuracy.toFixed(1) + 'm'));
    beaconSources(beacon).forEach(function (source) {
      var chip = el('span', 'chip', SOURCES[source].text);
      chip.style.background = SOURCES[source].color;
      line.appendChild(chip);
    });
    main.appendChild(line);

    if (beacon.metadata) {
      var metadata = el('div', 'beacon-line');
      metadata.appendChild(lineItem('battery', beacon.metadata.batteryLevel + 'mV', batteryColor(beacon.metadata.batteryLevel)));
      metadata.appendChild(lineItem('thermometer', beacon.metadata.temperature + '°C', 'var(--orange)'));
      metadata.appendChild(lineItem('walk', String(beacon.metadata.movements), 'var(--blue)'));
      metadata.appendChild(lineItem('cpu', 'v' + beacon.metadata.firmwareVersion, 'var(--gray)'));
      main.appendChild(metadata);
    }

    if (beacon.rssiSamples) {
      var stats = beacon.rssiSamples;
      var statsLine = el('div', 'beacon-line');
      ['n: ' + stats.count, 'min: ' + stats.min, 'max: ' + stats.max, 'avg: ' + stats.avg.toFixed(1), 'σ: ' + stats.stdDev.toFixed(1)]
        .forEach(function (text) {
          statsLine.appendChild(el('span', 'item', text));
        });
      main.appendChild(statsLine);
    }

    var times = el('div', 'beacon-line');
    times.appendChild(lineItem('eye', 'Det: ' + clockTime(beacon.timestamp)));
    var age = el('span', 'item age');
    age.dataset.timestamp = String(beacon.timestamp);
    times.appendChild(age);
    if (beacon.syncedAt) times.appendChild(lineItem('upload', 'Sync: ' + clockTime(beacon.syncedAt), 'var(--green)'));
    main.appendChild(times);

    row.appendChild(main);

    var rssi = el('div', 'beacon-rssi');
    rssi.appendChild(icon('antenna'));
    rssi.appendChild(document.createTextNode(beacon.rssi + 'dB'));
    if (beacon.rssiRaw !== undefined) rssi.appendChild(el('span', 'tiny', ' (raw ' + beacon.rssiRaw + ')'));
    row.appendChild(rssi);

    if (interactive) {
      row.addEventListener('click', function () {
        var key = beaconKey(beacon);
        if (state.pinned[key]) delete state.pinned[key];
        else state.pinned[key] = true;
        renderBeacons();
      });
    }
    return row;
  }

  function beaconSection(title, className, beacons, interactive) {
    var section = el('section', 'beacon-section ' + className);
    var heading = el('p', 'section-title');
    heading.appendChild(el('span', 'dot'));
    heading.appendChild(document.createTextNode(title + ' (' + beacons.length + ')'));
    section.appendChild(heading);
    var list = el('ul', 'beacon-list');
    beacons.forEach(function (beacon) {
      list.appendChild(beaconRow(beacon, interactive));
    });
    section.appendChild(list);
    return section;
  }

  function renderBeacons() {
    var sorted = sortBeacons(state.beacons);
    var holder = $('beacon-sections');
    holder.textContent = '';
    $('empty-state').hidden = sorted.length > 0;
    $('empty-hint').hidden = !state.isScanning;

    var pending = sorted.filter(function (beacon) {
      return !beacon.alreadySynced;
    });
    var synced = sorted.filter(function (beacon) {
      return beacon.alreadySynced;
    });
    if (pending.length) holder.appendChild(beaconSection('Pending', 'pending', pending, true));
    if (synced.length) holder.appendChild(beaconSection('Synced', 'synced', synced, true));

    var update = $('last-update');
    update.hidden = !state.lastScanTime;
    if (state.lastScanTime) update.textContent = 'Última atualização: ' + clockTime(state.lastScanTime);
    renderAges();
  }

  function renderAges() {
    var now = Date.now();
    Array.prototype.forEach.call(document.querySelectorAll('.age'), function (node) {
      var seconds = Math.max(0, Math.floor((now - Number(node.dataset.timestamp)) / 1000));
      node.textContent = '(' + seconds + 's ago)';
      node.style.color = seconds < 10 ? 'var(--green)' : seconds < 30 ? 'var(--orange)' : 'var(--red)';
    });
  }

  // --- geofence debug ("two eyes") ------------------------------------------

  function countdown(target) {
    var delta = Math.max(0, Math.floor((target - Date.now()) / 1000));
    if (delta <= 0) return 'agora';
    var minutes = Math.floor(delta / 60);
    return minutes > 0 ? minutes + 'm ' + (delta % 60) + 's' : delta + 's';
  }

  function eyeRow(label, value) {
    var row = el('div', 'eye-row');
    row.appendChild(el('span', '', label));
    row.appendChild(el('span', '', value));
    return row;
  }

  function eyeCard(options) {
    var card = el('div', 'eye ' + options.kind + (options.eye.inside ? ' inside' : ''));

    var title = el('div');
    title.appendChild(el('div', 'eye-title', options.title));
    title.appendChild(el('div', 'eye-subtitle', options.subtitle));
    card.appendChild(title);

    var presence = el('div', 'eye-presence');
    presence.appendChild(el('span', 'dot'));
    presence.appendChild(document.createTextNode(options.eye.inside ? 'DENTRO' : 'fora'));
    card.appendChild(presence);

    var pills = el('div', 'pills');
    [['Agora', options.now, options.now > 0], ['Total', Object.keys(options.eye.seen).length, false]].forEach(function (entry) {
      var pill = el('div', 'pill' + (entry[2] ? ' emphasis' : ''));
      pill.appendChild(el('small', '', entry[0].toUpperCase()));
      pill.appendChild(el('b', '', entry[1]));
      pills.appendChild(pill);
    });
    card.appendChild(pills);

    var mode = el('div');
    var modeLine = el('div', 'eye-mode');
    modeLine.appendChild(el('small', '', 'MODO'));
    modeLine.appendChild(el('b', options.modeActive ? 'active' : '', options.modeLabel));
    mode.appendChild(modeLine);
    mode.appendChild(eyeRow('Cadência:', options.cadence));
    if (options.nextScanAt) mode.appendChild(eyeRow('Próx. scan:', countdown(options.nextScanAt)));
    card.appendChild(mode);

    var details = el('div', 'eye-details');
    details.appendChild(eyeRow('Entrou:', options.eye.lastEnter ? clockTime(options.eye.lastEnter) : NO_VALUE));
    details.appendChild(eyeRow('Saiu:', options.eye.lastExit ? clockTime(options.eye.lastExit) : NO_VALUE));
    details.appendChild(eyeRow('Entradas:', String(options.eye.enterCount)));
    card.appendChild(details);
    return card;
  }

  function beaconsSeenBy(sources) {
    return state.beacons.filter(function (beacon) {
      return beaconSources(beacon).some(function (source) {
        return sources.indexOf(source) !== -1;
      });
    }).length;
  }

  function renderGeofence() {
    var eyes = $('eyes');
    eyes.textContent = '';
    $('geofence-title').textContent = isIos ? 'Debug Geofence · Dois Olhos' : 'Debug Geofence';

    if (isIos) {
      eyes.appendChild(eyeCard({
        kind: 'location',
        title: '👁 Location',
        subtitle: 'CLBeaconRegion',
        eye: state.location,
        now: beaconsSeenBy(['coreLocation']),
        modeLabel: state.isActiveScanRunning ? 'RANGING' : 'REGION',
        modeActive: state.isActiveScanRunning,
        cadence: state.isActiveScanRunning ? '~1Hz iOS' : 'kernel-level',
      }));
      eyes.appendChild(eyeCard({
        kind: 'bluetooth',
        title: '👁 Bluetooth',
        subtitle: 'CBCentralManager',
        eye: state.bluetoothEye,
        now: beaconsSeenBy(['serviceUUID', 'name']),
        modeLabel: state.bluetoothScanMode === 'active' ? 'ATIVO' : 'STANDBY',
        modeActive: state.bluetoothScanMode === 'active',
        cadence: state.bluetoothScanMode === 'active' ? '10s tick' : '5min cycle',
        nextScanAt: state.bluetoothScanMode === 'active' ? null : state.bluetoothNextIdleScanAt,
      }));
    } else {
      eyes.appendChild(eyeCard({
        kind: 'location',
        title: 'Zona do beacon',
        subtitle: 'BluetoothLeScanner',
        eye: state.location,
        now: state.beacons.length,
        modeLabel: state.isActiveScanRunning ? 'ATIVO' : 'FILTRO',
        modeActive: state.isActiveScanRunning,
        cadence: state.isActiveScanRunning ? 'ranging' : 'baixo consumo',
      }));
    }

    var active = $('active-scan');
    active.textContent = state.isActiveScanRunning ? 'LIGADO' : 'desligado';
    active.className = 'value tone-' + (state.isActiveScanRunning ? 'green' : 'secondary');

    var list = $('geofence-events');
    list.textContent = '';
    state.geofenceEvents.slice(0, 10).forEach(function (event) {
      var item = el('li');
      var dot = el('span', 'dot');
      dot.style.color = event.color;
      item.appendChild(dot);
      var body = el('div', 'event-body');
      var head = el('div', 'event-head');
      var title = el('span', '', event.title);
      title.style.color = event.color;
      head.appendChild(title);
      head.appendChild(el('time', '', clockTime(event.timestamp)));
      body.appendChild(head);
      body.appendChild(el('p', 'event-detail', event.detail));
      item.appendChild(body);
      list.appendChild(item);
    });
    $('geofence-events-block').hidden = state.geofenceEvents.length === 0;
    $('geofence-clear').hidden = state.geofenceEvents.length === 0;
  }

  function addGeofenceEvent(title, color, detail) {
    state.geofenceEvents.unshift({ title: title, color: color, detail: detail, timestamp: Date.now() });
    if (state.geofenceEvents.length > MAX_GEOFENCE_EVENTS) state.geofenceEvents.length = MAX_GEOFENCE_EVENTS;
  }

  // --- main screen ---------------------------------------------------------

  function renderHeader() {
    $('status-message').textContent = state.statusMessage;
    setStatus('perm-location', locationStatus());
    setStatus('perm-bluetooth', bluetoothStatus());
    setStatus('perm-notifications', notificationStatus());

    $('scan-details').hidden = !state.isScanning;
    $('scan-precision').textContent = precisionLabel(settings.scanPrecision);
    $('sync-time').textContent = state.lastSyncTime ? clockTime(state.lastSyncTime) : '--';
    $('sync-count').textContent = String(state.lastSyncBeaconCount);
    var result = $('sync-result');
    result.textContent = state.lastSyncResult;
    result.className = 'value tone-' + (state.lastSyncResult.indexOf('Sucesso') === 0
      ? 'green'
      : state.lastSyncResult.indexOf('Falha') === 0 ? 'red' : 'secondary');

    var toggle = $('scan-toggle');
    toggle.textContent = state.isScanning ? 'Parar Scan' : 'Iniciar Scan';
    toggle.className = 'button prominent' + (state.isScanning ? ' stop' : '');
  }

  function render() {
    renderHeader();
    renderGeofence();
    renderBeacons();
  }

  // --- retry queue ---------------------------------------------------------

  function renderRetry() {
    var batches = state.retryBatches;
    $('retry-summary').textContent = batches.length + ' batch' + (batches.length === 1 ? '' : 'es') +
      ' pendente' + plural(batches.length);
    $('retry-empty').hidden = batches.length > 0;
    var holder = $('retry-batches');
    holder.textContent = '';
    batches.forEach(function (batch, index) {
      var section = el('section', 'beacon-section plain');
      var title = el('p', 'batch-title');
      title.appendChild(icon('retry'));
      title.appendChild(document.createTextNode('Batch #' + (index + 1) + ' · ' + batch.length + ' beacon' + plural(batch.length)));
      section.appendChild(title);
      var list = el('ul', 'beacon-list');
      batch.forEach(function (beacon) {
        list.appendChild(beaconRow(beacon, false));
      });
      section.appendChild(list);
      holder.appendChild(section);
    });
    renderAges();
  }

  function refreshRetry() {
    return Bearound.getPendingBatches().then(
      function (batches) {
        state.retryBatches = batches;
        renderRetry();
      },
      function (error) {
        note('getPendingBatches failed, ' + describe(error));
      }
    );
  }

  // --- detection log -------------------------------------------------------

  var LOG_BADGES = {
    foreground: { text: 'FG', color: 'var(--green)' },
    background: { text: 'BG', color: 'var(--orange)' },
    backgroundLocked: { text: 'LK', color: 'var(--red)' },
    terminated: { text: 'T', color: '#1c1c1e' },
  };

  function renderLog() {
    var counts = { foreground: 0, background: 0, backgroundLocked: 0, terminated: 0 };
    state.log.forEach(function (entry) {
      counts[entry.state] += 1;
    });
    $('log-counts').textContent = 'FG:' + counts.foreground + ' BG:' + counts.background +
      ' LK:' + counts.backgroundLocked + ' T:' + counts.terminated;

    var entries = state.log.filter(function (entry) {
      return state.logFilter === 'all' || entry.state === state.logFilter;
    });
    $('log-empty').hidden = entries.length > 0;
    var list = $('log-entries');
    list.textContent = '';
    entries.forEach(function (entry) {
      var item = el('li');
      var badge = el('span', 'badge', LOG_BADGES[entry.state].text);
      badge.style.background = LOG_BADGES[entry.state].color;
      item.appendChild(badge);
      var body = el('div', 'log-body');
      body.appendChild(el('div', 'log-type', entry.type));
      body.appendChild(el('p', 'log-detail', entry.detail));
      item.appendChild(body);
      item.appendChild(el('time', '', new Date(entry.timestamp).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      })));
      list.appendChild(item);
    });
  }

  function refreshLog() {
    return Bearound.getPersistedLog().then(
      function (entries) {
        state.log = entries.slice().sort(function (a, b) {
          return b.timestamp - a.timestamp;
        });
        renderLog();
      },
      function (error) {
        note('getPersistedLog failed, ' + describe(error));
      }
    );
  }

  // --- SDK state -----------------------------------------------------------

  function refreshPermissions() {
    return Promise.all([
      Bearound.checkPermissions(),
      Bearound.getAuthorizationStatus(),
      Bearound.getBluetoothState(),
    ]).then(
      function (values) {
        state.permissions = values[0];
        state.authorization = values[1];
        state.bluetooth = values[2];
        renderHeader();
      },
      function (error) {
        note('permission refresh failed, ' + describe(error));
      }
    );
  }

  function refreshDiagnostic() {
    if (!isIos) return;
    Bearound.getBleDiagnosticInfo().then(function (info) {
      var node = $('ble-diagnostic');
      node.hidden = !info;
      node.textContent = info;
    }, function () {});
  }

  function configureSdk() {
    if (!settings.token) {
      state.statusMessage = 'Informe o business token nas Configurações';
      renderHeader();
      return Promise.reject(new Error('missing token'));
    }
    return Bearound.configure({
      businessToken: settings.token,
      scanPrecision: settings.scanPrecision,
      maxQueuedPayloads: Number(settings.queueSize),
    }).then(function () {
      note('configured, precision ' + settings.scanPrecision);
    });
  }

  function applyUserProperties(alwaysSend) {
    if (!settings.userId && !alwaysSend) return Promise.resolve();
    var hasAny = settings.userId || settings.userEmail || settings.userName || settings.userCustom;
    if (!hasAny) return Bearound.clearUserProperties();
    return Bearound.setUserProperties({
      internalId: settings.userId,
      email: settings.userEmail,
      name: settings.userName,
      customProperties: { custom: settings.userCustom },
    });
  }

  function applyForegroundService() {
    if (isIos) return Promise.resolve();
    if (!settings.foregroundService) return Bearound.disableForegroundScanning();
    // Same texts as the native Android example; an empty title means the app name.
    return Bearound.setForegroundNotificationContent({ title: 'BeAroundScan', text: 'Beacon detectado por perto' })
      .then(function () {
        return Bearound.enableForegroundScanning({ notificationText: 'Procurando beacons' });
      });
  }

  function startScanning() {
    return Bearound.startScanning().then(function () {
      // startScanning() resolves even when the SDK could not start (permission missing,
      // not configured): it reports that through the error listener. Ask the SDK for the
      // truth instead of assuming, so the button never claims a scan that is not running.
      return Bearound.isScanning();
    }).then(function (scanning) {
      state.isScanning = scanning;
      if (!scanning) return undefined;
      state.statusMessage = 'Scaneando...';
      state.lastScanTime = Date.now();
      return applyForegroundService();
    }).then(render, function (error) {
      state.statusMessage = 'Erro: ' + describe(error);
      render();
    });
  }

  function stopScanning() {
    return Bearound.stopScanning().then(function () {
      state.isScanning = false;
      state.statusMessage = 'Parado';
      render();
    }, function (error) {
      state.statusMessage = 'Erro: ' + describe(error);
      render();
    });
  }

  // Same boot order as the native examples: ask for permissions, configure, start.
  function initializeSdk() {
    return Bearound.setDebugNotificationsEnabled(settings.debugNotifications)
      .then(configureSdk)
      .then(function () {
        state.statusMessage = 'Configurado';
        return applyUserProperties(false);
      })
      .then(function () {
        // Foreground permissions only. Background location is never asked for on launch:
        // beacon detection does not need it, and on Android the request leaves the app
        // for the system settings screen. It is an explicit option in the settings sheet.
        return Bearound.ensurePermissions();
      })
      .then(function () {
        return Bearound.requestNotificationPermission();
      })
      .then(refreshPermissions)
      .then(startScanning)
      .catch(function (error) {
        note('initialize failed, ' + describe(error));
        if (error && error.message !== 'missing token') {
          state.statusMessage = 'Erro: ' + describe(error);
          renderHeader();
        }
      });
  }

  // --- SDK events ----------------------------------------------------------

  function subscribe() {
    Bearound.addBeaconsListener(function (beacons) {
      state.beacons = beacons;
      state.lastScanTime = Date.now();
      beacons.forEach(function (beacon) {
        var sources = beaconSources(beacon);
        if (!isIos || sources.indexOf('coreLocation') !== -1) state.location.seen[beaconKey(beacon)] = true;
        if (sources.indexOf('serviceUUID') !== -1 || sources.indexOf('name') !== -1) {
          state.bluetoothEye.seen[beaconKey(beacon)] = true;
        }
      });
      state.statusMessage = beacons.length ? beacons.length + ' beacon' + plural(beacons.length) : 'Scaneando...';
      render();
    });

    Bearound.addScanningListener(function (isScanning) {
      state.isScanning = isScanning;
      state.statusMessage = isScanning ? 'Scaneando...' : 'Parado';
      render();
    });

    Bearound.addSyncLifecycleListener(function (event) {
      state.lastSyncBeaconCount = event.beaconCount;
      if (event.type === 'started') {
        state.lastSyncResult = 'Enviando...';
      } else {
        state.lastSyncTime = Date.now();
        state.lastSyncResult = event.success ? 'Sucesso' : 'Falha: ' + (event.error || 'Erro desconhecido');
        refreshRetry();
      }
      note('sync ' + JSON.stringify(event));
      renderHeader();
    });

    Bearound.addBeaconRegionListener(function (event) {
      var entering = event.type === 'enter';
      state.location.inside = entering;
      if (entering) {
        state.location.lastEnter = Date.now();
        state.location.enterCount += 1;
        addGeofenceEvent(isIos ? 'LOCATION → DENTRO' : 'ENTROU NA ZONA', 'var(--green)', 'Entrou na zona do beacon');
      } else {
        state.location.lastExit = Date.now();
        addGeofenceEvent(isIos ? 'LOCATION → FORA' : 'SAIU DA ZONA', 'var(--orange)', 'Saiu da zona do beacon');
      }
      note('beacon region ' + event.type);
      renderGeofence();
    });

    Bearound.addBluetoothZoneListener(function (event) {
      var entering = event.type === 'enter';
      state.bluetoothEye.inside = entering;
      if (entering) {
        state.bluetoothEye.lastEnter = Date.now();
        state.bluetoothEye.enterCount += 1;
        addGeofenceEvent('BLUETOOTH → DENTRO', 'var(--blue)', 'Sinal Bearound detectado por Bluetooth');
      } else {
        state.bluetoothEye.lastExit = Date.now();
        addGeofenceEvent('BLUETOOTH → FORA', 'var(--orange)', 'Sem sinal Bearound por Bluetooth');
      }
      note('bluetooth zone ' + event.type);
      renderGeofence();
    });

    Bearound.addBluetoothScanModeListener(function (event) {
      state.bluetoothScanMode = event.mode;
      state.bluetoothNextIdleScanAt = event.nextIdleScanAt || null;
      renderGeofence();
    });

    Bearound.addActiveScanListener(function (event) {
      state.isActiveScanRunning = event.isActive;
      addGeofenceEvent(
        event.isActive ? 'SCAN LIGADO' : 'SCAN PAUSADO',
        event.isActive ? 'var(--mint)' : 'var(--gray)',
        event.isActive ? 'Scan ativo ligado dentro da zona' : 'Scan ativo pausado fora da zona'
      );
      renderGeofence();
    });

    Bearound.addBluetoothStateListener(function (bluetooth) {
      state.bluetooth = bluetooth;
      renderHeader();
    });

    Bearound.addBackgroundDetectionListener(function (event) {
      note('background detection ' + JSON.stringify(event));
    });

    Bearound.addPushScanListener(function (event) {
      note('push scan ' + JSON.stringify(event));
      state.statusMessage = 'Push → scan: ' + event.beaconsFound + ' beacon' + plural(event.beaconsFound);
      renderHeader();
    });

    Bearound.addErrorListener(function (error) {
      note('sdk error: ' + error.message);
      state.statusMessage = 'Erro: ' + error.message;
      renderHeader();
    });
  }

  // --- settings sheet ------------------------------------------------------

  function openSettings() {
    $('settings-precision').value = settings.scanPrecision;
    $('settings-queue').value = String(settings.queueSize);
    $('settings-user-id').value = settings.userId;
    $('settings-user-email').value = settings.userEmail;
    $('settings-user-name').value = settings.userName;
    $('settings-user-custom').value = settings.userCustom;
    $('settings-token').value = settings.token;
    $('settings-debug-notifications').checked = Boolean(settings.debugNotifications);
    $('settings-foreground').checked = Boolean(settings.foregroundService);
    $('settings-foreground-row').hidden = isIos;
    $('settings-background-location').hidden = isIos;
    $('settings').hidden = false;
  }

  function closeSettings() {
    $('settings').hidden = true;
  }

  // Same sequence as the native examples: stop, reconfigure, user properties, restart.
  function applySettings() {
    settings.scanPrecision = $('settings-precision').value;
    settings.queueSize = Number($('settings-queue').value);
    settings.userId = $('settings-user-id').value.trim();
    settings.userEmail = $('settings-user-email').value.trim();
    settings.userName = $('settings-user-name').value.trim();
    settings.userCustom = $('settings-user-custom').value.trim();
    settings.token = $('settings-token').value.trim();
    settings.debugNotifications = $('settings-debug-notifications').checked;
    settings.foregroundService = $('settings-foreground').checked;
    saveSettings();
    closeSettings();

    var wasScanning = state.isScanning;
    var chain = wasScanning ? Bearound.stopScanning() : Promise.resolve();
    chain
      .then(function () {
        return Bearound.setDebugNotificationsEnabled(settings.debugNotifications);
      })
      .then(configureSdk)
      .then(function () {
        return applyUserProperties(true);
      })
      .then(function () {
        state.statusMessage = 'Configurações aplicadas';
        renderHeader();
        if (wasScanning) return startScanning();
        return applyForegroundService();
      })
      .catch(function (error) {
        note('apply settings failed, ' + describe(error));
        if (error && error.message !== 'missing token') {
          state.statusMessage = 'Erro: ' + describe(error);
          renderHeader();
        }
      });
  }

  // --- wiring --------------------------------------------------------------

  function selectTab(name) {
    ['beacons', 'retry', 'log'].forEach(function (tab) {
      $('tab-' + tab).hidden = tab !== name;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tabbar button'), function (button) {
      button.className = button.dataset.tab === name ? 'selected' : '';
    });
    if (name === 'retry') refreshRetry();
    if (name === 'log') refreshLog();
  }

  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-icon]'), function (holder) {
      fillIcon(holder, holder.dataset.icon);
    });

    $('scan-toggle').addEventListener('click', function () {
      if (state.isScanning) stopScanning();
      else startScanning();
    });
    $('open-settings').addEventListener('click', openSettings);
    $('settings-close').addEventListener('click', closeSettings);
    $('settings-apply').addEventListener('click', applySettings);
    $('settings-background-location').addEventListener('click', function () {
      Bearound.requestBackgroundLocation().then(refreshPermissions, function (error) {
        note('requestBackgroundLocation failed, ' + describe(error));
        state.statusMessage = 'Erro: ' + describe(error);
        renderHeader();
      });
    });
    $('sort-option').addEventListener('change', function (event) {
      state.sortOption = event.target.value;
      renderBeacons();
    });
    $('geofence-clear').addEventListener('click', function () {
      state.geofenceEvents = [];
      renderGeofence();
    });

    Array.prototype.forEach.call(document.querySelectorAll('.tabbar button'), function (button) {
      button.addEventListener('click', function () {
        selectTab(button.dataset.tab);
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#log-filter button'), function (button) {
      button.addEventListener('click', function () {
        state.logFilter = button.dataset.filter;
        Array.prototype.forEach.call(document.querySelectorAll('#log-filter button'), function (other) {
          other.className = other === button ? 'selected' : '';
        });
        renderLog();
      });
    });
    $('log-refresh').addEventListener('click', refreshLog);
    $('log-clear').addEventListener('click', function () {
      Bearound.clearPersistedLog().then(refreshLog, function (error) {
        note('clearPersistedLog failed, ' + describe(error));
      });
    });
  }

  function onResume() {
    refreshPermissions();
    refreshRetry();
    // The SDK never raises the App Tracking Transparency prompt: the app owns it. Asked on
    // resume because iOS drops the request while another system dialog is on screen.
    if (isIos) {
      Bearound.getTrackingAuthorizationStatus().then(function (status) {
        if (status === 'notDetermined') return Bearound.requestTrackingAuthorization();
        return status;
      }).catch(function () {});
    }
  }

  document.addEventListener('deviceready', function () {
    Bearound = cordova.plugins.Bearound;
    isIos = cordova.platformId === 'ios';
    loadSettings();
    bind();
    subscribe();
    render();
    renderRetry();
    renderLog();

    Bearound.getSdkVersion().then(function (version) {
      $('versions').textContent = 'Cordova · SDK nativo ' + version;
      $('settings-version').textContent = version;
    }, function () {});

    document.addEventListener('resume', onResume);
    setInterval(function () {
      renderAges();
      if (state.isScanning) renderGeofence();
    }, 1000);
    setInterval(refreshDiagnostic, 2000);

    refreshPermissions();
    initializeSdk().then(onResume);
  });
})();
