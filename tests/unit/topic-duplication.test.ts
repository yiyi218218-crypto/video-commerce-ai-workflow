import { describe, expect, it } from "vitest";

import { findTopicDuplicates } from "../../src/services/publishing/topic-duplication.js";

describe("findTopicDuplicates", () => {
  it("flags the same historical event and characters as a duplicate topic", () => {
    const matches = findTopicDuplicates(
      "鸿门宴输在犹豫\n范增三次举玉玦，项庄舞剑逼近，项羽没有下决断，刘邦等到了脱身的窗口。",
      [
        "鸿门宴上，范增三次举玦，项庄舞剑，刘邦却从楚军眼前脱身。项羽失去的，到底是一场酒局，还是最后的机会？",
      ],
    );

    expect(matches[0]).toMatchObject({
      shared_terms: expect.arrayContaining([
        "鸿门宴",
        "范增",
        "项庄",
        "项羽",
        "刘邦",
      ]),
    });
  });

  it("does not flag unrelated historical topics", () => {
    const matches = findTopicDuplicates(
      "围魏救赵真正高明在哪里\n孙膑没有直接救赵，而是去打魏国最疼的地方。",
      [
        "鸿门宴上，范增三次举玦，项庄舞剑，刘邦却从楚军眼前脱身。",
      ],
    );

    expect(matches).toEqual([]);
  });
});
