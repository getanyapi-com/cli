import { describe, expect, it } from 'vitest';
import { JqEvalError, evalJq } from '../src/jq.js';

describe('evalJq', () => {
  it('slices a string with jq range syntax', async () => {
    const out = await evalJq({ found: true, data: { markdown: '0123456789' } }, '.data.markdown[2:5]');
    expect(out).toBe('234');
  });

  it('constructs an object', async () => {
    const out = await evalJq({ data: { title: 'Hi', description: 'D', markdown: 'abcdef' } }, '.data | {title, md: .markdown[:3]}');
    expect(out).toEqual({ title: 'Hi', md: 'abc' });
  });

  it('collapses multiple outputs into an array', async () => {
    const out = await evalJq({ data: { items: [1, 2, 3] } }, '.data.items[]');
    expect(out).toEqual([1, 2, 3]);
  });

  it('returns null for zero outputs', async () => {
    const out = await evalJq({ a: 1 }, 'empty');
    expect(out).toBeNull();
  });

  it('throws JqEvalError on a compile error', async () => {
    await expect(evalJq({ a: 1 }, '.[')).rejects.toBeInstanceOf(JqEvalError);
  });
});
