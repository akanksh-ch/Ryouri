import { afterEach, expect, test, vi } from "vite-plus/test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

test("sort/filter compose in HTTP requests and neither selection resets the other", async () => {
  const fetch = api();
  open();
  await screen.findByRole("link", { name: /Tomato Rice/ });
  expect(fetch.mock.calls.some(([url]) => url === "/api/recipes?sort=asc")).toBe(true);
  fireEvent.change(screen.getByLabelText("Cooking time"), { target: { value: "desc" } });
  fireEvent.change(screen.getByLabelText("Cuisine"), { target: { value: "Indian" } });
  await waitFor(() =>
    expect(fetch.mock.calls.some(([url]) => url === "/api/recipes?sort=desc&cuisine=Indian")).toBe(
      true,
    ),
  );
  expect((screen.getByLabelText("Cooking time") as HTMLSelectElement).value).toBe("desc");
  fireEvent.change(screen.getByLabelText("Cooking time"), { target: { value: "asc" } });
  await waitFor(() =>
    expect(fetch.mock.calls.some(([url]) => url === "/api/recipes?sort=asc&cuisine=Indian")).toBe(
      true,
    ),
  );
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

test("no matches offers a clear filter action without resetting sort", async () => {
  api([], ["Indian"]);
  open();
  await screen.findByText("No recipes yet");
  fireEvent.change(screen.getByLabelText("Cooking time"), { target: { value: "desc" } });
  fireEvent.change(screen.getByLabelText("Cuisine"), { target: { value: "Indian" } });
  expect(await screen.findByText("No recipes match this cuisine")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Show all cuisines" }));
  expect(await screen.findByText("No recipes yet")).toBeTruthy();
  expect((screen.getByLabelText("Cooking time") as HTMLSelectElement).value).toBe("desc");
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
  await screen.findByRole("heading", { name: "Tomato Rice" });
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
