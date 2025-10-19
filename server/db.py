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
            size_bytes INTEGER NOT NULL
        );
        """)
        c.commit()

def insert_signal(created_at:int, method:str, payload_b64:str, meta_json:str, author_hint:str|None, size_bytes:int) -> int:
    with get_conn() as c:
        cur = c.cursor()
        cur.execute(
            "INSERT INTO signals (created_at,method,payload_b64,meta_json,author_hint,size_bytes) VALUES (?,?,?,?,?,?)",
            (created_at, method, payload_b64, meta_json, author_hint, size_bytes)
        )
        c.commit()
        return cur.lastrowid
    
def select_latest(limit:int=50, since_id:int|None=None) -> Iterable[sqlite3.Row]:
    q= "SELECT id, created_at, method, payload_b64, meta_json, author_hint FROM signals"
    params: Tuple[Any,...] = ()
    if since_id is not None:
        q += "WHere id > ?"
        params = (since_id,)
    q+= " ORDER BY id DESC LIMIT ?"
    params = params + (limit,)
    with get_conn() as c:
        return c.execute(q, params).fetchall()
    
def select_random(n:int=10) -> Iterable[sqlite3.Row]:
    with get_conn() as c:
        return c.execute(
            "SELECT id, created_a, method, payload_b64, meta_json, author_hint FROM signals ORDER BY RANDOM() LIMIT ?",
            (n, )
        ).fetchall()