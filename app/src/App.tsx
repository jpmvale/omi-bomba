import { useCallback, useEffect, useRef, useState } from 'react';
import { PROTOCOL_VERSION, type ChatMessage, type RoomView } from '@omi-bomba/protocol';
import type { MatchView } from '@omi-bomba/rules';
import { conectar, type Conexao } from './net/socket';
import * as sessao from './net/sessao';
import { frase } from './net/mensagens';
import { avisar, definir, errar, ler, pontuou, useEstado } from './state/loja';
import { limparArena, quadroAtual, receberQuadro } from './jogo/arena';
import { Avisos } from './components/Avisos';
import { BloqueioConexao, FaixaConexao } from './components/Conexao';
import { Home } from './screens/Home';
import { Jogo } from './screens/Jogo';
import { Lobby } from './screens/Lobby';
import { Regras } from './screens/Regras';

export function App() {
  const estado = useEstado();
  const conexao = useRef<Conexao | null>(null);
  const chatVisivel = useRef(false);
  const [regras, setRegras] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [convite, setConvite] = useState<string | null>(() => sessao.codigoDoConvite());

  const nomeDe = (sala: RoomView | null, id: string | null): string => {
    if (id === null) return 'Alguém';
    if (id === ler().eu) return 'Você';
    return sala?.players.find((p) => p.id === id)?.nickname ?? 'Alguém';
  };

  /** Avisos do que aconteceu no quadro: só o que vale um balão (o resto a arena mostra). */
  const narrar = (v: MatchView) => {
    const anterior = quadroAtual()?.view;
    const sala = ler().sala;
    const eu = ler().eu;
    for (const e of v.eventos) {
      if (e.tipo === 'MORTE' && e.playerId === eu) {
        if (e.autor === null) errar('A arena fechou em cima de você!');
        else if (e.autor === eu) errar('Você caiu na própria bomba!');
        else errar(`${nomeDe(sala, e.autor)} te pegou!`);
      }
      if (e.tipo === 'MALDICAO' && e.playerId === eu) {
        const efeito = { INVERTIDO: 'direcional invertido', SEM_BOMBA: 'sem bomba', LENTO: 'lento' }[e.maldicao];
        errar(e.de ? `${nomeDe(sala, e.de)} te passou a caveira: ${efeito}!` : `Caveira: ${efeito}!`);
      }
      if (e.tipo === 'MALDICAO' && e.de === eu) avisar(`Você passou a caveira para ${nomeDe(sala, e.playerId)}`);
      if (e.tipo === 'VOLTOU') {
        if (e.playerId === eu) pontuou('Você voltou para a arena!');
        else avisar(`${nomeDe(sala, e.playerId)} voltou da borda`);
      }
    }
    // Virou fantasma: diz o que dá para fazer da borda.
    const euAntes = anterior?.matchId === v.matchId ? anterior.jogadores.find((j) => j.id === eu) : undefined;
    const euAgora = v.jogadores.find((j) => j.id === eu);
    if (euAntes && !euAntes.fantasma && euAgora?.fantasma && v.fase === 'JOGANDO') {
      avisar('Na borda: ande por ela e arremesse bombas para dentro. Pegou alguém, você volta!');
    }
    if (anterior && anterior.matchId === v.matchId && anterior.fase !== 'FIM_DA_RODADA' && v.fase === 'FIM_DA_RODADA') {
      if (v.vencedorDaRodada) pontuou(`${nomeDe(sala, v.vencedorDaRodada)} venceu a rodada ${v.rodada}`);
      else avisar(`Rodada ${v.rodada} empatou`);
    }
  };

  const voltarAoInicio = useCallback(() => {
    const codigo = ler().codigo;
    if (codigo) sessao.esquecer(codigo);
    sessao.esquecerUltima();
    conexao.current?.fechar();
    conexao.current = null;
    history.replaceState(null, '', '/');
    setConvite(null);
    limparArena();
    definir({ tela: 'home', sala: null, chat: [], codigo: null, eu: null, conexao: 'CONECTADO', naoLidas: 0 });
  }, []);

  const receber = (msg: { type: string; payload: unknown; stateVersion?: number }) => {
    switch (msg.type) {
      case 'room:snapshot': {
        const { chat, ...sala } = msg.payload as RoomView & { chat: ChatMessage[] };
        if (sala.match) receberQuadro(sala.match); else limparArena();
        definir({ sala, chat });
        break;
      }
      case 'room:state': {
        const sala = msg.payload as RoomView;
        const atual = ler().sala;
        if (atual && sala.stateVersion < atual.stateVersion) break;
        if (sala.match) receberQuadro(sala.match); else limparArena();
        definir({ sala });
        break;
      }
      case 'game:frame': {
        const v = msg.payload as MatchView;
        narrar(v);
        receberQuadro(v);
        break;
      }
      case 'chat:message': {
        const { message } = msg.payload as { message: ChatMessage };
        const atual = ler();
        definir({
          chat: [...atual.chat, message].slice(-200),
          naoLidas: chatVisivel.current || message.playerId === atual.eu ? atual.naoLidas : atual.naoLidas + 1,
        });
        break;
      }
      case 'system:notice': {
        const { code, params } = msg.payload as { code: string; params?: Record<string, unknown> };
        const sala = ler().sala;
        if (code === 'BOT_ASSUMIU') avisar(`Um bot assumiu o personagem de ${String(params?.apelido)}`);
        else if (code === 'EXPULSO') avisar(`${String(params?.apelido)} foi expulso`);
        else if (code === 'NOVO_HOST') avisar(`${nomeDe(sala, String(params?.hostId))} agora é o anfitrião`);
        break;
      }
      case 'error': {
        const { code, params } = msg.payload as { code: string; params?: { motivo?: string } };
        if (code === 'INVALID_TOKEN' || code === 'ROOM_NOT_FOUND') {
          if (params?.motivo === 'FORA_DA_SALA') errar('Você saiu da sala.');
          else if (code === 'ROOM_NOT_FOUND') errar('Essa sala não existe mais.');
          voltarAoInicio();
          return;
        }
        if (code === 'SESSION_TAKEN') return;
        errar(frase(params?.motivo ?? code));
        break;
      }
      default:
        break;
    }
  };

  const entrar = (s: sessao.Sessao) => {
    sessao.guardar(s.roomCode, s.sessionToken);
    sessao.lembrarSala(s.roomCode);
    history.replaceState(null, '', `/j/${s.roomCode}`);
    limparArena();
    definir({ tela: 'sala', eu: s.playerId, codigo: s.roomCode, sala: null, chat: [], naoLidas: 0 });
    conexao.current?.fechar();
    conexao.current = conectar(s.wsUrl, s.sessionToken, {
      aoReceber: (m) => receber(m as never),
      aoMudarEstado: (c) => definir({ conexao: c }),
    });
  };

  useEffect(() => {
    void sessao.retomar(convite).then((s) => { if (s) entrar(s); });
    return () => conexao.current?.fechar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Versão nova no ar: o cliente velho pede para recarregar em vez de errar calado.
  useEffect(() => {
    const conferir = async () => {
      try {
        const r = await fetch('/api/health');
        const d = (await r.json()) as { protocolVersion?: number };
        if (typeof d.protocolVersion === 'number' && d.protocolVersion !== PROTOCOL_VERSION) definir({ conexao: 'DESATUALIZADO' });
      } catch { /* offline: a faixa de conexão já avisa */ }
    };
    void conferir();
    const aoVoltar = () => { if (document.visibilityState === 'visible') void conferir(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, []);

  const enviar = (tipo: string, payload?: unknown) => conexao.current?.enviar(tipo as never, payload ?? {});

  const criar = async (i: sessao.Identidade) => {
    setOcupado(true);
    sessao.guardarIdentidade(i);
    try {
      entrar(await sessao.criarSala(i));
    } catch (e) {
      errar(frase(e instanceof sessao.ErroApi ? e.codigo : 'ERRO'));
    } finally {
      setOcupado(false);
    }
  };

  const juntar = async (codigo: string, i: sessao.Identidade) => {
    setOcupado(true);
    sessao.guardarIdentidade(i);
    try {
      const token = sessao.guardado(codigo);
      const retomada = token ? await sessao.retomarSessao(codigo, token).catch(() => null) : null;
      entrar(retomada ?? await sessao.entrarNaSala(codigo, i));
    } catch (e) {
      errar(frase(e instanceof sessao.ErroApi ? e.codigo : 'ERRO'));
      if (e instanceof sessao.ErroApi && e.codigo === 'ROOM_NOT_FOUND') { setConvite(null); history.replaceState(null, '', '/'); }
    } finally {
      setOcupado(false);
    }
  };

  const sair = () => {
    enviar('player:leave');
    setTimeout(voltarAoInicio, 150);
  };

  const jogarAqui = () => {
    const codigo = estado.codigo;
    const token = codigo ? sessao.guardado(codigo) : null;
    if (!codigo || !token) return voltarAoInicio();
    void sessao.retomarSessao(codigo, token).then(entrar).catch(voltarAoInicio);
  };

  const sala = estado.sala;
  const naArena = estado.tela === 'sala' && sala !== null && sala.match !== null && sala.status !== 'LOBBY';

  return (
    <div className={`casca ${naArena ? 'casca--mesa' : ''}`}>
      <FaixaConexao estado={estado.tela === 'sala' ? estado.conexao : 'CONECTADO'} />
      <Avisos avisos={estado.avisos} />

      {estado.tela === 'home' && (
        <Home
          codigoDoConvite={convite}
          identidade={sessao.identidadeGuardada()}
          ocupado={ocupado}
          aoCriar={(i) => void criar(i)}
          aoEntrar={(c, i) => void juntar(c, i)}
          aoAbrirRegras={() => setRegras(true)}
        />
      )}

      {estado.tela === 'sala' && !sala && <p className="fraco" style={{ textAlign: 'center', paddingTop: 40 }}>Entrando na sala…</p>}

      {estado.tela === 'sala' && sala && estado.eu && !naArena && (
        <Lobby
          sala={sala}
          eu={estado.eu}
          chat={estado.chat}
          enviar={enviar}
          aoSair={sair}
          aoAbrirRegras={() => setRegras(true)}
        />
      )}

      {naArena && estado.eu && (
        <Jogo
          sala={sala}
          eu={estado.eu}
          chat={estado.chat}
          naoLidas={estado.naoLidas}
          enviar={enviar}
          aoAbrirRegras={() => setRegras(true)}
          aoSair={sair}
          aoLerChat={() => { chatVisivel.current = !chatVisivel.current; definir({ naoLidas: 0 }); }}
        />
      )}

      {regras && <Regras aoFechar={() => setRegras(false)} />}

      <BloqueioConexao estado={estado.tela === 'sala' ? estado.conexao : 'CONECTADO'} aoJogarAqui={jogarAqui} aoVoltar={voltarAoInicio} />
    </div>
  );
}
