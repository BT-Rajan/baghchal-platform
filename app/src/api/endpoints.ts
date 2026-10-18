/** Every server endpoint, typed with the schema generated from the server (schema.d.ts). */
import type { Client, Transport } from './client';
import type { components } from './schema';

type S = components['schemas'];

export type Me = S['MeOut'];
export type Session = S['SessionOut'];
export type Player = S['PlayerOut'];
export type PlayerStatus = S['PlayerStatusOut'];
export type Profile = S['ProfileOut'];
export type Rating = S['RatingOut'];
export type Challenge = S['ChallengeOut'];
export type ChallengeList = S['ChallengeList'];
export type ChallengeRequest = S['ChallengeIn'];
export type Game = S['GameOut'];
export type LeaderboardEntry = S['LeaderboardEntry'];
export type Category = S['Category'];
export type TimeControl = S['ChallengeIn']['time_control'];
export type Side = NonNullable<S['ChallengeIn']['side']>;
export type EndReason = S['EndReason'];
export type DataExport = S['ExportOut'];
export type ReportReason = S['ReportIn']['reason'];
export type Report = S['ReportOut'];
export type ReportStatus = S['ReportOut']['status'];
export type ModPlayer = S['ModPlayerOut'];
export type ComputerGameRequest = S['ComputerGameIn'];
export type Level = NonNullable<S['ComputerGameIn']['level']>;
export type SeekResult = S['SeekOut'];
export type SeekCount = S['SeekCountOut'];
export type GameSummary = S['GameSummaryOut'];
export type Plan = S['Plan'];
export type Feature = S['Feature'];
export type PlanInfo = S['PlanInfo'];
export type MyPlan = S['MyPlanOut'];
export type PlayerPlan = S['PlayerPlanOut'];
export type Grant = S['GrantOut'];
export type GrantRequest = S['GrantIn'];
export type Analysis = S['AnalysisOut'];
export type MoveReview = S['MoveReviewOut'];
export type Verdict = S['MoveReviewOut']['verdict'];
export type Appearance = S['AppearanceOut'];
export type BoardTheme = S['BoardTheme'];
export type PieceSet = S['PieceSet'];
export type SoundPack = S['SoundPack'];
export type Badge = NonNullable<S['PlayerOut']['badge']>;

export type ChallengeAnswer = 'accept' | 'decline' | 'cancel';
export type GameAction = 'resign' | 'abort' | 'claim-abandonment';

const V1 = '/api/v1';
const seg = encodeURIComponent;

export function createApi(client: Client, transport: Transport) {
  return {
    // Accounts
    register: (body: S['RegisterIn']) =>
      client.post<S['Accepted']>(`${V1}/auth/register`, { body }),
    verifyEmail: (token: string) =>
      client.post<Session>(`${V1}/auth/verify-email`, { body: { token, transport } }),
    login: (login: string, password: string) =>
      client.post<Session>(`${V1}/auth/login`, { body: { login, password, transport } }),
    logout: () => client.post<void>(`${V1}/auth/logout`),
    requestPasswordReset: (email: string) =>
      client.post<S['Accepted']>(`${V1}/auth/password-reset`, { body: { email } }),
    confirmPasswordReset: (token: string, password: string) =>
      client.post<void>(`${V1}/auth/password-reset/confirm`, { body: { token, password } }),
    me: (signal?: AbortSignal) => client.get<Me>(`${V1}/me`, { signal }),
    changePassword: (currentPassword: string, newPassword: string) =>
      client.post<void>(`${V1}/me/password`, {
        body: { current_password: currentPassword, new_password: newPassword },
      }),
    changeEmail: (password: string, email: string) =>
      client.post<S['Accepted']>(`${V1}/me/email`, { body: { password, email } }),
    confirmEmailChange: (token: string) =>
      client.post<S['EmailChangedOut']>(`${V1}/auth/confirm-email`, { body: { token } }),
    exportData: () => client.get<DataExport>(`${V1}/me/export`),
    deleteAccount: (password: string) =>
      client.post<void>(`${V1}/me/delete`, { body: { password } }),

    // Lobby
    searchPlayers: (prefix: string, signal?: AbortSignal) =>
      client.get<PlayerStatus[]>(`${V1}/players`, { query: { prefix }, signal }),
    onlinePlayers: (signal?: AbortSignal) =>
      client.get<PlayerStatus[]>(`${V1}/players/online`, { signal }),
    profile: (username: string, signal?: AbortSignal) =>
      client.get<Profile>(`${V1}/players/${seg(username)}`, { signal }),
    challenges: (signal?: AbortSignal) => client.get<ChallengeList>(`${V1}/challenges`, { signal }),
    challenge: (body: ChallengeRequest) => client.post<Challenge>(`${V1}/challenges`, { body }),
    answerChallenge: (id: string, answer: ChallengeAnswer) =>
      client.post<Challenge>(`${V1}/challenges/${seg(id)}/${answer}`),

    // Games
    playComputer: (body: ComputerGameRequest) =>
      client.post<Game>(`${V1}/games/computer`, { body }),
    seek: (timeControl: TimeControl, rated: boolean) =>
      client.post<SeekResult>(`${V1}/seeks`, { body: { time_control: timeControl, rated } }),
    stopSeeking: () => client.delete<void>(`${V1}/seeks`),
    seekCounts: (signal?: AbortSignal) => client.get<SeekCount[]>(`${V1}/seeks`, { signal }),
    playerGames: (username: string, before?: string, signal?: AbortSignal) =>
      client.get<GameSummary[]>(`${V1}/players/${seg(username)}/games`, {
        query: before === undefined ? {} : { before },
        signal,
      }),
    activeGames: (signal?: AbortSignal) => client.get<Game[]>(`${V1}/games`, { signal }),
    game: (id: string, signal?: AbortSignal) =>
      client.get<Game>(`${V1}/games/${seg(id)}`, { signal }),
    move: (id: string, ply: number, move: string) =>
      client.post<Game>(`${V1}/games/${seg(id)}/moves`, { body: { ply, move } }),
    gameAction: (id: string, action: GameAction) =>
      client.post<Game>(`${V1}/games/${seg(id)}/${action}`),
    analysis: (id: string, signal?: AbortSignal) =>
      client.get<Analysis>(`${V1}/games/${seg(id)}/analysis`, { signal }),
    analyse: (id: string) => client.post<Analysis>(`${V1}/games/${seg(id)}/analysis`),

    // Blocking
    blocks: (signal?: AbortSignal) => client.get<Player[]>(`${V1}/blocks`, { signal }),
    block: (username: string) => client.put<void>(`${V1}/blocks/${seg(username)}`),
    unblock: (username: string) => client.delete<void>(`${V1}/blocks/${seg(username)}`),

    // Reports and moderation
    report: (username: string, body: S['ReportIn']) =>
      client.post<S['Accepted']>(`${V1}/players/${seg(username)}/report`, { body }),
    modReports: (status: ReportStatus, signal?: AbortSignal) =>
      client.get<Report[]>(`${V1}/mod/reports`, { query: { status }, signal }),
    dismissReport: (id: string, reason: string) =>
      client.post<Report>(`${V1}/mod/reports/${seg(id)}/dismiss`, { body: { reason } }),
    modPlayer: (username: string, signal?: AbortSignal) =>
      client.get<ModPlayer>(`${V1}/mod/players/${seg(username)}`, { signal }),
    suspend: (username: string, days: number | null, reason: string) =>
      client.post<ModPlayer>(`${V1}/mod/players/${seg(username)}/suspend`, {
        body: { days, reason },
      }),
    unsuspend: (username: string, reason: string) =>
      client.post<ModPlayer>(`${V1}/mod/players/${seg(username)}/unsuspend`, { body: { reason } }),
    rename: (username: string, newUsername: string, reason: string) =>
      client.post<ModPlayer>(`${V1}/mod/players/${seg(username)}/rename`, {
        body: { username: newUsername, reason },
      }),

    // Plans
    plans: (signal?: AbortSignal) => client.get<PlanInfo[]>(`${V1}/plans`, { signal }),
    myPlan: (signal?: AbortSignal) => client.get<MyPlan>(`${V1}/me/plan`, { signal }),
    playerPlan: (username: string, signal?: AbortSignal) =>
      client.get<PlayerPlan>(`${V1}/admin/players/${seg(username)}/plan`, { signal }),
    grant: (username: string, body: GrantRequest) =>
      client.post<Grant>(`${V1}/admin/players/${seg(username)}/grants`, { body }),
    revokeGrant: (id: string, reason: string) =>
      client.post<Grant>(`${V1}/admin/grants/${seg(id)}/revoke`, { body: { reason } }),

    // Appearance
    appearance: (signal?: AbortSignal) => client.get<Appearance>(`${V1}/me/appearance`, { signal }),
    setAppearance: (body: Appearance) => client.put<Appearance>(`${V1}/me/appearance`, { body }),

    // Ratings
    leaderboard: (category: Category, signal?: AbortSignal) =>
      client.get<LeaderboardEntry[]>(`${V1}/leaderboards/${category}`, { signal }),
  };
}

export type Api = ReturnType<typeof createApi>;
