using System.Globalization;
using System.Net;
using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

public static class InstallationUpdates
{
    private sealed record Field(string Column, bool IsDetail, int MaxLength);

    private static readonly Dictionary<string, Field> Fields = new(StringComparer.Ordinal)
    {
        ["shift"] = new("shift", false, 10), ["groupLeader"] = new("group_leader", false, 120),
        ["remarks"] = new("remarks", false, 1000), ["sourcePower"] = new("source_power", true, 60),
        ["spmVersion"] = new("spm_version", true, 60), ["area"] = new("area", true, 60),
        ["locationDetail"] = new("location_detail", true, 200), ["ipAddress"] = new("ip_address", true, 45),
        ["ipCpe"] = new("ip_cpe", true, 45), ["ipVhms"] = new("ip_vhms", true, 45), ["notes"] = new("notes", true, 1000)
    };

    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapPatch("/api/installations/{id:guid}", async (HttpContext context, Guid id, CancellationToken cancellationToken) =>
        {
            if (!AuthEndpoints.HasAllowedOrigin(context)) return Error(403, "BAD_ORIGIN", "Cross-origin request refused.");
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            var updates = new Dictionary<string, string>(StringComparer.Ordinal);
            long expectedVersion;
            try
            {
                using var document = await JsonDocument.ParseAsync(context.Request.Body, cancellationToken: cancellationToken);
                var root = document.RootElement;
                if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("rowVersion", out var versionElement) ||
                    versionElement.ValueKind != JsonValueKind.String)
                    return Error(400, "VALIDATION_FAILED", "rowVersion is required.");
                var version = versionElement.GetString();
                if (version is null || version.Length != 18 || !version.StartsWith("0x", StringComparison.OrdinalIgnoreCase) ||
                    !long.TryParse(version.AsSpan(2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out expectedVersion) || expectedVersion < 1)
                    return Error(400, "VALIDATION_FAILED", "rowVersion is invalid.");
                foreach (var property in root.EnumerateObject())
                {
                    if (property.Name == "rowVersion") continue;
                    if (!Fields.TryGetValue(property.Name, out var field) || property.Value.ValueKind != JsonValueKind.String)
                        return Error(400, "VALIDATION_FAILED", "Only installation metadata can be updated by this endpoint.");
                    var value = property.Value.GetString()!.Trim();
                    if (value.Length > field.MaxLength || (property.Name == "shift" && value is not ("Shift 1" or "Shift 2")) ||
                        ((property.Name is "ipAddress" or "ipCpe" or "ipVhms") && value.Length > 0 && !IPAddress.TryParse(value, out _)))
                        return Error(400, "VALIDATION_FAILED", "The request is not valid.");
                    if (!updates.TryAdd(property.Name, value)) return Error(400, "VALIDATION_FAILED", "The request is not valid.");
                }
            }
            catch (JsonException) { return Error(400, "INVALID_JSON", "The request body must be valid JSON."); }

            var commitStarted = false;
            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
                var user = await SessionStore.FindUserAsync(connection, token, cancellationToken);
                if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (user.Role != "superadmin") return Error(403, "SUPERADMIN_ONLY", "Only a Super Admin can do this.");

                string formNumber;
                int siteId;
                long currentVersion;
                var current = new Dictionary<string, string?>(StringComparer.Ordinal);
                await using (var select = new NpgsqlCommand("""
                    SELECT a.form_number, a.site_id, a.row_version, a.shift, a.group_leader, a.remarks,
                           i.source_power, i.spm_version, i.area, i.location_detail, i.ip_address, i.ip_cpe, i.ip_vhms, i.notes
                    FROM activities a JOIN installation_details i ON i.activity_id = a.activity_id
                    WHERE a.activity_id = @id AND a.activity_type = 'installation' FOR UPDATE OF a, i
                    """, connection, transaction))
                {
                    select.Parameters.AddWithValue("id", id);
                    await using var reader = await select.ExecuteReaderAsync(cancellationToken);
                    if (!await reader.ReadAsync(cancellationToken)) return Error(404, "NOT_FOUND", "Installation not found.");
                    formNumber = reader.GetString(0); siteId = reader.GetInt32(1); currentVersion = reader.GetInt64(2);
                    var names = new[] { "shift", "groupLeader", "remarks", "sourcePower", "spmVersion", "area", "locationDetail", "ipAddress", "ipCpe", "ipVhms", "notes" };
                    for (var index = 0; index < names.Length; index++) current[names[index]] = reader.IsDBNull(index + 3) ? null : reader.GetString(index + 3);
                }
                if (currentVersion != expectedVersion) return Error(409, "STALE_VERSION", "The transaction was changed. Reload and try again.");
                var changed = updates.Where(entry => current[entry.Key] != entry.Value).ToArray();
                if (changed.Length == 0) return Results.Ok(new { activityId = id, rowVersion = $"0x{currentVersion:x16}" });

                var headerChanges = changed.Where(entry => !Fields[entry.Key].IsDetail).ToArray();
                var detailChanges = changed.Where(entry => Fields[entry.Key].IsDetail).ToArray();
                var headerSet = string.Join(", ", headerChanges.Select(entry => $"{Fields[entry.Key].Column} = @{entry.Key}"));
                if (headerSet.Length > 0) headerSet += ", ";
                await using var header = new NpgsqlCommand($"UPDATE activities SET {headerSet}updated_at = CURRENT_TIMESTAMP, updated_by = @actor WHERE activity_id = @id RETURNING row_version", connection, transaction);
                header.Parameters.AddWithValue("id", id); header.Parameters.AddWithValue("actor", user.UserId);
                foreach (var entry in headerChanges) header.Parameters.AddWithValue(entry.Key, entry.Value);
                var newVersion = (long)(await header.ExecuteScalarAsync(cancellationToken))!;
                if (detailChanges.Length > 0)
                {
                    var detailSet = string.Join(", ", detailChanges.Select(entry => $"{Fields[entry.Key].Column} = @{entry.Key}"));
                    await using var detail = new NpgsqlCommand($"UPDATE installation_details SET {detailSet} WHERE activity_id = @id", connection, transaction);
                    detail.Parameters.AddWithValue("id", id);
                    foreach (var entry in detailChanges) detail.Parameters.AddWithValue(entry.Key, entry.Value);
                    await detail.ExecuteNonQueryAsync(cancellationToken);
                }
                var before = changed.ToDictionary(entry => entry.Key, entry => current[entry.Key]);
                var after = changed.ToDictionary(entry => entry.Key, entry => entry.Value);
                await using var audit = new NpgsqlCommand("""
                    INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation,
                        old_values, new_values, change_group_id, request_id, action)
                    VALUES (@actor, @name, @site, 'installation', @form, @id, 'UPDATE', @before, @after, @group, @request_id, 'transaction_update')
                    """, connection, transaction);
                audit.Parameters.AddWithValue("actor", user.UserId); audit.Parameters.AddWithValue("name", user.Name);
                audit.Parameters.AddWithValue("site", siteId); audit.Parameters.AddWithValue("form", formNumber); audit.Parameters.AddWithValue("id", id);
                audit.Parameters.AddWithValue("before", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(before));
                audit.Parameters.AddWithValue("after", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(after));
                audit.Parameters.AddWithValue("group", Guid.NewGuid()); audit.Parameters.AddWithValue("request_id", context.Response.Headers["X-Request-Id"].ToString());
                await audit.ExecuteNonQueryAsync(cancellationToken);
                commitStarted = true;
                await transaction.CommitAsync(cancellationToken);
                return Results.Ok(new { activityId = id, rowVersion = $"0x{newVersion:x16}" });
            }
            catch (NpgsqlException)
            {
                return commitStarted
                    ? Error(503, "COMMIT_OUTCOME_UNKNOWN", "The outcome could not be confirmed. Reload before retrying.")
                    : Error(503, "DATABASE_UNAVAILABLE", "Database unavailable.");
            }
        });
    }

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}