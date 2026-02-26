// Catch-all stub for Node.js built-in modules.
// Uses a Proxy so any named import resolves to a no-op.

const handler: ProxyHandler<Record<string, unknown>> = {
  get(_target, prop) {
    if (prop === '__esModule') return true
    if (prop === 'default') return stub
    if (prop === Symbol.toStringTag) return 'Module'
    // Return a function that returns itself (chainable no-op)
    const noop = (..._args: unknown[]) => noop
    Object.setPrototypeOf(noop, new.target?.prototype ?? Object.prototype)
    return noop
  },
}

const stub = new Proxy({} as Record<string, unknown>, handler)

export default stub

// Re-export common names so static analysis doesn't fail
export const Readable = class {}
export const Writable = class {}
export const Transform = class {}
export const PassThrough = class {}
export const Duplex = class {}
export const Stream = class {}
export const pipeline = () => {}
export const finished = () => {}
export const createServer = () => {}
export const request = () => {}
export const get = () => {}
export const Agent = class {}
export const Server = class {}
export const IncomingMessage = class {}
export const ServerResponse = class {}
export const connect = () => {}
export const createConnection = () => {}
export const Socket = class {}
export const TLSSocket = class {}
export const lookup = () => {}
export const resolve4 = () => {}
export const readFileSync = () => ''
export const existsSync = () => false
export const writeFileSync = () => {}
export const mkdirSync = () => {}
export const readFile = () => {}
export const stat = () => {}
export const access = () => {}
export const homedir = () => ''
export const platform = () => 'browser'
export const tmpdir = () => '/tmp'
export const cpus = () => []
export const hostname = () => ''
export const type = () => ''
export const release = () => ''
export const arch = () => ''
export const join = (...args: string[]) => args.join('/')
export const dirname = (p: string) => p
export const basename = (p: string) => p
export const extname = () => ''
export const resolve = (...args: string[]) => args.join('/')
export const sep = '/'
export const isAbsolute = () => false
export const normalize = (p: string) => p
export const relative = () => ''
export const randomBytes = (n: number) => new Uint8Array(n)
export const createHash = () => ({ update: () => ({ digest: () => '' }), copy: () => ({}) })
export const createHmac = () => ({ update: () => ({ digest: () => '' }) })
export const webcrypto = globalThis.crypto
export const getRandomValues = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto)
export const createGunzip = () => ({})
export const createInflate = () => ({})
export const createDeflate = () => ({})
export const createBrotliDecompress = () => ({})
export const gunzipSync = () => new Uint8Array(0)
export const spawn = () => ({ on: () => {}, stdout: { on: () => {} }, stderr: { on: () => {} } })
export const exec = () => {}
export const execSync = () => ''
export const isMainThread = true
export const parentPort = null
export const Worker = class {}
export const performance = globalThis.performance
export const ok = () => {}
export const strictEqual = () => {}
export const deepStrictEqual = () => {}
export const notStrictEqual = () => {}
export const AssertionError = class extends Error {}
export const inspect = (v: unknown) => String(v)
export const promisify = (fn: Function) => fn
export const types = { isUint8Array: (v: unknown) => v instanceof Uint8Array }
export const TextDecoder = globalThis.TextDecoder
export const TextEncoder = globalThis.TextEncoder
export const deprecate = (fn: Function) => fn
export const callbackify = (fn: Function) => fn
export const EventEmitter = class {
  on() { return this }
  once() { return this }
  off() { return this }
  emit() { return false }
  removeListener() { return this }
  addListener() { return this }
  removeAllListeners() { return this }
  setMaxListeners() { return this }
  listeners() { return [] }
}
export const once = () => Promise.resolve([])
export const Buffer = globalThis.Buffer ?? {
  from: () => new Uint8Array(0),
  alloc: (n: number) => new Uint8Array(n),
  allocUnsafe: (n: number) => new Uint8Array(n),
  isBuffer: () => false,
  concat: () => new Uint8Array(0),
  byteLength: () => 0,
}
export const URL = globalThis.URL
export const URLSearchParams = globalThis.URLSearchParams
export const parse = (s: string) => { try { return new globalThis.URL(s) } catch { return {} } }
export const format = (u: unknown) => String(u)
export const stringify = (obj: Record<string, unknown>) =>
  Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('&')
export const StringDecoder = class {
  write() { return '' }
  end() { return '' }
}

// http2 constants
export const constants = {
  HTTP2_HEADER_PATH: ':path',
  HTTP2_HEADER_METHOD: ':method',
  HTTP2_HEADER_AUTHORITY: ':authority',
  HTTP2_HEADER_SCHEME: ':scheme',
  HTTP2_HEADER_STATUS: ':status',
  HTTP2_HEADER_CONTENT_TYPE: 'content-type',
  NGHTTP2_CANCEL: 0x8,
  HTTP_STATUS_OK: 200,
  HTTP_STATUS_INTERNAL_SERVER_ERROR: 500,
}
