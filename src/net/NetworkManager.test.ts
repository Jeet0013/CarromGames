/**
 * Room code parsing.
 *
 * A code reaches the other player by whatever route they had to hand, and it
 * does not always arrive whole. These cover the forms it actually turns up in.
 */

import { describe, expect, it } from 'vitest';

import { NetworkManager } from './NetworkManager';

describe('parseRoomCode', () => {
  it('accepts a bare code', () => {
    expect(NetworkManager.parseRoomCode('a1b2c3')).toBe('carrom-a1b2c3');
  });

  it('accepts the full room id', () => {
    expect(NetworkManager.parseRoomCode('carrom-a1b2c3')).toBe('carrom-a1b2c3');
  });

  it('accepts a whole link pasted back out of a chat', () => {
    expect(
      NetworkManager.parseRoomCode('https://example.com/game/?join=carrom-a1b2c3'),
    ).toBe('carrom-a1b2c3');
  });

  it('accepts a link whose code survived only in the hash', () => {
    expect(
      NetworkManager.parseRoomCode('https://example.com/game/#join=carrom-a1b2c3'),
    ).toBe('carrom-a1b2c3');
  });

  it('forgives the case and whitespace a phone keyboard adds', () => {
    expect(NetworkManager.parseRoomCode('  A1B2C3 ')).toBe('carrom-a1b2c3');
  });

  it('rejects what is plainly not a code, rather than dialling it', () => {
    expect(NetworkManager.parseRoomCode('')).toBeNull();
    expect(NetworkManager.parseRoomCode('hello there')).toBeNull();
    expect(NetworkManager.parseRoomCode('ab')).toBeNull();
    expect(NetworkManager.parseRoomCode('https://example.com/')).toBeNull();
  });
});
