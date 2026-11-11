package io.bearound.cordova

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import io.bearound.sdk.interfaces.BeAroundSDKListener
import io.bearound.sdk.models.Beacon
import io.bearound.sdk.models.BeaconMetadata
import io.bearound.sdk.models.NotificationContent
import org.json.JSONArray
import org.json.JSONObject

/**
 * Process-wide listener of the native SDK.
 *
 * The SDK keeps detecting while the WebView is gone (page reload, activity destroyed,
 * process woken by a background scan), so the listener cannot be the plugin instance.
 * Events are handed to the current sink (the plugin's JS channel) or kept in a small
 * bounded buffer until a page subscribes.
 */
object BearoundBridge : BeAroundSDKListener {

  const val EVENT_BEACONS = "beacons"
  const val EVENT_SYNC_LIFECYCLE = "syncLifecycle"
  const val EVENT_BACKGROUND_DETECTION = "backgroundDetection"
  const val EVENT_SCANNING = "scanning"
  const val EVENT_ERROR = "error"
  const val EVENT_BEACON_REGION = "beaconRegion"
  const val EVENT_ACTIVE_SCAN = "activeScan"
  const val EVENT_BLUETOOTH_STATE = "bluetoothState"

  private const val MAX_BUFFERED_EVENTS = 50

  private val lock = Any()
  private var sink: ((String, JSONObject) -> Unit)? = null
  private val buffer = ArrayDeque<Pair<String, JSONObject>>()

  // Debug notifications (QA aid). Off by default and persisted, because the events worth
  // seeing happen in a process the OS woke up with no web page loaded. Same texts, ids and
  // cooldowns as the native example app, so runs can be compared side by side.

  private const val PREFS = "io.bearound.cordova"
  private const val KEY_DEBUG_NOTIFICATIONS = "debugNotifications"
  private const val DEBUG_CHANNEL_ID = "BEAROUND_SDK"
  private const val ID_SCANNING = 1001
  private const val ID_BEACON = 1002
  private const val ID_SYNC = 1003
  private const val ID_BACKGROUND = 1004

  @Volatile
  private var appContext: Context? = null
  private val lastNotified = HashMap<String, Long>()
  private var hadBeacons = false

  fun init(context: Context) {
    if (appContext == null) appContext = context.applicationContext
  }

  var debugNotificationsEnabled: Boolean
    get() = prefs()?.getBoolean(KEY_DEBUG_NOTIFICATIONS, false) ?: false
    set(value) {
      prefs()?.edit()?.putBoolean(KEY_DEBUG_NOTIFICATIONS, value)?.apply()
    }

  private fun prefs() = appContext?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun plural(count: Int) = if (count == 1) "" else "s"

  private fun debugNotify(
    key: String,
    id: Int,
    title: String,
    body: String,
    cooldownMillis: Long,
    sound: Boolean = true
  ) {
    val context = appContext ?: return
    try {
      if (!debugNotificationsEnabled) return
      val now = System.currentTimeMillis()
      synchronized(lastNotified) {
        val last = lastNotified[key]
        if (last != null && now - last < cooldownMillis) return
        lastNotified[key] = now
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
        PackageManager.PERMISSION_GRANTED
      ) {
        return
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel = NotificationChannel(
          DEBUG_CHANNEL_ID,
          "BeAroundSDK",
          NotificationManager.IMPORTANCE_DEFAULT
        )
        channel.description = "Notificações do BeAround SDK"
        context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
      }
      val builder = NotificationCompat.Builder(context, DEBUG_CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle(title)
        .setContentText(body)
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        .setAutoCancel(true)
      if (!sound) builder.setSilent(true)
      NotificationManagerCompat.from(context).notify(id, builder.build())
    } catch (_: Throwable) {
      // A QA aid must never take the host down.
    }
  }

  /** Foreground-notification content set from JS; read back by the SDK on detection. */
  @Volatile
  var notificationContent: NotificationContent? = null

  fun attach(newSink: (String, JSONObject) -> Unit) {
    val pending: List<Pair<String, JSONObject>>
    synchronized(lock) {
      sink = newSink
      pending = buffer.toList()
      buffer.clear()
    }
    pending.forEach { (name, payload) -> deliver(newSink, name, payload) }
  }

  fun detach() {
    synchronized(lock) { sink = null }
  }

  fun emit(name: String, payload: JSONObject) {
    val current: ((String, JSONObject) -> Unit)?
    synchronized(lock) {
      current = sink
      if (current == null) {
        if (buffer.size >= MAX_BUFFERED_EVENTS) buffer.removeFirst()
        buffer.addLast(name to payload)
      }
    }
    if (current != null) deliver(current, name, payload)
  }

  // Events are best effort: a WebView torn down mid-flight must never crash the host.
  private fun deliver(target: (String, JSONObject) -> Unit, name: String, payload: JSONObject) {
    try {
      target(name, payload)
    } catch (_: Throwable) {
    }
  }

  // BeAroundSDKListener
  //
  // Every callback below is invoked on a thread owned by the SDK. An exception escaping
  // one of them would be an uncaught exception in the host app, so each body runs inside
  // `safely`: a failure to build or deliver an event drops that event and nothing else.

  private inline fun safely(block: () -> Unit) {
    try {
      block()
    } catch (_: Throwable) {
    }
  }

  // org.json refuses NaN and infinities with an exception. The SDK derives distance from
  // a ratio of signal strengths, which is not finite for a beacon reporting a transmit
  // power of zero, so every floating-point value is checked before it goes into JSON.
  private fun finite(value: Double, fallback: Double): Double =
    if (value.isNaN() || value.isInfinite()) fallback else value

  override fun onBeaconsUpdated(beacons: List<Beacon>) {
    safely {
      // Only on the empty to non-empty edge, like the native example.
      if (beacons.isNotEmpty() && !hadBeacons) {
        debugNotify(
          "detect", ID_BEACON, "Beacon Detectado",
          "${beacons.size} beacon${plural(beacons.size)} detectado${plural(beacons.size)}", 300_000
        )
      }
      hadBeacons = beacons.isNotEmpty()
      val array = JSONArray()
      beacons.forEach { array.put(mapBeacon(it)) }
      emit(EVENT_BEACONS, JSONObject().put("beacons", array))
    }
  }

  override fun onError(error: Exception) {
    safely {
      emit(EVENT_ERROR, JSONObject().put("message", error.message ?: "Unknown error"))
    }
  }

  override fun onScanningStateChanged(isScanning: Boolean) {
    safely {
      debugNotify(
        if (isScanning) "scan-start" else "scan-stop", ID_SCANNING,
        if (isScanning) "Escaneamento Iniciado" else "Escaneamento Parado",
        if (isScanning) "BeAroundSDK está escaneando beacons" else "BeAroundSDK parou de escanear",
        10_000
      )
      emit(EVENT_SCANNING, JSONObject().put("isScanning", isScanning))
    }
  }

  override fun onSyncStarted(beaconCount: Int) {
    safely {
      debugNotify(
        "sync-start", ID_SYNC, "Sincronizando",
        "Enviando $beaconCount beacon${plural(beaconCount)} para o servidor", 30_000, sound = false
      )
      emit(
        EVENT_SYNC_LIFECYCLE,
        JSONObject().put("type", "started").put("beaconCount", beaconCount)
      )
    }
  }

  override fun onSyncCompleted(beaconCount: Int, success: Boolean, error: Exception?) {
    safely {
      if (success) {
        debugNotify(
          "sync-ok", ID_SYNC, "Sync Completo",
          "$beaconCount beacon${plural(beaconCount)} enviado${plural(beaconCount)} com sucesso",
          60_000, sound = false
        )
      } else {
        debugNotify(
          "sync-fail", ID_SYNC, "Sync Falhou",
          "Falha ao enviar $beaconCount beacon${plural(beaconCount)}. Tentando novamente.", 30_000
        )
      }
      val payload = JSONObject()
        .put("type", "completed")
        .put("beaconCount", beaconCount)
        .put("success", success)
      error?.message?.let { payload.put("error", it) }
      emit(EVENT_SYNC_LIFECYCLE, payload)
    }
  }

  override fun onBeaconDetectedInBackground(beaconCount: Int) {
    safely {
      debugNotify(
        "bg-detect", ID_BACKGROUND, "Beacon Detectado (Background)",
        "$beaconCount beacon${plural(beaconCount)} detectado${plural(beaconCount)}", 60_000
      )
      emit(EVENT_BACKGROUND_DETECTION, JSONObject().put("beaconCount", beaconCount))
    }
  }

  override fun onProvideNotificationContent(beacons: List<Beacon>): NotificationContent? =
    notificationContent

  override fun onEnterBeaconRegion() {
    safely {
      emit(EVENT_BEACON_REGION, JSONObject().put("type", "enter"))
    }
  }

  override fun onExitBeaconRegion() {
    safely {
      emit(EVENT_BEACON_REGION, JSONObject().put("type", "exit"))
    }
  }

  override fun onActiveScanStateChanged(isActive: Boolean) {
    safely {
      emit(EVENT_ACTIVE_SCAN, JSONObject().put("isActive", isActive))
    }
  }

  fun mapBatches(batches: List<List<Beacon>>): JSONArray {
    val result = JSONArray()
    batches.forEach { batch ->
      val array = JSONArray()
      batch.forEach { array.put(mapBeacon(it)) }
      result.put(array)
    }
    return result
  }

  private fun mapBeacon(beacon: Beacon): JSONObject {
    val map = JSONObject()
      .put("uuid", beacon.uuid.toString())
      .put("major", beacon.major)
      .put("minor", beacon.minor)
      .put("rssi", beacon.rssi)
      .put("proximity", beacon.proximity.toApiString())
      .put("accuracy", finite(beacon.accuracy, -1.0))
      .put("timestamp", beacon.timestamp.time)
      .put("isStale", beacon.isStale)
      .put("alreadySynced", beacon.alreadySynced)

    beacon.metadata?.let { map.put("metadata", mapMetadata(it)) }
    beacon.txPower?.let { map.put("txPower", it) }
    beacon.rssiRaw?.let { map.put("rssiRaw", it) }
    beacon.rssiSamples?.let { stats ->
      map.put(
        "rssiSamples",
        JSONObject()
          .put("count", stats.count)
          .put("min", stats.min)
          .put("max", stats.max)
          .put("avg", finite(stats.avg, 0.0))
          .put("stdDev", finite(stats.stdDev, 0.0))
          .put("firstSeen", stats.firstSeen)
          .put("lastSeen", stats.lastSeen)
      )
    }
    beacon.syncedAt?.let { map.put("syncedAt", it.time) }
    return map
  }

  private fun mapMetadata(metadata: BeaconMetadata): JSONObject {
    val map = JSONObject()
      .put("firmwareVersion", metadata.firmwareVersion)
      .put("batteryLevel", metadata.batteryLevel)
      .put("movements", metadata.movements)
      .put("temperature", metadata.temperature)
    metadata.txPower?.let { map.put("txPower", it) }
    metadata.rssiFromBLE?.let { map.put("rssiFromBLE", it) }
    metadata.isConnectable?.let { map.put("isConnectable", it) }
    return map
  }
}
