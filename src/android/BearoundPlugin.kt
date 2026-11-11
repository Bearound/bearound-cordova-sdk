package io.bearound.cordova

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import io.bearound.sdk.BeAroundSDK
import io.bearound.sdk.models.ForegroundScanConfig
import io.bearound.sdk.models.MaxQueuedPayloads
import io.bearound.sdk.models.NotificationContent
import io.bearound.sdk.models.ScanPrecision
import io.bearound.sdk.models.UserProperties
import org.apache.cordova.CallbackContext
import org.apache.cordova.CordovaPlugin
import org.apache.cordova.PluginResult
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.CountDownLatch

/**
 * Cordova bridge to the native Bearound Android SDK.
 *
 * Every action resolves or rejects: a Throwable escaping `execute` would surface as an
 * uncaught exception in the host app, so each one is turned into a `{code, message}` error.
 */
class BearoundPlugin : CordovaPlugin() {

  private val mainHandler = Handler(Looper.getMainLooper())

  @Volatile
  private var eventChannel: CallbackContext? = null

  private var permissionCallback: CallbackContext? = null
  private var permissionRequestCode = 0
  private var bluetoothReceiverRegistered = false

  private val appContext: Context
    get() = cordova.activity.applicationContext

  private val bluetoothStateReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      // Runs on the main thread, outside any action: nothing may escape.
      try {
        BearoundBridge.emit(
          BearoundBridge.EVENT_BLUETOOTH_STATE,
          JSONObject().put("state", currentBluetoothState())
        )
      } catch (_: Throwable) {
      }
    }
  }

  // BeAroundSDK.getInstance() must run on the main Looper. An exception inside the posted
  // runnable would be an uncaught main-thread crash, so it is captured and rethrown on the
  // calling thread, where it becomes a rejected action.
  private val sdk: BeAroundSDK by lazy {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      BeAroundSDK.getInstance(appContext)
    } else {
      var instance: BeAroundSDK? = null
      var failure: Throwable? = null
      val done = CountDownLatch(1)
      mainHandler.post {
        try {
          instance = BeAroundSDK.getInstance(appContext)
        } catch (t: Throwable) {
          failure = t
        } finally {
          done.countDown()
        }
      }
      done.await()
      failure?.let { throw RuntimeException("BeAroundSDK.getInstance failed", it) }
      instance!!
    }
  }

  // Runs at app start (onload=true), before any JavaScript: touching the SDK here arms
  // its activity-lifecycle hook, so a notification tap that launches the app is measured
  // even if the page never calls configure().
  override fun pluginInitialize() {
    try {
      BearoundBridge.init(appContext)
      registerBluetoothReceiver()
      sdk.listener = BearoundBridge
      sdk.handleNotificationIntent(cordova.activity.intent)
    } catch (_: Throwable) {
      // Best effort: every action reports its own failure later.
    }
  }

  // The Cordova activity is singleTop: a tap while it is alive arrives here, not in onCreate.
  override fun onNewIntent(intent: Intent?) {
    try {
      sdk.handleNotificationIntent(intent)
    } catch (_: Throwable) {
    }
  }

  // Page navigation or reload: the old JS context is gone, the next page subscribes again.
  override fun onReset() {
    releaseEventChannel()
  }

  override fun onDestroy() {
    releaseEventChannel()
    if (bluetoothReceiverRegistered) {
      try {
        appContext.unregisterReceiver(bluetoothStateReceiver)
      } catch (_: Throwable) {
      }
      bluetoothReceiverRegistered = false
    }
  }

  override fun execute(action: String, args: JSONArray, callbackContext: CallbackContext): Boolean {
    if (action !in ACTIONS) return false
    cordova.threadPool.execute {
      try {
        dispatch(action, args, callbackContext)
      } catch (t: Throwable) {
        reject(callbackContext, errorCodeFor(action), t.message ?: t.javaClass.simpleName)
      }
    }
    return true
  }

  private fun dispatch(action: String, args: JSONArray, cb: CallbackContext) {
    when (action) {
      "registerEventChannel" -> registerEventChannel(cb)
      "configure" -> configure(args.optJSONObject(0) ?: JSONObject(), cb)
      "startScanning" -> {
        sdk.listener = BearoundBridge
        sdk.startScanning()
        cb.success()
      }
      "stopScanning" -> {
        sdk.stopScanning()
        cb.success()
      }
      "isScanning" -> resolve(cb, sdk.isScanning)
      "setUserProperties" -> {
        sdk.setUserProperties(mapUserProperties(args.optJSONObject(0) ?: JSONObject()))
        cb.success()
      }
      "clearUserProperties" -> {
        sdk.clearUserProperties()
        cb.success()
      }

      // Push
      "setPushToken" -> {
        val token = args.optString(0, "")
        if (token.isBlank()) {
          reject(cb, "INVALID_ARGUMENT", "Push token is required")
        } else {
          sdk.setPushToken(token)
          cb.success()
        }
      }
      "handleRemoteMessage" ->
        resolve(cb, sdk.handleRemoteMessage(toStringMap(args.optJSONObject(0))))
      "trackNotificationOpened" -> {
        sdk.trackNotificationOpened(toStringMap(args.optJSONObject(0)))
        cb.success()
      }

      "setErrorReportingEnabled" -> {
        sdk.setErrorReportingEnabled(args.optBoolean(0, true))
        cb.success()
      }
      // iOS concept (which wake-up mechanisms are armed); Android has no equivalent.
      "getDetectionReadiness" -> cb.success("unknown")
      "setDebugNotificationsEnabled" -> {
        BearoundBridge.init(appContext)
        BearoundBridge.debugNotificationsEnabled = args.optBoolean(0, false)
        cb.success()
      }
      "isDebugNotificationsEnabled" -> {
        BearoundBridge.init(appContext)
        resolve(cb, BearoundBridge.debugNotificationsEnabled)
      }

      // Permissions
      "checkPermissions" -> cb.success(permissionStatus())
      "requestForegroundPermissions" -> requestPermissions(cb, REQUEST_FOREGROUND, foregroundPermissions())
      "requestBackgroundLocation" -> requestBackgroundLocation(cb)
      "requestNotificationPermission" -> requestNotificationPermission(cb)
      "checkNotificationPermission" -> resolve(cb, notificationsEnabled())

      // State and diagnostics
      "getSdkVersion" -> cb.success(io.bearound.sdk.BuildConfig.SDK_VERSION)
      "getCurrentScanPrecision" ->
        cb.success(sdk.currentScanPrecision?.name?.lowercase(Locale.US) ?: "")
      // iOS-only: Android exposes a different diagnostics() snapshot, deliberately not bridged.
      "getBleDiagnosticInfo" -> cb.success("")
      "getPendingBatchCount" -> cb.success(sdk.pendingBatchCount)
      "getPendingBatches" -> cb.success(BearoundBridge.mapBatches(sdk.pendingBatches))
      "isConfigured" -> resolve(cb, sdk.isConfigured)
      "isLocationAvailable" -> resolve(cb, sdk.isLocationAvailable())
      "getAuthorizationStatus" -> cb.success(sdk.getLocationPermissionStatus())
      "getBluetoothState" -> cb.success(currentBluetoothState())
      "getPersistedLog" -> cb.success(sdk.getDetectionLogJson())
      "clearPersistedLog" -> {
        sdk.clearDetectionLog()
        cb.success()
      }

      // iOS concepts: location authorization level and App Tracking Transparency.
      "requestLocationAuthorization" -> cb.success()
      "requestTrackingAuthorization", "getTrackingAuthorizationStatus" -> cb.success("unavailable")

      // Foreground-service scanning (Android-only)
      "enableForegroundScanning" -> {
        sdk.enableForegroundScanning(mapForegroundScanConfig(args.optJSONObject(0) ?: JSONObject()))
        cb.success()
      }
      "disableForegroundScanning" -> {
        sdk.disableForegroundScanning()
        cb.success()
      }
      "isForegroundScanningEnabled" -> resolve(cb, sdk.isForegroundScanningEnabled)
      "setForegroundNotificationContent" -> {
        val content = args.optJSONObject(0)
        val title = content?.optStringOrNull("title")
        val text = content?.optStringOrNull("text")
        BearoundBridge.notificationContent =
          if (title != null && text != null) NotificationContent(title, text) else null
        cb.success()
      }

      // Background reliability (Android-only)
      "isIgnoringBatteryOptimizations" -> resolve(cb, sdk.isIgnoringBatteryOptimizations())
      "openBatteryOptimizationSettings" -> resolve(cb, sdk.openBatteryOptimizationSettings())
      "isAutostartManageable" -> resolve(cb, sdk.isAutostartManageable())
      "openManufacturerAutostartSettings" -> resolve(cb, sdk.openManufacturerAutostartSettings())
    }
  }

  // Events

  private fun registerEventChannel(cb: CallbackContext) {
    eventChannel = cb
    BearoundBridge.attach { name, payload ->
      val channel = eventChannel ?: return@attach
      val result = PluginResult(
        PluginResult.Status.OK,
        JSONObject().put("event", name).put("payload", payload)
      )
      result.keepCallback = true
      channel.sendPluginResult(result)
    }
    // Seed the page with the adapter state so it does not have to poll.
    BearoundBridge.emit(
      BearoundBridge.EVENT_BLUETOOTH_STATE,
      JSONObject().put("state", currentBluetoothState())
    )
  }

  private fun releaseEventChannel() {
    BearoundBridge.detach()
    eventChannel = null
  }

  // Configuration

  private fun configure(config: JSONObject, cb: CallbackContext) {
    val businessToken = config.optString("businessToken", "").trim()
    if (businessToken.isEmpty()) {
      reject(cb, "INVALID_ARGUMENT", "Business token is required")
      return
    }

    val precision = mapScanPrecision(config.optString("scanPrecision", "high"))
    val maxQueued = mapMaxQueuedPayloads(config.optInt("maxQueuedPayloads", 100))
    val periodicEnabled = config.optBoolean("periodicReconciliationEnabled", true)
    val periodicInterval = config.optLong("periodicReconciliationIntervalMs", 20L * 60L * 1000L)
    val periodicScanDuration = config.optLong("periodicScanDurationMs", 12_000L)
    val heartbeat = config.optLong("presenceHeartbeatIntervalMs", 5L * 60L * 1000L)
    val collectAdvertisingId = config.optBoolean("collectAdvertisingId", true)
    val collectLocation = config.optBoolean("collectLocation", true)
    val collectWifi = config.optBoolean("collectWifi", true)
    val adaptiveSampling = config.optBoolean("adaptiveSamplingEnabled", true)
    // Absent means "follow collectLocation / collectWifi", the SDK's own default.
    val collectMotionSensors: Boolean? =
      if (config.has("collectMotionSensors") && !config.isNull("collectMotionSensors")) {
        config.optBoolean("collectMotionSensors")
      } else {
        null
      }

    // An app calls configure() on every launch. When the SDK is already scanning with
    // this exact configuration (it restores itself when Android restarts the process),
    // stopping and restarting it would switch the scanner off and flush an empty sync in
    // the middle of a background wake-up. The scan is only cycled when something changed,
    // which is when the SDK needs it to apply a new precision.
    val signature = listOf(
      businessToken, precision.name, maxQueued.name, periodicEnabled, periodicInterval,
      periodicScanDuration, heartbeat, collectAdvertisingId, collectLocation, collectWifi,
      adaptiveSampling, collectMotionSensors
    ).joinToString("|").hashCode().toString()
    val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val unchanged = prefs.getString(KEY_CONFIG_SIGNATURE, null) == signature

    val restart = sdk.isScanning && !unchanged
    if (restart) sdk.stopScanning()

    sdk.listener = BearoundBridge

    // Validation and clamping live in the native SDK (single source of truth).
    sdk.configure(
      businessToken = businessToken,
      scanPrecision = precision,
      maxQueuedPayloads = maxQueued,
      technology = TECHNOLOGY,
      periodicReconciliationEnabled = periodicEnabled,
      periodicReconciliationIntervalMillis = periodicInterval,
      periodicScanDurationMillis = periodicScanDuration,
      presenceHeartbeatIntervalMillis = heartbeat,
      collectAdvertisingId = collectAdvertisingId,
      collectLocation = collectLocation,
      collectWifi = collectWifi,
      adaptiveSamplingEnabled = adaptiveSampling,
      collectMotionSensors = collectMotionSensors
    )
    prefs.edit().putString(KEY_CONFIG_SIGNATURE, signature).apply()

    if (restart) sdk.startScanning()
    cb.success()
  }

  private fun mapScanPrecision(value: String): ScanPrecision = when (value.lowercase(Locale.US)) {
    "high" -> ScanPrecision.HIGH
    "low" -> ScanPrecision.LOW
    else -> ScanPrecision.MEDIUM
  }

  private fun mapMaxQueuedPayloads(value: Int): MaxQueuedPayloads = when (value) {
    50 -> MaxQueuedPayloads.SMALL
    200 -> MaxQueuedPayloads.LARGE
    500 -> MaxQueuedPayloads.XLARGE
    else -> MaxQueuedPayloads.MEDIUM
  }

  private fun mapUserProperties(args: JSONObject): UserProperties {
    val custom = mutableMapOf<String, String>()
    args.optJSONObject("customProperties")?.let { raw ->
      raw.keys().forEach { key ->
        raw.optStringOrNull(key)?.let { custom[key] = it }
      }
    }
    return UserProperties(
      internalId = args.optStringOrNull("internalId"),
      email = args.optStringOrNull("email"),
      name = args.optStringOrNull("name"),
      customProperties = custom
    )
  }

  private fun mapForegroundScanConfig(args: JSONObject): ForegroundScanConfig {
    val defaults = ForegroundScanConfig()
    return ForegroundScanConfig(
      enabled = true,
      // Default title is the host app's own name; default text is generic and neutral.
      notificationTitle = args.optStringOrNull("notificationTitle") ?: appLabel(),
      notificationText = args.optStringOrNull("notificationText") ?: defaultNotificationText(),
      notificationChannelId = args.optStringOrNull("notificationChannelId"),
      notificationChannelName = args.optStringOrNull("notificationChannelName")
        ?: defaults.notificationChannelName
    )
  }

  private fun appLabel(): String =
    appContext.applicationInfo.loadLabel(appContext.packageManager).toString()

  private fun defaultNotificationText(): String = when (Locale.getDefault().language) {
    "pt" -> "Atualizando conteúdo"
    "es" -> "Actualizando contenido"
    else -> "Updating content"
  }

  /**
   * FCM data is string-only. A nested object (the `bearound` marker handed over as an
   * object by a push plugin) is passed as JSON so the SDK can still parse it; null is
   * skipped and other scalars are stringified.
   */
  private fun toStringMap(data: JSONObject?): Map<String, String> {
    val map = HashMap<String, String>()
    if (data == null) return map
    data.keys().forEach { key ->
      when (val value = data.opt(key)) {
        null, JSONObject.NULL -> Unit
        is String -> map[key] = value
        else -> map[key] = value.toString()
      }
    }
    return map
  }

  // Bluetooth state

  private fun registerBluetoothReceiver() {
    if (bluetoothReceiverRegistered) return
    ContextCompat.registerReceiver(
      appContext,
      bluetoothStateReceiver,
      IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED),
      ContextCompat.RECEIVER_EXPORTED
    )
    bluetoothReceiverRegistered = true
  }

  private fun currentBluetoothState(): String {
    val manager = appContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    val adapter = manager?.adapter ?: return "unsupported"
    if (!adapter.isEnabled) return "poweredOff"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !granted(Manifest.permission.BLUETOOTH_SCAN)) {
      return "unauthorized"
    }
    return "poweredOn"
  }

  // Permissions

  private fun granted(permission: String): Boolean =
    ContextCompat.checkSelfPermission(appContext, permission) == PackageManager.PERMISSION_GRANTED

  private fun notificationsEnabled(): Boolean =
    NotificationManagerCompat.from(appContext).areNotificationsEnabled()

  private val declaredPermissions: Set<String> by lazy {
    try {
      appContext.packageManager
        .getPackageInfo(appContext.packageName, PackageManager.GET_PERMISSIONS)
        .requestedPermissions?.toSet() ?: emptySet()
    } catch (_: Throwable) {
      emptySet()
    }
  }

  /** Runtime permissions the SDK benefits from while the app is on screen. */
  private fun foregroundPermissions(): List<String> {
    val permissions = mutableListOf(
      Manifest.permission.ACCESS_FINE_LOCATION,
      Manifest.permission.ACCESS_COARSE_LOCATION
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      permissions += Manifest.permission.BLUETOOTH_SCAN
      permissions += Manifest.permission.BLUETOOTH_ADVERTISE
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      permissions += Manifest.permission.POST_NOTIFICATIONS
    }
    return permissions
  }

  private fun permissionStatus(): JSONObject {
    val api = Build.VERSION.SDK_INT
    val bluetoothRuntime = api >= Build.VERSION_CODES.S
    return JSONObject()
      .put("fineLocation", granted(Manifest.permission.ACCESS_FINE_LOCATION))
      .put("preciseLocation", granted(Manifest.permission.ACCESS_FINE_LOCATION))
      .put("btScan", !bluetoothRuntime || granted(Manifest.permission.BLUETOOTH_SCAN))
      .put("btConnect", !bluetoothRuntime || granted(Manifest.permission.BLUETOOTH_CONNECT))
      .put("btAdvertise", !bluetoothRuntime || granted(Manifest.permission.BLUETOOTH_ADVERTISE))
      .put("notifications", notificationsEnabled())
      .put(
        "backgroundLocation",
        if (api >= Build.VERSION_CODES.Q) granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        else granted(Manifest.permission.ACCESS_FINE_LOCATION)
      )
  }

  private fun requestPermissions(cb: CallbackContext, requestCode: Int, wanted: List<String>) {
    // Asking for a permission the merged manifest does not declare is an instant denial.
    val missing = wanted.filter { it in declaredPermissions && !granted(it) }
    if (missing.isEmpty()) {
      resolvePermissionRequest(cb, requestCode)
      return
    }
    synchronized(this) {
      if (permissionCallback != null) {
        reject(cb, "PERMISSION_REQUEST_IN_PROGRESS", "Another permission request is in progress")
        return
      }
      permissionCallback = cb
      permissionRequestCode = requestCode
    }
    cordova.requestPermissions(this, requestCode, missing.toTypedArray())
  }

  private fun requestBackgroundLocation(cb: CallbackContext) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      resolve(cb, granted(Manifest.permission.ACCESS_FINE_LOCATION))
      return
    }
    val permission = Manifest.permission.ACCESS_BACKGROUND_LOCATION
    if (permission !in declaredPermissions) {
      reject(
        cb,
        "PERMISSION_NOT_DECLARED",
        "ACCESS_BACKGROUND_LOCATION is not declared in the app manifest"
      )
      return
    }
    // Android only shows the background prompt once foreground location is granted.
    if (!granted(Manifest.permission.ACCESS_FINE_LOCATION)) {
      resolve(cb, false)
      return
    }
    requestPermissions(cb, REQUEST_BACKGROUND_LOCATION, listOf(permission))
  }

  private fun requestNotificationPermission(cb: CallbackContext) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      resolve(cb, notificationsEnabled())
      return
    }
    requestPermissions(cb, REQUEST_NOTIFICATIONS, listOf(Manifest.permission.POST_NOTIFICATIONS))
  }

  private fun resolvePermissionRequest(cb: CallbackContext, requestCode: Int) {
    when (requestCode) {
      REQUEST_BACKGROUND_LOCATION ->
        resolve(cb, granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION))
      REQUEST_NOTIFICATIONS -> resolve(cb, notificationsEnabled())
      else -> cb.success(permissionStatus())
    }
  }

  private fun finishPermissionRequest(requestCode: Int) {
    val cb: CallbackContext?
    synchronized(this) {
      if (requestCode != permissionRequestCode) return
      cb = permissionCallback
      permissionCallback = null
    }
    cb ?: return
    try {
      resolvePermissionRequest(cb, requestCode)
    } catch (t: Throwable) {
      reject(cb, "PERMISSION_ERROR", t.message ?: "Permission request failed")
    }
  }

  // cordova-android calls one or both of these depending on its version; the pending
  // callback is consumed by whichever arrives first.
  @Deprecated("Deprecated in cordova-android")
  override fun onRequestPermissionResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
    finishPermissionRequest(requestCode)
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
    finishPermissionRequest(requestCode)
  }

  // Results

  private fun resolve(cb: CallbackContext, value: Boolean) {
    cb.sendPluginResult(PluginResult(PluginResult.Status.OK, value))
  }

  private fun reject(cb: CallbackContext, code: String, message: String) {
    cb.error(JSONObject().put("code", code).put("message", message))
  }

  private fun errorCodeFor(action: String): String = when (action) {
    "configure" -> "CONFIG_ERROR"
    "startScanning" -> "START_ERROR"
    "stopScanning" -> "STOP_ERROR"
    "setPushToken" -> "PUSH_TOKEN_ERROR"
    "handleRemoteMessage" -> "HANDLE_REMOTE_MESSAGE_ERROR"
    "trackNotificationOpened" -> "TRACK_NOTIFICATION_OPENED_ERROR"
    else -> "BEAROUND_ERROR"
  }

  private fun JSONObject.optStringOrNull(key: String): String? =
    if (isNull(key)) null else opt(key) as? String

  private companion object {
    const val TECHNOLOGY = "cordova"
    const val PREFS = "io.bearound.cordova"
    const val KEY_CONFIG_SIGNATURE = "configSignature"
    const val REQUEST_FOREGROUND = 0xBEA1
    const val REQUEST_BACKGROUND_LOCATION = 0xBEA2
    const val REQUEST_NOTIFICATIONS = 0xBEA3

    val ACTIONS = setOf(
      "registerEventChannel",
      "configure",
      "startScanning",
      "stopScanning",
      "isScanning",
      "setUserProperties",
      "clearUserProperties",
      "setPushToken",
      "handleRemoteMessage",
      "trackNotificationOpened",
      "setErrorReportingEnabled",
      "getDetectionReadiness",
      "setDebugNotificationsEnabled",
      "isDebugNotificationsEnabled",
      "getPendingBatches",
      "checkPermissions",
      "requestForegroundPermissions",
      "requestBackgroundLocation",
      "requestNotificationPermission",
      "checkNotificationPermission",
      "getSdkVersion",
      "getCurrentScanPrecision",
      "getBleDiagnosticInfo",
      "getPendingBatchCount",
      "isConfigured",
      "isLocationAvailable",
      "getAuthorizationStatus",
      "getBluetoothState",
      "getPersistedLog",
      "clearPersistedLog",
      "requestLocationAuthorization",
      "requestTrackingAuthorization",
      "getTrackingAuthorizationStatus",
      "enableForegroundScanning",
      "disableForegroundScanning",
      "isForegroundScanningEnabled",
      "setForegroundNotificationContent",
      "isIgnoringBatteryOptimizations",
      "openBatteryOptimizationSettings",
      "isAutostartManageable",
      "openManufacturerAutostartSettings"
    )
  }
}
