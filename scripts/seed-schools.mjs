/**
 * Seed universities from multiple free sources into public.schools.
 * Sources:
 *  1. Hipolabs university-domains-list
 *  2. Wikidata SPARQL (Q3918 universities) for broader coverage + aliases
 *  3. Curated acronym aliases (e.g. ESSEC)
 *
 * Usage: node scripts/seed-schools.mjs
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

const HIPOLABS =
  'https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json'

const WIKIDATA_SPARQL = `
SELECT ?item ?itemLabel ?countryLabel ?website ?domain WHERE {
  ?item wdt:P31/wdt:P279* wd:Q3918 .
  OPTIONAL { ?item wdt:P17 ?country . }
  OPTIONAL { ?item wdt:P856 ?website . }
  OPTIONAL {
    ?item wdt:P856 ?website .
    BIND(REPLACE(STR(?website), "^https?://(www\\\\.)?", "") AS ?host)
    BIND(REPLACE(?host, "/.*$", "") AS ?domain)
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es,it,pt,zh". }
}
LIMIT 20000
`

/** Common acronyms that Hipolabs stores under long formal names. */
const CURATED_ALIASES = {
  'essec.fr': ['ESSEC', 'ESSEC Business School'],
  'hec.fr': ['HEC', 'HEC Paris'],
  'insead.edu': ['INSEAD'],
  'lse.ac.uk': ['LSE', 'London School of Economics'],
  'mit.edu': ['MIT'],
  'ucl.ac.uk': ['UCL'],
  'nyu.edu': ['NYU'],
  'ucla.edu': ['UCLA'],
  'usc.edu': ['USC'],
  'ethz.ch': ['ETH', 'ETH Zurich'],
  'epfl.ch': ['EPFL'],
  'ox.ac.uk': ['Oxford', 'University of Oxford'],
  'cam.ac.uk': ['Cambridge', 'University of Cambridge'],
}

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m || process.env[m[1]]) continue
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

function normalizeDomain(raw) {
  if (!raw) return null
  return String(raw)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim() || null
}

function uniq(arr) {
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))]
}

function acronymFromName(name) {
  const words = name
    .replace(/[()[\],.]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(and|the|of|for|de|des|du|la|le|les|et|und|der|die|das)$/i.test(w))
  if (words.length < 2 || words.length > 6) return null
  const ac = words.map((w) => w[0].toUpperCase()).join('')
  return ac.length >= 3 && ac.length <= 6 ? ac : null
}

function mergeSchool(map, row) {
  const domain = normalizeDomain(row.domain)
  const key = domain || `name:${row.name.toLowerCase()}`
  const prev = map.get(key)
  const aliases = uniq([...(prev?.aliases ?? []), ...(row.aliases ?? [])])
  if (domain && CURATED_ALIASES[domain]) {
    aliases.push(...CURATED_ALIASES[domain])
  }
  const auto = acronymFromName(row.name)
  if (auto) aliases.push(auto)

  map.set(key, {
    name: prev?.name && prev.name.length <= row.name.length ? prev.name : row.name,
    country: row.country || prev?.country || null,
    domain: domain || prev?.domain || null,
    web_page: row.web_page || prev?.web_page || null,
    aliases: uniq(aliases),
  })
}

async function fetchHipolabs() {
  console.log('Fetching Hipolabs university list…')
  const res = await fetch(HIPOLABS)
  if (!res.ok) throw new Error(`Hipolabs fetch failed: ${res.status}`)
  const rows = await res.json()
  console.log(`  ${rows.length} institutions`)
  return rows.map((r) => ({
    name: r.name,
    country: r.country ?? null,
    domain: r.domains?.[0] ?? null,
    web_page: r.web_pages?.[0] ?? null,
    aliases: [],
  }))
}

async function fetchWikidata() {
  console.log('Fetching Wikidata universities…')
  const endpoint = 'https://query.wikidata.org/sparql'
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'PergamumSchoolSeed/1.0 (citation app)',
    },
    body: new URLSearchParams({ query: WIKIDATA_SPARQL }),
  })
  if (!res.ok) {
    console.warn(`  Wikidata fetch failed: ${res.status} — continuing with Hipolabs only`)
    return []
  }
  const json = await res.json()
  const bindings = json.results?.bindings ?? []
  console.log(`  ${bindings.length} institutions`)
  return bindings
    .map((b) => ({
      name: b.itemLabel?.value,
      country: b.countryLabel?.value ?? null,
      domain: b.domain?.value ?? null,
      web_page: b.website?.value ?? null,
      aliases: [],
    }))
    .filter((r) => r.name && r.name !== r.item)
}

async function upsertBatch(rows) {
  const batchSize = 150
  let upserted = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)
    // Prefer domain match when present; otherwise insert by name uniqueness soft-check.
    for (const row of chunk) {
      if (row.domain) {
        const { data: existing } = await supabase
          .from('schools')
          .select('id, aliases')
          .eq('domain', row.domain)
          .maybeSingle()
        if (existing) {
          const aliases = uniq([...(existing.aliases ?? []), ...(row.aliases ?? [])])
          const { error } = await supabase
            .from('schools')
            .update({
              name: row.name,
              country: row.country,
              web_page: row.web_page,
              aliases,
            })
            .eq('id', existing.id)
          if (error) console.warn(error.message)
          else upserted += 1
          continue
        }
      }

      const { error } = await supabase.from('schools').insert(row)
      if (error) {
        if (!/duplicate|unique/i.test(error.message)) console.warn(error.message)
      } else {
        upserted += 1
      }
    }
    process.stdout.write(`\rUpserted ~${upserted}/${rows.length}`)
  }
  console.log('')
  return upserted
}

async function main() {
  const map = new Map()
  for (const row of await fetchHipolabs()) mergeSchool(map, row)
  for (const row of await fetchWikidata()) mergeSchool(map, row)

  const rows = [...map.values()]
  console.log(`Merged unique institutions: ${rows.length}. Upserting…`)
  const n = await upsertBatch(rows)
  console.log(`Done. Upserted approximately ${n} rows.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
