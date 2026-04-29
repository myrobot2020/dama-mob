import { an148Quiz, type SuttaQuiz } from "./an148Quiz";
import { an1Quizzes } from "./an1Quizzes";
import { an11Quizzes } from "./an11Quizzes";

function normalizeSuttaId(suttaId: string): string {
  return suttaId.trim().replace(/^AN\s+/i, "");
}

const quizzes = [an148Quiz, ...an1Quizzes, ...an11Quizzes];

export function getSuttaQuiz(suttaId: string): SuttaQuiz | null {
  const normalized = normalizeSuttaId(suttaId);
  return quizzes.find((quiz) => normalizeSuttaId(quiz.suttaId) === normalized) ?? null;
}

export const suttaQuizzes = quizzes;
