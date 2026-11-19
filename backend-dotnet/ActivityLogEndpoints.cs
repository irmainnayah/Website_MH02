using System.Globalization;
using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

public static class ActivityLogEndpoints
{
    public static readonly string[] Types = ["installation", "replacement", "removal", "troubleshoot"];
    private const string Joins = """
        FROM activities a JOIN sites s ON s.site_id = a.site_id
        LEFT JOIN fleet_units fu ON fu.unit_id = a.unit_id
        LEFT JOIN equipment_types et ON et.equipment_type_id = fu.equipment_type_id
        LEFT JOIN installation_details i ON i.activity_id = a.activity_id
        LEFT JOIN replacement_details rp ON rp.activity_id = a.activity_id
        LEFT JOIN removal_details rm ON rm.activity_id = a.activity_id
        LEFT JOIN troubleshoot_details t ON t.activity_id = a.activity_id
        """;
    private const string Projection = """
        SELECT jsonb_build_object(
            'activityId', a.activity_id, 'formNumber', a.form_number, 'type', a.activity_type,
            'siteId', a.site_id, 'district', s.name, 'unitNo', COALESCE(fu.unit_no, ''),
            'equipmentType', et.name, 'egi', COALESCE(i.egi, fu.egi),
            'date', to_char((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes), 'YYYY-MM-DD'),
            'time', to_char((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes), 'HH24:MI'),
            'startTime', to_char((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes), 'YYYY-MM-DD"T"HH24:MI'),
            'endTime', to_char((a.finished_at AT TIME ZONE 'UTC') + make_interval(mins => a.finish_utc_offset_minutes), 'YYYY-MM-DD"T"HH24:MI'),
            'timeZone', a.time_zone_id,
            'timeZoneLabel', CASE a.time_zone_id WHEN 'Asia/Jakarta' THEN 'WIB' WHEN 'Asia/Pontianak' THEN 'WIB' WHEN 'Asia/Makassar' THEN 'WITA' WHEN 'Asia/Jayapura' THEN 'WIT' ELSE a.time_zone_id END,
            'durationMinutes', a.duration_minutes, 'technicianName', COALESCE(a.technician_name, ''),
            'technicianNrp', COALESCE(a.technician_nrp, ''), 'groupLeader', COALESCE(a.group_leader, ''),
            'shift', COALESCE(a.shift, ''), 'remarks', COALESCE(a.remarks, ''), 'createdAt', a.created_at,
            'rowVersion', '0x' || lpad(to_hex(a.row_version), 16, '0'),
            'summary', CASE a.activity_type WHEN 'installation' THEN 'Pemasangan perangkat' WHEN 'replacement' THEN 'Penggantian perangkat'
                WHEN 'removal' THEN COALESCE(rm.reason, 'Pelepasan perangkat') WHEN 'troubleshoot' THEN COALESCE(t.issue, 'Troubleshoot') END,
            'details', CASE a.activity_type WHEN 'installation' THEN to_jsonb(i) - 'activity_id' WHEN 'replacement' THEN to_jsonb(rp) - 'activity_id'
                WHEN 'removal' THEN to_jsonb(rm) - 'activity_id' WHEN 'troubleshoot' THEN to_jsonb(t) - 'activity_id' END,
            'deviceCodes', ARRAY(SELECT d.device_code FROM activity_devices ad JOIN devices d ON d.device_id = ad.device_id
                WHERE ad.activity_id = a.activity_id ORDER BY ad.role, d.device_code),
            'transactionPath', CASE a.activity_type WHEN 'installation' THEN '/operations/installation/' || a.activity_id::text
                WHEN 'replacement' THEN '/operations/replacement/' || a.form_number WHEN 'removal' THEN '/operations/removal/' || a.form_number
                WHEN 'troubleshoot' THEN '/support/troubleshoots/' || a.form_number END,
            'editPath', CASE a.activity_type WHEN 'installation' THEN NULL WHEN 'replacement' THEN '/operations/replacement/new?edit=' || a.form_number
                WHEN 'removal' THEN '/operations/removal/new?edit=' || a.form_number WHEN 'troubleshoot' THEN '/support/troubleshoots/new?edit=' || a.form_number END
        )
        """;

    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapGet("/api/activity-log", (HttpContext context, CancellationToken ct) => ReadAsync(context, getConnectionString, null, ct));
        app.MapGet("/api/activity-log/{id:guid}", (HttpContext context, Guid id, CancellationToken ct) => ReadAsync(context, getConnectionString, id, ct));
    }

    private static async Task<IResult> ReadAsync(HttpContext context, Func<string> getConnectionString, Guid? id, CancellationToken ct)
    {
        var token = context.Request.Cookies["mh02_session"];
        if (string.IsNullOrEmpty(token) || token.Length > 128) return Error(401, "UNAUTHENTICATED", "Authentication required.");
        var query = context.Request.Query;
        var page = 1; var size = 100;
        int? requestedSite = null;
        DateOnly? from = null, to = null;
        var type = query["activityType"].ToString();
        var search = query["q"].ToString().Trim();
        if ((query.ContainsKey("page") && (!int.TryParse(query["page"], out page) || page < 1)) ||
            (query.ContainsKey("pageSize") && (!int.TryParse(query["pageSize"], out size) || size is < 1 or > 1000)) ||
            (type.Length > 0 && !Types.Contains(type)) || search.Length > 120)
            return Error(400, "VALIDATION_FAILED", "Invalid pagination, activity type or search.");
        if (query.ContainsKey("siteId"))
        {
            if (!int.TryParse(query["siteId"], out var parsed) || parsed < 1) return Error(400, "VALIDATION_FAILED", "Invalid Site.");
            requestedSite = parsed;
        }
        foreach (var name in new[] { "dateFrom", "dateTo" })
        {
            if (!query.ContainsKey(name)) continue;
            if (!DateOnly.TryParseExact(query[name].ToString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
                return Error(400, "VALIDATION_FAILED", "Dates must use yyyy-MM-dd.");
            if (name == "dateFrom") from = parsed; else to = parsed;
        }
        if (from > to) return Error(400, "VALIDATION_FAILED", "Invalid date range.");
        try
        {
            await using var connection = new NpgsqlConnection(getConnectionString());
            await connection.OpenAsync(ct);
            var user = await SessionStore.FindUserAsync(connection, token, ct);
            if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            if (!SessionStore.TryScope(user, requestedSite, out var site)) return Error(403, "SITE_FORBIDDEN", "You cannot access this Site.");
            const string where = """
                WHERE (@site IS NULL OR a.site_id = @site) AND (@id IS NULL OR a.activity_id = @id)
                  AND (@type = '' OR a.activity_type = @type)
                  AND (@from IS NULL OR ((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes))::date >= @from)
                  AND (@to IS NULL OR ((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes))::date <= @to)
                  AND (@search = '' OR position(lower(@search) in lower(a.form_number)) > 0 OR position(lower(@search) in lower(fu.unit_no)) > 0
                    OR position(lower(@search) in lower(a.technician_name)) > 0 OR position(lower(@search) in lower(a.remarks)) > 0
                    OR EXISTS (SELECT 1 FROM activity_devices x JOIN devices d ON d.device_id = x.device_id
                        WHERE x.activity_id = a.activity_id AND position(lower(@search) in lower(d.device_code)) > 0))
                """;
            void Bind(NpgsqlCommand command)
            {
                Add(command, "site", NpgsqlDbType.Integer, site); Add(command, "id", NpgsqlDbType.Uuid, id);
                Add(command, "from", NpgsqlDbType.Date, from); Add(command, "to", NpgsqlDbType.Date, to);
                command.Parameters.AddWithValue("type", type); command.Parameters.AddWithValue("search", search);
            }
            await using var count = new NpgsqlCommand($"SELECT count(*) {Joins} {where}", connection);
            Bind(count);
            var total = (long)(await count.ExecuteScalarAsync(ct))!;
            await using var command = new NpgsqlCommand($"{Projection} {Joins} {where} ORDER BY a.started_at DESC, a.created_at DESC, a.activity_id LIMIT @size OFFSET @offset", connection);
            Bind(command);
            command.Parameters.AddWithValue("size", id is null ? size : 1); command.Parameters.AddWithValue("offset", id is null ? ((long)page - 1) * size : 0L);
            var items = new List<JsonElement>();
            await using (var reader = await command.ExecuteReaderAsync(ct))
            {
                while (await reader.ReadAsync(ct))
                {
                    using var document = JsonDocument.Parse(reader.GetString(0)); items.Add(document.RootElement.Clone());
                }
            }
            if (id is null) return Results.Ok(new { items, total, page, pageSize = size });
            if (items.Count == 0) return Error(404, "NOT_FOUND", "Activity not found.");
            var result = items[0].EnumerateObject().ToDictionary(property => property.Name, property => (object?)property.Value.Clone());
            var devices = new List<JsonElement>();
            await using (var snapshots = new NpgsqlCommand("""
                SELECT jsonb_build_object('deviceCode', d.device_code, 'serialNumber', d.serial_number, 'role', ad.role,
                    'beforeStatus', bs.label, 'afterStatus', afs.label, 'beforeUnit', bu.unit_no, 'afterUnit', au.unit_no,
                    'beforeLocationSiteId', ad.before_location_site_id, 'afterLocationSiteId', ad.after_location_site_id,
                    'beforeMaintenanceDate', ad.before_last_maintenance_date, 'afterMaintenanceDate', ad.after_last_maintenance_date)
                FROM activity_devices ad JOIN devices d ON d.device_id = ad.device_id
                JOIN device_statuses bs ON bs.status_id = ad.before_status_id JOIN device_statuses afs ON afs.status_id = ad.after_status_id
                LEFT JOIN fleet_units bu ON bu.unit_id = ad.before_unit_id LEFT JOIN fleet_units au ON au.unit_id = ad.after_unit_id
                WHERE ad.activity_id = @id ORDER BY ad.role, d.device_code
                """, connection))
            {
                snapshots.Parameters.AddWithValue("id", id.Value);
                await using var reader = await snapshots.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct)) { using var document = JsonDocument.Parse(reader.GetString(0)); devices.Add(document.RootElement.Clone()); }
            }
            var photos = new List<object>();
            await using (var photoCommand = new NpgsqlCommand("SELECT photo_id, slot_key, caption FROM transaction_photos WHERE activity_id = @id ORDER BY slot_key", connection))
            {
                photoCommand.Parameters.AddWithValue("id", id.Value);
                await using var reader = await photoCommand.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct)) photos.Add(new { photoId = reader.GetGuid(0), slot = reader.GetString(1), caption = reader.IsDBNull(2) ? "" : reader.GetString(2), url = $"/api/dotnet/photos/{reader.GetGuid(0)}" });
            }
            result["devices"] = devices; result["photos"] = photos;
            return Results.Ok(result);
        }
        catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
    }

    private static void Add(NpgsqlCommand command, string name, NpgsqlDbType type, object? value) => command.Parameters.Add(name, type).Value = value ?? DBNull.Value;
    public static IResult Error(int status, string code, string message) => Results.Json(new { error = new { code, message } }, statusCode: status);
}