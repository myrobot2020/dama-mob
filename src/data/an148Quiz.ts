export type QuizOption = {
  id: string;
  title: string;
  body: string;
};

export type SuttaQuiz = {
  suttaId: string;
  quote: string;
  options: QuizOption[];
  /** Which option turns a yellow leaf gold (teacher-aligned review). */
  goldOptionId: string;
  /** Optional teacher micro-clip window (seconds) for review mode. */
  teacherClip?: { startS: number; endS: number; label: string };
};

export const an148Quiz: SuttaQuiz = {
  suttaId: "1.48",
  quote: "Monks, I know not of any other single thing so quick to change as the mind.",
  options: [
    {
      id: "speed",
      title: "Speed of change (literal)",
      body: "The mind changes extremely quickly.",
    },
    {
      id: "impermanence",
      title: "Impermanence of states",
      body: "Any mental state is short-lived.",
    },
    {
      id: "transformation",
      title: "Possibility of transformation",
      body: "Change in the mind does not require long time.",
    },
    {
      id: "unreliability",
      title: "Unreliability of current experience",
      body: "What is present in the mind now is not stable.",
    },
    {
      id: "trainability",
      title: "Trainability of the mind",
      body: "Because it changes quickly, the mind can be redirected.",
    },
  ],
  goldOptionId: "trainability",
  teacherClip: { startS: 328.7, endS: 412.06, label: "Teacher micro-clip" },
};

