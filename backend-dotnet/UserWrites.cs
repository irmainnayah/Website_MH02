using System.Net.Mail;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Npgsql;
using NpgsqlTypes;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreateUserRequest(string? Nrp, string? Name, string? Email, string? Phone, string? Role, int? SiteId);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record UpdateUserRequest(string? Name, string? Email, string? Phone, string? Role, int? SiteId, string? Status);

public static class UserWrites
{
    private sealed record UserState(Guid UserId, string Nrp, string Name, string? Email, string? Phone, string Role, int? SiteId, string Status);

    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapPost("/api/users", async (HttpContext context, CreateUserRequest input, CancellationToken cancellationToken) =>
        {
            var nrp = input.Nrp?.Trim() ?? "";
            var name = input.Name?.Trim() ?? "";
            var email = Normalize(input.Email);
            var phone = Normalize(input.Phone);
            if (!Regex.IsMatch(nrp, "^[A-Za-z0-9._-]{3,29}$") || !Valid(name, email, phone, input.Role, input.SiteId, "active"))
                return Error(400, "VALIDATION_FAILED", "The request is not valid.");
            return await WriteAsync(context, getConnectionString, null,
                new UserState(Guid.NewGuid(), nrp, name, email, phone, input.Role!, input.SiteId, "active"), cancellationToken);
        });

        app.MapPut("/api/users/{id:guid}", async (HttpContext context, Guid id, UpdateUserRequest input, CancellationToken cancellationToken) =>
        {
            var name = input.Name?.Trim() ?? "";
            var email = Normalize(input.Email);
            var phone = Normalize(input.Phone);
            if (!Valid(name, email, phone, input.Role, input.SiteId, input.Status))
                return Error(400, "VALIDATION_FAILED", "The request is not valid.");
            return await WriteAsync(context, getConnectionString, id,
                new UserState(id, "", name, email, phone, input.Role!, input.SiteId, input.Status!), cancellationToken);
        });

        app.MapDelete("/api/users/{id:guid}", (HttpContext context, Guid id, CancellationToken cancellationToken) =>
            WriteAsync(context, getConnectionString, id, null, cancellationToken));
    }

    private static async Task<IResult> WriteAsync(HttpContext context, Func<string> getConnectionString, Guid? id,
        UserState? input, CancellationToken cancellationToken)
    {
        if (!AuthEndpoints.HasAllowedOrigin(context)) return Error(403, "BAD_ORIGIN", "Cross-origin request refused.");
        var token = context.Request.Cookies["mh02_session"];
        if (string.IsNullOrEmpty(token) || token.Length > 128) return Error(401, "UNAUTHENTICATED", "Authentication required.");

        try
        {
            await using var connection = new NpgsqlConnection(getConnectionString());
            await connection.OpenAsync(cancellationToken);
            var actor = await SessionStore.FindUserAsync(connection, token, cancellationToken);
            if (actor is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            if (actor.Role != "superadmin") return Error(403, "SUPERADMIN_ONLY", "Only a Super Admin can do this.");
            await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
            await using (var guard = new NpgsqlCommand("SELECT pg_advisory_xact_lock(31184051)", connection, transaction))
                await guard.ExecuteNonQueryAsync(cancellationToken);
            actor = await SessionStore.FindUserAsync(connection, token, cancellationToken);
            if (actor is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            if (actor.Role != "superadmin") return Error(403, "SUPERADMIN_ONLY", "Only a Super Admin can do this.");

            UserState? before = null;
            if (id is not null)
            {
                await using var select = new NpgsqlCommand("""
                    SELECT u.user_id, u.nrp, u.name, u.email, u.phone, r.role_code, u.site_id, u.status
                    FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = @id FOR UPDATE OF u
                    """, connection, transaction);
                select.Parameters.AddWithValue("id", id.Value);
                await using var reader = await select.ExecuteReaderAsync(cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Error(404, "NOT_FOUND", "User not found.");
                before = new UserState(reader.GetGuid(0), reader.GetString(1), reader.GetString(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3), reader.IsDBNull(4) ? null : reader.GetString(4),
                    reader.GetString(5), reader.IsDBNull(6) ? null : reader.GetInt32(6), reader.GetString(7));
            }
            var after = input is null ? before! with { Status = "inactive" } : input with { Nrp = before?.Nrp ?? input.Nrp };
            if (before == after) return Results.Ok(new { userId = after.UserId });
            if (before is not null && actor.UserId == before.UserId &&
                (after.Role != before.Role || after.SiteId != before.SiteId || after.Status != before.Status))
                return Error(403, "SELF_CHANGE_FORBIDDEN", "You cannot change your own role, Site or status.");
            if (before is not null && before.Role == "superadmin" && before.Status == "active" &&
                (after.Role != "superadmin" || after.Status != "active"))
            {
                await using var count = new NpgsqlCommand("""
                    SELECT count(*) FROM users u JOIN roles r ON r.role_id = u.role_id
                    WHERE r.role_code = 'superadmin' AND u.status = 'active'
                    """, connection, transaction);
                if ((long)(await count.ExecuteScalarAsync(cancellationToken))! <= 1)
                    return Error(409, "LAST_SUPERADMIN", "The last active Super Admin cannot be deactivated or demoted.");
            }
            if (after.SiteId is not null && (before is null || before.SiteId != after.SiteId))
            {
                await using var site = new NpgsqlCommand("SELECT is_active FROM sites WHERE site_id = @site", connection, transaction);
                site.Parameters.AddWithValue("site", after.SiteId.Value);
                if (await site.ExecuteScalarAsync(cancellationToken) is not true)
                    return Error(422, "SITE_INACTIVE", "The Site does not exist or is inactive.");
            }

            await using var save = new NpgsqlCommand(before is null ? """
                INSERT INTO users (user_id, nrp, name, email, phone, role_id, site_id, password_hash, status, failed_login_count, data_source, created_by)
                VALUES (@id, @nrp, @name, @email, @phone, (SELECT role_id FROM roles WHERE role_code = @role), @site, @hash, 'active', 0, 'app', @actor)
                """ : """
                UPDATE users SET name = @name, email = @email, phone = @phone,
                    role_id = (SELECT role_id FROM roles WHERE role_code = @role), site_id = @site,
                    status = @status, updated_at = CURRENT_TIMESTAMP, updated_by = @actor WHERE user_id = @id
                """, connection, transaction);
            save.Parameters.AddWithValue("id", after.UserId);
            save.Parameters.AddWithValue("nrp", after.Nrp);
            save.Parameters.AddWithValue("name", after.Name);
            save.Parameters.Add("email", NpgsqlDbType.Varchar).Value = (object?)after.Email ?? DBNull.Value;
            save.Parameters.Add("phone", NpgsqlDbType.Varchar).Value = (object?)after.Phone ?? DBNull.Value;
            save.Parameters.AddWithValue("role", after.Role);
            save.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)after.SiteId ?? DBNull.Value;
            save.Parameters.AddWithValue("hash", "!AUTHENTICATOR_ONLY!");
            save.Parameters.AddWithValue("status", after.Status);
            save.Parameters.AddWithValue("actor", actor.UserId);
            await save.ExecuteNonQueryAsync(cancellationToken);
            var deactivated = before is not null && before.Status != after.Status && after.Status == "inactive";
            if (deactivated)
            {
                await using var revoke = new NpgsqlCommand("""
                    UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = @id AND revoked_at IS NULL;
                    UPDATE auth_mfa_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE user_id = @id AND consumed_at IS NULL
                    """, connection, transaction);
                revoke.Parameters.AddWithValue("id", after.UserId);
                await revoke.ExecuteNonQueryAsync(cancellationToken);
            }
            await using var audit = new NpgsqlCommand("""
                INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation,
                    old_values, new_values, change_group_id, request_id, action)
                VALUES (@actor, @name, @site, 'user_management', @nrp, @id, @operation, @before, @after, @group, @request, @action)
                """, connection, transaction);
            audit.Parameters.AddWithValue("actor", actor.UserId);
            audit.Parameters.AddWithValue("name", actor.Name);
            audit.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)after.SiteId ?? DBNull.Value;
            audit.Parameters.AddWithValue("nrp", after.Nrp);
            audit.Parameters.AddWithValue("id", after.UserId);
            audit.Parameters.AddWithValue("operation", before is null ? "INSERT" : "UPDATE");
            audit.Parameters.Add("before", NpgsqlDbType.Jsonb).Value = before is null ? DBNull.Value : JsonSerializer.Serialize(before);
            audit.Parameters.AddWithValue("after", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(after));
            audit.Parameters.AddWithValue("group", Guid.NewGuid());
            audit.Parameters.AddWithValue("request", context.Response.Headers["X-Request-Id"].ToString());
            audit.Parameters.AddWithValue("action", before is null ? "user_create" : deactivated ? "user_deactivate" : "user_update");
            await audit.ExecuteNonQueryAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Json(new { userId = after.UserId }, statusCode: before is null ? 201 : 200);
        }
        catch (PostgresException error) when (error.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            return Error(409, "NRP_EXISTS", "A user with this NRP already exists.");
        }
        catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
    }

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static bool Valid(string name, string? email, string? phone, string? role, int? siteId, string? status) =>
        name.Length is > 0 and <= 120 && (email is null || (email.Length <= 150 && MailAddress.TryCreate(email, out _))) &&
        (phone is null || phone.Length <= 30) && role is "user" or "superadmin" &&
        status is "active" or "inactive" && (siteId is null || siteId > 0) && (role != "user" || siteId is not null);

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}