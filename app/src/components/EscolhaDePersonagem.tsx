import { NOME_DO_PERSONAGEM, PERSONAGENS, type Personagem } from '@omi-bomba/protocol';
import { Retrato } from './Retrato';

/** A grade dos oito personagens. Os tomados por outra pessoa da arena ficam apagados. */
export function EscolhaDePersonagem({
  atual, tomados = new Set(), aoEscolher,
}: {
  atual: Personagem;
  tomados?: Set<Personagem>;
  aoEscolher: (p: Personagem) => void;
}) {
  return (
    <div className="personagens" role="radiogroup" aria-label="Personagem">
      {PERSONAGENS.map((p) => {
        const tomado = tomados.has(p) && p !== atual;
        return (
          <button
            key={p}
            role="radio"
            aria-checked={atual === p}
            aria-label={`${NOME_DO_PERSONAGEM[p]}${tomado ? ' (já escolhido)' : ''}`}
            disabled={tomado}
            className={`personagem ${atual === p ? 'personagem--escolhido' : ''}`}
            onClick={() => aoEscolher(p)}
          >
            <Retrato personagem={p} tamanho={44} apagado={tomado} />
            <span>{NOME_DO_PERSONAGEM[p]}</span>
          </button>
        );
      })}
    </div>
  );
}
