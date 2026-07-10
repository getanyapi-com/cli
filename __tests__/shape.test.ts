import { describe, expect, it } from 'vitest';
import { hasShapeFlags, shapeOutput } from '../src/shape.js';

describe('shapeOutput detail scope', () => {
  const detail = { found: true, data: { title: 'Hi', description: 'Desc', markdown: '0123456789' } };

  it('projects dotted fields on a nested detail scope and keeps the data wrapper', () => {
    const shaped = shapeOutput(detail, { fields: ['title', 'description'] }) as {
      found: boolean;
      data: Record<string, unknown>;
    };
    expect(shaped.found).toBe(true);
    expect(shaped.data).toEqual({ title: 'Hi', description: 'Desc' });
    expect('markdown' in shaped.data).toBe(false);
  });

  it('is a no-op on a detail scope when no fields are given (max_items does not apply)', () => {
    expect(shapeOutput(detail, { maxItems: 1 })).toEqual(detail);
  });

  it('does not mutate the input value', () => {
    const before = JSON.stringify(detail);
    shapeOutput(detail, { fields: ['title'] });
    expect(JSON.stringify(detail)).toBe(before);
  });
});

describe('shapeOutput array scope', () => {
  const result = {
    found: true,
    data: {
      items: [
        { id: 1, author: { name: 'a', handle: '@a' }, body: 'x' },
        { id: 2, author: { name: 'b', handle: '@b' }, body: 'y' },
        { id: 3, author: { name: 'c', handle: '@c' }, body: 'z' },
      ],
      cursor: 'next',
    },
  };

  it('caps items with max_items and writes a _truncated marker', () => {
    const shaped = shapeOutput(result, { maxItems: 2 }) as { data: { items: unknown[]; _truncated: unknown } };
    expect(shaped.data.items).toHaveLength(2);
    expect(shaped.data._truncated).toEqual({ shown: 2, total: 3 });
  });

  it('projects dotted-path fields on each item', () => {
    const shaped = shapeOutput(result, { fields: ['id', 'author.name'] }) as { data: { items: unknown[] } };
    expect(shaped.data.items[0]).toEqual({ id: 1, author: { name: 'a' } });
  });

  it('resolves the sole array when there is no items key', () => {
    const rows = { found: true, data: { rows: [{ a: 1 }, { a: 2 }] } };
    const shaped = shapeOutput(rows, { maxItems: 1 }) as { data: { rows: unknown[]; _truncated: unknown } };
    expect(shaped.data.rows).toHaveLength(1);
    expect(shaped.data._truncated).toEqual({ shown: 1, total: 2 });
  });
});

describe('shapeOutput summary', () => {
  it('reports fieldBytes for the first item plus scope siblings on an array scope', () => {
    const result = {
      found: true,
      data: { items: [{ title: 'hello', body: 'world' }], cursor: 'c' },
    };
    const shaped = shapeOutput(result, { summary: true }) as {
      _summary: { itemsField: string; items: number; itemFields: string[]; fieldBytes: Record<string, number> };
    };
    expect(shaped._summary.itemsField).toBe('items');
    expect(shaped._summary.items).toBe(1);
    expect(shaped._summary.itemFields).toEqual(['body', 'title']);
    expect(shaped._summary.fieldBytes.title).toBe(Buffer.byteLength('"hello"'));
    expect(shaped._summary.fieldBytes.cursor).toBe(Buffer.byteLength('"c"'));
  });

  it('reports fieldBytes for every field on a detail scope', () => {
    const detail = { found: true, data: { markdown: 'abcd' } };
    const shaped = shapeOutput(detail, { summary: true }) as { _summary: { fieldBytes: Record<string, number> } };
    expect(shaped._summary.fieldBytes.markdown).toBe(Buffer.byteLength('"abcd"'));
  });
});

describe('hasShapeFlags', () => {
  it('is false with no controls and true when any control or jq is set', () => {
    expect(hasShapeFlags({})).toBe(false);
    expect(hasShapeFlags({ fields: ['a'] })).toBe(true);
    expect(hasShapeFlags({ maxItems: 0 })).toBe(true);
    expect(hasShapeFlags({ summary: true })).toBe(true);
    expect(hasShapeFlags({ jq: '.data' })).toBe(true);
  });
});
