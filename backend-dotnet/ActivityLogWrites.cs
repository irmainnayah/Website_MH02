using Npgsql;
using NpgsqlTypes;

public static class ActivityLogWrites
{
    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapPost("/api/activity-log", (HttpContext context, CancellationToken ct) => DispatchAsync(app, getConnectionString, context, null, false, ct));
        app.MapPatch("/api/activity-log/{id:guid}", (HttpContext context, Guid id, CancellationToken ct) => DispatchAsync(app, getConnectionString, context, id, false, ct));
        app.MapDelete("/api/activity-log/{id:guid}", (HttpContext context, Guid id, CancellationToken ct) => DispatchAsync(app, getConnectionString, context, id, true, ct));
    }

    internal static async Task<IResult> DispatchAsync(WebApplication app, Func<string> getConnectionString, HttpContext context, Guid? id, bool delete, CancellationToken ct)
    {
        var token = context.Request.Cookies["mh02_session"];
        if (string.IsNullOrEmpty(token) || token.Length > 128) return ActivityLogEndpoints.Error(401, "UNAUTHENTICATED", "Authentication required.");
        if (!AuthEndpoints.HasAllowedOrigin(context)) return ActivityLogEndpoints.Error(403, "BAD_ORIGIN", "Cross-origin request refused.");
        var type = context.Request.Query["activityType"].ToString();
        string? formNumber = null;
        if (id is null)
        {
            if (!ActivityLogEndpoints.Types.Contains(type)) return ActivityLogEndpoints.Error(400, "ACTIVITY_TYPE_REQUIRED", "Provide activityType=installation, replacement, removal or troubleshoot in the query.");
        }
        else
        {
            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(ct);
                var user = await SessionStore.FindUserAsync(connection, token, ct);
                if (user is null) return ActivityLogEndpoints.Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (user.Role != "superadmin") return ActivityLogEndpoints.Error(403, "SUPERADMIN_ONLY", "Only a Superadmin can update or delete an activity.");
                if (!SessionStore.TryScope(user, null, out var site)) return ActivityLogEndpoints.Error(403, "SITE_FORBIDDEN", "You cannot access this Site.");
                await using var command = new NpgsqlCommand("SELECT activity_type, form_number FROM activities WHERE activity_id = @id AND (@site IS NULL OR site_id = @site)", connection);
                command.Parameters.AddWithValue("id", id.Value);
                command.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                await using var reader = await command.ExecuteReaderAsync(ct);
                if (!await reader.ReadAsync(ct)) return ActivityLogEndpoints.Error(404, "NOT_FOUND", "Activity not found.");
                type = reader.GetString(0); formNumber = reader.GetString(1);
            }
            catch (NpgsqlException) { return ActivityLogEndpoints.Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
        }
        return type switch
        {
            "installation" when id is null => await InstallationWrites.HandleAsync(app, getConnectionString, context, ct),
            "installation" when delete => await InstallationDeletes.HandleAsync(app, getConnectionString, context, id!.Value, ct),
            "installation" => await InstallationUpdates.HandleAsync(app, getConnectionString, context, id!.Value, ct),
            "replacement" when id is null => await ReplacementWrites.CreateAsync(app, getConnectionString, context, ct),
            "replacement" when delete => await ReplacementWrites.DeleteAsync(app, getConnectionString, context, formNumber!, ct),
            "replacement" => await ReplacementWrites.UpdateAsync(app, getConnectionString, context, formNumber!, ct),
            "removal" => await RemovalWrites.WriteAsync(app, getConnectionString, context, formNumber, delete, ct),
            "troubleshoot" => await TroubleshootWrites.WriteAsync(app, getConnectionString, context, formNumber, delete, ct),
            _ => ActivityLogEndpoints.Error(400, "VALIDATION_FAILED", "Unsupported activity type.")
        };
    }
}