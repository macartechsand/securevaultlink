package app.securelink.vault;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Vault contents never appear in screenshots, screen recordings or the recent-apps preview.
        // Debug builds (never distributed) skip it so the UI can be checked with screenshots.
        if (!BuildConfig.DEBUG) {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        }
        super.onCreate(savedInstanceState);
        if (!BuildConfig.DEBUG) {
            // Defense in depth: no remote WebView inspection in the release, whatever the config says.
            WebView.setWebContentsDebuggingEnabled(false);
        }
    }
}
