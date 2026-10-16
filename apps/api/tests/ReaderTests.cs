using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace Api.Tests;

public sealed class ReaderTests : IClassFixture<ReaderDatabase>
{
    private readonly ReaderDatabase database;
    private readonly HttpClient client;

    public ReaderTests(ReaderDatabase database)
    {
        this.database = database;
        client = database.Factory.CreateClient();
    }

    [Theory]
    [InlineData("", new[] { "quick", "same-a", "same-b", "z-last", "slow" })]
    [InlineData("?sort=asc", new[] { "quick", "same-a", "same-b", "z-last", "slow" })]
    [InlineData("?sort=desc", new[] { "slow", "same-a", "same-b", "z-last", "quick" })]
    public async Task Collection_sorts_by_cook_time_with_ascending_title_and_id_ties(string query, string[] expected)
    {
        var recipes = await client.GetFromJsonAsync<JsonElement[]>("/api/recipes" + query);
        Assert.NotNull(recipes);
        Assert.Equal(expected, recipes.Select(r => r.GetProperty("id").GetString()));
        Assert.All(recipes, recipe => Assert.Equal(
            new[] { "cookMinutes", "cuisine", "id", "imageUrl", "title" },
            recipe.EnumerateObject().Select(p => p.Name).Order()));
        Assert.Equal(10, recipes.Single(r => r.GetProperty("id").GetString() == "quick").GetProperty("cookMinutes").GetInt32());
    }

    [Fact]
    public async Task Cuisine_filter_normalizes_whitespace_and_case_and_composes_with_sort()
    {
        var recipes = await client.GetFromJsonAsync<JsonElement[]>("/api/recipes?sort=desc&cuisine=%09%20iNdIaN%20%0A");
        Assert.Equal(new[] { "same-a", "same-b", "quick" }, recipes!.Select(r => r.GetProperty("id").GetString()));
        Assert.Empty((await client.GetFromJsonAsync<JsonElement[]>("/api/recipes?cuisine=" + Uri.EscapeDataString("' OR true --")))!);
        Assert.Equal(5, (await client.GetFromJsonAsync<JsonElement[]>("/api/recipes?cuisine=%20%09"))!.Length);
    }

    [Fact]
    public async Task Cuisine_options_are_trimmed_unique_and_not_affected_by_filter_requests()
    {
        await client.GetAsync("/api/recipes?cuisine=Italian");
        var cuisines = await client.GetFromJsonAsync<string[]>("/api/cuisines");
        Assert.Equal(2, cuisines!.Length);
        Assert.All(cuisines, c => Assert.Equal(c.Trim(), c));
        Assert.Equal(new[] { "indian", "italian" }, cuisines.Select(c => c.ToLowerInvariant()).Order());
    }

    [Fact]
    public async Task Detail_preserves_all_fields_group_item_and_step_order()
    {
        var recipe = await client.GetFromJsonAsync<JsonElement>("/api/recipes/same-a");
        Assert.Equal("same-a", recipe.GetProperty("id").GetString());
        Assert.Equal("Alpha", recipe.GetProperty("title").GetString());
        Assert.Equal("A description", recipe.GetProperty("description").GetString());
        Assert.Equal("Indian", recipe.GetProperty("cuisine").GetString());
        Assert.Equal(90, recipe.GetProperty("prepMinutes").GetInt32());
        Assert.Equal(20, recipe.GetProperty("cookMinutes").GetInt32());
        Assert.Equal(2, recipe.GetProperty("servings").GetInt32());
        Assert.Equal("/images/example.webp", recipe.GetProperty("imageUrl").GetString());
        var groups = recipe.GetProperty("ingredients");
        Assert.Equal(3, groups.GetArrayLength());
        Assert.Equal("Dough", groups[0].GetProperty("heading").GetString());
        Assert.Equal(new[] { "Flour", "Water" }, groups[0].GetProperty("items").EnumerateArray().Select(i => i.GetString()));
        Assert.False(groups[1].TryGetProperty("heading", out _));
        Assert.Equal("Salt", groups[1].GetProperty("items")[0].GetString());
        Assert.Equal("Stuffing", groups[2].GetProperty("heading").GetString());
        Assert.Equal("Cheese", groups[2].GetProperty("items")[0].GetString());
        Assert.Equal(new[] { "Mix", "Fill", "Cook" }, recipe.GetProperty("steps").EnumerateArray().Select(s => s.GetString()));

        var plain = await client.GetFromJsonAsync<JsonElement>("/api/recipes/quick");
        Assert.Equal(JsonValueKind.Null, plain.GetProperty("imageUrl").ValueKind);
        Assert.False(plain.GetProperty("ingredients")[0].TryGetProperty("heading", out _));
    }

    [Fact]
    public async Task Unknown_id_returns_problem_details_and_weather_sample_is_removed()
    {
        var response = await client.GetAsync("/api/recipes/missing");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal(404, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/weatherforecast")).StatusCode);
    }

    [Theory]
    [InlineData("sideways")]
    [InlineData("desc;DROP TABLE recipes")]
    [InlineData("")]
    public async Task Invalid_sort_returns_field_keyed_validation_problem(string sort)
    {
        var response = await client.GetAsync("/api/recipes?sort=" + Uri.EscapeDataString(sort));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.NotEmpty(problem.GetProperty("errors").GetProperty("sort").EnumerateArray());
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(-1, 1)]
    [InlineData(1, -1)]
    [InlineData(-1, int.MaxValue)]
    [InlineData(int.MaxValue, -1)]
    public async Task Persistence_rejects_negative_times_or_both_times_zero(int prepMinutes, int cookMinutes)
    {
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        await using var command = new NpgsqlCommand("""
            INSERT INTO recipes (id, title, cuisine, prep_minutes, cook_minutes, servings, ingredients, steps)
            VALUES ('invalid-times', 'Invalid times', 'Indian', $1, $2, 1, '[{"items":["Rice"]}]', ARRAY['Cook'])
            """, connection, transaction);
        command.Parameters.AddWithValue(prepMinutes);
        command.Parameters.AddWithValue(cookMinutes);
        var error = await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync());
        Assert.Equal(PostgresErrorCodes.CheckViolation, error.SqlState);
    }

    [Theory]
    [InlineData(1, 1)]
    [InlineData(0, 1)]
    [InlineData(1, 0)]
    [InlineData(0, int.MaxValue)]
    [InlineData(int.MaxValue, 0)]
    [InlineData(1, int.MaxValue)]
    [InlineData(int.MaxValue, 1)]
    [InlineData(int.MaxValue, int.MaxValue)]
    public async Task Persistence_accepts_nonnegative_times_when_either_is_positive_without_sum_overflow(int prepMinutes, int cookMinutes)
    {
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        await using var command = new NpgsqlCommand("""
            INSERT INTO recipes (id, title, cuisine, prep_minutes, cook_minutes, servings, ingredients, steps)
            VALUES ('valid-times', 'Valid times', 'Indian', $1, $2, 1, '[{"items":["Rice"]}]', ARRAY['Cook'])
            """, connection, transaction);
        command.Parameters.AddWithValue(prepMinutes);
        command.Parameters.AddWithValue(cookMinutes);
        Assert.Equal(1, await command.ExecuteNonQueryAsync());
    }

    [Fact]
    public async Task Empty_database_is_a_successful_empty_collection()
    {
        using var factory = new ReaderFactory(database.EmptyConnectionString);
        using var emptyClient = factory.CreateClient();
        Assert.Empty((await emptyClient.GetFromJsonAsync<JsonElement[]>("/api/recipes"))!);
        Assert.Empty((await emptyClient.GetFromJsonAsync<string[]>("/api/cuisines"))!);
    }

    [Theory]
    [InlineData("/api/recipes")]
    [InlineData("/api/cuisines")]
    [InlineData("/api/recipes/quick")]
    public async Task Database_failure_returns_sanitized_problem_not_empty_success(string path)
    {
        // A nonexistent schema fails real SQL without depending on a particular closed network port.
        using var factory = new ReaderFactory(database.MissingSchemaConnectionString);
        using var brokenClient = factory.CreateClient();
        var response = await brokenClient.GetAsync(path);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("Npgsql", body);
        Assert.DoesNotContain("recipes", body);
        Assert.DoesNotContain("Exception", body);
        Assert.Equal(500, JsonDocument.Parse(body).RootElement.GetProperty("status").GetInt32());
    }
}

public sealed class ReaderFactory(string connectionString) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Also prove Development never leaks database exception details.
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(
            new Dictionary<string, string?> { ["ConnectionStrings:Recipes"] = connectionString }));
    }
}

public sealed class ReaderDatabase : IAsyncLifetime
{
    private readonly string schema = "reader_" + Guid.NewGuid().ToString("N");
    private string connectionString = null!;
    public ReaderFactory Factory { get; private set; } = null!;
    public string ConnectionString { get; private set; } = null!;
    public string EmptyConnectionString { get; private set; } = null!;
    public string MissingSchemaConnectionString { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        connectionString = Environment.GetEnvironmentVariable("RYOURI_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set RYOURI_TEST_CONNECTION to a disposable PostgreSQL database (CREATE SCHEMA required).");
        var migrationDirectory = Environment.GetEnvironmentVariable("RYOURI_TEST_MIGRATIONS")
            ?? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../database/migrations"));
        var migrationPaths = Directory.GetFiles(migrationDirectory, "*.sql").Order(StringComparer.Ordinal).ToArray();
        if (migrationPaths.Length == 0) throw new InvalidOperationException("No database migrations found.");
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using (var command = new NpgsqlCommand($"CREATE SCHEMA {schema}; CREATE SCHEMA {schema}_empty", connection))
            await command.ExecuteNonQueryAsync();
        var populated = new NpgsqlConnectionStringBuilder(connectionString) { SearchPath = schema }.ConnectionString;
        ConnectionString = populated;
        EmptyConnectionString = new NpgsqlConnectionStringBuilder(connectionString) { SearchPath = schema + "_empty" }.ConnectionString;
        MissingSchemaConnectionString = new NpgsqlConnectionStringBuilder(connectionString) { SearchPath = schema + "_missing" }.ConnectionString;
        foreach (var target in new[] { populated, EmptyConnectionString })
        {
            await using var schemaConnection = new NpgsqlConnection(target);
            await schemaConnection.OpenAsync();
            foreach (var migrationPath in migrationPaths)
            {
                await using var command = new NpgsqlCommand(await File.ReadAllTextAsync(migrationPath), schemaConnection);
                await command.ExecuteNonQueryAsync();
            }
        }
        await using var seedConnection = new NpgsqlConnection(populated);
        await seedConnection.OpenAsync();
        await using var seed = new NpgsqlCommand("""
            INSERT INTO recipes (id, title, description, cuisine, prep_minutes, cook_minutes, servings, ingredients, steps, image_path)
            VALUES
              ('slow', 'Slow', NULL, 'Italian', 1, 30, 1, '[{"items":["Rice"]}]', ARRAY['Cook'], NULL),
              ('z-last', 'Zulu', NULL, 'italian', 1, 20, 1, '[{"items":["Rice"]}]', ARRAY['Cook'], NULL),
              ('same-b', 'Alpha', NULL, E'\t indian \n', 1, 20, 1, '[{"items":["Rice"]}]', ARRAY['Cook'], NULL),
              ('same-a', 'Alpha', 'A description', 'Indian', 90, 20, 2,
                '[{"heading":"Dough","items":["Flour","Water"]},{"items":["Salt"]},{"heading":"Stuffing","items":["Cheese"]}]',
                ARRAY['Mix','Fill','Cook'], 'example.webp'),
              ('quick', 'Quick', NULL, 'INDIAN', 120, 10, 1, '[{"items":["Rice"]}]', ARRAY['Cook'], NULL)
            """, seedConnection);
        await seed.ExecuteNonQueryAsync();
        Factory = new ReaderFactory(populated);
    }

    public async Task DisposeAsync()
    {
        if (Factory is not null) await Factory.DisposeAsync();
        if (connectionString is null) return;
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"DROP SCHEMA IF EXISTS {schema} CASCADE; DROP SCHEMA IF EXISTS {schema}_empty CASCADE", connection);
        await command.ExecuteNonQueryAsync();
    }
}
