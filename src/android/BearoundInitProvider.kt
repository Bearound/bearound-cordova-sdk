package io.bearound.cordova

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.util.Log
import io.bearound.sdk.BeAroundSDK

/**
 * Process-start wiring, the Android counterpart of the iOS launch hook.
 *
 * Android starts the app process without any Activity when a background scan, the boot
 * receiver or a push wakes it up. No Cordova plugin is loaded in that process, so the SDK
 * would have no listener and its events would be lost. A native app sets the listener in
 * `Application.onCreate`; a Cordova plugin cannot add an Application class, so this
 * provider does the same job: providers are created before `Application.onCreate`, in
 * every process start.
 *
 * It also arms the SDK's activity-lifecycle hook this early, so a notification tap that
 * launches the app is measured before any page loads.
 */
class BearoundInitProvider : ContentProvider() {

  override fun onCreate(): Boolean {
    val context = context?.applicationContext ?: return false
    try {
      BearoundBridge.init(context)
      val sdk = BeAroundSDK.getInstance(context)
      if (sdk.listener == null) sdk.listener = BearoundBridge
    } catch (t: Throwable) {
      // Never take the host down at process start.
      Log.w("BearoundCordova", "Process-start wiring failed", t)
    }
    return true
  }

  override fun query(
    uri: Uri,
    projection: Array<out String>?,
    selection: String?,
    selectionArgs: Array<out String>?,
    sortOrder: String?
  ): Cursor? = null

  override fun getType(uri: Uri): String? = null

  override fun insert(uri: Uri, values: ContentValues?): Uri? = null

  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0

  override fun update(
    uri: Uri,
    values: ContentValues?,
    selection: String?,
    selectionArgs: Array<out String>?
  ): Int = 0
}
