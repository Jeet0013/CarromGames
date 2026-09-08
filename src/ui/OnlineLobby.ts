/**
 * Online lobby: create a room, share the link, or wait to be joined.
 *
 * The share link is the whole feature, so it is the largest thing on screen and
 * the copy button is the primary action. A room code is shown alongside it
 * because links do not survive being read aloud, and people play in the same
 * room as often as not.
 */

export type LobbyMode = 'hosting' | 'joining';

export class OnlineLobby {
  readonly #root: HTMLElement;
  readonly #title: HTMLElement;
  readonly #status: HTMLElement;
  readonly #linkBox: HTMLElement;
  readonly #linkText: HTMLElement;
  readonly #copy: HTMLButtonElement;
  readonly #code: HTMLElement;
  #visible = false;
  #link = '';

  constructor(container: HTMLElement, onCancel: () => void) {
    this.#root = document.createElement('div');
    this.#root.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:16px',
      'padding:max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom))',
      'background:radial-gradient(ellipse at 50% 42%, rgba(28,23,18,0.9), rgba(10,9,8,0.97) 72%)',
      'backdrop-filter:blur(4px)',
      'z-index:64',
      'text-align:center',
    ].join(';');

    this.#title = document.createElement('h2');
    this.#title.textContent = 'Invite a player';
    this.#title.style.cssText = [
      'margin:0',
      'font:600 clamp(22px, 5.5vw, 30px)/1.15 system-ui, -apple-system, sans-serif',
      'background:linear-gradient(180deg, #f7e7cf, #b07a45)',
      '-webkit-background-clip:text',
      'background-clip:text',
      'color:transparent',
    ].join(';');

    this.#status = document.createElement('p');
    this.#status.style.cssText =
      'margin:0;font:400 13px/1.5 system-ui, -apple-system, sans-serif;color:#9a8d7d;max-width:36ch';

    // ── Share link ────────────────────────────────────────────────────────
    this.#linkBox = document.createElement('div');
    this.#linkBox.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'gap:10px',
      'width:min(460px, 100%)',
      'padding:16px',
      'border-radius:14px',
      'border:1px solid rgba(176,122,69,0.32)',
      'background:rgba(24,20,16,0.8)',
    ].join(';');

    this.#linkText = document.createElement('div');
    this.#linkText.style.cssText = [
      'font:500 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
      'color:#f4ece1',
      'word-break:break-all',
      'text-align:left',
      'max-height:4.5em',
      'overflow-y:auto',
    ].join(';');

    this.#copy = document.createElement('button');
    this.#copy.type = 'button';
    this.#copy.textContent = 'Copy link';
    this.#copy.style.cssText = [
      'padding:14px 22px',
      'border-radius:999px',
      'border:1px solid rgba(176,122,69,0.55)',
      'background:linear-gradient(170deg, #e8a33d, #b07a45)',
      'color:#1a140e',
      'font:700 13.5px/1 system-ui, -apple-system, sans-serif',
      'letter-spacing:0.08em',
      'text-transform:uppercase',
      'cursor:pointer',
      '-webkit-tap-highlight-color:transparent',
    ].join(';');
    this.#copy.addEventListener('click', (event) => {
      event.stopPropagation();
      void this.#copyLink();
    });

    this.#code = document.createElement('div');
    this.#code.style.cssText = [
      'font:600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace',
      'letter-spacing:0.18em',
      'text-transform:uppercase',
      'color:#e8a33d',
    ].join(';');

    this.#linkBox.append(this.#code, this.#linkText, this.#copy);

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '← Back';
    cancel.style.cssText = [
      'padding:14px 24px',
      'border-radius:999px',
      'border:1px solid rgba(176,122,69,0.35)',
      'background:transparent',
      'color:#9a8d7d',
      'font:600 13px/1 system-ui, -apple-system, sans-serif',
      'cursor:pointer',
      '-webkit-tap-highlight-color:transparent',
    ].join(';');
    cancel.addEventListener('click', (event) => {
      event.stopPropagation();
      onCancel();
    });

    this.#root.append(this.#title, this.#status, this.#linkBox, cancel);
    container.append(this.#root);
  }

  /**
   * Copy, with a manual-selection fallback.
   *
   * The clipboard API needs a secure context and can be refused outright, and
   * a copy button that silently does nothing is worse than no button — so a
   * failure selects the text instead and says so.
   */
  async #copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.#link);
      this.#copy.textContent = 'Copied ✓';
      window.setTimeout(() => {
        this.#copy.textContent = 'Copy link';
      }, 1600);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(this.#linkText);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      this.#copy.textContent = 'Copy it manually';
    }
  }

  showHosting(link: string, code: string): void {
    this.#visible = true;
    this.#link = link;
    this.#title.textContent = 'Invite a player';
    this.#status.textContent =
      'Send this link. The game starts as soon as they open it — keep this page open.';
    this.#linkText.textContent = link;
    this.#code.textContent = `Room ${code.replace('carrom-', '')}`;
    this.#linkBox.style.display = 'flex';
    this.#root.style.display = 'flex';
  }

  showJoining(): void {
    this.#visible = true;
    this.#title.textContent = 'Joining game';
    this.#status.textContent = 'Connecting to the other player…';
    this.#linkBox.style.display = 'none';
    this.#root.style.display = 'flex';
  }

  setStatus(text: string): void {
    this.#status.textContent = text;
  }

  get visible(): boolean {
    return this.#visible;
  }

  hide(): void {
    this.#visible = false;
    this.#root.style.display = 'none';
  }

  dispose(): void {
    this.#root.remove();
  }
}
