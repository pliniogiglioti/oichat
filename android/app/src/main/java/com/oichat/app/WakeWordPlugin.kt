package com.oichat.app

import android.Manifest
import android.app.KeyguardManager
import android.content.Intent
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Ponte entre o React (Capacitor) e o lado nativo: serviço de escuta, tela do ChatGPT,
 * permissões e diagnóstico.
 */
@CapacitorPlugin(
    name = "WakeWord",
    permissions = [
        Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone"),
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications"),
    ],
)
class WakeWordPlugin : Plugin() {

    private var offBus: (() -> Unit)? = null

    override fun load() {
        offBus = OiChatBus.on { event, data ->
            val obj = JSObject()
            data.forEach { (k, v) -> obj.put(k, v) }
            notifyListeners(event, obj)
        }
    }

    override fun handleOnDestroy() {
        offBus?.invoke()
        super.handleOnDestroy()
    }

    private fun micGranted() = getPermissionState("microphone") == PermissionState.GRANTED

    @PluginMethod
    fun configure(call: PluginCall) {
        OiChatConfig.write(context) {
            call.getFloat("sensitivity")?.let { putFloat("sensitivity", it) }
            call.getBoolean("autoVoice")?.let { putBoolean("autoVoice", it) }
            call.getString("greeting")?.let { putString("greeting", it.take(200)) }
            call.getBoolean("goodbyeMic")?.let { putBoolean("goodbyeMic", it) }
            call.getBoolean("vibration")?.let { putBoolean("vibration", it) }
            call.getBoolean("sound")?.let { putBoolean("sound", it) }
            call.getFloat("volume")?.let { putFloat("volume", it) }
        }
        call.resolve()
    }

    @PluginMethod
    fun start(call: PluginCall) {
        if (!micGranted()) return call.reject("Permissão de microfone negada.")
        val action = if (call.getBoolean("test") == true) WakeWordService.ACTION_TEST_START else WakeWordService.ACTION_START
        if (!WakeWordService.send(context, action)) return call.reject("O Android não deixou iniciar a escuta agora. Abra o Oi Chat.")
        call.resolve()
    }

    @PluginMethod
    fun stopTest(call: PluginCall) {
        WakeWordService.send(context, WakeWordService.ACTION_TEST_STOP)
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        WakeWordService.send(context, WakeWordService.ACTION_STOP)
        call.resolve()
    }

    @PluginMethod
    fun resume(call: PluginCall) {
        WakeWordService.send(context, WakeWordService.ACTION_RESUME)
        call.resolve()
    }

    @PluginMethod
    fun getState(call: PluginCall) {
        call.resolve(JSObject().put("state", OiChatBus.state).put("error", OiChatBus.error))
    }

    @PluginMethod
    fun openChatGPT(call: PluginCall) {
        val opened = ChatGPTLauncher.open(context, voice = call.getBoolean("voice", true) ?: true)
        call.resolve(JSObject().put("via", "embedded").put("opened", opened))
    }

    @PluginMethod
    fun requestAll(call: PluginCall) {
        requestPermissionForAliases(arrayOf("microphone", "notifications"), call, "permissionsDone")
    }

    @PermissionCallback
    private fun permissionsDone(call: PluginCall) {
        call.resolve(
            JSObject()
                .put("microphone", getPermissionState("microphone").toString())
                .put("notifications", getPermissionState("notifications").toString()),
        )
    }

    @PluginMethod
    fun diagnostics(call: PluginCall) {
        val ctx = context
        val pm = ctx.getSystemService(PowerManager::class.java)
        val bm = ctx.getSystemService(BatteryManager::class.java)
        val km = ctx.getSystemService(KeyguardManager::class.java)
        val notifications = if (Build.VERSION.SDK_INT >= 33) getPermissionState("notifications").toString() else "granted"
        call.resolve(
            JSObject()
                .put("microphone", getPermissionState("microphone").toString())
                .put("notifications", notifications)
                .put("overlay", Settings.canDrawOverlays(ctx))
                .put("batteryUnrestricted", pm.isIgnoringBatteryOptimizations(ctx.packageName))
                .put("charging", bm.isCharging)
                .put("secureLock", km.isDeviceSecure)
                .put("manufacturer", Build.MANUFACTURER)
                .put("chatGPTInstalled", ChatGPTLauncher.officialAppInstalled(ctx))
                .put("state", OiChatBus.state),
        )
    }

    @PluginMethod
    fun chatGPTApp(call: PluginCall) {
        call.resolve(JSObject().put("installed", ChatGPTLauncher.officialAppInstalled(context)))
    }

    @PluginMethod
    fun openChatGPTApp(call: PluginCall) {
        val launch = context.packageManager.getLaunchIntentForPackage(ChatGPTLauncher.CHATGPT_PACKAGE)
            ?: return call.resolve(JSObject().put("opened", false))
        context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        call.resolve(JSObject().put("opened", true))
    }

    @PluginMethod
    fun installChatGPTApp(call: PluginCall) {
        val pkg = ChatGPTLauncher.CHATGPT_PACKAGE
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
        call.resolve()
    }

    /** Abre a tela do sistema onde o usuário ajusta algo. O app nunca muda isso sozinho. */
    @PluginMethod
    fun openSettings(call: PluginCall) {
        val pkg = Uri.parse("package:${context.packageName}")
        val intent = when (call.getString("which")) {
            "overlay" -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkg)
            "battery" -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg)
            "security" -> Intent(Settings.ACTION_SECURITY_SETTINGS)
            "assistant" -> Intent(Settings.ACTION_VOICE_INPUT_SETTINGS)
            "notifications" -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
        }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
        } catch (_: Exception) {
            context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        call.resolve()
    }
}
