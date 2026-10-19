import type { components } from './schema';

type Schemas = components['schemas'];

export type Me = Schemas['MeOut'];
export type Session = Schemas['SessionOut'];
export type Player = Schemas['PlayerOut'];
export type PlayerStatus = Schemas['PlayerStatusOut'];
export type Profile = Schemas['ProfileOut'];
export type Rating = Schemas['RatingOut'];
export type Challenge = Schemas['ChallengeOut'];
export type ChallengeIn = Schemas['ChallengeIn'];
export type ChallengeList = Schemas['ChallengeList'];
export type Game = Schemas['GameOut'];
export type Clocks = Schemas['ClocksOut'];
export type Match = Schemas['MatchOut'];
export type LeaderboardEntry = Schemas['LeaderboardEntry'];
export type Category = Schemas['Category'];
export type RegisterIn = Schemas['RegisterIn'];
export type Side = 'goat' | 'tiger';
export type TimeControl = ChallengeIn['time_control'];

export const TIME_CONTROLS: readonly { label: TimeControl; category: Category }[] = [
  { label: '3+2', category: 'blitz' },
  { label: '5+3', category: 'blitz' },
  { label: '10+5', category: 'rapid' },
  { label: '15+10', category: 'rapid' },
];
