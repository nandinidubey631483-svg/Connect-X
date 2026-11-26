import React from "react";
import { render, screen } from "@testing-library/react";
import Badge from "../Badge";

describe("ConnectX Badge Component", () => {
  it("renders badge count accurately", () => {
    render(<Badge count={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("formats counts above 99 as 99+", () => {
    render(<Badge count={150} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("renders nothing when count is 0", () => {
    const { container } = render(<Badge count={0} />);
    expect(container.firstChild).toBeNull();
  });
});
