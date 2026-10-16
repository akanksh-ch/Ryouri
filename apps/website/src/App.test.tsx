// @vitest-environment jsdom
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

test("cuisine display uses title case while filter values retain stored casing", async () => {
  const fetch = api([{ ...rice, cuisine: "japanese" }], ["japanese"]);
  open();
  await screen.findByRole("link", { name: /Tomato Rice/ });
  expect(screen.getByText("Japanese", { selector: "p" })).toBeTruthy();
  const sidebar = screen.getByRole("complementary", { name: "Quick filters" });
  fireEvent.click(within(sidebar).getByRole("button", { name: "Japanese" }));
  await waitFor(() =>
    expect(fetch.mock.calls.some(([url]) => url === "/api/recipes?sort=asc&cuisine=japanese")).toBe(
      true,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  const option = screen.getByRole("option", { name: "Japanese" }) as HTMLOptionElement;
  expect(option.value).toBe("japanese");
  expect((screen.getByLabelText("Cuisine") as HTMLSelectElement).value).toBe("japanese");
});

test.each([
  ["japanese", "Japanese"],
  ["middle eastern", "Middle Eastern"],
])("detail displays stored cuisine %s as %s", async (stored, label) => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ...detail, cuisine: stored }));
  open("/recipes/tomato-rice");
  await screen.findByRole("heading", { name: "Tomato Rice" });
  expect(within(screen.getByText("Cuisine").parentElement!).getByText(label)).toBeTruthy();
});

test("sort/filter compose in HTTP requests and neither selection resets the other", async () => {
  const fetch = api();
  open();
  await screen.findByRole("link", { name: /Tomato Rice/ });
  expect(fetch.mock.calls.some(([url]) => url === "/api/recipes?sort=asc")).toBe(true);
  fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "desc" } });
  fireEvent.click(
    within(screen.getByRole("complementary", { name: "Quick filters" })).getByRole("button", {
      name: "Indian",
    }),
  );
  await waitFor(() =>
    expect(fetch.mock.calls.some(([url]) => url === "/api/recipes?sort=desc&cuisine=Indian")).toBe(
      true,
    ),
  );
  expect((screen.getByLabelText("Sort by") as HTMLSelectElement).value).toBe("desc");
  fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "asc" } });
  await waitFor(() =>
    expect(fetch.mock.calls.some(([url]) => url === "/api/recipes?sort=asc&cuisine=Indian")).toBe(
      true,
    ),
  );
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

test("dropdown cuisine filter and sidebar sorting share state without resetting search or sort", async () => {
  const fetch = api([rice], ["Indian", "Italian"]);
  open();
  await screen.findByRole("link", { name: /Tomato Rice/ });
  const sidebar = screen.getByRole("complementary", { name: "Quick filters" });
  fireEvent.click(within(sidebar).getByRole("button", { name: "Longest first" }));
  expect((screen.getByLabelText("Sort by") as HTMLSelectElement).value).toBe("desc");
  fireEvent.change(screen.getByLabelText("Search recipes by title"), { target: { value: "rice" } });
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  fireEvent.change(screen.getByLabelText("Cuisine"), { target: { value: "Italian" } });
  await waitFor(() =>
    expect(fetch.mock.calls.some(([url]) => url === "/api/recipes?sort=desc&cuisine=Italian")).toBe(
      true,
    ),
  );
  expect(
    within(sidebar).getByRole("button", { name: "Italian" }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect((screen.getByLabelText("Sort by") as HTMLSelectElement).value).toBe("desc");
  expect((screen.getByLabelText("Search recipes by title") as HTMLInputElement).value).toBe("rice");
  expect(screen.getByRole("link", { name: /Tomato Rice/ })).toBeTruthy();
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
  fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "desc" } });
  fireEvent.click(
    within(screen.getByRole("complementary", { name: "Quick filters" })).getByRole("button", {
      name: "Indian",
    }),
  );
  expect(await screen.findByText("No recipes match your filters")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(await screen.findByText("No recipes yet")).toBeTruthy();
  expect((screen.getByLabelText("Sort by") as HTMLSelectElement).value).toBe("desc");
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

test.each([
  { prepMinutes: 10, cookMinutes: 0 },
  { prepMinutes: 0, cookMinutes: 10 },
])("detail displays a valid recipe with times $prepMinutes/$cookMinutes", async (times) => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ...detail, ...times }));
  open("/recipes/tomato-rice");
  await screen.findByRole("heading", { name: "Tomato Rice" });
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

test("detail metadata and navigation icons stay decorative with text labels intact", async () => {
  api();
  open("/recipes/tomato-rice");
  await screen.findByRole("heading", { name: "Tomato Rice" });
  const back = screen.getByRole("link", { name: "Back to recipes" });
  expect(back.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  for (const label of ["Preparation", "Cooking", "Servings", "Cuisine"]) {
    expect(screen.getByText(label).querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  }
  for (const icon of document.querySelectorAll("main svg")) {
    expect(icon.getAttribute("aria-hidden")).toBe("true");
  }
});

test("empty collection has a decorative accent without replacing its message", async () => {
  api([]);
  open();
  await screen.findByRole("heading", { name: "No recipes yet" });
  expect(screen.getByRole("status").querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  expect(screen.getByText("Your collection will appear here when recipes are added.")).toBeTruthy();
});
