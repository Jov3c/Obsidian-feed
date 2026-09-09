import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

import ipaddr from "ipaddr.js";

import { AppError } from "./errors.js";

export interface LookupAddress {
  address: string;
  family: 4 | 6;
}

export type HostLookup = (hostname: string) => Promise<LookupAddress[]>;

export interface SafeExternalTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

const defaultLookup: HostLookup = async (hostname) => {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  return addresses.map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }));
};

function ssrfBlocked(message: string): AppError {
  return new AppError("SSRF_BLOCKED", 400, false, message);
}

function isIpv6(address: ipaddr.IPv4 | ipaddr.IPv6): address is ipaddr.IPv6 {
  return address.kind() === "ipv6";
}

function normalizedIp(address: string): ipaddr.IPv4 | ipaddr.IPv6 {
  const parsed = ipaddr.parse(address);
  return isIpv6(parsed) && parsed.isIPv4MappedAddress() ? parsed.toIPv4Address() : parsed;
}

function isPublicAddress(address: string): boolean {
  try {
    return normalizedIp(address).range() === "unicast";
  } catch {
    return false;
  }
}

function normalizedHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

export async function assertSafeExternalUrl(
  input: string | URL,
  lookup: HostLookup = defaultLookup,
): Promise<SafeExternalTarget> {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input) : new URL(input);
  } catch (error) {
    throw new AppError("INVALID_SOURCE_URL", 400, false, "Invalid external URL", undefined, {
      cause: error,
    });
  }

  if (!new Set(["http:", "https:"]).has(url.protocol))
    throw ssrfBlocked("URL protocol is not allowed");
  if (url.username || url.password) throw ssrfBlocked("Embedded URL credentials are not allowed");

  const hostname = normalizedHostname(url.hostname).toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw ssrfBlocked("Local hostnames are not allowed");
  }

  const literalFamily = isIP(hostname);
  const addresses: LookupAddress[] =
    literalFamily === 0
      ? await lookup(hostname)
      : [{ address: hostname, family: literalFamily === 6 ? 6 : 4 }];

  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw ssrfBlocked("URL resolves to a non-public address");
  }

  const target = addresses[0];
  if (target === undefined) throw ssrfBlocked("URL did not resolve to an address");
  return { url, address: target.address, family: target.family };
}
