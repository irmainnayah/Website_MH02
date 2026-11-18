using System.Security.Cryptography;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.DataProtection;
using Npgsql;
using OtpNet;
using QRCoder;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record MfaCodeRequest(string? Code);

public static class MfaEndpoints
{
    public const string CookieName = "mh02_mfa";
    public const string ProtectorPurpose = "MH02.Totp.v1";

    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        var protector = app.Services.GetRequiredService<IDataProtectionProvider>().CreateProtector(ProtectorPurpose);

        app.MapGet("/api/auth/mfa/setup", async (HttpContext context, CancellationToken cancellationToken) =>
        {
            var token = context.Request.Cookies[CookieName];
            if (string.IsNullOrEmpty(token) || token.Length > 128)
                return Error(401, "MFA_EXPIRED", "Authentication challenge expired.");
            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                await using var command = new NpgsqlCommand("""
                    SELECT c.pending_secret, u.nrp
                    FROM auth_mfa_challenges c JOIN users u ON u.user_id = c.user_id
                    WHERE c.token_hash = @hash AND c.consumed_at IS NULL AND c.expires_at > CURRENT_TIMESTAMP
                      AND c.failed_attempts < 5 AND c.pending_secret IS NOT NULL AND u.status = 'active'
                      AND NOT EXISTS (SELECT 1 FROM user_totp t WHERE t.user_id = c.user_id)
                    """, connection);
                command.Parameters.AddWithValue("hash", SessionStore.HashToken(token));
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Error(401, "MFA_EXPIRED", "Authentication challenge expired.");
                var secret = protector.Unprotect(reader.GetString(0));
                var uri = new OtpUri(OtpType.Totp, secret, reader.GetString(1), "MH02 Asset Report").ToString();
                var image = PngByteQRCodeHelper.GetQRCode(uri, QRCodeGenerator.ECCLevel.Q, 6);
                return Results.Ok(new { qrCode = "data:image/png;base64," + Convert.ToBase64String(image) });
            }
            catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
            catch (CryptographicException) { return Error(503, "MFA_UNAVAILABLE", "Authenticator setup unavailable."); }
        });

        app.MapPost("/api/auth/mfa/verify", async (HttpContext context, MfaCodeRequest input, CancellationToken cancellationToken) =>
        {
            if (!AuthEndpoints.HasAllowedOrigin(context)) return Error(403, "BAD_ORIGIN", "Cross-origin request refused.");
            var token = context.Request.Cookies[CookieName];
            if (string.IsNullOrEmpty(token) || token.Length > 128) return Error(401, "MFA_EXPIRED", "Authentication challenge expired.");
            if (input.Code is null || input.Code.Length != 6 || input.Code.Any(character => character < '0' || character > '9'))
                return Error(400, "VALIDATION_FAILED", "The request is not valid.");
            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
                await using var challenge = new NpgsqlCommand("""
                    SELECT c.user_id, c.pending_secret, c.failed_attempts, u.nrp, u.name, u.site_id, r.role_code
                    FROM auth_mfa_challenges c JOIN users u ON u.user_id = c.user_id JOIN roles r ON r.role_id = u.role_id
                    WHERE c.token_hash = @hash AND c.consumed_at IS NULL AND c.expires_at > CURRENT_TIMESTAMP
                      AND c.failed_attempts < 5 AND u.status = 'active'
                      AND (u.locked_until IS NULL OR u.locked_until <= CURRENT_TIMESTAMP)
                    FOR UPDATE OF c, u
                    """, connection, transaction);
                challenge.Parameters.AddWithValue("hash", SessionStore.HashToken(token));
                Guid userId;
                string? pendingSecret;
                string nrp, name, role;
                int? siteId;
                await using (var reader = await challenge.ExecuteReaderAsync(cancellationToken))
                {
                    if (!await reader.ReadAsync(cancellationToken)) return Error(401, "MFA_EXPIRED", "Authentication challenge expired.");
                    userId = reader.GetGuid(0);
                    pendingSecret = reader.IsDBNull(1) ? null : reader.GetString(1);
                    nrp = reader.GetString(3);
                    name = reader.GetString(4);
                    siteId = reader.IsDBNull(5) ? null : reader.GetInt32(5);
                    role = reader.GetString(6);
                }
                if (role is not ("user" or "superadmin") || (role == "user" && siteId is null))
                    return Error(403, "NO_SITE_ASSIGNED", "Your account has no valid role or Site assigned.");

                string? savedSecret = null;
                long? lastStep = null;
                await using (var existing = new NpgsqlCommand("SELECT protected_secret, last_accepted_step FROM user_totp WHERE user_id = @id FOR UPDATE", connection, transaction))
                {
                    existing.Parameters.AddWithValue("id", userId);
                    await using var reader = await existing.ExecuteReaderAsync(cancellationToken);
                    if (await reader.ReadAsync(cancellationToken)) { savedSecret = reader.GetString(0); lastStep = reader.GetInt64(1); }
                }
                var protectedSecret = savedSecret ?? pendingSecret;
                if (protectedSecret is null) return Error(401, "MFA_EXPIRED", "Authentication challenge expired.");
                var secret = protector.Unprotect(protectedSecret);
                var totp = new Totp(Base32Encoding.ToBytes(secret));
                var valid = totp.VerifyTotp(input.Code, out var step, new VerificationWindow(previous: 1, future: 1));
                if (!valid || (lastStep is not null && step <= lastStep.Value))
                {
                    await using var failed = new NpgsqlCommand("""
                        UPDATE auth_mfa_challenges SET failed_attempts = failed_attempts + 1,
                            consumed_at = CASE WHEN failed_attempts + 1 >= 5 THEN CURRENT_TIMESTAMP ELSE consumed_at END
                        WHERE token_hash = @hash;
                        UPDATE users SET failed_login_count = COALESCE(failed_login_count, 0) + 1,
                            locked_until = CASE WHEN COALESCE(failed_login_count, 0) + 1 >= 5
                                THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes' ELSE locked_until END
                        WHERE user_id = @id
                        """, connection, transaction);
                    failed.Parameters.AddWithValue("hash", SessionStore.HashToken(token));
                    failed.Parameters.AddWithValue("id", userId);
                    await failed.ExecuteNonQueryAsync(cancellationToken);
                    await transaction.CommitAsync(cancellationToken);
                    return Error(401, "MFA_INVALID", "Authenticator code is invalid.");
                }

                var sessionToken = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
                var expiresAt = DateTimeOffset.UtcNow.AddHours(8);
                await using var save = new NpgsqlCommand("""
                    INSERT INTO user_totp (user_id, protected_secret, last_accepted_step)
                    VALUES (@id, @secret, @step)
                    ON CONFLICT (user_id) DO UPDATE SET last_accepted_step = EXCLUDED.last_accepted_step;
                    UPDATE auth_mfa_challenges SET consumed_at = CURRENT_TIMESTAMP
                    WHERE user_id = @id AND consumed_at IS NULL;
                    UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP WHERE user_id = @id;
                    INSERT INTO auth_sessions (token_hash, user_id, expires_at, mfa_verified_at)
                    VALUES (@hash, @id, @expires, CURRENT_TIMESTAMP)
                    """, connection, transaction);
                save.Parameters.AddWithValue("id", userId);
                save.Parameters.AddWithValue("secret", protectedSecret);
                save.Parameters.AddWithValue("step", step);
                save.Parameters.AddWithValue("hash", SessionStore.HashToken(sessionToken));
                save.Parameters.AddWithValue("expires", expiresAt);
                await save.ExecuteNonQueryAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                context.Response.Cookies.Append("mh02_session", sessionToken, new CookieOptions
                {
                    HttpOnly = true, Secure = !app.Environment.IsDevelopment(), SameSite = SameSiteMode.Lax, Path = "/", Expires = expiresAt
                });
                context.Response.Cookies.Delete(CookieName, new CookieOptions
                {
                    HttpOnly = true, Secure = !app.Environment.IsDevelopment(), SameSite = SameSiteMode.Lax, Path = "/"
                });
                return Results.Ok(new { user = new { nrp, name, role, siteId } });
            }
            catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
            catch (CryptographicException) { return Error(503, "MFA_UNAVAILABLE", "Authenticator unavailable."); }
            catch (FormatException) { return Error(503, "MFA_UNAVAILABLE", "Authenticator unavailable."); }
        });
    }

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}