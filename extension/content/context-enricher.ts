// Hermes Context Enricher (Stage A)
// Generic, site-agnostic disambiguation of duplicate interactive elements.
//
// Problem: on grid/list pages (Netflix rows, feeds, marketplaces) many controls
// share the same accessible label — every movie card's play button is "play" —
// so a flat element list gives the agent no way to tell which play button
// belongs to which movie, and it ends up clicking the first one.
//
// Solution: for every element whose (role, label) is duplicated, climb the DOM
// to the containing card/group and attach the group's most descriptive text
// (heading > image alt > aria-label/title > link text > plain text) as a
// `context` anchor. The LLM then sees `label="play" context="Inception"` and
// matches task words to context instead of counting identical buttons.
//
// This runs entirely on the DOM the page already exposes — no screenshots, no
// models. (OCR/vision are the fallback tiers for pages whose identity text is
// rendered as pixels; those slot in behind the `ambiguous` flag we leave here.)

import type { HermesElement } from '../utils/messaging';

// ─── Tunables ──────────────────────────────────────────────

/** How far up the ancestor chain we look for a descriptive anchor. */
const MAX_ANCESTOR_DEPTH = 4;

/** Containers holding more interactive elements than this are treated as large
 *  lists/rows — their own text describes the row, not a single item. */
const MAX_INTERACTIVES_IN_GROUP = 12;

/** Container subtrees bigger than this are not scanned (perf guard). */
const MAX_CONTAINER_CHARS = 20000;

/** Minimum anchor score for a candidate to be accepted. */
const ACCEPT_SCORE = 0.7;

/** Ancestor tags where we stop hunting (app chrome, not content). */
const BOUNDARY_TAGS = new Set(['NAV', 'HEADER', 'FOOTER']);

/** Ancestor roles that group many unrelated controls — stop below them. */
const BOUNDARY_ROLES = new Set(['menu', 'menubar', 'toolbar', 'tablist', 'listbox', 'tree']);

/** Words that describe a control, not the content it belongs to. An anchor is
 *  only usable when it contains at least one token outside this set (and
 *  outside the element's own label). */
const GENERIC_WORDS = new Set(
  ('play pause more info open close view save cancel submit share like comment reply follow ' +
   'add edit delete remove back next previous prev start stop menu options settings download ' +
   'install get watch see trailer details episodes season cast moreinfo arrow chevron close ' +
   'ok done yes no today now trending continue login signup sign register').split(/\s+/)
);

// ─── Scoring ───────────────────────────────────────────────

type AnchorKind = 'heading' | 'img-alt' | 'aria' | 'title' | 'link' | 'text';

interface AnchorCandidate {
  text: string;
  kind: AnchorKind;
  score: number;
}

function norm(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function lower(s: string): string {
  return norm(s).toLowerCase();
}

/** Base score per anchor kind (a title beats a stray span). */
function kindScore(kind: AnchorKind): number {
  switch (kind) {
    case 'heading': return 1.0;
    case 'img-alt': return 0.95;
    case 'aria': return 0.9;
    case 'link': return 0.85;
    case 'title': return 0.8;
    case 'text': return 0.75;
  }
}

/**
 * Does `text` carry identity (as opposed to being a generic control label)?
 * Requires at least one content token that is neither a generic word nor part
 * of the element's own label.
 */
function hasIdentityToken(text: string, ownLabelTokens: Set<string>): boolean {
  const tokens = lower(text).match(/[a-z0-9][a-z0-9'’.\-]*/g) || [];
  for (const t of tokens) {
    const w = t.replace(/['’.\-]+/g, '');
    if (w.length < 3) continue;
    if (GENERIC_WORDS.has(w)) continue;
    if (ownLabelTokens.has(w)) continue;
    return true;
  }
  return false;
}

/** Number of stamped Hermes elements inside `container` (excluding itself). */
function countInteractives(container: Node, stamped: HTMLElement[]): number {
  let n = 0;
  for (const node of stamped) {
    if (node !== container && container.contains(node)) n++;
  }
  return n;
}

// ─── DOM traversal ─────────────────────────────────────────

/** Collect every stamped [data-hermes-id] element, incl. shadow DOM. */
function collectStamped(): HTMLElement[] {
  const out: HTMLElement[] = [];
  const visited = new Set<Node>();
  const walk = (root: ParentNode) => {
    for (const child of Array.from(root.querySelectorAll('[data-hermes-id]'))) {
      if (child instanceof HTMLElement) out.push(child);
    }
    for (const child of Array.from(root.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (visited.has(child)) continue;
      visited.add(child);
      if (child.shadowRoot) walk(child.shadowRoot);
    }
  };
  walk(document.body);
  return out;
}

/**
 * Collect candidate anchor texts inside `container`.
 * - Stamped interactive controls are skipped as sources (their labels describe
 *   the control, not the group) — except that an ANCESTOR's own aria-label /
 *   alt / title attribute is a great anchor (e.g. the whole card is a link
 *   labelled "Inception").
 * - Text is harvested via a TreeWalker so we get leaves, not concatenated
 *   card text ("Inception…Play…").
 */
function collectAnchors(container: Element, el: HTMLElement, ownLabelTokens: Set<string>): AnchorCandidate[] {
  const candidates = new Map<string, AnchorCandidate>();

  const consider = (text: string, kind: AnchorKind) => {
    const t = norm(text);
    if (t.length < 2 || t.length > 120) return;
    const lc = lower(t);
    if (lc === '') return;
    if (!hasIdentityToken(t, ownLabelTokens)) return;
    const score = kindScore(kind) + Math.min(0.15, t.length / 400);
    const existing = candidates.get(lc);
    if (!existing || existing.score < score) {
      candidates.set(lc, { text: t, kind, score });
    }
  };

  const containsEl = container.contains(el) && container !== el;

  // 1. Attribute/query-driven anchors anywhere in the container.
  const querySel = 'h1,h2,h3,h4,h5,h6,[role="heading"],img[alt],a[href],[aria-label],[title],figcaption,time,strong,b,dt';
  for (const node of Array.from(container.querySelectorAll(querySel))) {
    if (!(node instanceof HTMLElement)) continue;
    // Skip the element itself and other stamped interactive controls (their
    // own labels are not group identity) — unless the node IS an ancestor of
    // the element, in which case only its attributes qualify (never its full
    // text, which would include the element's own label).
    const nodeIsEl = node === el;
    const stamped = node.hasAttribute('data-hermes-id');
    const isAncestor = node !== el && node.contains(el);
    if (nodeIsEl || (stamped && !isAncestor)) continue;

    const attr = node.getAttribute('aria-label') || node.getAttribute('title') || (node as HTMLImageElement).alt;
    if (attr) {
      const kind: AnchorKind = node.tagName === 'IMG' ? 'img-alt' : 'aria';
      consider(attr, kind);
      continue;
    }
    if (isAncestor) continue; // attribute-only for ancestors

    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag) || node.getAttribute('role') === 'heading') {
      consider(node.textContent || '', 'heading');
    } else if (tag === 'a' && node.getAttribute('href')) {
      consider(node.textContent || '', 'link');
    } else if (tag === 'figcaption' || tag === 'time' || tag === 'strong' || tag === 'b' || tag === 'dt') {
      consider(node.textContent || '', 'text');
    }
  }

  // 2. Plain leaf text nodes (title lives in a bare span/div on many sites).
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (n: Node) => {
      const p = n.parentElement;
      if (!p || !(p instanceof HTMLElement)) return NodeFilter.FILTER_REJECT;
      if (p.closest('script,style,noscript')) return NodeFilter.FILTER_REJECT;
      // Skip text inside stamped interactive controls (and the element itself).
      if (p.closest('[data-hermes-id]')) return NodeFilter.FILTER_REJECT;
      // Only leaf-ish nodes: parent has no element children besides this text.
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let tNode: Node | null;
  while ((tNode = walker.nextNode())) {
    const p = tNode.parentElement;
    if (!p || !(p instanceof HTMLElement)) continue;
    const kind: AnchorKind = /^h[1-6]$/.test(p.tagName.toLowerCase()) ? 'heading' : 'text';
    consider(tNode.textContent || '', kind);
  }

  return Array.from(candidates.values());
}

// ─── Main enrichment ───────────────────────────────────────

/**
 * Attach `context` (and flag `ambiguous`) to elements whose (role, label) is
 * duplicated on the page. Mutates and returns the same array.
 */
export function enrichWithContext(elements: HermesElement[]): HermesElement[] {
  if (elements.length < 2) return elements;

  // Normalized duplicate keys: role + label.
  const counts = new Map<string, number>();
  const keyOf = (el: HermesElement) => `${el.role}|${lower(el.label)}`;
  for (const el of elements) {
    if (!el.label || !norm(el.label)) continue; // empty labels can't be reasoned about
    const k = keyOf(el);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const duplicateKeys = new Set<string>();
  for (const [k, n] of counts) if (n > 1) duplicateKeys.add(k);

  if (duplicateKeys.size === 0) return elements;

  const stamped = collectStamped();
  if (stamped.length === 0) return elements;

  const elById = new Map<string, HermesElement>();
  for (const el of elements) elById.set(el.id, el);
  const elToNode = new Map<HermesElement, HTMLElement>();
  for (const node of stamped) {
    const id = node.getAttribute('data-hermes-id');
    const el = id ? elById.get(id) : undefined;
    if (el) elToNode.set(el, node);
  }

  // ─── Pass 1: nearest descriptive anchor per duplicated element ─────
  for (const el of elements) {
    if (!duplicateKeys.has(keyOf(el))) continue;
    const node = elToNode.get(el);
    if (!node || !node.isConnected) continue;

    const ownLabelTokens = new Set<string>(
      (lower(el.label).match(/[a-z0-9][a-z0-9'’]*/g) || []).map((t) => t.replace(/['’]/g, ''))
    );

    let anchor: AnchorCandidate | null = null;
    let cur: HTMLElement | null = node.parentElement;
    for (let depth = 0; cur && cur !== document.body && cur !== document.documentElement && depth < MAX_ANCESTOR_DEPTH; cur = cur.parentElement, depth++) {
      const tag = cur.tagName;
      const role = (cur.getAttribute('role') || '').toLowerCase();
      if (BOUNDARY_TAGS.has(tag) || BOUNDARY_ROLES.has(role)) break;

      const interactiveCount = countInteractives(cur, stamped);
      if (interactiveCount > MAX_INTERACTIVES_IN_GROUP) {
        // Big list container (a whole row of cards). Its own text describes
        // the row, not this item — keep climbing but don't anchor on it.
        continue;
      }
      const textLen = cur.textContent ? cur.textContent.length : 0;
      if (textLen > MAX_CONTAINER_CHARS) continue;

      const cands = collectAnchors(cur, node, ownLabelTokens);
      if (cands.length === 0) continue;
      const best = cands.reduce((a, b) => (b.score > a.score ? b : a), cands[0]);
      if (best.score >= ACCEPT_SCORE) {
        anchor = best;
        break; // nearest acceptable anchor wins
      }
    }

    if (anchor) {
      el.context = anchor.text.slice(0, 120);
      el.contextConfidence = Math.round(anchor.score * 100) / 100;
    }
  }

  // ─── Pass 2: flag duplicates that are STILL indistinguishable ───────
  // (role + label + context). When the same context repeats (e.g. every card
  // in a row anchored only to the row name), the context did not disambiguate
  // and the element stays ambiguous — the LLM must not guess blindly.
  const finalKeys = new Map<string, string[]>();
  for (const el of elements) {
    if (!duplicateKeys.has(keyOf(el))) continue;
    const ctx = el.context ? lower(el.context) : '';
    const k = `${el.role}|${lower(el.label)}|${ctx}`;
    const list = finalKeys.get(k) || [];
    list.push(el.id);
    finalKeys.set(k, list);
  }
  for (const [, ids] of finalKeys) {
    if (ids.length > 1) {
      for (const id of ids) {
        const el = elements.find((e) => e.id === id);
        if (!el) continue;
        el.ambiguous = true;
        // The shared context did not disambiguate — strip it so the LLM is
        // not misled into thinking these controls are distinguishable.
        el.context = undefined;
        el.contextConfidence = undefined;
      }
    }
  }

  return elements;
}
