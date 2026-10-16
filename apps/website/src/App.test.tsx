// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vite-plus/test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { App } from "./App";

const rice = {
  id: "tomato-rice",
  title: "Tomato Rice",
  cuisine: "Indian",
  cookMinutes: 25,
  imageUrl: null,
};
const detail = {
  ...rice,
  description: "A simple one-pot dish.",
  prepMinutes: 10,
  servings: 2,
  ingredients: [{ items: ["1 cup rice"] }, { heading: "Sauce", items: ["2 tomatoes", "Salt"] }],
  steps: ["Rinse rice.", "Cook together."],
};

// Only the external HTTP boundary is replaced; routing and rendered components are real.
function api(recipes: unknown = [rice], cuisines: string[] = ["Indian"], recipeStatus = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (typeof input !== "string") throw new Error("Expected a relative API URL");
    const url = input;
    if (url === "/api/cuisines") return Response.json(cuisines);
    if (url === "/api/recipes/tomato-rice") return Response.json(detail, { status: recipeStatus });
    if (url.startsWith("/api/recipes?")) return Response.json(recipes);
    return Response.json({}, { status: 404 });
  });
}
function open(path = "/") {
  window.history.replaceState(null, "", path);
  render(<App />);
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("collection uses summaries and links image/title to stable recipe URLs", async () => {
  api();
  open();
  const link = await screen.findByRole("link", { name: /Tomato Rice/ });
  expect(link.getAttribute("href")).toBe("/recipes/tomato-rice");
  expect(screen.getByText("25 min cooking")).toBeTruthy();
  expect(screen.getByText("Indian", { selector: "p" })).toBeTruthy();
  expect(screen.getByText("No image")).toBeTruthy();
});

test.each([
  ["japanese", "Japanese"],
  ["middle eastern", "Middle Eastern"],
])("detail displays stored cuisine %s as %s", async (stored, label) => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ...detail, cuisine: stored }));
  open("/recipes/tomato-rice");
  await screen.findByRole("heading", { name: /Tomato Rice/ });
  expect(within(screen.getByText("Cuisine").parentElement!).getByText(label)).toBeTruthy();
});

test("local title search ignores case and surrounding spaces without new requests", async () => {
  const fetch = api([
    { ...rice, id: "salad", title: "Garden Salad", cookMinutes: 0 },
    { ...rice, id: "quick-rice", title: "Quick Rice", cookMinutes: 10 },
    rice,
  ]);
  open();
  await screen.findByRole("link", { name: /Tomato Rice/ });
  const calls = fetch.mock.calls.length;
  fireEvent.change(screen.getByLabelText("Search recipes by title"), {
    target: { value: " SALAD " },
  });
  expect(screen.queryByRole("link", { name: /Quick Rice/ })).toBeNull();
  expect(screen.getByRole("link", { name: /Garden Salad/ })).toBeTruthy();
  expect(fetch.mock.calls.length).toBe(calls);
  fireEvent.change(screen.getByLabelText("Search recipes by title"), {
    target: { value: "missing" },
  });
  expect(screen.getByText("No recipes match your filters")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("link", { name: /Tomato Rice/ })).toBeTruthy();
});

const collection = [
  { ...rice, id: "zero", title: "Zero Rice", cookMinutes: 0 },
  { ...rice, id: "five", title: "Five Rice", cookMinutes: 5 },
  { ...rice, id: "ten", title: "Ten Rice", cuisine: "italian", cookMinutes: 10 },
  rice,
  { ...rice, id: "thirty", title: "Thirty Rice", cuisine: "japanese", cookMinutes: 30 },
];
const titles = () =>
  screen
    .queryAllByRole("article")
    .map((article) => within(article).getByRole("heading").textContent);
const sidebar = () => within(screen.getByRole("complementary", { name: "Quick filters" }));

test("optional exclusive time toggles use strict cooking-time boundaries and toggle off", async () => {
  api(collection, ["Indian", "italian", "japanese"]);
  open();
  await screen.findByRole("link", { name: /Tomato Rice/ });
  expect(titles()).toHaveLength(5);
  for (const button of sidebar().getAllByRole("button"))
    expect(button.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(sidebar().getByRole("button", { name: "Under 30 min" }));
  expect(titles()).toEqual(["Zero Rice", "Five Rice", "Ten Rice", "Tomato Rice"]);
  fireEvent.click(sidebar().getByRole("button", { name: "Under 10 min" }));
  expect(titles()).toEqual(["Zero Rice", "Five Rice"]);
  expect(sidebar().getByRole("button", { name: "Under 30 min" }).getAttribute("aria-pressed")).toBe(
    "false",
  );
  fireEvent.click(sidebar().getByRole("button", { name: "Under 5 min" }));
  expect(titles()).toEqual(["Zero Rice"]);
  fireEvent.click(sidebar().getByRole("button", { name: "Under 5 min" }));
  expect(titles()).toHaveLength(5);
});

test("API cuisine checkboxes default to all and synchronize single/multiple/empty selections", async () => {
  api(collection, ["Indian", "italian", "japanese"]);
  open();
  await screen.findByRole("link", { name: /Tomato Rice/ });
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  expect(screen.queryByRole("button", { name: "All cuisines" })).toBeNull();
  for (const checkbox of screen.getAllByRole("checkbox"))
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: "Japanese" }));
  expect(titles()).toEqual(["Zero Rice", "Five Rice", "Ten Rice", "Tomato Rice"]);
  expect(sidebar().queryAllByRole("button", { pressed: true })).toHaveLength(0);
  fireEvent.click(screen.getByRole("checkbox", { name: "Indian" }));
  expect(titles()).toEqual(["Ten Rice"]);
  expect(sidebar().getByRole("button", { name: "Italian" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Italian" }));
  expect(screen.getByText("No recipes match your filters")).toBeTruthy();
  fireEvent.click(sidebar().getByRole("button", { name: "Japanese" }));
  expect((screen.getByRole("checkbox", { name: "Japanese" }) as HTMLInputElement).checked).toBe(
    true,
  );
  expect((screen.getByRole("checkbox", { name: "Indian" }) as HTMLInputElement).checked).toBe(
    false,
  );
  fireEvent.click(sidebar().getByRole("button", { name: "Japanese" }));
  for (const checkbox of screen.getAllByRole("checkbox"))
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  expect(titles()).toHaveLength(5);
});

test("search, cuisine, time and sort compose locally; clear preserves sort and restores all controls", async () => {
  const fetch = api(collection, ["Indian", "italian", "japanese"]);
  open();
  await screen.findByRole("link", { name: /Tomato Rice/ });
  const calls = fetch.mock.calls.length;
  fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "desc" } });
  fireEvent.change(screen.getByLabelText("Search recipes by title"), {
    target: { value: " RICE " },
  });
  fireEvent.click(sidebar().getByRole("button", { name: "Indian" }));
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  const popover = within(screen.getByRole("dialog", { name: "Recipe filters" }));
  fireEvent.click(popover.getByRole("button", { name: "Under 10 min", hidden: true }));
  expect(titles()).toEqual(["Five Rice", "Zero Rice"]);
  expect(sidebar().getByRole("button", { name: "Under 10 min" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(titles()).toEqual(["Thirty Rice", "Tomato Rice", "Ten Rice", "Five Rice", "Zero Rice"]);
  expect((screen.getByLabelText("Sort by") as HTMLSelectElement).value).toBe("desc");
  expect((screen.getByLabelText("Search recipes by title") as HTMLInputElement).value).toBe("");
  for (const checkbox of screen.getAllByRole("checkbox"))
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  expect(sidebar().queryAllByRole("button", { pressed: true })).toHaveLength(0);
  expect(fetch.mock.calls.length).toBe(calls);
});

test("a single API cuisine still has an optional sidebar toggle", async () => {
  api();
  open();
  await screen.findByRole("link", { name: /Tomato Rice/ });
  const button = sidebar().getByRole("button", { name: "Indian" });
  expect(button.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(button);
  expect(button.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(button);
  expect(button.getAttribute("aria-pressed")).toBe("false");
});

test("an empty collection stays distinct even when filters are set", async () => {
  api([], ["Indian"]);
  open();
  await screen.findByText("No recipes yet");
  fireEvent.change(screen.getByLabelText("Search recipes by title"), {
    target: { value: "missing" },
  });
  fireEvent.click(sidebar().getByRole("button", { name: "Under 5 min" }));
  expect(screen.getByText("No recipes yet")).toBeTruthy();
  expect(screen.queryByText("No recipes match your filters")).toBeNull();
});

test("loading is distinct from an empty collection", async () => {
  let resolve!: (value: Response) => void;
  vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
    input === "/api/cuisines"
      ? Promise.resolve(Response.json([]))
      : new Promise((done) => {
          resolve = done;
        }),
  );
  open();
  expect(screen.getByRole("status").textContent).toContain("Loading");
  resolve(Response.json([]));
  expect(await screen.findByText("No recipes yet")).toBeTruthy();
});

test.each(["/api/recipes?sort=asc", "/api/cuisines"])(
  "failed %s is an error, not empty, and can retry",
  async (failedUrl) => {
    const fetch = api();
    const normal = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (input, init) =>
      input === failedUrl ? Response.json({}, { status: 503 }) : normal(input, init),
    );
    open();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("No recipes yet")).toBeNull();
    fetch.mockImplementation(normal);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /Tomato Rice/ })).toBeTruthy();
  },
);

test("direct detail URL preserves content order, plain/grouped ingredients, and ordered steps", async () => {
  api();
  open("/recipes/tomato-rice");
  await screen.findByRole("heading", { name: /Tomato Rice/ });
  const main = screen.getByRole("main");
  expect(
    within(main)
      .getAllByRole("heading")
      .map((h) => h.textContent),
  ).toEqual(["Tomato Rice", "Ingredients", "Sauce", "Instructions"]);
  expect(screen.getByText("10 min")).toBeTruthy();
  expect(screen.getByText("25 min")).toBeTruthy();
  expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
    "1 cup rice",
    "2 tomatoes",
    "Salt",
    "Rinse rice.",
    "Cook together.",
  ]);
  expect(screen.getByText("Rinse rice.").closest("ol")).toBeTruthy();
});

test.each([
  { prepMinutes: 10, cookMinutes: 0 },
  { prepMinutes: 0, cookMinutes: 10 },
])("detail displays a valid recipe with times $prepMinutes/$cookMinutes", async (times) => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ...detail, ...times }));
  open("/recipes/tomato-rice");
  await screen.findByRole("heading", { name: /Tomato Rice/ });
  expect(
    within(screen.getByText("Preparation").parentElement!).getByText(`${times.prepMinutes} min`),
  ).toBeTruthy();
  expect(
    within(screen.getByText("Cooking").parentElement!).getByText(`${times.cookMinutes} min`),
  ).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("unknown detail URL is not found, not a request failure", async () => {
  api();
  open("/recipes/unknown");
  expect(await screen.findByRole("heading", { name: "Recipe not found" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("detail server failure is retryable rather than not found", async () => {
  const fetch = api([rice], ["Indian"], 503);
  open("/recipes/tomato-rice");
  expect(await screen.findByRole("alert")).toBeTruthy();
  fetch.mockRestore();
  api();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: "Tomato Rice" })).toBeTruthy();
});

test("broken image falls back without hiding the recipe", async () => {
  api([{ ...rice, imageUrl: "/images/missing.webp" }]);
  open();
  const link = await screen.findByRole("link", { name: /Tomato Rice/ });
  const image = link.querySelector("img")!;
  expect(image.getAttribute("loading")).toBe("lazy");
  fireEvent.error(image);
  expect(screen.getByText("No image")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Tomato Rice/ })).toBeTruthy();
});

test("recipe text is never interpreted as HTML", async () => {
  api([{ ...rice, title: "<script>bad()</script>" }]);
  open();
  expect(await screen.findByText("<script>bad()</script>")).toBeTruthy();
  expect(document.querySelector("main script")).toBeNull();
});
