// AES-GCM LETS DO THIS

const b64 = {
    encode: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
    decode: (b64str) => Uint8Array.from(atob(b64str), c => c.charCodeAt(0))
};

const byId = (id) => document.getElementById(id);

// VIGENERE HELPERS
const ALPH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const cleanAlpha = s => (s || "").toUpperCase().replace(/[^A-Z]/g, "");
function vigEnc(plaintext, key) {
    const pt = cleanAlpha(plaintext), k = cleanAlpha(key);
    if (!k) throw new Error("Key required for Vigenère");
    let out = "";
    for (let i = 0; i < pt.length; i++) {
        const p = ALPH.indexOf(pt[i]);
        const shift = ALPH.indexOf(k[i % k.length]);
        out += ALPH[(p + shift) % 26];
    }
    return out;
}

function vigDec(cipher, key) {
  const ct = cleanAlpha(cipher), k = cleanAlpha(key);
  if (!k) throw new Error("Key required for Vigenère");
  let out = "";
  for (let i = 0; i < ct.length; i++) {
    const c = ALPH.indexOf(ct[i]);
    const shift = ALPH.indexOf(k[i % k.length]);
    out += ALPH[(c - shift + 26) % 26];
  }
  return out;
} 

async function deriveKeyPBKDF2(passphrase, saltBytes) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw", enc.encode(passphrase), {name: "PBKDF2"}, false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: saltBytes, iterations: 200000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256},
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptWithPassphrase(passphrase, plaintext) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKeyPBKDF2(passphrase, salt);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
    return {
        payload: b64.encode(ct),
        meta: { salt: b64.encode(salt), iv: b64.encode(iv)}
    };
}

async function decryptWithPassphrase(passphrase, payloadB64, meta) {
    const salt = b64.decode(meta.salt);
    const iv = b64.decode(meta.iv);
    const key = await deriveKeyPBKDF2(passphrase, salt);
    const ct = b64.decode(payloadB64);
    const ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(ptBuf);
}

function renderSignalCard(sig) {
    const div= document.createElement("div");
    div.className = "signal";
    const ts = new Date(sig.created_at * 1000).toISOString();
    div.innerHTML = `
        <div class="meta">
            #${sig.id} • ${ts} • method=${sig.method} • author=${sig.author_hint ?? "?"}
            ${sig.tag ? `• tag=${sig.tag}` : ``}
            ${sig.expires_at ? `• expires=${new Date(sig.expires_at*1000).toISOString()}` : ``}
        </div>
        <details>
            <summary>ciphertext (base64)</summary>
            <pre class="ct">${sig.payload}</pre>
            <button class="copy-ct">Copy ciphertext</button>
        </details>
        <details>
            <summary>meta</summary>
            <pre class="meta-json">${JSON.stringify(sig.meta, null, 2)}</pre>
            <button class="copy-meta">Copy meta</button>
        </details>
        <div style="margin-top:8px;">
            <input type="password" placeholder="Try passphrase..." class="pp" />
            <button class="try-dec">Try decrypt</button>
        </div>
        <pre class="dec-result"></pre>
    `;

    const copy = (text) => navigator.clipboard?.writeText(text);
    div.querySelector(".copy-ct").onclick = () => copy(div.querySelector(".ct").textContent);
    div.querySelector(".copy-meta").onclick = () => copy(div.querySelector(".meta-json").textContent);

    const btn = div.querySelector(".try-dec");
    const pp = div.querySelector(".pp");
    const result = div.querySelector(".dec-result");
    btn.onclick = async () => {
    result.textContent = "Decrypting...";
    try {
        let text;
        if (sig.method === "AES-GCM") {
            text = await decryptWithPassphrase(pp.value, sig.payload, sig.meta);
        } else if (sig.method === "VIGENERE") {
            const cipher = atob(sig.payload);
            text = vigDec(cipher, pp.value);
        } else {
            throw new Error(`Unsupported method: ${sig.method}`);
        }
        result.textContent = text;
        } catch {
            result.textContent = "Failed to decrypt (wrong passphrase or corrupted data).";
        }
    };
    return div;
}

let lastSeenId = null;
const latestBox = byId("latest");

async function loadLatest(initial = false) {
    const tag = (byId("latestFilterTag")?.value || "").trim();
    const params = new URLSearchParams();
    params.set("limit", "50");
    if (lastSeenId && !initial) params.set("since_id", String(lastSeenId));
    if (tag) params.set("tag", tag);

    try {
        const res=await fetch(`${window.API_BASE}/signals?` + params.toString());
        const items = await res.json();
        if (!Array.isArray(items)) throw new Error("Bad response");

        if(items.length === 0) {
            if (initial && !latestBox.hasChildNodes()) {
                latestBox.innerHTML = `<div class="meta">No signals yet${tag ? ` for tag "${tag}"` : ""}.</div>`;
            }
            return;
        }

        const maxId = Math.max(...items.map(x => x.id));
        if (!lastSeenId || maxId > lastSeenId) lastSeenId = maxId;

        items.reverse().forEach(sig => {
            const card = renderSignalCard(sig);
            latestBox.prepend(card);
        });
    } catch (e) {
        console.error(e);
        if (initial && !latestBox.hasChildNodes()) {
            latestBox.innerHTML = `<div class="meta">Failed to load latest: ${e.message}</div>`;
        }
    }
}

byId("btn-latest").onclick = async () => {
    await loadLatest(true);
};

let autoTimer = null;
byId("latestAuto").onchange = (e) => {
    if (e.target.checked) {
        loadLatest(true);
        autoTimer = setInterval(() => loadLatest(false), 15000);
    } else if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = null;
    }
};

loadLatest(true);

//UI TIME NOW

byId("btn-post").onclick = async () => {
    const text = byId("plaintext").value.trim();
    const pass = byId("passphrase").value;
    const author = (byId("author").value || "anon").trim();
    const mode = byId("mode").value;
    const tag = (byId("tag")?.value || "").trim();
    const ttlStr = (byId("ttl")?.value || "").trim();
    const out = byId("post-result");

    if(!text || !pass) {
        out.textContent = "Please provide plaintext and passphrase.";
        return;
    }
    try {
        let body;
        if (mode === "AES-GCM") {
            const { payload, meta } = await encryptWithPassphrase(pass, text);
            if (tag) meta.tag = tag;
            if (ttlStr) meta.ttl_days = parseInt(ttlStr, 10);
            body = { method: "AES-GCM", payload, meta, author_hint: author };
        } else if (mode === "VIGENERE") {
            const cipher = vigEnc(text, pass);     // letters-only
            const payload = btoa(cipher);          // base64 for transport
            const meta = {};
            if (tag) meta.tag = tag;
            if (ttlStr) meta.ttl_days = parseInt(ttlStr, 10);
            body = { method: "VIGENERE", payload, meta, author_hint: author };
        } else {
            throw new Error(`Unsupported mode: ${mode}`);
        }
        
        const res = await fetch(`${window.API_BASE}/signals`, {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify(body)
        });
        const js = await res.json();
        if (!res.ok) throw new Error(js.error || res.statusText);
        out.textContent = `Posted! id=${js.id}`;
        byId("plaintext").value="";
    } catch (e) {
        out.textContent = `Error: ${e.message}`;
    }
};

byId("btn-fetch").onclick = async () => {
    const container = byId("signals");
    container.innerHTML = "";
    const tag = (byId("filterTag")?.value || "").trim();
    const qs = tag ? `?n=10&tag=${encodeURIComponent(tag)}` : `?n=10`;   
    const res = await fetch(`${window.API_BASE}/signals/random${qs}`);
    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) {
        container.innerHTML = `<div class="meta">No signals found${tag ? ` for tag "${tag}"` : ""}.</div>`;
        return;
    }
    list.forEach(sig => {
        const div = document.createElement("div");
        div.className = "signal";
        const ts = new Date(sig.created_at * 1000).toISOString();
        div.innerHTML = `
            <div class="meta">
                #${sig.id} • ${ts} • method=${sig.method} • author=${sig.author_hint ?? "?"}
                ${sig.tag ? `• tag=${sig.tag}` : ``}
                ${sig.expires_at ? `• expires=${new Date(sig.expires_at*1000).toISOString()}` : ``}
            </div>
            <details>
                <summary>ciphertext (base64)</summary>
                <pre class="ct">${sig.payload}</pre>
                <button class="copy-ct">Copy ciphertext</button>
            </details>
            <details>
                <summary>meta</summary>
                <pre class = "meta-json">${JSON.stringify(sig.meta, null, 2)}</pre>
                <button class="copy-meta">Copy meta</button>
            </details>
            <div style="margin-top:8px;">
                <input type="password" placeholder="Try passphrase…" class="pp" />
                <button class="try-dec">Try decrypt</button>
            </div>
            <pre class="dec-result"></pre>
        `;

        const copy = (text) => navigator.clipboard?.writeText(text);
        div.querySelector(".copy-ct").onclick = () => copy(div.querySelector(".ct").textContent);
        div.querySelector(".copy-meta").onclick = () => copy(div.querySelector(".meta-json").textContent);

        const btn = div.querySelector(".try-dec");
        const pp = div.querySelector(".pp");
        const result = div.querySelector(".dec-result");
        btn.onclick = async () => {
            result.textContent = "Decrypting...";
            try {
                let text;
                if (sig.method === "AES-GCM") {
                    text = await decryptWithPassphrase(pp.value, sig.payload, sig.meta);
                } else if (sig.method === "VIGENERE") {
                    const cipher = atob(sig.payload);
                    text = vigDec(cipher, pp.value);
                } else {
                    throw new Error(`Unsupported method: ${sig.method}`);
                }
                result.textContent = text;
            } catch {
                result.textContent = "Failed to decrypt (wrong passphrase or corrupted data).";
            }
        };
        container.appendChild(div);
    })
}

