"""Nursing Media backend — Flask + pluggable storage.

STORAGE (pehla jo mile, wahi use hoga):
  1. Supabase cloud  — env SUPABASE_URL + SUPABASE_KEY (service_role key),
                       ya backend/config.json me {"SUPABASE_URL":..,"SUPABASE_KEY":..}
                       → Vercel + hamesha-on hosting ke liye (data kabhi delete nahi hota)
  2. SQLite local    — backend/site.db (sirf Termux testing ke liye;
                       Vercel par ye file har deploy par wipe ho jati hai!)

Run:  python3 backend/app.py   → http://127.0.0.1:8099
"""
import json
import os
import re
import secrets
import sqlite3
import urllib.parse
import urllib.request

from flask import Flask, jsonify, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

BASE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(BASE)
SQLITE_DB = os.path.join(BASE, "site.db")

app = Flask(__name__)

SECRET_FILE = os.path.join(BASE, ".secret")
app.secret_key = os.environ.get("SECRET_KEY", "")
if not app.secret_key:
    if os.path.exists(SECRET_FILE):
        with open(SECRET_FILE) as f:
            app.secret_key = f.read().strip()
    else:
        app.secret_key = secrets.token_hex(32)
        try:
            with open(SECRET_FILE, "w") as f:
                f.write(app.secret_key)
        except OSError:
            pass  # Vercel read-only FS — SECRET_KEY env se aayega

ADMIN_PHONE = "9928096797"
ADMIN_PASS = "admin123"   # <-- pehle login ke baad admin panel se BADAL LENA


# ================= storage layer =================
class SQLiteStore:
    def __init__(self):
        fresh = not os.path.exists(SQLITE_DB)
        self.con = sqlite3.connect(SQLITE_DB, check_same_thread=False)
        self.con.row_factory = sqlite3.Row
        self.con.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS subjects (
                sem INTEGER NOT NULL,
                sub_id TEXT NOT NULL,
                name TEXT NOT NULL,
                icon TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (sem, sub_id)
            );
            CREATE TABLE IF NOT EXISTS topics (
                sem INTEGER NOT NULL,
                sub_id TEXT NOT NULL,
                topic_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                pdf TEXT NOT NULL DEFAULT '',
                video TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (sem, sub_id, topic_id)
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            );
        """)
        self.con.commit()
        if fresh:
            self._seed_from_json()
        if not self.con.execute("SELECT id FROM users WHERE phone=?", (ADMIN_PHONE,)).fetchone():
            self.con.execute(
                "INSERT INTO users (name, phone, password_hash, is_admin) VALUES (?,?,?,1)",
                ("Site Admin", ADMIN_PHONE, generate_password_hash(ADMIN_PASS)))
            self.con.commit()

    def _seed_from_json(self):
        site = json.load(open(os.path.join(SITE, "data", "site.json"), encoding="utf-8"))
        self.set_settings({"course": site.get("course", ""), "tagline": site.get("tagline", ""),
                           "owner_name": site["owner"].get("name", ""),
                           "owner_phone": site["owner"].get("phone", "")})
        for sem in site.get("semesters", [1, 2, 3, 4, 5, 6]):
            d = json.load(open(os.path.join(SITE, "data", f"sem{sem}.json"), encoding="utf-8"))
            for s in d["subjects"]:
                self.con.execute("INSERT OR REPLACE INTO subjects VALUES (?,?,?,?)",
                                 (sem, s["id"], s["name"], s.get("icon", "")))
                for t in s["topics"]:
                    self.con.execute("INSERT OR REPLACE INTO topics VALUES (?,?,?,?,?,?,?)",
                                     (sem, s["id"], t["id"], t["title"], t.get("content", ""),
                                      t.get("pdf", ""), t.get("video", "")))
        self.con.commit()

    # -- users --
    def get_user_by_id(self, uid):
        r = self.con.execute(
            "SELECT id, name, phone, is_admin, created_at FROM users WHERE id=?", (uid,)).fetchone()
        return dict(r) if r else None

    def get_user_full(self, phone):
        r = self.con.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
        return dict(r) if r else None

    def create_user(self, name, phone, pw_hash, is_admin=False):
        try:
            cur = self.con.execute(
                "INSERT INTO users (name, phone, password_hash, is_admin) VALUES (?,?,?,?)",
                (name, phone, pw_hash, 1 if is_admin else 0))
            self.con.commit()
            return cur.lastrowid
        except sqlite3.IntegrityError:
            return None

    def delete_user(self, uid):
        self.con.execute("DELETE FROM users WHERE id=? AND is_admin=0", (uid,))
        self.con.commit()

    def list_users(self):
        return [dict(r) for r in self.con.execute(
            "SELECT id, name, phone, is_admin, created_at FROM users ORDER BY id DESC")]

    def set_password(self, uid, pw_hash):
        self.con.execute("UPDATE users SET password_hash=? WHERE id=?", (pw_hash, uid))
        self.con.commit()

    # -- content --
    def semesters(self):
        rows = self.con.execute("SELECT DISTINCT sem FROM subjects ORDER BY sem").fetchall()
        return [r[0] for r in rows] or [1, 2, 3, 4, 5, 6]

    def list_subjects(self, sem):
        out = []
        for s in self.con.execute(
                "SELECT sub_id, name, icon FROM subjects WHERE sem=? ORDER BY rowid", (sem,)):
            n = self.con.execute("SELECT COUNT(*) c FROM topics WHERE sem=? AND sub_id=?",
                                 (sem, s["sub_id"])).fetchone()["c"]
            out.append({"id": s["sub_id"], "name": s["name"], "icon": s["icon"], "topics": n})
        return out

    def update_subject(self, sem, sub_id, name, icon):
        self.con.execute("UPDATE subjects SET name=?, icon=? WHERE sem=? AND sub_id=?",
                         (name, icon, sem, sub_id))
        self.con.commit()

    def list_topics(self, sem, sub):
        return [dict(r) for r in self.con.execute(
            "SELECT topic_id AS id, title, content, pdf, video FROM topics "
            "WHERE sem=? AND sub_id=? ORDER BY topic_id", (sem, sub))]

    def update_topic(self, sem, sub, tid, title, content, pdf, video):
        self.con.execute(
            "UPDATE topics SET title=?, content=?, pdf=?, video=? WHERE sem=? AND sub_id=? AND topic_id=?",
            (title, content, pdf, video, sem, sub, tid))
        self.con.commit()

    def counts(self):
        u = self.con.execute("SELECT COUNT(*) c FROM users WHERE is_admin=0").fetchone()["c"]
        t = self.con.execute("SELECT COUNT(*) c FROM topics").fetchone()["c"]
        f = self.con.execute("SELECT COUNT(*) c FROM topics WHERE TRIM(content) != ''").fetchone()["c"]
        return u, t, f

    # -- settings --
    def get_settings(self):
        return {r["key"]: r["value"] for r in self.con.execute("SELECT key, value FROM settings")}

    def set_settings(self, d):
        for k, v in d.items():
            self.con.execute("INSERT OR REPLACE INTO settings VALUES (?,?)", (k, v))
        self.con.commit()


class SupabaseStore:
    """Supabase PostgREST (urllib, zero-dependency). Tables: users, subjects, topics, settings."""

    def __init__(self, url, key):
        self.url = url.rstrip("/")
        self.key = key

    def _req(self, method, table, params=None, body=None, prefer=None):
        qs = ("?" + urllib.parse.urlencode(params)) if params else ""
        req = urllib.request.Request(f"{self.url}/rest/v1/{table}{qs}", method=method)
        req.add_header("apikey", self.key)
        req.add_header("Authorization", f"Bearer {self.key}")
        req.add_header("Content-Type", "application/json")
        if prefer:
            req.add_header("Prefer", prefer)
        data = json.dumps(body).encode() if body is not None else None
        try:
            with urllib.request.urlopen(req, data=data, timeout=20) as r:
                raw = r.read().decode()
                return json.loads(raw) if raw else []
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Supabase {e.code}: {e.read().decode()[:200]}")

    # -- users --
    def get_user_by_id(self, uid):
        rows = self._req("GET", "users", {"select": "id,name,phone,is_admin,created_at", "id": f"eq.{uid}"})
        return rows[0] if rows else None

    def get_user_full(self, phone):
        rows = self._req("GET", "users", {"select": "*", "phone": f"eq.{phone}"})
        return rows[0] if rows else None

    def create_user(self, name, phone, pw_hash, is_admin=False):
        try:
            rows = self._req("POST", "users",
                             {"select": "id"},
                             {"name": name, "phone": phone,
                              "password_hash": pw_hash, "is_admin": is_admin},
                             prefer="return=representation")
        except RuntimeError as e:
            if "409" in str(e) or "duplicate" in str(e).lower():
                return None
            raise
        return rows[0]["id"] if rows else None

    def delete_user(self, uid):
        self._req("DELETE", "users", {"id": f"eq.{uid}", "is_admin": "eq.false"})

    def list_users(self):
        return self._req("GET", "users",
                         {"select": "id,name,phone,is_admin,created_at", "order": "id.desc"})

    def set_password(self, uid, pw_hash):
        self._req("PATCH", "users", {"id": f"eq.{uid}"}, {"password_hash": pw_hash})

    # -- content --
    def semesters(self):
        rows = self._req("GET", "subjects", {"select": "sem", "order": "sem"})
        seen = sorted({r["sem"] for r in rows})
        return seen or [1, 2, 3, 4, 5, 6]

    def list_subjects(self, sem):
        subs = self._req("GET", "subjects",
                         {"select": "sub_id,name,icon", "sem": f"eq.{sem}", "order": "sub_id"})
        out = []
        for s in subs:
            n = self._req("GET", "topics",
                          {"select": "topic_id", "sem": f"eq.{sem}", "sub_id": f"eq.{s['sub_id']}"})
            out.append({"id": s["sub_id"], "name": s["name"], "icon": s.get("icon", ""),
                        "topics": len(n)})
        return out

    def update_subject(self, sem, sub_id, name, icon):
        self._req("PATCH", "subjects", {"sem": f"eq.{sem}", "sub_id": f"eq.{sub_id}"},
                  {"name": name, "icon": icon})

    def list_topics(self, sem, sub):
        rows = self._req("GET", "topics",
                         {"select": "topic_id,title,content,pdf,video",
                          "sem": f"eq.{sem}", "sub_id": f"eq.{sub}", "order": "topic_id"})
        return [{"id": r["topic_id"], "title": r["title"], "content": r.get("content") or "",
                 "pdf": r.get("pdf") or "", "video": r.get("video") or ""} for r in rows]

    def update_topic(self, sem, sub, tid, title, content, pdf, video):
        self._req("PATCH", "topics",
                  {"sem": f"eq.{sem}", "sub_id": f"eq.{sub}", "topic_id": f"eq.{tid}"},
                  {"title": title, "content": content, "pdf": pdf, "video": video})

    def counts(self):
        users = self._req("GET", "users", {"select": "id", "is_admin": "eq.false"})
        topics = self._req("GET", "topics", {"select": "topic_id,content"})
        filled = sum(1 for t in topics if (t.get("content") or "").strip())
        return len(users), len(topics), filled

    # -- settings --
    def get_settings(self):
        return {r["key"]: r["value"] for r in self._req("GET", "settings", {"select": "key,value"})}

    def set_settings(self, d):
        for k, v in d.items():
            self._req("POST", "settings", {"on_conflict": "key"},
                      {"key": k, "value": v}, prefer="resolution=merge-duplicates")

    def ensure_admin(self, phone, pw_hash, name="Site Admin"):
        if not self.get_user_full(phone):
            self.create_user(name, phone, pw_hash, is_admin=True)

    def seed_if_empty(self):
        rows = self._req("GET", "topics", {"select": "topic_id", "limit": "1"})
        if rows:
            return
        site = json.load(open(os.path.join(SITE, "data", "site.json"), encoding="utf-8"))
        self.set_settings({"course": site.get("course", ""), "tagline": site.get("tagline", ""),
                           "owner_name": site["owner"].get("name", ""),
                           "owner_phone": site["owner"].get("phone", "")})
        subs, tops = [], []
        for sem in site.get("semesters", [1, 2, 3, 4, 5, 6]):
            d = json.load(open(os.path.join(SITE, "data", f"sem{sem}.json"), encoding="utf-8"))
            for s in d["subjects"]:
                subs.append({"sem": sem, "sub_id": s["id"], "name": s["name"], "icon": s.get("icon", "")})
                for t in s["topics"]:
                    tops.append({"sem": sem, "sub_id": s["id"], "topic_id": t["id"],
                                 "title": t["title"], "content": t.get("content", ""),
                                 "pdf": t.get("pdf", ""), "video": t.get("video", "")})
        self._req("POST", "subjects", {}, subs)
        for i in range(0, len(tops), 100):
            self._req("POST", "topics", {}, tops[i:i + 100])


def load_config():
    cfg = {}
    cfile = os.path.join(BASE, "config.json")
    if os.path.exists(cfile):
        try:
            cfg = json.load(open(cfile, encoding="utf-8"))
        except Exception:
            pass
    return {
        "SUPABASE_URL": os.environ.get("SUPABASE_URL", cfg.get("SUPABASE_URL", "")),
        "SUPABASE_KEY": os.environ.get("SUPABASE_KEY", cfg.get("SUPABASE_KEY", "")),
    }


_cfg = load_config()
if _cfg["SUPABASE_URL"] and _cfg["SUPABASE_KEY"]:
    store = SupabaseStore(_cfg["SUPABASE_URL"], _cfg["SUPABASE_KEY"])
    store.seed_if_empty()
    store.ensure_admin(ADMIN_PHONE, generate_password_hash(ADMIN_PASS))
    print("Storage: Supabase cloud (data kabhi delete nahi hoga)")
else:
    store = SQLiteStore()
    print("Storage: SQLite local (Vercel par wipe ho jayega — Supabase lagao)")


# ================= helpers =================
def current_user():
    uid = session.get("uid")
    return store.get_user_by_id(uid) if uid else None


def login_required(fn):
    from functools import wraps

    @wraps(fn)
    def wrapper(*a, **kw):
        if not current_user():
            return jsonify({"ok": False, "error": "Login required"}), 401
        return fn(*a, **kw)

    return wrapper


def admin_required(fn):
    from functools import wraps

    @wraps(fn)
    def wrapper(*a, **kw):
        u = current_user()
        if not u or not u.get("is_admin"):
            return jsonify({"ok": False, "error": "Admin only"}), 403
        return fn(*a, **kw)

    return wrapper


def valid_phone(phone):
    digits = re.sub(r"\D", "", phone or "")[-10:]
    return digits if re.fullmatch(r"[6-9]\d{9}", digits) else None


# ================= static site =================
@app.route("/")
def home():
    return send_from_directory(SITE, "index.html")


@app.route("/<path:path>")
def static_files(path):
    if path.startswith("api/"):
        return jsonify({"ok": False, "error": "Not found"}), 404
    full = os.path.join(SITE, path)
    if os.path.isdir(full):
        path = os.path.join(path, "index.html")
    return send_from_directory(SITE, path)


# ================= site data =================
@app.route("/data/site.json")
def site_json():
    s = store.get_settings()
    return jsonify({
        "course": s.get("course", "BSc Nursing"),
        "tagline": s.get("tagline", ""),
        "owner": {"name": s.get("owner_name", ""), "phone": s.get("owner_phone", ""),
                  "role": "Site Owner"},
        "theme": "editorial",
        "semesters": store.semesters(),
    })


@app.route("/data/sem<int:sem>.json")
def sem_json(sem):
    subs = store.list_subjects(sem)
    out = []
    for x in subs:
        out.append({"id": x["id"], "name": x["name"], "icon": x.get("icon", ""),
                    "topics": store.list_topics(sem, x["id"])})
    return jsonify({"sem": sem, "title": f"Semester {sem}", "subjects": out})


# ================= auth =================
@app.route("/api/register", methods=["POST"])
def register():
    d = request.get_json(force=True, silent=True) or {}
    name = (d.get("name") or "").strip()
    phone = valid_phone(d.get("phone"))
    password = d.get("password") or ""
    if len(name) < 2:
        return jsonify({"ok": False, "error": "Naam likho"}), 400
    if not phone:
        return jsonify({"ok": False, "error": "Sahi 10-digit mobile number likho"}), 400
    if len(password) < 4:
        return jsonify({"ok": False, "error": "Password kam se kam 4 akshar"}), 400
    uid = store.create_user(name, phone, generate_password_hash(password))
    if not uid:
        return jsonify({"ok": False, "error": "Ye number pehle se registered hai — login karo"}), 400
    session["uid"] = uid
    return jsonify({"ok": True, "user": store.get_user_by_id(uid)})


@app.route("/api/login", methods=["POST"])
def login():
    d = request.get_json(force=True, silent=True) or {}
    phone = valid_phone(d.get("phone"))
    password = d.get("password") or ""
    if not phone:
        return jsonify({"ok": False, "error": "Sahi mobile number likho"}), 400
    row = store.get_user_full(phone)
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"ok": False, "error": "Number ya password galat hai"}), 401
    session["uid"] = row["id"]
    return jsonify({"ok": True, "user": store.get_user_by_id(row["id"])})


@app.route("/api/logout", methods=["POST"])
def logout():
    session.pop("uid", None)
    return jsonify({"ok": True})


@app.route("/api/me")
def me():
    return jsonify({"ok": True, "user": current_user()})


# ================= admin =================
@app.route("/api/admin/stats")
@admin_required
def admin_stats():
    u, t, f = store.counts()
    return jsonify({"ok": True, "users": u, "topics": t, "filled": f, "leads": 0})


@app.route("/api/admin/users")
@admin_required
def admin_users():
    return jsonify({"ok": True, "users": store.list_users()})


@app.route("/api/admin/users/<int:uid>", methods=["DELETE"])
@admin_required
def admin_delete_user(uid):
    if uid == current_user()["id"]:
        return jsonify({"ok": False, "error": "Khud ko delete nahi kar sakte"}), 400
    store.delete_user(uid)
    return jsonify({"ok": True})


@app.route("/api/admin/subjects/<int:sem>")
@admin_required
def admin_subjects(sem):
    return jsonify({"ok": True, "subjects": store.list_subjects(sem)})


@app.route("/api/admin/subject", methods=["PUT"])
@admin_required
def admin_update_subject():
    d = request.get_json(force=True, silent=True) or {}
    store.update_subject(d.get("sem"), d.get("id"), d.get("name", ""), d.get("icon", ""))
    return jsonify({"ok": True})


@app.route("/api/admin/topics")
@admin_required
def admin_topics():
    return jsonify({"ok": True, "topics": store.list_topics(
        request.args.get("sem", type=int), request.args.get("sub", ""))})


@app.route("/api/admin/topic", methods=["PUT"])
@admin_required
def admin_update_topic():
    d = request.get_json(force=True, silent=True) or {}
    store.update_topic(d.get("sem"), d.get("sub"), d.get("id"), d.get("title", ""),
                       d.get("content", ""), d.get("pdf", ""), d.get("video", ""))
    return jsonify({"ok": True})


@app.route("/api/admin/settings", methods=["GET", "PUT"])
@admin_required
def admin_settings():
    if request.method == "PUT":
        d = request.get_json(force=True, silent=True) or {}
        store.set_settings({k: d[k] for k in ("course", "tagline", "owner_name", "owner_phone") if k in d})
    return jsonify({"ok": True, "settings": store.get_settings()})


@app.route("/api/admin/password", methods=["PUT"])
@admin_required
def admin_password():
    d = request.get_json(force=True, silent=True) or {}
    if len(d.get("password") or "") < 4:
        return jsonify({"ok": False, "error": "Password kam se kam 4 akshar"}), 400
    store.set_password(current_user()["id"], generate_password_hash(d["password"]))
    return jsonify({"ok": True})


if __name__ == "__main__":
    print("Nursing Media backend ready → http://127.0.0.1:8099")
    print(f"Admin login: {ADMIN_PHONE} / {ADMIN_PASS}  (login ke baad password badal lena)")
    app.run(host="127.0.0.1", port=8099)
