// Moteur du simulateur réseau : adressage, sous-réseaux, routage, DNS et pare-feu.
// Modèle pédagogique : un seul routeur, deux réseaux, aucune trame réelle.

const IP_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function parseIp(text) {
  const m = IP_RE.exec(String(text ?? '').trim());
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return parts;
}

export function validIp(text) {
  return parseIp(text) !== null;
}

export function ipToInt(ip) {
  const parts = parseIp(ip);
  if (!parts) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function intToIp(value) {
  const n = value >>> 0;
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export function maskFromPrefix(prefix) {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return intToIp(mask);
}

/** Accepte « 24 », « /24 » ou « 255.255.255.0 ». */
export function parsePrefix(value) {
  const text = String(value ?? '').trim().replace(/^\//, '');
  if (/^\d{1,2}$/.test(text)) {
    const n = Number(text);
    return n >= 0 && n <= 32 ? n : null;
  }
  const parts = parseIp(text);
  if (!parts) return null;
  const n = ipToInt(parts.join('.'));
  let count = 0;
  for (let i = 31; i >= 0; i--) {
    if ((n >>> i) & 1) count += 1;
    else break;
  }
  const expected = count === 0 ? 0 : (0xffffffff << (32 - count)) >>> 0;
  return expected === n ? count : null;
}

export function networkOf(ip, prefix) {
  const value = ipToInt(ip);
  if (value === null || !Number.isInteger(prefix)) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) >>> 0;
}

export function inSubnet(ip, cidr) {
  const [net, prefixText] = String(cidr).split('/');
  const prefix = parsePrefix(prefixText);
  const ipInt = ipToInt(ip);
  const netInt = ipToInt(net);
  if (ipInt === null || netInt === null || prefix === null) return false;
  return networkOf(ip, prefix) === networkOf(intToIp(netInt), prefix);
}

export function subnetInfo(ip, prefixValue) {
  const prefix = parsePrefix(prefixValue);
  const value = ipToInt(ip);
  if (prefix === null) return { error: 'Masque invalide.' };
  if (value === null) return { error: 'Adresse IP invalide.' };
  const total = 2 ** (32 - prefix);
  const network = networkOf(ip, prefix);
  const broadcast = (network + total - 1) >>> 0;
  const usable = prefix >= 31 ? total : Math.max(0, total - 2);
  return {
    prefix,
    mask: maskFromPrefix(prefix),
    network: intToIp(network),
    broadcast: intToIp(broadcast),
    first: usable ? intToIp(network + 1) : null,
    last: usable ? intToIp(broadcast - 1) : null,
    total,
    usable,
    cidr: `${intToIp(network)}/${prefix}`
  };
}

export function addressesOf(device) {
  if (!device) return [];
  if (device.type === 'router') return device.ifaces || [];
  return device.ip ? [{ name: 'eth0', ip: device.ip, mask: device.mask }] : [];
}

export function deviceByIp(topo, ip) {
  for (const device of topo.devices) {
    if (addressesOf(device).some((a) => a.ip === ip)) return device;
  }
  return null;
}

/** Un conflit existe si deux appareils actifs partagent la même IP dans le même sous-réseau. */
export function conflictOf(topo, device) {
  if (!device || !device.ip) return null;
  return topo.devices.find((other) => other.id !== device.id && other.ip === device.ip) || null;
}

function sameLan(topo, a, b) {
  for (const addrA of addressesOf(a)) {
    for (const addrB of addressesOf(b)) {
      const prefix = parsePrefix(addrA.mask);
      if (prefix === null) continue;
      if (networkOf(addrA.ip, prefix) === networkOf(addrB.ip, prefix)) {
        const linked = topo.links.some(([x, y]) => (x === a.id && y === b.id) || (x === b.id && y === a.id))
          || topo.links.some(([x, y]) => (a.type === 'switch' && x === a.id) || (b.type === 'switch' && x === b.id));
        void linked;
        return true;
      }
    }
  }
  return false;
}

function firewallBlocks(topo, target, sourceIp, port) {
  for (const rule of target.fw || []) {
    if (rule.from && !inSubnet(sourceIp, rule.from)) continue;
    if (rule.port !== null && rule.port !== undefined && Number(rule.port) !== Number(port)) continue;
    return rule.action === 'deny';
  }
  return false;
}

/**
 * Teste la joignabilité entre deux appareils.
 * @returns {{ ok: boolean, path: string[], reason: string, port: number }}
 */
export function canReach(topo, fromId, toId, port = 0) {
  const from = topo.devices.find((d) => d.id === fromId);
  const to = topo.devices.find((d) => d.id === toId);
  if (!from || !to) return { ok: false, path: [], reason: 'Appareil introuvable', port };
  if (!from.ip) return { ok: false, path: [], reason: 'Aucune adresse IP configurée sur la source', port };
  if (!to.ip && to.type !== 'router') return { ok: false, path: [], reason: 'Aucune adresse IP configurée sur la destination', port };

  const conflict = conflictOf(topo, from) || conflictOf(topo, to);
  if (conflict) return { ok: false, path: [], reason: `Conflit d'adresses IP avec ${conflict.name}`, port };

  const targetIp = to.ip;
  const direct = sameLan(topo, from, to);

  let path = [from.id];
  let lastRouter = null;

  if (!direct) {
    if (!from.gateway) return { ok: false, path, reason: 'Aucune passerelle configurée', port };
    const sourcePrefix = parsePrefix(from.mask);
    if (sourcePrefix === null || networkOf(from.ip, sourcePrefix) !== networkOf(from.gateway, sourcePrefix)) {
      return { ok: false, path, reason: 'La passerelle n\'appartient pas au réseau du poste', port };
    }
    const router = deviceByIp(topo, from.gateway);
    if (!router || router.type !== 'router') return { ok: false, path, reason: 'Passerelle injoignable : aucun routeur à cette adresse', port };
    const iface = (router.ifaces || []).find((i) => {
      const prefix = parsePrefix(i.mask);
      return prefix !== null && networkOf(targetIp, prefix) === networkOf(i.ip, prefix);
    });
    if (!iface) return { ok: false, path: [...path, router.id], reason: 'Aucune route vers le réseau de destination', port };
    path.push(router.id);
    lastRouter = router;
  }

  path.push(to.id);

  if (to.type !== 'router' && firewallBlocks(topo, to, from.ip, port)) {
    return { ok: false, path, reason: `Pare-feu de ${to.name} : trafic refusé${port ? ` sur le port ${port}` : ''}`, port };
  }
  if (lastRouter && firewallBlocks(topo, lastRouter, from.ip, port)) {
    return { ok: false, path, reason: `Pare-feu du routeur : trafic refusé`, port };
  }

  return { ok: true, path, reason: 'Trafic transmis', port };
}

/** Résolution DNS : le poste doit avoir un serveur DNS joignable et le nom doit exister. */
export function resolveDns(topo, fromId, name) {
  const from = topo.devices.find((d) => d.id === fromId);
  if (!from) return { ok: false, reason: 'Appareil introuvable' };
  if (!from.dns) return { ok: false, reason: 'Aucun serveur DNS configuré sur ce poste' };
  const server = deviceByIp(topo, from.dns);
  if (!server || server.type !== 'server') return { ok: false, reason: 'Serveur DNS introuvable à cette adresse' };
  const reach = canReach(topo, fromId, server.id, 53);
  if (!reach.ok) return { ok: false, reason: `Serveur DNS injoignable : ${reach.reason}` };
  const entry = (server.dns || {})[name];
  if (!entry) return { ok: false, reason: `Nom inconnu : ${name}` };
  return { ok: true, ip: entry, server: server.name };
}

export function checkObjectives(topo, checks) {
  return (checks || []).map((check) => {
    switch (check.type) {
      case 'ip': {
        const device = topo.devices.find((d) => d.id === check.device);
        return Boolean(device && device.ip === check.expect);
      }
      case 'mask': {
        const device = topo.devices.find((d) => d.id === check.device);
        return Boolean(device && parsePrefix(device.mask) === parsePrefix(check.expect));
      }
      case 'gateway': {
        const device = topo.devices.find((d) => d.id === check.device);
        return Boolean(device && device.gateway === check.expect);
      }
      case 'dns': {
        const device = topo.devices.find((d) => d.id === check.device);
        return Boolean(device && device.dns === check.expect);
      }
      case 'reach': {
        const result = canReach(topo, check.from, check.to, check.port || 0);
        return result.ok === (check.expect !== false);
      }
      case 'resolve': {
        const result = resolveDns(topo, check.from, check.name);
        return Boolean(result.ok && result.ip === check.expect);
      }
      case 'unique-ip': {
        const ips = topo.devices.filter((d) => d.ip).map((d) => d.ip);
        return new Set(ips).size === ips.length;
      }
      default:
        return false;
    }
  });
}

/** Applique les réglages d'un scénario au modèle de départ (copie profonde). */
export function buildTopology(seed, setup = []) {
  const topo = JSON.parse(JSON.stringify(seed));
  for (const item of setup) {
    const device = topo.devices.find((d) => d.id === item.device);
    if (!device) continue;
    Object.assign(device, JSON.parse(JSON.stringify(item.set || {})));
  }
  return topo;
}
