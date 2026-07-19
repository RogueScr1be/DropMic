import { create } from 'zustand';

export type AuthFlowStep =
  | 'closed'
  | 'explanation'
  | 'email'
  | 'otp'
  | 'onboarding'
  | 'complete'
  | 'sign_in_email'
  | 'sign_in_otp';

type AuthFlowState = {
  step: AuthFlowStep;
  email: string;
  ageGateConfirmed: boolean;
  goals: string[];
  blockers: string[];
  freeTextGoal: string;
  setStep: (step: AuthFlowStep) => void;
  setEmail: (email: string) => void;
  setAgeGateConfirmed: (confirmed: boolean) => void;
  toggleGoal: (goal: string) => void;
  toggleBlocker: (blocker: string) => void;
  setFreeTextGoal: (goal: string) => void;
  reset: () => void;
};

const initialState = {
  step: 'closed' as const,
  email: '',
  ageGateConfirmed: false,
  goals: [],
  blockers: [],
  freeTextGoal: '',
};

export const useAuthFlowStore = create<AuthFlowState>((set) => ({
  ...initialState,
  setStep: (step) => set({ step }),
  setEmail: (email) => set({ email }),
  setAgeGateConfirmed: (ageGateConfirmed) => set({ ageGateConfirmed }),
  toggleGoal: (goal) =>
    set((state) => ({ goals: state.goals.includes(goal) ? state.goals.filter((item) => item !== goal) : [...state.goals, goal] })),
  toggleBlocker: (blocker) =>
    set((state) => ({ blockers: state.blockers.includes(blocker) ? state.blockers.filter((item) => item !== blocker) : [...state.blockers, blocker] })),
  setFreeTextGoal: (freeTextGoal) => set({ freeTextGoal }),
  reset: () => set(initialState),
}));
