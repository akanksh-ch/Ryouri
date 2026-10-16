using System.Text.Json;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddSingleton(_ => NpgsqlDataSource.Create(
    builder.Configuration.GetConnectionString("Recipes")
    ?? throw new InvalidOperationException("Configure ConnectionStrings:Recipes.")));

// Match .NET Trim's whitespace set when comparing PostgreSQL labels.
const string trimWhitespace = " \t\n\r\v\f\u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000";

var app = builder.Build();
// Use the same sanitized error response in Development; never expose database diagnostics over HTTP.
app.UseExceptionHandler(error => error.Run(context => Results.Problem().ExecuteAsync(context)));
app.UseStatusCodePages();
if (app.Environment.IsDevelopment()) app.MapOpenApi();

app.MapGet("/api/recipes", async (string? sort, string? cuisine, NpgsqlDataSource database, CancellationToken cancellationToken) =>
{
    if (sort is not null and not "asc" and not "desc")
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["sort"] = ["Use asc or desc."] });

    // Only the validated direction is SQL syntax; all request values remain parameters.
    var direction = sort == "desc" ? "DESC" : "ASC";
    await using var command = database.CreateCommand($"""
        SELECT id, title, cuisine, cook_minutes, image_path
        FROM recipes
        WHERE $1 = '' OR lower(btrim(cuisine, $2)) = lower($1)
        ORDER BY cook_minutes {direction}, title COLLATE "C" ASC, id COLLATE "C" ASC
        """);
    command.Parameters.AddWithValue(cuisine?.Trim() ?? "");
    command.Parameters.AddWithValue(trimWhitespace);
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    var recipes = new List<RecipeSummary>();
    while (await reader.ReadAsync(cancellationToken))
        recipes.Add(new(reader.GetString(0), reader.GetString(1), reader.GetString(2).Trim(), reader.GetInt32(3),
            reader.IsDBNull(4) ? null : "/images/" + reader.GetString(4)));
    return Results.Ok(recipes);
});

app.MapGet("/api/cuisines", async (NpgsqlDataSource database, CancellationToken cancellationToken) =>
{
    await using var command = database.CreateCommand("SELECT cuisine FROM recipes ORDER BY cuisine COLLATE \"C\"");
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    var cuisines = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    while (await reader.ReadAsync(cancellationToken)) cuisines.Add(reader.GetString(0).Trim());
    return Results.Ok(cuisines.Order(StringComparer.OrdinalIgnoreCase));
});

app.MapGet("/api/recipes/{id}", async (string id, NpgsqlDataSource database, CancellationToken cancellationToken) =>
{
    await using var command = database.CreateCommand("""
        SELECT id, title, description, cuisine, prep_minutes, cook_minutes, servings, ingredients, steps, image_path
        FROM recipes WHERE id = $1
        """);
    command.Parameters.AddWithValue(id);
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
    return Results.Ok(new RecipeDetail(reader.GetString(0), reader.GetString(1),
        reader.IsDBNull(2) ? null : reader.GetString(2), reader.GetString(3).Trim(),
        reader.GetInt32(4), reader.GetInt32(5), reader.GetInt32(6),
        JsonSerializer.Deserialize<JsonElement>(reader.GetString(7)), reader.GetFieldValue<string[]>(8),
        reader.IsDBNull(9) ? null : "/images/" + reader.GetString(9)));
});

app.Run();

public partial class Program;

record RecipeSummary(string Id, string Title, string Cuisine, int CookMinutes, string? ImageUrl);
record RecipeDetail(string Id, string Title, string? Description, string Cuisine, int PrepMinutes,
    int CookMinutes, int Servings, JsonElement Ingredients, string[] Steps, string? ImageUrl);
