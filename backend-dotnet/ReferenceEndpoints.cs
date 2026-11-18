using Npgsql;
using NpgsqlTypes;

public static class ReferenceEndpoints
{
    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapGet("/api/reference", async (HttpContext context, CancellationToken cancellationToken) =>
        {
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128)
                return Error(401, "UNAUTHENTICATED", "Authentication required.");
            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                var user = await SessionStore.FindUserAsync(connection, token, cancellationToken);
                if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (!SessionStore.TryScope(user, null, out var site)) return Error(403, "NO_SITE_ASSIGNED", "Your account has no valid role or Site assigned.");

                var sites = new List<object>();
                await using (var command = ScopedCommand(connection, """
                    SELECT site_id, site_code, name, time_zone_id, is_operating_district FROM sites
                    WHERE is_active AND (@site IS NULL OR site_id = @site) ORDER BY name
                    """, site))
                await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
                {
                    while (await reader.ReadAsync(cancellationToken))
                    {
                        var zone = reader.GetString(3);
                        var label = zone switch { "Asia/Jakarta" or "Asia/Pontianak" => "WIB", "Asia/Makassar" => "WITA", "Asia/Jayapura" => "WIT", _ => zone };
                        sites.Add(new { siteId = reader.GetInt32(0), siteCode = reader.GetString(1), name = reader.GetString(2), timeZone = zone, timeZoneLabel = label, isOperatingDistrict = reader.GetBoolean(4) });
                    }
                }

                var equipmentTypes = new List<object>();
                await using (var command = new NpgsqlCommand("SELECT equipment_type_id, name FROM equipment_types ORDER BY equipment_type_id", connection))
                await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
                    while (await reader.ReadAsync(cancellationToken))
                        equipmentTypes.Add(new { id = reader.GetInt32(0), name = reader.GetString(1) });

                var deviceStatuses = new List<object>();
                await using (var command = new NpgsqlCommand("SELECT status_id, code, label, is_in_stock FROM device_statuses ORDER BY status_id", connection))
                await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
                    while (await reader.ReadAsync(cancellationToken))
                        deviceStatuses.Add(new { id = reader.GetInt32(0), code = reader.GetString(1), label = reader.IsDBNull(2) ? null : reader.GetString(2), isInStock = !reader.IsDBNull(3) && reader.GetBoolean(3) });

                var lookups = new List<object>();
                await using (var command = ScopedCommand(connection, """
                    SELECT category, code, label, site_id FROM lookup_values
                    WHERE is_active AND (site_id IS NULL OR @site IS NULL OR site_id = @site)
                    ORDER BY category, sort_order, label
                    """, site))
                await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
                    while (await reader.ReadAsync(cancellationToken))
                        lookups.Add(new { category = reader.GetString(0), code = reader.GetString(1), label = reader.GetString(2), siteId = reader.IsDBNull(3) ? (int?)null : reader.GetInt32(3) });

                return Results.Ok(new { sites, equipmentTypes, deviceStatuses, lookups });
            }
            catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
        });

        app.MapGet("/api/fleet-units", async (HttpContext context, CancellationToken cancellationToken) =>
        {
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128)
                return Error(401, "UNAUTHENTICATED", "Authentication required.");
            int? requestedSite = null;
            var siteText = context.Request.Query["siteId"].ToString();
            if (!string.IsNullOrEmpty(siteText))
            {
                if (!int.TryParse(siteText, out var parsed) || parsed <= 0)
                    return Error(400, "VALIDATION_FAILED", "The request is not valid.");
                requestedSite = parsed;
            }
            var availableText = context.Request.Query["available"].ToString();
            if (availableText is not ("" or "true" or "false"))
                return Error(400, "VALIDATION_FAILED", "The request is not valid.");

            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                var user = await SessionStore.FindUserAsync(connection, token, cancellationToken);
                if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (!SessionStore.TryScope(user, requestedSite, out var site)) return Error(403, "SITE_FORBIDDEN", "You cannot access this Site.");
                await using var command = ScopedCommand(connection, """
                    SELECT u.unit_id, u.unit_no, u.site_id, u.egi, u.is_egi_confirmed, et.name,
                           EXISTS (SELECT 1 FROM devices d WHERE d.current_unit_id = u.unit_id) AS occupied
                    FROM fleet_units u JOIN equipment_types et ON et.equipment_type_id = u.equipment_type_id
                    WHERE u.is_active AND (@site IS NULL OR u.site_id = @site)
                      AND (NOT @available OR NOT EXISTS (SELECT 1 FROM devices d WHERE d.current_unit_id = u.unit_id))
                    ORDER BY u.unit_no
                    """, site);
                command.Parameters.AddWithValue("available", availableText == "true");
                var units = new List<object>();
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken))
                    units.Add(new { unitId = reader.GetGuid(0), unitNo = reader.GetString(1), siteId = reader.GetInt32(2), egi = reader.IsDBNull(3) ? null : reader.GetString(3), isEgiConfirmed = reader.GetBoolean(4), equipmentType = reader.GetString(5), occupied = reader.GetBoolean(6) });
                return Results.Ok(units);
            }
            catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
        });
    }

    private static NpgsqlCommand ScopedCommand(NpgsqlConnection connection, string sql, int? site)
    {
        var command = new NpgsqlCommand(sql, connection);
        command.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
        return command;
    }

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}