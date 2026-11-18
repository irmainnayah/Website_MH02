using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.DataProtection;
using Npgsql;
using NpgsqlTypes;
using OtpNet;

public sealed record LoginRequest(string Nrp);

public static class AuthEndpoints
{
    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapPost("/api/auth/login", async (HttpContext context, CancellationToken cancellationToken) =>
        {
            if (!HasAllowedOrigin(context))
                return Error(403, "BAD_ORIGIN", "Cross-origin request refused.");

            string ldapUsername;
            string nrp;
            try
            {
                using var document = await JsonDocument.ParseAsync(context.Request.Body, cancellationToken: cancellationToken);
                var root = document.RootElement;
                if (root.ValueKind != JsonValueKind.Object ||
                    root.EnumerateObject().Any(property => property.Name != "nrp") ||
                    !root.TryGetProperty("nrp", out var nrpValue) || nrpValue.ValueKind != JsonValueKind.String)
                    return Error(400, "VALIDATION_FAILED", "The request is not valid.");

                ldapUsername = nrpValue.GetString()!.Trim();
                if (!Regex.IsMatch(ldapUsername, "^[pPlL][A-Za-z0-9._-]{1,29}$"))
                    return Error(400, "VALIDATION_FAILED", "The request is not valid.");
                nrp = ldapUsername[1..];
                var requiredPrefix = nrp.StartsWith("JI", StringComparison.OrdinalIgnoreCase) ? 'L' : 'P';
                if (char.ToUpperInvariant(ldapUsername[0]) != requiredPrefix)
                    return Error(400, "VALIDATION_FAILED", "The request is not valid.");
            }
            catch (JsonException)
            {
                return Error(400, "INVALID_JSON", "The request body must be valid JSON.");
            }

            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
                await using var find = new NpgsqlCommand("""
                    SELECT u.user_id, u.nrp, u.name, u.status, u.site_id, r.role_code,
                           GREATEST(0, CEIL(EXTRACT(EPOCH FROM (u.locked_until - CURRENT_TIMESTAMP))))::integer
                    FROM users u JOIN roles r ON r.role_id = u.role_id
                    WHERE u.nrp = @nrp FOR UPDATE OF u
                    """, connection, transaction);
                find.Parameters.AddWithValue("nrp", nrp);
                Guid? userId = null;
                string? role = null, status = null;
                int? siteId = null;
                var lockedSeconds = 0;
                await using (var reader = await find.ExecuteReaderAsync(cancellationToken))
                {
                    if (await reader.ReadAsync(cancellationToken))
                    {
                        userId = reader.GetGuid(0);
                        status = reader.GetString(3);
                        siteId = reader.IsDBNull(4) ? null : reader.GetInt32(4);
                        role = reader.GetString(5);
                        lockedSeconds = reader.IsDBNull(6) ? 0 : reader.GetInt32(6);
                    }
                }

                if (userId is null || status != "active")
                {
                    app.Logger.LogWarning("Login rejected: account missing or inactive. Request: {RequestId}.", context.TraceIdentifier);
                    return Error(401, "INVALID_CREDENTIALS", "NRP or password is incorrect.");
                }
                if (lockedSeconds > 0)
                {
                    context.Response.Headers.RetryAfter = lockedSeconds.ToString();
                    return Error(429, "ACCOUNT_LOCKED", "Too many failed attempts. Try again later.");
                }
                if (role is not ("user" or "superadmin") || (role == "user" && siteId is null))
                    return Error(403, "NO_SITE_ASSIGNED", "Your account has no valid role or Site assigned.");

                await using var enrolled = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM user_totp WHERE user_id = @id)", connection, transaction);
                enrolled.Parameters.AddWithValue("id", userId.Value);
                var setupRequired = !(bool)(await enrolled.ExecuteScalarAsync(cancellationToken))!;
                await using var recent = new NpgsqlCommand("""
                    SELECT count(*) FROM auth_mfa_challenges
                    WHERE user_id = @id AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 minute'
                    """, connection, transaction);
                recent.Parameters.AddWithValue("id", userId.Value);
                if ((long)(await recent.ExecuteScalarAsync(cancellationToken))! >= 5)
                {
                    context.Response.Headers.RetryAfter = "60";
                    return Error(429, "RATE_LIMITED", "Too many requests. Try again later.");
                }
                var token = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
                var expiresAt = DateTimeOffset.UtcNow.AddMinutes(5);
                string? protectedSecret = null;
                if (setupRequired)
                {
                    var protector = app.Services.GetRequiredService<IDataProtectionProvider>().CreateProtector(MfaEndpoints.ProtectorPurpose);
                    protectedSecret = protector.Protect(Base32Encoding.ToString(KeyGeneration.GenerateRandomKey(20)));
                }
                await using var save = new NpgsqlCommand("""
                    INSERT INTO auth_mfa_challenges (token_hash, user_id, expires_at, pending_secret)
                    VALUES (@hash, @id, @expires, @secret)
                    """, connection, transaction);
                save.Parameters.AddWithValue("id", userId.Value);
                save.Parameters.AddWithValue("hash", SessionStore.HashToken(token));
                save.Parameters.AddWithValue("expires", expiresAt);
                save.Parameters.Add("secret", NpgsqlDbType.Text).Value = (object?)protectedSecret ?? DBNull.Value;
                await save.ExecuteNonQueryAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                context.Response.Cookies.Append(MfaEndpoints.CookieName, token, new CookieOptions
                {
                    HttpOnly = true, Secure = !app.Environment.IsDevelopment(), SameSite = SameSiteMode.Lax,
                    Path = "/", Expires = expiresAt
                });
                return Results.Ok(new { mfaRequired = true, setupRequired });
            }
            catch (NpgsqlException)
            {
                app.Logger.LogWarning("Login database unavailable. Request: {RequestId}.", context.TraceIdentifier);
                return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable.");
            }
        }).Accepts<LoginRequest>("application/json");

        app.MapPost("/api/auth/logout", async (HttpContext context, CancellationToken cancellationToken) =>
        {
            if (!HasAllowedOrigin(context))
                return Error(403, "BAD_ORIGIN", "Cross-origin request refused.");
            var token = context.Request.Cookies["mh02_session"];
            try
            {
                if (!string.IsNullOrEmpty(token) && token.Length <= 128)
                {
                    await using var connection = new NpgsqlConnection(getConnectionString());
                    await connection.OpenAsync(cancellationToken);
                    await using var command = new NpgsqlCommand("""
                        UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP
                        WHERE token_hash = @hash AND revoked_at IS NULL
                        """, connection);
                    command.Parameters.AddWithValue("hash", SessionStore.HashToken(token));
                    await command.ExecuteNonQueryAsync(cancellationToken);
                }
                context.Response.Cookies.Delete("mh02_session", new CookieOptions
                {
                    HttpOnly = true, Secure = !app.Environment.IsDevelopment(), SameSite = SameSiteMode.Lax, Path = "/"
                });
                return Results.Ok(new { loggedOut = true });
            }
            catch (NpgsqlException)
            {
                return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable.");
            }
        });
    }

    public static bool HasAllowedOrigin(HttpContext context)
    {
        var origin = context.Request.Headers.Origin.ToString();
        return string.IsNullOrEmpty(origin) ||
            (Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
             string.Equals(uri.Authority, context.Request.Host.Value, StringComparison.OrdinalIgnoreCase));
    }

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}