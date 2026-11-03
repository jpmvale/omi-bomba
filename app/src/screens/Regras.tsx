import { ALCANCE_INICIAL, ALCANCE_MAX, BOMBAS_MAX, VELOCIDADE_MAX_NIVEL } from '@omi-bomba/rules';

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
          <li><strong>Bomba:</strong> espaço (ou Enter). No celular, o botão 💣. Começa com uma bomba por vez.</li>
          <li>A bomba explode em <strong>2,5 s</strong> numa cruz. O fogo para nas paredes e quebra a primeira caixa que encontra.</li>
          <li>Fogo que encosta em outra bomba a detona na hora — dá para fazer corrente.</li>
          <li>Caixas às vezes escondem itens:
            <ul style={{ paddingLeft: 16, marginTop: 4 }}>
              <li><strong>🔥 fogo</strong>: explosão mais longa (começa em {ALCANCE_INICIAL}, vai até {ALCANCE_MAX}).</li>
              <li><strong>💣 bomba</strong>: uma bomba a mais ao mesmo tempo (até {BOMBAS_MAX}).</li>
              <li><strong>⏩ velocidade</strong>: mais rápido (até {VELOCIDADE_MAX_NIVEL} níveis).</li>
              <li><strong>🥾 chute</strong> (raro): ande contra uma bomba para empurrá-la; ela escorrega até bater em algo.</li>
              <li><strong>🧤 luva</strong> (rara): de frente para uma bomba, aperte a bomba para levantá-la; aperte de novo para arremessá-la 2 casas para onde está olhando. Se cair em bloco, bomba ou alguém, quica até a próxima casa livre (e passa pela borda para o outro lado). Na mão ou no ar, o pavio para.</li>
              <li><strong>💀 caveira</strong>: maldição por 15 s — direcional invertido, sem bomba ou lento. Encoste em alguém para passar a caveira adiante.</li>
            </ul>
            Fogo destrói item no chão. Quem morre espalha pela arena os itens que tinha.
          </li>
          <li><strong>👻 Quem morre não sai do jogo:</strong> vira fantasma na borda. Anda por ela com ← e → (nas laterais, ← sobe e → desce) e arremessa para dentro uma bomba simples por vez. Se essa bomba pegar alguém, o fantasma <strong>volta à arena</strong> no lugar de quem caiu, sem poderes.</li>
          <li>Depois do tempo combinado na sala (1, 3 ou 5 min), <strong>blocos caem do céu</strong> do canto para o centro, em espiral. Quem estiver embaixo é esmagado.</li>
          <li>Se cair a conexão, um bot segura o seu personagem até você voltar.</li>
        </ul>
        <button onClick={aoFechar}>Entendi</button>
      </div>
    </div>
  );
}
