import assert from 'node:assert/strict'
import test from 'node:test'
import english from '../messages/en.json' with { type: 'json' }
import french from '../messages/fr.json' with { type: 'json' }
import { m } from '../src/paraglide/messages.js'
import {
  deLocalizeUrl,
  getLocale,
  localizeUrl,
  shouldRedirect,
} from '../src/paraglide/runtime.js'
import { paraglideMiddleware } from '../src/paraglide/server.js'

test('translation catalogs have the same keys and placeholders', () => {
  assert.deepEqual(Object.keys(french).sort(), Object.keys(english).sort())
  for (const key of Object.keys(english)) {
    const parameters = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    assert.deepEqual(parameters(french[key]), parameters(english[key]), key)
  }
})

test('URL rewrites preserve the page, search parameters, and hash', () => {
  const original = new URL('https://example.com/en/?q=thesis#results')
  const localized = localizeUrl(original, { locale: 'fr' })
  assert.equal(localized.href, 'https://example.com/fr/?q=thesis#results')
  assert.equal(deLocalizeUrl(localized).href, 'https://example.com/?q=thesis#results')
})

test('locale priority is URL, cookie, browser language, then English', async () => {
  const cases = [
    ['/en/', { cookie: 'PARAGLIDE_LOCALE=fr', 'accept-language': 'fr' }, 'en'],
    ['/', { cookie: 'PARAGLIDE_LOCALE=fr', 'accept-language': 'en' }, 'fr'],
    ['/', { 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' }, 'fr'],
    ['/', { cookie: 'PARAGLIDE_LOCALE=invalid', 'accept-language': 'ja' }, 'en'],
  ]
  for (const [path, headers, expected] of cases) {
    const decision = await shouldRedirect({
      request: new Request(`https://example.com${path}`, { headers }),
    })
    assert.equal(decision.locale, expected)
  }
})

test('document requests redirect to the selected language', async () => {
  const response = await paraglideMiddleware(
    new Request('https://example.com/', {
      headers: { 'sec-fetch-dest': 'document', 'accept-language': 'fr' },
    }),
    () => new Response('Unexpected handler call'),
  )
  assert.equal(response.status, 307)
  assert.equal(response.headers.get('location'), 'https://example.com/fr/')
})

test('assets and backend endpoints do not receive language prefixes', async () => {
  for (const path of ['/api/status', '/_serverFn/example', '/assets/app.js']) {
    const url = new URL(path, 'https://example.com')
    assert.equal(localizeUrl(url, { locale: 'fr' }).href, url.href)
    const response = await paraglideMiddleware(
      new Request(url, { headers: { 'sec-fetch-dest': 'document' } }),
      () => new Response('Unchanged'),
    )
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('location'), null)
  }
})

test('concurrent server requests keep separate languages', async () => {
  await Promise.all(Array.from({ length: 20 }, async (_, index) => {
    const locale = index % 2 === 0 ? 'en' : 'fr'
    const response = await paraglideMiddleware(
      new Request(`https://example.com/${locale}/`),
      async () => {
        await new Promise((resolve) => setTimeout(resolve, index % 3))
        assert.equal(getLocale(), locale)
        return new Response(m.search_collection_single({ count: '1' }))
      },
    )
    const expected = locale === 'en'
      ? 'Theses · HDR · Articles — 1 document, full text'
      : 'Thèses · HDR · Articles — 1 document, texte intégral'
    assert.equal(await response.text(), expected)
  }))
})
