using System.Globalization;
using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

public static class TimelineEndpoints
{
    private const string DeviceProjection = """
        SELECT jsonb_build_object('internalId', d.device_id, 'deviceId', d.device_code, 'serialNumber', d.serial_number,
            'status', st.code, 'statusLabel', st.label, 'siteId', d.site_id, 'district', s.name,
            'unitNo', fu.unit_no, 'equipmentType', et.name, 'egi', fu.egi,
            'currentLocation', ls.name, 'healthCheckStatus', d.health_check_status, 'lastMaintenanceDate', d.last_maintenance_date,
            'isArchived', d.is_deleted, 'rowVersion', '0x' || lpad(to_hex(d.row_version), 16, '0'))
        """;
    private const string DeviceJoins = """
        FROM devices d JOIN sites s ON s.site_id = d.site_id JOIN device_statuses st ON st.status_id = d.status_id
        LEFT JOIN fleet_units fu ON fu.unit_id = d.current_unit_id
        LEFT JOIN equipment_types et ON et.equipment_type_id = fu.equipment_type_id
        LEFT JOIN sites ls ON ls.site_id = d.current_location_site_id
        """;
    private const string TimelineSql = """
        WITH timeline AS (
            SELECT a.started_at AS sort_time, a.created_at AS created_time,
                'A:' || a.activity_id::text || ':' || ad.device_id::text AS entry_key,
                jsonb_build_object('key', 'A:' || a.activity_id::text || ':' || ad.device_id::text,
                    'entryType', 'activity', 'activityId', a.activity_id, 'type', a.activity_type,
                    'formNumber', a.form_number, 'role', ad.role,
                    'date', to_char((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes), 'YYYY-MM-DD'),
                    'time', to_char((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes), 'HH24:MI'),
                    'timeZone', a.time_zone_id, 'occurredAt', a.started_at, 'district', s.name,
                    'unitNo', COALESCE(au.unit_no, bu.unit_no), 'equipmentType', et.name,
                    'technicianName', COALESCE(a.technician_name, ''), 'durationMinutes', a.duration_minutes,
                    'summary', CASE a.activity_type WHEN 'installation' THEN 'Pemasangan perangkat'
                        WHEN 'replacement' THEN CASE ad.role WHEN 'old' THEN 'Perangkat lama dilepas' ELSE 'Perangkat pengganti terpasang' END
                        WHEN 'removal' THEN COALESCE(rm.reason, 'Pelepasan perangkat') WHEN 'troubleshoot' THEN COALESCE(t.issue, 'Troubleshoot') END,
                    'details', COALESCE(t.action_taken, rm.reason_detail, i.notes, a.remarks, ''),
                    'beforeStatus', COALESCE(bs.label, bs.code), 'afterStatus', COALESCE(afs.label, afs.code),
                    'beforeUnit', bu.unit_no, 'afterUnit', au.unit_no,
                    'beforeMaintenanceDate', ad.before_last_maintenance_date, 'afterMaintenanceDate', ad.after_last_maintenance_date,
                    'rowVersion', '0x' || lpad(to_hex(a.row_version), 16, '0'),
                    'detailPath', '/reports/activity-log/' || a.activity_id::text,
                    'editPath', CASE a.activity_type WHEN 'installation' THEN '/reports/activity-log/' || a.activity_id::text
                        WHEN 'replacement' THEN '/operations/replacement/new?edit=' || a.form_number
                        WHEN 'removal' THEN '/operations/removal/new?edit=' || a.form_number
                        WHEN 'troubleshoot' THEN '/support/troubleshoots/new?edit=' || a.form_number END
                ) AS payload
            FROM activity_devices ad JOIN activities a ON a.activity_id = ad.activity_id
            JOIN sites s ON s.site_id = a.site_id
            JOIN device_statuses bs ON bs.status_id = ad.before_status_id
            JOIN device_statuses afs ON afs.status_id = ad.after_status_id
            LEFT JOIN fleet_units bu ON bu.unit_id = ad.before_unit_id LEFT JOIN fleet_units au ON au.unit_id = ad.after_unit_id
            LEFT JOIN equipment_types et ON et.equipment_type_id = COALESCE(au.equipment_type_id, bu.equipment_type_id)
            LEFT JOIN installation_details i ON i.activity_id = a.activity_id
            LEFT JOIN removal_details rm ON rm.activity_id = a.activity_id
            LEFT JOIN troubleshoot_details t ON t.activity_id = a.activity_id
            WHERE ad.device_id = @device AND a.site_id = @owner_site
            UNION ALL
            SELECT e.occurred_at, e.occurred_at, 'E:' || e.event_id::text,
                jsonb_build_object('key', 'E:' || e.event_id::text, 'entryType', 'event', 'eventId', e.event_id, 'type', e.event_type,
                    'activityId', NULL, 'formNumber', e.source_form_number, 'role', e.source_role,
                    'date', to_char(e.occurred_at AT TIME ZONE @zone, 'YYYY-MM-DD'),
                    'time', to_char(e.occurred_at AT TIME ZONE @zone, 'HH24:MI'), 'timeZone', @zone,
                    'occurredAt', e.occurred_at, 'district', @site_name, 'unitNo', COALESCE(au.unit_no, bu.unit_no),
                    'equipmentType', NULL, 'technicianName', COALESCE(e.actor_name, ''), 'durationMinutes', NULL,
                    'summary', CASE e.event_type WHEN 'registered' THEN 'Registrasi perangkat'
                        WHEN 'details_updated' THEN 'Data perangkat diperbarui' WHEN 'soft_deleted' THEN 'Perangkat diarsipkan'
                        WHEN 'device_override' THEN 'Koreksi status atau unit perangkat'
                        WHEN 'transaction_deleted' THEN 'Transaksi ' || COALESCE(e.source_form_number, '') || ' dihapus' END,
                    'details', COALESCE(e.reason, e.summary, ''),
                    'beforeStatus', COALESCE(bs.label, bs.code), 'afterStatus', COALESCE(afs.label, afs.code),
                    'beforeUnit', bu.unit_no, 'afterUnit', au.unit_no, 'detailPath', NULL, 'editPath', NULL,
                    'sourceActivityId', e.source_activity_id, 'sourceActivityType', e.source_activity_type,
                    'sourceStartedAtLocal', e.source_started_at_local, 'sourceTimeZone', e.source_time_zone_id
                )
            FROM device_events e
            LEFT JOIN device_statuses bs ON bs.status_id = e.before_status_id LEFT JOIN device_statuses afs ON afs.status_id = e.after_status_id
            LEFT JOIN fleet_units bu ON bu.unit_id = e.before_unit_id LEFT JOIN fleet_units au ON au.unit_id = e.after_unit_id
            WHERE e.device_id = @device AND e.site_id = @owner_site
        )
        """;

    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapGet("/api/timeline", (HttpContext context, CancellationToken ct) => ReadAsync(context, getConnectionString, null, ct));
        app.MapGet("/api/timeline/{deviceCode}", (HttpContext context, string deviceCode, CancellationToken ct) => ReadAsync(context, getConnectionString, deviceCode, ct));
    }

    private static async Task<IResult> ReadAsync(HttpContext context, Func<string> getConnectionString, string? deviceCode, CancellationToken ct)
    {
        var token = context.Request.Cookies["mh02_session"];
        if (string.IsNullOrEmpty(token) || token.Length > 128) return ActivityLogEndpoints.Error(401, "UNAUTHENTICATED", "Authentication required.");
        var query = context.Request.Query;
        var page = 1; var size = 100;
        int? requestedSite = null;
        var archived = query["archived"].ToString();
        var search = query["q"].ToString().Trim();
        var status = query["status"].ToString();
        if ((query.ContainsKey("page") && (!int.TryParse(query["page"], out page) || page < 1)) ||
            (query.ContainsKey("pageSize") && (!int.TryParse(query["pageSize"], out size) || size is < 1 or > 1000)) ||
            archived is not ("" or "true" or "false") || status is not ("" or "in_use" or "in_stock_rfu" or "in_stock_damaged" or "in_stock_ho") || search.Length > 120 || deviceCode?.Length > 40)
            return ActivityLogEndpoints.Error(400, "VALIDATION_FAILED", "Invalid timeline filters.");
        if (query.ContainsKey("siteId"))
        {
            if (!int.TryParse(query["siteId"], out var parsed) || parsed < 1) return ActivityLogEndpoints.Error(400, "VALIDATION_FAILED", "Invalid Site.");
            requestedSite = parsed;
        }
        string? from = null, to = null;
        foreach (var name in new[] { "dateFrom", "dateTo" })
        {
            if (!query.ContainsKey(name)) continue;
            if (!DateOnly.TryParseExact(query[name].ToString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
                return ActivityLogEndpoints.Error(400, "VALIDATION_FAILED", "Dates must use yyyy-MM-dd.");
            if (name == "dateFrom") from = query[name].ToString(); else to = query[name].ToString();
        }
        if (from is not null && to is not null && string.CompareOrdinal(from, to) > 0) return ActivityLogEndpoints.Error(400, "VALIDATION_FAILED", "Invalid date range.");
        try
        {
            await using var connection = new NpgsqlConnection(getConnectionString());
            await connection.OpenAsync(ct);
            var user = await SessionStore.FindUserAsync(connection, token, ct);
            if (user is null) return ActivityLogEndpoints.Error(401, "UNAUTHENTICATED", "Authentication required.");
            if (!SessionStore.TryScope(user, requestedSite, out var site)) return ActivityLogEndpoints.Error(403, "SITE_FORBIDDEN", "You cannot access this Site.");
            if (archived == "true" && user.Role != "superadmin") return ActivityLogEndpoints.Error(403, "SUPERADMIN_ONLY", "Only a Superadmin can view archived devices.");
            if (deviceCode is null)
            {
                const string where = """
                    WHERE d.is_deleted = @archived AND (@site IS NULL OR d.site_id = @site) AND (@status = '' OR st.code = @status)
                      AND (@search = '' OR position(lower(@search) in lower(d.device_code)) > 0 OR position(lower(@search) in lower(d.serial_number)) > 0
                        OR position(lower(@search) in lower(fu.unit_no)) > 0)
                    """;
                void Bind(NpgsqlCommand command)
                {
                    Add(command, "site", NpgsqlDbType.Integer, site); command.Parameters.AddWithValue("archived", archived == "true");
                    command.Parameters.AddWithValue("status", status); command.Parameters.AddWithValue("search", search);
                }
                await using var count = new NpgsqlCommand($"SELECT count(*) {DeviceJoins} {where}", connection);
                Bind(count); var total = (long)(await count.ExecuteScalarAsync(ct))!;
                await using var command = new NpgsqlCommand($"{DeviceProjection} {DeviceJoins} {where} ORDER BY d.device_code, d.device_id LIMIT @size OFFSET @offset", connection);
                Bind(command); command.Parameters.AddWithValue("size", size); command.Parameters.AddWithValue("offset", ((long)page - 1) * size);
                var items = new List<JsonElement>();
                await using var reader = await command.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct)) { using var document = JsonDocument.Parse(reader.GetString(0)); items.Add(document.RootElement.Clone()); }
                return Results.Ok(new { items, total, page, pageSize = size });
            }
            JsonElement device;
            string zone;
            await using (var head = new NpgsqlCommand($"{DeviceProjection}, s.time_zone_id {DeviceJoins} WHERE d.device_code = @code AND (@site IS NULL OR d.site_id = @site) AND (@admin OR NOT d.is_deleted)", connection))
            {
                head.Parameters.AddWithValue("code", deviceCode); Add(head, "site", NpgsqlDbType.Integer, site); head.Parameters.AddWithValue("admin", user.Role == "superadmin");
                await using var reader = await head.ExecuteReaderAsync(ct);
                if (!await reader.ReadAsync(ct)) return ActivityLogEndpoints.Error(404, "NOT_FOUND", "Device not found.");
                using var document = JsonDocument.Parse(reader.GetString(0)); device = document.RootElement.Clone(); zone = reader.GetString(1);
            }
            const string entryWhere = """
                WHERE (@from IS NULL OR payload->>'date' >= @from) AND (@to IS NULL OR payload->>'date' <= @to)
                  AND (@search = '' OR position(lower(@search) in lower(payload->>'summary')) > 0
                    OR position(lower(@search) in lower(payload->>'formNumber')) > 0 OR position(lower(@search) in lower(payload->>'details')) > 0)
                """;
            void BindEntries(NpgsqlCommand command)
            {
                command.Parameters.AddWithValue("device", device.GetProperty("internalId").GetGuid());
                command.Parameters.AddWithValue("owner_site", device.GetProperty("siteId").GetInt32());
                command.Parameters.AddWithValue("zone", zone); command.Parameters.AddWithValue("site_name", device.GetProperty("district").GetString()!);
                Add(command, "from", NpgsqlDbType.Varchar, from); Add(command, "to", NpgsqlDbType.Varchar, to); command.Parameters.AddWithValue("search", search);
            }
            await using var entryCount = new NpgsqlCommand($"{TimelineSql} SELECT count(*) FROM timeline {entryWhere}", connection);
            BindEntries(entryCount); var entryTotal = (long)(await entryCount.ExecuteScalarAsync(ct))!;
            await using var entries = new NpgsqlCommand($"{TimelineSql} SELECT payload FROM timeline {entryWhere} ORDER BY sort_time DESC, created_time DESC, entry_key DESC LIMIT @size OFFSET @offset", connection);
            BindEntries(entries); entries.Parameters.AddWithValue("size", size); entries.Parameters.AddWithValue("offset", ((long)page - 1) * size);
            var records = new List<JsonElement>();
            await using (var reader = await entries.ExecuteReaderAsync(ct))
            {
                while (await reader.ReadAsync(ct)) { using var document = JsonDocument.Parse(reader.GetString(0)); records.Add(document.RootElement.Clone()); }
            }
            return Results.Ok(new { device, items = records, total = entryTotal, page, pageSize = size });
        }
        catch (NpgsqlException) { return ActivityLogEndpoints.Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
    }

    private static void Add(NpgsqlCommand command, string name, NpgsqlDbType type, object? value) => command.Parameters.Add(name, type).Value = value ?? DBNull.Value;
}