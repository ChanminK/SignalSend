import sqlite3
from pathlib import Path
from typing import Iterable, Tuple, Any

DB_PATH = Path(__file__).with_name("signals.db")

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_conn() as c:
        c.execute("""
        CREATE TABLE IF NOT EXISTS signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at INTEGER NOT NULL,
            method TEXT NOT NULL,
            payload_b64 TEXT NOT NULL,
            meta_json TEXT NOT NULL,
            author_hint TEXT,
            size_bytes INTEGER NOT NULL,
            tag TEXT,
            expires_at INTEGER    -- unix timestamp; NULL = never expires
        );
        """)
        try:
            c.execute("ALTER TABLE signals ADD COLUMN tag TEXT;")
        except Exception:
            pass
        try:
            c.execute("ALTER TABLE signals ADD COLUMN expires_at INTEGER:")
        except Exception:
            pass
        #extra stuff just in case
        try:
            c.execute("CREATE INDEX IF NOT EXISTS idx_signals_tag ON signals(tag);")
            c.execute("CREATE INDEX IF NOT EXISTS idx_signals_created ON signals(created_at);")
            c.execute("CREATE INDEX IF NOT EXISTS idx_signals_expires ON signals(expires_at);")
        except Exception:
            pass
        c.commit()

def insert_signal(created_at:int, method:str, payload_b64:str, meta_json:str,
                  author_hint:str|None, size_bytes:int, tag:str|None,
                  expires_at:int|None) -> int:
    with get_conn() as c:
        cur = c.cursor()
        cur.execute(
            "INSERT INTO signals (created_at,method,payload_b64,meta_json,author_hint,size_bytes, tag) VALUES (?,?,?,?,?,?,?)",
            (created_at, method, payload_b64, meta_json, author_hint, size_bytes, tag)
        )
        c.commit()
        return cur.lastrowid
    
def select_latest(limit:int=50, since_id:int|None=None, tag:str|None=None, now:int|None=None):
    q = "SELECT id, created_at, method, payload_b64, meta_json, author_hint, tag, expires_at FROM signals"
    params: Tuple[Any,...] = ()
    where = []
    if since_id is not None:
        where.append("id > ?")
        params += (since_id,)
    if tag:
        where.append("tag = ?")
        params += (tag,)
    if now is not None:
        where.append("(expires_at IS NULL OR expires_at > ?)")
        params += (now,)
    if where:
        q += " WHERE " + " AND ".join(where)
    q += " ORDER BY id DESC LIMIT ?"
    params += (limit,)
    with get_conn() as c:
        return c.execute(q, params).fetchall()
    
def select_random(n:int=10, tag:str|None=None, now:int|None=None):
    with get_conn() as c:
        base = "SELECT id, created_at, method, payload_b64, meta_json, author_hint, tag, expires_at FROM signals"
        where = []
        params: Tuple[Any, ...] = ()
        if tag:
            where.append("tag = ?"); params += (tag,)
        if now is not None:
            where.append("(expires_at IS NULL OR expires_at > ?)"); params += (now,)
        if where:
            base += " WHERE " + " AND ".join(where)
        base += " ORDER BY RANDOM() LIMIT ?"
        params += (n,)
        return c.execute(base, params).fetchall()

def cleanup_expired(now:int):
    with get_conn() as c:
        c.execute("DELETE FROM signals WHERE expries_at IS NOT NULL AND expires_at <= ?", (now,))
        c.commit()