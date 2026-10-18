import { useState } from 'react';
import { Icon } from './ui/Icon';

/** Displays a one-time sign-in link once, with copy and safe-delivery guidance. */
export function OneTimeLink({ email, link, kind, onClose }: { email: string; link: string; kind: 'invite' | 'recovery'; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="alert alert--warn stack-sm">
      <strong>
        {kind === 'invite' ? 'Link de convite' : 'Link de redefinição de senha'} para {email}
      </strong>
      <span>
        Quem abrir este link entra na conta e define a senha de acesso. Envie só para a pessoa, por um canal seguro (mensagem
        direta, não em grupos). Ele expira em poucas horas (prazo do Supabase em Authentication → Email) e funciona uma vez.
        O link não dá acesso ao cofre: a senha mestra continua sendo só da pessoa.
      </span>
      <div className="secret-box">
        <code>{link}</code>
        <button
          type="button"
          className="btn btn--sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={14} />
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <div>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
          Fechar (o link não será mostrado de novo)
        </button>
      </div>
    </div>
  );
}
