package com.oichat.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Conduz o app oficial do ChatGPT depois do "Oi, Chat", sem o usuário tocar em nada:
 *  1. toca no botão "Iniciar conversa por voz";
 *  2. envia a saudação ("Oi, Chat!"), como no Windows;
 *  3. percebe o fim da conversa (saiu do modo de voz ou do app) e manda o Oi Chat voltar a ouvir.
 *
 * Privacidade: só lê rótulos de botões (content-description) do app com.openai.chatgpt.
 * Não lê, guarda nem registra o texto da conversa.
 */
class ChatGPTAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "OiChatA11y"
        private const val PKG = ChatGPTLauncher.CHATGPT_PACKAGE

        private val VOICE_BUTTON = Regex("(?i)voice conversation|conversa por voz|modo de voz|voice mode")
        private val SEND_BUTTON = Regex("(?i)^(send|enviar)")
        private val END_BUTTON = Regex("(?i)^(end|encerrar|finalizar|sair)$")
        private val GOODBYE = Regex("(?i)\\b(tchau|xau)[,.!\\s]*(chat|chá|xá|chet)")
        /** Sem nada novo na tela por este tempo: encerra a conversa. */
        private const val IDLE_MS = 120_000L

        /** Janelas que aparecem por cima sem encerrar a conversa (barra do sistema, permissões). */
        private val TRANSIENT = setOf(null, "com.android.systemui", "com.google.android.permissioncontroller", "com.android.permissioncontroller")

        private enum class Phase { IDLE, START_VOICE, IN_VOICE }

        @Volatile private var instance: ChatGPTAccessibilityService? = null
        @Volatile private var phase = Phase.IDLE
        @Volatile private var phaseSince = 0L

        /** Chamado logo antes de abrir o app do ChatGPT pelo "Oi, Chat". */
        fun arm() {
            phase = Phase.START_VOICE
            phaseSince = SystemClock.elapsedRealtime()
            instance?.handler?.post { instance?.step() }
        }

        fun isEnabled(ctx: Context): Boolean {
            val list = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
            return list.split(':').any { it.startsWith(ctx.packageName + "/") }
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var greeted = false
    private var voiceSeenAt = 0L
    private var lastClick = 0L
    private var goodbyesAtStart = -1
    private var lastTextHash = 0
    private var lastActivity = 0L

    override fun onServiceConnected() {
        instance = this
        Log.i(TAG, "serviço de acessibilidade ligado")
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onInterrupt() {}

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (phase == Phase.IDLE) return
        step()
    }

    private fun step() {
        val now = SystemClock.elapsedRealtime()
        val root = rootInActiveWindow
        val pkg = root?.packageName?.toString()
        when (phase) {
            Phase.IDLE -> Unit
            Phase.START_VOICE -> {
                if (now - phaseSince > 20_000) return finish("não achei o botão de voz")
                if (pkg != PKG || now - lastClick < 1500) return
                val btn = find(root) { VOICE_BUTTON.containsMatchIn(it.contentDescription ?: "") } ?: return
                lastClick = now
                click(btn)
                Log.i(TAG, "toquei em conversa por voz")
                phase = Phase.IN_VOICE
                phaseSince = now
                greeted = false
                voiceSeenAt = now
                goodbyesAtStart = -1
                lastTextHash = 0
                lastActivity = now
                OiChatBus.setState("released")
                handler.postDelayed({ greet() }, 3000)
                handler.postDelayed(::watch, 1000)
            }
            Phase.IN_VOICE -> Unit // acompanhado por watch()
        }
    }

    /** Envia a saudação na tela de voz, se ela tiver campo de texto. */
    private fun greet() {
        if (phase != Phase.IN_VOICE || greeted) return
        greeted = true
        val text = OiChatConfig.read(this).greeting
        if (text.isBlank()) return
        val root = rootInActiveWindow ?: return
        if (root.packageName?.toString() != PKG) return
        val field = find(root) { it.isEditable } ?: run {
            Log.i(TAG, "tela de voz sem campo de texto: ${labels(root)}")
            return
        }
        field.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        field.performAction(
            AccessibilityNodeInfo.ACTION_SET_TEXT,
            Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text) },
        )
        handler.postDelayed({
            val r = rootInActiveWindow ?: return@postDelayed
            val send = find(r) { SEND_BUTTON.containsMatchIn(it.contentDescription ?: "") }
            if (send != null) {
                click(send)
                Log.i(TAG, "saudação enviada")
            } else {
                Log.i(TAG, "sem botão de enviar: ${labels(r)}")
            }
        }, 600)
    }

    /** Fim da conversa: saiu do app do ChatGPT ou voltou para a tela normal (botão de voz visível). */
    private fun watch() {
        if (phase != Phase.IN_VOICE) return
        val now = SystemClock.elapsedRealtime()
        val root = rootInActiveWindow
        val pkg = root?.packageName?.toString()
        val inChat = pkg == PKG
        val voiceButtonVisible = inChat && find(root) { VOICE_BUTTON.containsMatchIn(it.contentDescription ?: "") } != null
        if (inChat && !voiceButtonVisible) {
            voiceSeenAt = now
            // A conversa só é lida aqui, na memória, para achar "Tchau, Chat" e saber se ainda está ativa.
            // Nada é guardado nem registrado.
            val (goodbyes, hash) = scanText(root!!)
            if (goodbyesAtStart < 0) goodbyesAtStart = goodbyes
            if (hash != lastTextHash) {
                lastTextHash = hash
                lastActivity = now
            }
            val reason = when {
                goodbyes > goodbyesAtStart -> "tchau chat"
                now - lastActivity > IDLE_MS -> "sem atividade"
                else -> null
            }
            if (reason != null) {
                find(root) { END_BUTTON.matches(it.contentDescription ?: "") }?.let(::click)
                    ?: performGlobalAction(GLOBAL_ACTION_BACK)
                Log.i(TAG, "encerrando: $reason")
                handler.postDelayed({ finish(reason) }, 800)
                return
            }
        }
        // Tolerância: telas de transição e teclado do sistema não contam como fim.
        if (now - voiceSeenAt > 2500 && now - phaseSince > 5000 && pkg !in TRANSIENT) {
            return finish(if (inChat) "saiu do modo de voz" else "saiu do ChatGPT")
        }
        handler.postDelayed(::watch, 1000)
    }

    private fun finish(reason: String) {
        Log.i(TAG, "fim: $reason")
        phase = Phase.IDLE
        handler.removeCallbacksAndMessages(null)
        // Volta para a tela do Oi Chat: com ele na frente o Android libera o microfone para ouvir de novo.
        packageManager.getLaunchIntentForPackage(packageName)?.let {
            startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
        }
        WakeWordService.send(this, WakeWordService.ACTION_RESUME)
    }

    // ---------- utilitários ----------

    private fun find(root: AccessibilityNodeInfo?, pred: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? {
        if (root == null) return null
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        while (queue.isNotEmpty()) {
            val n = queue.removeFirst()
            if (n.isVisibleToUser && pred(n)) return n
            for (i in 0 until n.childCount) n.getChild(i)?.let(queue::add)
        }
        return null
    }

    /** Quantas vezes "Tchau, Chat" aparece e uma impressão do texto visível (para notar atividade). */
    private fun scanText(root: AccessibilityNodeInfo): Pair<Int, Int> {
        var count = 0
        var hash = 17
        find(root) { n ->
            val t = n.text
            if (!t.isNullOrEmpty() && !n.isEditable) {
                count += GOODBYE.findAll(t).count()
                hash = hash * 31 + t.hashCode()
            }
            false
        }
        return count to hash
    }

    /** Só os rótulos dos botões (para diagnóstico); nunca o texto da conversa. */
    private fun labels(root: AccessibilityNodeInfo): String {
        val out = mutableListOf<String>()
        find(root) { n ->
            val d = n.contentDescription?.toString()
            if (!d.isNullOrBlank() && d.length < 40) out += d
            false
        }
        return out.joinToString(" | ")
    }

    private fun click(node: AccessibilityNodeInfo) {
        var n: AccessibilityNodeInfo? = node
        while (n != null) {
            if (n.isClickable && n.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return
            n = n.parent
        }
        // Sem nó clicável: toque no centro do botão.
        val r = Rect().also(node::getBoundsInScreen)
        val path = Path().apply { moveTo(r.exactCenterX(), r.exactCenterY()) }
        dispatchGesture(GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, 60)).build(), null, null)
    }
}
