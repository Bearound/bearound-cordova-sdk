package io.bearound.cordova

import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import io.bearound.sdk.BeAroundSDK

/**
 * FCM entry point of the Cordova plugin.
 *
 * A Cordova app has no JavaScript running while it is closed, so a silent push or a rich
 * push can only be handled natively. This service hands every message to the native SDK,
 * which consumes the Bearound ones (wake-up scan and sync, rich notification rendering,
 * receipt measurement).
 *
 * Android delivers FCM messages to a single service per app. To coexist with another push
 * plugin, anything the SDK does not recognize is forwarded to the app's other
 * FirebaseMessagingService, and so is every token refresh.
 *
 * Disable with the plugin variable BEAROUND_FCM_SERVICE_ENABLED=false when the app
 * forwards messages to the SDK from its own native service.
 */
class BearoundCordovaMessagingService : FirebaseMessagingService() {

  private val delegates: List<FirebaseMessagingService> by lazy { resolveDelegates() }

  override fun onMessageReceived(message: RemoteMessage) {
    BearoundBridge.init(applicationContext)
    val handled = try {
      BeAroundSDK.getInstance(applicationContext).handleRemoteMessage(message.data)
    } catch (t: Throwable) {
      Log.w(TAG, "handleRemoteMessage failed", t)
      false
    }
    if (!handled) forward("onMessageReceived") { it.onMessageReceived(message) }
  }

  override fun onNewToken(token: String) {
    try {
      BeAroundSDK.getInstance(applicationContext).setPushToken(token)
    } catch (t: Throwable) {
      Log.w(TAG, "setPushToken failed", t)
    }
    forward("onNewToken") { it.onNewToken(token) }
  }

  private fun forward(what: String, call: (FirebaseMessagingService) -> Unit) {
    delegates.forEach { delegate ->
      try {
        call(delegate)
      } catch (t: Throwable) {
        Log.w(TAG, "Forwarding $what to ${delegate.javaClass.name} failed", t)
      }
    }
  }

  /**
   * Other FirebaseMessagingService subclasses declared by the app (another push plugin).
   * They never receive the FCM intent themselves because this service outranks them, so
   * they are instantiated here and given this service's context.
   */
  private fun resolveDelegates(): List<FirebaseMessagingService> {
    val result = ArrayList<FirebaseMessagingService>()
    try {
      val intent = Intent(MESSAGING_EVENT).setPackage(packageName)
      val services = packageManager.queryIntentServices(intent, 0)
      for (info in services) {
        val name = info.serviceInfo?.name ?: continue
        if (name == javaClass.name || name == FirebaseMessagingService::class.java.name) continue
        try {
          val instance = Class.forName(name).getDeclaredConstructor().newInstance()
          if (instance !is FirebaseMessagingService) continue
          val attach = ContextWrapper::class.java
            .getDeclaredMethod("attachBaseContext", Context::class.java)
          attach.isAccessible = true
          attach.invoke(instance, applicationContext)
          result.add(instance)
        } catch (t: Throwable) {
          Log.w(TAG, "Could not set up forwarding to $name", t)
        }
      }
    } catch (t: Throwable) {
      Log.w(TAG, "Could not look up other messaging services", t)
    }
    return result
  }

  private companion object {
    const val TAG = "BearoundCordova"
    const val MESSAGING_EVENT = "com.google.firebase.MESSAGING_EVENT"
  }
}
