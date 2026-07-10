import { evalJq } from './jq.js';

// ShapeControls are the local, opt-in response-budget controls (fields/max_items/
// summary). Unlike the old server-side query params, these run over the FULL saved
// result and never change what was billed: the paid run is saved in full and can be
// re-sliced for free. Ported from the gateway's core.ShapeOutput semantics.
export interface ShapeControls {
  // Fields projects each result item (or the detail scope object) down to these
  // keys. Dotted paths descend into nested objects (e.g. "author.name").
  fields?: string[];
  // MaxItems caps the returned array length; undefined = unset. When it trims, a
  // sibling "_truncated" object reports {shown, total}.
  maxItems?: number;
  // Summary returns a structural outline (keys + array length + first item keys +
  // per-field byte sizes) instead of bulk data. Takes precedence over the others.
  summary?: boolean;
}

// ShapeRequest is ShapeControls plus an optional jq expression applied AFTER the
// fields/max_items/summary controls.
export interface ShapeRequest extends ShapeControls {
  jq?: string;
}

export function shapeControlsActive(c: ShapeControls): boolean {
  return (c.fields?.length ?? 0) > 0 || c.maxItems !== undefined || c.summary === true;
}

export function hasShapeFlags(r: ShapeRequest): boolean {
  return shapeControlsActive(r) || (r.jq?.length ?? 0) > 0;
}

// shapeAndJq applies the fields/max_items/summary controls and then, when set, the
// jq expression over that shaped value. jq errors reject (JqEvalError) so a caller
// can surface the message; the full result stays safe on disk.
export async function shapeAndJq(target: unknown, r: ShapeRequest): Promise<unknown> {
  const shaped = shapeOutput(target, r);
  if (!r.jq) {
    return shaped;
  }
  return evalJq(shaped, r.jq);
}

// shapeOutput applies the budget controls to a parsed result value. It resolves a
// scope (the nested `data` object when present, else the top level), finds the
// result array (key `items` or the sole array), and trims. On any structural
// surprise it returns the value unchanged rather than corrupt a result.
export function shapeOutput(value: unknown, c: ShapeControls): unknown {
  if (!shapeControlsActive(c) || !isRecord(value)) {
    return value;
  }
  const top = structuredClone(value) as Record<string, unknown>;
  const nested = isRecord(top.data);
  const scope = (nested ? top.data : top) as Record<string, unknown>;
  const key = itemsKey(scope);

  if (c.summary) {
    return summarize(top, scope, key);
  }

  if (key === '') {
    // Detail scope (e.g. web.scrape): a flat object with no result array. max_items
    // is a no-op; a fields projection still applies to the scope object itself.
    if (!c.fields || c.fields.length === 0) {
      return value;
    }
    const projected = projectFields(scope, c.fields);
    if (!nested) {
      return projected;
    }
    top.data = projected;
    return top;
  }

  const arr = scope[key] as unknown[];
  const total = arr.length;
  let out = arr;
  if (c.maxItems !== undefined && c.maxItems < total) {
    out = arr.slice(0, c.maxItems);
    scope._truncated = { shown: out.length, total };
  }
  if (c.fields && c.fields.length > 0) {
    out = out.map((el) => projectFields(el, c.fields as string[]));
  }
  scope[key] = out;
  return top;
}

function itemsKey(scope: Record<string, unknown>): string {
  if (Array.isArray(scope.items)) {
    return 'items';
  }
  for (const k of Object.keys(scope)) {
    if (Array.isArray(scope[k])) {
      return k;
    }
  }
  return '';
}

function projectFields(el: unknown, fields: string[]): unknown {
  if (!isRecord(el)) {
    return el;
  }
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    setPath(out, el, f.split('.'));
  }
  return out;
}

function setPath(dst: Record<string, unknown>, src: Record<string, unknown>, parts: string[]): void {
  const k = parts[0];
  if (!(k in src)) {
    return;
  }
  const v = src[k];
  if (parts.length === 1) {
    dst[k] = v;
    return;
  }
  if (!isRecord(v)) {
    dst[k] = v;
    return;
  }
  let sub = dst[k];
  if (!isRecord(sub)) {
    sub = {};
    dst[k] = sub;
  }
  setPath(sub as Record<string, unknown>, v, parts.slice(1));
}

// summarize builds a structural outline: the top-level keys, and (when a result
// array exists) its length, key, and the first item's keys, plus fieldBytes - the
// compact JSON byte size of each notable field - so an agent learns WHAT is huge
// before spending context to fetch it.
function summarize(
  top: Record<string, unknown>,
  scope: Record<string, unknown>,
  key: string,
): { _summary: Record<string, unknown> } {
  const out: Record<string, unknown> = { fields: sortedKeys(top) };
  const fieldBytes: Record<string, number> = {};
  if (key === '') {
    for (const k of Object.keys(scope)) {
      fieldBytes[k] = byteLen(scope[k]);
    }
  } else {
    const arr = scope[key] as unknown[];
    out.itemsField = key;
    out.items = arr.length;
    if (arr.length > 0 && isRecord(arr[0])) {
      const first = arr[0] as Record<string, unknown>;
      out.itemFields = sortedKeys(first);
      for (const k of Object.keys(first)) {
        fieldBytes[k] = byteLen(first[k]);
      }
    }
    for (const k of Object.keys(scope)) {
      if (k === key || Array.isArray(scope[k])) {
        continue;
      }
      fieldBytes[k] = byteLen(scope[k]);
    }
  }
  if (Object.keys(fieldBytes).length > 0) {
    out.fieldBytes = fieldBytes;
  }
  return { _summary: out };
}

function byteLen(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null));
}

function sortedKeys(m: Record<string, unknown>): string[] {
  return Object.keys(m).sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
