/**
 * AES-256-GCM Verschlüsselung mit Web Crypto API
 * Daten werden client-seitig verschlüsselt und mit dem Server synchronisiert.
 * Der Server sieht nur verschlüsselte Blobs - niemals Klartext.
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

  // Generate a vault ID from password (used as server-side identifier)
  async function getVaultId(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode('tresor-vault-id-' + password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
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

  // Sync with server
  async function syncToServer(vaultId, encryptedData) {
    try {
      await fetch('/api/vault/' + vaultId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: encryptedData })
      });
    } catch (e) {
      console.warn('Server-Sync fehlgeschlagen, Daten sind lokal gespeichert');
    }
  }

  async function loadFromServer(vaultId) {
    try {
      const res = await fetch('/api/vault/' + vaultId);
      const json = await res.json();
      return json.data || null;
    } catch (e) {
      return null;
    }
  }

  // Public API
  let _vaultId = null;

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

      _vaultId = await getVaultId(password);

      const key = await deriveKey(password, salt);

      // Prüfe ob auf dem Server schon ein Tresor existiert (anderes Gerät)
      const serverData = await loadFromServer(_vaultId);
      if (serverData) {
        localStorage.setItem(VAULT_KEY, serverData);
      } else {
        const emptyVault = await encrypt([], key);
        localStorage.setItem(VAULT_KEY, emptyVault);
        await syncToServer(_vaultId, emptyVault);
      }

      return key;
    },

    async unlock(password) {
      _vaultId = await getVaultId(password);

      // Wenn lokal kein Tresor existiert, vom Server laden
      if (!localStorage.getItem(SALT_KEY)) {
        const serverData = await loadFromServer(_vaultId);
        if (!serverData) throw new Error('Kein Tresor gefunden');
        // Server hat Daten aber wir brauchen auch Salt/Hash lokal
        throw new Error('Bitte Tresor zuerst auf diesem Gerät erstellen');
      }

      const saltStr = localStorage.getItem(SALT_KEY);
      const salt = Uint8Array.from(atob(saltStr), c => c.charCodeAt(0));
      const hash = await hashPassword(password, salt);
      const storedHash = localStorage.getItem(HASH_KEY);

      if (hash !== storedHash) {
        throw new Error('Falsches Passwort');
      }

      // Server-Daten haben Vorrang (neueste Version)
      const serverData = await loadFromServer(_vaultId);
      if (serverData) {
        localStorage.setItem(VAULT_KEY, serverData);
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
      // Sync zum Server
      if (_vaultId) {
        await syncToServer(_vaultId, encrypted);
      }
    }
  };
})();
