from flask import Flask, request, jsonify
from flask_cors import CORS
import time, base64, json
import os
from db import init_db, insert_signal, select_latest, select_random

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)

from flask_cors import CORS
CORS(app, resources={r"/*": {"origins": [
    "http://127.0.0.1:8080",
    "http://localhost:8080",
    "https://your-frontend.vercel.app"
]}})

from collections import deque, defaultdict
from time import time as now

RATE_WINDOW_SEC = 60
RATE_MAX_POSTS = 30

_ip_hits = defaultdict(deque)

def too_many_posts(ip: str) -> bool:
    q = _ip_hits[ip]
    t = now()
    # prune old timestamps
    while q and t - q[0] > RATE_WINDOW_SEC:
        q.popleft()
    if len(q) >= RATE_MAX_POSTS:
        return True
    q.append(t)
    return False

app = Flask(__name__)
CORS(app)

MAX_PAYLOAD_LEN = 16_384
ALLOWED_METHODS = {"AES-GCM", "VIGENERE"}

def is_base64(s: str) -> bool:
    try:
        base64.b64decode(s, validate=True)
        return True
    except Exception:
        return False
    
@app.post("/signals")
def post_signal():
    ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "?"
    if too_many_posts(ip):
       return jsonify({"error": "rate limit: too many posts"}), 429
    data = request.get_json(silent = True)
    if not data:
        return jsonify({"error": "JSON body required"}), 400
    
    method =  data.get("method")
    payload = data.get("payload")
    meta= data.get("meta") or {}
    author_hint = data.get("author_hint")

    if method not in ALLOWED_METHODS:
        return jsonify({"error" : f"Unsupported method. Allowed: {sorted(ALLOWED_METHODS)}"}), 400

    if not isinstance(payload, str) or len(payload) == 0 or len(payload) >  MAX_PAYLOAD_LEN:
        return jsonify({"error": "payload must be base64 string <=16KB"}), 400
    if not is_base64(payload):
        return jsonify({"error": "payload must be valid base64"}), 400
    
    #AES-GCM NEED iv + salt
    if method == "AES-GCM":
        if not isinstance(meta, dict) or "iv" not in meta or "salt" not in meta:
            return jsonify({"error": "meta.iv and meta.salt required for AES-GCM"}), 400
        if not (isinstance(meta["iv"], str) and is_base64(meta["iv"])):
            return jsonify({"error": "meta.iv must be base64"}), 400
        if not (isinstance(meta["salt"], str) and is_base64(meta["salt"])):
            return jsonify({"error": "meta.salt must be base64"}), 400
        
    meta_json = json.dumps(meta)
    size_bytes = len(payload.encode("utf-8"))
    tag = meta.get("tag")
    if tag is not None:
        if not isinstance(tag, str) or len(tag) > 64:
            return jsonify({"error": "meta.tag must be a string up to 64 chars"}), 400

    # Getting TTL handled
    expires_at = None
    ttl_days = meta.get("ttl_days")
    if ttl_days is not None:
        try:
            ttl_days = int(ttl_days)
            if ttl_days < 1 or ttl_days > 365:
                raise ValueError()
            expires_at = int(time.time()) + ttl_days * 86400
        except Exception:
            return jsonify({"error": "meta.ttl_days must be an integer between 1 and 365"}), 400

    new_id = insert_signal(
        created_at=int(time.time()),
        method=method,
        payload_b64=payload,
        meta_json=meta_json,
        author_hint=author_hint,
        size_bytes=size_bytes,
        tag=tag,
        expires_at=expires_at
    )
    return jsonify({"id": new_id}), 201
    
@app.get("/signals")
def get_signals():
    try:
        limit = int(request.args.get("limit", 50))
        since_id = request.args.get("since_id")
        since = int(since_id) if since_id is not None else None
        tag = request.args.get("tag")
    except ValueError:
        return jsonify({"error": "limit and since_id must be integers"}), 400
    
    now = int(time.time())
    rows = select_latest(limit=min(max(limit, 1), 200), since_id=since, tag=tag, now = now)
    return jsonify([
        {
            "id": r["id"],
            "created_at": r["created_at"],
            "method": r["method"],
            "payload": r["payload_b64"],
            "meta": json.loads(r["meta_json"]),
            "author_hint": r["author_hint"],
            "tag": r["tag"],
            "expires_at": r["expires_at"]
        } for r in rows
    ])

@app.get("/signals/random")
def get_random():
    try:
        n = int(request.args.get("n", 10))
    except ValueError:
        return jsonify({"error": "n must be an integer"}), 400
    n = min(max(n,1), 50)
    tag = request.args.get("tag")

    now = int(time.time())
    rows = select_random(n, tag=tag, now=now)
    return jsonify([
        {
            "id": r["id"],
            "created_at": r["created_at"],
            "method": r["method"],
            "payload": r["payload_b64"],
            "meta": json.loads(r["meta_json"]),
            "author_hint": r["author_hint"],
            "tag": r["tag"], 
            "expires_at": r["expires_at"]
        } for r in rows
    ])

if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=5000, debug=True)