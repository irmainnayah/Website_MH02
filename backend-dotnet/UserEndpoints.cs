using Npgsql;
using NpgsqlTypes;

public static class UserEndpoints
{
    private const string UserSelect = """
        SELECT u.user_id, u.nrp, u.name, u.email, u.phone, r.role_code, u.site_id, s.name,
               u.status, COALESCE(u.locked_until > CURRENT_TIMESTAMP, false), u.last_login_at,
               u.data_source, u.created_at
        FROM users u JOIN roles r ON r.role_id = u.role_id
        LEFT JOIN sites s ON s.site_id = u.site_id
        """;

    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapGet("/api/users", async (HttpContext context, CancellationToken cancellationToken) =>
        {
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128)
                return Error(401, "UNAUTHENTICATED", "Authentication required.");
            var query = context.Request.Query;
            var page = 1;
            var pageSize = 25;
            var pageText = query["page"].ToString();
            var sizeText = query["pageSize"].ToString();
            var siteText = query["siteId"].ToString();
            int? site = null;
            if ((!string.IsNullOrEmpty(pageText) && (!int.TryParse(pageText, out page) || page < 1)) ||
                (!string.IsNullOrEmpty(sizeText) && (!int.TryParse(sizeText, out pageSize) || pageSize is < 1 or > 100)))
                return Error(400, "VALIDATION_FAILED", "The request is not valid.");
            if (!string.IsNullOrEmpty(siteText))
            {
                if (!int.TryParse(siteText, out var value) || value < 1)
                    return Error(400, "VALIDATION_FAILED", "The request is not valid.");
                site = value;
            }
            var search = query["q"].ToString().Trim();
            var role = query["role"].ToString();
            var status = query["status"].ToString();
            if (search.Length > 80 || role is not ("" or "user" or "superadmin") || status is not ("" or "active" or "inactive"))
                return Error(400, "VALIDATION_FAILED", "The request is not valid.");

            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                var actor = await SessionStore.FindUserAsync(connection, token, cancellationToken);
                if (actor is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (actor.Role != "superadmin") return Error(403, "SUPERADMIN_ONLY", "Only a Super Admin can do this.");
                const string where = """
                    WHERE (@search = '' OR position(lower(@search) in lower(u.nrp)) > 0
                         OR position(lower(@search) in lower(u.name)) > 0 OR position(lower(@search) in lower(u.email)) > 0)
                      AND (@role = '' OR r.role_code = @role)
                      AND (@status = '' OR u.status = @status)
                      AND (@site IS NULL OR u.site_id = @site)
                    """;
                void Bind(NpgsqlCommand command)
                {
                    command.Parameters.AddWithValue("search", search);
                    command.Parameters.AddWithValue("role", role);
                    command.Parameters.AddWithValue("status", status);
                    command.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                }
                await using var count = new NpgsqlCommand($"SELECT count(*) FROM users u JOIN roles r ON r.role_id = u.role_id {where}", connection);
                Bind(count);
                var total = (long)(await count.ExecuteScalarAsync(cancellationToken))!;
                await using var command = new NpgsqlCommand($"{UserSelect} {where} ORDER BY u.name, u.nrp LIMIT @size OFFSET @offset", connection);
                Bind(command);
                command.Parameters.AddWithValue("size", pageSize);
                command.Parameters.AddWithValue("offset", ((long)page - 1) * pageSize);
                var items = new List<object>();
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken)) items.Add(ToUser(reader));
                return Results.Ok(new { items, total, page, pageSize });
            }
            catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
        });

        app.MapGet("/api/users/{id:guid}", async (HttpContext context, Guid id, CancellationToken cancellationToken) =>
        {
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128)
                return Error(401, "UNAUTHENTICATED", "Authentication required.");
            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                var actor = await SessionStore.FindUserAsync(connection, token, cancellationToken);
                if (actor is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (actor.Role != "superadmin") return Error(403, "SUPERADMIN_ONLY", "Only a Super Admin can do this.");
                await using var command = new NpgsqlCommand($"{UserSelect} WHERE u.user_id = @id", connection);
                command.Parameters.AddWithValue("id", id);
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                return await reader.ReadAsync(cancellationToken) ? Results.Ok(ToUser(reader)) : Error(404, "NOT_FOUND", "User not found.");
            }
            catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
        });
    }

    private static object ToUser(NpgsqlDataReader reader) => new
    {
        userId = reader.GetGuid(0), nrp = reader.GetString(1), name = reader.GetString(2),
        email = reader.IsDBNull(3) ? null : reader.GetString(3), phone = reader.IsDBNull(4) ? null : reader.GetString(4),
        role = reader.GetString(5), siteId = reader.IsDBNull(6) ? (int?)null : reader.GetInt32(6),
        siteName = reader.IsDBNull(7) ? null : reader.GetString(7), status = reader.GetString(8),
        isLocked = reader.GetBoolean(9), lastLoginAt = reader.IsDBNull(10) ? (DateTime?)null : reader.GetDateTime(10),
        dataSource = reader.GetString(11), createdAt = reader.IsDBNull(12) ? (DateTime?)null : reader.GetDateTime(12)
    };

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}