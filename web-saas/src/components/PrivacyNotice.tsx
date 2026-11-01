import { useState } from 'react';
import { Icon } from './ui/Icon';

/**
 * Privacy notice for the closed beta. DRAFT: the project owner must review it (ideally with legal
 * advice) before a public launch. Factual description of how the product handles data.
 */
export function PrivacyNoticeLink() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(true)}>
        Privacidade e termos do beta
      </button>
      {open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
          <div className="modal modal--wide">
            <div className="card__header">
              <h2 id="privacy-title">Privacidade e termos do beta</h2>
              <button type="button" className="btn btn--ghost icon-btn" onClick={() => setOpen(false)} aria-label="Fechar">
                <Icon name="close" />
              </button>
            </div>
            <div className="stack-sm">
              <h3>O que é este serviço</h3>
              <p className="muted">
                O SecureLink Vault está em <strong>beta fechado</strong>, com acesso só para convidados. Ainda não passou por
                auditoria externa de segurança, então não o use como único lugar para guardar informações críticas e mantenha
                backups.
              </p>
              <h3>Como seus dados são protegidos</h3>
              <p className="muted">
                O conteúdo do cofre (senhas, notas, campos, cartões e arquivos) é criptografado no seu dispositivo com a sua
                senha mestra antes de ser enviado. Nós não temos a senha mestra e não conseguimos ler esse conteúdo nem recuperá-lo
                se você esquecer a senha mestra sem ter ativado a chave de recuperação.
              </p>
              <h3>Quais dados tratamos</h3>
              <ul className="muted">
                <li>Dados de conta: e-mail, provedor de login (e-mail, Google ou GitHub), datas de acesso, sessões (navegador e IP).</li>
                <li>Metadados técnicos: quantidade e tamanho de itens e arquivos, compartilhamentos, plano e eventos de auditoria.</li>
                <li>Se você permitir (Configurações → Privacidade e suporte): contagens da sua postura de segurança, só números.</li>
                <li>Relatórios de diagnóstico que você decidir enviar ao suporte.</li>
              </ul>
              <h3>Serviços de terceiros</h3>
              <p className="muted">
                Hospedagem: Supabase (banco, autenticação, arquivos) e Netlify (site). Verificações que você aciona: Have I Been Pwned
                (recebe só os 5 primeiros caracteres do hash da senha) e Google Safe Browsing (recebe os endereços dos sites
                verificados). Premium pode usar Cloudflare R2 para arquivos, sempre criptografados.
              </p>
              <h3>Seus direitos (LGPD)</h3>
              <p className="muted">
                Você pode exportar seu cofre (Configurações → Backup e migração), desligar o envio de métricas e excluir a conta e
                todos os dados a qualquer momento (Configurações → Zona de perigo). Para outras solicitações, fale com o administrador
                que convidou você.
              </p>
              <p className="subtle">Versão do beta, outubro de 2026. Texto sujeito a revisão.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
