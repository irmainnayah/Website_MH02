using System.Globalization;
using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

public static class InstallationEndpoints
{
    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapGet("/api/installations", async (HttpContext context, CancellationToken cancellationToken) =>
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
            var fromText = query["dateFrom"].ToString();
            var toText = query["dateTo"].ToString();
            var device = query["deviceCode"].ToString().Trim();
            var unit = query["unitNo"].ToString().Trim();
            int? requestedSite = null;
            DateOnly? from = null, to = null;
            if ((!string.IsNullOrEmpty(pageText) && (!int.TryParse(pageText, out page) || page < 1)) ||
                (!string.IsNullOrEmpty(sizeText) && (!int.TryParse(sizeText, out pageSize) || pageSize is < 1 or > 100)) ||
                device.Length > 40 || unit.Length > 30)
                return Error(400, "VALIDATION_FAILED", "The request is not valid.");
            if (!string.IsNullOrEmpty(siteText))
            {
                if (!int.TryParse(siteText, out var parsed) || parsed < 1) return Error(400, "VALIDATION_FAILED", "The request is not valid.");
                requestedSite = parsed;
            }
            if (!string.IsNullOrEmpty(fromText))
            {
                if (!DateOnly.TryParseExact(fromText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
                    return Error(400, "VALIDATION_FAILED", "The request is not valid.");
                from = parsed;
            }
            if (!string.IsNullOrEmpty(toText))
            {
                if (!DateOnly.TryParseExact(toText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
                    return Error(400, "VALIDATION_FAILED", "The request is not valid.");
                to = parsed;
            }
            if (from is not null && to is not null && from > to) return Error(400, "VALIDATION_FAILED", "The request is not valid.");

            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                var user = await SessionStore.FindUserAsync(connection, token, cancellationToken);
                if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (!SessionStore.TryScope(user, requestedSite, out var site)) return Error(403, "SITE_FORBIDDEN", "You cannot access this Site.");

                const string joins = """
                    FROM activities a JOIN sites s ON s.site_id = a.site_id
                    LEFT JOIN fleet_units fu ON fu.unit_id = a.unit_id
                    LEFT JOIN installation_details i ON i.activity_id = a.activity_id
                    LEFT JOIN equipment_types et ON et.equipment_type_id = i.equipment_type_id
                    """;
                const string where = """
                    WHERE a.activity_type = 'installation' AND (@site IS NULL OR a.site_id = @site)
                      AND (@from IS NULL OR ((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes))::date >= @from)
                      AND (@to IS NULL OR ((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes))::date <= @to)
                      AND (@unit = '' OR fu.unit_no = @unit)
                      AND (@device = '' OR EXISTS (SELECT 1 FROM activity_devices x JOIN devices d ON d.device_id = x.device_id
                                                  WHERE x.activity_id = a.activity_id AND d.device_code = @device))
                    """;
                void Bind(NpgsqlCommand command)
                {
                    command.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                    command.Parameters.Add("from", NpgsqlDbType.Date).Value = (object?)from ?? DBNull.Value;
                    command.Parameters.Add("to", NpgsqlDbType.Date).Value = (object?)to ?? DBNull.Value;
                    command.Parameters.AddWithValue("device", device);
                    command.Parameters.AddWithValue("unit", unit);
                }

                await using var count = new NpgsqlCommand($"SELECT count(*) {joins} {where}", connection);
                Bind(count);
                var total = (long)(await count.ExecuteScalarAsync(cancellationToken))!;
                await using var command = new NpgsqlCommand($"""
                    SELECT a.activity_id, a.form_number, a.site_id, s.name, fu.unit_no, a.started_at,
                           a.start_utc_offset_minutes, a.finished_at, a.finish_utc_offset_minutes,
                           a.time_zone_id, a.duration_minutes, a.technician_name,
                           ARRAY(SELECT d.device_code FROM activity_devices x JOIN devices d ON d.device_id = x.device_id
                               WHERE x.activity_id = a.activity_id ORDER BY d.device_code),
                           COALESCE(to_jsonb(i) - 'activity_id', jsonb_build_object()), et.name,
                           (SELECT d.serial_number FROM activity_devices x JOIN devices d ON d.device_id = x.device_id
                            WHERE x.activity_id = a.activity_id ORDER BY x.role, d.device_code LIMIT 1),
                           a.technician_nrp, a.group_leader, a.shift, a.remarks, a.created_at
                    {joins} {where}
                    ORDER BY a.started_at DESC, a.created_at DESC LIMIT @size OFFSET @offset
                    """, connection);
                Bind(command);
                command.Parameters.AddWithValue("size", pageSize);
                command.Parameters.AddWithValue("offset", ((long)page - 1) * pageSize);
                var items = new List<object>();
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken))
                {
                    var zone = reader.GetString(9);
                    using var details = JsonDocument.Parse(reader.GetString(13));
                    items.Add(new
                    {
                        activityId = reader.GetGuid(0), activityType = "installation", formNumber = reader.GetString(1),
                        siteId = reader.GetInt32(2), siteName = reader.GetString(3), unitNo = reader.IsDBNull(4) ? null : reader.GetString(4),
                        startedAt = WithOffset(reader.GetDateTime(5), reader.GetInt16(6)),
                        finishedAt = WithOffset(reader.GetDateTime(7), reader.GetInt16(8)),
                        timeZone = zone, timeZoneLabel = ZoneLabel(zone), durationMinutes = reader.GetInt32(10),
                        technicianName = reader.IsDBNull(11) ? null : reader.GetString(11), deviceCodes = reader.GetFieldValue<string[]>(12),
                        details = details.RootElement.Clone(), equipmentType = reader.IsDBNull(14) ? null : reader.GetString(14),
                        serialNumber = reader.IsDBNull(15) ? null : reader.GetString(15), technicianNrp = reader.IsDBNull(16) ? null : reader.GetString(16),
                        groupLeader = reader.IsDBNull(17) ? null : reader.GetString(17), shift = reader.IsDBNull(18) ? null : reader.GetString(18),
                        remarks = reader.IsDBNull(19) ? null : reader.GetString(19), createdAt = reader.GetDateTime(20)
                    });
                }
                return Results.Ok(new { items, total, page, pageSize });
            }
            catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
        });

        app.MapGet("/api/installations/{id:guid}", async (HttpContext context, Guid id, CancellationToken cancellationToken) =>
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

                await using var command = new NpgsqlCommand("""
                    SELECT a.form_number, a.site_id, s.name, fu.unit_no, a.started_at, a.start_utc_offset_minutes,
                           a.finished_at, a.finish_utc_offset_minutes, a.time_zone_id, a.duration_minutes, a.shift,
                           a.technician_user_id, a.technician_name, a.technician_nrp, a.group_leader, a.remarks,
                           a.row_version, a.created_at, to_jsonb(i) - 'activity_id', et.name
                    FROM activities a JOIN sites s ON s.site_id = a.site_id
                    LEFT JOIN fleet_units fu ON fu.unit_id = a.unit_id
                    LEFT JOIN installation_details i ON i.activity_id = a.activity_id
                    LEFT JOIN equipment_types et ON et.equipment_type_id = i.equipment_type_id
                    WHERE a.activity_id = @id AND a.activity_type = 'installation' AND (@site IS NULL OR a.site_id = @site)
                    """, connection);
                command.Parameters.AddWithValue("id", id);
                command.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                string formNumber, siteName, startedAt, finishedAt, zone, rowVersion;
                string? unitNo, shift, technicianName, technicianNrp, groupLeader, remarks, equipmentType;
                Guid? technicianId;
                int siteId, duration;
                DateTime createdAt;
                JsonElement details;
                await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
                {
                    if (!await reader.ReadAsync(cancellationToken)) return Error(404, "NOT_FOUND", "Installation not found.");
                    formNumber = reader.GetString(0); siteId = reader.GetInt32(1); siteName = reader.GetString(2);
                    unitNo = reader.IsDBNull(3) ? null : reader.GetString(3);
                    startedAt = WithOffset(reader.GetDateTime(4), reader.GetInt16(5));
                    finishedAt = WithOffset(reader.GetDateTime(6), reader.GetInt16(7));
                    zone = reader.GetString(8); duration = reader.GetInt32(9);
                    shift = reader.IsDBNull(10) ? null : reader.GetString(10);
                    technicianId = reader.IsDBNull(11) ? null : reader.GetGuid(11);
                    technicianName = reader.IsDBNull(12) ? null : reader.GetString(12);
                    technicianNrp = reader.IsDBNull(13) ? null : reader.GetString(13);
                    groupLeader = reader.IsDBNull(14) ? null : reader.GetString(14);
                    remarks = reader.IsDBNull(15) ? null : reader.GetString(15);
                    rowVersion = $"0x{reader.GetInt64(16):x16}";
                    createdAt = reader.GetDateTime(17);
                    using var document = JsonDocument.Parse(reader.IsDBNull(18) ? "{}" : reader.GetString(18));
                    details = document.RootElement.Clone();
                    equipmentType = reader.IsDBNull(19) ? null : reader.GetString(19);
                }

                var devices = new List<object>();
                await using (var snapshots = new NpgsqlCommand("""
                    SELECT d.device_id, d.device_code, ad.role, bs.code, afs.code, bu.unit_no, au.unit_no,
                           ad.before_location_site_id, ad.after_location_site_id,
                           ad.before_last_maintenance_date, ad.after_last_maintenance_date, d.serial_number
                    FROM activity_devices ad JOIN devices d ON d.device_id = ad.device_id
                    JOIN device_statuses bs ON bs.status_id = ad.before_status_id
                    JOIN device_statuses afs ON afs.status_id = ad.after_status_id
                    LEFT JOIN fleet_units bu ON bu.unit_id = ad.before_unit_id
                    LEFT JOIN fleet_units au ON au.unit_id = ad.after_unit_id
                    WHERE ad.activity_id = @id ORDER BY ad.role, d.device_code
                    """, connection))
                {
                    snapshots.Parameters.AddWithValue("id", id);
                    await using var reader = await snapshots.ExecuteReaderAsync(cancellationToken);
                    while (await reader.ReadAsync(cancellationToken))
                        devices.Add(new
                        {
                            deviceId = reader.GetGuid(0), deviceCode = reader.GetString(1), role = reader.GetString(2), serialNumber = reader.GetString(11),
                            before = new { status = reader.GetString(3), unitNo = reader.IsDBNull(5) ? null : reader.GetString(5), locationSiteId = reader.IsDBNull(7) ? (int?)null : reader.GetInt32(7), lastMaintenanceDate = ReadDate(reader, 9) },
                            after = new { status = reader.GetString(4), unitNo = reader.IsDBNull(6) ? null : reader.GetString(6), locationSiteId = reader.IsDBNull(8) ? (int?)null : reader.GetInt32(8), lastMaintenanceDate = ReadDate(reader, 10) }
                        });
                }

                var photos = new List<object>();
                await using (var photoCommand = new NpgsqlCommand("""
                    SELECT photo_id, slot_key, caption, mime_type, size_bytes FROM transaction_photos
                    WHERE activity_id = @id ORDER BY slot_key
                    """, connection))
                {
                    photoCommand.Parameters.AddWithValue("id", id);
                    await using var reader = await photoCommand.ExecuteReaderAsync(cancellationToken);
                    while (await reader.ReadAsync(cancellationToken))
                    {
                        var photoId = reader.GetGuid(0);
                        photos.Add(new { photoId, slotKey = reader.GetString(1), caption = reader.IsDBNull(2) ? null : reader.GetString(2), mimeType = reader.GetString(3), sizeBytes = reader.GetInt64(4), url = $"/api/photos/{photoId}" });
                    }
                }
                return Results.Ok(new
                {
                    activityId = id, activityType = "installation", formNumber, siteId, siteName, unitNo, startedAt, finishedAt,
                    timeZone = zone, timeZoneLabel = ZoneLabel(zone), durationMinutes = duration, shift,
                    technician = new { userId = technicianId, name = technicianName, nrp = technicianNrp },
                    groupLeader, remarks, equipmentType, devices, details, photos, rowVersion, createdAt
                });
            }
            catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
        });
    }

    private static string WithOffset(DateTime utc, short offsetMinutes) =>
        new DateTimeOffset(DateTime.SpecifyKind(utc, DateTimeKind.Utc)).ToOffset(TimeSpan.FromMinutes(offsetMinutes))
            .ToString("yyyy-MM-dd'T'HH:mm:sszzz", CultureInfo.InvariantCulture);

    private static string ZoneLabel(string zone) => zone switch
    {
        "Asia/Jakarta" or "Asia/Pontianak" => "WIB", "Asia/Makassar" => "WITA", "Asia/Jayapura" => "WIT", _ => zone
    };

    private static string? ReadDate(NpgsqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetFieldValue<DateOnly>(ordinal).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}