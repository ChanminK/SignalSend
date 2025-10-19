// AES-GCM LETS DO THIS

const b64 = {
    encode: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
    decode: (b64str) => Uint8Array.from(atob(b64str), c => c.charCodeAt(0))
};

async function deriveKeyPBKDF2(passphrase, saltBytes) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw", enc.encode(passphrase), {name: "PBKDF2"}, false, [deriveKey]
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

async function decryptWithPassPhrase(passphrase, payloadB64, meta) {
    const salt = b64.decode(meta.salt);
    const iv = b64.decode(meta.iv);
    const key = await deriveKeyPBKDF2(passphrase, salt);
    const ct = b64.decode(payloadB64);
    const ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(ptBuf);
}

//UI TIME NOW
const byId = (id) => document.getElementById(id);

