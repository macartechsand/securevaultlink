/**
 * "Save / update password" bar shown at the top of the page after a form is sent (extension page in
 * an iframe). Nothing is saved without a click here; the password itself is never shown or sent to
 * this frame, only the site, the username and what would happen.
 */
import { type SaveData, send } from '../protocol';
import { BLOCKED_MESSAGE, createClickGuard, el, reportHeight, tokenFromHash } from './guard';
import './frame.css';

const token = tokenFromHash();
const root = document.getElementById('root')!;
const canClick = createClickGuard();
const close = () => void send({ type: 'fr.close', token }).catch(() => undefined);

async function render() {
  let data: SaveData;
  try {
    data = await send<SaveData>({ type: 'fr.saveData', token });
  } catch {
    close();
    return;
  }
  const status = el('div', { className: 'msg' });
  const user: HTMLInputElement = document.createElement('input');
  user.type = 'text';
  user.value = data.username;
  user.autocomplete = 'off';
  user.maxLength = 256;
  user.spellcheck = false;
  const title =
    data.mode === 'update'
      ? `Atualizar a senha de "${data.title ?? data.host}" no cofre?`
      : data.generated
        ? `Senha gerada para ${data.host}. Salvar no cofre?`
        : `Salvar este login de ${data.host} no cofre?`;

  const decide = async (decision: 'save' | 'never' | 'dismiss') => {
    if (decision !== 'dismiss' && !canClick()) {
      status.textContent = BLOCKED_MESSAGE;
      status.className = 'msg error';
      return;
    }
    try {
      const res = await send<{ message: string } | null>({ type: 'fr.saveDecide', token, decision, username: user.value });
      if (res?.message) {
        root.replaceChildren(el('div', { className: 'msg', textContent: res.message }));
        setTimeout(close, 1800);
      } else close();
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : 'Não foi possível salvar.';
      status.className = 'msg error';
    }
  };

  const save = el('button', { type: 'button', className: 'btn btn--primary', textContent: data.mode === 'update' ? 'Atualizar' : 'Salvar' });
  save.addEventListener('click', () => void decide('save'));
  const later = el('button', { type: 'button', className: 'btn', textContent: 'Agora não' });
  later.addEventListener('click', () => void decide('dismiss'));
  const buttons = el('div', { className: 'row' }, save, later);
  if (data.mode === 'new') {
    const never = el('button', { type: 'button', className: 'btn btn--link', textContent: 'Nunca neste site' });
    never.addEventListener('click', () => void decide('never'));
    buttons.append(never);
  }
  const body = el('div', { className: 'body' }, el('strong', { textContent: title }));
  if (data.mode === 'new') {
    const label = document.createElement('label');
    label.append('Usuário ou e-mail', user);
    body.append(label);
  } else if (data.username) body.append(el('span', { className: 'msg', textContent: data.username }));
  body.append(buttons, status);
  root.replaceChildren(el('div', { className: 'head' }, el('span', { className: 'mark', textContent: '✓' }), 'SecureLink Vault'), body);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close();
});
reportHeight((height) => void send({ type: 'fr.resize', token, height }).catch(() => undefined));
void render();
