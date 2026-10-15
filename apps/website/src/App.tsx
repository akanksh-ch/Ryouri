import * as React from "react";

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
    <div className={`recipe-image${hero ? " hero-image" : ""}`}>
      {src && src !== failed ? (
        <img
          src={src}
          alt={hero ? title : ""}
          loading={hero ? "eager" : "lazy"}
          onError={() => setFailed(src)}
        />
      ) : (
        <span className="image-placeholder">No image</span>
      )}
    </div>
  );
}

function Failure({ retry }: { retry: () => void }) {
  return (
    <div className="notice" role="alert">
      <h2>Recipes could not be loaded</h2>
      <p>Check your connection and that the recipe service is running, then try again.</p>
      <button onClick={retry}>Try again</button>
    </div>
  );
}

function NotFound() {
  return (
    <div className="notice">
      <h1>Recipe not found</h1>
      <p>This recipe may not exist. Choose a recipe from the collection.</p>
      <a href="/">Back to recipes</a>
    </div>
  );
}

function Collection() {
  const [sort, setSort] = React.useState("asc");
  const [cuisine, setCuisine] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  const [result, setResult] = React.useState<{ recipes: Summary[]; cuisines: string[] } | null>(
    null,
  );
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();
    setResult(null);
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
        if (!controller.signal.aborted) setResult({ recipes, cuisines });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [sort, cuisine, attempt]);

  // Keep the available controls stable while the filtered results load.
  const [cuisines, setCuisines] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (result) setCuisines(result.cuisines);
  }, [result]);

  return (
    <>
      <div className="collection-heading">
        <h1>Your recipe book</h1>
        <p>Something good to cook.</p>
      </div>
      <div className="filters">
        <label>
          Cuisine
          <select value={cuisine} onChange={(event) => setCuisine(event.target.value)}>
            <option value="">All cuisines</option>
            {cuisines.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cooking time
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="asc">Shortest first</option>
            <option value="desc">Longest first</option>
          </select>
        </label>
      </div>
      {failed ? (
        <Failure retry={() => setAttempt(attempt + 1)} />
      ) : !result ? (
        <p className="notice" role="status">
          Loading recipes…
        </p>
      ) : result.recipes.length === 0 ? (
        <div className="notice" role="status">
          <h2>{cuisine ? "No recipes match this cuisine" : "No recipes yet"}</h2>
          {cuisine ? (
            <button onClick={() => setCuisine("")}>Show all cuisines</button>
          ) : (
            <p>Your collection will appear here when recipes are added.</p>
          )}
        </div>
      ) : (
        <>
          <p className="result-count" role="status">
            {result.recipes.length} {result.recipes.length === 1 ? "recipe" : "recipes"}
          </p>
          <div className="recipe-grid">
            {result.recipes.map((recipe) => (
              <article className="recipe-card" key={recipe.id}>
                <a href={`/recipes/${encodeURIComponent(recipe.id)}`}>
                  <RecipeImage src={recipe.imageUrl} title={recipe.title} />
                  <h2>{recipe.title}</h2>
                </a>
                <p>{recipe.cuisine}</p>
                <p className="cooking-time">{recipe.cookMinutes} min cooking</p>
              </article>
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
      <p className="notice" role="status">
        Loading recipe…
      </p>
    );
  if (status === "missing") return <NotFound />;
  if (status === "error" || !recipe) return <Failure retry={() => setAttempt(attempt + 1)} />;
  return (
    <article className="recipe-detail">
      <a className="back-link" href="/">
        Back to recipes
      </a>
      <RecipeImage src={recipe.imageUrl} title={recipe.title} hero />
      <h1>{recipe.title}</h1>
      {recipe.description && <p className="description">{recipe.description}</p>}
      <dl className="metadata">
        <div>
          <dt>Preparation</dt>
          <dd>{recipe.prepMinutes} min</dd>
        </div>
        <div>
          <dt>Cooking</dt>
          <dd>{recipe.cookMinutes} min</dd>
        </div>
        <div>
          <dt>Servings</dt>
          <dd>{recipe.servings}</dd>
        </div>
        <div>
          <dt>Cuisine</dt>
          <dd>{recipe.cuisine}</dd>
        </div>
      </dl>
      <div className="recipe-body">
        <section aria-labelledby="ingredients">
          <h2 id="ingredients">Ingredients</h2>
          {recipe.ingredients.map((group, index) => (
            <div className="ingredient-group" key={index}>
              {group.heading && <h3>{group.heading}</h3>}
              <ul>
                {group.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <section aria-labelledby="instructions">
          <h2 id="instructions">Instructions</h2>
          <ol className="steps">
            {recipe.steps.map((step, index) => (
              <li key={index}>{step}</li>
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
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a href="/" className="brand">
          Ryouri
        </a>
        <span>A personal recipe book</span>
      </header>
      <main id="main" tabIndex={-1}>
        {path === "/" ? <Collection /> : detail ? <Detail id={detail[1]} /> : <NotFound />}
      </main>
    </>
  );
}
