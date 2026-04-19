/**
 * AES-256-GCM Verschlüsselung mit Web Crypto API
 * Alles läuft lokal im Browser - keine Daten verlassen das Gerät.
 */

const Crypto = (() => {
  const SALT_KEY = 'tresor_salt';
  const HASH_KEY = 'tresor_hash';
  const VAULT_KEY = 'tresor_vault';

  // Derive a key from the master password using PBKDF2
  async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 600000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Hash the password for verification (separate from encryption key)
  async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 600000,
        hash: 'SHA-512'
      },
      keyMaterial,
      256
    );

    return btoa(String.fromCharCode(...new Uint8Array(bits)));
  }

  // Encrypt data
  async function encrypt(data, key) {
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = encoder.encode(JSON.stringify(data));

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encoded
    );

    // Combine IV + ciphertext
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  // Decrypt data
  async function decrypt(encryptedStr, key) {
    const combined = Uint8Array.from(atob(encryptedStr), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      data
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  }

  // Public API
  return {
    isFirstTime() {
      return !localStorage.getItem(HASH_KEY);
    },

    async setup(password) {
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const saltStr = btoa(String.fromCharCode(...salt));
      localStorage.setItem(SALT_KEY, saltStr);

      const hash = await hashPassword(password, salt);
      localStorage.setItem(HASH_KEY, hash);

      const key = await deriveKey(password, salt);
      const emptyVault = await encrypt([], key);
      localStorage.setItem(VAULT_KEY, emptyVault);

      return key;
    },

    async unlock(password) {
      const saltStr = localStorage.getItem(SALT_KEY);
      if (!saltStr) throw new Error('Kein Tresor gefunden');

      const salt = Uint8Array.from(atob(saltStr), c => c.charCodeAt(0));
      const hash = await hashPassword(password, salt);
      const storedHash = localStorage.getItem(HASH_KEY);

      if (hash !== storedHash) {
        throw new Error('Falsches Passwort');
      }

      return deriveKey(password, salt);
    },

    async loadVault(key) {
      const vaultStr = localStorage.getItem(VAULT_KEY);
      if (!vaultStr) return [];
      return decrypt(vaultStr, key);
    },

    async saveVault(entries, key) {
      const encrypted = await encrypt(entries, key);
      localStorage.setItem(VAULT_KEY, encrypted);
    }
  };
})();
