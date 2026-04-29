import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function extractFnSource(html, fnStartRegex, fnEndRegex) {
  const start = html.match(fnStartRegex)?.index;
  if (start == null) throw new Error('Could not locate function start');
  const tail = html.slice(start);
  const end = tail.match(fnEndRegex)?.index;
  if (end == null) throw new Error('Could not locate function end');
  // fnEndRegex is expected to match from the start of the end marker; include everything up to end marker.
  const src = tail.slice(0, end).trimEnd();
  return src;
}

class MockElement {
  constructor(tag) {
    this.tagName = String(tag || '').toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.className = '';
    this.textContent = '';
    this.removed = false;
    this._listeners = {};
    this._innerHTML = '';
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  remove() {
    this.removed = true;
  }

  setAttribute(name, value) {
    const k = String(name);
    const v = String(value ?? '');
    this.attributes[k] = v;
    // minimal data-* mapping for tests
    if (k.startsWith('data-')) {
      const d = k.slice('data-'.length).replace(/-([a-z])/g, (_, c) => String(c).toUpperCase());
      this.dataset[d] = v;
    }
  }

  getAttribute(name) {
    return this.attributes[String(name)];
  }

  addEventListener(evt, cb) {
    this._listeners[String(evt)] = cb;
  }

  click() {
    const cb = this._listeners['click'];
    if (typeof cb === 'function') cb({ preventDefault: () => {} });
  }

  // Guard: if any code tries to set innerHTML dynamically, fail the test.
  set innerHTML(_val) {
    throw new Error('innerHTML setter should not be used in this hardened path');
  }

  get innerHTML() {
    return this._innerHTML;
  }
}

function flattenTags(el, out) {
  if (!el) return out;
  if (!Array.isArray(out)) out = [];
  out.push(el.tagName);
  for (const c of el.children || []) flattenTags(c, out);
  return out;
}

describe('dashboard XSS hardening: showToast + transcript error UI', () => {
  test('showToast does not interpret HTML in title/message', () => {
    const htmlPath = path.join(process.cwd(), 'public', 'client-dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    const showToastSrc = extractFnSource(
      html,
      /function\s+showToast\s*\(title,\s*message,\s*type\s*=\s*'info',\s*duration\s*=\s*3000\s*\)\s*\{/,
      /\n\s*function\s+clearTranscriptEndedByBanner\s*\(/
    );

    const toastContainer = new MockElement('div');
    toastContainer.id = 'toastContainer';

    const document = {
      getElementById: (id) => (id === 'toastContainer' ? toastContainer : null),
      createElement: (tag) => new MockElement(tag),
    };

    const sandbox = {
      document,
      setTimeout: () => 0,
      console: { ...console },
    };

    vm.runInNewContext(`${showToastSrc}`, sandbox, { timeout: 1000 });
    const { showToast } = sandbox;

    const malicious = '<img src=x onerror="alert(1)">';
    showToast(malicious, malicious, 'error', 1000);

    expect(toastContainer.children.length).toBe(1);
    const toastEl = toastContainer.children[0];

    // Ensure no IMG nodes were created (since we use textContent).
    const tags = flattenTags(toastEl, []);
    expect(tags).not.toContain('IMG');

    // Ensure the title/message are rendered as plain text.
    const findByClass = (node, className) => {
      if (!node) return null;
      if (node.className === className) return node;
      for (const c of node.children || []) {
        const f = findByClass(c, className);
        if (f) return f;
      }
      return null;
    };
    const titleEl = findByClass(toastEl, 'toast-title');
    const msgEl = findByClass(toastEl, 'toast-message');
    expect(titleEl?.textContent).toBe(malicious);
    expect(msgEl?.textContent).toBe(malicious);
  });

  test('setTranscriptErrorUi does not interpret HTML in error.message and Retry uses data attrs', () => {
    const htmlPath = path.join(process.cwd(), 'public', 'client-dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    const helperSrc = extractFnSource(
      html,
      /function\s+setTranscriptErrorUi\s*\(contentEl,\s*error,\s*callId,\s*name\)\s*\{/,
      /\n\s*async\s+function\s+viewTranscript\s*\(/
    );

    const document = {
      createElement: (tag) => new MockElement(tag),
    };

    const sandbox = {
      document,
      console: { ...console },
    };

    vm.runInNewContext(`${helperSrc}`, sandbox, { timeout: 1000 });
    const { setTranscriptErrorUi } = sandbox;

    const contentEl = new MockElement('div');
    const malicious = '<svg/onload=alert(1)>';
    setTranscriptErrorUi(contentEl, { message: malicious }, 'call-123', 'Alice');

    expect(contentEl.children.length).toBe(1);
    const tags = flattenTags(contentEl, []);
    expect(tags).not.toContain('SVG');

    // Find retry button.
    const findByTagAndAttr = (node, tag, attrKey, attrVal) => {
      if (!node) return null;
      if (node.tagName === String(tag).toUpperCase()) {
        if (node.getAttribute?.(attrKey) === String(attrVal)) return node;
      }
      for (const c of node.children || []) {
        const f = findByTagAndAttr(c, tag, attrKey, attrVal);
        if (f) return f;
      }
      return null;
    };

    const retryBtn = findByTagAndAttr(contentEl, 'button', 'data-view-transcript', 'call-123');
    expect(retryBtn).toBeTruthy();
    expect(retryBtn.textContent).toBe('Retry');
    expect(retryBtn.getAttribute('data-view-name')).toBe('Alice');

    // Ensure error message rendered as plain text.
    const findByText = (node, txt) => {
      if (!node) return null;
      if (node.textContent === String(txt)) return node;
      for (const c of node.children || []) {
        const f = findByText(c, txt);
        if (f) return f;
      }
      return null;
    };
    expect(findByText(contentEl, malicious)).toBeTruthy();
  });
});

