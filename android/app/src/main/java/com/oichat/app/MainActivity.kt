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
    }

    override fun onPause() {
        OiChatBus.mainVisible = false
        super.onPause()
    }
}
