package com.oichat.app

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Abertura do ChatGPT no Android.
 *
 * Padrão: app oficial do ChatGPT (login com Google funciona). Sem o app: chatgpt.com na ChatGPTActivity.
 * O Android só deixa abrir uma tela a partir do serviço quando:
 *  - o Oi Chat já está visível; ou
 *  - o usuário concedeu "Sobrepor a outros apps" (SYSTEM_ALERT_WINDOW).
 * Caso contrário, mostra uma notificação para o usuário tocar. Não contorna a tela de bloqueio.
 */
object ChatGPTLauncher {
    const val CHATGPT_PACKAGE = "com.openai.chatgpt"
    const val CHATGPT_URL = "https://chatgpt.com/"
    private const val TAP_NOTIF_ID = 2

    fun canOpenFromBackground(ctx: Context): Boolean =
        OiChatBus.mainVisible || OiChatBus.chatVisible || Settings.canDrawOverlays(ctx)

    /** @return true se a tela foi aberta; false se virou notificação. */
    fun open(ctx: Context, voice: Boolean): Boolean {
        // App oficial do ChatGPT (onde o login com Google funciona); sem ele, a versão dentro do Oi Chat.
        val intent = ctx.packageManager.getLaunchIntentForPackage(CHATGPT_PACKAGE)
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ?: Intent(ctx, ChatGPTActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(ChatGPTActivity.EXTRA_VOICE, voice)
        if (canOpenFromBackground(ctx)) {
            val official = intent.component?.packageName == CHATGPT_PACKAGE
            if (official) ChatGPTAccessibilityService.arm()
            ctx.startActivity(intent)
            if (official) OiChatBus.setState("released")
            return true
        }
        postTapNotification(ctx, intent)
        return false
    }

    private fun postTapNotification(ctx: Context, intent: Intent) {
        WakeWordService.ensureChannels(ctx)
        val pi = PendingIntent.getActivity(ctx, 10, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(ctx, WakeWordService.CHANNEL_ALERT)
            .setSmallIcon(R.drawable.ic_stat_oichat)
            .setContentTitle("Ouvi “Oi, Chat”")
            .setContentText("Toque para conversar com o ChatGPT")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(TAP_NOTIF_ID, n)
        } catch (_: SecurityException) {
            // Sem permissão de notificação: nada a fazer além do diagnóstico.
        }
    }

    fun cancelTapNotification(ctx: Context) = NotificationManagerCompat.from(ctx).cancel(TAP_NOTIF_ID)

    fun officialAppInstalled(ctx: Context): Boolean =
        ctx.packageManager.getLaunchIntentForPackage(CHATGPT_PACKAGE) != null

    /** Alternativa: app oficial (se instalado) ou navegador. Sem modo de voz automático. */
    fun openExternal(ctx: Context) {
        val launch = ctx.packageManager.getLaunchIntentForPackage(CHATGPT_PACKAGE)
            ?: Intent(Intent.ACTION_VIEW, Uri.parse(CHATGPT_URL))
        ctx.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
