import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Label } from "./components/ui/label";
import { NativeSelect, NativeSelectOption } from "./components/ui/native-select";

type Summary = {
  id: string;
  title: string;
  cuisine: string;
  cookMinutes: number;
  imageUrl: string | null;
};
type Recipe = Summary & {
  description?: string;
  prepMinutes: number;
  servings: number;
  ingredients: { heading?: string; items: string[] }[];
  steps: string[];
};

async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

function RecipeImage({
  src,
  title,
  hero = false,
}: {
  src: string | null;
  title: string;
  hero?: boolean;
}) {
  const [failed, setFailed] = React.useState<string | null>(null);
  return (
    <div
      className={`grid place-items-center overflow-hidden bg-muted ${hero ? "mb-7 aspect-[16/10] max-h-[420px] rounded-xl sm:aspect-[16/7]" : "aspect-[16/10]"}`}
    >
      {src && src !== failed ? (
        <img
          className="h-full min-h-0 w-full object-cover"
          src={src}
          alt={hero ? title : ""}
          loading={hero ? "eager" : "lazy"}
          onError={() => setFailed(src)}
        />
      ) : (
        <span className="text-sm text-muted-foreground">No image</span>
      )}
    </div>
  );
}

function Failure({ retry }: { retry: () => void }) {
  return (
    <Alert variant="destructive" className="my-8 max-w-prose p-5">
      <AlertTitle>
        <h2 className="text-base font-semibold">Recipes could not be loaded</h2>
      </AlertTitle>
      <AlertDescription>
        <p>Check your connection and that the recipe service is running, then try again.</p>
        <Button className="mt-3 min-h-11" onClick={retry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function NotFound() {
  return (
    <div className="max-w-prose space-y-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Recipe not found</h1>
      <p className="text-muted-foreground">
        This recipe may not exist. Choose a recipe from the collection.
      </p>
      <Button asChild variant="outline" className="min-h-11">
        <a href="/">Back to recipes</a>
      </Button>
    </div>
  );
}

function Collection() {
  const [sort, setSort] = React.useState("asc");
  const [cuisine, setCuisine] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  const [recipes, setRecipes] = React.useState<Summary[] | null>(null);
  const [cuisines, setCuisines] = React.useState<string[]>([]);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();
    setRecipes(null);
    setFailed(false);
    const query = new URLSearchParams({ sort });
    if (cuisine) query.set("cuisine", cuisine);
    Promise.all([
      read<Summary[]>(`/api/recipes?${query}`, controller.signal),
      read<string[]>("/api/cuisines", controller.signal),
    ])
      .then(([recipes, cuisines]) => {
        if (!Array.isArray(recipes) || !Array.isArray(cuisines))
          throw new Error("Invalid collection response");
        if (!controller.signal.aborted) {
          setRecipes(recipes);
          setCuisines(cuisines);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [sort, cuisine, attempt]);

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your recipe book</h1>
      <p className="mt-3 text-muted-foreground">Something good to cook.</p>
      <div className="mt-8 flex flex-wrap gap-5 border-b pb-6">
        <div className="grid w-full gap-2 sm:w-60">
          <Label htmlFor="cuisine">Cuisine</Label>
          <NativeSelect
            id="cuisine"
            className="w-full [&_select]:h-11"
            value={cuisine}
            onChange={(event) => setCuisine(event.target.value)}
          >
            <NativeSelectOption value="">All cuisines</NativeSelectOption>
            {cuisines.map((name) => (
              <NativeSelectOption key={name} value={name}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid w-full gap-2 sm:w-60">
          <Label htmlFor="sort">Cooking time</Label>
          <NativeSelect
            id="sort"
            className="w-full [&_select]:h-11"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <NativeSelectOption value="asc">Shortest first</NativeSelectOption>
            <NativeSelectOption value="desc">Longest first</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>
      {failed ? (
        <Failure retry={() => setAttempt(attempt + 1)} />
      ) : !recipes ? (
        <p className="py-12 text-muted-foreground" role="status">
          Loading recipes…
        </p>
      ) : recipes.length === 0 ? (
        <div className="space-y-4 py-12" role="status">
          <h2 className="text-xl font-semibold">
            {cuisine ? "No recipes match this cuisine" : "No recipes yet"}
          </h2>
          {cuisine ? (
            <Button className="min-h-11" onClick={() => setCuisine("")}>
              Show all cuisines
            </Button>
          ) : (
            <p className="text-muted-foreground">
              Your collection will appear here when recipes are added.
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="my-5 text-sm text-muted-foreground" role="status">
            {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}
          </p>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {recipes.map((recipe) => (
              <Card className="gap-0 pt-0" key={recipe.id}>
                <article className="min-w-0">
                  <a
                    className="group block rounded-t-xl"
                    href={`/recipes/${encodeURIComponent(recipe.id)}`}
                  >
                    <RecipeImage src={recipe.imageUrl} title={recipe.title} />
                    <CardHeader className="py-4">
                      <CardTitle>
                        <h2 className="text-lg font-semibold group-hover:underline group-hover:underline-offset-4">
                          {recipe.title}
                        </h2>
                      </CardTitle>
                    </CardHeader>
                  </a>
                  <CardContent className="space-y-1 text-muted-foreground">
                    <p>{recipe.cuisine}</p>
                    <p className="text-sm">{recipe.cookMinutes} min cooking</p>
                  </CardContent>
                </article>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Detail({ id }: { id: string }) {
  const [recipe, setRecipe] = React.useState<Recipe | null>(null);
  const [status, setStatus] = React.useState("loading");
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    read<Recipe>(`/api/recipes/${encodeURIComponent(id)}`, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setRecipe(value);
          setStatus("ready");
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setStatus(error instanceof Error && error.message === "404" ? "missing" : "error");
      });
    return () => controller.abort();
  }, [id, attempt]);
  React.useEffect(() => {
    document.title = recipe ? `${recipe.title} | Ryouri` : "Recipe | Ryouri";
  }, [recipe]);

  if (status === "loading")
    return (
      <p className="py-12 text-muted-foreground" role="status">
        Loading recipe…
      </p>
    );
  if (status === "missing") return <NotFound />;
  if (status === "error" || !recipe) return <Failure retry={() => setAttempt(attempt + 1)} />;
  return (
    <article className="mx-auto max-w-4xl">
      <Button asChild variant="outline" className="mb-6 min-h-11">
        <a href="/">Back to recipes</a>
      </Button>
      <RecipeImage src={recipe.imageUrl} title={recipe.title} hero />
      <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
        {recipe.title}
      </h1>
      {recipe.description && (
        <p className="mt-4 max-w-prose whitespace-pre-wrap text-muted-foreground">
          {recipe.description}
        </p>
      )}
      <dl className="my-8 grid grid-cols-2 gap-5 border-y py-6 sm:grid-cols-4">
        <div>
          <dt className="text-sm text-muted-foreground">Preparation</dt>
          <dd className="mt-1 font-medium">{recipe.prepMinutes} min</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Cooking</dt>
          <dd className="mt-1 font-medium">{recipe.cookMinutes} min</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Servings</dt>
          <dd className="mt-1 font-medium">{recipe.servings}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Cuisine</dt>
          <dd className="mt-1 font-medium">{recipe.cuisine}</dd>
        </div>
      </dl>
      <div className="grid gap-8 md:grid-cols-[1fr_1.65fr] md:gap-12">
        <section className="min-w-0" aria-labelledby="ingredients">
          <h2 className="mb-5 text-2xl font-semibold" id="ingredients">
            Ingredients
          </h2>
          {recipe.ingredients.map((group, index) => (
            <div className="mb-6" key={index}>
              {group.heading && <h3 className="mb-3 text-lg font-medium">{group.heading}</h3>}
              <ul className="list-disc space-y-3 pl-5 leading-relaxed">
                {group.items.map((item, itemIndex) => (
                  <li className="pl-1 whitespace-pre-wrap" key={itemIndex}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <section className="min-w-0" aria-labelledby="instructions">
          <h2 className="mb-5 text-2xl font-semibold" id="instructions">
            Instructions
          </h2>
          <ol className="list-decimal space-y-6 pl-6 leading-relaxed marker:font-semibold">
            {recipe.steps.map((step, index) => (
              <li className="pl-2 whitespace-pre-wrap" key={index}>
                {step}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  );
}

export function App() {
  const path = window.location.pathname;
  const detail = /^\/recipes\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(path);
  return (
    <>
      <a
        className="absolute -top-24 left-4 z-10 rounded-md bg-background p-3 underline focus:top-4"
        href="#main"
      >
        Skip to content
      </a>
      <header className="mx-auto flex max-w-7xl items-baseline justify-between gap-4 border-b px-4 py-5 sm:px-8">
        <a href="/" className="text-2xl font-semibold tracking-tight">
          Ryouri
        </a>
        <span className="text-sm text-muted-foreground">A personal recipe book</span>
      </header>
      <main
        className="mx-auto max-w-7xl px-4 py-8 wrap-anywhere sm:px-8 sm:py-10"
        id="main"
        tabIndex={-1}
      >
        {path === "/" ? <Collection /> : detail ? <Detail id={detail[1]} /> : <NotFound />}
      </main>
    </>
  );
}
