package com.oichat.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject

/**
 * ChatGPT oficial (chatgpt.com) dentro do Oi Chat — EXPERIMENTAL, igual à versão Windows.
 * - Login no site oficial; o Oi Chat não lê senhas, cookies nem tokens.
 * - Liga o modo de voz clicando no botão da página (pode quebrar se o site mudar).
 * - Fecha sozinho quando a conversa acaba ("Tchau, Chat" transcrito ou fim da voz)
 *   e devolve o usuário para onde estava.
 */
class ChatGPTActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_VOICE = "voice"
        private val ALLOWED_HOSTS = listOf(
            Regex("(^|\\.)chatgpt\\.com$"), Regex("(^|\\.)openai\\.com$"),
            Regex("(^|\\.)oaistatic\\.com$"), Regex("(^|\\.)oaiusercontent\\.com$"),
            Regex("^login\\.microsoftonline\\.com$"), Regex("^login\\.live\\.com$"),
            Regex("^appleid\\.apple\\.com$"), Regex("(^|\\.)challenges\\.cloudflare\\.com$"),
        )

        // Mesmos critérios da versão Windows (electron/services/chatGPTView.ts), em versão síncrona.
        private const val VOICE_CLICK_JS = """(function(){
  var vis=function(e){return !!(e.offsetWidth||e.offsetHeight)};
  var el=document.querySelector('[data-testid="composer-speech-button"]');
  if(!(el&&!el.disabled&&vis(el))){
    var els=[].slice.call(document.querySelectorAll('a, button, [role=button]'));
    el=els.find(function(b){var l=b.getAttribute('aria-label')||'';
      return !b.disabled&&vis(b)&&/\bvoz\b|voice/i.test(l)&&!/dita|dictat/i.test(l)&&!/encerr|end|parar|stop|sair|exit/i.test(l);})||null;
  }
  if(el){el.click();return {ok:true,how:el.getAttribute('aria-label')||'botao'};}
  var lo=!!document.querySelector('[data-testid="login-button"]');
  return {ok:false,loggedOut:lo};
})()"""

        private const val STATE_JS = """(function(){
  var vis=function(e){return !!(e.offsetWidth||e.offsetHeight)};
  var users=document.querySelectorAll('[data-message-author-role="user"]');
  var last=users[users.length-1];
  var t=last?(last.innerText||'').trim():'';
  var bye=/(^|[\s,.!?])t?chau[\s,!.]*(chat|chá|xá)[\s.!?]*$/i.test(t);
  var cards=[].slice.call(document.querySelectorAll('div, p, span, h2, h3, h4')).filter(function(e){
    return e.childElementCount===0&&/^(como foi essa conversa\??|how was (this|the|your) conversation\??)$/i.test((e.textContent||'').trim());}).length;
  return {userCount:users.length,lastIsBye:bye,feedbackCards:cards};
})()"""

        private const val SEND_JS = """(function(){
  var b=document.querySelector('[data-testid="send-button"]')||[].slice.call(document.querySelectorAll('button')).find(function(x){return /^(enviar|send)/i.test(x.getAttribute('aria-label')||'')});
  if(b&&!b.disabled){b.click();return true;} return false;
})()"""

        private fun insertJs(text: String) = """(function(){
  var box=document.querySelector('#prompt-textarea, [contenteditable="true"]');
  if(!box) return false; box.focus(); document.execCommand('insertText', false, ${JSONObject.quote(text)}); return true;
})()"""
    }

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var web: WebView
    private lateinit var status: TextView
    private var voiceWanted = true
    private var voiceTries = 0
    private var voiceStarted = false
    private var watching = false
    private var userBaseline = -1
    private var cardBaseline = -1
    private var finishing = false
    private var offBus: (() -> Unit)? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        OiChatBus.chatVisible = true
        ChatGPTLauncher.cancelTapNotification(this)
        WakeWordService.send(this, WakeWordService.ACTION_CHAT_OPENED)
        voiceWanted = intent.getBooleanExtra(EXTRA_VOICE, true) && OiChatConfig.read(this).autoVoice

        setContentView(buildLayout())

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val host = request.url.host ?: return true
                if (request.url.scheme == "https" && ALLOWED_HOSTS.any { it.containsMatchIn(host) }) return false
                startActivity(Intent(Intent.ACTION_VIEW, request.url)) // links externos: navegador
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                if (voiceWanted && !voiceStarted && voiceTries == 0) tryVoice()
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            // Microfone só para o chatgpt.com (o modo de voz precisa). Sem câmera.
            override fun onPermissionRequest(request: PermissionRequest) {
                val host = request.origin.host.orEmpty()
                val audioOk = ContextCompat.checkSelfPermission(this@ChatGPTActivity, Manifest.permission.RECORD_AUDIO) ==
                    PackageManager.PERMISSION_GRANTED
                if (audioOk && Regex("(^|\\.)chatgpt\\.com$").containsMatchIn(host) &&
                    request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                ) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                } else {
                    request.deny()
                }
            }
        }
        web.loadUrl(ChatGPTLauncher.CHATGPT_URL)
        setStatus(if (voiceWanted) "Ativando modo de voz…" else "ChatGPT")

        offBus = OiChatBus.on { event, _ -> if (event == "goodbye") finishConversation() }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = finishConversation()
        })
    }

    override fun onDestroy() {
        OiChatBus.chatVisible = false
        offBus?.invoke()
        handler.removeCallbacksAndMessages(null)
        if (!finishing) WakeWordService.send(this, WakeWordService.ACTION_RESUME)
        web.destroy()
        super.onDestroy()
    }

    // ---------- interface ----------

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    private fun buildLayout(): LinearLayout {
        val bg = Color.parseColor("#0A0A0F")
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(bg)
            setPadding(dp(12), dp(8), dp(12), dp(8))
        }
        bar.addView(ImageView(this).apply { setImageResource(R.mipmap.ic_launcher_round) }, LinearLayout.LayoutParams(dp(32), dp(32)))
        val texts = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(10), 0, dp(10), 0)
        }
        texts.addView(TextView(this).apply {
            text = "Oi Chat"
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            textSize = 15f
        })
        status = TextView(this).apply {
            setTextColor(Color.parseColor("#A1A1AA"))
            textSize = 12f
            maxLines = 1
        }
        texts.addView(status)
        bar.addView(texts, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        bar.addView(Button(this).apply {
            text = "Fechar"
            isAllCaps = false
            setOnClickListener { finishConversation() }
        })

        web = WebView(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(bg)
            addView(bar, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
            addView(web, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
        }
        // Android 15+ desenha atrás das barras do sistema: respeita barra de status, navegação e teclado.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val s = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(s.left, s.top, s.right, s.bottom)
            insets
        }
        return root
    }

    private fun setStatus(text: String) {
        status.text = text
    }

    // ---------- modo de voz ----------

    private fun tryVoice() {
        if (finishing) return
        voiceTries++
        web.evaluateJavascript(VOICE_CLICK_JS) { raw ->
            val r = runCatching { JSONObject(raw) }.getOrNull()
            when {
                r?.optBoolean("ok") == true -> {
                    voiceStarted = true
                    setStatus("Diga “Tchau, Chat” para sair")
                    startWatching()
                    val greeting = OiChatConfig.read(this).greeting
                    if (greeting.isNotBlank()) handler.postDelayed({ sendGreeting(greeting) }, 3000)
                    handler.postDelayed({ WakeWordService.send(this, WakeWordService.ACTION_GOODBYE) }, 2000)
                }
                voiceTries < 40 -> handler.postDelayed({ tryVoice() }, 500)
                else -> {
                    setStatus(if (r?.optBoolean("loggedOut") == true) "Toque no botão de voz do ChatGPT" else "Toque no botão de voz do ChatGPT")
                    startWatching()
                }
            }
        }
    }

    private fun sendGreeting(text: String) {
        if (finishing) return
        web.evaluateJavascript(insertJs(text)) { inserted ->
            if (inserted != "true") {
                setStatus("Voz ativa · não deu para enviar “$text”")
                return@evaluateJavascript
            }
            handler.postDelayed({
                web.evaluateJavascript(SEND_JS) { sent ->
                    if (sent != "true") setStatus("Voz ativa · não deu para enviar “$text”")
                }
            }, 400)
        }
    }

    /** Observa a conversa: "Tchau, Chat" na última mensagem do usuário ou cartão de fim da voz. */
    private fun startWatching() {
        if (watching) return
        watching = true
        val tick = object : Runnable {
            override fun run() {
                if (finishing) return
                web.evaluateJavascript(STATE_JS) { raw ->
                    val s = runCatching { JSONObject(raw) }.getOrNull()
                    if (s != null) {
                        val users = s.optInt("userCount")
                        val cards = s.optInt("feedbackCards")
                        if (userBaseline < 0) userBaseline = users
                        if (cardBaseline < 0) cardBaseline = cards
                        if ((s.optBoolean("lastIsBye") && users > userBaseline) || cards > cardBaseline) {
                            finishConversation()
                            return@evaluateJavascript
                        }
                    }
                    handler.postDelayed(this, 1000)
                }
            }
        }
        handler.post(tick)
    }

    /** Encerra: destrói a página (fim do modo de voz, microfone liberado), volta a ouvir e devolve o usuário. */
    private fun finishConversation() {
        if (finishing) return
        finishing = true
        handler.removeCallbacksAndMessages(null)
        web.stopLoading()
        web.loadUrl("about:blank")
        WakeWordService.send(this, WakeWordService.ACTION_RESUME)
        finishAndRemoveTask()
    }

    @Suppress("unused")
    private fun openInBrowser() = startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(ChatGPTLauncher.CHATGPT_URL)))
}
