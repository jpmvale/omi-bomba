import { ALCANCE_INICIAL, ALCANCE_MAX, VELOCIDADE_MAX_NIVEL } from '@omi-bomba/rules';

/** As regras em uma gaveta: curtas o bastante para ler esperando a sala encher. */
export function Regras({ aoFechar }: { aoFechar: () => void }) {
  return (
    <div className="gaveta-fundo" onClick={aoFechar}>
      <div className="gaveta pilha" role="dialog" aria-label="Como se joga" onClick={(e) => e.stopPropagation()}>
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>Como se joga</h2>
          <button className="fantasma" onClick={aoFechar} aria-label="Fechar">✕</button>
        </div>
        <p>Cada rodada é numa arena nova. Quem ficar por último em pé vence a rodada; quem vencer primeiro o número de rodadas combinado leva a partida.</p>
        <ul className="pilha" style={{ gap: 8, paddingLeft: 18 }}>
          <li><strong>Andar:</strong> setas ou WASD. No celular, o direcional na tela.</li>
          <li><strong>Bomba:</strong> espaço (ou Enter). No celular, o botão 💣. Uma bomba sua por vez.</li>
          <li>A bomba explode em <strong>2,5 s</strong> numa cruz. O fogo para nas paredes e quebra a primeira caixa que encontra.</li>
          <li>Fogo que encosta em outra bomba a detona na hora — dá para fazer corrente.</li>
          <li>Caixas às vezes escondem itens: <strong>🔥 fogo</strong> aumenta o alcance da explosão (começa em {ALCANCE_INICIAL}, vai até {ALCANCE_MAX}) e <strong>⏩ velocidade</strong> deixa você mais rápido (até {VELOCIDADE_MAX_NIVEL} níveis). Fogo destrói item no chão.</li>
          <li>Depois de 90 s a arena começa a <strong>fechar</strong> em espiral, de fora para dentro. As casas que vão fechar piscam em vermelho.</li>
          <li>Se cair a conexão, um bot segura o seu personagem até você voltar.</li>
        </ul>
        <button onClick={aoFechar}>Entendi</button>
      </div>
    </div>
  );
}
