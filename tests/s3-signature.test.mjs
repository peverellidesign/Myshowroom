// Verifica della firma AWS SigV4 con i vettori di riferimento pubblicati da AWS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signV4 } from '../server/node/storage.ts';

test('SigV4 — esempio IAM della documentazione AWS', () => {
  const h = signV4({
    method: 'GET', url: new URL('https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08'),
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' }, body: '',
    region: 'us-east-1', service: 'iam', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', date: new Date('2015-08-30T12:36:00Z'),
  });
  assert.match(h.authorization, /Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7$/);
});

test('SigV4 — esempio S3 GET Object della documentazione AWS', () => {
  const h = signV4({
    method: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
    headers: { range: 'bytes=0-9', 'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }, body: '',
    region: 'us-east-1', service: 's3', accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', date: new Date('2013-05-24T00:00:00Z'),
  });
  assert.match(h.authorization, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
});
