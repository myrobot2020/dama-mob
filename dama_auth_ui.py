"""Landing + /app shell: when DAMA_FIREBASE_ENABLED=1, Firebase Auth + Firestore is authoritative; DIY is only used if Firebase is off."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

import dama_diy_auth as dama_diy
import dama_firebase_auth as dama_fb

CHAT_EMBED_NAME = "chat_embed.html"
_HEAD_MARKER = "<!-- __FIREBASE_HEAD_INJECT__ -->"


def _firebase_on() -> bool:
    """Hosted Firebase Auth + Firestore (enable in Cloud Run / production)."""
    return dama_fb.firebase_enabled()


def _diy_on() -> bool:
    """SQLite username/password only when Firebase is not enabled."""
    return dama_diy.diy_auth_enabled() and not dama_fb.firebase_enabled()


def _inject_chat_head(html: str) -> str:
    if _firebase_on():
        inj = """    <script>window.__DAMA_DIY_AUTH=false;</script>
    <script>window.__DAMA_SEND_CREDENTIALS=false;</script>
    <script>window.__DAMA_FIREBASE_REQUIRED=true;</script>
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
    <script>
    (function(){
      fetch('/api/public/firebase_config').then(function(r){return r.json();}).then(function(cfg){
        if (!cfg || !cfg.apiKey) {
          document.body.innerHTML = '<p style="color:#e9eefc;padding:2rem;font-family:system-ui,sans-serif">Firebase web config missing (set DAMA_FIREBASE_WEB_CONFIG).</p>';
          return;
        }
        firebase.initializeApp(cfg);
        firebase.auth().onAuthStateChanged(function(user){
          if (!user) { window.location.href = '/'; return; }
          user.getIdToken().then(function(t){
            return fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + t } });
          }).then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); }).then(function(x){
            if (x.ok && x.d) window.__damaAccount = x.d;
            if (window.__damaSyncGreet) window.__damaSyncGreet();
          }).catch(function(){});
          if (window.__damaChatBoot) window.__damaChatBoot();
        });
      }).catch(function(e){
        document.body.innerHTML = '<p style="color:#ff5c7a;padding:2rem;font-family:system-ui,sans-serif">' + String(e && e.message ? e.message : e) + '</p>';
      });
    })();
    </script>
"""
        return html.replace(_HEAD_MARKER, inj, 1)
    if _diy_on():
        inj = """    <script>window.__DAMA_FIREBASE_REQUIRED=false;</script>
    <script>window.__DAMA_DIY_AUTH=true;</script>
    <script>window.__DAMA_SEND_CREDENTIALS=true;</script>
    <script>
    (function(){
      fetch('/api/auth/me', { credentials: 'include' }).then(function(r){
        if (r.status === 401) { window.location.href = '/'; return null; }
        return r.json();
      }).then(function(j){
        if (j) window.__damaAccount = j;
        if (window.__damaSyncGreet) window.__damaSyncGreet();
        if (j && window.__damaChatBoot) window.__damaChatBoot();
      });
    })();
    </script>
"""
        return html.replace(_HEAD_MARKER, inj, 1)
    inj = """    <script>window.__DAMA_FIREBASE_REQUIRED=false;</script>
    <script>window.__DAMA_DIY_AUTH=false;</script>
    <script>window.__DAMA_SEND_CREDENTIALS=false;</script>
"""
    return html.replace(_HEAD_MARKER, inj, 1)


LANDING_DIY_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dama — Sign in</title>
  <style>
    :root {
      --bg: #0b0f19;
      --panel: #0f1626;
      --text: #e9eefc;
      --muted: #a7b3d6;
      --border: rgba(255,255,255,.10);
      --accent: #ffcc33;
      --accent2: #7c5cff;
      --bad: #ff5c7a;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      color: var(--text);
      background: radial-gradient(1200px 700px at 20% 0%, #1c2a50 0%, var(--bg) 58%) fixed;
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      padding: 1.25rem;
    }
    .card {
      width: 100%; max-width: 420px;
      background: rgba(15, 22, 38, 0.92);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1.75rem 1.5rem 1.5rem;
      box-shadow: 0 24px 48px rgba(0,0,0,.35);
    }
    .brand .name { font-size: 15px; font-weight: 600; letter-spacing: .2px; }
    .brand .sub { font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.4; }
    .hint { font-size: 13px; color: var(--muted); margin: 1rem 0 1.25rem; }
    label { display: block; font-size: 11px; color: var(--muted); margin-bottom: 0.35rem; text-transform: uppercase; letter-spacing: .04em; }
    input {
      width: 100%; padding: 0.65rem 0.75rem; border-radius: 10px;
      border: 1px solid var(--border); background: rgba(12, 18, 32, 0.85); color: var(--text); font-size: 15px;
    }
    input:focus { outline: none; border-color: rgba(124, 92, 255, 0.55); }
    .field { margin-bottom: 0.9rem; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 1.1rem; }
    button {
      cursor: pointer; border: none; border-radius: 10px; padding: 0.65rem 1.1rem;
      font-weight: 600; font-size: 14px;
    }
    .primary { background: var(--accent); color: #0b0f19; flex: 1; min-width: 120px; }
    .ghost { background: rgba(255,255,255,.08); color: var(--text); flex: 1; min-width: 120px; }
    .err { color: var(--bad); font-size: 13px; margin-top: 1rem; min-height: 1.25rem; }
    .foot { margin-top: 1.25rem; font-size: 11px; color: #6b7aad; line-height: 1.45; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <div class="name">Dama — local (AN1+AN2+AN3)</div>
      <div class="sub">RAG over suttas &amp; commentary. Sign in or create an account — credentials stay on this server.</div>
    </div>
    <p class="hint">Use the same username after deploy; chat history is stored per user on the server.</p>
    <div class="field"><label for="user">Username</label><input id="user" type="text" autocomplete="username" maxlength="32" /></div>
    <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" /></div>
    <div class="actions">
      <button type="button" class="primary" id="btnIn">Log in</button>
      <button type="button" class="ghost" id="btnUp">Create account</button>
    </div>
    <div class="err" id="msg"></div>
    <p class="foot">Username: 3–32 characters (letters, digits, <code>_</code> <code>.</code> <code>-</code>). Password: at least 6 characters. For email / Google / reset-password flows, use Firebase (see server docs).</p>
  </div>
  <script>
  (function(){
    var msg = document.getElementById('msg');
    function show(s){ msg.textContent = s || ''; }
    function formatErr(d) {
      if (!d) return 'Request failed';
      var det = d.detail;
      if (typeof det === 'string') return det;
      if (Array.isArray(det))
        return det.map(function (x) { return (x.msg || '') + (x.loc ? ' (' + x.loc.join('.') + ')' : ''); }).join(' ').trim() || JSON.stringify(det);
      return JSON.stringify(det);
    }
    function post(path, body) {
      return fetch(path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) {
          return r.text().then(function (t) {
            var d = {};
            if (t) { try { d = JSON.parse(t); } catch (e) { d = { detail: t.slice(0, 500) }; } }
            return { ok: r.ok, d: d, status: r.status };
          });
        });
    }
    fetch('/api/auth/me', { credentials: 'include' }).then(function(r){
      if (r.ok) window.location.href = '/app';
    });
    function validate(u, p) {
      if (u.length < 3) { show('Username must be at least 3 characters (see rules below).'); return false; }
      if (p.length < 6) { show('Password must be at least 6 characters.'); return false; }
      return true;
    }
    document.getElementById('btnIn').onclick = function(){
      show('');
      var u = document.getElementById('user').value.trim();
      var p = document.getElementById('pw').value;
      if (!validate(u, p)) return;
      post('/api/auth/login', { username: u, password: p }).then(function(x){
        if (!x.ok) { show(formatErr(x.d)); return; }
        window.location.href = '/app';
      }).catch(function(e){ show(String(e)); });
    };
    document.getElementById('btnUp').onclick = function(){
      show('');
      var u = document.getElementById('user').value.trim();
      var p = document.getElementById('pw').value;
      if (!validate(u, p)) return;
      post('/api/auth/register', { username: u, password: p }).then(function(x){
        if (!x.ok) { show(formatErr(x.d)); return; }
        window.location.href = '/app';
      }).catch(function(e){ show(String(e)); });
    };
  })();
  </script>
</body>
</html>
"""

LANDING_FIREBASE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DAMA — Sign in</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #0b0f19; color: #e9eefc; min-height: 100vh; }
    .wrap { max-width: 420px; margin: 0 auto; padding: 3rem 1.25rem; }
    h1 { font-weight: 600; font-size: 1.5rem; margin: 0 0 0.5rem; }
    p.sub { color: #a7b3d6; font-size: 0.9rem; margin: 0 0 1.5rem; }
    label { display: block; font-size: 0.75rem; color: #a7b3d6; margin-bottom: 0.35rem; }
    input { width: 100%; padding: 0.65rem 0.75rem; border-radius: 8px; border: 1px solid rgba(255,255,255,.12); background: #0f1626; color: #e9eefc; font-size: 0.95rem; }
    input:focus { outline: none; border-color: #7c5cff; }
    .field { margin-bottom: 1rem; }
    .row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .row2 { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem; }
    button { cursor: pointer; border: none; border-radius: 8px; padding: 0.65rem 1rem; font-weight: 500; font-size: 0.9rem; }
    .primary { background: #ffcc33; color: #0b0f19; }
    .ghost { background: rgba(255,255,255,.08); color: #e9eefc; }
    .linkish { background: rgba(255,255,255,.06); color: #cfe0ff; }
    .err { color: #ff5c7a; font-size: 0.85rem; margin-top: 1rem; min-height: 1.2rem; }
    .foot { margin-top: 2rem; font-size: 0.8rem; color: #6b7aad; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Dama</h1>
    <p class="sub">AN1, AN2 &amp; AN3 — sign in or create an account</p>
    <div class="field"><label for="em">Email</label><input id="em" type="email" autocomplete="username" /></div>
    <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" /></div>
    <div class="row">
      <button type="button" class="primary" id="btnIn">Log in</button>
      <button type="button" class="ghost" id="btnUp">Create account</button>
    </div>
    <div class="row2">
      <button type="button" class="linkish" id="btnReset">Reset password</button>
      <button type="button" class="linkish" id="btnVerify">Resend verification</button>
      <button type="button" class="ghost" id="btnGoogle">Continue with Google</button>
    </div>
    <div class="err" id="msg"></div>
    <p class="foot">Firebase Authentication (email/password + Google). For LAN testing, add your host to Authentication → Settings → Authorised domains.</p>
  </div>
  <script>
  (function(){
    var msg = document.getElementById('msg');
    function show(s){ msg.textContent = s || ''; }
    fetch('/api/public/firebase_config').then(function(r){return r.json();}).then(function(cfg){
      if (!cfg || !cfg.apiKey) { show('Firebase not configured on server.'); return; }
      firebase.initializeApp(cfg);
      firebase.auth().onAuthStateChanged(function(user){
        if (!user) return;
        // For local/dev, don't block the app behind email verification.
        // Firebase's email verification can be flaky/confusing during localhost iteration.
        window.location.href = '/app';
      });
      document.getElementById('btnIn').onclick = function(){
        show('');
        var e = document.getElementById('em').value.trim();
        var p = document.getElementById('pw').value;
        firebase.auth().signInWithEmailAndPassword(e, p).catch(function(err){ show(err.message || String(err)); });
      };
      document.getElementById('btnUp').onclick = function(){
        show('');
        var e = document.getElementById('em').value.trim();
        var p = document.getElementById('pw').value;
        firebase.auth().createUserWithEmailAndPassword(e, p).then(function(cred){
          try { if (cred && cred.user) cred.user.sendEmailVerification(); } catch (e2) {}
          show('Account created. Verification email sent (optional). Redirecting…');
          // Stay signed-in so the user can proceed immediately.
        }).catch(function(err){ show(err.message || String(err)); });
      };
      document.getElementById('btnReset').onclick = function(){
        show('');
        var e = document.getElementById('em').value.trim();
        if (!e) { show('Enter your email above first.'); return; }
        firebase.auth().sendPasswordResetEmail(e).then(function(){
          show('Password reset email sent.');
        }).catch(function(err){ show(err.message || String(err)); });
      };
      document.getElementById('btnVerify').onclick = function(){
        show('');
        var u = firebase.auth().currentUser;
        if (!u) { show('Log in first, then resend verification.'); return; }
        u.sendEmailVerification().then(function(){ show('Verification email sent.'); })
          .catch(function(err){ show(err.message || String(err)); });
      };
      document.getElementById('btnGoogle').onclick = function(){
        show('');
        try {
          var provider = new firebase.auth.GoogleAuthProvider();
          firebase.auth().signInWithPopup(provider).catch(function(err){ show(err.message || String(err)); });
        } catch (e4) {
          show(String(e4));
        }
      };
    }).catch(function(e){ show(String(e)); });
  })();
  </script>
</body>
</html>
"""


class AuthUserPass(BaseModel):
    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=256)


class ProfilePatch(BaseModel):
    display_name: str = Field(default="", max_length=128)


def _diy_required() -> None:
    if not _diy_on():
        if dama_fb.firebase_enabled():
            raise HTTPException(
                status_code=503,
                detail="This server uses Firebase Auth only (DIY username/password is disabled).",
            )
        raise HTTPException(status_code=503, detail="DIY auth is disabled (set DAMA_DIY_AUTH or unset it for default-on)")


def register_auth_ui_routes(app: FastAPI, base_dir: Path) -> None:
    chat_embed = base_dir / CHAT_EMBED_NAME

    def render_chat_html() -> str:
        raw = chat_embed.read_text(encoding="utf-8")
        return _inject_chat_head(raw)

    def chat_response() -> HTMLResponse:
        return HTMLResponse(
            content=render_chat_html(),
            headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"},
        )

    LANDING_SIGNED_OUT_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dama — Signed out</title>
  <style>
    :root {
      --bg: #0b0f19;
      --panel: rgba(15, 22, 38, 0.92);
      --text: #e9eefc;
      --muted: #a7b3d6;
      --border: rgba(255,255,255,.10);
      --accent: #ffcc33;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      color: var(--text);
      background: radial-gradient(1200px 700px at 20% 0%, #1c2a50 0%, var(--bg) 58%) fixed;
      display: flex; align-items: center; justify-content: center;
      padding: 1.25rem;
    }
    .card {
      width: 100%; max-width: 520px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1.75rem 1.5rem 1.5rem;
      box-shadow: 0 24px 48px rgba(0,0,0,.35);
    }
    h1 { margin: 0 0 6px; font-size: 18px; font-weight: 650; letter-spacing: .2px; }
    p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 1.1rem; }
    a.btn {
      display: inline-block;
      text-decoration: none;
      border-radius: 10px;
      padding: 0.65rem 1.1rem;
      font-weight: 650;
      font-size: 14px;
    }
    .primary { background: var(--accent); color: #0b0f19; }
    .ghost { background: rgba(255,255,255,.08); color: var(--text); }
  </style>
</head>
<body>
  <div class="card">
    <h1>Signed out</h1>
    <p>You’ve been signed out on this browser.</p>
    <div class="actions">
      <a class="btn primary" href="/">Go to home</a>
      <a class="btn ghost" href="/app">Go to app</a>
    </div>
  </div>
</body>
</html>
"""

    @app.post("/api/auth/register")
    def auth_register(request: Request, body: AuthUserPass) -> JSONResponse:
        _diy_required()
        try:
            uid, uname = dama_diy.create_user(base_dir, body.username, body.password)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        request.session["uid"] = uid
        return JSONResponse({"ok": True, "username": uname, "id": uid})

    @app.post("/api/auth/login")
    def auth_login(request: Request, body: AuthUserPass) -> JSONResponse:
        _diy_required()
        try:
            uid, uname = dama_diy.verify_user(base_dir, body.username, body.password)
        except ValueError as e:
            raise HTTPException(status_code=401, detail=str(e)) from e
        request.session["uid"] = uid
        return JSONResponse({"ok": True, "username": uname, "id": uid})

    @app.post("/api/auth/logout")
    def auth_logout(request: Request) -> JSONResponse:
        _diy_required()
        request.session.clear()
        return JSONResponse({"ok": True})

    @app.patch("/api/auth/profile")
    def auth_profile_patch(request: Request, body: ProfilePatch) -> JSONResponse:
        """Update display name (DIY session only; Firebase users set name in Firebase / client)."""
        _diy_required()
        uid = request.session.get("uid")
        if uid is None:
            raise HTTPException(status_code=401, detail="Not logged in")
        try:
            dama_diy.update_display_name(base_dir, int(uid), body.display_name)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        return JSONResponse({"ok": True})

    @app.get("/api/auth/me")
    def auth_me(request: Request, authorization: Optional[str] = Header(default=None)) -> JSONResponse:
        """Bearer (Firebase) when enabled; else session (DIY)."""
        if _firebase_on():
            if not authorization or not authorization.strip().lower().startswith("bearer "):
                raise HTTPException(status_code=401, detail="Authorization Bearer token required")
            tok = authorization.split(" ", 1)[1].strip()
            try:
                claims = dama_fb.decode_id_token(tok)
            except Exception as e:
                raise HTTPException(status_code=401, detail=f"Invalid or expired token: {e}") from e
            uid = str(claims.get("uid") or "").strip()
            email = str(claims.get("email") or "").strip()
            name = str(claims.get("name") or "").strip()
            return JSONResponse(
                {
                    "id": uid,
                    "username": email or name or uid,
                    "display_name": name or None,
                    "email": email or None,
                    "auth": "firebase",
                }
            )
        if _diy_on():
            uid = request.session.get("uid")
            if uid is None:
                raise HTTPException(status_code=401, detail="Not logged in")
            row = dama_diy.get_user_by_id(base_dir, int(uid))
            if row is None:
                request.session.clear()
                raise HTTPException(status_code=401, detail="Invalid session")
            return JSONResponse(
                {
                    "id": row[0],
                    "username": row[1],
                    "display_name": row[2],
                    "auth": "diy",
                }
            )
        raise HTTPException(status_code=503, detail="Authentication not configured")

    if _firebase_on():

        @app.get("/api/public/firebase_config")
        def api_public_firebase_config() -> JSONResponse:
            cfg = dama_fb.web_config_dict()
            allow = ("apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId")
            return JSONResponse({k: cfg[k] for k in allow if k in cfg})

    @app.get("/app")
    def app_chat(request: Request):
        if not _diy_on() and not _firebase_on():
            return RedirectResponse(url="/", status_code=302)
        # For DIY auth, verify session exists before serving the app
        if _diy_on():
            uid = request.session.get("uid")
            if uid is None:
                return RedirectResponse(url="/", status_code=302)
        return chat_response()

    @app.get("/")
    def home(request: Request):
        # If DIY auth is on and user is already logged in, redirect to /app
        if _diy_on():
            uid = request.session.get("uid")
            if uid is not None:
                return RedirectResponse(url="/app", status_code=302)
            return HTMLResponse(
                content=LANDING_DIY_HTML,
                headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"},
            )
        if _firebase_on():
            return HTMLResponse(
                content=LANDING_FIREBASE_HTML,
                headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"},
            )
        return chat_response()

    @app.get("/landing")
    def signed_out_landing(request: Request):
        """Dedicated landing used after sign-out (stable even in open-chat mode)."""
        # If auth is enabled, reuse the normal landing.
        if _diy_on():
            uid = request.session.get("uid")
            if uid is not None:
                # If they're logged in, bounce to the app.
                return RedirectResponse(url="/app", status_code=302)
            return HTMLResponse(
                content=LANDING_DIY_HTML,
                headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"},
            )
        if _firebase_on():
            return HTMLResponse(
                content=LANDING_FIREBASE_HTML,
                headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"},
            )
        # Open chat mode: show a simple "signed out" landing.
        return HTMLResponse(
            content=LANDING_SIGNED_OUT_HTML,
            headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"},
        )


def session_secret() -> str:
    return os.environ.get("DAMA_SESSION_SECRET", "dev-insecure-change-for-production").strip() or "dev-insecure-change-for-production"


def session_https_only() -> bool:
    v = os.environ.get("DAMA_SESSION_HTTPS_ONLY", "").strip().lower()
    if v in ("1", "true", "yes", "on"):
        return True
    if v in ("0", "false", "no", "off"):
        return False
    return os.environ.get("DAMA_RUNTIME", "").strip().lower() in ("cloud", "cloudrun", "production")
