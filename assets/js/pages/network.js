// Simulateur réseau : topologie cliquable, adressage, routage, DNS, pare-feu et sous-réseaux.
// Modèle pédagogique : aucun paquet réel n'est émis.

import { h, icon, emptyState, alertBox } from '../core/dom.js';
import { getNetworkData } from '../core/data.js';
import {
  buildTopology, canReach, resolveDns, checkObjectives, subnetInfo,
  parsePrefix, validIp, deviceByIp, addressesOf
} from '../network/engine.js';
import { toast, confirmDialog } from '../core/ui.js';

const STORAGE_KEY = 'kernova:network:v1';
const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.topo || !Array.isArray(data.topo.devices)) return null;
    return data;
  } catch {
    return null;
  }
}

function save(topo, scenarioId, done) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, topo, scenarioId, done }));
  } catch { /* stockage indisponible : la simulation reste utilisable */ }
}

export function renderNetworkPage({ outlet }) {
  const data = getNetworkData();
  if (!data || !data.seed || !data.scenarios?.length) {
    outlet.replaceChildren(h('div', { class: 'page' },
      emptyState({ icon: 'alert', title: 'Simulateur indisponible', text: 'La topologie n\'a pas pu être chargée.' })));
    return undefined;
  }

  const saved = loadSaved();
  let scenarioId = saved?.scenarioId && data.scenarios.some((s) => s.id === saved.scenarioId)
    ? saved.scenarioId
    : data.scenarios[0].id;
  let scenario = data.scenarios.find((s) => s.id === scenarioId);
  let topo = saved && saved.scenarioId === scenarioId ? saved.topo : buildTopology(data.seed, scenario.setup);
  let done = new Set(saved?.done || []);
  let selectedId = topo.devices.find((d) => d.ip)?.id || topo.devices[0].id;
  let hintsShown = 0;
  let packet = null;
  let markerEl = null;
  const packetPanel = h('div', { class: 'net-packet-panel', hidden: true, 'aria-live': 'polite' });

  const canvas = h('div', { class: 'net-canvas' });
  const panel = h('div', { class: 'net-panel' });
  const consoleList = h('ol', { class: 'net-console' });
  const objectiveList = h('ul', { class: 'term-objectives' });
  const progress = h('p', { class: 'term-progress small', role: 'status' });
  const hintBox = h('div', { class: 'term-hints' });
  const scTitle = h('h2', { id: 'net-sc-title' });
  const scDesc = h('p', { class: 'small muted' });

  const scenarioSelect = h('select', {
    id: 'net-scenario',
    'aria-label': 'Choisir un scénario',
    onChange: (e) => chargerScenario(e.target.value)
  }, data.scenarios.map((s) => h('option', { value: s.id, selected: s.id === scenarioId }, s.title)));

  function log(text, kind = '') {
    consoleList.append(h('li', { class: `net-msg ${kind}`.trim(), text }));
    while (consoleList.children.length > 40) consoleList.firstElementChild.remove();
    consoleList.scrollTop = consoleList.scrollHeight;
  }

  function selectedDevice() {
    return topo.devices.find((d) => d.id === selectedId);
  }

  /* ---------- Schéma ---------- */

  function renderCanvas() {
    canvas.replaceChildren();
    const svg = svgEl('svg', { class: 'net-links', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    for (const [aId, bId] of topo.links) {
      const a = topo.devices.find((d) => d.id === aId);
      const b = topo.devices.find((d) => d.id === bId);
      if (!a || !b) continue;
      svg.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'net-link' }));
    }
    canvas.append(svg);

    for (const device of topo.devices) {
      const label = device.type === 'host' ? 'PC' : device.type === 'switch' ? 'SW' : device.type === 'router' ? 'R' : 'SRV';
      const ifaces = device.ifaces || [];
      const ipText = device.type === 'router'
        ? (ifaces.length > 1 ? `${ifaces[0].ip} (+${ifaces.length - 1})` : (ifaces[0]?.ip || 'non configuré'))
        : device.type === 'switch'
          ? 'couche 2'
          : (device.ip || 'non configuré');
      const button = h('button', {
        class: `net-device net-${device.type}${device.id === selectedId ? ' is-selected' : ''}`,
        type: 'button',
        style: `left:${device.x}%;top:${device.y}%`,
        'aria-pressed': String(device.id === selectedId),
        'aria-label': `${device.name}, ${ipText}`,
        onClick: () => { selectedId = device.id; renderCanvas(); renderPanel(); }
      },
        h('span', { class: 'net-badge', 'aria-hidden': 'true', text: label }),
        h('span', { class: 'net-name', text: device.name }),
        h('span', { class: 'net-ip', text: ipText })
      );
      canvas.append(button);
    }

    markerEl = null;
    if (packet) {
      const step = packet.steps[packet.index];
      const device = topo.devices.find((d) => d.id === step?.id);
      if (device) {
        markerEl = svgEl('circle', { r: 2.2, class: 'net-packet', cx: device.x, cy: device.y, 'aria-hidden': 'true' });
        svg.append(markerEl);
      }
    }
  }

  function animateMarker(target) {
    if (!markerEl || !target) return;
    const startX = Number(markerEl.getAttribute('cx'));
    const startY = Number(markerEl.getAttribute('cy'));
    const début = performance.now();
    const durée = 450;
    const tick = (now) => {
      const ratio = Math.min(1, (now - début) / durée);
      const eased = ratio < 0.5 ? 2 * ratio * ratio : 1 - ((-2 * ratio + 2) ** 2) / 2;
      markerEl.setAttribute('cx', String(startX + (target.x - startX) * eased));
      markerEl.setAttribute('cy', String(startY + (target.y - startY) * eased));
      if (ratio < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function showPacket(result, from, to, port) {
    const protocol = port ? `TCP, port ${port}` : 'ICMP';
    const pathIds = result.path.length ? result.path : [from.id];
    const steps = [];
    const direct = pathIds.length === 2;
    let emission = `${from.name} (${from.ip || 'sans adresse'}) émet un paquet ${protocol} vers ${to.ip || 'la cible'}.`;
    if (!from.ip) emission += ' Aucune adresse IP n\'est configurée.';
    else if (direct) emission += ' Même sous-réseau : envoi direct.';
    else if (from.gateway) emission += ` Destination hors du réseau local : envoi à la passerelle ${from.gateway}.`;
    else emission += ' Aucune passerelle configurée.';
    if (pathIds.length === 1 && !result.ok) emission += ` Arrêt : ${result.reason}.`;
    steps.push({ id: from.id, text: emission });

    for (const id of pathIds.slice(1, -1)) {
      const router = topo.devices.find((d) => d.id === id);
      if (router) steps.push({ id, text: `${router.name} : route trouvée vers ${to.ip}, transmission vers le réseau de destination.` });
    }
    if (pathIds.length > 1) {
      const last = topo.devices.find((d) => d.id === pathIds[pathIds.length - 1]);
      if (last) {
        steps.push({
          id: last.id,
          text: result.ok
            ? `${last.name} : paquet accepté${port ? ` sur le port ${port}` : ''}.`
            : `${last.name} : paquet refusé. ${result.reason}.`
        });
      }
    }

    packet = { steps, index: 0, protocol, from: from.name, to: to.name, port, ok: result.ok };
    renderCanvas();
    renderPacket();
  }

  function goStep(index) {
    if (!packet) return;
    packet.index = Math.max(0, Math.min(packet.steps.length - 1, index));
    const device = topo.devices.find((d) => d.id === packet.steps[packet.index].id);
    animateMarker(device);
    renderPacket();
  }

  function closePacket() {
    packet = null;
    markerEl = null;
    packetPanel.hidden = true;
    packetPanel.replaceChildren();
    renderCanvas();
  }

  function renderPacket() {
    if (!packet) {
      packetPanel.hidden = true;
      return;
    }
    packetPanel.hidden = false;
    const total = packet.steps.length;
    const step = packet.steps[packet.index];
    packetPanel.replaceChildren(
      h('div', { class: 'net-packet-head' },
        h('h3', {}, 'Paquet ', h('span', { class: 'badge', 'data-tone': 'info', text: packet.protocol })),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: closePacket }, 'Fermer')),
      h('p', { class: 'net-packet-fields', style: 'margin:0' },
        h('span', {}, `Source : ${packet.from}`),
        h('span', {}, `Destination : ${packet.to}`),
        h('span', {}, `Résultat : ${packet.ok ? 'transmis' : 'refusé'}`)),
      h('p', { class: 'net-packet-step' }, h('strong', {}, `Étape ${packet.index + 1} / ${total}. `), step.text),
      h('div', { class: 'net-packet-controls' },
        h('button', {
          class: 'btn btn-small',
          type: 'button',
          disabled: packet.index === 0,
          onClick: () => goStep(packet.index - 1)
        }, 'Précédent'),
        h('button', {
          class: 'btn btn-small btn-primary',
          type: 'button',
          disabled: packet.index >= total - 1,
          onClick: () => goStep(packet.index + 1)
        }, 'Étape suivante'))
    );
  }

  /* ---------- Panneau ---------- */

  function renderPanel() {
    const device = selectedDevice();
    if (!device) return;
    const fields = [];
    const isRouter = device.type === 'router';

    if (!isRouter) {
      const ipField = h('input', { id: 'net-ip', type: 'text', value: device.ip || '', placeholder: '192.168.10.10', autocomplete: 'off' });
      const maskField = h('input', { id: 'net-mask', type: 'text', value: String(device.mask ?? ''), placeholder: '24 ou 255.255.255.0', autocomplete: 'off' });
      const gwField = h('input', { id: 'net-gw', type: 'text', value: device.gateway || '', placeholder: '192.168.10.1', autocomplete: 'off' });
      const dnsField = h('input', { id: 'net-dns', type: 'text', value: device.dns || '', placeholder: '10.0.20.53', autocomplete: 'off' });
      fields.push(
        h('div', { class: 'net-form' },
          h('div', { class: 'field' }, h('label', { for: 'net-ip' }, 'Adresse IP'), ipField),
          h('div', { class: 'field' }, h('label', { for: 'net-mask' }, 'Masque'), maskField),
          h('div', { class: 'field' }, h('label', { for: 'net-gw' }, 'Passerelle'), gwField),
          h('div', { class: 'field' }, h('label', { for: 'net-dns' }, 'Serveur DNS'), dnsField)
        ),
        h('div', { class: 'row' },
          h('button', {
            class: 'btn btn-primary btn-small',
            type: 'button',
            onClick: () => appliquer({ ip: ipField.value, mask: maskField.value, gateway: gwField.value, dns: dnsField.value })
          }, 'Appliquer'))
      );
    } else {
      fields.push(h('div', {},
        h('p', { class: 'small muted', style: 'margin:0 0 var(--s2)' }, 'Interfaces du routeur'),
        h('ul', { class: 'net-ifaces' }, (device.ifaces || []).map((i) => h('li', { text: `${i.name} : ${i.ip}/${i.mask}` })))
      ));
    }

    const fwList = h('ul', { class: 'net-rules' },
      (device.fw || []).length
        ? device.fw.map((rule, index) => h('li', {},
          h('span', { text: `${rule.action === 'deny' ? 'refuser' : 'autoriser'} ${rule.from}${rule.port !== null && rule.port !== undefined ? ` port ${rule.port}` : ''}` }),
          h('button', {
            class: 'btn btn-small btn-ghost',
            type: 'button',
            'aria-label': `Supprimer la règle ${index + 1}`,
            onClick: () => {
              device.fw.splice(index, 1);
              changed();
            }
          }, 'Supprimer')))
        : h('li', { class: 'muted', text: 'Aucune règle : tout le trafic est autorisé.' }));

    const actionSelect = h('select', { 'aria-label': 'Action de la règle' },
      h('option', { value: 'deny' }, 'Refuser'),
      h('option', { value: 'allow' }, 'Autoriser'));
    const fromInput = h('input', { type: 'text', placeholder: '192.168.10.0/24', 'aria-label': 'Source de la règle' });
    const portInput = h('input', { type: 'number', min: '0', max: '65535', placeholder: '22', 'aria-label': 'Port de la règle' });

    const toolsTarget = h('select', { id: 'net-target', 'aria-label': 'Appareil cible' },
      topo.devices.filter((d) => d.id !== device.id && (d.ip || d.type === 'router'))
        .map((d) => h('option', { value: d.id }, d.name)));
    const portField = h('input', { id: 'net-port', type: 'number', min: '0', max: '65535', placeholder: '0 = ICMP', 'aria-label': 'Port à tester' });
    const dnsName = h('input', { id: 'net-dnsname', type: 'text', placeholder: 'intranet.lab', 'aria-label': 'Nom à résoudre' });

    panel.replaceChildren(
      h('h3', { text: `Appareil : ${device.name}` }),
      ...fields,
      h('section', { class: 'net-section', 'aria-labelledby': 'net-fw-title' },
        h('h4', { id: 'net-fw-title', text: 'Pare-feu' }),
        fwList,
        h('p', { class: 'small muted', style: 'margin:0' }, 'Les nouvelles règles sont ajoutées en tête : la première règle qui correspond s\'applique.'),
        h('div', { class: 'net-rule-form' },
          actionSelect, fromInput, portInput,
          h('button', {
            class: 'btn btn-small',
            type: 'button',
            onClick: () => {
              const from = fromInput.value.trim();
              if (!/^[0-9.]+\/\d{1,2}$/.test(from)) {
                toast('Source attendue au format CIDR, par exemple 192.168.10.0/24.', 'error', 3000);
                return;
              }
              device.fw = device.fw || [];
              // Les règles sont évaluées dans l'ordre : la nouvelle passe en tête.
              device.fw.unshift({ action: actionSelect.value, from, port: portInput.value === '' ? null : Number(portInput.value) });
              changed();
            }
          }, 'Ajouter'))
      ),
      h('section', { class: 'net-section', 'aria-labelledby': 'net-tools-title' },
        h('h4', { id: 'net-tools-title', text: 'Tester depuis cet appareil' }),
        h('div', { class: 'net-tools-row' }, toolsTarget, portField,
          h('button', {
            class: 'btn btn-small',
            type: 'button',
            onClick: () => {
              const port = Number(portField.value || 0);
              const target = topo.devices.find((d) => d.id === toolsTarget.value);
              const result = canReach(topo, device.id, toolsTarget.value, port);
              log(`${device.name} → ${target?.name}${port ? ` (port ${port})` : ' (ICMP)'} : ${result.ok ? 'réussi' : 'échec'}`, result.ok ? 'ok' : 'ko');
              if (!result.ok) log(`  ${result.reason}`, 'ko');
              else if (result.path.length > 2) log(`  chemin : ${result.path.map((id) => topo.devices.find((d) => d.id === id)?.name).join(' → ')}`);
              if (target) showPacket(result, device, target, port);
            }
          }, 'Tester'))
        ,
        h('div', { class: 'net-tools-row' }, dnsName,
          h('button', {
            class: 'btn btn-small',
            type: 'button',
            onClick: () => {
              const name = dnsName.value.trim();
              if (!name) return;
              const result = resolveDns(topo, device.id, name);
              log(`${device.name} → DNS ${name} : ${result.ok ? result.ip : 'échec'}`, result.ok ? 'ok' : 'ko');
              if (!result.ok) log(`  ${result.reason}`, 'ko');
            }
          }, 'Résoudre'))
      )
    );
  }

  function appliquer(values) {
    const device = selectedDevice();
    const ip = values.ip.trim();
    const gateway = values.gateway.trim();
    const dns = values.dns.trim();
    const prefix = parsePrefix(values.mask);

    if (ip && !validIp(ip)) { toast('Adresse IP invalide.', 'error'); return; }
    if (prefix === null) { toast('Masque invalide : 24 ou 255.255.255.0.', 'error'); return; }
    if (gateway && !validIp(gateway)) { toast('Passerelle invalide.', 'error'); return; }
    if (dns && !validIp(dns)) { toast('Serveur DNS invalide.', 'error'); return; }

    device.ip = ip;
    device.mask = prefix;
    device.gateway = gateway;
    device.dns = dns;
    changed();
  }

  function changed() {
    renderCanvas();
    renderPanel();
    refreshObjectives();
    save(topo, scenarioId, [...done]);
  }

  /* ---------- Objectifs ---------- */

  function refreshObjectives() {
    const results = checkObjectives(topo, scenario.objectives.map((o) => o.check));
    objectiveList.replaceChildren(...scenario.objectives.map((obj, i) => {
      const ok = results[i];
      if (ok) done.add(obj.id); else done.delete(obj.id);
      return h('li', { class: ok ? 'is-done' : '' },
        h('span', { class: 'term-check', 'aria-hidden': 'true', text: ok ? '✓' : '○' }),
        h('span', { text: obj.text }),
        h('span', { class: 'sr-only' }, ok ? ' (atteint)' : ' (non atteint)'));
    }));
    const reached = results.filter(Boolean).length;
    progress.textContent = `${reached} / ${scenario.objectives.length} objectif(s) atteint(s)`;
    return reached === scenario.objectives.length;
  }

  function refreshHints() {
    hintBox.replaceChildren();
    if (!scenario.hints?.length) return;
    if (hintsShown) hintBox.append(h('ol', { class: 'term-hint-list' }, scenario.hints.slice(0, hintsShown).map((t) => h('li', { text: t }))));
    if (hintsShown < scenario.hints.length) {
      hintBox.append(h('button', {
        class: 'btn btn-small',
        type: 'button',
        onClick: () => { hintsShown += 1; refreshHints(); }
      }, `Indice (${hintsShown}/${scenario.hints.length})`));
    }
  }

  function chargerScenario(id) {
    const next = data.scenarios.find((s) => s.id === id);
    if (!next) return;
    scenario = next;
    scenarioId = next.id;
    topo = buildTopology(data.seed, scenario.setup);
    done = new Set();
    selectedId = topo.devices.find((d) => d.ip)?.id || topo.devices[0].id;
    hintsShown = 0;
    packet = null;
    markerEl = null;
    packetPanel.hidden = true;
    packetPanel.replaceChildren();
    consoleList.replaceChildren();
    scenarioSelect.value = next.id;
    scTitle.textContent = next.title;
    scDesc.textContent = next.description;
    renderCanvas();
    renderPanel();
    refreshHints();
    refreshObjectives();
    save(topo, scenarioId, []);
  }

  async function reinitialiser() {
    const ok = await confirmDialog({
      title: 'Réinitialiser le scénario ?',
      text: 'La topologie reviendra à son état de départ pour ce scénario et les objectifs seront effacés.',
      confirmLabel: 'Réinitialiser'
    });
    if (!ok) return;
    chargerScenario(scenarioId);
    toast('Topologie réinitialisée.', 'info', 2000);
  }

  function voirSolution() {
    const dialog = h('dialog', { 'aria-labelledby': 'net-sol-title' },
      h('h2', { id: 'net-sol-title' }, `Solution : ${scenario.title}`),
      h('p', { text: scenario.solution }),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onClick: () => dialog.close() }, 'Fermer')));
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  /* ---------- Calculateur ---------- */

  const calcIp = h('input', { id: 'calc-ip', type: 'text', value: '192.168.10.10', autocomplete: 'off' });
  const calcMask = h('input', { id: 'calc-mask', type: 'text', value: '24', autocomplete: 'off' });
  const calcResult = h('div', { class: 'net-calc-result', role: 'status', 'aria-live': 'polite' });

  function calculer() {
    const info = subnetInfo(calcIp.value.trim(), calcMask.value.trim());
    if (info.error) {
      calcResult.replaceChildren(alertBox('danger', info.error));
      return;
    }
    const row = (k, v) => h('div', { class: 'net-calc-row' }, h('span', { text: k }), h('strong', { text: v }));
    calcResult.replaceChildren(
      row('Réseau', info.cidr),
      row('Masque', info.mask),
      row('Première adresse', info.first || '—'),
      row('Dernière adresse', info.last || '—'),
      row('Diffusion', info.broadcast),
      row('Hôtes utilisables', String(info.usable))
    );
  }

  /* ---------- Montage ---------- */

  const root = h('div', { class: 'page' },
    h('nav', { class: 'breadcrumb', 'aria-label': 'Fil d\'Ariane' },
      h('ol', {}, h('li', {}, h('a', { href: '#/labo' }, 'Labo')), h('li', { 'aria-current': 'page' }, 'Simulateur réseau'))),
    h('header', { class: 'page-head' },
      h('div', { class: 'row' }, h('h1', { tabindex: '-1', text: 'Simulateur réseau' }), h('span', { class: 'badge', 'data-tone': 'info' }, ' modèle pédagogique')),
      h('p', { text: 'Adressez les appareils, testez la joignabilité, la résolution DNS et le filtrage. Aucun paquet réel n\'est émis.' })),
    h('div', { class: 'net-toolbar' },
      h('div', { class: 'field', style: 'min-width:240px' }, h('label', { for: 'net-scenario' }, 'Scénario guidé'), scenarioSelect),
      h('div', { class: 'row', style: 'margin-left:auto' },
        h('button', { class: 'btn', type: 'button', onClick: reinitialiser }, icon('refresh', { size: 16 }), 'Réinitialiser'),
        h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: voirSolution }, 'Voir la solution'))),
    h('div', { class: 'net-layout' },
      h('section', { class: 'net-main', 'aria-label': 'Topologie du réseau' }, canvas, packetPanel),
      h('div', { class: 'net-side' },
        h('section', { class: 'card', 'aria-labelledby': 'net-panel-title' },
          h('h2', { id: 'net-panel-title', class: 'sr-only' }, 'Configuration de l\'appareil'),
          panel),
        h('section', { class: 'card', 'aria-labelledby': 'net-console-title' },
          h('div', { class: 'net-console-head' },
            h('h2', { id: 'net-console-title', text: 'Résultats' }),
            h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => consoleList.replaceChildren() }, 'Effacer')),
          consoleList))),
    h('section', { class: 'card net-scenario', 'aria-labelledby': 'net-sc-title' },
      scTitle,
      scDesc,
      progress,
      objectiveList,
      h('h3', { text: 'Indices' }),
      hintBox),
    h('section', { class: 'card', 'aria-labelledby': 'calc-title' },
      h('h2', { id: 'calc-title', style: 'margin-top:0;font-size:1.15rem' }, 'Calculateur de sous-réseau'),
      h('div', { class: 'net-calc-form' },
        h('div', { class: 'field' }, h('label', { for: 'calc-ip' }, 'Adresse IP'), calcIp),
        h('div', { class: 'field' }, h('label', { for: 'calc-mask' }, 'Masque'), calcMask),
        h('button', { class: 'btn btn-primary btn-small', type: 'button', onClick: calculer }, 'Calculer')),
      calcResult),
    alertBox('info', 'Le modèle comporte un routeur et deux réseaux. Le pare-feu applique des règles par source et par port, dans l\'ordre de la liste. Ce simulateur ne remplace pas un laboratoire réel.')
  );

  outlet.replaceChildren(root);
  scTitle.textContent = scenario.title;
  scDesc.textContent = scenario.description;
  renderCanvas();
  renderPanel();
  refreshHints();
  refreshObjectives();
  calculer();

  return () => {
    save(topo, scenarioId, [...done]);
  };
}
