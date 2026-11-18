using Npgsql;
using NpgsqlTypes;

public static class DeviceEndpoints
{
    private const string DeviceColumns = """
        SELECT d.device_id, d.device_code, d.serial_number, st.status_id, st.code, st.label,
               d.site_id, s.name, d.current_location_site_id, d.current_unit_id, fu.unit_no,
               et.name, fu.egi, d.health_check_status, d.last_maintenance_date, d.notes,
               d.is_deleted, d.row_version, d.created_at
        """;
    private const string DeviceJoins = """
        FROM devices d
        JOIN device_statuses st ON st.status_id = d.status_id
        JOIN sites s ON s.site_id = d.site_id
        LEFT JOIN fleet_units fu ON fu.unit_id = d.current_unit_id
        LEFT JOIN equipment_types et ON et.equipment_type_id = fu.equipment_type_id
        """;

    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapGet("/api/devices", async (HttpContext context, CancellationToken cancellationToken) =>
        {
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128)
                return Error(401, "UNAUTHENTICATED", "Authentication required.");

            var query = context.Request.Query;
            var pageText = query["page"].ToString();
            var sizeText = query["pageSize"].ToString();
            var siteText = query["siteId"].ToString();
            var page = 1;
            var pageSize = 25;
            int? requestedSite = null;
            if ((!string.IsNullOrEmpty(pageText) && (!int.TryParse(pageText, out page) || page < 1)) ||
                (!string.IsNullOrEmpty(sizeText) && (!int.TryParse(sizeText, out pageSize) || pageSize is < 1 or > 100)))
                return Error(400, "VALIDATION_FAILED", "The request is not valid.");
            if (!string.IsNullOrEmpty(siteText))
            {
                if (!int.TryParse(siteText, out var parsed) || parsed < 1)
                    return Error(400, "VALIDATION_FAILED", "The request is not valid.");
                requestedSite = parsed;
            }
            var archived = query["archived"].ToString();
            var purpose = query["purpose"].ToString();
            var status = query["status"].ToString();
            var search = query["q"].ToString().Trim();
            var equipment = query["equipmentType"].ToString().Trim();
            if (archived is not ("" or "true" or "false") || purpose is not ("" or "installable" or "removable") ||
                status is not ("" or "in_use" or "in_stock_rfu" or "in_stock_damaged" or "in_stock_ho") ||
                search.Length > 80 || equipment.Length > 40)
                return Error(400, "VALIDATION_FAILED", "The request is not valid.");

            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                var user = await SessionStore.FindUserAsync(connection, token, cancellationToken);
                if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (!SessionStore.TryScope(user, requestedSite, out var site)) return Error(403, "SITE_FORBIDDEN", "You cannot access this Site.");
                if (archived == "true" && user.Role != "superadmin") return Error(403, "SUPERADMIN_ONLY", "Only a Super Admin can view the Device Archive.");
                var effectiveStatus = purpose switch { "installable" => "in_stock_rfu", "removable" => "in_use", _ => status };
                const string where = """
                    WHERE d.is_deleted = @archived AND (@site IS NULL OR d.site_id = @site)
                      AND (@status = '' OR st.code = @status)
                      AND (@search = '' OR position(lower(@search) in lower(d.device_code)) > 0
                           OR position(lower(@search) in lower(d.serial_number)) > 0
                           OR position(lower(@search) in lower(fu.unit_no)) > 0)
                      AND (@equipment = '' OR et.name = @equipment)
                    """;
                void Bind(NpgsqlCommand command)
                {
                    command.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                    command.Parameters.AddWithValue("archived", archived == "true");
                    command.Parameters.AddWithValue("status", effectiveStatus);
                    command.Parameters.AddWithValue("search", search);
                    command.Parameters.AddWithValue("equipment", equipment);
                }

                await using var count = new NpgsqlCommand($"SELECT count(*) {DeviceJoins} {where}", connection);
                Bind(count);
                var total = (long)(await count.ExecuteScalarAsync(cancellationToken))!;
                await using var command = new NpgsqlCommand($"{DeviceColumns} {DeviceJoins} {where} ORDER BY d.device_code LIMIT @size OFFSET @offset", connection);
                Bind(command);
                command.Parameters.AddWithValue("size", pageSize);
                command.Parameters.AddWithValue("offset", ((long)page - 1) * pageSize);
                var items = new List<object>();
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken)) items.Add(ToDevice(reader));
                return Results.Ok(new { items, total, page, pageSize });
            }
            catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
        });

        app.MapGet("/api/devices/{id}", async (HttpContext context, string id, CancellationToken cancellationToken) =>
        {
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128)
                return Error(401, "UNAUTHENTICATED", "Authentication required.");
            if (!Guid.TryParse(id, out var deviceId)) return Error(404, "NOT_FOUND", "Device not found.");
            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                var user = await SessionStore.FindUserAsync(connection, token, cancellationToken);
                if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (!SessionStore.TryScope(user, null, out var site)) return Error(403, "NO_SITE_ASSIGNED", "Your account has no valid role or Site assigned.");
                await using var command = new NpgsqlCommand($"{DeviceColumns} {DeviceJoins} WHERE d.device_id = @id AND (@site IS NULL OR d.site_id = @site) AND (@admin OR NOT d.is_deleted)", connection);
                command.Parameters.AddWithValue("id", deviceId);
                command.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                command.Parameters.AddWithValue("admin", user.Role == "superadmin");
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                return await reader.ReadAsync(cancellationToken) ? Results.Ok(ToDevice(reader)) : Error(404, "NOT_FOUND", "Device not found.");
            }
            catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
        });
    }

    private static object ToDevice(NpgsqlDataReader reader)
    {
        var unit = reader.IsDBNull(9) ? null : new
        {
            unitId = reader.GetGuid(9), unitNo = reader.GetString(10), equipmentType = reader.GetString(11),
            egi = reader.IsDBNull(12) ? null : reader.GetString(12)
        };
        return new
        {
            deviceId = reader.GetGuid(0), deviceCode = reader.GetString(1), serialNumber = reader.GetString(2),
            status = new { id = reader.GetInt32(3), code = reader.GetString(4), label = reader.IsDBNull(5) ? null : reader.GetString(5) },
            siteId = reader.GetInt32(6), siteName = reader.GetString(7),
            locationSiteId = reader.IsDBNull(8) ? (int?)null : reader.GetInt32(8), unit,
            healthCheckStatus = reader.GetString(13),
            lastMaintenanceDate = reader.IsDBNull(14) ? null : reader.GetFieldValue<DateOnly>(14).ToString("yyyy-MM-dd"),
            notes = reader.IsDBNull(15) ? null : reader.GetString(15), isArchived = reader.GetBoolean(16),
            rowVersion = $"0x{reader.GetInt64(17):x16}",
            createdAt = reader.IsDBNull(18) ? (DateTime?)null : reader.GetDateTime(18)
        };
    }

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}