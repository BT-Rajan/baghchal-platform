/** Plans as the server describes them, for screen tests. */
import type { Feature, MyPlan, PlanInfo } from '@/api/endpoints';

const PLUS: Feature[] = ['analysis', 'badge', 'computer_hard', 'full_history', 'themes'];

export const PLANS: PlanInfo[] = [
  {
    plan: 'free',
    name: 'Free',
    features: [],
    monthly_paise: null,
    yearly_paise: null,
    analyses_per_day: 0,
  },
  {
    plan: 'plus',
    name: 'Plus',
    features: PLUS,
    monthly_paise: 14900,
    yearly_paise: 149000,
    analyses_per_day: 5,
  },
  {
    plan: 'pro',
    name: 'Pro',
    features: [...PLUS, 'tournaments', 'trainer'],
    monthly_paise: 29900,
    yearly_paise: 299000,
    analyses_per_day: null,
  },
];

export const FREE: MyPlan = { plan: 'free', plan_until: null, features: [], grants: [] };

export const PLUS_UNTIL: MyPlan = {
  plan: 'plus',
  plan_until: '2026-02-01T12:00:00Z',
  features: PLUS,
  grants: [],
};
