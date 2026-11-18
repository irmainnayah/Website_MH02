using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

public static class RemovalEndpoints
{
    private const string Joins = """
        FROM activities a JOIN removal_details r ON r.activity_id = a.activity_id
        JOIN sites s ON s.site_id = a.site_id
        JOIN activity_devices ad ON ad.activity_id = a.activity_id AND ad.role = 'subject'
        JOIN devices d ON d.device_id = ad.device_id
        JOIN device_statuses ds ON ds.status_id = r.final_status_id
        LEFT JOIN fleet_units fu ON fu.unit_id = ad.before_unit_id
        LEFT JOIN equipment_types et ON et.equipment_type_id = fu.equipment_type_id
        """;
    private const string Projection = """
        SELECT jsonb_build_object(
            'activityId', a.activity_id, 'id', a.form_number, 'siteId', a.site_id, 'timeZone', a.time_zone_id,
            'deviceId', d.device_code, 'serialNumber', d.serial_number, 'unitNo', COALESCE(fu.unit_no, ''),
            'equipmentType', et.name, 'egi', fu.egi, 'district', s.name,
            'removalDate', to_char((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes), 'YYYY-MM-DD'),
            'startTime', to_char((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes), 'YYYY-MM-DD"T"HH24:MI'),
            'endTime', to_char((a.finished_at AT TIME ZONE 'UTC') + make_interval(mins => a.finish_utc_offset_minutes), 'YYYY-MM-DD"T"HH24:MI'),
            'durationMinutes', a.duration_minutes, 'shift', COALESCE(a.shift, ''),
            'reason', r.reason, 'reasonDetail', COALESCE(r.reason_detail, ''),
            'deviceFinalCondition', ds.code, 'deviceFinalConditionLabel', COALESCE(ds.label, ds.code),
            'technicianName', COALESCE(a.technician_name, ''), 'technicianNrp', COALESCE(a.technician_nrp, ''),
            'groupLeaderName', COALESCE(a.group_leader, ''), 'remarks', COALESCE(a.remarks, ''),
            'rowVersion', '0x' || lpad(to_hex(a.row_version), 16, '0'),
            'photos', CASE WHEN @detail THEN jsonb_build_object(
                'beforeDevice', COALESCE((SELECT '/api/dotnet/photos/' || p.photo_id::text FROM transaction_photos p WHERE p.activity_id = a.activity_id AND p.slot_key = 'before_device'), ''),
                'beforeDeviceCaption', COALESCE((SELECT p.caption FROM transaction_photos p WHERE p.activity_id = a.activity_id AND p.slot_key = 'before_device'), ''),
                'componentSet', COALESCE((SELECT '/api/dotnet/photos/' || p.photo_id::text FROM transaction_photos p WHERE p.activity_id = a.activity_id AND p.slot_key = 'component_set'), ''),
                'componentSetCaption', COALESCE((SELECT p.caption FROM transaction_photos p WHERE p.activity_id = a.activity_id AND p.slot_key = 'component_set'), '')
            ) ELSE NULL END
        )
        """;

    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapGet("/api/removals", async (HttpContext context, CancellationToken ct) =>
        {
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            var page = 1;
            var size = 100;
            int? requestedSite = null;
            var query = context.Request.Query;
            if ((query.ContainsKey("page") && (!int.TryParse(query["page"], out page) || page < 1)) ||
                (query.ContainsKey("pageSize") && (!int.TryParse(query["pageSize"], out size) || size is < 1 or > 1000)))
                return Error(400, "VALIDATION_FAILED", "Invalid pagination.");
            if (query.ContainsKey("siteId"))
            {
                if (!int.TryParse(query["siteId"], out var parsed) || parsed < 1) return Error(400, "VALIDATION_FAILED", "Invalid Site.");
                requestedSite = parsed;
            }
            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(ct);
                var user = await SessionStore.FindUserAsync(connection, token, ct);
                if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (!SessionStore.TryScope(user, requestedSite, out var site)) return Error(403, "SITE_FORBIDDEN", "You cannot access this Site.");
                const string where = "WHERE a.activity_type = 'removal' AND (@site IS NULL OR a.site_id = @site)";
                await using var count = new NpgsqlCommand($"SELECT count(*) {Joins} {where}", connection);
                count.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                var total = (long)(await count.ExecuteScalarAsync(ct))!;
                await using var command = new NpgsqlCommand($"{Projection} {Joins} {where} ORDER BY a.started_at DESC, a.created_at DESC, a.activity_id LIMIT @size OFFSET @offset", connection);
                command.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                command.Parameters.AddWithValue("detail", false); command.Parameters.AddWithValue("size", size);
                command.Parameters.AddWithValue("offset", ((long)page - 1) * size);
                var items = new List<JsonElement>();
                await using var reader = await command.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct))
                {
                    using var document = JsonDocument.Parse(reader.GetString(0));
                    items.Add(document.RootElement.Clone());
                }
                return Results.Ok(new { items, total, page, pageSize = size });
            }
            catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
        });

        app.MapGet("/api/removals/{formNumber}", async (HttpContext context, string formNumber, CancellationToken ct) =>
        {
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            if (formNumber.Length > 30) return Error(404, "NOT_FOUND", "Removal not found.");
            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(ct);
                var user = await SessionStore.FindUserAsync(connection, token, ct);
                if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (!SessionStore.TryScope(user, null, out var site)) return Error(403, "SITE_FORBIDDEN", "You cannot access this Site.");
                await using var command = new NpgsqlCommand($"{Projection} {Joins} WHERE a.activity_type = 'removal' AND a.form_number = @form AND (@site IS NULL OR a.site_id = @site)", connection);
                command.Parameters.AddWithValue("form", formNumber); command.Parameters.AddWithValue("detail", true);
                command.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                var result = await command.ExecuteScalarAsync(ct);
                if (result is not string json) return Error(404, "NOT_FOUND", "Removal not found.");
                using var document = JsonDocument.Parse(json);
                return Results.Ok(document.RootElement.Clone());
            }
            catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
        });
    }

    public static IResult Error(int status, string code, string message) => Results.Json(new { error = new { code, message } }, statusCode: status);
}