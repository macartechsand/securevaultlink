/**
 * Suggestions menu shown under a login field (extension page in an iframe). The page cannot read the
 * titles and usernames listed here. Filling goes through the background, which re-checks the site.
 */
import { type InlineData, send } from '../protocol';
import { BLOCKED_MESSAGE, createClickGuard, el, reportHeight, tokenFromHash } from './guard';
import './frame.css';

const token = tokenFromHash();
const root = document.getElementById('root')!;
const canClick = createClickGuard();
const close = () => void send({ type: 'fr.close', token }).catch(() => undefined);

function header(host: string) {
  return el('div', { className: 'head' }, el('span', { className: 'mark', textContent: '✓' }), 'SecureLink', el('small', { textContent: host }));
}

function message(text: string, error = false) {
  root.replaceChildren(el('div', { className: error ? 'msg error' : 'msg', textContent: text }));
}

async function act(fn: () => Promise<unknown>, status: HTMLElement) {
  if (!canClick()) {
    status.textContent = BLOCKED_MESSAGE;
    status.className = 'msg error';
    return;
  }
  try {
    await fn();
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : 'Não foi possível concluir.';
    status.className = 'msg error';
  }
}

async function render() {
  let data: InlineData;
  try {
    data = await send<InlineData>({ type: 'fr.inlineData', token });
  } catch (err) {
    message(err instanceof Error ? err.message : 'Abra a extensão pelo ícone.', true);
    return;
  }
  const status = el('div', { className: 'msg' });
  const list = el('ul', { className: 'list' });
  if (data.kind === 'new') {
    const gen = el('button', { type: 'button' }, el('strong', { textContent: 'Gerar senha forte' }), el('span', { textContent: 'Preenche o campo e oferece salvar no cofre' }));
    gen.addEventListener('click', () => void act(() => send({ type: 'fr.inlineGenerate', token }), status));
    list.append(el('li', {}, gen));
  }
  for (const item of data.items) {
    const b = el('button', { type: 'button', title: item.exact ? '' : 'Mesmo domínio, endereço diferente' }, el('strong', { textContent: item.title }), el('span', { textContent: item.username || 'sem usuário' }));
    b.addEventListener('click', () => void act(() => send({ type: 'fr.inlineFill', token, itemId: item.id }), status));
    list.append(el('li', {}, b));
  }
  if (!list.children.length) {
    close();
    return;
  }
  root.replaceChildren(header(data.host), list, status);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close();
});
reportHeight((height) => void send({ type: 'fr.resize', token, height }).catch(() => undefined));
void render();
