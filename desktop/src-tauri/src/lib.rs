//! SecureLink Vault desktop (Tauri 2).
//!
//! The window runs the same web app (web-saas/dist), so the vault is still decrypted only in the app's
//! memory. The native side adds one capability the browser lacks: `rotation_http`, an HTTPS client for
//! on-device credential rotation (docs/product/innovation.md 9.2). It is deliberately narrow:
//!  - HTTPS only, to an allowlist of provider API hosts (no arbitrary URLs: no SSRF, no data exfiltration
//!    through the app to other hosts);
//!  - no redirects followed, 20 s timeout, 1 MiB response cap, no cookies;
//!  - only GET/POST/PUT, a bounded set of headers, and nothing is logged.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

/// Provider API hosts the rotation connectors may call. Keep in sync with web-saas/src/lib/clientRotation.ts.
pub const ALLOWED_HOSTS: &[&str] = &[
    "gitlab.com",
    "api.cloudflare.com",
    "iam.amazonaws.com",
    "sts.amazonaws.com",
    "oauth2.googleapis.com",
    "iam.googleapis.com",
    "admin.googleapis.com",
    "login.microsoftonline.com",
    "graph.microsoft.com",
];

const MAX_BODY: usize = 1024 * 1024;
const MAX_HEADERS: usize = 16;

#[derive(Debug, Deserialize)]
pub struct HttpRequest {
    pub url: String,
    pub method: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub body: String,
}

/// Validates a request against the allowlist; returns the parsed URL.
pub fn check_request(req: &HttpRequest) -> Result<url::Url, String> {
    let url = url::Url::parse(&req.url).map_err(|_| "invalid url".to_string())?;
    if url.scheme() != "https" {
        return Err("https only".into());
    }
    if url.port().is_some() || !url.username().is_empty() || url.password().is_some() {
        return Err("no ports or credentials in the url".into());
    }
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    if !ALLOWED_HOSTS.contains(&host.as_str()) {
        return Err(format!("host not allowed: {host}"));
    }
    if !matches!(req.method.as_str(), "GET" | "POST" | "PUT") {
        return Err("method not allowed".into());
    }
    if req.headers.len() > MAX_HEADERS {
        return Err("too many headers".into());
    }
    for (name, value) in &req.headers {
        let lower = name.to_ascii_lowercase();
        if matches!(lower.as_str(), "host" | "cookie" | "connection" | "transfer-encoding" | "content-length")
            || value.contains('\r')
            || value.contains('\n')
        {
            return Err(format!("header not allowed: {name}"));
        }
    }
    if req.body.as_ref().map(|b| b.len()).unwrap_or(0) > MAX_BODY {
        return Err("body too large".into());
    }
    Ok(url)
}

#[tauri::command]
async fn rotation_http(request: HttpRequest) -> Result<HttpResponse, String> {
    let url = check_request(&request)?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .https_only(true)
        .build()
        .map_err(|_| "client error".to_string())?;
    let method = reqwest::Method::from_bytes(request.method.as_bytes()).map_err(|_| "bad method".to_string())?;
    let mut builder = client.request(method, url);
    for (name, value) in &request.headers {
        builder = builder.header(name.as_str(), value.as_str());
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }
    // Errors never include the request (it carries credentials).
    let response = builder.send().await.map_err(|_| "network error".to_string())?;
    let status = response.status().as_u16();
    let bytes = response.bytes().await.map_err(|_| "read error".to_string())?;
    if bytes.len() > MAX_BODY {
        return Err("response too large".into());
    }
    Ok(HttpResponse { status, body: String::from_utf8_lossy(&bytes).into_owned() })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![rotation_http])
        .run(tauri::generate_context!())
        .expect("error while running SecureLink Vault");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(url: &str, method: &str) -> HttpRequest {
        HttpRequest { url: url.into(), method: method.into(), headers: HashMap::new(), body: None }
    }

    #[test]
    fn allows_provider_hosts_over_https() {
        assert!(check_request(&req("https://gitlab.com/api/v4/personal_access_tokens/self", "GET")).is_ok());
        assert!(check_request(&req("https://api.cloudflare.com/client/v4/user/tokens/verify", "GET")).is_ok());
    }

    #[test]
    fn refuses_other_hosts_schemes_ports_and_methods() {
        assert!(check_request(&req("http://gitlab.com/", "GET")).is_err());
        assert!(check_request(&req("https://evil.example/", "GET")).is_err());
        assert!(check_request(&req("https://gitlab.com.evil.example/", "GET")).is_err());
        assert!(check_request(&req("https://gitlab.com:8443/", "GET")).is_err());
        assert!(check_request(&req("https://user:pw@gitlab.com/", "GET")).is_err());
        assert!(check_request(&req("https://127.0.0.1/", "GET")).is_err());
        assert!(check_request(&req("https://gitlab.com/", "DELETE")).is_err());
    }

    #[test]
    fn refuses_header_injection() {
        let mut r = req("https://gitlab.com/", "GET");
        r.headers.insert("X-Test".into(), "a\r\nHost: evil".into());
        assert!(check_request(&r).is_err());
        let mut r = req("https://gitlab.com/", "GET");
        r.headers.insert("Cookie".into(), "a=b".into());
        assert!(check_request(&r).is_err());
    }
}
