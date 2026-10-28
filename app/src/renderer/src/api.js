export const API_BASE = 'http://127.0.0.1:7432'
export const WS_BASE = 'ws://127.0.0.1:7432'

const checkOk = async (r) => {
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`)
  }
  return r.json()
}

export const api = {
  get:    (path)        => fetch(`${API_BASE}${path}`).then(checkOk),
  post:   (path, body)  => fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(checkOk),
  delete: (path) => fetch(`${API_BASE}${path}`, { method: 'DELETE' }).then(checkOk),
}
