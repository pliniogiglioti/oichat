package com.oichat.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.log10
import kotlin.math.sqrt
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.StorageService

/**
 * Escuta contínua e local da palavra de ativação "Oi, Chat" (Vosk, offline).
 * Foreground Service do tipo microfone, com notificação permanente.
 * Nenhum áudio é gravado nem enviado: o reconhecedor só conhece as frases da gramática.
 */
class WakeWordService : Service() {

    companion object {
        private const val TAG = "OiChat"
        const val ACTION_START = "com.oichat.app.START"
        const val ACTION_STOP = "com.oichat.app.STOP"
        const val ACTION_RESUME = "com.oichat.app.RESUME"
        const val ACTION_REFRESH_MIC = "com.oichat.app.REFRESH_MIC"
        const val ACTION_CHAT_OPENED = "com.oichat.app.CHAT_OPENED"
        const val ACTION_GOODBYE = "com.oichat.app.GOODBYE"
        const val ACTION_TEST_START = "com.oichat.app.TEST_START"
        const val ACTION_TEST_STOP = "com.oichat.app.TEST_STOP"

        const val CHANNEL_LISTENING = "oichat_listening"
        const val CHANNEL_ALERT = "oichat_alert"
        private const val NOTIF_ID = 1
        private const val SAMPLE_RATE = 16000f
        private const val ERROR_RETRY_MS = 10_000L

        private val WAKE = listOf("oi chat", "oi chá", "oi xá")
        private val GOODBYE = listOf("tchau chat", "tchau chá", "tchau xá", "chau chat", "chau chá")
        private val WAKE_RE = Regex("\\boi (chat|chá|xá)\\b")
        private val GOODBYE_RE = Regex("\\bt?chau (chat|chá|xá)\\b")

        /** @return false se o Android recusou (ex.: iniciar o microfone com o app em segundo plano). */
        fun send(ctx: Context, action: String): Boolean {
            val i = Intent(ctx, WakeWordService::class.java).setAction(action)
            return try {
                if (action == ACTION_START || action == ACTION_TEST_START) {
                    ContextCompat.startForegroundService(ctx, i)
                } else if (OiChatBus.state != "disabled") {
                    ctx.startService(i)
                }
                true
            } catch (e: Exception) {
                Log.w(TAG, "serviço recusado ($action)", e)
                false
            }
        }

        fun ensureChannels(ctx: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val nm = ctx.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_LISTENING, "Assistente ouvindo", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Aviso permanente enquanto o Oi Chat ouve a palavra de ativação"
                    setShowBadge(false)
                },
            )
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ALERT, "Abrir ChatGPT", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Quando o Android não deixa abrir o ChatGPT sozinho"
                },
            )
        }
    }

    private enum class Mode { NONE, WAKE, GOODBYE }

    private val handler = Handler(Looper.getMainLooper())
    private var model: Model? = null
    private var loadingModel = false
    // Leitura própria do microfone (em vez do SpeechService do Vosk) para medir o volume.
    private var recognizer: Recognizer? = null
    private var micThread: Thread? = null
    @Volatile private var micRunning = false
    private var generation = 0
    private var mode = Mode.NONE
    private var testMode = false
    private var fired = false
    /** Já chegou algum som desde que o microfone foi aberto (zeros = captura bloqueada pelo Android). */
    @Volatile private var micHasSound = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                if (!goForeground()) return START_NOT_STICKY
                testMode = false
                if (mode == Mode.NONE) listen(Mode.WAKE)
            }
            ACTION_TEST_START -> {
                if (!goForeground()) return START_NOT_STICKY
                testMode = true
                listen(Mode.WAKE)
            }
            ACTION_TEST_STOP -> {
                testMode = false
                listen(Mode.WAKE)
            }
            ACTION_RESUME -> listen(Mode.WAKE, silenceRetries = 3)
            // O Oi Chat voltou para a tela: se o microfone foi aberto com o app fora da tela, o Android
            // só entregou silêncio. Agora que está visível, reabre.
            ACTION_REFRESH_MIC -> if (mode == Mode.WAKE && !micHasSound) listen(Mode.WAKE)
            ACTION_CHAT_OPENED -> {
                stopListening() // libera o microfone para o modo de voz do ChatGPT
                OiChatBus.setState("released")
                updateNotification()
            }
            ACTION_GOODBYE -> if (OiChatConfig.read(this).goodbyeMic) listen(Mode.GOODBYE)
            ACTION_STOP -> shutdown()
            // Reinício pelo sistema sem intent: no Android 14+ não é permitido religar o microfone daqui.
            null -> stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopListening()
        handler.removeCallbacksAndMessages(null)
        model?.close()
        model = null
        if (OiChatBus.state != "disabled") OiChatBus.setState("disabled")
        super.onDestroy()
    }

    // ---------- foreground ----------

    private fun goForeground(): Boolean {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            OiChatBus.setState("error", "Permissão de microfone negada.")
            stopSelf()
            return false
        }
        ensureChannels(this)
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(NOTIF_ID, buildNotification())
            }
            true
        } catch (e: Exception) {
            // Ex.: ForegroundServiceStartNotAllowedException quando iniciado com o app em segundo plano.
            Log.w(TAG, "startForeground falhou", e)
            OiChatBus.setState("error", "O Android não deixou iniciar a escuta. Abra o Oi Chat.")
            stopSelf()
            false
        }
    }

    private fun buildNotification(): Notification {
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val openApp = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), flags)
        val openChat = PendingIntent.getActivity(
            this, 1,
            Intent(this, ChatGPTActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(ChatGPTActivity.EXTRA_VOICE, true),
            flags,
        )
        val stop = PendingIntent.getService(this, 2, Intent(this, WakeWordService::class.java).setAction(ACTION_STOP), flags)

        val text = when (OiChatBus.state) {
            "released" -> "Conversa no ChatGPT"
            "error" -> OiChatBus.error ?: "Erro"
            else -> "Diga “Oi, Chat” para conversar"
        }
        return NotificationCompat.Builder(this, CHANNEL_LISTENING)
            .setSmallIcon(R.drawable.ic_stat_oichat)
            .setContentTitle("Oi Chat está ouvindo")
            .setContentText(text)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(openApp)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .addAction(0, "Abrir ChatGPT", openChat)
            .addAction(0, "Encerrar", stop)
            .build()
    }

    private fun updateNotification() {
        if (OiChatBus.state == "disabled") return
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification())
    }

    private fun shutdown() {
        stopListening()
        OiChatBus.setState("disabled")
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    // ---------- reconhecimento ----------

    private fun withModel(block: (Model) -> Unit) {
        model?.let { return block(it) }
        if (loadingModel) return
        loadingModel = true
        OiChatBus.emit("loading", mapOf("loading" to true))
        // Na 1ª vez copia o modelo dos assets para o armazenamento interno (uma vez só).
        StorageService.unpack(
            this, "model-pt", "model",
            { m ->
                loadingModel = false
                model = m
                OiChatBus.emit("loading", mapOf("loading" to false))
                block(m)
            },
            { e ->
                loadingModel = false
                OiChatBus.emit("loading", mapOf("loading" to false))
                fail("Não foi possível carregar o modelo de voz: ${e.message}")
            },
        )
    }

    /** @param silenceRetries depois de outro app usar o microfone: reabre se a captura vier silenciada. */
    private fun listen(target: Mode, silenceRetries: Int = 0) {
        stopListening()
        withModel { m ->
            try {
                val phrases = if (target == Mode.WAKE) WAKE else GOODBYE
                val grammar = JSONArray(phrases + "[unk]").toString()
                val rec = Recognizer(m, SAMPLE_RATE, grammar).apply { setWords(true) }
                recognizer = rec
                startMic(rec, silenceRetries)
                mode = target
                fired = false
                if (target == Mode.WAKE) OiChatBus.setState("listening")
                updateNotification()
            } catch (e: Exception) {
                fail("Não foi possível abrir o microfone: ${e.message}")
            }
        }
    }

    private fun stopListening() {
        generation++ // descarta resultados que ainda estejam a caminho
        micRunning = false
        micThread?.join(1000)
        micThread = null
        recognizer?.close()
        recognizer = null
        mode = Mode.NONE
        OiChatBus.emit("level", mapOf("level" to 0.0))
    }

    /**
     * Lê o microfone em blocos de 0,1 s: mede o volume (só um número, para a animação da tela)
     * e entrega o áudio ao Vosk. Nada é gravado.
     */
    @SuppressLint("MissingPermission") // checada em goForeground()
    private fun startMic(rec: Recognizer, silenceRetries: Int) {
        val rate = SAMPLE_RATE.toInt()
        val minBuf = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val audio = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION, rate,
            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minBuf, rate / 5 * 2),
        )
        if (audio.state != AudioRecord.STATE_INITIALIZED) {
            audio.release()
            throw IllegalStateException("microfone indisponível")
        }
        audio.startRecording()
        val gen = generation
        micRunning = true
        micThread = Thread {
            val buf = ShortArray(rate / 10)
            var lastLevel = 0L
            val startedAt = System.currentTimeMillis()
            var gotSound = false
            micHasSound = false
            try {
                while (micRunning) {
                    val n = audio.read(buf, 0, buf.size)
                    if (n < 0) {
                        handler.post { if (gen == generation) fail("Erro no microfone ($n)") }
                        break
                    }
                    if (n == 0) continue
                    val now = System.currentTimeMillis()
                    // Captura "silenciada" pelo Android (outro app acabou de usar o microfone) só entrega
                    // zeros. Se nada além de zero chegar em 3 s, reabre (poucas vezes: fones com
                    // cancelamento de ruído também mandam zeros quando ninguém fala).
                    if (!gotSound && buf.any { it.toInt() != 0 }) {
                        gotSound = true
                        micHasSound = true
                    }
                    if (!gotSound && silenceRetries > 0 && now - startedAt > 3000) {
                        Log.i(TAG, "microfone silenciado; reabrindo")
                        val target = mode
                        handler.post { if (gen == generation && target != Mode.NONE) listen(target, silenceRetries - 1) }
                        break
                    }
                    if (now - lastLevel >= 80) {
                        lastLevel = now
                        var sum = 0.0
                        for (i in 0 until n) sum += buf[i].toDouble() * buf[i]
                        val rms = sqrt(sum / n) / 32768.0
                        val db = if (rms > 0) 20 * log10(rms) else -100.0
                        OiChatBus.emit("level", mapOf("level" to ((db + 65) / 45).coerceIn(0.0, 1.0)))
                    }
                    val isFinal = rec.acceptWaveForm(buf, n)
                    val json = if (isFinal) rec.result else rec.partialResult
                    handler.post {
                        if (gen != generation) return@post
                        if (isFinal) handleFinal(json) else onPartialResult(json)
                    }
                }
            } finally {
                try { audio.stop() } catch (_: Exception) { }
                audio.release()
            }
        }.apply { name = "oichat-mic"; start() }
    }

    private fun fail(message: String) {
        stopListening()
        OiChatBus.setState("error", message)
        updateNotification()
        handler.postDelayed({ if (OiChatBus.state == "error") listen(Mode.WAKE) }, ERROR_RETRY_MS)
    }

    private fun minConfidence(): Float = 0.95f - OiChatConfig.read(this).sensitivity * 0.6f

    private fun onPartialResult(hypothesis: String?) {
        val text = hypothesis?.let { JSONObject(it).optString("partial") }.orEmpty()
        if (text.isEmpty()) return
        OiChatBus.emit("heard", mapOf("text" to text))
        // "Tchau, Chat" acontece com o ChatGPT falando ao fundo: aceita o parcial.
        val usePartial = mode == Mode.GOODBYE || OiChatConfig.read(this).sensitivity >= 0.8f
        if (usePartial && matches(text)) fire()
    }


    private fun handleFinal(hypothesis: String?) {
        val json = hypothesis?.let { JSONObject(it) } ?: return
        val text = json.optString("text")
        if (text.isEmpty()) return
        OiChatBus.emit("heard", mapOf("text" to text))
        if (!matches(text)) return
        val words = json.optJSONArray("result")
        var sum = 0.0
        val n = words?.length() ?: 0
        for (i in 0 until n) sum += words!!.getJSONObject(i).optDouble("conf", 0.0)
        val conf = if (n > 0) sum / n else 0.0
        if (conf >= minConfidence()) fire()
    }

    private fun matches(text: String) = if (mode == Mode.GOODBYE) GOODBYE_RE.containsMatchIn(text) else WAKE_RE.containsMatchIn(text)


    private fun fire() {
        if (fired) return
        fired = true
        val m = mode
        Log.i(TAG, "detectado ($m)")
        when {
            m == Mode.GOODBYE -> {
                stopListening()
                OiChatBus.emit("goodbye")
            }
            testMode -> {
                OiChatBus.emit("detected", mapOf("mode" to "wake"))
                handler.postDelayed({ fired = false }, 2000)
            }
            else -> onWakeWord()
        }
    }

    private fun onWakeWord() {
        OiChatBus.setState("detected")
        stopListening() // libera o microfone antes de abrir o ChatGPT
        feedback()
        OiChatBus.setState("opening")
        if (!ChatGPTLauncher.open(this, voice = true)) {
            // O Android bloqueou a abertura em segundo plano: notificação para tocar. Volta a ouvir.
            listen(Mode.WAKE)
        }
    }

    private fun feedback() {
        val cfg = OiChatConfig.read(this)
        if (cfg.sound) {
            try {
                val tone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, (cfg.volume * 100).toInt().coerceIn(0, 100))
                tone.startTone(ToneGenerator.TONE_PROP_ACK, 200)
                handler.postDelayed({ tone.release() }, 400)
            } catch (_: Exception) { }
        }
        if (cfg.vibration) {
            val vib = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                getSystemService(VibratorManager::class.java).defaultVibrator
            } else {
                @Suppress("DEPRECATION") getSystemService(Vibrator::class.java)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vib?.vibrate(VibrationEffect.createOneShot(60, VibrationEffect.DEFAULT_AMPLITUDE))
            }
        }
    }
}
