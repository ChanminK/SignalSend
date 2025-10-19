from flask import Flask, request, jsonify
from flask_cors import CORS
import time, base64, json

from db import init_db, insert_signal, select_latest, select_random

app = Flask(__name__)
CORS(app)

MAX_PAYLOAD_LEN = 16_384
ALLOWED_METHODS = {"AES-GCM"}

def is_base64(s: str) -> bool:
    try:
        base64.b64decode(s, validate=True)
        return True
    except Exception:
        return False
    
@app.post("/signals")
def post_signal():
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

        new_id = insert_signal(
            created_at=int(time.time()),
            method=method,
            payload_b64=payload,
            meta_json=meta_json,
            author_hint=author_hint,
            size_bytes=size_bytes
        )
        return jsonify({"id": new_id}), 201
    
@app.get("/signals")
def get_signals():
    try:
        limit = int(request.args.get("limit", 50))
        since_id = request.args.get("since_id")
        since = int(since_id) if since_id is not None else None
    except ValueError:
        return jsonify({"error": "limit and since_id must be integers"}), 400
    
    rows = select_latest(limit=min(max(limit, 1), 200), since_id=since)
    return jsonify([
        {
            "id": r["id"],
            "created_at": r["created_at"],
            "method": r["method"],
            "payload": r["payload_b64"],
            "meta": json.load(r["meta_json"]),
            "author_hint": r["author_hint"]
        } for r in rows
    ])

@app.get("/signals/random")
def get_random():
    try:
        n = int(request.args.get("n", 10))
    except ValueError:
        return jsonify({"error": "n must be an integer"}), 400
    n = min(max(n,1), 50)

    rows = select_random(n)
    return jsonify([
        {
            "id": r["id"],
            "created_at": r["created_at"],
            "method": r["method"],
            "meta": json.loads(r["meta_json"]),
            "author-hint": r["author_hint"]
        } for r in rows
    ])

if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=5000, debug=True)