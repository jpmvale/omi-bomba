import { useState } from 'react';
import {
  BOT_DIFFICULTIES,
  LIMITS,
  type BotDifficulty,
  type ChatMessage,
  type Personagem,
  type PublicPlayer,
  type RoomView,
} from '@omi-bomba/protocol';
import { VITORIAS_OPCOES } from '@omi-bomba/rules';
import { Chat } from '../components/Chat';
import { EscolhaDePersonagem } from '../components/EscolhaDePersonagem';
import { Retrato } from '../components/Retrato';
import { linkDoConvite } from '../net/sessao';
import { avisar } from '../state/loja';

const NOME_DIFICULDADE: Record<BotDifficulty, string> = { FACIL: 'fácil', MEDIO: 'médio', DIFICIL: 'difícil' };

type Enviar = (tipo: string, payload?: unknown) => void;

/** A sala de espera: convite, quem está na arena, a regra da partida e o pronto. */
export function Lobby({
  sala, eu, chat, enviar, aoSair, aoAbrirRegras,
}: {
  sala: RoomView;
  eu: string;
  chat: ChatMessage[];
  enviar: Enviar;
  aoSair: () => void;
  aoAbrirRegras: () => void;
}) {
  const souHost = sala.hostId === eu;
  const euJogador = sala.players.find((p) => p.id === eu);
  const porId = new Map(sala.players.map((p) => [p.id, p]));
  const sentados = sala.ordem.map((id) => porId.get(id)).filter((p): p is PublicPlayer => p !== undefined);
  const assistindo = sala.players.filter((p) => p.isSpectator);
  const faltaPronto = sentados.filter((p) => !p.pronto);
  const podeComecar = sentados.length >= LIMITS.minPlayers && faltaPronto.length === 0 && sentados.some((p) => !p.bot);
  const [dificuldade, setDificuldade] = useState<BotDifficulty>('MEDIO');
  const [trocando, setTrocando] = useState(false);

  const tomados = new Set<Personagem>(sentados.filter((p) => p.id !== eu).map((p) => p.personagem));

  const link = linkDoConvite(sala.code);
  const compartilhar = async () => {
    const texto = `Bora jogar OmiBomba? Entra na sala ${sala.code}:`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'OmiBomba', text: texto, url: link });
        return;
      }
    } catch { /* cancelou: tenta copiar */ }
    try {
      await navigator.clipboard.writeText(link);
      avisar('Link copiado');
    } catch {
      avisar(link);
    }
  };

  const host = porId.get(sala.hostId ?? '');

  return (
    <div className="pilha" style={{ gap: 16 }}>
      <header className="linha" style={{ justifyContent: 'space-between', paddingTop: 8 }}>
        <div className="pilha" style={{ gap: 2 }}>
          <span className="rotulo">sala</span>
          <strong style={{ fontSize: 28, letterSpacing: '0.18em', fontWeight: 600 }}>{sala.code}</strong>
        </div>
        <div className="linha">
          <button className="fantasma" onClick={aoAbrirRegras} style={{ padding: '0 12px' }}>Regras</button>
          <button className="fantasma" onClick={aoSair} style={{ padding: '0 12px' }}>Sair</button>
        </div>
      </header>

      <button onClick={() => void compartilhar()} style={{ height: 48 }}>Convidar pelo link</button>

      <section className="cartao pilha" style={{ gap: 10 }}>
        <span className="rotulo">na arena · {sentados.length}/{LIMITS.maxPlayers}</span>
        {sentados.map((p) => (
          <div key={p.id} className="linha" style={{ gap: 10, minHeight: 48 }}>
            <Retrato personagem={p.personagem} tamanho={40} />
            <div className="pilha" style={{ gap: 0, flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.nickname}{p.id === eu && ' (você)'}
              </span>
              <span className="fraco" style={{ fontSize: 12 }}>
                {p.bot ? `bot ${NOME_DIFICULDADE[p.bot.difficulty]}` : p.id === sala.hostId ? 'anfitrião' : p.connection === 'DESCONECTADO' ? 'caiu' : ''}
                {p.silenciado && ' · silenciado'}
              </span>
            </div>
            <span className="chip" style={{ color: p.pronto ? 'var(--nota-alta)' : 'var(--texto-apagado)' }}>
              {p.pronto ? 'pronto' : 'esperando'}
            </span>
            {souHost && p.id !== eu && (
              p.bot ? (
                <button className="fantasma" aria-label={`Tirar ${p.nickname}`} onClick={() => enviar('host:removeBot', { playerId: p.id })} style={{ padding: '0 8px', minHeight: 34 }}>✕</button>
              ) : (
                <MenuDoHost jogador={p} enviar={enviar} />
              )
            )}
          </div>
        ))}
        {sentados.length < LIMITS.maxPlayers && (
          <p className="fraco">Lugar vago. Mande o link ou chame um bot.</p>
        )}
        {souHost && sentados.length < LIMITS.maxPlayers && (
          <div className="linha">
            <div className="segmentado" style={{ flex: 1 }}>
              {BOT_DIFFICULTIES.map((d) => (
                <button key={d} aria-pressed={dificuldade === d} onClick={() => setDificuldade(d)}>{NOME_DIFICULDADE[d]}</button>
              ))}
            </div>
            <button className="fantasma" onClick={() => enviar('host:addBot', { difficulty: dificuldade })}>+ Bot</button>
          </div>
        )}
        {assistindo.length > 0 && (
          <p className="fraco">Assistindo: {assistindo.map((p) => p.nickname).join(', ')}</p>
        )}
      </section>

      {euJogador && !euJogador.isSpectator && (
        <section className="cartao pilha" style={{ gap: 10 }}>
          <div className="linha" style={{ justifyContent: 'space-between' }}>
            <span className="rotulo">seu personagem</span>
            <button className="fantasma" onClick={() => setTrocando((v) => !v)} style={{ minHeight: 34, padding: '0 10px' }}>
              {trocando ? 'Fechar' : 'Trocar'}
            </button>
          </div>
          {trocando && (
            <EscolhaDePersonagem
              atual={euJogador.personagem}
              tomados={tomados}
              aoEscolher={(personagem) => enviar('player:setProfile', { nickname: euJogador.nickname, personagem })}
            />
          )}
        </section>
      )}

      <section className="cartao pilha" style={{ gap: 12 }}>
        <span className="rotulo">regras da partida{!souHost && host ? ` · quem escolhe é ${host.nickname}` : ''}</span>
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          <span>Vence quem levar</span>
          <div className="segmentado">
            {VITORIAS_OPCOES.map((v) => (
              <button
                key={v}
                aria-pressed={sala.options.vitorias === v}
                disabled={!souHost}
                onClick={() => enviar('host:setOptions', { options: { vitorias: v } })}
                style={{ minWidth: 40 }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <span className="fraco">{sala.options.vitorias === 1 ? 'Uma rodada só.' : `Primeiro a vencer ${sala.options.vitorias} rodadas.`}</span>
      </section>

      {euJogador && !euJogador.isSpectator ? (
        <div className="linha">
          <button
            className={euJogador.pronto ? 'fantasma' : undefined}
            style={{ flex: 1, height: 48 }}
            onClick={() => enviar('player:setPronto', { pronto: !euJogador.pronto })}
          >
            {euJogador.pronto ? 'Não estou pronto' : 'Estou pronto'}
          </button>
          <button className="fantasma" onClick={() => enviar('player:setSpectator', { spectator: true })}>Assistir</button>
        </div>
      ) : (
        <button className="fantasma" disabled={sentados.length >= LIMITS.maxPlayers} onClick={() => enviar('player:setSpectator', { spectator: false })}>
          Entrar na arena
        </button>
      )}

      {souHost && (
        <div className="pilha" style={{ gap: 6 }}>
          <button style={{ height: 52 }} disabled={!podeComecar} onClick={() => enviar('host:startMatch')}>
            Começar partida
          </button>
          {!podeComecar && (
            <span className="fraco" style={{ textAlign: 'center' }}>
              {sentados.length < LIMITS.minPlayers
                ? 'Precisa de pelo menos 2 na arena. Chame um bot!'
                : `Esperando: ${faltaPronto.map((p) => p.nickname).join(', ')}`}
            </span>
          )}
        </div>
      )}
      {!souHost && host && <p className="fraco" style={{ textAlign: 'center' }}>Quem começa a partida é {host.nickname}.</p>}

      <section className="pilha" style={{ gap: 8 }}>
        <span className="rotulo">conversa</span>
        <Chat
          mensagens={chat}
          jogadores={sala.players}
          eu={eu}
          silenciado={euJogador?.silenciado ?? false}
          aoEnviar={(text) => enviar('chat:send', { text })}
          altura={180}
        />
      </section>
    </div>
  );
}

function MenuDoHost({ jogador, enviar }: { jogador: PublicPlayer; enviar: Enviar }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button className="fantasma" aria-label={`Opções para ${jogador.nickname}`} aria-expanded={aberto} onClick={() => setAberto((v) => !v)} style={{ padding: '0 8px', minHeight: 34 }}>⋯</button>
      {aberto && (
        <div className="cartao pilha" style={{ position: 'absolute', right: 0, top: 38, zIndex: 5, gap: 6, padding: 8, width: 170 }}>
          <button className="fantasma" onClick={() => { setAberto(false); enviar('host:silenciar', { playerId: jogador.id, silenciado: !jogador.silenciado }); }}>
            {jogador.silenciado ? 'Liberar chat' : 'Silenciar'}
          </button>
          <button className="perigo" onClick={() => { setAberto(false); enviar('host:kick', { playerId: jogador.id }); }}>
            Expulsar
          </button>
        </div>
      )}
    </div>
  );
}
