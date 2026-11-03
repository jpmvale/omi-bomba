import { useEffect, useMemo, useRef, useState } from 'react';
import { NOME_DO_PERSONAGEM, type ChatMessage, type Personagem, type RoomView } from '@omi-bomba/protocol';
import type { Dir, MatchView } from '@omi-bomba/rules';
import { Chat } from '../components/Chat';
import { Controles } from '../components/Controles';
import { Retrato } from '../components/Retrato';
import { quadroAnterior, quadroAtual, useArena } from '../jogo/arena';
import { desenharArena, medir, segundosRestantes } from '../jogo/desenho';
import { ligarControles, type Controle } from '../jogo/entrada';

type Enviar = (tipo: string, payload?: unknown) => void;

/** A arena: placar em cima, o jogo no meio, controles e conversa em volta. */
export function Jogo({
  sala, eu, chat, naoLidas, enviar, aoSair, aoAbrirRegras, aoLerChat,
}: {
  sala: RoomView;
  eu: string;
  chat: ChatMessage[];
  naoLidas: number;
  enviar: Enviar;
  aoSair: () => void;
  aoAbrirRegras: () => void;
  aoLerChat: () => void;
}) {
  const v = useArena() ?? sala.match;
  const caixa = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const controle = useRef<Controle | null>(null);
  const [chatAberto, setChatAberto] = useState(false);
  // Controle na tela para quem tem toque, mesmo que também tenha mouse (tablet
  // com teclado): sobra espaço, e quem tem teclado ignora.
  const toque = useMemo(
    () => (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0,
    [],
  );

  const euJogador = sala.players.find((p) => p.id === eu);
  const jogo = v && v.playerOrder.includes(eu) && !euJogador?.bot ? v : null;
  const personagens = useMemo(
    () => new Map<string, Personagem>(sala.players.map((p) => [p.id, p.personagem])),
    [sala.players],
  );
  const matchId = v?.matchId ?? null;

  // Teclado e toque mandam a entrada; quem assiste não manda nada.
  useEffect(() => {
    if (!jogo || !matchId) return;
    const c = ligarControles((dir: Dir | null, bomba: boolean) => enviar('game:input', { matchId, dir, bomba }));
    controle.current = c;
    return () => { c.desligar(); controle.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, Boolean(jogo)]);

  // O laço de desenho: lê o último quadro direto da loja da arena.
  useEffect(() => {
    const c = tela.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    let quadro = 0;
    let medidas = medir(320, 280);
    let dpr = 1;

    const ajustar = () => {
      const box = caixa.current;
      if (!box) return;
      const largura = box.clientWidth;
      const alturaMax = Math.max(200, window.innerHeight - (toque ? 330 : 190));
      medidas = medir(largura, alturaMax);
      dpr = window.devicePixelRatio || 1;
      c.width = Math.round(medidas.largura * dpr);
      c.height = Math.round(medidas.altura * dpr);
      c.style.width = `${medidas.largura}px`;
      c.style.height = `${medidas.altura}px`;
    };
    ajustar();
    const obs = new ResizeObserver(ajustar);
    if (caixa.current) obs.observe(caixa.current);
    window.addEventListener('resize', ajustar);

    const pintar = (agora: number) => {
      const atual = quadroAtual();
      if (atual) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        desenharArena(ctx, medidas, atual, quadroAnterior(), personagens, agora);
      }
      quadro = requestAnimationFrame(pintar);
    };
    quadro = requestAnimationFrame(pintar);
    return () => {
      cancelAnimationFrame(quadro);
      obs.disconnect();
      window.removeEventListener('resize', ajustar);
    };
  }, [personagens, toque]);

  if (!v) return <p className="fraco" style={{ textAlign: 'center', paddingTop: 40 }}>Carregando a arena…</p>;

  const souHost = sala.hostId === eu;
  const nomeDe = (id: string | null) => (id === eu ? 'Você' : sala.players.find((p) => p.id === id)?.nickname ?? 'Alguém');
  const acabou = sala.status === 'FIM_DE_PARTIDA' || v.endReason !== null;

  return (
    <div className="pilha" style={{ gap: 10 }}>
      <header className="linha" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div className="linha" style={{ gap: 6 }}>
          <span className="chip">{sala.code}</span>
          <span className="chip">R{v.rodada}</span>
          {v.fase === 'JOGANDO' && <Relogio v={v} />}
        </div>
        <div className="linha">
          <button className="fantasma mesa-chat-botao" onClick={() => { setChatAberto(true); aoLerChat(); }} style={{ padding: '0 12px' }}>
            Chat{naoLidas > 0 ? ` (${naoLidas})` : ''}
          </button>
          <button className="fantasma" onClick={aoAbrirRegras} style={{ padding: '0 10px' }} aria-label="Regras">?</button>
          <button className="fantasma" onClick={aoSair} style={{ padding: '0 12px' }}>Sair</button>
        </div>
      </header>

      <Placar v={v} sala={sala} eu={eu} />

      <div className="mesa-layout">
        <div className="pilha" style={{ gap: 10 }}>
          <div ref={caixa} className="arena-caixa">
            <canvas ref={tela} className="arena" aria-label="Arena" />
            <Faixa v={v} nomeDe={nomeDe} />
          </div>

          {jogo && toque && !acabou && (
            <Controles
              aoDirecionar={(d) => controle.current?.toque(d)}
              aoBomba={() => controle.current?.bomba()}
            />
          )}
          {!jogo && !acabou && <p className="fraco" style={{ textAlign: 'center' }}>Você está assistindo. Joga na próxima partida.</p>}
          {jogo && !toque && !acabou && (
            <p className="fraco" style={{ textAlign: 'center' }}>Setas ou WASD para andar · Espaço para soltar bomba</p>
          )}

          {acabou && (
            <FimDePartida v={v} sala={sala} souHost={souHost} nomeDe={nomeDe} enviar={enviar} />
          )}
          {souHost && !acabou && (
            <button className="fantasma" onClick={() => enviar('host:endMatch')}>Encerrar partida</button>
          )}
        </div>

        <aside className="mesa-lateral cartao pilha">
          <span className="rotulo">conversa</span>
          <Chat mensagens={chat} jogadores={sala.players} eu={eu} silenciado={euJogador?.silenciado ?? false} aoEnviar={(text) => enviar('chat:send', { text })} altura={320} />
        </aside>
      </div>

      {chatAberto && (
        <div className="gaveta-fundo" onClick={() => { setChatAberto(false); aoLerChat(); }}>
          <div className="gaveta pilha" onClick={(e) => e.stopPropagation()}>
            <div className="linha" style={{ justifyContent: 'space-between' }}>
              <span className="rotulo">conversa</span>
              <button className="fantasma" onClick={() => { setChatAberto(false); aoLerChat(); }} aria-label="Fechar">✕</button>
            </div>
            <Chat mensagens={chat} jogadores={sala.players} eu={eu} silenciado={euJogador?.silenciado ?? false} aoEnviar={(text) => enviar('chat:send', { text })} />
          </div>
        </div>
      )}
    </div>
  );
}

function Relogio({ v }: { v: MatchView }) {
  const s = segundosRestantes(v);
  const fechando = v.passo >= v.fechaNoPasso;
  return (
    <span className="chip" style={{ color: fechando ? 'var(--vidas)' : undefined }}>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

function Placar({ v, sala, eu }: { v: MatchView; sala: RoomView; eu: string }) {
  return (
    <div className="placar">
      {v.playerOrder.map((id) => {
        const p = sala.players.find((x) => x.id === id);
        const j = v.jogadores.find((x) => x.id === id);
        if (!p) return null;
        return (
          <div key={id} className={`placar-item ${id === eu ? 'placar-item--eu' : ''}`}>
            <Retrato personagem={p.personagem} tamanho={28} apagado={!j?.vivo} />
            <span className="placar-nome">{id === eu ? 'Você' : p.nickname}</span>
            <strong>{v.placar[id] ?? 0}</strong>
          </div>
        );
      })}
    </div>
  );
}

/** A faixa por cima da arena: contagem, fim da rodada. */
function Faixa({ v, nomeDe }: { v: MatchView; nomeDe: (id: string | null) => string }) {
  if (v.endReason !== null) return null;
  if (v.fase === 'CONTAGEM') {
    const s = segundosRestantes(v);
    return <div className="faixa">{s > 0 ? s : 'Vai!'}</div>;
  }
  if (v.fase === 'FIM_DA_RODADA') {
    return (
      <div className="faixa faixa--fim">
        {v.vencedorDaRodada ? `${nomeDe(v.vencedorDaRodada)} venceu a rodada!` : 'Empate!'}
      </div>
    );
  }
  return null;
}

function FimDePartida({ v, sala, souHost, nomeDe, enviar }: {
  v: MatchView; sala: RoomView; souHost: boolean; nomeDe: (id: string | null) => string; enviar: Enviar;
}) {
  const campeao = sala.players.find((p) => p.id === v.campeao);
  return (
    <section className="cartao pilha" style={{ gap: 12, textAlign: 'center' }}>
      {campeao ? (
        <div className="pilha" style={{ alignItems: 'center', gap: 6 }}>
          <Retrato personagem={campeao.personagem} tamanho={72} />
          <strong style={{ fontSize: 22 }}>{nomeDe(campeao.id)} venceu a partida!</strong>
          <span className="fraco">{NOME_DO_PERSONAGEM[campeao.personagem]} · {v.placar[campeao.id] ?? 0} rodadas</span>
        </div>
      ) : (
        <strong style={{ fontSize: 20 }}>Partida encerrada sem vencedor.</strong>
      )}
      {souHost ? (
        <div className="linha" style={{ justifyContent: 'center' }}>
          <button onClick={() => enviar('host:rematch')}>Revanche</button>
          <button className="fantasma" onClick={() => enviar('host:toLobby')}>Voltar à sala</button>
        </div>
      ) : (
        <span className="fraco">Esperando o anfitrião decidir: revanche ou voltar à sala.</span>
      )}
    </section>
  );
}
