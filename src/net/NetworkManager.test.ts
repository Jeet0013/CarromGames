/**
 * Room code parsing.
 *
 * A code reaches the other player by whatever route they had to hand, and it
 * does not always arrive whole. These cover the forms it actually turns up in.
 */

import { describe, expect, it } from 'vitest';

import { isShareableOrigin, NetworkManager } from './NetworkManager';

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

describe('isShareableOrigin', () => {
  /*
   * The share link is built from wherever the game is loaded. Handing someone
   * an address that only resolves on the sender's own machine is the quiet
   * failure this exists to catch: the link is well-formed, it simply cannot
   * work, and without a warning the game takes the blame.
   */
  it('accepts a public address', () => {
    expect(isShareableOrigin('https://carrom.example.com/?join=carrom-a1b2c3')).toBe(true);
    expect(isShareableOrigin('http://203.0.113.7/game/')).toBe(true);
  });

  it('rejects a file opened off disk', () => {
    expect(isShareableOrigin('file:///Users/someone/carrom-arena.html')).toBe(false);
  });

  it('rejects loopback', () => {
    expect(isShareableOrigin('http://localhost:5173/')).toBe(false);
    expect(isShareableOrigin('http://127.0.0.1:5173/')).toBe(false);
    expect(isShareableOrigin('http://[::1]:5173/')).toBe(false);
  });

  it('rejects the private ranges a dev server lands on', () => {
    expect(isShareableOrigin('http://192.168.1.20:5173/')).toBe(false);
    expect(isShareableOrigin('http://10.0.0.5:5173/')).toBe(false);
    expect(isShareableOrigin('http://172.16.30.98:5173/')).toBe(false);
    expect(isShareableOrigin('http://172.31.255.254:5173/')).toBe(false);
    expect(isShareableOrigin('http://169.254.10.1:5173/')).toBe(false);
  });

  it('does not mistake neighbouring public blocks for private ones', () => {
    // 172.15 and 172.32 sit either side of the private range and are public.
    expect(isShareableOrigin('http://172.15.0.1/')).toBe(true);
    expect(isShareableOrigin('http://172.32.0.1/')).toBe(true);
    expect(isShareableOrigin('http://110.0.0.1/')).toBe(true);
  });

  it('stays quiet when it cannot tell', () => {
    expect(isShareableOrigin('not a url')).toBe(true);
  });
});
