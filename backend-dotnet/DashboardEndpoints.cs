using Npgsql;
using NpgsqlTypes;

public static class DashboardEndpoints
{
    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        DashboardData.Map(app, getConnectionString);
        app.MapGet("/api/dashboard/status-distribution", async (HttpContext context, CancellationToken cancellationToken) =>
        {
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128)
                return Error(401, "UNAUTHENTICATED", "Authentication required.");

            int? requestedSite = null;
            var siteText = context.Request.Query["siteId"].ToString();
            if (!string.IsNullOrEmpty(siteText))
            {
                if (!int.TryParse(siteText, out var parsed) || parsed < 1)
                    return Error(400, "VALIDATION_FAILED", "The request is not valid.");
                requestedSite = parsed;
            }

            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                var user = await SessionStore.FindUserAsync(connection, token, cancellationToken);
                if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (!SessionStore.TryScope(user, requestedSite, out var site))
                    return Error(403, "SITE_FORBIDDEN", "You cannot access this Site.");

                await using var command = new NpgsqlCommand("""
                    SELECT st.code, COALESCE(st.label, st.code), COUNT(d.device_id)
                    FROM device_statuses st
                    LEFT JOIN devices d ON d.status_id = st.status_id AND NOT d.is_deleted
                        AND (@site IS NULL OR d.site_id = @site)
                    GROUP BY st.status_id, st.code, st.label
                    ORDER BY st.status_id
                    """, connection);
                command.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                var statuses = new List<object>();
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken))
                    statuses.Add(new { key = reader.GetString(0), label = reader.GetString(1), count = reader.GetInt64(2) });
                return Results.Ok(statuses);
            }
            catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
        });
    }

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}