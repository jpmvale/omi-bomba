import { useState } from 'react';
import { NICKNAME_MAX, NICKNAME_MIN, PERSONAGENS, ROOM_CODE_LENGTH, type Personagem } from '@omi-bomba/protocol';
import { EscolhaDePersonagem } from '../components/EscolhaDePersonagem';
import { Retrato } from '../components/Retrato';
import type { Identidade } from '../net/sessao';

/**
 * A porta de entrada: quem você é, com que personagem, e para que sala vai.
 * Uma tela só — entre o link e a arena, o mínimo de toques.
 */
export function Home({
  codigoDoConvite, identidade, ocupado, aoCriar, aoEntrar, aoAbrirRegras,
}: {
  codigoDoConvite: string | null;
  identidade: Identidade | null;
  ocupado: boolean;
  aoCriar: (i: Identidade) => void;
  aoEntrar: (codigo: string, i: Identidade) => void;
  aoAbrirRegras: () => void;
}) {
  const [nickname, setNickname] = useState(identidade?.nickname ?? '');
  const [personagem, setPersonagem] = useState<Personagem>(
    identidade && (PERSONAGENS as readonly string[]).includes(identidade.personagem)
      ? identidade.personagem
      : PERSONAGENS[Math.floor(Math.random() * PERSONAGENS.length)]!,
  );
  const [codigo, setCodigo] = useState(codigoDoConvite ?? '');

  const apelidoOk = nickname.trim().length >= NICKNAME_MIN && nickname.trim().length <= NICKNAME_MAX;
  const codigoOk = codigo.length === ROOM_CODE_LENGTH;
  const eu: Identidade = { nickname: nickname.trim(), personagem };

  return (
    <div className="pilha" style={{ gap: 18 }}>
      <header className="linha" style={{ justifyContent: 'space-between', paddingTop: 16 }}>
        <div className="pilha" style={{ gap: 6 }}>
          <h1 className="marca">OmiBomba</h1>
          <span className="fraco">Bombas, caixas e amigos · até 5 na arena</span>
        </div>
        <Retrato personagem={personagem} tamanho={64} />
      </header>

      <section className="cartao pilha" style={{ gap: 12 }}>
        <span className="rotulo">quem é você na arena</span>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value.slice(0, NICKNAME_MAX))}
          placeholder="Seu apelido"
          aria-label="Seu apelido"
          autoComplete="nickname"
          maxLength={NICKNAME_MAX}
        />
        <EscolhaDePersonagem atual={personagem} aoEscolher={setPersonagem} />
      </section>

      {codigoDoConvite ? (
        <section className="pilha" style={{ gap: 10 }}>
          <p style={{ fontSize: 16 }}>
            Você foi chamado para a sala <strong style={{ letterSpacing: '0.12em' }}>{codigoDoConvite}</strong>.
          </p>
          <button style={{ height: 52 }} disabled={!apelidoOk || ocupado} onClick={() => aoEntrar(codigoDoConvite, eu)}>
            Entrar na sala
          </button>
          <button className="fantasma" disabled={!apelidoOk || ocupado} onClick={() => aoCriar(eu)}>
            Criar outra sala
          </button>
        </section>
      ) : (
        <>
          <button style={{ height: 52 }} disabled={!apelidoOk || ocupado} onClick={() => aoCriar(eu)}>
            Criar sala
          </button>
          <div className="linha" style={{ gap: 10 }}>
            <span style={{ flex: 1, height: 1, background: 'var(--linha)' }} />
            <span className="fraco">ou entre com o código</span>
            <span style={{ flex: 1, height: 1, background: 'var(--linha)' }} />
          </div>
          <div className="linha">
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH))}
              placeholder="ABCDE"
              aria-label="Código da sala"
              autoCapitalize="characters"
              style={{ letterSpacing: '0.3em', fontWeight: 600, textAlign: 'center' }}
            />
            <button className="fantasma" disabled={!apelidoOk || !codigoOk || ocupado} onClick={() => aoEntrar(codigo, eu)}>
              Entrar
            </button>
          </div>
        </>
      )}

      {!apelidoOk && nickname.length > 0 && (
        <span className="fraco">O apelido precisa ter de {NICKNAME_MIN} a {NICKNAME_MAX} letras.</span>
      )}

      <button className="fantasma" onClick={aoAbrirRegras}>Como se joga</button>
    </div>
  );
}
