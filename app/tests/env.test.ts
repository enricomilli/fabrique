import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const validEnv: Record<string, string> = {
  REDIS_URL: 'redis://localhost:6379',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
  BETTER_AUTH_SECRET: 'test-only-secret-with-at-least-32-characters',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'test-access-key',
  S3_SECRET_ACCESS_KEY: 'test-secret-key',
  S3_BUCKET: 'app',
  S3_FORCE_PATH_STYLE: 'true',
}

function runValidation(values: Record<string, string>, browser = false) {
  const runtimeEnv = { ...process.env }
  for (const key of [...Object.keys(validEnv), 'SERVER_URL', 'VITE_APP_TITLE']) {
    delete runtimeEnv[key]
  }
  return spawnSync(process.execPath, [
    '--import', 'tsx', '--input-type=module', '--eval',
    `${browser ? 'globalThis.window = {};' : ''}
    const { env } = await import('./src/env.ts');
    ${browser
      ? `try { env.S3_SECRET_ACCESS_KEY; process.exit(1); } catch { console.log('blocked'); }`
      : 'console.log(JSON.stringify({ pathStyle: env.S3_FORCE_PATH_STYLE }));'}`,
  ], {
    cwd: new URL('..', import.meta.url),
    env: { ...runtimeEnv, ...values },
    encoding: 'utf8',
    timeout: 10_000,
  })
}

test('server validation reports all missing required variables', () => {
  const result = runValidation({})
  assert.notEqual(result.status, 0)
  for (const key of Object.keys(validEnv)) {
    assert.ok(result.stderr.includes(key), `Missing error for ${key}`)
  }
})

test('server validation reads runtime values and parses both boolean values', () => {
  for (const value of ['true', 'false']) {
    const result = runValidation({ ...validEnv, S3_FORCE_PATH_STYLE: value })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), { pathStyle: value === 'true' })
  }
})

test('server validation rejects empty values and invalid URLs or booleans', () => {
  const invalidValues = {
    DATABASE_URL: 'https://localhost/app',
    S3_ENDPOINT: 'ftp://localhost',
    S3_REGION: '',
    S3_ACCESS_KEY_ID: ' ',
    S3_SECRET_ACCESS_KEY: '',
    S3_BUCKET: '',
    S3_FORCE_PATH_STYLE: 'yes',
  }
  const result = runValidation(invalidValues)
  assert.notEqual(result.status, 0)
  for (const key of Object.keys(invalidValues)) {
    assert.ok(result.stderr.includes(key), `Missing error for ${key}`)
  }
})

test('browser validation does not require server values and blocks secret access', () => {
  const result = runValidation({}, true)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'blocked')
})

test('server validation rejects short auth secrets', () => {
  const result = runValidation({ ...validEnv, BETTER_AUTH_SECRET: 'too-short' })
  assert.notEqual(result.status, 0)
  assert.ok(result.stderr.includes('BETTER_AUTH_SECRET'))
})
