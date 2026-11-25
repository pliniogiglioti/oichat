package com.oichat.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(WakeWordPlugin::class.java)
        super.onCreate(savedInstanceState)
    }

    override fun onResume() {
        super.onResume()
        OiChatBus.mainVisible = true
        if (OiChatBus.state == "listening") {
            window.decorView.postDelayed({
                if (OiChatBus.mainVisible) WakeWordService.send(this, WakeWordService.ACTION_REFRESH_MIC)
            }, 800)
        }
    }

    override fun onPause() {
        OiChatBus.mainVisible = false
        super.onPause()
    }
}
