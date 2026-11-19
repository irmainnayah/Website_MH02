using System.Data;
using System.Globalization;
using Npgsql;
using NpgsqlTypes;

public static class DashboardData
{
    public static void Map(WebApplication app, Func<string> getConnectionString)
    {
        app.MapGet("/api/dashboard", (HttpContext context, CancellationToken ct) => ReadAsync(context, getConnectionString, false, ct));
        app.MapGet("/api/dashboard/devices", (HttpContext context, CancellationToken ct) => ReadAsync(context, getConnectionString, true, ct));
    }

    private static async Task<IResult> ReadAsync(HttpContext context, Func<string> getConnectionString, bool inventory, CancellationToken ct)
    {
        var token = context.Request.Cookies["mh02_session"];
        if (string.IsNullOrEmpty(token) || token.Length > 128) return ActivityLogEndpoints.Error(401, "UNAUTHENTICATED", "Authentication required.");
        var query = context.Request.Query;
        int? requestedSite = null;
        var page = 1; var size = 100;
        if (query.ContainsKey("siteId"))
        {
            if (!int.TryParse(query["siteId"], out var parsed) || parsed < 1) return ActivityLogEndpoints.Error(400, "VALIDATION_FAILED", "Invalid Site.");
            requestedSite = parsed;
        }
        if ((query.ContainsKey("page") && (!int.TryParse(query["page"], out page) || page < 1)) ||
            (query.ContainsKey("pageSize") && (!int.TryParse(query["pageSize"], out size) || size is < 1 or > 1000)))
            return ActivityLogEndpoints.Error(400, "VALIDATION_FAILED", "Invalid pagination.");
        try
        {
            await using var connection = new NpgsqlConnection(getConnectionString());
            await connection.OpenAsync(ct);
            var user = await SessionStore.FindUserAsync(connection, token, ct);
            if (user is null) return ActivityLogEndpoints.Error(401, "UNAUTHENTICATED", "Authentication required.");
            if (!SessionStore.TryScope(user, requestedSite, out var site)) return ActivityLogEndpoints.Error(403, "SITE_FORBIDDEN", "You cannot access this Site.");
            await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
            NpgsqlCommand Command(string sql)
            {
                var command = new NpgsqlCommand(sql, connection, transaction);
                command.Parameters.Add("site", NpgsqlDbType.Integer).Value = (object?)site ?? DBNull.Value;
                return command;
            }
            var periodZone = "UTC";
            if (site is not null)
            {
                await using var siteCommand = Command("SELECT time_zone_id FROM sites WHERE site_id = @site");
                var zone = await siteCommand.ExecuteScalarAsync(ct);
                if (zone is not string siteZone) return ActivityLogEndpoints.Error(404, "SITE_NOT_FOUND", "Site not found.");
                periodZone = siteZone;
            }
            if (inventory)
            {
                await using var count = Command("SELECT count(*) FROM devices d WHERE NOT d.is_deleted AND (@site IS NULL OR d.site_id = @site)");
                var total = (long)(await count.ExecuteScalarAsync(ct))!;
                await using var command = Command("""
                    SELECT d.device_id, d.device_code, d.serial_number, st.code, d.site_id, s.name,
                        fu.unit_no, et.name, fu.egi, ls.name, d.health_check_status, d.last_maintenance_date,
                        d.row_version, d.created_at, latest.activity_date
                    FROM devices d JOIN device_statuses st ON st.status_id = d.status_id JOIN sites s ON s.site_id = d.site_id
                    LEFT JOIN fleet_units fu ON fu.unit_id = d.current_unit_id
                    LEFT JOIN equipment_types et ON et.equipment_type_id = fu.equipment_type_id
                    LEFT JOIN sites ls ON ls.site_id = d.current_location_site_id
                    LEFT JOIN LATERAL (
                        SELECT ((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes))::date AS activity_date
                        FROM activity_devices ad JOIN activities a ON a.activity_id = ad.activity_id
                        WHERE ad.device_id = d.device_id AND a.site_id = d.site_id
                        ORDER BY a.started_at DESC, a.created_at DESC, a.activity_id DESC LIMIT 1
                    ) latest ON true
                    WHERE NOT d.is_deleted AND (@site IS NULL OR d.site_id = @site)
                    ORDER BY d.device_code, d.device_id LIMIT @size OFFSET @offset
                    """);
                command.Parameters.AddWithValue("size", size); command.Parameters.AddWithValue("offset", ((long)page - 1) * size);
                var items = new List<object>();
                await using (var reader = await command.ExecuteReaderAsync(ct))
                {
                    while (await reader.ReadAsync(ct)) items.Add(new {
                        internalId = reader.GetGuid(0), deviceId = reader.GetString(1), serialNumber = reader.GetString(2), status = reader.GetString(3),
                        siteId = reader.GetInt32(4), district = reader.GetString(5), unitNo = Text(reader, 6), equipmentType = Text(reader, 7), egi = Text(reader, 8),
                        currentLocation = Text(reader, 9), healthCheckStatus = reader.GetString(10), lastMaintenanceDate = Date(reader, 11),
                        rowVersion = $"0x{reader.GetInt64(12):x16}", createdAt = reader.IsDBNull(13) ? (DateTime?)null : reader.GetDateTime(13), lastActivityDate = Date(reader, 14)
                    });
                }
                await transaction.CommitAsync(ct);
                return Results.Ok(new { items, total, page, pageSize = size });
            }

            var statuses = new List<object>();
            var counts = new Dictionary<string, long>(StringComparer.Ordinal);
            await using (var command = Command("""
                SELECT st.code, COALESCE(st.label, st.code), count(d.device_id)
                FROM device_statuses st LEFT JOIN devices d ON d.status_id = st.status_id AND NOT d.is_deleted
                    AND (@site IS NULL OR d.site_id = @site)
                GROUP BY st.status_id, st.code, st.label ORDER BY st.status_id
                """))
            await using (var reader = await command.ExecuteReaderAsync(ct))
            {
                while (await reader.ReadAsync(ct))
                {
                    var code = reader.GetString(0); var value = reader.GetInt64(2);
                    counts[code] = value; statuses.Add(new { key = code, label = reader.GetString(1), count = value });
                }
            }
            var locations = new List<object>();
            await using (var command = Command("""
                SELECT d.current_location_site_id, COALESCE(ls.name, 'Belum tercatat'), count(*) AS total,
                    count(*) FILTER (WHERE st.code = 'in_use'), count(*) FILTER (WHERE st.code = 'in_stock_rfu'),
                    count(*) FILTER (WHERE st.code = 'in_stock_damaged'), count(*) FILTER (WHERE st.code = 'in_stock_ho')
                FROM devices d JOIN device_statuses st ON st.status_id = d.status_id
                LEFT JOIN sites ls ON ls.site_id = d.current_location_site_id
                WHERE NOT d.is_deleted AND (@site IS NULL OR d.site_id = @site)
                GROUP BY d.current_location_site_id, ls.name ORDER BY ls.name NULLS LAST, d.current_location_site_id
                """))
            await using (var reader = await command.ExecuteReaderAsync(ct))
            {
                while (await reader.ReadAsync(ct)) locations.Add(new { locationSiteId = reader.IsDBNull(0) ? (int?)null : reader.GetInt32(0), location = reader.GetString(1), total = reader.GetInt64(2), inUse = reader.GetInt64(3), inStockRfu = reader.GetInt64(4), inStockDamaged = reader.GetInt64(5), hoRepair = reader.GetInt64(6) });
            }
            var equipment = new List<object>();
            await using (var command = Command("""
                SELECT et.name, count(d.device_id)
                FROM equipment_types et
                LEFT JOIN fleet_units fu ON fu.equipment_type_id = et.equipment_type_id
                LEFT JOIN devices d ON d.current_unit_id = fu.unit_id AND NOT d.is_deleted
                    AND (@site IS NULL OR d.site_id = @site) AND d.status_id = 1
                GROUP BY et.equipment_type_id, et.name ORDER BY et.equipment_type_id
                """))
            await using (var reader = await command.ExecuteReaderAsync(ct))
            {
                while (await reader.ReadAsync(ct)) equipment.Add(new { type = reader.GetString(0), count = reader.GetInt64(1) });
            }
            string currentMonth;
            await using (var command = Command("""
                SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE @zone, 'YYYY-MM')
                """))
            {
                command.Parameters.AddWithValue("zone", periodZone);
                currentMonth = (string)(await command.ExecuteScalarAsync(ct))!;
            }
            var monthNames = new[] { "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des" };
            var endMonth = DateOnly.ParseExact(currentMonth + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture);
            var trend = new List<object>();
            long installations = 0, replacements = 0, removals = 0, troubleshoots = 0;
            await using (var command = Command("""
                WITH months AS (
                    SELECT to_char(month, 'YYYY-MM') AS month FROM generate_series(@first::date, @last::date, interval '1 month') month
                ), activity_counts AS (
                    SELECT to_char((a.started_at AT TIME ZONE 'UTC') + make_interval(mins => a.start_utc_offset_minutes), 'YYYY-MM') AS month,
                        a.activity_type, count(*) AS total FROM activities a
                    WHERE (@site IS NULL OR a.site_id = @site)
                      AND a.started_at >= ((@first::date::timestamp AT TIME ZONE 'UTC') - interval '1 day')
                      AND a.started_at < (((@last::date + interval '1 month')::timestamp AT TIME ZONE 'UTC') + interval '1 day')
                    GROUP BY 1, a.activity_type
                )
                SELECT m.month, COALESCE(sum(c.total) FILTER (WHERE c.activity_type = 'installation'), 0)::bigint,
                    COALESCE(sum(c.total) FILTER (WHERE c.activity_type = 'replacement'), 0)::bigint,
                    COALESCE(sum(c.total) FILTER (WHERE c.activity_type = 'removal'), 0)::bigint,
                    COALESCE(sum(c.total) FILTER (WHERE c.activity_type = 'troubleshoot'), 0)::bigint
                FROM months m LEFT JOIN activity_counts c ON c.month = m.month GROUP BY m.month ORDER BY m.month
                """))
            {
                command.Parameters.AddWithValue("first", endMonth.AddMonths(-5)); command.Parameters.AddWithValue("last", endMonth);
                await using var reader = await command.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct))
                {
                    var month = reader.GetString(0);
                    var parsed = DateOnly.ParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture);
                    var installation = reader.GetInt64(1); var replacement = reader.GetInt64(2); var removal = reader.GetInt64(3); var troubleshoot = reader.GetInt64(4);
                    trend.Add(new { yearMonth = month, month = $"{monthNames[parsed.Month - 1]} {parsed.Year}", installation, replacement, removal, troubleshoot });
                    if (month == currentMonth) { installations = installation; replacements = replacement; removals = removal; troubleshoots = troubleshoot; }
                }
            }
            var generatedAt = DateTime.UtcNow;
            await transaction.CommitAsync(ct);
            return Results.Ok(new {
                siteId = site, generatedAt, currentMonth,
                periodTimeZone = periodZone, activityGrouping = "stored_start_local_month",
                kpis = new { registeredDevices = counts.Values.Sum(), totalInstalled = counts.GetValueOrDefault("in_use"),
                    hoRepair = counts.GetValueOrDefault("in_stock_ho"), inStock = counts.GetValueOrDefault("in_stock_rfu") + counts.GetValueOrDefault("in_stock_damaged") + counts.GetValueOrDefault("in_stock_ho"),
                    officialAssetTotal = (long?)null },
                statusDistribution = statuses, locationDistribution = locations, equipmentDistribution = equipment, monthlyActivities = trend,
                currentMonthActivities = new { installation = installations, replacement = replacements, removal = removals, troubleshoot = troubleshoots }
            });
        }
        catch (NpgsqlException) { return ActivityLogEndpoints.Error(503, "DATABASE_UNAVAILABLE", "Database unavailable."); }
    }

    private static string? Text(NpgsqlDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
    private static string? Date(NpgsqlDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : reader.GetFieldValue<DateOnly>(ordinal).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}