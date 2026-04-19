from flask import Flask, request, jsonify, send_from_directory
import os
import psycopg2
from psycopg2.extras import RealDictCursor

app = Flask(__name__, static_folder='.', static_url_path='')

DATABASE_URL = os.environ.get('DATABASE_URL')

def get_db():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS vaults (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW()
        )
    ''')
    conn.commit()
    conn.close()

# Static files
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

# API: Vault laden
@app.route('/api/vault/<vault_id>', methods=['GET'])
def get_vault(vault_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT data FROM vaults WHERE id = %s', (vault_id,))
    row = cur.fetchone()
    conn.close()
    if row:
        return jsonify({'data': row['data']})
    return jsonify({'data': None})

# API: Vault speichern
@app.route('/api/vault/<vault_id>', methods=['POST'])
def save_vault(vault_id):
    data = request.json.get('data')
    if not data:
        return jsonify({'error': 'Keine Daten'}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
        INSERT INTO vaults (id, data, updated_at)
        VALUES (%s, %s, NOW())
        ON CONFLICT (id) DO UPDATE SET data = %s, updated_at = NOW()
    ''', (vault_id, data, data))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
