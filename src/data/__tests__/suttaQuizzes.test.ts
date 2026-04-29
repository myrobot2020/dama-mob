import { describe, expect, it } from "vitest";
import { getSuttaQuiz, suttaQuizzes } from "../suttaQuizzes";

describe("suttaQuizzes", () => {
  it("has one MCQ for each requested Book of Ones sutta", () => {
    expect(suttaQuizzes.map((quiz) => quiz.suttaId)).toEqual(
      expect.arrayContaining([
        "AN 1.18.13",
        "AN 1.19",
        "AN 1.19.2",
        "AN 1.20.1",
        "AN 1.20.2",
      ]),
    );
  });

  it("resolves AN-prefixed and unprefixed ids", () => {
    expect(getSuttaQuiz("AN 1.19")?.goldOptionId).toBe("rare-receptivity");
    expect(getSuttaQuiz("1.19")?.goldOptionId).toBe("rare-receptivity");
    expect(getSuttaQuiz("AN 1.48")?.goldOptionId).toBe("trainability");
    expect(getSuttaQuiz("AN 11.6")?.goldOptionId).toBe("respect-noble-ones");
  });

  it("shows teacher summaries for the Book of Ones quizzes instead of teacher clips", () => {
    const bookOfOnes = suttaQuizzes.filter((quiz) => quiz.suttaId.startsWith("AN 1."));

    expect(bookOfOnes).toHaveLength(5);
    for (const quiz of bookOfOnes) {
      expect(quiz.teacherClip).toBeUndefined();
      expect(quiz.teacherSummary?.length).toBeGreaterThan(80);
    }
  });
});
