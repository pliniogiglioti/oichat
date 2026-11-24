package com.oichat.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Canal de eventos entre o serviço de escuta, a tela do ChatGPT e o plugin (React).
 * Tudo roda no mesmo processo, então um barramento simples basta.
 */
object OiChatBus {
    @Volatile var state: String = "disabled"
        private set
    @Volatile var error: String? = null
        private set

    /** MainActivity (React) visível: o Android deixa abrir telas a partir daqui. */
    @Volatile var mainVisible = false
    /** Tela do ChatGPT aberta. */
    @Volatile var chatVisible = false

    private val main = Handler(Looper.getMainLooper())
    private val listeners = CopyOnWriteArrayList<(String, Map<String, Any?>) -> Unit>()

    fun on(listener: (String, Map<String, Any?>) -> Unit): () -> Unit {
        listeners.add(listener)
        return { listeners.remove(listener) }
    }

    /** Entrega sempre na thread principal. */
    fun emit(event: String, data: Map<String, Any?> = emptyMap()) {
        main.post { listeners.forEach { it(event, data) } }
    }

    fun setState(newState: String, err: String? = null) {
        state = newState
        error = err
        emit("state", mapOf("state" to newState, "error" to err))
    }
}

/** Configurações que o lado nativo precisa (copiadas do React via plugin). */
object OiChatConfig {
    private const val PREFS = "oichat_native"

    data class Values(
        val sensitivity: Float,
        val autoVoice: Boolean,
        val greeting: String,
        val goodbyeMic: Boolean,
        val vibration: Boolean,
        val sound: Boolean,
        val volume: Float,
    )

    fun read(ctx: Context): Values {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return Values(
            sensitivity = p.getFloat("sensitivity", 0.5f),
            autoVoice = p.getBoolean("autoVoice", true),
            greeting = p.getString("greeting", "Oi, Chat!") ?: "",
            // No Android, ouvir "Tchau, Chat" pelo microfone durante a conversa pode disputar o
            // microfone com o modo de voz do ChatGPT. Por padrão o fim é detectado pela tela.
            goodbyeMic = p.getBoolean("goodbyeMic", false),
            vibration = p.getBoolean("vibration", true),
            sound = p.getBoolean("sound", true),
            volume = p.getFloat("volume", 0.7f),
        )
    }

    fun write(ctx: Context, block: android.content.SharedPreferences.Editor.() -> Unit) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply(block).apply()
    }
}
