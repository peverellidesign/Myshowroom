// Esegue i test API con archivio S3 (stesso schema di URL di Supabase Storage) invece del disco.
import { spawn } from 'node:child_process';
import { startFakeS3 } from './fake-s3.mjs';
const s3 = await startFakeS3(9010);
const code = await new Promise(res => spawn(process.execPath, ['--test', 'tests/api.test.mjs'], { stdio: 'inherit', env: { ...process.env, STORAGE: 's3', S3_ENDPOINT: 'http://127.0.0.1:9010/storage/v1/s3', S3_REGION: 'eu-central-1', S3_PATH_STYLE: 'true', S3_BUCKET: 'myshowroom', S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test' } }).on('exit', res));
console.log(`oggetti salvati nel finto S3: ${s3.objects.size} · richieste: ${s3.log.length}`);
s3.close();
process.exit(code ?? 1);
