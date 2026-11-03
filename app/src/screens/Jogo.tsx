import { useEffect, useMemo, useRef, useState } from 'react';
import { NOME_DO_PERSONAGEM, type ChatMessage, type Personagem, type RoomView } from '@omi-bomba/protocol';
import { ALCANCE_INICIAL, type Abate, type Dir, type MatchView } from '@omi-bomba/rules';
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
            {v.fase === 'JOGANDO' && <Abates abates={v.abates.slice(-3)} nomeDe={nomeDe} />}
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
            <div className="pilha" style={{ gap: 0, minWidth: 0 }}>
              <span className="placar-nome">{id === eu ? 'Você' : p.nickname}</span>
              {j?.vivo && <Poderes j={j} />}
            </div>
            <strong>{v.placar[id] ?? 0}</strong>
          </div>
        );
      })}
    </div>
  );
}

/** O que o jogador tem: só o que passou do começo, para caber. */
function Poderes({ j }: { j: MatchView['jogadores'][number] }) {
  const partes: string[] = [];
  if (j.alcance > ALCANCE_INICIAL) partes.push(`🔥${j.alcance}`);
  if (j.bombas > 1) partes.push(`💣${j.bombas}`);
  if (j.velocidade > 0) partes.push(`⏩${j.velocidade}`);
  if (j.chute) partes.push('🥾');
  if (j.maldicao) partes.push('💀');
  if (partes.length === 0) return null;
  return <span className="placar-poderes">{partes.join(' ')}</span>;
}

/** Uma linha do registro: quem pegou quem. */
export function frase(a: Abate, nomeDe: (id: string | null) => string): string {
  if (a.causa === 'FECHAMENTO') return `A arena esmagou ${nomeDe(a.vitima)}`;
  if (a.autor === a.vitima) return `${nomeDe(a.vitima)} caiu na própria bomba`;
  const ajuda = a.ajudantes.length > 0 ? ` (com ${a.ajudantes.map(nomeDe).join(', ')})` : '';
  return `${nomeDe(a.autor)} pegou ${nomeDe(a.vitima)}${ajuda}`;
}

/** As últimas eliminações da rodada, num canto da arena. */
function Abates({ abates, nomeDe }: { abates: Abate[]; nomeDe: (id: string | null) => string }) {
  if (abates.length === 0) return null;
  return (
    <ul className="abates">
      {abates.map((a) => <li key={`${a.passo}-${a.vitima}`}>💥 {frase(a, nomeDe)}</li>)}
    </ul>
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
        <div className="pilha" style={{ gap: 6, alignItems: 'center' }}>
          <span>{v.vencedorDaRodada ? `${nomeDe(v.vencedorDaRodada)} venceu a rodada!` : 'Empate!'}</span>
          {v.abates.filter((a) => a.rodada === v.rodada).map((a) => (
            <span key={`${a.passo}-${a.vitima}`} className="faixa-linha">{frase(a, nomeDe)}</span>
          ))}
        </div>
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
          <span className="fraco">{NOME_DO_PERSONAGEM[campeao.personagem]} · {v.placar[campeao.id] ?? 0} {(v.placar[campeao.id] ?? 0) === 1 ? "rodada" : "rodadas"}</span>
        </div>
      ) : (
        <strong style={{ fontSize: 20 }}>Partida encerrada sem vencedor.</strong>
      )}
      <Kda v={v} sala={sala} nomeDe={nomeDe} />
      <Registro v={v} nomeDe={nomeDe} />
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

/** Abates, mortes e assistências de cada um na partida. */
function Kda({ v, sala, nomeDe }: { v: MatchView; sala: RoomView; nomeDe: (id: string | null) => string }) {
  const linhas = v.playerOrder.map((id) => {
    const k = v.abates.filter((a) => a.autor === id && a.vitima !== id).length;
    const d = v.abates.filter((a) => a.vitima === id).length;
    const as = v.abates.filter((a) => a.ajudantes.includes(id)).length;
    return { id, k, d, as, vitorias: v.placar[id] ?? 0 };
  }).sort((a, b) => b.vitorias - a.vitorias || b.k - a.k || a.d - b.d);
  return (
    <table className="kda">
      <thead>
        <tr><th style={{ textAlign: 'left' }}>Jogador</th><th title="Rodadas vencidas">🏆</th><th title="Abates">A</th><th title="Mortes">M</th><th title="Assistências">As</th></tr>
      </thead>
      <tbody>
        {linhas.map((l) => {
          const p = sala.players.find((x) => x.id === l.id);
          return (
            <tr key={l.id}>
              <td style={{ textAlign: 'left' }}>
                <span className="linha" style={{ gap: 6 }}>
                  {p && <Retrato personagem={p.personagem} tamanho={22} />}
                  {nomeDe(l.id)}
                </span>
              </td>
              <td>{l.vitorias}</td><td>{l.k}</td><td>{l.d}</td><td>{l.as}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Quem pegou quem, rodada a rodada. */
function Registro({ v, nomeDe }: { v: MatchView; nomeDe: (id: string | null) => string }) {
  const rodadas = [...new Set(v.abates.map((a) => a.rodada))].sort((a, b) => a - b);
  if (rodadas.length === 0) return null;
  return (
    <details className="registro">
      <summary>Quem pegou quem</summary>
      {rodadas.map((r) => (
        <div key={r} className="pilha" style={{ gap: 2, textAlign: 'left' }}>
          <span className="rotulo">rodada {r}</span>
          {v.abates.filter((a) => a.rodada === r).map((a) => (
            <span key={`${a.passo}-${a.vitima}`} style={{ fontSize: 14 }}>{frase(a, nomeDe)}</span>
          ))}
        </div>
      ))}
    </details>
  );
}
