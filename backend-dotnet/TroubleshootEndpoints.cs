using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

public static class TroubleshootEndpoints
{
    public static readonly string[] Components = ["MH02 Device", "GPS/Antenna", "Camera", "Wiring", "Speaker", "SPM", "CPE", "Firmware"];
    private const string Joins = """
        FROM activities a JOIN troubleshoot_details t ON t.activity_id = a.activity_id
        JOIN sites s ON s.site_id = a.site_id
        JOIN activity_devices ad ON ad.activity_id = a.activity_id AND ad.role = 'subject'
        JOIN devices d ON d.device_id = ad.device_id
        LEFT JOIN fleet_units fu ON fu.unit_id = ad.before_unit_id
        LEFT JOIN equipment_types et ON et.equipment_type_id = fu.equipment_type_id
        """;
    private const string Projection = """
        SELECT jsonb_build_object(
            'activityId', a.activity_id, 'id', a.form_number, 'siteId', a.site_id, 'timeZone', a.time_zone_id,
            'deviceId', d.device_code, 'serialNumber', d.serial_number, 'unitNo', COALESCE(fu.unit_no, ''),
            'fleetEquipmentType', et.name, 'egi', COALESCE(fu.egi, ''), 'district', s.name,
            'activityDate', to_char((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes), 'YYYY-MM-DD'),
            'startTime', to_char((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes), 'YYYY-MM-DD"T"HH24:MI'),
            'endTime', to_char((a.finished_at AT TIME ZONE 'UTC') + make_interval(mins => a.finish_utc_offset_minutes), 'YYYY-MM-DD"T"HH24:MI'),
            'durationMinutes', a.duration_minutes, 'equipmentType', t.component_type, 'issue', t.issue,
            'actionTaken', t.action_taken, 'healthCheckStatus', t.health_check_result,
            'technicianName', COALESCE(a.technician_name, ''), 'technicianNrp', COALESCE(a.technician_nrp, ''),
            'remarks', COALESCE(a.remarks, ''), 'createdAt', a.created_at,
            'rowVersion', '0x' || lpad(to_hex(a.row_version), 16, '0'),
            'photos', jsonb_build_object(
                'beforeRepair', COALESCE((SELECT '/api/dotnet/photos/' || p.photo_id::text FROM transaction_photos p WHERE p.activity_id = a.activity_id AND p.slot_key = 'before_repair'), ''),
                'afterRepair', COALESCE((SELECT '/api/dotnet/photos/' || p.photo_id::text FROM transaction_photos p WHERE p.activity_id = a.activity_id AND p.slot_key = 'after_repair'), '')
            ),
            'photoCaptions', jsonb_build_object(
                'beforeRepair', COALESCE((SELECT p.caption FROM transaction_photos p WHERE p.activity_id = a.activity_id AND p.slot_key = 'before_repair'), ''),
                'afterRepair', COALESCE((SELECT p.caption FROM transaction_photos p WHERE p.activity_id = a.activity_id AND p.slot_key = 'after_repair'), '')
            )
        )
        """;

    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapGet("/api/troubleshoots", (HttpContext context, CancellationToken ct) => ReadAsync(context, getConnectionString, null, ct));
        app.MapGet("/api/troubleshoots/{formNumber}", (HttpContext context, string formNumber, CancellationToken ct) => ReadAsync(context, getConnectionString, formNumber, ct));
    }

    private static async Task<IResult> ReadAsync(HttpContext context, Func<string> getConnectionString, string? formNumber, CancellationToken ct)
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
        if (formNumber?.Length > 30) return Error(404, "NOT_FOUND", "Troubleshoot not found.");
        try
        {
            await using var connection = new NpgsqlConnection(getConnectionString());
            await connection.OpenAsync(ct);
            var user = await SessionStore.FindUserAsync(connection, token, ct);
            if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            if (!SessionStore.TryScope(user, requestedSite, out var site)) return Error(403, "SITE_FORBIDDEN", "You cannot access this Site.");
            const string where = "WHERE a.activity_type = 'troubleshoot' AND (@site IS NULL OR a.site_id = @site) AND (@form IS NULL OR a.form_number = @form)";
            void Bind(NpgsqlCommand command)
            {
                command.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                command.Parameters.Add("form", NpgsqlDbType.Varchar).Value = (object?)formNumber ?? DBNull.Value;
            }
            await using var count = new NpgsqlCommand($"SELECT count(*) {Joins} {where}", connection);
            Bind(count);
            var total = (long)(await count.ExecuteScalarAsync(ct))!;
            await using var command = new NpgsqlCommand($"{Projection} {Joins} {where} ORDER BY a.started_at DESC, a.created_at DESC, a.activity_id LIMIT @size OFFSET @offset", connection);
            Bind(command);
            command.Parameters.AddWithValue("size", formNumber is null ? size : 1);
            command.Parameters.AddWithValue("offset", formNumber is null ? ((long)page - 1) * size : 0L);
            var items = new List<JsonElement>();
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                using var document = JsonDocument.Parse(reader.GetString(0));
                items.Add(document.RootElement.Clone());
            }
            if (formNumber is not null) return items.Count == 0 ? Error(404, "NOT_FOUND", "Troubleshoot not found.") : Results.Ok(items[0]);
            return Results.Ok(new { items, total, page, pageSize = size });
        }
        catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
    }

    public static IResult Error(int status, string code, string message) => Results.Json(new { error = new { code, message } }, statusCode: status);
}