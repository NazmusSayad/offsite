import { randomBytes } from 'node:crypto'
import dns from 'node:dns'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import { CookieJar, getPublicSuffix } from 'tough-cookie'

export type Site = {
  key: string
  local: boolean
  jar: CookieJar
  storage: Map<string, Record<string, string>>
}

const sites = new Map<string, Site>()
const siteNames = new Map<string, Site>()
const privateAddresses = new BlockList()

for (const range of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  privateAddresses.addSubnet(range[0], range[1], 'ipv4')
}
for (const range of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  privateAddresses.addSubnet(range[0], range[1], 'ipv6')
}

export function proxiedPath(key: string, target: URL) {
  const scheme = target.protocol === 'https:' ? 'https' : 'http'
  return `/api/proxy/${key}/${scheme}/${target.host}${target.pathname}${target.search}${target.hash}`
}

export function linkRewriter(key: string, base: URL) {
  return (value: string) => {
    const text = value.trim()
    if (text === '' || text.startsWith('#')) {
      return value
    }
    if (text.startsWith(`/api/proxy/${key}/`)) {
      return text
    }
    const target = URL.parse(text, base)
    if (
      target === null ||
      (target.protocol !== 'http:' && target.protocol !== 'https:')
    ) {
      return value
    }
    return proxiedPath(key, target)
  }
}

export function findSite(key: string) {
  return sites.get(key) ?? null
}

export async function openSite(address: string, fromPage: boolean) {
  const target = new URL(address)
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error(`${address} is not an http or https address`)
  }
  const local = await isLocalHost(hostOf(target))
  if (local && fromPage) {
    throw new Error('A website cannot open an address on this machine')
  }
  const name = local
    ? `local ${target.hostname}`
    : `public ${getPublicSuffix(target.hostname) ?? target.hostname}`
  const existing = siteNames.get(name)
  if (existing !== undefined) {
    return proxiedPath(existing.key, target)
  }
  const site = {
    key: randomBytes(16).toString('hex'),
    local,
    jar: new CookieJar(undefined, {
      allowSpecialUseDomain: true,
      rejectPublicSuffixes: !local,
    }),
    storage: new Map(),
  }
  sites.set(site.key, site)
  siteNames.set(name, site)
  return proxiedPath(site.key, target)
}

export function hostOf(target: URL) {
  return target.hostname.replace(/^\[|\]$/g, '')
}

export function checkAddress(
  site: Site,
  address: string,
  port: number,
  ownPort: number
) {
  if (!isPrivate(address)) {
    return
  }
  if (!site.local) {
    throw new Error('Websites cannot reach addresses on this machine')
  }
  if (port === ownPort) {
    throw new Error('Pages cannot reach Offsite itself')
  }
}

export function guardedLookup(
  site: Site,
  port: number,
  ownPort: number
): LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error !== null) {
        callback(error, '', 0)
        return
      }
      try {
        for (const item of addresses) {
          checkAddress(site, item.address, port, ownPort)
        }
      } catch (caught) {
        callback(caught as NodeJS.ErrnoException, '', 0)
        return
      }
      if (options.all === true) {
        callback(null, addresses)
        return
      }
      const first = addresses[0]
      if (first === undefined) {
        callback(new Error(`${hostname} has no address`), '', 0)
        return
      }
      callback(null, first.address, first.family)
    })
  }
}

function isPrivate(address: string) {
  const family = isIP(address)
  if (family === 4) {
    return privateAddresses.check(address, 'ipv4')
  }
  if (family === 6) {
    return privateAddresses.check(address, 'ipv6')
  }
  throw new Error(`${address} is not an IP address`)
}

async function isLocalHost(hostname: string) {
  if (isIP(hostname) !== 0) {
    return isPrivate(hostname)
  }
  const addresses = await dns.promises.lookup(hostname, { all: true })
  return addresses.some((item) => isPrivate(item.address))
}
