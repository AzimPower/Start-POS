package com.startpos.app;

import android.widget.Toast;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	private long lastBackPressed = 0;

	@Override
	public void onBackPressed() {
		try {
			// Try to let the webview navigate back if possible
			if (this.bridge != null && this.bridge.getWebView() != null && this.bridge.getWebView().canGoBack()) {
				this.bridge.getWebView().goBack();
				return;
			}
		} catch (Exception e) {
			// ignore and fall through to native handling
		}

		long now = System.currentTimeMillis();
		if (now - lastBackPressed < 2000) {
			// second press within 2s -> exit
			super.onBackPressed();
		} else {
			lastBackPressed = now;
			Toast.makeText(this, "Appuyez encore pour quitter", Toast.LENGTH_SHORT).show();
		}
	}
}
