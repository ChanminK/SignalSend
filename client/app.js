// AES-GCM LETS DO THIS

const b64 = {
    encode: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
    decode: (b64str) => Uint8Array.from(atob(b64str), c => c.charCodeAt(0))
};

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

//UI TIME NOW
const byId = (id) => document.getElementById(id);

byId("btn-post").onclick = async () => {
    const text = byId("plaintext").value.trim();
    const pass = byId("passphrase").value;
    const author = (byId("author").value || "anon").trim();
    const out = byId("post-result");

    if(!text || !pass) {
        out.textContent = "Please provide plaintext and passphrase.";
        return;
    }
    try {
        const { payload, meta } = await encryptWithPassphrase(pass, text);
        const body = { method: "AES-GCM", payload, meta, author_hint: author };
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
    const res = await fetch(`${window.API_BASE}/signals/random?n=10`);
    const list = await res.json();
    list.forEach(sig => {
        const div = document.createElement("div");
        div.className = "signal";
        const ts = new Date(sig.created_at * 1000).toISOString();
        div.innerHTML = `
            <div class="meta">#${sig.id} • ${ts} • method=${sig.method} • author=${sig.author_hint ?? "?"}</div>
            <details>
                <summary>ciphertext (base64)</summary>
                <pre>${sig.payload}</pre>
            </details>
            <details>
                <summary>meta</summary>
                <pre>${JSON.stringify(sig.meta, null, 2)}</pre>
            </details>
            <div style="margin-top:8px;">
                <input type="password" placeholder="Try passphrase…" class="pp" />
                <button class="try-dec">Try decrypt</button>
            </div>
            <pre class="dec-result"></pre>
        `;

        const btn = div.querySelector(".try-dec");
        const pp = div.querySelector(".pp");
        const result = div.querySelector(".dec-result");
        btn.onclick = async () => {
            result.textContent = "Decrypting...";
            try {
                const text = await decryptWithPassphrase(pp.value, sig.payload, sig.meta)
                result.textContent = text;
            } catch {
                result.textContent = "Failed to decrypt (wrong passphrase or corrupted data).";
            }
        };
        container.appendChild(div);
    })
}

