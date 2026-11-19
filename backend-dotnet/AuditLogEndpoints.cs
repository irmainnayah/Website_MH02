using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Npgsql;
using NpgsqlTypes;

public static class AuditLogEndpoints
{
    private static readonly string[] Tables = ["installation", "replacement", "removal", "troubleshoot", "device", "user_management"];
    private static readonly string[] Operations = ["INSERT", "UPDATE", "DELETE"];
    private static readonly Regex SecretKey = new("pass(word)?|hash|secret|token|credential|connectionstring|activationcode|totp|apikey", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapGet("/api/audit-logs", (HttpContext context, CancellationToken ct) => ReadAsync(context, getConnectionString, null, ct));
        app.MapGet("/api/audit-logs/{id:long}", (HttpContext context, long id, CancellationToken ct) => ReadAsync(context, getConnectionString, id, ct));
        app.MapMethods("/api/audit-logs", ["POST", "PUT", "PATCH", "DELETE"],
            (HttpContext context, CancellationToken ct) => RejectWriteAsync(context, getConnectionString, null, ct));
        app.MapMethods("/api/audit-logs/{id:long}", ["POST", "PUT", "PATCH", "DELETE"],
            (HttpContext context, long id, CancellationToken ct) => RejectWriteAsync(context, getConnectionString, id, ct));
    }

    private static async Task<IResult> ReadAsync(HttpContext context, Func<string> getConnectionString, long? id, CancellationToken ct)
    {
        var token = context.Request.Cookies["mh02_session"];
        if (string.IsNullOrEmpty(token) || token.Length > 128) return ActivityLogEndpoints.Error(401, "UNAUTHENTICATED", "Authentication required.");
        var query = context.Request.Query;
        var page = 1; var size = 100;
        int? requestedSite = null;
        DateOnly? from = null, to = null;
        var table = query["table"].ToString();
        var operation = query["operation"].ToString();
        var action = query["action"].ToString();
        var search = query["q"].ToString().Trim();
        Guid? group = null;
        if ((id is not null && id < 1) ||
            (query.ContainsKey("page") && (!int.TryParse(query["page"], out page) || page < 1)) ||
            (query.ContainsKey("pageSize") && (!int.TryParse(query["pageSize"], out size) || size is < 1 or > 1000)) ||
            (table.Length > 0 && !Tables.Contains(table)) || (operation.Length > 0 && !Operations.Contains(operation)) ||
            action.Length > 30 || search.Length > 120)
            return ActivityLogEndpoints.Error(400, "VALIDATION_FAILED", "Invalid audit filters.");
        if (query.ContainsKey("siteId"))
        {
            if (!int.TryParse(query["siteId"], out var parsed) || parsed < 1) return ActivityLogEndpoints.Error(400, "VALIDATION_FAILED", "Invalid Site.");
            requestedSite = parsed;
        }
        if (query.ContainsKey("changeGroupId"))
        {
            if (!Guid.TryParse(query["changeGroupId"], out var parsed)) return ActivityLogEndpoints.Error(400, "VALIDATION_FAILED", "Invalid changeGroupId.");
            group = parsed;
        }
        foreach (var name in new[] { "dateFrom", "dateTo" })
        {
            if (!query.ContainsKey(name)) continue;
            if (!DateOnly.TryParseExact(query[name].ToString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
                return ActivityLogEndpoints.Error(400, "VALIDATION_FAILED", "Dates must use yyyy-MM-dd in UTC.");
            if (name == "dateFrom") from = parsed; else to = parsed;
        }
        if (from > to) return ActivityLogEndpoints.Error(400, "VALIDATION_FAILED", "Invalid date range.");
        try
        {
            await using var connection = new NpgsqlConnection(getConnectionString());
            await connection.OpenAsync(ct);
            var user = await SessionStore.FindUserAsync(connection, token, ct);
            if (user is null) return ActivityLogEndpoints.Error(401, "UNAUTHENTICATED", "Authentication required.");
            if (!SessionStore.TryScope(user, requestedSite, out var site)) return ActivityLogEndpoints.Error(403, "SITE_FORBIDDEN", "You cannot access this Site.");
            const string where = """
                WHERE (@site IS NULL OR l.site_id = @site) AND (@id IS NULL OR l.audit_id = @id)
                  AND (@table = '' OR l.table_name = @table) AND (@operation = '' OR l.operation = @operation)
                  AND (@action = '' OR l.action = @action) AND (@group IS NULL OR l.change_group_id = @group)
                  AND (@from IS NULL OR l.occurred_at >= (@from::date::timestamp AT TIME ZONE 'UTC'))
                  AND (@to IS NULL OR l.occurred_at < ((@to::date + 1)::timestamp AT TIME ZONE 'UTC'))
                  AND (@search = '' OR position(lower(@search) in lower(l.record_id)) > 0
                    OR position(lower(@search) in lower(l.actor_name)) > 0 OR position(lower(@search) in lower(l.action)) > 0
                    OR position(lower(@search) in lower(l.request_id)) > 0 OR position(lower(@search) in lower(l.reason)) > 0
                    OR position(lower(@search) in lower(l.ip_address)) > 0)
                """;
            void Bind(NpgsqlCommand command)
            {
                Add(command, "site", NpgsqlDbType.Integer, site); Add(command, "id", NpgsqlDbType.Bigint, id);
                Add(command, "from", NpgsqlDbType.Date, from); Add(command, "to", NpgsqlDbType.Date, to);
                Add(command, "group", NpgsqlDbType.Uuid, group);
                command.Parameters.AddWithValue("table", table); command.Parameters.AddWithValue("operation", operation);
                command.Parameters.AddWithValue("action", action); command.Parameters.AddWithValue("search", search);
            }
            await using var count = new NpgsqlCommand($"SELECT count(*) FROM audit_log l {where}", connection);
            Bind(count); var total = (long)(await count.ExecuteScalarAsync(ct))!;
            await using var command = new NpgsqlCommand($"""
                SELECT l.audit_id, l.occurred_at, l.table_name, l.operation, l.record_id, l.entity_id,
                    l.actor_user_id, l.actor_name, l.site_id, s.name, l.ip_address, l.request_id, l.action, l.reason, l.change_group_id,
                    CASE WHEN @detail THEN l.old_values ELSE NULL END, CASE WHEN @detail THEN l.new_values ELSE NULL END,
                    CASE WHEN a.activity_id IS NOT NULL THEN '/reports/activity-log/' || a.activity_id::text
                         WHEN d.device_id IS NOT NULL THEN '/reports/timeline/' || d.device_code ELSE NULL END
                FROM audit_log l LEFT JOIN sites s ON s.site_id = l.site_id
                LEFT JOIN activities a ON a.activity_id = l.entity_id AND a.activity_type = l.table_name AND (@site IS NULL OR a.site_id = @site)
                LEFT JOIN devices d ON d.device_id = l.entity_id AND l.table_name = 'device' AND (@site IS NULL OR d.site_id = @site) AND (@admin OR NOT d.is_deleted)
                {where} ORDER BY l.occurred_at DESC, l.audit_id DESC LIMIT @size OFFSET @offset
                """, connection);
            Bind(command);
            command.Parameters.AddWithValue("admin", user.Role == "superadmin"); command.Parameters.AddWithValue("detail", id is not null);
            command.Parameters.AddWithValue("size", id is null ? size : 1); command.Parameters.AddWithValue("offset", id is null ? ((long)page - 1) * size : 0L);
            var items = new List<object>();
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var auditId = reader.GetInt64(0).ToString(CultureInfo.InvariantCulture);
                items.Add(new {
                    entryId = auditId, auditId, timestamp = reader.GetDateTime(1), table = reader.GetString(2), operation = reader.GetString(3),
                    recordId = reader.GetString(4), entityId = reader.GetGuid(5), actorUserId = reader.IsDBNull(6) ? (Guid?)null : reader.GetGuid(6),
                    changedBy = reader.IsDBNull(7) ? null : reader.GetString(7), siteId = reader.IsDBNull(8) ? (int?)null : reader.GetInt32(8),
                    siteName = reader.IsDBNull(9) ? null : reader.GetString(9), ipAddress = reader.IsDBNull(10) ? null : reader.GetString(10),
                    requestId = reader.IsDBNull(11) ? null : reader.GetString(11), action = reader.GetString(12), reason = reader.IsDBNull(13) ? null : reader.GetString(13),
                    changeGroupId = reader.GetGuid(14), oldValues = reader.IsDBNull(15) ? null : Redact(JsonNode.Parse(reader.GetString(15))),
                    newValues = reader.IsDBNull(16) ? null : Redact(JsonNode.Parse(reader.GetString(16))), recordPath = reader.IsDBNull(17) ? null : reader.GetString(17)
                });
            }
            if (id is not null) return items.Count == 0 ? ActivityLogEndpoints.Error(404, "NOT_FOUND", "Audit entry not found.") : Results.Ok(items[0]);
            return Results.Ok(new { items, total, page, pageSize = size, timeZone = "UTC" });
        }
        catch (NpgsqlException) { return ActivityLogEndpoints.Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
        catch (JsonException) { return ActivityLogEndpoints.Error(500, "AUDIT_VALUES_UNAVAILABLE", "Stored audit values could not be read safely."); }
    }

    private static async Task<IResult> RejectWriteAsync(HttpContext context, Func<string> getConnectionString, long? id, CancellationToken ct)
    {
        var token = context.Request.Cookies["mh02_session"];
        if (string.IsNullOrEmpty(token) || token.Length > 128) return ActivityLogEndpoints.Error(401, "UNAUTHENTICATED", "Authentication required.");
        if (!AuthEndpoints.HasAllowedOrigin(context)) return ActivityLogEndpoints.Error(403, "BAD_ORIGIN", "Cross-origin request refused.");
        try
        {
            await using var connection = new NpgsqlConnection(getConnectionString());
            await connection.OpenAsync(ct);
            var user = await SessionStore.FindUserAsync(connection, token, ct);
            if (user is null) return ActivityLogEndpoints.Error(401, "UNAUTHENTICATED", "Authentication required.");
            if (!SessionStore.TryScope(user, null, out var site)) return ActivityLogEndpoints.Error(403, "SITE_FORBIDDEN", "You cannot access this Site.");
            if (id is not null)
            {
                await using var exists = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM audit_log WHERE audit_id = @id AND (@site IS NULL OR site_id = @site))", connection);
                exists.Parameters.AddWithValue("id", id.Value); Add(exists, "site", NpgsqlDbType.Integer, site);
                if (!(bool)(await exists.ExecuteScalarAsync(ct))!) return ActivityLogEndpoints.Error(404, "NOT_FOUND", "Audit entry not found.");
            }
            context.Response.Headers["Allow"] = "GET";
            return ActivityLogEndpoints.Error(405, "AUDIT_APPEND_ONLY", "Audit dicatat otomatis bersama perubahan data asal. Entri audit tidak dapat ditambah manual, diubah, atau dihapus melalui halaman ini.");
        }
        catch (NpgsqlException) { return ActivityLogEndpoints.Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
    }

    internal static JsonNode? Redact(JsonNode? node)
    {
        if (node is JsonObject obj)
        {
            foreach (var key in obj.Select(property => property.Key).ToArray())
            {
                if (SecretKey.IsMatch(key)) obj.Remove(key); else Redact(obj[key]);
            }
        }
        else if (node is JsonArray array) foreach (var child in array) Redact(child);
        return node;
    }

    private static void Add(NpgsqlCommand command, string name, NpgsqlDbType type, object? value) => command.Parameters.Add(name, type).Value = value ?? DBNull.Value;
}