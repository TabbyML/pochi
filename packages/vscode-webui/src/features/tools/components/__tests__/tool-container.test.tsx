import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpandableToolContainer } from "../tool-container";

describe("ExpandableToolContainer", () => {
  it("does not render lazy expandable detail while collapsed", () => {
    const renderExpandableDetail = vi.fn(() => <div>Lazy detail</div>);

    render(
      <ExpandableToolContainer
        title="Tool title"
        renderExpandableDetail={renderExpandableDetail}
      />,
    );

    expect(renderExpandableDetail).not.toHaveBeenCalled();
    expect(screen.queryByText("Lazy detail")).toBeNull();
  });

  it("renders lazy expandable detail after expanding", () => {
    const renderExpandableDetail = vi.fn(() => <div>Lazy detail</div>);

    render(
      <ExpandableToolContainer
        title="Tool title"
        renderExpandableDetail={renderExpandableDetail}
      />,
    );

    fireEvent.click(screen.getByLabelText("Expand tool details"));

    expect(renderExpandableDetail).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Lazy detail")).toBeTruthy();
  });
});
