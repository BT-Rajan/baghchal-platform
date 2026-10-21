import { useState, type ReactNode } from 'react';

import { useMe } from '@/auth/session';
import { t } from '@/i18n';
import { searchPrefix } from '@/lobby/format';
import { useOnlinePlayers, usePlayerSearch } from '@/lobby/hooks';

import { Card, Hint, SectionTitle } from './Card';
import { PlayerRow } from './PlayerRow';
import { ErrorState, Loading } from './States';
import { TextField } from './TextField';

/**
 * Players to play or befriend: who is online, or, as a username is typed, the players whose
 * names start with it (each leading to their profile). On the home screen and in a new
 * player's "Make it yours". `nobodyElse` is what to say when nobody else is online.
 */
export function PlayerSearch({ nobodyElse }: { nobodyElse: ReactNode }) {
  const me = useMe();
  const [search, setSearch] = useState('');
  const prefix = searchPrefix(search);
  const online = useOnlinePlayers();
  const found = usePlayerSearch(prefix);
  const players = prefix === null ? online : found;
  const others = players.data?.filter((p) => p.id !== me.id).length ?? 0;
  return (
    <>
      <SectionTitle>
        {prefix === null ? t('Online now') : t('Players starting with “{prefix}”', { prefix })}
      </SectionTitle>
      <TextField
        label={t('Find a player')}
        value={search}
        onChangeText={setSearch}
        placeholder={t('Username')}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
      />
      {players.error !== null ? (
        <ErrorState error={players.error} onRetry={() => void players.refetch()} />
      ) : players.data === undefined ? (
        <Loading label={t('Loading players')} />
      ) : players.data.length === 0 ? (
        prefix === null ? (
          nobodyElse
        ) : (
          <Hint>{t('No players found.')}</Hint>
        )
      ) : (
        <>
          <Card>
            {players.data.map((player) => (
              <PlayerRow key={player.id} player={player} isMe={player.id === me.id} />
            ))}
          </Card>
          {prefix === null && others === 0 && nobodyElse}
        </>
      )}
    </>
  );
}
