import { expect, test } from "vitest";
import { createPr } from "../create-pr";

test("createPr", () => {
  expect(createPr(false)).toMatchSnapshot();
});

test("createPr draft", () => {
  expect(createPr(true)).toMatchSnapshot();
});