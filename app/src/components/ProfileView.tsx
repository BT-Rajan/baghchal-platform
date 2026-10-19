import type { Profile } from '@/api/types';

import { StatusDot, ratingText } from './lobby';
import { Body, Card, Row, Title } from './ui';

export function ProfileView({ profile }: { profile: Profile }) {
  const joined = new Date(profile.created_at).toLocaleDateString();
  return (
    <>
      <Row>
        <Title>{profile.username}</Title>
        <StatusDot online={profile.online} playing={profile.playing} />
        <Body muted>{profile.playing ? 'Playing now' : profile.online ? 'Online' : 'Offline'}</Body>
      </Row>
      <Body muted>Joined {joined}</Body>
      <Row>
        {(['blitz', 'rapid'] as const).map((category) => {
          const rating = profile.ratings[category];
          return (
            <Card key={category} style={{ minWidth: 150 }}>
              <Body muted>{category === 'blitz' ? 'Blitz' : 'Rapid'}</Body>
              <Title>{ratingText(rating)}</Title>
              <Body muted>
                {rating
                  ? `${rating.games} games${rating.rank ? ` · #${rating.rank}` : ''}${rating.provisional ? ' · provisional' : ''}`
                  : 'No rated games yet'}
              </Body>
            </Card>
          );
        })}
      </Row>
    </>
  );
}
