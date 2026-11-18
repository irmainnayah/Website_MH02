using System.Globalization;
using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

public static class ReplacementEndpoints
{
    private const string BaseSql = """
        FROM activities a
        JOIN sites s ON s.site_id = a.site_id
        JOIN activity_devices old_ad ON old_ad.activity_id = a.activity_id AND old_ad.role = 'old'
        JOIN devices old_d ON old_d.device_id = old_ad.device_id
        JOIN device_statuses old_after ON old_after.status_id = old_ad.after_status_id
        LEFT JOIN fleet_units old_u ON old_u.unit_id = old_ad.before_unit_id
        LEFT JOIN equipment_types old_et ON old_et.equipment_type_id = old_u.equipment_type_id
        JOIN activity_devices new_ad ON new_ad.activity_id = a.activity_id AND new_ad.role = 'new'
        JOIN devices new_d ON new_d.device_id = new_ad.device_id
        LEFT JOIN fleet_units new_u ON new_u.unit_id = new_ad.after_unit_id
        LEFT JOIN equipment_types new_et ON new_et.equipment_type_id = new_u.equipment_type_id
        JOIN replacement_details r ON r.activity_id = a.activity_id
        """;

    private const string Projection = """
        SELECT jsonb_build_object(
            'activityId', a.activity_id,
            'id', a.form_number,
            'activityType', 'Replacement',
            'date', to_char((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes), 'YYYY-MM-DD'),
            'startTime', to_char((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes), 'YYYY-MM-DD"T"HH24:MI'),
            'endTime', to_char((a.finished_at AT TIME ZONE 'UTC') + make_interval(mins => a.finish_utc_offset_minutes), 'YYYY-MM-DD"T"HH24:MI'),
            'durationMinutes', a.duration_minutes,
            'durationFormatted', CASE WHEN a.duration_minutes / 60 > 0
                THEN (a.duration_minutes / 60)::text || ' Jam ' || (a.duration_minutes % 60)::text || ' Menit'
                ELSE a.duration_minutes::text || ' Menit' END,
            'shift', a.shift,
            'district', s.name,
            'siteId', a.site_id,
            'timeZone', a.time_zone_id,
            'oldDeviceId', old_d.device_code,
            'oldDeviceSerialNumber', old_d.serial_number,
            'oldUnitNo', old_u.unit_no,
            'oldEquipmentType', old_et.name,
            'oldEgi', old_u.egi,
            'oldDeviceFinalCondition', old_after.code,
            'oldDeviceFinalConditionLabel', old_after.label,
            'newDeviceId', new_d.device_code,
            'newDeviceSerialNumber', new_d.serial_number,
            'unitNo', new_u.unit_no,
            'equipmentType', new_et.name,
            'egi', new_u.egi,
            'sourcePower', r.source_power,
            'spmVersion', r.spm_version,
            'ipAddress', r.ip_address,
            'ipCpe', r.ip_cpe,
            'ipVhms', r.ip_vhms,
            'technicianName', COALESCE(a.technician_name, ''),
            'technicianNrp', COALESCE(a.technician_nrp, ''),
            'groupLeaderName', COALESCE(a.group_leader, ''),
            'status', 'completed',
            'remarks', COALESCE(a.remarks, ''),
            'createdAt', to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'rowVersion', '0x' || lpad(to_hex(a.row_version), 16, '0')
        )
        """;

    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapGet("/api/replacements", async (HttpContext context, CancellationToken cancellationToken) =>
        {
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            var page = 1;
            var pageSize = 100;
            var pageText = context.Request.Query["page"].ToString();
            var sizeText = context.Request.Query["pageSize"].ToString();
            int? requestedSite = null;
            var siteText = context.Request.Query["siteId"].ToString();
            if ((!string.IsNullOrEmpty(pageText) && (!int.TryParse(pageText, out page) || page < 1)) ||
                (!string.IsNullOrEmpty(sizeText) && (!int.TryParse(sizeText, out pageSize) || pageSize is < 1 or > 1000)))
                return Error(400, "VALIDATION_FAILED", "The request is not valid.");
            if (!string.IsNullOrEmpty(siteText))
            {
                if (!int.TryParse(siteText, out var parsed) || parsed < 1) return Error(400, "VALIDATION_FAILED", "The request is not valid.");
                requestedSite = parsed;
            }
            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                var user = await SessionStore.FindUserAsync(connection, token, cancellationToken);
                if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (!SessionStore.TryScope(user, requestedSite, out var site)) return Error(403, "SITE_FORBIDDEN", "You cannot access this Site.");
                const string where = "WHERE a.activity_type = 'replacement' AND (@site IS NULL OR a.site_id = @site)";
                await using var count = new NpgsqlCommand($"SELECT count(*) {BaseSql} {where}", connection);
                count.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                var total = (long)(await count.ExecuteScalarAsync(cancellationToken))!;
                await using var command = new NpgsqlCommand($"{Projection} {BaseSql} {where} ORDER BY a.started_at DESC, a.created_at DESC LIMIT @size OFFSET @offset", connection);
                command.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                command.Parameters.AddWithValue("size", pageSize);
                command.Parameters.AddWithValue("offset", ((long)page - 1) * pageSize);
                var items = new List<JsonElement>();
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken))
                {
                    using var document = JsonDocument.Parse(reader.GetString(0));
                    items.Add(document.RootElement.Clone());
                }
                return Results.Ok(new { items, total, page, pageSize });
            }
            catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
        });

        app.MapGet("/api/replacements/{formNumber}", async (HttpContext context, string formNumber, CancellationToken cancellationToken) =>
        {
            var token = context.Request.Cookies["mh02_session"];
            if (string.IsNullOrEmpty(token) || token.Length > 128) return Error(401, "UNAUTHENTICATED", "Authentication required.");
            if (formNumber.Length > 30 || !formNumber.StartsWith("REP-", StringComparison.Ordinal)) return Error(404, "NOT_FOUND", "Replacement not found.");
            try
            {
                await using var connection = new NpgsqlConnection(getConnectionString());
                await connection.OpenAsync(cancellationToken);
                var user = await SessionStore.FindUserAsync(connection, token, cancellationToken);
                if (user is null) return Error(401, "UNAUTHENTICATED", "Authentication required.");
                if (!SessionStore.TryScope(user, null, out var site)) return Error(403, "NO_SITE_ASSIGNED", "Your account has no valid role or Site assigned.");
                await using var command = new NpgsqlCommand($"{Projection} {BaseSql} WHERE a.activity_type = 'replacement' AND a.form_number = @form AND (@site IS NULL OR a.site_id = @site)", connection);
                command.Parameters.AddWithValue("form", formNumber);
                command.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                JsonElement record;
                await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
                {
                    if (!await reader.ReadAsync(cancellationToken)) return Error(404, "NOT_FOUND", "Replacement not found.");
                    using var document = JsonDocument.Parse(reader.GetString(0));
                    record = document.RootElement.Clone();
                }
                var photos = new List<object>();
                await using (var photoCommand = new NpgsqlCommand("SELECT photo_id, slot_key, caption FROM transaction_photos WHERE activity_id = (SELECT activity_id FROM activities WHERE form_number = @form AND activity_type = 'replacement') ORDER BY slot_key", connection))
                {
                    photoCommand.Parameters.AddWithValue("form", formNumber);
                    await using var reader = await photoCommand.ExecuteReaderAsync(cancellationToken);
                    while (await reader.ReadAsync(cancellationToken))
                    {
                        var photoId = reader.GetGuid(0);
                        var slot = reader.GetString(1);
                        photos.Add(new { slot, slotLabel = PhotoLabel(slot), url = $"/api/photos/{photoId}", caption = reader.IsDBNull(2) ? "" : reader.GetString(2) });
                    }
                }
                var result = new Dictionary<string, object?>();
                foreach (var property in record.EnumerateObject()) result[property.Name] = property.Value.Clone();
                result["photos"] = photos;
                return Results.Ok(result);
            }
            catch (NpgsqlException) { return Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
        });
    }

    public static string PhotoLabel(string slot) => slot switch
    {
        "mh02_new_installed" => "1. Foto SMARTD DISPLAY Baru Setelah Terpasang",
        "mh02_old_removed" => "2. Foto SMARTD DISPLAY Lama yang Dilepas/Diganti",
        "camera_dashboard_angle" => "3. Foto Posisi Kamera Dashboard & Angle View",
        "nodered_config" => "4. Foto Konfigurasi Node-RED",
        "gps_antenna" => "5. Foto Antena GPS",
        _ => slot
    };

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}