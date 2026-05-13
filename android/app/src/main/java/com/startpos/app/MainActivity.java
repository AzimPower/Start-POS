package com.startpos.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
	private static final int BLUETOOTH_PERMISSION_REQUEST_CODE = 1001;
	private long lastBackPressed = 0;

	@Override
	public void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		requestBluetoothPermissionsIfNeeded();
	}

	private void requestBluetoothPermissionsIfNeeded() {
		List<String> missingPermissions = new ArrayList<>();

		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
			addPermissionIfMissing(missingPermissions, Manifest.permission.BLUETOOTH_CONNECT);
			addPermissionIfMissing(missingPermissions, Manifest.permission.BLUETOOTH_SCAN);
		} else {
			addPermissionIfMissing(missingPermissions, Manifest.permission.BLUETOOTH);
			addPermissionIfMissing(missingPermissions, Manifest.permission.BLUETOOTH_ADMIN);
			addPermissionIfMissing(missingPermissions, Manifest.permission.ACCESS_COARSE_LOCATION);
			addPermissionIfMissing(missingPermissions, Manifest.permission.ACCESS_FINE_LOCATION);
		}

		if (!missingPermissions.isEmpty()) {
			ActivityCompat.requestPermissions(
				this,
				missingPermissions.toArray(new String[0]),
				BLUETOOTH_PERMISSION_REQUEST_CODE
			);
		}
	}

	private void addPermissionIfMissing(List<String> missingPermissions, String permission) {
		if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
			missingPermissions.add(permission);
		}
	}

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
