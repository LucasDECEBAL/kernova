// Éléments d'interface transverses : notifications, dialogue de confirmation, thème, copie.

import { h } from './dom.js';

let toastRoot = null;

function ensureToastRoot() {
  if (!toastRoot) {
    toastRoot = h('div', { class: 'toasts', role: 'region', 'aria-label': 'Notifications' });
    document.body.append(toastRoot);
  }
  return toastRoot;
}

/** Affiche une notification temporaire. kind : 'info' | 'success' | 'error' */
export function toast(message, kind = 'info', duration = 3500) {
  const root = ensureToastRoot();
  const el = h('div', { class: 'toast', 'data-kind': kind, role: kind === 'error' ? 'alert' : 'status' }, message);
  root.append(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 320);
  }, duration);
  return el;
}

/**
 * Dialogue de confirmation accessible (élément <dialog> natif : focus et Échap gérés).
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, text, confirmLabel = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { 'aria-labelledby': 'confirm-title' },
      h('h2', { id: 'confirm-title', text: title }),
      h('p', { text }),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', value: 'cancel', onClick: () => dialog.close('cancel') }, 'Annuler'),
        h('button', {
          class: danger ? 'btn btn-danger' : 'btn btn-primary',
          type: 'button',
          onClick: () => dialog.close('ok')
        }, confirmLabel)
      )
    );
    dialog.addEventListener('close', () => {
      const ok = dialog.returnValue === 'ok';
      dialog.remove();
      resolve(ok);
    });
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('.dialog-actions .btn:not(.btn-primary):not(.btn-danger)')?.focus();
  });
}

/** Copie un texte dans le presse-papiers, avec repli pour les contextes restreints. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* on tente le repli ci-dessous */ }
  const area = h('textarea', { style: 'position:fixed;opacity:0;top:0;left:0' });
  area.value = text;
  document.body.append(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  area.remove();
  return ok;
}

/** Applique le thème demandé sur <html>. 'system' suit la préférence du système. */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' || theme === 'dark' ? theme : 'system';
}

/** Thème réellement affiché (utile pour le bouton de bascule). */
export function effectiveTheme() {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
