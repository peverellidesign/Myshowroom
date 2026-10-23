// Test API con lo store HTTPS di Supabase (PostgREST reale) + archivio S3 finto.
// Richiede il binario `postgrest` (PATH o POSTGREST_BIN) e un PostgreSQL con i ruoli di Supabase (anon, authenticated, service_role, authenticator).
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { startFakeS3 } from './fake-s3.mjs';
const secret = 'test-jwt-secret-at-least-32-characters-long!!';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const head = b64({ alg: 'HS256', typ: 'JWT' }), payload = b64({ role: 'service_role', iss: 'supabase' });
const key = `${head}.${payload}.${createHmac('sha256', secret).update(`${head}.${payload}`).digest('base64url')}`;
const db = process.env.REST_DB || 'ms_rest';
const pgrst = spawn(process.env.POSTGREST_BIN || 'postgrest', [], { env: { ...process.env, PGRST_DB_URI: `postgres://authenticator:auth@127.0.0.1:5432/${db}`, PGRST_DB_SCHEMAS: 'public', PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: secret, PGRST_SERVER_PORT: '3011', PGRST_LOG_LEVEL: 'crit' }, stdio: 'inherit' });
const s3 = await startFakeS3(9011);
await new Promise(r => setTimeout(r, 1500));
const code = await new Promise(res => spawn(process.execPath, ['--test', 'tests/api.test.mjs'], { stdio: 'inherit', env: { ...process.env, TEST_REST: '1', TEST_DATABASE_URL: `postgres://postgres@127.0.0.1:5432/${db}`, DATABASE_URL: '', SUPABASE_URL: 'http://127.0.0.1:3011', SUPABASE_REST_URL: 'http://127.0.0.1:3011', SUPABASE_SECRET_KEY: key, STORAGE: 's3', S3_ENDPOINT: 'http://127.0.0.1:9011/storage/v1/s3', S3_REGION: 'eu-central-1', S3_PATH_STYLE: 'true', S3_BUCKET: 'myshowroom', S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test' } }).on('exit', res));
// verifica sicurezza: la chiave pubblica (anon) non deve leggere gli utenti
const anon = await fetch('http://127.0.0.1:3011/users?select=email');
console.log(`accesso anonimo alla tabella utenti: HTTP ${anon.status} (atteso 401/403)`);
console.log(`oggetti nel finto S3: ${s3.objects.size}`);
pgrst.kill(); s3.close();
process.exit(code || (anon.status === 401 || anon.status === 403 ? 0 : 1));
