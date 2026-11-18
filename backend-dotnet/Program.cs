using Npgsql;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false)
    .AddEnvironmentVariables();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddDataProtection();

string GetConnectionString()
{
    return builder.Configuration.GetConnectionString("PostgreSQLConnection")
        ?? throw new InvalidOperationException("PostgreSQLConnection is required.");
}

if (args.Contains("--check-db", StringComparer.Ordinal))
{
    try
    {
        await using var connection = new NpgsqlConnection(GetConnectionString());
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand("SELECT current_database()", connection);
        var name = await command.ExecuteScalarAsync();
        Console.WriteLine($"Connected to database: {name}");
        return 0;
    }
    catch (InvalidOperationException)
    {
        Console.Error.WriteLine("PostgreSQLConnection is required.");
        return 2;
    }
    catch (NpgsqlException error)
    {
        Console.Error.WriteLine($"Database connection failed ({error.GetType().Name}).");
        return 1;
    }
}

var app = builder.Build();
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    context.Response.Headers["X-Request-Id"] = Guid.NewGuid().ToString();
    await next(context);
});

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
AuthEndpoints.Map(app, GetConnectionString);
MfaEndpoints.Map(app, GetConnectionString);
ReferenceEndpoints.Map(app, GetConnectionString);
DeviceEndpoints.Map(app, GetConnectionString);
DashboardEndpoints.Map(app, GetConnectionString);
InstallationEndpoints.Map(app, GetConnectionString);
InstallationWrites.Map(app, GetConnectionString);
ReplacementEndpoints.Map(app, GetConnectionString);
ReplacementWrites.Map(app, GetConnectionString);
RemovalEndpoints.Map(app, GetConnectionString);
RemovalWrites.Map(app, GetConnectionString);
TroubleshootEndpoints.Map(app, GetConnectionString);
TroubleshootWrites.Map(app, GetConnectionString);
InstallationPhotos.Map(app, GetConnectionString);
InstallationDeletes.Map(app, GetConnectionString);
InstallationUpdates.Map(app, GetConnectionString);
UserEndpoints.Map(app, GetConnectionString);
UserWrites.Map(app, GetConnectionString);
app.MapGet("/api/auth/me", async (HttpContext context, CancellationToken cancellationToken) =>
{
    var token = context.Request.Cookies["mh02_session"];
    if (string.IsNullOrEmpty(token) || token.Length > 128)
        return Results.Json(new { error = new { code = "UNAUTHENTICATED", message = "Authentication required." } }, statusCode: 401);

    try
    {
        await using var connection = new NpgsqlConnection(GetConnectionString());
        await connection.OpenAsync(cancellationToken);
        var user = await SessionStore.FindUserAsync(connection, token, cancellationToken);
        if (user is null)
            return Results.Json(new { error = new { code = "UNAUTHENTICATED", message = "Authentication required." } }, statusCode: 401);

        return Results.Ok(new
        {
            nrp = user.Nrp,
            name = user.Name,
            role = user.Role,
            siteId = user.SiteId
        });
    }
    catch (NpgsqlException)
    {
        return Results.Json(new { error = new { code = "DATABASE_UNAVAILABLE", message = "Database unavailable." } }, statusCode: 503);
    }
    catch (InvalidOperationException)
    {
        return Results.Json(new { error = new { code = "INTERNAL_ERROR", message = "Something went wrong." } }, statusCode: 500);
    }
});
await app.RunAsync();
return 0;